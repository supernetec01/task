import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { type API } from './app.js';
import {
  type Actor,
  type DB,
  one,
  rows,
  need,
  isAdmin,
  hasJob,
  manages,
  hash,
  audit,
  version,
  dataDir,
} from './base.js';
export const metricDefinitions: Record<string, string> = {
  gmv: 'SUM',
  total_revenue: 'SUM',
  orders: 'SUM',
  items_sold: 'SUM',
  refunds_amount: 'SUM',
  sku_orders: 'SUM',
  page_views: 'SUM',
  visitors: 'PERIOD_UNIQUE',
  customers: 'PERIOD_UNIQUE',
  product_impressions: 'SUM',
  unique_product_impressions: 'PERIOD_UNIQUE',
  product_clicks: 'SUM',
  conversion_rate: 'RATIO',
  ad_spend: 'SUM',
  impressions: 'SUM',
  clicks: 'SUM',
  conversions: 'SUM',
  attributed_gmv: 'SUM',
  views: 'CUMULATIVE',
  likes: 'CUMULATIVE',
  comments: 'CUMULATIVE',
  shares: 'CUMULATIVE',
};
const metricSchema = z.object({
  platform: z.enum(['TIKTOK', 'SHOPEE', 'FACEBOOK', 'OTHER']),
  shop: z.string().trim().min(1).max(150),
  kind: z.enum(['SALES', 'ADS', 'VIDEO', 'LIVE']),
  subject: z.string().max(200).default('SHOP'),
  metric: z.string(),
  business_date: z.iso.date(),
  window_end: z.iso.date(),
  grain: z.enum(['DAY', 'PERIOD', 'SNAPSHOT']),
  aggregation: z.enum(['SUM', 'PERIOD_UNIQUE', 'RATIO', 'CUMULATIVE']),
  currency: z.string().regex(/^[A-Z]{3}$/),
  value: z
    .string()
    .regex(/^-?\d{1,18}(\.\d{1,10})?$/)
    .nullable(),
  missing_reason: z.string().min(1).max(1000).nullable(),
  source: z.string().trim().min(1).max(500),
});
const natural = (v: any) => [
  v.platform,
  v.shop,
  v.kind,
  v.subject,
  v.metric,
  v.business_date,
  v.window_end,
  v.grain,
  v.currency,
];
export function safeWorkbook(bytes: Buffer) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  need(end >= 0 && end + 22 <= bytes.length, 'File XLSX không hợp lệ', 422, 'FILE_TYPE');
  const count = bytes.readUInt16LE(end + 10);
  let at = bytes.readUInt32LE(end + 16),
    total = 0;
  need(count > 0 && count <= 2000, 'Workbook quá nhiều thành phần', 422, 'FILE_TOO_LARGE');
  for (let i = 0; i < count; i++) {
    need(
      at + 46 <= end && bytes.readUInt32LE(at) === 0x02014b50,
      'ZIP directory không hợp lệ',
      422,
      'FILE_TYPE',
    );
    total += bytes.readUInt32LE(at + 24);
    need(total <= 100 * 1024 * 1024, 'Workbook giải nén vượt 100 MiB', 422, 'FILE_TOO_LARGE');
    const length = bytes.readUInt16LE(at + 28),
      extra = bytes.readUInt16LE(at + 30),
      comment = bytes.readUInt16LE(at + 32);
    at += 46 + length + extra + comment;
    need(at <= end, 'ZIP directory không hợp lệ', 422, 'FILE_TYPE');
  }
}
function writer(a: Actor, kind: string) {
  const role = kind === 'ADS' ? 'ADS' : kind === 'SALES' ? 'MARKETPLACE' : 'CONTENT';
  need(isAdmin(a) || hasJob(a, role));
  return role;
}
async function batchAccess(c: DB, a: Actor, id: string, lock = false) {
  const v = await one(c, 'SELECT * FROM metric_batches WHERE id=$1' + (lock ? ' FOR UPDATE' : ''), [
    id,
  ]);
  need(
    v && (isAdmin(a) || (v.owner_id === a.id && hasJob(a, v.role))),
    'Không tìm thấy nguồn',
    404,
    'NOT_FOUND',
  );
  return v;
}
export function decimal(raw: any, locale: string) {
  if (raw === null || raw === undefined || String(raw).trim() === '' || String(raw).trim() === '—')
    return null;
  let s = String(raw).trim().replace(/\s/g, '');
  if (locale === 'vi-VN') {
    s = s.replace(/\./g, '').replace(',', '.');
  } else s = s.replace(/,/g, '');
  need(/^-?\d{1,18}(\.\d{1,10})?$/.test(s), 'Số không đúng định dạng nguồn', 422, 'NUMBER_FORMAT');
  return s;
}
async function insertMetric(
  c: DB,
  a: Actor,
  v: any,
  role: string,
  batch: string | null,
  replace = false,
) {
  const p = metricSchema.parse(v);
  need(
    metricDefinitions[p.metric] === p.aggregation || p.aggregation === 'CUMULATIVE',
    'Chỉ số/kiểu tổng hợp chưa được định nghĩa',
    422,
    'METRIC_DEFINITION',
  );
  need(p.value !== null || p.missing_reason, 'Thiếu số cần lý do', 422, 'VALIDATION');
  need(p.window_end >= p.business_date, 'Kỳ ngày không hợp lệ', 422, 'VALIDATION');
  if (p.aggregation === 'RATIO' && p.value !== null)
    need(Number(p.value) >= 0 && Number(p.value) <= 1, 'Tỷ lệ phải ở dạng 0–1', 422, 'VALIDATION');
  const key = natural(p);
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify(key)]);
  const old = await one(
    c,
    'SELECT * FROM metrics WHERE platform=$1 AND shop=$2 AND kind=$3 AND subject=$4 AND metric=$5 AND business_date=$6 AND window_end=$7 AND grain=$8 AND currency=$9 ORDER BY revision DESC LIMIT 1',
    key,
  );
  need(!old || replace, 'Nguồn chồng kỳ, cần xác nhận revision thay thế', 409, 'SOURCE_CONFLICT');
  if (old)
    need(
      isAdmin(a) || old.owner_id === a.id,
      'Chỉ chủ nguồn hoặc Admin được thay nguồn',
      403,
      'FORBIDDEN',
    );
  return one(
    c,
    'INSERT INTO metrics(platform,shop,kind,subject,metric,business_date,window_end,grain,aggregation,currency,value,missing_reason,batch_id,owner_id,role,revision,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *',
    [
      p.platform,
      p.shop,
      p.kind,
      p.subject,
      p.metric,
      p.business_date,
      p.window_end,
      p.grain,
      p.aggregation,
      p.currency,
      p.value,
      p.missing_reason,
      batch,
      a.id,
      role,
      (old?.revision || 0) + 1,
      p.source,
    ],
  );
}
export function metricRoutes(api: API) {
  api('GET', '/metric-definitions', async () => ({ definitions: metricDefinitions }));
  api('POST', '/metrics', async (c, a, b) => {
    const role = writer(a, b.kind);
    const r = await insertMetric(c, a, b, role, null, b.replace === true);
    await audit(c, a, 'METRIC_ENTERED', 'metric', r.id);
    return r;
  });
  api('GET', '/metrics', async (c, a, b, q) => {
    const role = writer(a, q.kind || 'SALES');
    const data = await rows(
      c,
      `SELECT DISTINCT ON(platform,shop,kind,subject,metric,business_date,window_end,grain,currency) m.* FROM metrics m WHERE kind=$1 ORDER BY platform,shop,kind,subject,metric,business_date,window_end,grain,currency,revision DESC`,
      [q.kind || 'SALES'],
    );
    const items = [];
    for (const r of data) {
      const u = await one(c, 'SELECT id,team_id FROM users WHERE id=$1', [r.owner_id]);
      if (isAdmin(a) || r.owner_id === a.id || manages(a, u)) items.push(r);
    }
    return {
      items,
      definitions: metricDefinitions,
      note: 'Các nguồn sales / ads / video / live và grain tách riêng. Unique/ratio/snapshot không cộng qua ngày.',
    };
  });
  api('POST', '/imports', async (c, a, b) => {
    const f = b.fields || {},
      v = z
        .object({
          platform: z.enum(['TIKTOK', 'SHOPEE', 'FACEBOOK', 'OTHER']),
          shop: z.string().min(1).max(150),
          currency: z.string().regex(/^[A-Z]{3}$/),
          kind: z.enum(['SALES', 'ADS', 'VIDEO', 'LIVE']),
        })
        .parse(f);
    const role = writer(a, v.kind);
    need(/\.(xlsx|csv)$/i.test(b.filename), 'Chỉ nhận XLSX hoặc CSV', 422, 'FILE_TYPE');
    const wb = new ExcelJS.Workbook();
    try {
      if (/\.xlsx$/i.test(b.filename)) {
        safeWorkbook(b.buffer);
        await wb.xlsx.load(b.buffer);
      } else await wb.csv.read(Readable.from([b.buffer]));
    } catch (e: any) {
      need(
        false,
        e.status ? e.message : 'Không đọc được workbook; kiểm tra file và định dạng',
        422,
        e.code || 'FILE_TYPE',
      );
    }
    const sheets: any[] = [];
    for (const ws of wb.worksheets) {
      need(
        ws.rowCount <= 10000 && ws.columnCount <= 100,
        'Nguồn vượt 10.000 dòng / 100 cột; tách file trước khi nhập',
        422,
        'FILE_TOO_LARGE',
      );
      const data: any[][] = [];
      ws.eachRow({ includeEmpty: true }, (r) =>
        data.push(
          (r.values as any[])
            .slice(1)
            .map((v) =>
              v instanceof Date
                ? v.toISOString().slice(0, 10)
                : typeof v === 'object' && v
                  ? (v.result ?? v.text ?? v.richText?.map((t: any) => t.text).join('') ?? '')
                  : (v ?? null),
            ),
        ),
      );
      sheets.push({ name: ws.name, rows: data });
    }
    const checksum = hash(b.buffer);
    const existing = await one(
      c,
      'SELECT id FROM metric_batches WHERE platform=$1 AND shop=$2 AND kind=$3 AND checksum=$4',
      [v.platform, v.shop, v.kind, checksum],
    );
    need(!existing, 'File này đã được tải với tên khác hoặc cùng tên', 409, 'DUPLICATE_FILE');
    const storageKey = 'source-' + randomUUID();
    await writeFile(join(dataDir, storageKey), b.buffer, { mode: 0o600, flag: 'wx' });
    const r = await one(
      c,
      'INSERT INTO metric_batches(owner_id,role,platform,shop,currency,kind,checksum,filename,raw,storage_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,version',
      [
        a.id,
        role,
        v.platform,
        v.shop,
        v.currency,
        v.kind,
        checksum,
        String(b.filename).slice(0, 200),
        JSON.stringify(sheets),
        storageKey,
      ],
    );
    await audit(c, a, 'SOURCE_UPLOADED', 'import', r.id);
    return r;
  });
  api('GET', '/imports', async (c, a, b, q) => {
    writer(a, q.kind || 'SALES');
    return {
      items: await rows(
        c,
        'SELECT id,platform,shop,kind,filename,status,version,created_at FROM metric_batches WHERE (owner_id=$1 OR $2) AND kind=$3 ORDER BY created_at DESC LIMIT 100',
        [a.id, isAdmin(a), q.kind || 'SALES'],
      ),
    };
  });
  api('GET', '/imports/:id/source', async (c, a, b, q, p, reply) => {
    const batch = await batchAccess(c, a, p.id);
    need(batch.storage_key, 'Nguồn cũ chưa có tệp gốc', 404, 'NOT_FOUND');
    const bytes = await readFile(join(dataDir, batch.storage_key));
    need(hash(bytes) === batch.checksum, 'Nguồn không khớp checksum', 500, 'FILE_INTEGRITY');
    await audit(c, a, 'SOURCE_DOWNLOADED', 'import', batch.id);
    reply
      .type('application/octet-stream')
      .header(
        'content-disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(batch.filename)}`,
      );
    return bytes;
  });
  api('GET', '/imports/:id', async (c, a, b, q, p) => {
    const v = await batchAccess(c, a, p.id);
    return { ...v, raw: v.raw.map((s: any) => ({ ...s, rows: s.rows.slice(0, 30) })) };
  });
  api('POST', '/imports/:id/preview', async (c, a, b, q, p) => {
    const batch = await batchAccess(c, a, p.id, true);
    version(batch, b.expected_version);
    need(batch.status !== 'COMMITTED', 'Nguồn đã commit', 409, 'STATE');
    const v = z
      .object({
        sheet: z.string(),
        header_row: z.number().int().min(1),
        date_column: z.number().int().min(0),
        mapping: z.record(z.string(), z.number().int().min(0)),
        locale: z.enum(['vi-VN', 'en-US']),
        grain: z.enum(['DAY', 'PERIOD', 'SNAPSHOT']),
        subject: z.string().default('SHOP'),
        window_end: z.iso.date().optional(),
      })
      .parse(b);
    const sheet = batch.raw.find((s: any) => s.name === v.sheet);
    need(sheet, 'Không tìm thấy sheet', 422, 'VALIDATION');
    const normalized: any[] = [],
      errors: any[] = [],
      skipped: any[] = [];
    for (const [i, row] of sheet.rows.entries()) {
      if (i < v.header_row) continue;
      const rawDate = row[v.date_column];
      if (rawDate === undefined || rawDate === null || rawDate === '') continue;
      if (/tổng|total|thay đổi|change/i.test(String(rawDate))) {
        skipped.push({ row: i + 1, reason: 'SUMMARY_OR_DELTA_NOT_DAILY' });
        continue;
      }
      const date = String(rawDate).slice(0, 10);
      if (!z.iso.date().safeParse(date).success) {
        errors.push({
          row: i + 1,
          field: 'date',
          raw_value: rawDate,
          message: 'Ngày phải YYYY-MM-DD; chọn đúng cột/profile',
        });
        continue;
      }
      for (const [metric, col] of Object.entries(v.mapping)) {
        try {
          need(metric in metricDefinitions, 'Metric chưa có definition', 422, 'VALIDATION');
          const val = decimal(row[col], v.locale);
          normalized.push({
            platform: batch.platform,
            shop: batch.shop,
            kind: batch.kind,
            subject: v.subject,
            metric,
            business_date: date,
            window_end: v.window_end || date,
            grain: v.grain,
            aggregation: metricDefinitions[metric],
            currency: batch.currency,
            value: val,
            missing_reason: val === null ? 'Nguồn trống/—' : null,
            source: `batch:${batch.id}:sheet:${v.sheet}:row:${i + 1}`,
          });
        } catch (e: any) {
          errors.push({ row: i + 1, field: metric, raw_value: row[col], message: e.message });
        }
      }
    }
    const keys = normalized.map((n) => JSON.stringify(natural(n)));
    need(
      new Set(keys).size === keys.length,
      'Nguồn có khóa tự nhiên trùng trong cùng batch',
      422,
      'DUPLICATE_ROW',
    );
    const preview = {
        profile: v,
        rows: normalized,
        errors,
        skipped,
        warnings: [
          'Không cộng dòng tổng vào dòng ngày; unique và ratio không cộng qua ngày.',
          'Đơn vị/nguồn/attribution do người nhập xác nhận; không cộng GMV shop với ads/video.',
        ],
      },
      preview_hash = hash(JSON.stringify(preview));
    await c.query(
      "UPDATE metric_batches SET preview=$2,preview_hash=$3,status='PREVIEWED',version=version+1 WHERE id=$1",
      [batch.id, JSON.stringify(preview), preview_hash],
    );
    return { ...preview, preview_hash, version: batch.version + 1 };
  });
  api('POST', '/imports/:id/commit', async (c, a, b, q, p) => {
    const batch = await batchAccess(c, a, p.id, true);
    version(batch, b.expected_version);
    need(
      batch.status === 'PREVIEWED' && batch.preview_hash === b.preview_hash,
      'Preview đã thay đổi',
      409,
      'STALE_PREVIEW',
    );
    need(
      batch.preview.rows.length && !batch.preview.errors.length,
      'Cần sửa hết lỗi và có dữ liệu trước khi nhập',
      422,
      'VALIDATION',
    );
    need(
      ['REJECT', 'REPLACE'].includes(b.conflict_resolution),
      'Cần quyết định khi nguồn chồng kỳ',
      422,
      'VALIDATION',
    );
    for (const v of batch.preview.rows)
      await insertMetric(c, a, v, batch.role, batch.id, b.conflict_resolution === 'REPLACE');
    await c.query("UPDATE metric_batches SET status='COMMITTED',version=version+1 WHERE id=$1", [
      batch.id,
    ]);
    await audit(c, a, 'IMPORT_COMMITTED', 'import', batch.id, { count: batch.preview.rows.length });
    return { ok: true, count: batch.preview.rows.length };
  });
  api('GET', '/claims', async (c, a) => {
    need(isAdmin(a) || hasJob(a, 'MARKETPLACE'));
    return {
      items: await rows(
        c,
        "SELECT c.*,coalesce(jsonb_agg(l.*) FILTER(WHERE l.id IS NOT NULL),'[]') AS lines FROM claims c LEFT JOIN claim_lines l ON l.claim_id=c.id WHERE c.owner_id=$1 OR $2 GROUP BY c.id ORDER BY c.created_at DESC",
        [a.id, isAdmin(a)],
      ),
    };
  });
  api('POST', '/claims', async (c, a, b) => {
    need(isAdmin(a) || hasJob(a, 'MARKETPLACE'));
    const v = z
      .object({
        platform: z.string().min(1),
        shop: z.string().min(1),
        order_id: z.string().min(1),
        amount: z.string().regex(/^\d{1,14}(\.\d{1,2})?$/),
        currency: z.string().regex(/^[A-Z]{3}$/),
        stage: z.enum(['UNSPECIFIED', 'CLAIMED', 'APPROVED', 'RECEIVED']).default('UNSPECIFIED'),
        note: z.string().max(5000).default(''),
        lines: z
          .array(
            z.object({
              sku: z.string().min(1),
              quantity: z.number().positive(),
              allocation: z
                .string()
                .regex(/^\d{1,14}(\.\d{1,2})?$/)
                .nullable(),
            }),
          )
          .min(1)
          .max(100),
      })
      .parse(b);
    const cents = (n: string) =>
      BigInt(n.split('.')[0]) * 100n + BigInt((n.split('.')[1] || '').padEnd(2, '0'));
    need(
      v.lines.reduce((s, l) => s + (l.allocation ? cents(l.allocation) : 0n), 0n) <=
        cents(v.amount),
      'Tổng phân bổ không được vượt tiền bồi hoàn cấp đơn',
      422,
      'VALIDATION',
    );
    const r = await one(
      c,
      'INSERT INTO claims(owner_id,platform,shop,order_id,amount,currency,stage,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [a.id, v.platform, v.shop, v.order_id, v.amount, v.currency, v.stage, v.note],
    );
    for (const l of v.lines)
      await c.query(
        'INSERT INTO claim_lines(claim_id,sku,quantity,allocation) VALUES($1,$2,$3,$4)',
        [r.id, l.sku, l.quantity, l.allocation],
      );
    await audit(c, a, 'CLAIM_ENTERED', 'claim', r.id);
    return r;
  });
}
