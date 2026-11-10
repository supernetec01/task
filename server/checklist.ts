import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { type API } from './app.js';
import {
  type Actor,
  type DB,
  need,
  one,
  rows,
  isAdmin,
  hasJob,
  actor,
  version,
  event,
  hash,
  localDate,
} from './base.js';
import { teamWork, specialistJobs, resourceAccess } from './handoff-access.js';
import { taskAccess, taskDetail } from './tasks.js';

const instant = z.iso.datetime({ offset: true });
const reason = z.string().trim().min(1).max(5000);
const open = ['WAITING', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'CHANGES_REQUESTED'];
export async function createChecklist(c: DB, a: Actor, b: any) {
  const v = z
    .object({
      flow_mode: z.literal('CHECKLIST').default('CHECKLIST'),
      title: z.string().trim().min(1).max(255),
      description: z.string().max(50000).default(''),
      owner_id: z.uuid().default(a.id),
      job_code: z.enum(specialistJobs),
      due_at: instant,
      priority: z.enum(['NORMAL', 'URGENT']).default('NORMAL'),
      attachment_ids: z.array(z.uuid()).max(50).default([]),
      resource_id: z.uuid().optional(),
    })
    .strict()
    .parse(b);
  const oa = await actor(c, v.owner_id);
  need(hasJob(oa, v.job_code), 'Người phụ trách chưa có chuyên môn', 422, 'ROLE_REQUIRED');
  need(v.owner_id === a.id ? isAdmin(a) || hasJob(a, v.job_code) : teamWork(a));
  const resource = v.resource_id ? await resourceAccess(c, a, v.resource_id, true) : null;
  need(
    new Set(v.attachment_ids).size === v.attachment_ids.length,
    'Tệp đính kèm bị trùng',
    422,
    'VALIDATION',
  );
  const attachments = await rows(
    c,
    'SELECT * FROM staged_task_assets WHERE id=ANY($1::uuid[]) AND uploaded_by=$2 FOR UPDATE',
    [v.attachment_ids, a.id],
  );
  need(attachments.length === v.attachment_ids.length, 'Tệp chưa sẵn sàng', 422, 'ASSET_NOT_READY');
  const t = await one(
    c,
    `INSERT INTO tasks(flow_mode,title,description,owner_id,created_by,role,type,status,source,due_at,original_due_at,priority,company_id,resource_id) VALUES('CHECKLIST',$1,$2,$3,$4,$5,'OTHER','WAITING',$6,$7,$7,$8,$9,$10) RETURNING *`,
    [
      v.title,
      v.description,
      v.owner_id,
      a.id,
      v.job_code,
      a.id === v.owner_id ? 'EMPLOYEE_ADHOC' : 'MANAGER_ASSIGNED',
      v.due_at,
      v.priority,
      resource?.company_id || null,
      resource?.id || null,
    ],
  );
  await c.query('INSERT INTO owner_history(task_id,owner_id,role,reason) VALUES($1,$2,$3,$4)', [
    t.id,
    t.owner_id,
    t.role,
    'CREATED',
  ]);
  for (const f of attachments)
    await c.query(
      'INSERT INTO assets(id,task_id,uploaded_by,role,filename,storage_key,size,sha256,mime,shared) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,false)',
      [f.id, t.id, a.id, t.role, f.filename, f.storage_key, f.size, f.sha256, f.mime],
    );
  if (attachments.length)
    await c.query('DELETE FROM staged_task_assets WHERE id=ANY($1::uuid[])', [v.attachment_ids]);
  await checklistEvent(c, a, t, 'CREATED', { status: t.status });
  if (t.owner_id !== a.id)
    await c.query(
      `INSERT INTO outbox(user_id,event_key,message,object_id,object_type,event_type,action_path) VALUES($1,$2,'Bạn được giao công việc mới',$3,'TASK','TASK_ASSIGNED',$4) ON CONFLICT DO NOTHING`,
      [t.owner_id, `task:${t.id}:assigned:${t.version}`, t.id, `/tasks/${t.id}`],
    );
  return taskDetail(c, a, t.id);
}
export async function checklistEvent(
  c: DB,
  a: Actor,
  t: any,
  action: string,
  after: any,
  why = '',
) {
  await event(c, a, t.id, action, {
    event_version: 2,
    before: { status: t.status, owner_id: t.owner_id, due_at: t.due_at },
    after,
    owner_at_event: t.owner_id,
    job_at_event: t.role,
    due_snapshot: t.due_at,
    reason: why,
  });
}
export async function checklistAction(c: DB, a: Actor, t: any, action: string, b: any) {
  need(t.flow_mode === 'CHECKLIST', 'Chỉ áp dụng checklist', 422, 'FLOW_MODE');
  const common = { expected_version: z.number().int().positive(), reason };
  if (action === 'brief') {
    const v = z
      .object({
        expected_version: common.expected_version,
        title: z.string().trim().min(1).max(255),
        description: z.string().max(50000),
      })
      .strict()
      .parse(b);
    need(isAdmin(a) || (t.owner_id === a.id && hasJob(a, t.role)));
    version(t, v.expected_version);
    need(open.includes(t.status), 'Công việc đã đóng', 409, 'STATE');
    await c.query(
      'UPDATE tasks SET title=$2,description=$3,version=version+1,updated_at=now() WHERE id=$1',
      [t.id, v.title, v.description],
    );
    await checklistEvent(c, a, t, 'BRIEF_UPDATED', v);
  } else if (action === 'state') {
    const v = z
      .object({
        expected_version: common.expected_version,
        status: z.enum(['IN_PROGRESS', 'DONE']),
        summary: z.string().trim().max(50000),
      })
      .strict()
      .parse(b);
    need(isAdmin(a) || (t.owner_id === a.id && hasJob(a, t.role)));
    version(t, v.expected_version);
    need(open.includes(t.status), 'Công việc đã đóng', 409, 'STATE');
    need(
      v.status !== 'DONE' || !!v.summary,
      'Cần kết quả trước khi hoàn thành',
      422,
      'RESULT_REQUIRED',
    );
    if (!t.started_at)
      await checklistEvent(c, a, t, 'STARTED', { recorded_at_completion: v.status === 'DONE' });
    await c.query(
      `UPDATE tasks SET status=$2,result_text=$3,started_at=coalesce(started_at,now()),completed_at=CASE WHEN $2='DONE' THEN now() END,timing=CASE WHEN $2='DONE' THEN CASE WHEN now()<=due_at THEN 'ON_TIME' ELSE 'LATE' END END,version=version+1,updated_at=now() WHERE id=$1`,
      [t.id, v.status, v.summary],
    );
    await c.query('INSERT INTO task_updates(task_id,actor_id,summary) VALUES($1,$2,$3)', [
      t.id,
      a.id,
      v.summary,
    ]);
    await checklistEvent(c, a, t, v.status === 'DONE' ? 'COMPLETED' : 'PROGRESS_UPDATED', {
      status: v.status,
      summary: v.summary,
    });
  } else {
    const v = z
      .object({
        ...common,
        ...(action === 'deadline' ? { due_at: instant } : {}),
        ...(action === 'transfer' ? { owner_id: z.uuid() } : {}),
      })
      .strict()
      .parse(b);
    need(
      action === 'cancel' ? isAdmin(a) || (t.owner_id === a.id && hasJob(a, t.role)) : isAdmin(a),
    );
    version(t, v.expected_version);
    need(
      action === 'reopen' ? ['DONE', 'CANCELLED'].includes(t.status) : open.includes(t.status),
      'Trạng thái không phù hợp',
      409,
      'STATE',
    );
    if (action === 'cancel')
      await c.query(
        `UPDATE tasks SET status='CANCELLED',cancelled_at=now(),cancel_reason=$2,version=version+1,updated_at=now() WHERE id=$1`,
        [t.id, v.reason],
      );
    if (action === 'reopen')
      await c.query(
        `UPDATE tasks SET status='IN_PROGRESS',completed_at=NULL,timing=NULL,cancelled_at=NULL,cancel_reason=NULL,version=version+1,updated_at=now() WHERE id=$1`,
        [t.id],
      );
    if (action === 'deadline')
      await c.query('UPDATE tasks SET due_at=$2,version=version+1,updated_at=now() WHERE id=$1', [
        t.id,
        (v as any).due_at,
      ]);
    if (action === 'transfer') {
      const oa = await actor(c, (v as any).owner_id);
      need(hasJob(oa, t.role), 'Người nhận chưa có chuyên môn', 422, 'ROLE_REQUIRED');
      await c.query('UPDATE owner_history SET to_at=now() WHERE task_id=$1 AND to_at IS NULL', [
        t.id,
      ]);
      await c.query('INSERT INTO owner_history(task_id,owner_id,role,reason) VALUES($1,$2,$3,$4)', [
        t.id,
        oa.id,
        t.role,
        v.reason,
      ]);
      await c.query('UPDATE tasks SET owner_id=$2,version=version+1,updated_at=now() WHERE id=$1', [
        t.id,
        oa.id,
      ]);
    }
    await checklistEvent(
      c,
      a,
      t,
      {
        cancel: 'CANCELLED',
        reopen: 'REOPENED',
        deadline: 'DEADLINE_CHANGED',
        transfer: 'TRANSFERRED',
      }[action]!,
      v,
      v.reason,
    );
  }
  return taskDetail(c, a, t.id);
}

const groups = {
  OPEN: [...open, 'SUBMITTED'],
  DONE: ['DONE'],
  CANCELLED: ['CANCELLED'],
  ALL: [],
  LEGACY_DRAFT: ['DRAFT'],
  LEGACY_DECLINED: ['DECLINED'],
  CUSTOM: [],
} as const;
const statuses = [
  'WAITING',
  'DRAFT',
  'ASSIGNED',
  'ACCEPTED',
  'IN_PROGRESS',
  'SUBMITTED',
  'CHANGES_REQUESTED',
  'DONE',
  'DECLINED',
  'CANCELLED',
] as const;
const multi = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (v) => (v === undefined ? [] : Array.isArray(v) ? v : String(v).split(',').filter(Boolean)),
    z.array(schema),
  );
const query = z
  .object({
    scope: z.enum(['mine', 'team']).default('mine'),
    v2: z.string().optional(),
    q: z.string().trim().max(255).default(''),
    owner_ids: multi(z.uuid()),
    team_ids: multi(z.uuid()),
    job_codes: multi(z.string().max(40)),
    status_group: z
      .enum(['OPEN', 'DONE', 'CANCELLED', 'ALL', 'LEGACY_DRAFT', 'LEGACY_DECLINED', 'CUSTOM'])
      .default('OPEN'),
    statuses: multi(z.enum(statuses)),
    deadline_preset: z.enum(['OVERDUE', 'TODAY', 'NEXT_7_DAYS', 'NONE']).default('NONE'),
    due_from: instant.optional(),
    due_to: instant.optional(),
    created_from: z.iso.date().optional(),
    created_to: z.iso.date().optional(),
    completed_from: z.iso.date().optional(),
    completed_to: z.iso.date().optional(),
    priority: z.enum(['NORMAL', 'URGENT']).optional(),
    flow_mode: z.enum(['CHECKLIST', 'LEGACY_REVIEW', 'ALL']).default('ALL'),
    sort: z
      .enum(['ATTENTION', 'DUE_ASC', 'UPDATED_DESC', 'CREATED_DESC', 'COMPLETED_DESC'])
      .default('ATTENTION'),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    cursor: z.string().max(8000).optional(),
  })
  .strict();
function signature(body: string) {
  need(process.env.VAULT_KEY, 'Chưa cấu hình khóa ký cursor', 503, 'CONFIG_REQUIRED');
  return createHmac('sha256', process.env.VAULT_KEY!)
    .update('task-cursor-v1:' + body)
    .digest('base64url');
}
function unpack(s: string) {
  try {
    const [body, sig] = s.split('.');
    const expected = signature(body);
    need(
      sig?.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected)),
      'Cursor không hợp lệ',
      422,
      'INVALID_CURSOR',
    );
    const d = JSON.parse(Buffer.from(body, 'base64url').toString());
    return d;
  } catch {
    need(false, 'Cursor không hợp lệ', 422, 'INVALID_CURSOR');
  }
}
export async function checklistList(c: DB, a: Actor, input: any, now = new Date()) {
  const v = query.parse(input),
    team = v.scope === 'team';
  need(!team || teamWork(a));
  need(
    team || (!v.team_ids.length && v.owner_ids.every((id) => id === a.id)),
    'Chỉ được lọc công việc của mình',
    403,
    'FORBIDDEN',
  );
  const selected = v.statuses.length ? v.statuses : [...groups[v.status_group]];
  need(
    v.sort !== 'COMPLETED_DESC' || (selected.length === 1 && selected[0] === 'DONE'),
    'Chỉ sắp hoàn thành khi lọc DONE',
    422,
    'VALIDATION',
  );
  need(
    !(v.completed_from || v.completed_to) || (selected.length === 1 && selected[0] === 'DONE'),
    'Lọc ngày hoàn thành cần DONE',
    422,
    'VALIDATION',
  );
  const normalized = {
    ...v,
    cursor: undefined,
    owner_ids: [...v.owner_ids].sort(),
    team_ids: [...v.team_ids].sort(),
    job_codes: [...v.job_codes].sort(),
    statuses: [...selected].sort(),
  };
  const queryHash = hash(
    JSON.stringify([normalized, a.id, a.permission_version, a.grants.map((g) => g.id).sort()]),
  );
  const cursor = v.cursor ? unpack(v.cursor) : null;
  need(
    !cursor || (cursor.version === 1 && cursor.query_hash === queryHash),
    'Bộ lọc hoặc quyền đã thay đổi; tải từ đầu',
    422,
    'CURSOR_QUERY_CHANGED',
  );
  const asOf = cursor?.as_of || now.toISOString();
  need(z.iso.datetime().safeParse(asOf).success, 'Cursor không hợp lệ', 422, 'INVALID_CURSOR');
  const day = localDate(new Date(asOf));
  const midnight = new Date(day + 'T00:00:00+07:00').getTime();
  const args: any[] = [];
  const arg = (x: any) => {
    args.push(x);
    return '$' + args.length;
  };
  const base = [
    team
      ? 'true'
      : `t.owner_id=${arg(a.id)} AND EXISTS(SELECT 1 FROM grants g WHERE g.user_id=t.owner_id AND g.kind='JOB' AND g.role=t.role AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_to IS NULL OR g.valid_to>now()))`,
  ];
  if (v.q) {
    const p = arg('%' + v.q.replace(/[\\%_]/g, '\\$&') + '%');
    base.push(`(t.title ILIKE ${p} OR t.code::text ILIKE ${p} OR u.name ILIKE ${p})`);
  }
  for (const [vals, sql] of [
    [v.owner_ids, 't.owner_id'],
    [v.team_ids, 'u.team_id'],
    [v.job_codes, 't.role'],
  ] as [string[], string][])
    if (vals.length) base.push(`${sql}=ANY(${arg(vals)})`);
  if (v.priority) base.push(`t.priority=${arg(v.priority)}`);
  if (v.flow_mode !== 'ALL') base.push(`t.flow_mode=${arg(v.flow_mode)}`);
  const active = `t.status IN ('WAITING','ASSIGNED','ACCEPTED','IN_PROGRESS','CHANGES_REQUESTED')`;
  if (v.deadline_preset !== 'NONE') {
    base.push(active);
    if (v.deadline_preset === 'OVERDUE') base.push(`t.due_at<${arg(asOf)}::timestamptz`);
    else
      base.push(
        `t.due_at>=${arg(new Date(midnight + (v.deadline_preset === 'TODAY' ? 0 : 86400e3)).toISOString())}::timestamptz AND t.due_at<${arg(new Date(midnight + (v.deadline_preset === 'TODAY' ? 1 : 8) * 86400e3).toISOString())}::timestamptz`,
      );
  }
  for (const [key, column, end, date] of [
    ['due_from', 'due_at', false, false],
    ['due_to', 'due_at', true, false],
    ['created_from', 'created_at', false, true],
    ['created_to', 'created_at', true, true],
    ['completed_from', 'completed_at', false, true],
    ['completed_to', 'completed_at', true, true],
  ] as const) {
    const value = v[key];
    if (value) {
      const d = date
        ? new Date(
            new Date(value + 'T00:00:00+07:00').getTime() + (end ? 86400e3 : 0),
          ).toISOString()
        : value;
      base.push(`t.${column}${end ? '<' : '>='}${arg(d)}::timestamptz`);
    }
  }
  const from =
    ' FROM tasks t JOIN users u ON u.id=t.owner_id LEFT JOIN submissions s ON s.id=t.approved_submission_id ';
  const facetRows = await rows(
    c,
    `SELECT t.status,count(*)::int AS count ${from} WHERE ${base.join(' AND ')} GROUP BY t.status`,
    args,
  );
  const facets = Object.fromEntries(facetRows.map((r) => [r.status, r.count]));
  if (selected.length) base.push(`t.status=ANY(${arg(selected)})`);
  const total = await one(
    c,
    `SELECT count(*)::int AS total ${from} WHERE ${base.join(' AND ')}`,
    args,
  );
  const anchor = v.sort === 'ATTENTION' ? arg(asOf) : 'NULL',
    tomorrow = v.sort === 'ATTENTION' ? arg(new Date(midnight + 86400e3).toISOString()) : 'NULL',
    day4 = v.sort === 'ATTENTION' ? arg(new Date(midnight + 4 * 86400e3).toISOString()) : 'NULL';
  const bucket = `CASE WHEN t.status='SUBMITTED' AND t.flow_mode='LEGACY_REVIEW' THEN 5 WHEN ${active} AND t.due_at<${anchor}::timestamptz THEN 0 WHEN ${active} AND t.due_at<${tomorrow}::timestamptz THEN 1 WHEN ${active} AND t.due_at<${day4}::timestamptz THEN 2 WHEN ${active} AND t.due_at IS NOT NULL THEN 3 WHEN ${active} THEN 4 WHEN t.status='DONE' THEN 6 WHEN t.status='CANCELLED' THEN 7 ELSE 8 END`;
  const epoch = (col: string, fallback = '0') =>
    `coalesce(extract(epoch FROM ${col})::numeric,${fallback})`;
  const keys =
    v.sort === 'ATTENTION'
      ? [
          bucket,
          `CASE WHEN (${bucket})<4 AND t.priority='URGENT' THEN 0 ELSE 1 END`,
          `CASE WHEN (${bucket})<4 THEN ${epoch('t.due_at')} WHEN (${bucket})=5 THEN coalesce((SELECT extract(epoch FROM max(submitted_at)) FROM submissions WHERE task_id=t.id),0) WHEN (${bucket})=6 THEN -${epoch('t.completed_at')} WHEN (${bucket})=7 THEN -${epoch('t.cancelled_at')} ELSE -${epoch('t.updated_at')} END`,
          `CASE WHEN (${bucket})<4 THEN -${epoch('t.created_at')} ELSE 0 END`,
        ]
      : [
          v.sort === 'DUE_ASC'
            ? epoch('t.due_at', '253402300799')
            : '-' +
              epoch(
                't.' +
                  (
                    {
                      UPDATED_DESC: 'updated_at',
                      CREATED_DESC: 'created_at',
                      COMPLETED_DESC: 'completed_at',
                    } as any
                  )[v.sort],
              ),
        ];
  // All numeric keys are normalized to ascending order; id is the stable tie-breaker.
  const keyColumns = keys.map((e, i) => `${e} AS k${i}`).join(',');
  let after = '';
  if (cursor) {
    need(
      Array.isArray(cursor.keys) &&
        cursor.keys.length === keys.length &&
        z.uuid().safeParse(cursor.id).success,
      'Cursor không hợp lệ',
      422,
      'INVALID_CURSOR',
    );
    after = `WHERE (${keys.map((_, i) => 'k' + i).join(',')},id)>(${cursor.keys
      .map(
        (x: any) =>
          arg(
            z
              .string()
              .regex(/^-?\d+(\.\d+)?$/)
              .parse(x),
          ) + '::numeric',
      )
      .join(',')},${arg(cursor.id)}::uuid)`;
  }
  const result = await rows(
    c,
    `WITH ranked AS(SELECT t.*,u.name AS owner_name,${keyColumns} ${from} WHERE ${base.join(' AND ')}) SELECT * FROM ranked ${after} ORDER BY ${keys.map((_, i) => 'k' + i + ' ASC').join(',')},id ASC LIMIT ${arg(v.limit + 1)}`,
    args,
  );
  const items = result.slice(0, v.limit).map((r) => {
    const clean = { ...r };
    for (let i = 0; i < keys.length; i++) delete clean['k' + i];
    return clean;
  });
  const last = result[v.limit - 1];
  const body =
    result.length > v.limit
      ? Buffer.from(
          JSON.stringify({
            version: 1,
            query_hash: queryHash,
            as_of: asOf,
            keys: keys.map((_, i) => String(last['k' + i])),
            id: last.id,
          }),
        ).toString('base64url')
      : null;
  return {
    items,
    next_cursor: body ? body + '.' + signature(body) : null,
    as_of: asOf,
    filtered_total: total.total,
    facets,
    query_hash: queryHash,
    summary: {
      total: total.total,
      status_counts: facets,
      done: facets.DONE || 0,
      open: open.reduce((n, s) => n + (facets[s] || 0), 0),
    },
  };
}
export function checklistRoutes(api: API) {
  api('GET', '/work-overview', async (c, a) => {
    const staff = await rows(
      c,
      `SELECT u.id,u.name,u.team_id,count(t.id)::int AS total,count(t.id) FILTER(WHERE t.status='WAITING')::int AS waiting,count(t.id) FILTER(WHERE t.status IN ('ASSIGNED','ACCEPTED','IN_PROGRESS','CHANGES_REQUESTED'))::int AS doing,count(t.id) FILTER(WHERE t.status='SUBMITTED')::int AS awaiting_review,count(t.id) FILTER(WHERE t.status='DONE')::int AS done,min(t.due_at) FILTER(WHERE t.status IN ('WAITING','ASSIGNED','ACCEPTED','IN_PROGRESS','CHANGES_REQUESTED')) AS nearest_due,max(t.updated_at) AS updated_at FROM users u LEFT JOIN tasks t ON t.owner_id=u.id AND t.status NOT IN ('DRAFT','DECLINED','CANCELLED') WHERE u.active AND ($2 OR u.id=$1) AND EXISTS(SELECT 1 FROM grants g WHERE g.user_id=u.id AND g.kind='JOB' AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_to IS NULL OR g.valid_to>now())) GROUP BY u.id ORDER BY u.name,u.id`,
      [a.id, teamWork(a)],
    );
    const local = new Date(Date.now() + 7 * 3600e3);
    local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7) - 7);
    const period = local.toISOString().slice(0, 10);
    const reports = await rows(
      c,
      `SELECT u.id,u.name,latest.id AS revision_id,latest.revision,latest.created_at FROM users u LEFT JOIN LATERAL(SELECT v.* FROM reports r JOIN report_revisions v ON v.report_id=r.id WHERE r.user_id=u.id AND r.period=$3 ORDER BY v.revision DESC LIMIT 1) latest ON true WHERE u.active AND ($2 OR u.id=$1) AND EXISTS(SELECT 1 FROM grants g WHERE g.user_id=u.id AND g.kind='JOB' AND g.role IN ('CONTENT','HR','MARKETPLACE') AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_to IS NULL OR g.valid_to>now())) ORDER BY u.name,u.id LIMIT 100`,
      [a.id, teamWork(a), period],
    );
    return {
      staff_progress: staff.slice(0, 100),
      staff_total: staff.length,
      report_period: period,
      report_submission: reports,
    };
  });
  api('POST', '/tasks/:id/state', async (c, a, b, q, p) => {
    const { t } = await taskAccess(c, a, p.id, true);
    return checklistAction(c, a, t, 'state', b);
  });
  api('POST', '/tasks/:id/deadline', async (c, a, b, q, p) => {
    const { t } = await taskAccess(c, a, p.id, true);
    return checklistAction(c, a, t, 'deadline', b);
  });
}
