import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { API } from './app.js';
import { type Actor, type DB, need, one, rows, hash, isAdmin, localDate } from './base.js';
import { publicationAccess, d7Performance } from './content.js';
import { resourceAccess } from './handoff-access.js';
const instant = z.iso.datetime({ offset: true });
export function videoWindowRoutes(api: API) {
  api('POST', '/publications/:id/window-facts', async (c, a, b, q, p) => {
    const v = z
      .object({
        expected_version: z.number().int(),
        window_start: instant,
        window_end: instant,
        metric: z.literal('GMV'),
        value: z.string().regex(/^\d{1,18}(\.\d{1,10})?$/),
        currency: z.string().regex(/^[A-Z]{3}$/),
        attribution_key: z.literal('PUBLISHED_168H'),
        source_asset_id: z.uuid(),
        source_basis: z.string().trim().min(1).max(5000),
        confirmed: z.literal(true),
        replace: z.boolean().default(false),
        reason: z.string().trim().min(1).max(5000).optional(),
      })
      .strict()
      .parse(b);
    await c.query('SELECT id FROM publications WHERE id=$1 FOR UPDATE', [p.id]);
    const pub = await publicationAccess(c, a, p.id, true);
    need(pub.version === v.expected_version, 'Lượt đăng đã thay đổi', 409, 'VERSION_CONFLICT');
    const resource = await resourceAccess(c, a, pub.channel_id, true);
    need(
      ['SECOND', 'MINUTE'].includes(pub.published_precision) && pub.published_at,
      'Cần xác nhận đầy đủ ngày giờ đăng',
      422,
      'AMBIGUOUS_DATE',
    );
    const start = +new Date(pub.published_at),
      end = start + 168 * 3600e3;
    need(
      +new Date(v.window_start) === start && +new Date(v.window_end) === end,
      'Cửa sổ phải đúng [giờ đăng, giờ đăng + 168 giờ)',
      422,
      'WINDOW_NOT_COMPARABLE',
    );
    need(Date.now() >= end, 'Video chưa đủ tuổi D7', 422, 'NOT_DUE');
    const asset = await one(c, 'SELECT * FROM assets WHERE id=$1 AND record_id=$2', [
      v.source_asset_id,
      pub.id,
    ]);
    need(asset, 'Cần chứng từ nguồn riêng của lượt đăng', 422, 'SOURCE_EVIDENCE_REQUIRED');
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      'manual-window:' + pub.id,
    ]);
    const canonical = hash(
      JSON.stringify([
        pub.id,
        v.metric,
        v.window_start,
        v.window_end,
        v.value,
        v.currency,
        v.attribution_key,
        asset.sha256,
      ]),
    );
    let partition = await one(
      c,
      'SELECT * FROM source_partitions WHERE resource_id=$1 AND adapter_code=$2 FOR UPDATE',
      [resource.id, 'MANUAL_VIDEO_WINDOW:' + pub.id],
    );
    if (partition?.current_revision_id) {
      const old = await one(c, 'SELECT canonical_hash FROM source_revisions WHERE id=$1', [
        partition.current_revision_id,
      ]);
      need(
        old.canonical_hash !== canonical,
        'Nguồn cửa sổ đã được ghi nhận',
        409,
        'CANONICAL_DUPLICATE',
      );
      need(
        v.replace && isAdmin(a) && v.reason,
        'Chỉ Admin được thay phiên bản cửa sổ với lý do',
        409,
        'SOURCE_CONFLICT',
      );
    }
    let batch = await one(
      c,
      "SELECT * FROM metric_batches WHERE company_id=$1 AND resource_id=$2 AND adapter_code='MANUAL_VIDEO_WINDOW' AND checksum=$3",
      [resource.company_id, resource.id, asset.sha256],
    );
    if (!batch)
      batch = await one(
        c,
        `INSERT INTO metric_batches(owner_id,role,platform,shop,currency,kind,checksum,filename,raw,storage_key,company_id,resource_id,adapter_code,adapter_version,period_start,period_end,period_basis,status) VALUES($1,'CONTENT',$2,$3,$4,'VIDEO_WINDOW',$5,$6,'[]',$7,$8,$9,'MANUAL_VIDEO_WINDOW',1,$10,$11,'PUBLISHED_168H','COMMITTED') RETURNING *`,
        [
          a.id,
          resource.platform,
          resource.id,
          v.currency,
          asset.sha256,
          asset.filename,
          asset.storage_key,
          resource.company_id,
          resource.id,
          localDate(new Date(start)),
          localDate(new Date(end - 1)),
        ],
      );
    const confirm = await one(
      c,
      'INSERT INTO import_confirmations(batch_id,batch_version,confirmed_metadata,metadata_hash,actor_id) VALUES($1,$2,$3,$4,$5) RETURNING id',
      [
        batch.id,
        batch.version,
        JSON.stringify({
          publication_id: pub.id,
          window_start: v.window_start,
          window_end: v.window_end,
          source_asset_id: asset.id,
          source_basis: v.source_basis,
          attribution_key: v.attribution_key,
        }),
        canonical,
        a.id,
      ],
    );
    if (!partition)
      partition = await one(
        c,
        `INSERT INTO source_partitions(company_id,resource_id,adapter_code,grain,basis,attribution_key,period_start,period_end,currency,version) VALUES($1,$2,$3,'WINDOW','PUBLISHED_168H','PUBLISHED_168H',$4,$5,$6,1) RETURNING *`,
        [
          resource.company_id,
          resource.id,
          'MANUAL_VIDEO_WINDOW:' + pub.id,
          localDate(new Date(start)),
          localDate(new Date(end - 1)),
          v.currency,
        ],
      );
    const revision = await one(
      c,
      `INSERT INTO source_revisions(partition_id,revision,batch_id,previous_revision_id,canonical_hash,confirmation_id,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        partition.id,
        partition.current_revision_id ? partition.version + 1 : 1,
        batch.id,
        partition.current_revision_id,
        canonical,
        confirm.id,
        v.reason || 'MANUAL_VERIFIED_EVIDENCE',
        a.id,
      ],
    );
    await c.query(
      `INSERT INTO video_window_facts(publication_id,source_revision_id,window_start,window_end,metric,value,attribution_key,currency,window_verified) VALUES($1,$2,$3,$4,'GMV',$5,'PUBLISHED_168H',$6,true)`,
      [pub.id, revision.id, v.window_start, v.window_end, v.value, v.currency],
    );
    await c.query('UPDATE source_partitions SET current_revision_id=$2,version=$3 WHERE id=$1', [
      partition.id,
      revision.id,
      revision.revision,
    ]);
    return d7Performance(c, pub);
  });
}
