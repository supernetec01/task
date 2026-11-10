import { z } from 'zod';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type API } from './app.js';
import { type DB, type Actor, need, one, rows, isAdmin, version, hash, dataDir } from './base.js';
import { resourceAccess } from './handoff-access.js';
import { readSource, parseSource, adapters, canonicalJSON } from './source-parser.js';

export async function sourceBatch(c: DB, a: Actor, id: string, write = false) {
  const b = await one(
    c,
    'SELECT * FROM metric_batches WHERE id=$1' + (write ? ' FOR UPDATE' : ''),
    [id],
  );
  need(b, 'Không tìm thấy nguồn', 404, 'NOT_FOUND');
  if (b.adapter_code) await resourceAccess(c, a, b.resource_id, write);
  return b;
}
async function fingerprint(c: DB, a: Actor, b: any) {
  return hash(
    JSON.stringify([
      a.id,
      a.permission_version,
      a.grants.map((g) => g.id).sort(),
      await rows(
        c,
        `SELECT id,permission FROM resource_grants WHERE user_id=$1 AND resource_id=$2 AND revoked_at IS NULL AND valid_from<=now() AND (valid_to IS NULL OR valid_to>now()) ORDER BY id`,
        [a.id, b.resource_id],
      ),
    ]),
  );
}
function stable(v: any): any {
  return Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, stable(v[k])]),
        )
      : v;
}
function sign(v: any) {
  need(process.env.VAULT_KEY, 'Chưa cấu hình khóa', 503, 'CONFIG_REQUIRED');
  return createHmac('sha256', process.env.VAULT_KEY!)
    .update(JSON.stringify(stable(v)))
    .digest('hex');
}
export async function uploadSource(c: DB, a: Actor, b: any) {
  const v = z
    .object({
      adapter_code: z.enum([
        'TIKTOK_SALES',
        'SHOPEE_SALES',
        'KOC_SALES',
        'TIKTOK_RETURNS',
        'VIDEO_PERFORMANCE',
      ]),
      company_id: z.uuid(),
      resource_id: z.uuid(),
      period_start: z.iso.date(),
      period_end: z.iso.date(),
      basis: z.enum([
        'DAILY',
        'DATE_ROWS',
        'EXPORT_PERIOD',
        'SNAPSHOT',
        'DATE_CREATED',
        'DATE_CANCELLED',
      ]),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default('VND'),
    })
    .strict()
    .parse(b.fields);
  const r = await resourceAccess(c, a, v.resource_id, true);
  need(r.company_id === v.company_id, 'Nguồn không thuộc pháp nhân', 422, 'SOURCE_CONTEXT');
  need(v.period_end >= v.period_start, 'Kỳ không hợp lệ', 422, 'PERIOD_MISMATCH');
  need(
    (v.adapter_code === 'VIDEO_PERFORMANCE') === (r.kind === 'CHANNEL'),
    'Loại nguồn không phù hợp shop/kênh',
    422,
    'WRONG_REPORT_TYPE',
  );
  need(
    v.adapter_code === 'VIDEO_PERFORMANCE' ||
      v.adapter_code === 'KOC_SALES' ||
      v.adapter_code === 'TIKTOK_RETURNS' ||
      r.platform === v.adapter_code.split('_')[0],
    'Nền tảng không đúng adapter',
    422,
    'WRONG_REPORT_TYPE',
  );
  need(
    !['KOC_SALES', 'TIKTOK_RETURNS', 'VIDEO_PERFORMANCE'].includes(v.adapter_code) ||
      r.platform === 'TIKTOK',
    'Adapter này chỉ hỗ trợ TikTok',
    422,
    'WRONG_REPORT_TYPE',
  );
  const allowedBasis =
    v.adapter_code === 'KOC_SALES'
      ? ['EXPORT_PERIOD']
      : v.adapter_code === 'TIKTOK_RETURNS'
        ? ['DATE_CREATED', 'DATE_CANCELLED']
        : v.adapter_code === 'VIDEO_PERFORMANCE'
          ? ['SNAPSHOT']
          : ['DAILY', 'DATE_ROWS'];
  need(allowedBasis.includes(v.basis), 'Basis không đúng loại nguồn', 422, 'PERIOD_MISMATCH');
  await readSource(b.buffer, b.filename);
  const checksum = hash(b.buffer);
  const old = await one(
    c,
    'SELECT id FROM metric_batches WHERE company_id=$1 AND resource_id=$2 AND adapter_code=$3 AND checksum=$4',
    [v.company_id, v.resource_id, v.adapter_code, checksum],
  );
  need(!old, `File đã được tải; batch ${old?.id}`, 409, 'ALREADY_IMPORTED');
  const key = 'source-v2-' + randomUUID();
  await writeFile(join(dataDir, key), b.buffer, { mode: 0o600, flag: 'wx' });
  return one(
    c,
    `INSERT INTO metric_batches(owner_id,role,platform,shop,currency,kind,checksum,filename,raw,storage_key,company_id,resource_id,adapter_code,adapter_version,period_start,period_end,period_basis) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'[]',$9,$10,$11,$12,1,$13,$14,$15) RETURNING id,version,adapter_code,status`,
    [
      a.id,
      r.kind === 'CHANNEL' ? 'CONTENT' : 'MARKETPLACE',
      r.platform,
      r.id,
      v.currency,
      v.adapter_code,
      checksum,
      String(b.filename)
        .replace(/[\x00-\x1f/\\]/g, '_')
        .slice(0, 200),
      key,
      v.company_id,
      r.id,
      v.adapter_code,
      v.period_start,
      v.period_end,
      v.basis,
    ],
  );
}
export async function previewSource(c: DB, a: Actor, batch: any, input: any) {
  const v = z
    .object({
      expected_version: z.number().int(),
      sheet: z.string().optional(),
      header_row: z.number().int().min(1).max(5).optional(),
      adapter_version: z.literal(1).default(1),
      source_context: z
        .object({
          number_locale: z.enum(['vi-VN', 'en-US']),
          data_start_row: z.number().int().optional(),
        })
        .strict(),
      confirmations: z
        .object({
          platform_source_confirmed: z.boolean(),
          period_basis: z.string().max(1000),
          source_basis: z.string().trim().min(1).max(1000).optional(),
        })
        .strict(),
    })
    .strict()
    .parse(input);
  version(batch, v.expected_version);
  need(batch.status !== 'COMMITTED', 'Nguồn đã commit', 409, 'STATE');
  need(
    v.confirmations.platform_source_confirmed && v.confirmations.period_basis.trim(),
    'Xác nhận nguồn và kỳ thực tế, không dùng tên file',
    422,
    'SOURCE_CONFIRMATION_REQUIRED',
  );
  const bytes = await readFile(join(dataDir, batch.storage_key));
  need(hash(bytes) === batch.checksum, 'Checksum nguồn sai', 409, 'FILE_INTEGRITY');
  const parsed = parseSource(await readSource(bytes, batch.filename), batch.adapter_code, v, {
    start: batch.period_start,
    end: batch.period_end,
    basis: batch.period_basis,
    currency: batch.currency,
  });
  const permission = await fingerprint(c, a, batch);
  const metadata = {
    source_context: v.source_context,
    confirmations: v.confirmations,
    sheet: parsed.sheet,
    header_row: parsed.header_row,
  };
  const confirmation = await one(
    c,
    'INSERT INTO import_confirmations(batch_id,batch_version,confirmed_metadata,metadata_hash,actor_id) VALUES($1,$2,$3,$4,$5) RETURNING id',
    [batch.id, batch.version + 1, JSON.stringify(metadata), hash(JSON.stringify(metadata)), a.id],
  );
  const binding = {
    batch_id: batch.id,
    version: batch.version + 1,
    checksum: batch.checksum,
    canonical_hash: parsed.canonical_hash,
    metadata,
    permission,
    confirmation_id: confirmation.id,
  };
  const token = sign(binding);
  const preview = { ...parsed, binding, preview_token: token };
  for (const e of parsed.errors)
    await c.query(
      'INSERT INTO import_errors(batch_id,preview_version,sheet,row_number,column_name,code,severity,message_vi) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [batch.id, batch.version + 1, e.sheet, e.row, e.column, e.code, e.severity, e.message_vi],
    );
  await c.query(
    'UPDATE metric_batches SET preview=$2,preview_hash=$3,canonical_hash=$4,source_context=$5,status=$6,version=version+1 WHERE id=$1',
    [
      batch.id,
      JSON.stringify(preview),
      hash(JSON.stringify(preview)),
      parsed.canonical_hash || null,
      JSON.stringify(metadata),
      parsed.errors.length ? 'INVALID' : 'PREVIEWED',
    ],
  );
  return {
    id: batch.id,
    version: batch.version + 1,
    preview_token: token,
    preview_rows: parsed.facts.slice(0, 5),
    errors: parsed.errors,
    valid_rows: parsed.facts.length,
    sheet: parsed.sheet,
    sheets: parsed.sheets,
    availability: batch.adapter_code === 'VIDEO_PERFORMANCE' ? 'MISSING_SOURCE' : 'AVAILABLE',
    warnings:
      batch.adapter_code === 'VIDEO_PERFORMANCE'
        ? ['G01: Không có GMV D7; ngày/giờ nguồn chưa xác nhận']
        : [],
  };
}
async function insertObject(c: DB, table: string, obj: Record<string, unknown>) {
  const fields = Object.keys(obj);
  return one(
    c,
    `INSERT INTO ${table}(${fields.join(',')}) VALUES(${fields.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`,
    Object.values(obj),
  );
}
export async function commitSource(c: DB, a: Actor, b: any, input: any) {
  const v = z
    .object({
      expected_version: z.number().int(),
      preview_token: z.string().min(16),
      conflict_mode: z.enum(['REJECT', 'REPLACE']),
      reason: z.string().trim().min(1).max(5000).optional(),
    })
    .strict()
    .parse(input);
  version(b, v.expected_version);
  need(
    b.status === 'PREVIEWED' && b.preview?.facts?.length && !b.preview.errors.length,
    'Cần preview hợp lệ trước khi nhập',
    409,
    'PREVIEW_STALE',
  );
  need(
    v.preview_token === sign(b.preview.binding) &&
      v.preview_token === b.preview.preview_token &&
      b.preview.binding.version === b.version,
    'Preview đã thay đổi',
    409,
    'PREVIEW_STALE',
  );
  const facts = b.preview.facts
    .map(({ source_row, ...f }: any) => f)
    .sort((x: any, y: any) => canonicalJSON(x).localeCompare(canonicalJSON(y)));
  need(
    hash(canonicalJSON(facts)) === b.canonical_hash,
    'Preview không khớp dữ liệu chuẩn',
    409,
    'PREVIEW_STALE',
  );
  // jsonb reorders object keys; compare canonical structures, not insertion order.
  const freshBytes = await readFile(join(dataDir, b.storage_key));
  need(hash(freshBytes) === b.checksum, 'Tệp gốc đã thay đổi sau preview', 409, 'PREVIEW_STALE');
  need(
    (await fingerprint(c, a, b)) === b.preview.binding.permission,
    'Quyền nguồn đã thay đổi',
    403,
    'ACCESS_CHANGED',
  );
  const series = [b.company_id, b.resource_id, b.adapter_code, b.period_basis, b.currency].join(
    ':',
  );
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [series]);
  const overlap = await rows(
    c,
    `SELECT p.*,r.canonical_hash FROM source_partitions p JOIN source_revisions r ON r.id=p.current_revision_id WHERE p.company_id=$1 AND p.resource_id=$2 AND p.adapter_code=$3 AND p.basis=$4 AND p.currency=$5 AND p.period_start<=$7 AND p.period_end>=$6 FOR UPDATE OF p`,
    [
      b.company_id,
      b.resource_id,
      b.adapter_code,
      b.period_basis,
      b.currency,
      b.period_start,
      b.period_end,
    ],
  );
  need(
    !overlap.some((p) => p.canonical_hash === b.canonical_hash),
    'Cùng dữ liệu chuẩn đã nhập',
    409,
    'CANONICAL_DUPLICATE',
  );
  let p = overlap[0];
  if (overlap.length) {
    need(
      v.conflict_mode === 'REPLACE',
      'Nguồn giao nhau; cần Admin thay phiên bản',
      409,
      'SOURCE_CONFLICT',
    );
    need(isAdmin(a));
    need(v.reason, 'Cần lý do thay nguồn', 422, 'REASON_REQUIRED');
    need(
      overlap.length === 1 && p.period_start === b.period_start && p.period_end === b.period_end,
      'Chỉ thay đúng toàn bộ partition; không cắt nguồn',
      409,
      'SOURCE_CONFLICT',
    );
  }
  if (!p)
    p = await one(
      c,
      `INSERT INTO source_partitions(company_id,resource_id,adapter_code,grain,basis,attribution_key,period_start,period_end,currency,version) VALUES($1,$2,$3,$4,$5,'NONE',$6,$7,$8,1) RETURNING *`,
      [
        b.company_id,
        b.resource_id,
        b.adapter_code,
        b.adapter_code === 'KOC_SALES'
          ? 'PERIOD'
          : b.adapter_code === 'VIDEO_PERFORMANCE'
            ? 'SNAPSHOT'
            : 'DAY',
        b.period_basis,
        b.period_start,
        b.period_end,
        b.currency,
      ],
    );
  const revision = await one(
    c,
    `INSERT INTO source_revisions(partition_id,revision,batch_id,previous_revision_id,canonical_hash,confirmation_id,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      p.id,
      p.current_revision_id ? p.version + 1 : 1,
      b.id,
      p.current_revision_id,
      b.canonical_hash,
      b.preview.binding.confirmation_id,
      v.reason || 'INITIAL_IMPORT',
      a.id,
    ],
  );
  const orders = new Map<string, any>();
  for (const f of b.preview.facts) {
    if (b.adapter_code === 'TIKTOK_SALES' || b.adapter_code === 'SHOPEE_SALES')
      await insertObject(c, 'sales_daily_facts', { source_revision_id: revision.id, ...f });
    else if (b.adapter_code === 'KOC_SALES')
      await insertObject(c, 'koc_period_facts', { source_revision_id: revision.id, ...f });
    else if (b.adapter_code === 'TIKTOK_RETURNS') {
      let o = orders.get(f.order_id);
      if (!o) {
        o = await insertObject(c, 'return_order_facts', {
          source_revision_id: revision.id,
          ...Object.fromEntries(
            [
              'order_id',
              'status_raw',
              'type_raw',
              'normalized_type',
              'order_amount',
              'refund_amount',
              'created_at_source',
              'cancelled_at_source',
              'creator_handle',
            ].map((k) => [k, f[k] ?? null]),
          ),
        });
        orders.set(f.order_id, o);
      }
      await insertObject(c, 'return_sku_facts', {
        order_fact_id: o.id,
        ...Object.fromEntries(
          ['sku_id', 'seller_sku', 'package_id', 'quantity', 'returned_quantity', 'source_row'].map(
            (k) => [k, f[k] ?? null],
          ),
        ),
      });
    } else {
      const url = new URL(f.url);
      need(
        ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password,
        'URL video không hợp lệ',
        422,
        'INVALID_URL',
      );
      url.search = '';
      url.hash = '';
      let pub = await one(
        c,
        'SELECT * FROM publications WHERE channel_id=$1 AND canonical_url=$2',
        [b.resource_id, url.href],
      );
      if (!pub) {
        const record = await one(
          c,
          `INSERT INTO records(module,kind,role,owner_id,title) VALUES('content','PUBLICATION','CONTENT',$1,$2) RETURNING id`,
          [a.id, f.title],
        );
        pub = await insertObject(c, 'publications', {
          id: record.id,
          content_id: null,
          channel_id: b.resource_id,
          platform_video_id: url.pathname.match(/\/video\/(\d+)/)?.[1] || null,
          original_url: f.url,
          canonical_url: url.href,
          published_at: null,
          published_precision: 'UNKNOWN',
          publisher_id: null,
          version: 1,
          origin: 'HISTORICAL_IMPORT',
        });
      }
      await insertObject(c, 'video_snapshots', {
        publication_id: pub.id,
        source_revision_id: revision.id,
        collected_at: null,
        collected_precision: 'UNKNOWN',
        published_raw: f.published_raw,
        collected_raw: f.collected_raw || '',
        views: f.views,
        likes: f.likes,
        comments: f.comments,
        shares: f.shares,
        source_row: f.source_row,
      });
    }
  }
  await c.query('UPDATE source_partitions SET current_revision_id=$2,version=$3 WHERE id=$1', [
    p.id,
    revision.id,
    revision.revision,
  ]);
  await c.query("UPDATE metric_batches SET status='COMMITTED',version=version+1 WHERE id=$1", [
    b.id,
  ]);
  return {
    id: b.id,
    source_revision: revision.id,
    revision: revision.revision,
    rows: b.preview.facts.length,
    status: 'COMMITTED',
  };
}
export async function sourceHistory(c: DB, a: Actor, q: any) {
  const result = [];
  for (const b of await rows(
    c,
    `SELECT id,resource_id,adapter_code,filename,period_start,period_end,status,version,created_at FROM metric_batches WHERE adapter_code IS NOT NULL ORDER BY created_at DESC,id DESC`,
  )) {
    try {
      await resourceAccess(c, a, b.resource_id);
      if (!q.adapter_code || q.adapter_code === b.adapter_code) result.push(b);
    } catch (e: any) {
      if (e.code !== 'NOT_FOUND') throw e;
    }
  }
  return { items: result.slice(0, 100) };
}
export function sourceSummaryRoutes(api: API) {
  for (const kind of ['sales', 'koc', 'returns'])
    api('GET', `/${kind}/summary`, async (c, a, b, q) => {
      const v = z
        .object({
          company_id: z.uuid(),
          resource_id: z.uuid(),
          from: z.iso.date(),
          to: z.iso.date(),
          currency: z
            .string()
            .regex(/^[A-Z]{3}$/)
            .default('VND'),
          q: z.string().trim().max(255).default(''),
          limit: z.coerce.number().int().min(1).max(100).default(100),
          cursor: z.coerce.number().int().min(0).default(0),
        })
        .strict()
        .parse(q);
      const r = await resourceAccess(c, a, v.resource_id);
      need(
        r.kind === 'SHOP' && r.company_id === v.company_id,
        'Nguồn/pháp nhân không hợp lệ',
        422,
        'SOURCE_CONTEXT',
      );
      const part = `FROM source_partitions p JOIN source_revisions rev ON rev.id=p.current_revision_id`;
      need(v.to >= v.from, 'Khoảng ngày không hợp lệ', 422, 'VALIDATION');
      const args = [v.resource_id, v.from, v.to, v.currency];
      if (kind === 'sales') {
        const items = await rows(
          c,
          `SELECT f.*,p.id AS partition_id,rev.id AS source_revision_id,p.currency ${part} JOIN sales_daily_facts f ON f.source_revision_id=rev.id WHERE p.resource_id=$1 AND p.currency=$4 AND f.business_date>=$2 AND f.business_date<=$3 ORDER BY f.business_date`,
          args,
        );
        const total = await one(
          c,
          `SELECT sum(f.revenue)::text AS revenue,sum(f.orders)::text AS orders,sum(f.cancelled_orders)::text AS cancelled_orders,sum(f.refunded_orders)::text AS refunded_orders,sum(f.refund_amount)::text AS refund_amount,sum(f.cancelled_orders)/nullif(sum(f.orders),0) AS cancel_rate,sum(f.refunded_orders)/nullif(sum(f.orders),0) AS refund_rate,count(DISTINCT f.business_date)::int AS days ${part} JOIN sales_daily_facts f ON f.source_revision_id=rev.id WHERE p.resource_id=$1 AND p.currency=$4 AND f.business_date>=$2 AND f.business_date<=$3`,
          args,
        );
        const expectedDays = Math.floor((+new Date(v.to) - +new Date(v.from)) / 86400e3) + 1;
        return {
          items: items.slice(v.cursor, v.cursor + v.limit),
          filtered_total: items.length,
          next_cursor: items.length > v.cursor + v.limit ? v.cursor + v.limit : null,
          currency: v.currency,
          summary: total,
          expected_days: expectedDays,
          availability: total.days === expectedDays ? 'AVAILABLE' : 'INCOMPLETE',
          returned_orders: null,
          missing_reason: 'G05: Chưa có nguồn chứng minh đơn trả hàng',
        };
      }
      if (kind === 'koc') {
        const items = await rows(
          c,
          `SELECT f.*,f.gmv/nullif(sum(f.gmv) OVER(),0) AS share ${part} JOIN koc_period_facts f ON f.source_revision_id=rev.id WHERE p.resource_id=$1 AND p.currency=$4 AND p.period_start=$2 AND p.period_end=$3 ORDER BY f.gmv DESC,f.creator_key ASC`,
          args,
        );
        const summary = await one(
          c,
          `SELECT sum(f.gmv)::text AS gmv,sum(f.orders)::text AS orders,sum(f.estimated_commission)::text AS estimated_commission,sum(f.refund_amount)::text AS refund_amount ${part} JOIN koc_period_facts f ON f.source_revision_id=rev.id WHERE p.resource_id=$1 AND p.currency=$4 AND p.period_start=$2 AND p.period_end=$3`,
          args,
        );
        const matched = items.filter(
          (f) => !v.q || f.creator_key.includes(v.q.normalize('NFC').toLocaleLowerCase('vi')),
        );
        return {
          items: matched.slice(v.cursor, v.cursor + v.limit),
          filtered_total: matched.length,
          next_cursor: matched.length > v.cursor + v.limit ? v.cursor + v.limit : null,
          currency: v.currency,
          top10: matched.slice(0, 10),
          summary,
          availability: items.length ? 'AVAILABLE' : 'UNCONFIRMED_PERIOD',
          paid_commission: null,
          missing_reason: 'G05: Chưa có nguồn hoa hồng quyết toán',
        };
      }
      return {
        items: await rows(
          c,
          `SELECT count(*)::int AS orders,sum(f.order_amount)::text AS order_amount,sum(f.refund_amount)::text AS refund_amount,p.basis,f.normalized_type ${part} JOIN return_order_facts f ON f.source_revision_id=rev.id WHERE p.resource_id=$1 AND p.currency=$4 AND p.period_start=$2 AND p.period_end=$3 GROUP BY p.basis,f.normalized_type`,
          args,
        ),
      };
    });
}
