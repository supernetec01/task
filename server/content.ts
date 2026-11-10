import { z } from 'zod';
import type { API } from './app.js';
import { type Actor, type DB, need, one, rows, isAdmin, hasJob, actor, version } from './base.js';
import { resourceAccess } from './handoff-access.js';

const instant = z.iso.datetime({ offset: true });
const url = z.url().refine((v) => {
  const u = new URL(v);
  return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password;
});
const fields = z
  .object({
    title: z.string().trim().min(1).max(255),
    brief: z.string().max(50000).default(''),
    writer_id: z.uuid().nullable().default(null),
    camera_operator_id: z.uuid().nullable().default(null),
    editor_id: z.uuid().nullable().default(null),
    script_text: z.string().max(50000).default(''),
    shoot_location: z.string().max(1000).nullable().default(null),
    scheduled_shoot_at: instant.nullable().default(null),
    actual_shot_at: instant.nullable().default(null),
    edited_at: instant.nullable().default(null),
    due_at: instant.nullable().default(null),
    script_asset_ids: z.array(z.uuid()).max(50).default([]),
    raw_asset_ids: z.array(z.uuid()).max(50).default([]),
    final_asset_ids: z.array(z.uuid()).max(50).default([]),
    raw_links: z.array(url).max(50).default([]),
    final_links: z.array(url).max(50).default([]),
    no_actor_note: z.string().max(1000).default(''),
    participants: z
      .array(
        z
          .object({
            user_id: z.uuid().nullable().default(null),
            external_name: z.string().trim().min(1).max(150).nullable().default(null),
            participant_role: z.enum(['ACTOR', 'CAMERA', 'EDITOR', 'SUPPORT']),
            note: z.string().max(1000).default(''),
          })
          .strict()
          .refine((v) => !!v.user_id !== !!v.external_name),
      )
      .max(100)
      .default([]),
  })
  .strict();
export async function contentAccess(c: DB, a: Actor, id: string, lock = false) {
  const r = await one(
    c,
    `SELECT ci.*,r.title,r.payload AS legacy_payload FROM content_items ci JOIN records r ON r.id=ci.id WHERE ci.id=$1 ${lock ? 'FOR UPDATE OF ci' : ''}`,
    [id],
  );
  need(r, 'Không tìm thấy nội dung', 404, 'NOT_FOUND');
  const participants = await rows(
    c,
    'SELECT cp.*,u.name AS user_name FROM content_participants cp LEFT JOIN users u ON u.id=cp.user_id WHERE content_id=$1 ORDER BY cp.id',
    [id],
  );
  need(
    isAdmin(a) ||
      (hasJob(a, 'CONTENT') &&
        ([r.owner_id, r.writer_id, r.camera_operator_id, r.editor_id].includes(a.id) ||
          participants.some((p) => p.user_id === a.id))),
    'Không tìm thấy nội dung',
    404,
    'NOT_FOUND',
  );
  return {
    ...r,
    brief: r.legacy_payload.brief || '',
    capabilities: {
      structure: isAdmin(a) || r.owner_id === a.id,
      script: isAdmin(a) || r.writer_id === a.id,
      shoot: isAdmin(a) || r.camera_operator_id === a.id,
      edit: isAdmin(a) || r.editor_id === a.id,
    },
    participants,
    events: await rows(
      c,
      'SELECT * FROM content_stage_events WHERE content_id=$1 ORDER BY created_at,id',
      [id],
    ),
    assets: await rows(c, 'SELECT id,filename,size FROM assets WHERE record_id=$1', [id]),
  };
}
async function contentRevision(c: DB, a: Actor, id: string, reason: string) {
  const item = await contentAccess(c, a, id);
  await c.query(
    'INSERT INTO content_revisions(content_id,revision,snapshot,created_by,reason) VALUES($1,$2,$3,$4,$5)',
    [id, item.version, JSON.stringify(item), a.id, reason],
  );
}
async function saveContent(c: DB, a: Actor, v: any, id: string, existing?: any) {
  for (const uid of [
    v.writer_id,
    v.camera_operator_id,
    v.editor_id,
    ...(v.participants || []).map((p: any) => p.user_id),
  ].filter(Boolean))
    await actor(c, uid);
  for (const asset of [
    ...(v.script_asset_ids || []),
    ...(v.raw_asset_ids || []),
    ...(v.final_asset_ids || []),
  ])
    need(
      await one(c, 'SELECT id FROM assets WHERE id=$1 AND record_id=$2', [asset, id]),
      'File phải thuộc nội dung này',
      422,
      'ASSET_SCOPE',
    );
  if (existing && !isAdmin(a) && existing.owner_id !== a.id) {
    const permitted = new Set(['expected_version']);
    if (existing.writer_id === a.id)
      for (const k of ['script_text', 'script_asset_ids']) permitted.add(k);
    if (existing.camera_operator_id === a.id)
      for (const k of [
        'shoot_location',
        'actual_shot_at',
        'raw_asset_ids',
        'raw_links',
        'no_actor_note',
      ])
        permitted.add(k);
    if (existing.editor_id === a.id)
      for (const k of ['edited_at', 'final_asset_ids', 'final_links']) permitted.add(k);
    need(Object.keys(v).every((k) => permitted.has(k)));
  }
  if (v.title !== undefined || v.brief !== undefined)
    await c.query(
      "UPDATE records SET title=coalesce($2,title),payload=CASE WHEN $3::text IS NULL THEN payload ELSE payload||jsonb_build_object('brief',$3::text) END,version=version+1,updated_at=now() WHERE id=$1",
      [id, v.title ?? null, v.brief ?? null],
    );
  const columns = [
    'writer_id',
    'camera_operator_id',
    'editor_id',
    'script_text',
    'shoot_location',
    'scheduled_shoot_at',
    'actual_shot_at',
    'edited_at',
    'due_at',
    'script_asset_ids',
    'raw_asset_ids',
    'final_asset_ids',
    'raw_links',
    'final_links',
    'no_actor_note',
  ].filter((k) => v[k] !== undefined);
  if (columns.length)
    await c.query(
      `UPDATE content_items SET ${columns.map((k, i) => k + '=$' + (i + 2)).join(',')} WHERE id=$1`,
      [
        id,
        ...columns.map((k) =>
          ['raw_links', 'final_links'].includes(k) ? JSON.stringify(v[k]) : v[k],
        ),
      ],
    );
  if (v.participants) {
    await c.query('DELETE FROM content_participants WHERE content_id=$1', [id]);
    for (const p of v.participants)
      await c.query(
        'INSERT INTO content_participants(content_id,participant_role,user_id,external_name,note) VALUES($1,$2,$3,$4,$5)',
        [id, p.participant_role, p.user_id, p.external_name, p.note],
      );
  }
}
export function canonicalVideoUrl(raw: string, platform: string) {
  const u = new URL(url.parse(raw));
  const domains: Record<string, string[]> = {
    TIKTOK: ['tiktok.com'],
    FACEBOOK: ['facebook.com', 'fb.watch'],
    GOOGLE: ['youtube.com', 'youtu.be'],
  };
  if (domains[platform])
    need(
      domains[platform].some((d) => u.hostname === d || u.hostname.endsWith('.' + d)),
      'Link không đúng nền tảng',
      422,
      'PLATFORM_URL',
    );
  const videoId = u.pathname.match(/\/video\/(\d+)/)?.[1] || null;
  u.search = '';
  u.hash = '';
  return { canonical: u.href, videoId };
}
export async function publicationAccess(c: DB, a: Actor, id: string, write = false) {
  const p = await one(
    c,
    'SELECT p.*,r.title FROM publications p JOIN records r ON r.id=p.id WHERE p.id=$1',
    [id],
  );
  need(p, 'Không tìm thấy lượt đăng', 404, 'NOT_FOUND');
  await resourceAccess(c, a, p.channel_id, write);
  return p;
}
export async function d7Performance(c: DB, p: any) {
  const snapshots = await rows(
    c,
    `SELECT s.* FROM video_snapshots s JOIN source_revisions r ON r.id=s.source_revision_id JOIN source_partitions sp ON sp.id=r.partition_id AND sp.current_revision_id=r.id WHERE publication_id=$1 ORDER BY collected_at DESC NULLS LAST,s.id`,
    [p.id],
  );
  const precise = ['SECOND', 'MINUTE'].includes(p.published_precision) && p.published_at;
  const end = precise ? new Date(+new Date(p.published_at) + 168 * 3600e3) : null;
  let status = !precise ? 'AMBIGUOUS_DATE' : new Date() < end! ? 'NOT_DUE' : 'MISSING_SOURCE';
  let gmv = null;
  if (precise && status !== 'NOT_DUE') {
    const fact = await one(
      c,
      `SELECT f.* FROM video_window_facts f JOIN source_revisions r ON r.id=f.source_revision_id JOIN source_partitions sp ON sp.id=r.partition_id AND sp.current_revision_id=r.id WHERE f.publication_id=$1 AND f.metric='GMV' AND f.window_verified AND f.window_start=$2 AND f.window_end=$3 AND f.value IS NOT NULL ORDER BY r.created_at DESC LIMIT 1`,
      [p.id, p.published_at, end],
    );
    if (fact) {
      status = 'READY';
      gmv = fact.value;
    }
  }
  const s = snapshots[0];
  const scaled =
    s && BigInt(s.views) > 0n
      ? (
          ((BigInt(s.likes) + BigInt(s.comments) + BigInt(s.shares)) * 10000000000n) /
          BigInt(s.views)
        )
          .toString()
          .padStart(11, '0')
      : null;
  return {
    snapshots,
    d7: {
      status,
      gmv,
      window_start: precise ? p.published_at : null,
      window_end: end,
      missing_reason:
        gmv === null ? 'G01/G03: Cần nguồn GMV đúng cửa sổ và thời gian đăng đầy đủ' : null,
    },
    interaction_rate: scaled ? scaled.slice(0, -10) + '.' + scaled.slice(-10) : null,
  };
}
export function contentRoutes(api: API) {
  api('POST', '/content-items', async (c, a, b) => {
    need(isAdmin(a) || hasJob(a, 'CONTENT'));
    const v = fields.parse(b);
    const r = await one(
      c,
      `INSERT INTO records(module,kind,role,owner_id,title,payload) VALUES('content','CONTENT','CONTENT',$1,$2,$3) RETURNING id`,
      [a.id, v.title, JSON.stringify({ brief: v.brief })],
    );
    await c.query(
      `INSERT INTO content_items(id,owner_id,stage,script_text,version) VALUES($1,$2,'SCRIPTING','',1)`,
      [r.id, a.id],
    );
    await saveContent(c, a, v, r.id);
    await contentRevision(c, a, r.id, 'CREATED');
    return contentAccess(c, a, r.id);
  });
  api('GET', '/content-items', async (c, a, b, q) => {
    need(isAdmin(a) || hasJob(a, 'CONTENT'));
    const items = [];
    for (const r of await rows(
      c,
      `SELECT ci.id FROM content_items ci JOIN records r ON r.id=ci.id WHERE ($1='' OR r.title ILIKE '%'||$1||'%') ORDER BY ci.due_at ASC NULLS LAST,r.created_at DESC,ci.id`,
      [String(q.q || '').slice(0, 255)],
    ))
      try {
        const item = await contentAccess(c, a, r.id);
        if (
          (!q.stage || String(q.stage).split(',').includes(item.stage)) &&
          (!q.owner_id || item.owner_id === q.owner_id)
        )
          items.push(item);
      } catch (e: any) {
        if (e.code !== 'NOT_FOUND') throw e;
      }
    return { items: items.slice(0, 100) };
  });
  api('GET', '/content-items/:id', async (c, a, b, q, p) => contentAccess(c, a, p.id));
  api('PATCH', '/content-items/:id', async (c, a, b, q, p) => {
    const parsed: any = fields
      .partial()
      .extend({ expected_version: z.number().int() })
      .strict()
      .parse(b);
    const v = Object.fromEntries(Object.keys(b).map((k) => [k, parsed[k]]));
    const r = await contentAccess(c, a, p.id, true);
    version(r, v.expected_version);
    await saveContent(c, a, v, r.id, r);
    await c.query('UPDATE content_items SET version=version+1 WHERE id=$1', [r.id]);
    await contentRevision(c, a, r.id, 'UPDATED');
    return contentAccess(c, a, r.id);
  });
  api('POST', '/content-items/:id/complete-stage', async (c, a, b, q, p) => {
    const v = z
      .object({ stage: z.enum(['SCRIPT', 'SHOOT', 'EDIT']), expected_version: z.number().int() })
      .strict()
      .parse(b);
    const r = await contentAccess(c, a, p.id, true);
    version(r, v.expected_version);
    const current = { SCRIPT: 'SCRIPTING', SHOOT: 'WAITING_SHOOT', EDIT: 'WAITING_EDIT' }[v.stage];
    need(r.stage === current, 'Không được bỏ qua bước', 409, 'STAGE_ORDER');
    const credited = { SCRIPT: r.writer_id, SHOOT: r.camera_operator_id, EDIT: r.editor_id }[
      v.stage
    ];
    need(
      credited && (isAdmin(a) || a.id === credited),
      'Chỉ người được phân công hoàn thành bước',
      403,
      'FORBIDDEN',
    );
    if (v.stage === 'SCRIPT')
      need(
        r.script_text.trim() || r.script_asset_ids?.length,
        'Cần lời thoại hoặc tài liệu kịch bản',
        422,
        'STAGE_EVIDENCE',
      );
    if (v.stage === 'SHOOT')
      need(
        r.actual_shot_at &&
          +new Date(r.actual_shot_at) <= Date.now() &&
          r.shoot_location &&
          (r.participants.length || r.no_actor_note.trim()) &&
          (r.raw_asset_ids?.length || r.raw_links.length),
        'Cần thời gian, địa điểm, người tham gia và tư liệu quay',
        422,
        'STAGE_EVIDENCE',
      );
    if (v.stage === 'EDIT')
      need(
        r.edited_at &&
          +new Date(r.edited_at) <= Date.now() &&
          r.actual_shot_at &&
          +new Date(r.edited_at) >= +new Date(r.actual_shot_at) &&
          (r.final_asset_ids?.length || r.final_links.length),
        'Cần thời gian dựng hợp lệ và clip hoàn chỉnh',
        422,
        'STAGE_EVIDENCE',
      );
    const prior = await one(
      c,
      'SELECT id,revision FROM content_stage_events WHERE content_id=$1 AND stage_code=$2 ORDER BY revision DESC LIMIT 1',
      [r.id, v.stage],
    );
    await c.query(
      `INSERT INTO content_stage_events(content_id,stage_code,kind,business_at,actor_id,credited_user_id,revision,supersedes_id,snapshot,reason) VALUES($1,$2,'COMPLETE',$3,$4,$5,$6,$7,$8,'')`,
      [
        r.id,
        v.stage,
        v.stage === 'SHOOT' ? r.actual_shot_at : v.stage === 'EDIT' ? r.edited_at : new Date(),
        a.id,
        credited,
        (prior?.revision || 0) + 1,
        prior?.id || null,
        JSON.stringify(r),
      ],
    );
    await c.query('UPDATE content_items SET stage=$2,version=version+1 WHERE id=$1', [
      r.id,
      { SCRIPT: 'WAITING_SHOOT', SHOOT: 'WAITING_EDIT', EDIT: 'CLIP_READY' }[v.stage],
    ]);
    await contentRevision(c, a, r.id, 'STAGE_COMPLETED');
    return contentAccess(c, a, r.id);
  });
  api('GET', '/content-items/:id/history', async (c, a, b, q, p) => {
    await contentAccess(c, a, p.id);
    return {
      items: await rows(
        c,
        'SELECT * FROM content_revisions WHERE content_id=$1 ORDER BY revision DESC LIMIT 100',
        [p.id],
      ),
    };
  });
  api('POST', '/content-items/:id/correct-stage', async (c, a, b, q, p) => {
    need(isAdmin(a));
    const v = z
      .object({
        stage: z.enum(['SCRIPT', 'SHOOT', 'EDIT']),
        kind: z.enum(['CORRECT', 'REOPEN']),
        business_at: instant,
        reason: z.string().trim().min(1).max(5000),
        expected_version: z.number().int(),
      })
      .strict()
      .parse(b);
    const r = await contentAccess(c, a, p.id, true);
    version(r, v.expected_version);
    need(
      +new Date(v.business_at) <= Date.now(),
      'Mốc thực tế không ở tương lai',
      422,
      'INVALID_DATE',
    );
    const previous = await one(
      c,
      'SELECT * FROM content_stage_events WHERE content_id=$1 AND stage_code=$2 ORDER BY revision DESC LIMIT 1',
      [r.id, v.stage],
    );
    need(previous, 'Chưa có mốc giai đoạn để điều chỉnh', 422, 'STAGE_ORDER');
    if (v.kind === 'CORRECT') {
      const earlier = v.stage === 'EDIT' ? 'SHOOT' : v.stage === 'SHOOT' ? 'SCRIPT' : null;
      const later = v.stage === 'SCRIPT' ? 'SHOOT' : v.stage === 'SHOOT' ? 'EDIT' : null;
      if (earlier) {
        const e = await one(
          c,
          'SELECT business_at FROM content_stage_events WHERE content_id=$1 AND stage_code=$2 ORDER BY revision DESC LIMIT 1',
          [r.id, earlier],
        );
        need(
          !e || +new Date(v.business_at) >= +new Date(e.business_at),
          'Mốc không được trước bước trước',
          422,
          'STAGE_ORDER',
        );
      }
      if (later) {
        const e = await one(
          c,
          'SELECT business_at FROM content_stage_events WHERE content_id=$1 AND stage_code=$2 ORDER BY revision DESC LIMIT 1',
          [r.id, later],
        );
        need(
          !e || +new Date(v.business_at) <= +new Date(e.business_at),
          'Mốc không được sau bước kế tiếp',
          422,
          'STAGE_ORDER',
        );
      }
    }
    await c.query(
      'INSERT INTO content_stage_events(content_id,stage_code,kind,business_at,actor_id,credited_user_id,revision,supersedes_id,snapshot,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [
        r.id,
        v.stage,
        v.kind,
        v.business_at,
        a.id,
        previous.credited_user_id,
        previous.revision + 1,
        previous.id,
        JSON.stringify(r),
        v.reason,
      ],
    );
    const stage =
      v.kind === 'REOPEN'
        ? { SCRIPT: 'SCRIPTING', SHOOT: 'WAITING_SHOOT', EDIT: 'WAITING_EDIT' }[v.stage]
        : r.stage;
    await c.query('UPDATE content_items SET stage=$2,version=version+1 WHERE id=$1', [r.id, stage]);
    await contentRevision(c, a, r.id, v.reason);
    return contentAccess(c, a, r.id);
  });
  api('POST', '/publications', async (c, a, b) => {
    const v = z
      .object({
        content_id: z.uuid(),
        channel_id: z.uuid(),
        original_url: url,
        published_at: instant,
      })
      .strict()
      .parse(b);
    const r = await resourceAccess(c, a, v.channel_id, true);
    const ci = await contentAccess(c, a, v.content_id);
    need(ci.stage === 'CLIP_READY', 'Clip chưa hoàn chỉnh', 422, 'CLIP_NOT_READY');
    need(
      +new Date(v.published_at) <= Date.now(),
      'Ngày đăng không được ở tương lai',
      422,
      'INVALID_DATE',
    );
    const u = canonicalVideoUrl(v.original_url, r.platform);
    const record = await one(
      c,
      `INSERT INTO records(module,kind,role,owner_id,title) VALUES('content','PUBLICATION','CONTENT',$1,$2) RETURNING id`,
      [a.id, ci.title],
    );
    await c.query(
      `INSERT INTO publications(id,content_id,channel_id,platform_video_id,original_url,canonical_url,published_at,published_precision,publisher_id,version,origin) VALUES($1,$2,$3,$4,$5,$6,$7,'SECOND',$8,1,'MANAGED')`,
      [record.id, ci.id, r.id, u.videoId, v.original_url, u.canonical, v.published_at, a.id],
    );
    return publicationAccess(c, a, record.id);
  });
  api('GET', '/publications', async (c, a, b, q) => {
    const items = [];
    for (const p of await rows(
      c,
      'SELECT id FROM publications ORDER BY published_at DESC NULLS LAST,id',
    ))
      try {
        const pub = await publicationAccess(c, a, p.id);
        const performance = await d7Performance(c, pub);
        if (!q.d7_status || q.d7_status === performance.d7.status)
          items.push({ ...pub, ...performance });
      } catch (e: any) {
        if (e.code !== 'NOT_FOUND') throw e;
      }
    return { items: items.slice(0, 100) };
  });
  api('GET', '/publications/:id/performance', async (c, a, b, q, p) =>
    d7Performance(c, await publicationAccess(c, a, p.id)),
  );
  api('POST', '/publications/:id/link-content', async (c, a, b, q, p) => {
    const v = z
      .object({
        content_id: z.uuid(),
        expected_version: z.number().int(),
        reason: z.string().trim().min(1).max(5000),
      })
      .strict()
      .parse(b);
    await c.query('SELECT id FROM publications WHERE id=$1 FOR UPDATE', [p.id]);
    const pub = await publicationAccess(c, a, p.id, true);
    if (pub.origin === 'MANAGED' && !isAdmin(a)) {
      const content = await contentAccess(c, a, pub.content_id);
      need(content.owner_id === a.id);
    }
    version(pub, v.expected_version);
    need(pub.origin === 'HISTORICAL_IMPORT', 'Chỉ liên kết bổ sung video lịch sử', 422, 'STATE');
    await contentAccess(c, a, v.content_id);
    await c.query(
      'INSERT INTO publication_link_history(publication_id,previous_content_id,content_id,actor_id,reason) VALUES($1,$2,$3,$4,$5)',
      [pub.id, pub.content_id, v.content_id, a.id, v.reason],
    );
    await c.query('UPDATE publications SET content_id=$2,version=version+1 WHERE id=$1', [
      pub.id,
      v.content_id,
    ]);
    return publicationAccess(c, a, pub.id);
  });
  api('POST', '/publications/:id/confirm-date', async (c, a, b, q, p) => {
    const v = z
      .object({
        published_at: instant,
        precision: z.enum(['SECOND', 'MINUTE', 'DATE']),
        source: z.string().trim().min(1).max(2000),
        expected_version: z.number().int(),
      })
      .strict()
      .parse(b);
    const pub = await publicationAccess(c, a, p.id, true);
    if (pub.origin === 'MANAGED' && !isAdmin(a)) {
      const ci = await contentAccess(c, a, pub.content_id);
      need(ci.owner_id === a.id);
    }
    await c.query('SELECT id FROM publications WHERE id=$1 FOR UPDATE', [p.id]);
    version(pub, v.expected_version);
    need(+new Date(v.published_at) <= Date.now(), 'Ngày đăng ở tương lai', 422, 'INVALID_DATE');
    await c.query(
      'INSERT INTO publication_date_confirmations(publication_id,published_at,precision,source,actor_id) VALUES($1,$2,$3,$4,$5)',
      [pub.id, v.published_at, v.precision, v.source, a.id],
    );
    await c.query(
      'UPDATE publications SET published_at=$2,published_precision=$3,version=version+1 WHERE id=$1',
      [pub.id, v.published_at, v.precision],
    );
    return publicationAccess(c, a, pub.id);
  });
}
