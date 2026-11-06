import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { type API } from './app.js';
import {
  type DB,
  type Actor,
  rows,
  one,
  need,
  actor,
  hasJob,
  isAdmin,
  manages,
  management,
  version,
  event,
  notify,
  setting,
  responseDue,
} from './base.js';
export const templates = JSON.parse(readFileSync('config/task_templates.json', 'utf8'))
  .templates as any[];
export const catalog = JSON.parse(readFileSync('config/role_task_catalog.json', 'utf8'))
  .roles as Record<string, string[]>;
export async function taskAccess(c: DB, a: Actor, id: string, lock = false) {
  const t = await one(
    c,
    `SELECT t.*,u.name AS owner_name,u.team_id,cr.name AS giver_name,rv.name AS reviewer_name FROM tasks t JOIN users u ON u.id=t.owner_id JOIN users cr ON cr.id=t.created_by LEFT JOIN users rv ON rv.id=t.reviewer_id WHERE t.id=$1 ${lock ? 'FOR UPDATE OF t' : ''}`,
    [id],
  );
  need(t, 'Không tìm thấy công việc', 404, 'NOT_FOUND');
  const s = await one(c, 'SELECT * FROM supporters WHERE task_id=$1 AND user_id=$2', [id, a.id]);
  const owner = t.owner_id === a.id && hasJob(a, t.role),
    manager =
      isAdmin(a) || (t.owner_id !== a.id && manages(a, { id: t.owner_id, team_id: t.team_id })),
    support =
      t.status !== 'DRAFT' && s && ['PENDING', 'ACCEPTED'].includes(s.status) && hasJob(a, s.role);
  need(owner || manager || support, 'Không tìm thấy công việc', 404, 'NOT_FOUND');
  return { t, s, owner, manager, support };
}
export async function taskDetail(c: DB, a: Actor, id: string) {
  const x = await taskAccess(c, a, id),
    { t, s, owner, manager } = x;
  const canReview = manager && t.reviewer_id === a.id && t.owner_id !== a.id;
  const brief = {
    id: t.id,
    code: t.code,
    title: t.title,
    description: t.description,
    owner_id: t.owner_id,
    owner_name: t.owner_name,
    role: t.role,
    type: t.type,
    priority: t.priority,
    status: t.status,
    due_at: t.due_at,
    version: t.version,
    participation: s,
    capabilities: { owner, manager, review: canReview },
  };
  const assets = await rows(
    c,
    `SELECT id,filename,size,shared,uploaded_by,role,created_at FROM assets WHERE task_id=$1 ${!owner && !manager ? 'AND shared=true' : ''} ORDER BY created_at`,
    [id],
  );
  if (!owner && !manager && s?.status === 'PENDING')
    return { ...brief, assets, pending_brief: true };
  return {
    ...t,
    participation: s,
    capabilities: brief.capabilities,
    assets,
    supporters: await rows(
      c,
      'SELECT s.*,u.name FROM supporters s JOIN users u ON u.id=s.user_id WHERE task_id=$1 ORDER BY u.name',
      [id],
    ),
    checkpoints: await rows(c, 'SELECT * FROM checkpoints WHERE task_id=$1 ORDER BY position', [
      id,
    ]),
    submissions: await rows(
      c,
      'SELECT s.*,r.decision,r.feedback FROM submissions s LEFT JOIN reviews r ON r.submission_id=s.id WHERE s.task_id=$1 ORDER BY revision DESC',
      [id],
    ),
    events: await rows(
      c,
      'SELECT e.*,u.name FROM task_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.task_id=$1 ORDER BY e.id DESC LIMIT 100',
      [id],
    ),
    deadlines:
      owner || manager
        ? await rows(c, 'SELECT * FROM deadline_requests WHERE task_id=$1 ORDER BY id', [id])
        : [],
  };
}
export function validatePayload(type: string, payload: any) {
  need(
    payload && typeof payload === 'object' && !Array.isArray(payload),
    'Trường chuyên môn không hợp lệ',
    422,
    'VALIDATION',
  );
  const tmpl = templates.find((t) => t.code === type) || templates[0];
  for (const f of tmpl.fields) {
    const v = payload[f.key];
    if (v === undefined || v === null || v === '') continue;
    let valid = true;
    if (['string', 'reference'].includes(f.type)) valid = typeof v === 'string';
    if (f.type === 'boolean') valid = typeof v === 'boolean';
    if (f.type === 'decimal') valid = typeof v === 'number' && Number.isFinite(v);
    if (['array', 'metric_array', 'reference_array', 'link_array'].includes(f.type))
      valid = Array.isArray(v);
    if (f.type === 'url') valid = validURL(v);
    if (f.type === 'date') valid = z.iso.date().safeParse(v).success;
    if (f.type === 'datetime') valid = z.iso.datetime({ offset: true }).safeParse(v).success;
    if (f.type === 'link_array' && Array.isArray(v)) valid = v.every(validURL);
    need(valid, `Dữ liệu ${f.label} không đúng kiểu`, 422, 'VALIDATION');
    if (f.items && Array.isArray(v))
      for (const row of v) {
        need(
          row && typeof row === 'object' && !Array.isArray(row),
          `Dòng ${f.label} không hợp lệ`,
          422,
          'VALIDATION',
        );
        for (const [key, type] of Object.entries(f.items) as [string, string][]) {
          const item = row[key];
          if (item === undefined || (item === null && type.endsWith('_nullable'))) continue;
          let ok =
            type === 'string'
              ? typeof item === 'string'
              : type === 'url'
                ? validURL(item)
                : type === 'date'
                  ? z.iso.date().safeParse(item).success
                  : type === 'integer'
                    ? Number.isInteger(item)
                    : type.startsWith('decimal')
                      ? typeof item === 'number' && Number.isFinite(item)
                      : true;
          need(ok, `Trường ${f.label} / ${key} không hợp lệ`, 422, 'VALIDATION');
        }
      }
  }
  return payload;
}
export function validURL(v: unknown) {
  try {
    const u = new URL(String(v));
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password;
  } catch {
    return false;
  }
}
export async function createTask(c: DB, a: Actor, b: any) {
  const v = z
    .object({
      title: z.string().trim().min(1).max(255),
      description: z.string().max(50000).default(''),
      owner_id: z.uuid().optional(),
      role: z.string(),
      due_at: z.iso.datetime({ offset: true }).nullable().optional(),
      type: z.string().default('OTHER'),
      priority: z.enum(['NORMAL', 'URGENT']).default('NORMAL'),
      draft: z.boolean().default(false),
      occurred_at: z.iso.datetime({ offset: true }).nullable().optional(),
      supporters: z
        .array(z.object({ user_id: z.uuid(), role: z.string() }))
        .max(50)
        .default([]),
    })
    .parse(b);
  const ownerId = v.owner_id || a.id,
    oa = await actor(c, ownerId);
  need(
    hasJob(oa, v.role),
    'Người phụ trách chưa có role này hoặc đã hết hạn',
    422,
    'ROLE_REQUIRED',
  );
  need(ownerId === a.id || manages(a, { id: ownerId, team_id: oa.team_id }));
  need(v.draft || v.due_at, 'Cần thời hạn', 422, 'VALIDATION');
  need(
    (catalog[v.role] || ['OTHER']).includes(v.type),
    'Loại task không thuộc role',
    422,
    'VALIDATION',
  );
  const u = await one(c, 'SELECT reviewer_id FROM users WHERE id=$1', [ownerId]);
  const reviewerId = ownerId !== a.id ? a.id : u.reviewer_id;
  if (!v.draft) {
    need(
      reviewerId && reviewerId !== ownerId,
      'Chưa cấu hình người duyệt khác người phụ trách (Q04)',
      422,
      'CONFIG_REQUIRED',
    );
    const ra = await actor(c, reviewerId);
    need(
      manages(ra, { id: ownerId, team_id: oa.team_id }),
      'Người duyệt chưa được cấp đúng phạm vi',
      422,
      'CONFIG_REQUIRED',
    );
  }
  const policy = await setting(c, 'policies');
  need(
    new Set(v.supporters.map((s) => s.user_id)).size === v.supporters.length,
    'Người hỗ trợ trùng',
    422,
    'VALIDATION',
  );
  for (const s of v.supporters) {
    need(
      s.user_id !== ownerId,
      'Người phụ trách không đồng thời là người hỗ trợ',
      422,
      'VALIDATION',
    );
    const sa = await actor(c, s.user_id);
    need(hasJob(sa, s.role), 'Role hỗ trợ không hiệu lực', 422, 'ROLE_REQUIRED');
    need(
      isAdmin(a) || policy.support_scope === 'ALL' || sa.team_id === a.team_id,
      'Người hỗ trợ ngoài phạm vi mời',
      403,
      'FORBIDDEN',
    );
  }
  const t = await one(
    c,
    `INSERT INTO tasks(title,description,owner_id,created_by,reviewer_id,role,type,priority,status,source,original_due_at,due_at,occurred_at,started_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,CASE WHEN $9='IN_PROGRESS' THEN now() END) RETURNING *`,
    [
      v.title,
      v.description,
      ownerId,
      a.id,
      reviewerId || null,
      v.role,
      v.type,
      v.priority,
      v.draft ? 'DRAFT' : ownerId === a.id ? 'IN_PROGRESS' : 'ASSIGNED',
      ownerId === a.id ? 'EMPLOYEE_ADHOC' : 'MANAGER_ASSIGNED',
      v.due_at || null,
      v.occurred_at || null,
    ],
  );
  await c.query('INSERT INTO owner_history(task_id,owner_id,role,reason) VALUES($1,$2,$3,$4)', [
    t.id,
    ownerId,
    v.role,
    'CREATED',
  ]);
  if (t.status === 'ASSIGNED') await assign(c, t);
  const tmpl = templates.find((x) => x.code === v.type) || templates[0];
  for (const [i, title] of tmpl.checkpoints.entries())
    await c.query('INSERT INTO checkpoints(task_id,title,position) VALUES($1,$2,$3)', [
      t.id,
      title,
      i,
    ]);
  for (const s of v.supporters) {
    await c.query('INSERT INTO supporters(task_id,user_id,role) VALUES($1,$2,$3)', [
      t.id,
      s.user_id,
      s.role,
    ]);
    if (!v.draft)
      await notify(
        c,
        s.user_id,
        `invite:${t.id}:${s.user_id}`,
        'Bạn có lời mời hỗ trợ công việc',
        t.id,
      );
  }
  await event(c, a, t.id, 'CREATED', { source: t.source });
  return t;
}
export async function assign(c: DB, t: any) {
  const calendar = await setting(c, 'calendar'),
    now = new Date();
  await c.query(
    'INSERT INTO assignments(task_id,owner_id,status,response_due_at,calendar_snapshot) VALUES($1,$2,$3,$4,$5)',
    [t.id, t.owner_id, 'PENDING', responseDue(now, calendar.holidays), JSON.stringify(calendar)],
  );
  await notify(
    c,
    t.owner_id,
    `assigned:${t.id}:${t.version}`,
    'Bạn có công việc mới chờ phản hồi',
    t.id,
  );
}
export function taskRoutes(api: API) {
  api('GET', '/task-types', async (c, a) => ({
    items: templates,
    catalog: Object.fromEntries(
      Object.entries(catalog).filter(([r]) => hasJob(a, r) || isAdmin(a)),
    ),
  }));
  api('POST', '/tasks', createTask);
  api('GET', '/tasks', async (c, a, b, q) => {
    const mode = q.mode === 'team' && management(a) ? 'team' : 'mine';
    const accessible = await rows(
      c,
      `SELECT t.id FROM tasks t JOIN users u ON u.id=t.owner_id WHERE ((t.owner_id=$1 AND EXISTS(SELECT 1 FROM grants g WHERE g.user_id=$1 AND g.kind='JOB' AND g.role=t.role AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_to IS NULL OR g.valid_to>now()))) OR EXISTS(SELECT 1 FROM supporters s JOIN grants g ON g.user_id=s.user_id AND g.role=s.role AND g.kind='JOB' WHERE s.task_id=t.id AND t.status<>'DRAFT' AND s.user_id=$1 AND s.status IN ('PENDING','ACCEPTED') AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_to IS NULL OR g.valid_to>now())) OR ($2 AND EXISTS(SELECT 1 FROM grants g WHERE g.user_id=$1 AND g.kind='ACCESS' AND g.role IN ('ADMIN','BOSS','MANAGER') AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_to IS NULL OR g.valid_to>now()) AND (g.scope='ALL' OR (g.scope='TEAM' AND g.team_id=u.team_id))))) AND ($3='' OR t.title ILIKE '%'||$3||'%' OR t.code::text=$3) AND ($4='' OR t.status=$4) AND ($5='' OR t.role=$5) AND ($6='' OR t.owner_id::text=$6) ORDER BY t.updated_at DESC LIMIT 101 OFFSET $7`,
      [
        a.id,
        mode === 'team',
        String(q.search || '').slice(0, 255),
        q.status || '',
        q.role || '',
        q.owner || '',
        Math.max(0, Number(q.cursor) || 0),
      ],
    );
    const items = [];
    for (const t of accessible.slice(0, 100)) items.push(await taskDetail(c, a, t.id));
    return {
      items,
      next_cursor: accessible.length > 100 ? String((Number(q.cursor) || 0) + 100) : null,
    };
  });
  api('GET', '/tasks/:id', async (c, a, b, q, p) => taskDetail(c, a, p.id));
  api('PATCH', '/tasks/:id', async (c, a, b, q, p) => {
    const { t, owner } = await taskAccess(c, a, p.id, true);
    need(owner);
    version(t, b.expected_version);
    need(
      !['DONE', 'CANCELLED', 'SUBMITTED'].includes(t.status),
      'Không thể sửa trạng thái hiện tại',
      409,
      'STATE',
    );
    const v = z
      .object({
        title: z.string().trim().min(1).max(255),
        description: z.string().max(50000),
        expected_version: z.number().int(),
      })
      .strict()
      .parse(b);
    await c.query(
      'UPDATE tasks SET title=$2,description=$3,version=version+1,updated_at=now() WHERE id=$1',
      [t.id, v.title, v.description],
    );
    await event(c, a, t.id, 'BRIEF_UPDATED');
    return taskDetail(c, a, t.id);
  });
  api('PATCH', '/tasks/:id/payload', async (c, a, b, q, p) => {
    const { t, owner } = await taskAccess(c, a, p.id, true);
    need(owner);
    version(t, b.expected_version);
    need(
      ['DRAFT', 'ACCEPTED', 'IN_PROGRESS', 'CHANGES_REQUESTED'].includes(t.status),
      'Không thể sửa bản đã nộp/đóng',
      409,
      'STATE',
    );
    validatePayload(t.type, b.values);
    await c.query('UPDATE tasks SET payload=$2,version=version+1,updated_at=now() WHERE id=$1', [
      t.id,
      JSON.stringify(b.values),
    ]);
    await event(c, a, t.id, 'PAYLOAD_UPDATED');
    return taskDetail(c, a, t.id);
  });
  api('POST', '/tasks/:id/dispatch', async (c, a, b, q, p) => {
    const { t, owner, manager } = await taskAccess(c, a, p.id, true);
    need(owner || manager);
    version(t, b.expected_version);
    need(t.status === 'DRAFT', 'Chỉ giao từ nháp', 409, 'STATE');
    const due = b.due_at ? z.iso.datetime({ offset: true }).parse(b.due_at) : t.due_at;
    const oa = await actor(c, t.owner_id);
    need(hasJob(oa, t.role), 'Role của người nhận đã hết hiệu lực', 422, 'ROLE_REQUIRED');
    const configured = await one(c, 'SELECT reviewer_id FROM users WHERE id=$1', [t.owner_id]);
    const reviewer = t.owner_id === t.created_by ? configured.reviewer_id : t.created_by;
    need(
      due && reviewer && reviewer !== t.owner_id,
      'Cần cấu hình hạn và người duyệt',
      422,
      'CONFIG_REQUIRED',
    );
    need(
      manages(await actor(c, reviewer), { id: t.owner_id, team_id: oa.team_id }),
      'Người duyệt không còn quyền',
      422,
      'CONFIG_REQUIRED',
    );
    await c.query('UPDATE tasks SET due_at=$2,original_due_at=$2,reviewer_id=$3 WHERE id=$1', [
      t.id,
      due,
      reviewer,
    ]);
    await c.query(
      "UPDATE tasks SET status=CASE WHEN owner_id=created_by THEN 'IN_PROGRESS' ELSE 'ASSIGNED' END,started_at=CASE WHEN owner_id=created_by THEN now() END,version=version+1,updated_at=now() WHERE id=$1",
      [t.id],
    );
    if (t.owner_id !== t.created_by) await assign(c, t);
    for (const support of await rows(
      c,
      "SELECT user_id FROM supporters WHERE task_id=$1 AND status='PENDING'",
      [t.id],
    ))
      await notify(
        c,
        support.user_id,
        `invite:${t.id}:${support.user_id}`,
        'Bạn có lời mời hỗ trợ công việc',
        t.id,
      );
    await event(c, a, t.id, 'DISPATCHED');
    return taskDetail(c, a, t.id);
  });
  api('POST', '/tasks/:id/assignment-response', async (c, a, b, q, p) => {
    const { t, owner } = await taskAccess(c, a, p.id, true);
    need(owner);
    version(t, b.expected_version);
    need(t.status === 'ASSIGNED', 'Công việc không còn chờ phản hồi', 409, 'STATE');
    const v = z
      .object({ decision: z.enum(['ACCEPT', 'DECLINE']), note: z.string().max(5000).default('') })
      .parse(b);
    const attempt = await one(
      c,
      "SELECT * FROM assignments WHERE task_id=$1 AND status='PENDING' FOR UPDATE",
      [t.id],
    );
    need(attempt, 'Lượt giao đã kết thúc', 409, 'STATE');
    const now = (await one(c, 'SELECT clock_timestamp() AS now')).now;
    need(now < attempt.response_due_at, 'Đã hết hạn phản hồi', 409, 'RESPONSE_TIMEOUT');
    await c.query(
      'UPDATE assignments SET status=$2,note=$3,responded_at=clock_timestamp() WHERE id=$1',
      [attempt.id, v.decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED', v.note],
    );
    await c.query('UPDATE tasks SET status=$2,version=version+1,updated_at=now() WHERE id=$1', [
      t.id,
      v.decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED',
    ]);
    await event(c, a, t.id, 'ASSIGNMENT_' + v.decision, { note: v.note });
    await notify(
      c,
      t.created_by,
      `assignment-response:${attempt.id}`,
      'Người được giao đã phản hồi công việc',
      t.id,
    );
    return taskDetail(c, a, t.id);
  });
  api('POST', '/tasks/:id/start', async (c, a, b, q, p) => {
    const { t, owner } = await taskAccess(c, a, p.id, true);
    need(owner);
    version(t, b.expected_version);
    need(
      ['ACCEPTED', 'CHANGES_REQUESTED'].includes(t.status),
      'Không thể bắt đầu ở trạng thái này',
      409,
      'STATE',
    );
    await c.query(
      "UPDATE tasks SET status='IN_PROGRESS',started_at=coalesce(started_at,now()),version=version+1,updated_at=now() WHERE id=$1",
      [t.id],
    );
    await event(c, a, t.id, 'STARTED');
    return taskDetail(c, a, t.id);
  });
  api('POST', '/tasks/:id/updates', async (c, a, b, q, p) => {
    const { t, owner } = await taskAccess(c, a, p.id, true);
    need(owner);
    version(t, b.expected_version);
    need(
      ['IN_PROGRESS', 'ACCEPTED', 'CHANGES_REQUESTED'].includes(t.status),
      'Không thể cập nhật công việc đã nộp/đóng',
      409,
      'STATE',
    );
    const v = z
      .object({
        summary: z.string().max(20000),
        next_step: z.string().max(5000),
        blocker: z.string().max(5000),
      })
      .parse(b);
    await c.query(
      "UPDATE tasks SET next_step=$2,blocker=$3,started_at=coalesce(started_at,now()),status='IN_PROGRESS',version=version+1,updated_at=now() WHERE id=$1",
      [t.id, v.next_step, v.blocker],
    );
    await event(c, a, t.id, 'PROGRESS', v);
    return taskDetail(c, a, t.id);
  });
  api('PATCH', '/checkpoints/:id', async (c, a, b, q, p) => {
    const cp = await one(c, 'SELECT * FROM checkpoints WHERE id=$1 FOR UPDATE', [p.id]);
    need(cp, 'Không tìm thấy', 404, 'NOT_FOUND');
    const { t, owner } = await taskAccess(c, a, cp.task_id, true);
    need(owner);
    version(cp, b.expected_version);
    need(
      ['IN_PROGRESS', 'ACCEPTED', 'CHANGES_REQUESTED'].includes(t.status),
      'Không thể sửa mốc',
      409,
      'STATE',
    );
    const v = z
      .object({ state: z.enum(['OPEN', 'DONE']), evidence: z.string().max(5000) })
      .parse(b);
    await c.query('UPDATE checkpoints SET state=$2,evidence=$3,version=version+1 WHERE id=$1', [
      cp.id,
      v.state,
      v.evidence,
    ]);
    await event(c, a, t.id, 'CHECKPOINT', { id: cp.id, ...v });
    return { ok: true };
  });
  api('POST', '/tasks/:id/submissions', async (c, a, b, q, p) => {
    const { t, owner } = await taskAccess(c, a, p.id, true);
    need(owner);
    version(t, b.expected_version);
    need(
      ['IN_PROGRESS', 'ACCEPTED', 'CHANGES_REQUESTED'].includes(t.status),
      'Không thể nộp ở trạng thái này',
      409,
      'STATE',
    );
    const v = z
      .object({
        result_text: z.string().max(50000).default(''),
        payload: z.record(z.string(), z.unknown()).optional(),
        links: z.array(z.url()).max(50).default([]),
        artifact_refs: z.array(z.uuid()).max(100).default([]),
      })
      .parse(b);
    need(v.links.every(validURL), 'Chỉ dùng URL http/https', 422, 'VALIDATION');
    for (const id of v.artifact_refs) {
      const f = await one(c, 'SELECT id FROM assets WHERE id=$1 AND task_id=$2', [id, t.id]);
      need(f, 'Tệp chưa sẵn sàng hoặc khác task', 422, 'ASSET_NOT_READY');
    }
    const payload = validatePayload(t.type, v.payload || t.payload),
      tmpl = templates.find((x) => x.code === t.type) || templates[0];
    for (const f of tmpl.submission_rule.required || [])
      need(
        payload[f] !== undefined && payload[f] !== '' && payload[f] !== null,
        `Cần bổ sung ${f} khi nộp`,
        422,
        'VALIDATION',
      );
    const hasArtifact = v.artifact_refs.length || v.links.length;
    need(
      v.result_text.trim() || hasArtifact,
      'Cần kết quả văn bản hoặc tệp/link',
      422,
      'VALIDATION',
    );
    if (['EDIT', 'SHOOT', 'DESIGN'].includes(t.type))
      need(hasArtifact, 'Loại việc này cần tệp hoặc link đầu ra', 422, 'VALIDATION');
    if (t.type === 'PUBLISH')
      need(
        payload.publication_url || payload.platform_post_id,
        'Cần link hoặc ID bài đăng',
        422,
        'VALIDATION',
      );
    need(
      !(await one(
        c,
        "SELECT id FROM checkpoints WHERE task_id=$1 AND required AND state<>'DONE' LIMIT 1",
        [t.id],
      )),
      'Chưa hoàn tất mốc bắt buộc',
      422,
      'CHECKPOINT_REQUIRED',
    );
    const s = await one(
      c,
      'INSERT INTO submissions(task_id,revision,result_text,payload,links,due_at_at_submit) SELECT $1,coalesce(max(revision),0)+1,$2,$3,$4,$5 FROM submissions WHERE task_id=$1 RETURNING *',
      [
        t.id,
        v.result_text,
        JSON.stringify({ ...payload, artifact_refs: v.artifact_refs }),
        JSON.stringify(v.links),
        t.due_at,
      ],
    );
    await c.query(
      "UPDATE tasks SET status='SUBMITTED',payload=$2,result_text=$3,version=version+1,updated_at=now() WHERE id=$1",
      [t.id, JSON.stringify(payload), v.result_text],
    );
    await event(c, a, t.id, 'SUBMITTED', { submission_id: s.id, revision: s.revision });
    if (t.reviewer_id)
      await notify(c, t.reviewer_id, 'submission:' + s.id, 'Có công việc chờ duyệt', t.id);
    return taskDetail(c, a, t.id);
  });
  api('POST', '/submissions/:id/review', async (c, a, b, q, p) => {
    const s = await one(c, 'SELECT * FROM submissions WHERE id=$1', [p.id]);
    need(s, 'Không tìm thấy', 404, 'NOT_FOUND');
    const { t, manager } = await taskAccess(c, a, s.task_id, true);
    need(manager && t.reviewer_id === a.id && t.owner_id !== a.id);
    version(t, b.expected_task_version);
    need(t.status === 'SUBMITTED', 'Công việc không còn chờ duyệt', 409, 'STATE');
    const latest = await one(
      c,
      'SELECT id FROM submissions WHERE task_id=$1 ORDER BY revision DESC LIMIT 1',
      [t.id],
    );
    need(latest.id === s.id, 'Bản nộp đã có phiên bản mới', 409, 'STALE_SUBMISSION');
    const v = z
      .object({
        decision: z.enum(['APPROVE', 'CHANGES_REQUESTED']),
        feedback: z.string().max(20000).default(''),
      })
      .parse(b);
    need(
      v.decision !== 'CHANGES_REQUESTED' || v.feedback.trim(),
      'Cần ghi nội dung yêu cầu sửa',
      422,
      'VALIDATION',
    );
    await c.query(
      'INSERT INTO reviews(submission_id,actor_id,decision,feedback) VALUES($1,$2,$3,$4)',
      [s.id, a.id, v.decision, v.feedback],
    );
    await c.query(
      "UPDATE tasks SET status=$2,approved_submission_id=$3,completed_at=CASE WHEN $2='DONE' THEN now() END,timing=$4,version=version+1,updated_at=now() WHERE id=$1",
      [
        t.id,
        v.decision === 'APPROVE' ? 'DONE' : 'CHANGES_REQUESTED',
        v.decision === 'APPROVE' ? s.id : null,
        v.decision === 'APPROVE' ? (s.submitted_at <= t.due_at ? 'ON_TIME' : 'LATE') : null,
      ],
    );
    await event(c, a, t.id, 'REVIEW', v);
    await notify(c, t.owner_id, 'review:' + s.id, 'Công việc có kết quả phê duyệt', t.id);
    return taskDetail(c, a, t.id);
  });
  api('POST', '/tasks/:id/deadline-requests', async (c, a, b, q, p) => {
    const { t, owner } = await taskAccess(c, a, p.id, true);
    need(owner);
    version(t, b.expected_version);
    need(
      !['DONE', 'CANCELLED', 'DRAFT'].includes(t.status),
      'Không thể đề nghị đổi hạn',
      409,
      'STATE',
    );
    const v = z
      .object({
        new_due_at: z.iso.datetime({ offset: true }),
        reason: z.string().trim().min(1).max(5000),
      })
      .parse(b);
    const d = await one(
      c,
      'INSERT INTO deadline_requests(task_id,requested_by,new_due_at,old_due_at,reason) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [t.id, a.id, v.new_due_at, t.due_at, v.reason],
    );
    await event(c, a, t.id, 'DEADLINE_REQUEST', v);
    return d;
  });
  api('POST', '/deadline-requests/:id/decision', async (c, a, b, q, p) => {
    const d = await one(c, 'SELECT * FROM deadline_requests WHERE id=$1 FOR UPDATE', [p.id]);
    need(d, 'Không tìm thấy', 404, 'NOT_FOUND');
    const { t, manager } = await taskAccess(c, a, d.task_id, true);
    need(manager && t.reviewer_id === a.id && t.owner_id !== a.id);
    version(d, b.expected_version);
    version(t, b.expected_task_version);
    need(
      d.state === 'PENDING' && !['DONE', 'CANCELLED'].includes(t.status),
      'Yêu cầu đã kết thúc',
      409,
      'STATE',
    );
    need(
      (await setting(c, 'policies')).deadline_reviewer_approval,
      'Chưa chốt quyền đổi hạn Q03',
      422,
      'CONFIG_REQUIRED',
    );
    need(
      new Date(d.new_due_at) >= new Date(d.old_due_at),
      'Chưa bật đổi lùi hạn Q03',
      422,
      'CONFIG_REQUIRED',
    );
    const v = z.object({ decision: z.enum(['APPROVE', 'REJECT']) }).parse(b);
    await c.query(
      'UPDATE deadline_requests SET state=$2,decided_by=$3,decided_at=now(),version=version+1 WHERE id=$1',
      [d.id, v.decision, a.id],
    );
    if (v.decision === 'APPROVE')
      await c.query('UPDATE tasks SET due_at=$2,version=version+1,updated_at=now() WHERE id=$1', [
        t.id,
        d.new_due_at,
      ]);
    await event(c, a, t.id, 'DEADLINE_DECIDED', {
      ...v,
      old_due_at: d.old_due_at,
      new_due_at: d.new_due_at,
    });
    return taskDetail(c, a, t.id);
  });
  api('POST', '/tasks/:id/cancel', async (c, a, b, q, p) => {
    const { t, owner, manager } = await taskAccess(c, a, p.id, true);
    need(manager || (owner && t.created_by === a.id));
    version(t, b.expected_version);
    need(!['DONE', 'CANCELLED'].includes(t.status), 'Đã đóng', 409, 'STATE');
    need(typeof b.reason === 'string' && b.reason.trim(), 'Cần lý do hủy', 422, 'VALIDATION');
    await c.query(
      "UPDATE tasks SET status='CANCELLED',version=version+1,updated_at=now() WHERE id=$1",
      [t.id],
    );
    await c.query(
      "UPDATE assignments SET status='SUPERSEDED' WHERE task_id=$1 AND status='PENDING'",
      [t.id],
    );
    await event(c, a, t.id, 'CANCELLED', { reason: b.reason });
    return taskDetail(c, a, t.id);
  });
  api('POST', '/tasks/:id/transfer', async (c, a, b, q, p) => {
    const { t, manager } = await taskAccess(c, a, p.id, true);
    need(manager);
    version(t, b.expected_version);
    need(
      !['DONE', 'CANCELLED', 'SUBMITTED'].includes(t.status),
      'Không thể giao lại',
      409,
      'STATE',
    );
    const v = z
      .object({ owner_id: z.uuid(), role: z.string(), reason: z.string().trim().min(1) })
      .parse(b);
    const oa = await actor(c, v.owner_id);
    need(manages(a, { id: oa.id, team_id: oa.team_id }) && hasJob(oa, v.role));
    need(
      !(await one(c, 'SELECT id FROM supporters WHERE task_id=$1 AND user_id=$2', [t.id, oa.id])),
      'Người nhận đang là thành viên hỗ trợ',
      422,
      'VALIDATION',
    );
    await c.query(
      "UPDATE assignments SET status='SUPERSEDED' WHERE task_id=$1 AND status='PENDING'",
      [t.id],
    );
    await c.query('UPDATE owner_history SET to_at=now() WHERE task_id=$1 AND to_at IS NULL', [
      t.id,
    ]);
    await c.query('INSERT INTO owner_history(task_id,owner_id,role,reason) VALUES($1,$2,$3,$4)', [
      t.id,
      oa.id,
      v.role,
      v.reason,
    ]);
    await c.query(
      "UPDATE tasks SET owner_id=$2,role=$3,reviewer_id=$4,status='ASSIGNED',version=version+1,updated_at=now() WHERE id=$1",
      [t.id, oa.id, v.role, a.id],
    );
    await assign(c, { ...t, owner_id: oa.id, version: t.version + 1 });
    await event(c, a, t.id, 'TRANSFERRED', v);
    return taskDetail(c, a, t.id);
  });
  api('POST', '/tasks/:id/reopen', async (c, a, b, q, p) => {
    const { t, manager } = await taskAccess(c, a, p.id, true);
    need(manager && t.reviewer_id === a.id);
    version(t, b.expected_version);
    need((await setting(c, 'policies')).reopen_enabled, 'Chưa chốt Q14', 422, 'CONFIG_REQUIRED');
    need(
      t.status === 'DONE' && typeof b.reason === 'string' && b.reason.trim(),
      'Cần task đã xong và lý do mở lại',
      422,
      'VALIDATION',
    );
    await c.query(
      "UPDATE tasks SET status='IN_PROGRESS',timing=NULL,completed_at=NULL,approved_submission_id=NULL,version=version+1,updated_at=now() WHERE id=$1",
      [t.id],
    );
    await event(c, a, t.id, 'REOPENED', { reason: b.reason });
    return taskDetail(c, a, t.id);
  });
  api('POST', '/support-invitations/:id/response', async (c, a, b, q, p) => {
    const s = await one(c, 'SELECT * FROM supporters WHERE id=$1 FOR UPDATE', [p.id]);
    need(s && s.user_id === a.id && hasJob(a, s.role));
    version(s, b.expected_version);
    need(s.status === 'PENDING', 'Lời mời đã được phản hồi', 409, 'STATE');
    const t = await one(c, 'SELECT status,owner_id FROM tasks WHERE id=$1 FOR UPDATE', [s.task_id]);
    need(
      !['DONE', 'CANCELLED', 'DRAFT'].includes(t.status),
      'Công việc chưa giao hoặc đã đóng',
      409,
      'STATE',
    );
    const v = z
      .object({ decision: z.enum(['ACCEPT', 'DECLINE']), note: z.string().max(5000).default('') })
      .parse(b);
    const result = await one(
      c,
      'UPDATE supporters SET status=$2,note=$3,responded_at=now(),version=version+1 WHERE id=$1 RETURNING *',
      [s.id, v.decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED', v.note],
    );
    await event(c, a, s.task_id, 'SUPPORT_RESPONSE', { id: s.id, ...v });
    await notify(
      c,
      t.owner_id,
      'support-response:' + s.id,
      'Người hỗ trợ đã phản hồi lời mời',
      s.task_id,
    );
    return result;
  });
  api('PATCH', '/support-invitations/:id/contribution', async (c, a, b, q, p) => {
    const s = await one(c, 'SELECT * FROM supporters WHERE id=$1 FOR UPDATE', [p.id]);
    need(s && s.user_id === a.id && hasJob(a, s.role) && s.status === 'ACCEPTED');
    version(s, b.expected_version);
    const t = await one(c, 'SELECT status FROM tasks WHERE id=$1 FOR UPDATE', [s.task_id]);
    need(!['DONE', 'CANCELLED'].includes(t.status), 'Công việc đã đóng', 409, 'STATE');
    const v = z
      .object({
        summary: z.string().max(20000),
        next_step: z.string().max(5000),
        blocker: z.string().max(5000),
        reported_done: z.boolean(),
      })
      .parse(b);
    const result = await one(
      c,
      'UPDATE supporters SET summary=$2,next_step=$3,blocker=$4,contribution_state=$5,reported_done_at=CASE WHEN $6 THEN now() END,version=version+1 WHERE id=$1 RETURNING *',
      [
        s.id,
        v.summary,
        v.next_step,
        v.blocker,
        v.reported_done ? 'REPORTED_DONE' : 'IN_PROGRESS',
        v.reported_done,
      ],
    );
    await event(c, a, s.task_id, 'CONTRIBUTION', { id: s.id, ...v });
    return result;
  });
}
