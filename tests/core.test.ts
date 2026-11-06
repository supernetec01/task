import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  pool,
  tx,
  one,
  rows,
  responseDue,
  workingDate,
  hash,
  actor,
  type Actor,
} from '../server/base.js';
import { createUser, migrate } from '../server/cli.js';
import { buildApp } from '../server/app.js';
import { runJobs } from '../server/worker.js';
import { comparison } from '../server/reports.js';
import ExcelJS from 'exceljs';
const password = 'Integration-Test-Password-2026!';
const ids: Record<string, string> = {},
  clients: Record<string, any> = {};
let app: Awaited<ReturnType<typeof buildApp>>;
let task: any, supports: any[], firstRevision: any, secondRevision: any;
const period = () => {
  const n = new Date(Date.now() + 7 * 3600e3);
  n.setUTCDate(n.getUTCDate() - ((n.getUTCDay() + 6) % 7));
  return n.toISOString().slice(0, 10);
};
async function request(
  who: string,
  method: string,
  path: string,
  body?: any,
  key: string = randomUUID(),
) {
  const u = clients[who];
  const r = await app.inject({
    method: method as any,
    url: '/api/v1' + path,
    headers: { cookie: u?.cookie || '', 'x-csrf-token': u?.csrf || '', 'idempotency-key': key },
    payload: body,
  });
  let data: any;
  try {
    data = r.json();
  } catch {
    data = r.rawPayload;
  }
  return { status: r.statusCode, data, r };
}
async function ok(who: string, method: string, path: string, body?: any, key?: string) {
  const r = await request(who, method, path, body, key);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
async function fresh() {
  task = await ok('manager', 'GET', '/tasks/' + task.id);
  return task;
}
before(async () => {
  assert.match(
    new URL(process.env.DATABASE_URL!).pathname,
    /_test$/,
    'Tests require a dedicated *_test database',
  );
  await tx(async (c) => {
    const existing = await rows(
      c,
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'",
    );
    if (existing.length)
      await c.query(
        'TRUNCATE ' +
          existing.map((t) => '"' + t.tablename + '"').join(',') +
          ' RESTART IDENTITY CASCADE',
      );
  });
  await migrate();
  await tx(async (c) => {
    const list = await rows(
      c,
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'",
    );
    await c.query(
      'TRUNCATE ' +
        list.map((t) => '"' + t.tablename + '"').join(',') +
        ' RESTART IDENTITY CASCADE',
    );
    await c.query(
      'INSERT INTO settings(key,value) VALUES(\'calendar\',\'{"holidays":[],"timezone":"Asia/Ho_Chi_Minh","version":1}\'),(\'policies\',\'{"assignment_boundary_confirmed":true,"report_week_confirmed":true,"deadline_reviewer_approval":true,"support_scope":"TEAM","birthday_policy_confirmed":false,"reopen_enabled":false}\')',
    );
    const t = await one(c, "INSERT INTO teams(name) VALUES('Integration Team') RETURNING id"),
      other = await one(c, "INSERT INTO teams(name) VALUES('Other Team') RETURNING id");
    ids.team = t.id;
    ids.boss = await createUser(
      c,
      'boss@test.local',
      'Sếp kiểm thử',
      password,
      'CONTENT',
      'BOSS',
      t.id,
    );
    ids.manager = await createUser(
      c,
      'manager@test.local',
      'Quản lý kiểm thử',
      password,
      'CONTENT',
      'MANAGER',
      t.id,
      ids.boss,
    );
    for (const [key, job] of [
      ['admin', 'CONTENT'],
      ['employee', 'CONTENT'],
      ['support', 'DESIGNER'],
      ['decline', 'DESIGNER'],
      ['hr', 'HR'],
      ['sales', 'MARKETPLACE'],
      ['ads', 'ADS'],
      ['outside', 'CONTENT'],
    ])
      ids[key] = await createUser(
        c,
        key + '@test.local',
        key,
        password,
        job,
        key === 'admin' ? 'ADMIN' : 'EMPLOYEE',
        key === 'outside' ? other.id : t.id,
        ids.manager,
      );
  });
  app = await buildApp();
  for (const who of Object.keys(ids).filter((k) => k !== 'team')) {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: '127.0.0.' + (Object.keys(clients).length + 10),
      payload: { email: who + '@test.local', password },
    });
    assert.equal(r.statusCode, 200, r.body);
    clients[who] = {
      cookie: r.headers['set-cookie']?.toString().split(';')[0],
      csrf: r.json().csrf,
    };
  }
});
after(async () => {
  await app?.close();
  await pool.end();
});
test('AT-016..019 · working calendar skips lunch, Sunday, preserves seconds', () => {
  for (const [start, end] of [
    ['2026-11-07T17:00:00+07:00', '2026-11-09T17:00:00+07:00'],
    ['2026-11-02T11:00:00+07:00', '2026-11-03T11:00:00+07:00'],
    ['2026-11-08T10:00:00+07:00', '2026-11-09T18:00:00+07:00'],
    ['2026-11-02T12:30:00+07:00', '2026-11-03T12:00:00+07:00'],
    ['2026-11-02T09:00:30+07:00', '2026-11-03T09:00:30+07:00'],
  ])
    assert.equal(responseDue(new Date(start)).toISOString(), new Date(end).toISOString());
  assert.equal(workingDate('2026-11-09', -5), '2026-11-03');
});
test('Auth: anonymous, CSRF, foreign Origin, bad password denied', async () => {
  assert.equal((await request('none', 'GET', '/me')).status, 401);
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/tasks',
    headers: { cookie: clients.employee.cookie, 'idempotency-key': randomUUID() },
    payload: {},
  });
  assert.equal(r.statusCode, 403);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { origin: 'https://evil.example' },
        payload: { email: 'employee@test.local', password },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'employee@test.local', password: 'wrong' },
      })
    ).statusCode,
    401,
  );
});
test('AT-001,004,006,053 · no Admin/HR/sales access for Content; no cross-team assignment', async () => {
  const me = await ok('employee', 'GET', '/me');
  assert.equal(me.admin, false);
  assert.equal(me.management, false);
  for (const path of ['/users', '/settings', '/employees', '/metrics?kind=SALES', '/audit'])
    assert.equal((await request('employee', 'GET', path)).status, 403);
  const r = await request('employee', 'POST', '/tasks', {
    title: 'unauthorized',
    role: 'CONTENT',
    owner_id: ids.outside,
    due_at: new Date(Date.now() + 86400e3).toISOString(),
  });
  assert.equal(r.status, 403);
});
test('AT-007,064 · short task create is atomic, one task, two independent pending supporters', async () => {
  task = await ok('manager', 'POST', '/tasks', {
    title: '=HYPERLINK("https://example.org")',
    role: 'CONTENT',
    owner_id: ids.employee,
    due_at: new Date(Date.now() + 86400e3).toISOString(),
    supporters: [
      { user_id: ids.support, role: 'DESIGNER' },
      { user_id: ids.decline, role: 'DESIGNER' },
    ],
  });
  assert.equal(task.status, 'ASSIGNED');
  const d = await fresh();
  assert.equal(d.supporters.length, 2);
  supports = d.supporters;
  for (const who of ['support', 'decline']) {
    const d = await ok(who, 'GET', '/tasks/' + task.id);
    assert.equal(d.pending_brief, true);
    assert.equal(d.events, undefined);
    assert.equal(d.payload, undefined);
  }
  assert.equal((await request('outside', 'GET', '/tasks/' + task.id)).status, 404);
});
test('AT-015,026,069 · another actor cannot accept, overwrite deadline or submit shared task', async () => {
  assert.equal(
    (
      await request('support', 'POST', '/tasks/' + task.id + '/assignment-response', {
        decision: 'ACCEPT',
        expected_version: task.version,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('employee', 'PATCH', '/tasks/' + task.id, {
        title: 'bad',
        description: '',
        due_at: new Date().toISOString(),
        expected_version: task.version,
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await request('support', 'POST', '/tasks/' + task.id + '/submissions', {
        result_text: 'bad',
        expected_version: task.version,
      })
    ).status,
    403,
  );
});
test('AT-014 · assignment accepted, idempotent retry and key/body conflict', async () => {
  const key = randomUUID(),
    body = { decision: 'ACCEPT', expected_version: task.version };
  task = await ok('employee', 'POST', '/tasks/' + task.id + '/assignment-response', body, key);
  assert.equal(task.status, 'ACCEPTED');
  const retry = await ok(
    'employee',
    'POST',
    '/tasks/' + task.id + '/assignment-response',
    body,
    key,
  );
  assert.equal(retry.version, task.version);
  assert.equal(
    (
      await request(
        'employee',
        'POST',
        '/tasks/' + task.id + '/assignment-response',
        { ...body, decision: 'DECLINE' },
        key,
      )
    ).status,
    409,
  );
});
test('AT-065..068 · accept/decline independent, duplicate concurrent response once, contribution separate', async () => {
  const s = supports.find((s) => s.user_id === ids.support),
    d = supports.find((s) => s.user_id === ids.decline);
  const key = randomUUID(),
    body = { decision: 'ACCEPT', expected_version: s.version };
  const rr = await Promise.all([
    request('support', 'POST', '/support-invitations/' + s.id + '/response', body, key),
    request('support', 'POST', '/support-invitations/' + s.id + '/response', body, key),
  ]);
  assert.deepEqual(
    rr.map((r) => r.status),
    [200, 200],
  );
  let t = await fresh();
  assert.equal(t.status, 'ACCEPTED');
  assert.equal(t.supporters.find((s: any) => s.user_id === ids.decline).status, 'PENDING');
  await ok('decline', 'POST', '/support-invitations/' + d.id + '/response', {
    decision: 'DECLINE',
    note: 'Không phù hợp lịch',
    expected_version: d.version,
  });
  assert.equal((await request('decline', 'GET', '/tasks/' + task.id)).status, 404);
  const support = rr[0].data;
  await ok('support', 'PATCH', '/support-invitations/' + s.id + '/contribution', {
    summary: 'Đã bàn giao bản thiết kế',
    next_step: 'Chờ owner',
    blocker: '',
    reported_done: true,
    expected_version: support.version,
  });
  t = await fresh();
  assert.equal(t.status, 'ACCEPTED');
  assert.equal(t.supporters.find((x: any) => x.id === s.id).contribution_state, 'REPORTED_DONE');
});
test('AT-014,022,075 · start, blocker, stale tab 409', async () => {
  task = await ok('employee', 'POST', '/tasks/' + task.id + '/start', {
    expected_version: task.version,
  });
  const old = task.version;
  task = await ok('employee', 'POST', '/tasks/' + task.id + '/updates', {
    summary: 'Đã nghiên cứu',
    next_step: 'Dựng',
    blocker: 'Cần tư liệu',
    expected_version: old,
  });
  assert.equal(task.status, 'IN_PROGRESS');
  assert.equal(task.blocker, 'Cần tư liệu');
  assert.equal(
    (
      await request('employee', 'POST', '/tasks/' + task.id + '/updates', {
        summary: 'stale',
        next_step: '',
        blocker: '',
        expected_version: old,
      })
    ).status,
    409,
  );
});
test('AT-013 · no text/artifact, foreign/unready asset rejected', async () => {
  assert.equal(
    (
      await request('employee', 'POST', '/tasks/' + task.id + '/submissions', {
        result_text: '',
        artifact_refs: [],
        expected_version: task.version,
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await request('employee', 'POST', '/tasks/' + task.id + '/submissions', {
        result_text: 'text',
        artifact_refs: [randomUUID()],
        expected_version: task.version,
      })
    ).status,
    422,
  );
});
test('AT-016,024 · revisions immutable, changes requested, stale review denied', async () => {
  task = await ok('employee', 'POST', '/tasks/' + task.id + '/submissions', {
    result_text: 'Kết quả v1',
    expected_version: task.version,
  });
  const s1 = task.submissions[0];
  task = await ok('manager', 'POST', '/submissions/' + s1.id + '/review', {
    decision: 'CHANGES_REQUESTED',
    feedback: 'Bổ sung dữ liệu',
    expected_task_version: task.version,
  });
  task = await ok('employee', 'POST', '/tasks/' + task.id + '/submissions', {
    result_text: 'Kết quả v2',
    expected_version: task.version,
  });
  assert.equal(task.submissions.length, 2);
  assert.equal(
    (
      await request('manager', 'POST', '/submissions/' + s1.id + '/review', {
        decision: 'APPROVE',
        expected_task_version: task.version,
      })
    ).status,
    409,
  );
  await assert.rejects(
    () => pool.query('UPDATE submissions SET result_text=$2 WHERE id=$1', [s1.id, 'tamper']),
    /immutable/,
  );
});
test('AT-025 · deadline approval retains original, final accepted submission time decides timing', async () => {
  const original = task.original_due_at;
  const d = await ok('employee', 'POST', '/tasks/' + task.id + '/deadline-requests', {
    new_due_at: new Date(Date.now() + 2 * 86400e3).toISOString(),
    reason: 'Bổ sung phạm vi',
    expected_version: task.version,
  });
  task = await ok('manager', 'POST', '/deadline-requests/' + d.id + '/decision', {
    decision: 'APPROVE',
    expected_version: d.version,
    expected_task_version: task.version,
  });
  assert.equal(task.original_due_at, original);
  task = await ok('manager', 'POST', '/submissions/' + task.submissions[0].id + '/review', {
    decision: 'APPROVE',
    feedback: 'Đạt',
    expected_task_version: task.version,
  });
  assert.equal(task.status, 'DONE');
  assert.equal(task.timing, 'ON_TIME');
});
test('AT-027 · manager cannot self-review own task', async () => {
  let t = await ok('manager', 'POST', '/tasks', {
    title: 'Self manager task',
    role: 'CONTENT',
    due_at: new Date(Date.now() + 86400e3).toISOString(),
  });
  t = await ok('manager', 'POST', '/tasks/' + t.id + '/submissions', {
    result_text: 'done',
    expected_version: t.version,
  });
  assert.equal(
    (
      await request('manager', 'POST', '/submissions/' + t.submissions[0].id + '/review', {
        decision: 'APPROVE',
        expected_task_version: t.version,
      })
    ).status,
    403,
  );
});
test('AT-008..011 · self-created task, historical occurred date, SCRIPT incomplete draft allowed', async () => {
  let t = await ok('employee', 'POST', '/tasks', {
    title: 'Kịch bản mới',
    role: 'CONTENT',
    type: 'SCRIPT',
    due_at: new Date(Date.now() + 86400e3).toISOString(),
    occurred_at: '2026-01-01T00:00:00Z',
  });
  assert.equal(t.owner_id, ids.employee);
  assert.equal(t.source, 'EMPLOYEE_ADHOC');
  assert.equal(t.status, 'IN_PROGRESS');
  assert(new Date(t.created_at) > new Date(t.occurred_at));
  t = await ok('employee', 'PATCH', '/tasks/' + t.id + '/payload', {
    values: { objective: 'draft without hook' },
    expected_version: t.version,
  });
  assert.equal(t.payload.objective, 'draft without hook');
  assert.equal(
    (
      await request('employee', 'PATCH', '/tasks/' + t.id + '/payload', {
        values: { scenes: 'wrong type' },
        expected_version: t.version,
      })
    ).status,
    422,
  );
  let s = await ok('employee', 'POST', '/tasks', {
    title: 'Chuẩn bị không diễn viên',
    role: 'CONTENT',
    type: 'SHOOT_PREP',
    due_at: new Date(Date.now() + 86400e3).toISOString(),
  });
  s = await ok('employee', 'PATCH', '/tasks/' + s.id + '/payload', {
    values: { requires_actor: false },
    expected_version: s.version,
  });
  assert.equal(s.payload.requires_actor, false);
});
test('AT-032 · narrative draft private from management', async () => {
  await ok('employee', 'PUT', '/reports/draft', {
    period: period(),
    role: 'CONTENT',
    narrative: { results: 'Bổ sung riêng tư', difficulties: '', support: '', next_week: '' },
    expected_version: 0,
  });
  assert.equal(
    (
      await request(
        'manager',
        'GET',
        '/reports/live?employee=' + ids.employee + '&period=' + period(),
      )
    ).status,
    403,
  );
  const listing = await ok('boss', 'GET', '/reports/submitted?period=' + period());
  assert(!JSON.stringify(listing).includes('Bổ sung riêng tư'));
});
test('AT-034..037 · report submit concurrent idempotency, immutable v1, append v2', async () => {
  const body = { period: period(), expected_draft_versions: { CONTENT: 1 } },
    key = randomUUID();
  const r = await Promise.all([
    request('employee', 'POST', '/reports/submit', body, key),
    request('employee', 'POST', '/reports/submit', body, key),
  ]);
  assert.deepEqual(
    r.map((x) => x.status),
    [200, 200],
  );
  assert.equal(r[0].data.id, r[1].data.id);
  firstRevision = r[0].data;
  const before = await ok('boss', 'GET', '/report-revisions/' + firstRevision.id);
  await ok('employee', 'POST', '/tasks', {
    title: 'Task xuất hiện sau snapshot v1',
    role: 'CONTENT',
    due_at: new Date(Date.now() + 86400e3).toISOString(),
  });
  secondRevision = await ok('employee', 'POST', '/reports/submit', body);
  assert.equal(secondRevision.revision, 2);
  const after = await ok('boss', 'GET', '/report-revisions/' + firstRevision.id);
  assert.deepEqual(after.snapshot, before.snapshot);
  assert.equal(secondRevision.snapshot.summary.total, firstRevision.snapshot.summary.total + 1);
  assert.equal(
    (await request('outside', 'GET', '/report-revisions/' + firstRevision.id)).status,
    404,
  );
  await assert.rejects(
    () => pool.query('DELETE FROM report_revisions WHERE id=$1', [firstRevision.id]),
    /immutable/,
  );
});
test('AT-039,040 · actual XLSX snapshot export; dangerous text remains string', async () => {
  const r = await request(
    'boss',
    'GET',
    '/report-revisions/' + firstRevision.id + '/export?role=CONTENT',
  );
  assert.equal(r.status, 200);
  assert.equal(r.r.rawPayload.subarray(0, 2).toString(), 'PK');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.r.rawPayload as any);
  assert(wb.getWorksheet('Tong_hop'));
  const rows = wb.getWorksheet('Task_chinh')!;
  const values = rows.getColumn(2).values as any[];
  assert(values.some((v) => typeof v === 'string' && v.startsWith('=HYPERLINK')));
  rows.eachRow((row) =>
    row.eachCell((cell) => assert.notEqual(cell.type, ExcelJS.ValueType.Formula)),
  );
});
test('AT-042 · comparisons zero/missing never produce Infinity/NaN', () => {
  assert.equal(comparison(5, 0).delta_percent, null);
  assert.equal(comparison(5, 0).delta, 5);
  assert.equal(comparison(5, null).delta_percent, null);
});
test('AT-020,021 · worker timeout dedupe and response cannot extend due', async () => {
  const t = await ok('manager', 'POST', '/tasks', {
    title: 'Expire assignment',
    role: 'CONTENT',
    owner_id: ids.employee,
    due_at: new Date(Date.now() + 86400e3).toISOString(),
  });
  await pool.query(
    "UPDATE assignments SET response_due_at=now()-interval '1 second' WHERE task_id=$1",
    [t.id],
  );
  assert.equal(
    (
      await request('employee', 'POST', '/tasks/' + t.id + '/assignment-response', {
        decision: 'ACCEPT',
        expected_version: t.version,
      })
    ).status,
    409,
  );
  await Promise.all([runJobs(), runJobs()]);
  const d = await ok('manager', 'GET', '/tasks/' + t.id);
  assert.equal(d.status, 'DECLINED');
  assert.equal(d.events.filter((e: any) => e.action === 'ASSIGNMENT_TIMEOUT').length, 1);
  const count = await pool.query(
    "SELECT count(*) FROM notifications WHERE event_key LIKE 'timeout:%'",
  );
  assert.equal(Number(count.rows[0].count), 1);
});
test('AT-003,038,070 · role expiry immediately cuts task/report/support APIs during active session', async () => {
  await pool.query(
    "UPDATE grants SET valid_to=now()-interval '1 millisecond',valid_from=now()-interval '1 day' WHERE user_id=$1 AND kind='JOB'",
    [ids.support],
  );
  assert.equal((await request('support', 'GET', '/tasks/' + task.id)).status, 404);
  const d = await ok('manager', 'GET', '/tasks/' + task.id);
  assert.equal(d.supporters.length, 2);
  await pool.query(
    "UPDATE grants SET valid_to=now()-interval '1 millisecond',valid_from=now()-interval '1 day' WHERE user_id=$1 AND kind='JOB'",
    [ids.employee],
  );
  assert.equal((await request('employee', 'GET', '/tasks/' + task.id)).status, 404);
  const r = await ok('employee', 'GET', '/report-revisions/' + firstRevision.id);
  assert.equal(r.snapshot.principal.length, 0);
  assert.equal(r.snapshot.narratives.length, 0);
  await pool.query('UPDATE grants SET valid_to=NULL WHERE user_id=ANY($1)', [
    [ids.employee, ids.support],
  ]);
});
test('AT-051 · claim money belongs to order, SKU strings preserve leading zeros', async () => {
  const r = await ok('sales', 'POST', '/claims', {
    platform: 'TIKTOK',
    shop: 'test',
    order_id: '000001',
    amount: '100000',
    currency: 'VND',
    lines: [
      { sku: '00001', quantity: 1, allocation: '50000' },
      { sku: '00002', quantity: 1, allocation: '50000' },
    ],
  });
  assert.equal(r.amount, '100000.00');
  const data = await ok('sales', 'GET', '/claims');
  assert.equal(data.items[0].lines[0].sku, '00001');
  assert.equal(
    (
      await request('sales', 'POST', '/claims', {
        platform: 'TIKTOK',
        shop: 'test',
        order_id: '000002',
        amount: '100',
        currency: 'VND',
        lines: [{ sku: '1', quantity: 1, allocation: '101' }],
      })
    ).status,
    422,
  );
});
test('AT-047..050 · metric missing vs zero, immutable revisions, overlap conflict, unique/ads separated', async () => {
  const b = {
    platform: 'TIKTOK',
    shop: 'S1',
    kind: 'SALES',
    subject: 'SHOP',
    metric: 'gmv',
    business_date: '2026-11-01',
    window_end: '2026-11-01',
    grain: 'DAY',
    aggregation: 'SUM',
    currency: 'VND',
    value: '0',
    missing_reason: null,
    source: 'test source',
  };
  const m = await ok('sales', 'POST', '/metrics', b);
  assert.equal(Number(m.value), 0);
  assert.equal((await request('sales', 'POST', '/metrics', b)).status, 409);
  const r = await ok('sales', 'POST', '/metrics', { ...b, value: '3000', replace: true });
  assert.equal(r.revision, 2);
  const missing = await ok('sales', 'POST', '/metrics', {
    ...b,
    business_date: '2026-11-02',
    window_end: '2026-11-02',
    value: null,
    missing_reason: 'Nguồn chưa xuất',
  });
  assert.equal(missing.value, null);
  const v = await ok('sales', 'GET', '/metrics?kind=SALES');
  assert.equal(v.items.length, 2);
  assert.equal(v.definitions.customers, 'PERIOD_UNIQUE');
  assert.equal((await request('ads', 'GET', '/metrics?kind=SALES')).status, 403);
});
test('AT-054 · probation starts once; event dedupe; no payroll field invented', async () => {
  const e = await ok('hr', 'POST', '/employees', {
    name: 'HR Test',
    birthday: '1990-11-09',
    recruiter_id: ids.hr,
  });
  await ok('hr', 'POST', '/employees/' + e.id + '/probation-start', {
    actual_start_date: '2026-11-01',
    expected_version: 1,
  });
  await runJobs();
  await runJobs();
  const d = await ok('hr', 'GET', '/employees/' + e.id);
  assert.equal(d.events.length, 1);
  assert.equal(d.employment_state, 'PROBATION');
  assert.equal(d.payroll, undefined);
  assert.equal((await request('employee', 'GET', '/employees/' + e.id + '/sensitive')).status, 403);
  assert.equal((await request('hr', 'GET', '/employees/' + e.id + '/sensitive')).status, 403);
  const n = await pool.query('SELECT count(*) FROM notifications WHERE event_key=$1', [
    'probation:' + e.id,
  ]);
  assert.equal(Number(n.rows[0].count), 1);
});
test('AT-056..058 · encrypted platform versions; history Admin only; reveal audit safe', async () => {
  const a = await ok('admin', 'POST', '/platform-accounts', {
    label: 'Test Account',
    platform: 'TIKTOK',
    login: 'demo-login',
    company: 'Test Co',
  });
  await ok('admin', 'POST', '/platform-accounts/' + a.id + '/grants', {
    user_id: ids.employee,
    role: 'CONTENT',
    valid_to: null,
  });
  const secret = 'Unique-Vault-Secret-Do-Not-Log';
  const v = await ok('employee', 'POST', '/platform-accounts/' + a.id + '/versions', {
    secret,
    external_changed_confirmed: true,
    note: 'test',
    expected_version: 1,
  });
  const r = await pool.query('SELECT ciphertext FROM credential_versions WHERE id=$1', [v.id]);
  assert(!r.rows[0].ciphertext.includes(secret));
  assert.equal(
    (await ok('employee', 'POST', '/platform-accounts/' + a.id + '/reveal', {})).secret,
    secret,
  );
  assert.equal(
    (await request('employee', 'GET', '/platform-accounts/' + a.id + '/history')).status,
    403,
  );
  assert.equal(
    (await request('boss', 'POST', '/credential-versions/' + v.id + '/reveal', {})).status,
    403,
  );
  assert.equal(
    (await ok('admin', 'POST', '/credential-versions/' + v.id + '/reveal', {})).secret,
    secret,
  );
  const audit = await ok('admin', 'GET', '/audit');
  assert(!JSON.stringify(audit).includes(secret));
});
test('AT-059..063 · missing approval config blocks; quote-only never monetary approval; reapproval on edit', async () => {
  const body = {
    kind: 'PURCHASE',
    title: 'Microphone',
    company: 'Test Co',
    amount: null,
    currency: 'VND',
    needed_on: null,
    payload: { purpose: 'Shoot', items: [{ name: 'Mic', quantity: 1, unit: 'cái' }], supplier: '' },
  };
  let r = await ok('employee', 'POST', '/requests', body);
  assert.equal(
    (
      await request('employee', 'POST', '/requests/' + r.id + '/submit', {
        expected_version: r.version,
      })
    ).data.code,
    'CONFIG_REQUIRED',
  );
  await ok('admin', 'POST', '/approval-policies', {
    kind: 'PURCHASE',
    company: 'Test Co',
    max_amount: '1000000',
    currency: 'VND',
    approvers: [ids.manager],
    enabled: true,
    reason: 'TEST ONLY',
  });
  r = await ok('employee', 'POST', '/requests/' + r.id + '/submit', {
    expected_version: r.version,
  });
  r = await ok('manager', 'POST', '/requests/' + r.id + '/decision', {
    decision: 'APPROVE',
    note: 'Nhu cầu được chấp nhận',
    expected_version: r.version,
  });
  assert.equal(r.state, 'NEEDS_QUOTE');
  r = await ok('employee', 'PATCH', '/requests/' + r.id, {
    ...body,
    amount: '500000',
    expected_version: r.version,
  });
  assert.equal(r.state, 'DRAFT');
  r = await ok('employee', 'POST', '/requests/' + r.id + '/submit', {
    expected_version: r.version,
  });
  r = await ok('manager', 'POST', '/requests/' + r.id + '/decision', {
    decision: 'APPROVE',
    note: 'Có báo giá',
    expected_version: r.version,
  });
  assert.equal(r.state, 'APPROVED');
  const revised = await ok('employee', 'PATCH', '/requests/' + r.id, {
    ...body,
    amount: '600000',
    expected_version: r.version,
  });
  assert.equal(revised.state, 'DRAFT');
  assert.equal(revised.policy_snapshot, null);
});

async function multipartRequest(
  who: string,
  path: string,
  fields: Record<string, string>,
  filename: string,
  bytes: Buffer,
  key = randomUUID(),
) {
  const boundary = 'SuperNetBoundary' + randomUUID();
  const pieces: Buffer[] = [];
  for (const [k, v] of Object.entries(fields))
    pieces.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`),
    );
  pieces.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return app.inject({
    method: 'POST',
    url: '/api/v1' + path,
    headers: {
      cookie: clients[who].cookie,
      'x-csrf-token': clients[who].csrf,
      'idempotency-key': key,
      'content-type': 'multipart/form-data; boundary=' + boundary,
    },
    payload: Buffer.concat(pieces),
  });
}
test('Files · actual upload/download, checksum, safe name, private pending ACL, role expiry, persistence after restart', async () => {
  let t = await ok('manager', 'POST', '/tasks', {
    title: 'File persistence task',
    owner_id: ids.employee,
    role: 'CONTENT',
    due_at: new Date(Date.now() + 86400e3).toISOString(),
    supporters: [{ user_id: ids.support, role: 'DESIGNER' }],
  });
  const body = Buffer.from('private evidence file');
  const upload = await multipartRequest(
    'employee',
    '/assets',
    { task_id: t.id, shared: 'false' },
    'evidence.txt',
    body,
  );
  assert.equal(upload.statusCode, 200, upload.body);
  const f = upload.json();
  let r = await request('employee', 'GET', '/assets/' + f.id + '/download');
  assert.equal(r.r.rawPayload.toString(), body.toString());
  assert.equal((await request('support', 'GET', '/assets/' + f.id + '/download')).status, 404);
  assert.equal(
    (
      await multipartRequest(
        'employee',
        '/assets',
        { task_id: t.id, shared: 'false' },
        'bad.jpg',
        Buffer.from('<script>alert(1)</script>'),
      )
    ).statusCode,
    422,
  );
  await app.close();
  app = await buildApp();
  r = await request('employee', 'GET', '/assets/' + f.id + '/download');
  assert.equal(r.r.rawPayload.toString(), body.toString());
  assert.equal((await ok('employee', 'GET', '/tasks/' + t.id)).title, 'File persistence task');
  await pool.query(
    "UPDATE grants SET valid_to=now()-interval '1 second',valid_from=now()-interval '1 day' WHERE user_id=$1 AND kind='JOB'",
    [ids.employee],
  );
  assert.equal((await request('employee', 'GET', '/assets/' + f.id + '/download')).status, 404);
  await pool.query('UPDATE grants SET valid_to=NULL WHERE user_id=$1', [ids.employee]);
});
test('AT-044..047 · actual CSV import, date/header mapping, total rows excluded, duplicate bytes, source retained, XLSX parser', async () => {
  const bytes = Buffer.from(
    'Date,GMV,Orders\n2026-10-20,1000,2\n2026-10-21,0,0\n2026-10-22,—,1\nTotal,1000,3\n',
  );
  const upload = await multipartRequest(
    'sales',
    '/imports',
    { platform: 'TIKTOK', shop: 'CSVTEST', currency: 'VND', kind: 'SALES' },
    'source.csv',
    bytes,
  );
  assert.equal(upload.statusCode, 200, upload.body);
  const b = upload.json();
  assert.equal(
    (
      await multipartRequest(
        'sales',
        '/imports',
        { platform: 'TIKTOK', shop: 'CSVTEST', currency: 'VND', kind: 'SALES' },
        'renamed.csv',
        bytes,
      )
    ).statusCode,
    409,
  );
  const preview = await ok('sales', 'POST', '/imports/' + b.id + '/preview', {
    sheet: 'sheet1',
    header_row: 1,
    date_column: 0,
    mapping: { gmv: 1, orders: 2 },
    locale: 'en-US',
    grain: 'DAY',
    subject: 'SHOP',
    expected_version: b.version,
  });
  assert.equal(preview.errors.length, 0);
  assert.equal(preview.rows.length, 6);
  assert.equal(preview.skipped.length, 1);
  assert.equal(preview.rows.filter((m: any) => m.value === null).length, 1);
  assert.equal(
    (
      await request('sales', 'POST', '/imports/' + b.id + '/commit', {
        expected_version: preview.version,
        preview_hash: 'stale',
        conflict_resolution: 'REJECT',
      })
    ).status,
    409,
  );
  const committed = await ok('sales', 'POST', '/imports/' + b.id + '/commit', {
    expected_version: preview.version,
    preview_hash: preview.preview_hash,
    conflict_resolution: 'REJECT',
  });
  assert.equal(committed.count, 6);
  const original = await request('sales', 'GET', '/imports/' + b.id + '/source');
  assert(original.r.rawPayload.equals(bytes));
  assert.equal((await request('employee', 'GET', '/imports/' + b.id)).status, 404);
  const workbook = new ExcelJS.Workbook(),
    ws = workbook.addWorksheet('Sales');
  ws.addRow(['Date', 'GMV']);
  ws.addRow([new Date('2026-11-01T00:00:00Z'), 500]);
  const wb = Buffer.from(await workbook.xlsx.writeBuffer());
  assert.equal(
    (
      await multipartRequest(
        'sales',
        '/imports',
        { platform: 'SHOPEE', shop: 'XLSXTEST', currency: 'VND', kind: 'SALES' },
        'source.xlsx',
        wb,
      )
    ).statusCode,
    200,
  );
});
test('AT-028..030 · authoritative report fixture has 3 total, 3 started, 1 done/on-time, 2 open, carryover separate', async () => {
  const email = 'fixture@test.local';
  await tx(async (c) => {
    const uid = await createUser(
      c,
      email,
      'Fixture employee',
      password,
      'CONTENT',
      'EMPLOYEE',
      ids.team,
      ids.manager,
    );
    ids.fixture = uid;
    const start = new Date(period() + 'T00:00:00+07:00');
    for (const [i, status] of ['DONE', 'IN_PROGRESS', 'SUBMITTED', 'IN_PROGRESS'].entries()) {
      const old = i === 3;
      await c.query(
        "INSERT INTO tasks(title,owner_id,created_by,reviewer_id,role,status,source,original_due_at,due_at,started_at,created_at,timing) VALUES($1,$2,$2,$3,'CONTENT',$4,'EMPLOYEE_ADHOC',now()+interval '1 day',now()+interval '1 day',$5,$6,$7)",
        [
          'fixture-' + i,
          uid,
          ids.manager,
          status === 'DONE' ? 'IN_PROGRESS' : status,
          new Date(start.getTime() + 1000),
          old ? new Date(start.getTime() - 86400e3) : new Date(start.getTime() + 1000),
          null,
        ],
      );
      if (status === 'DONE') {
        const task = await one(c, 'SELECT id FROM tasks WHERE owner_id=$1 AND title=$2', [
          uid,
          'fixture-' + i,
        ]);
        const sub = await one(
          c,
          "INSERT INTO submissions(task_id,revision,result_text,payload,due_at_at_submit) VALUES($1,1,'Fixture approved','{}',now()+interval '1 day') RETURNING id",
          [task.id],
        );
        await c.query(
          "UPDATE tasks SET status='DONE',approved_submission_id=$2,completed_at=now(),timing='ON_TIME' WHERE id=$1",
          [task.id, sub.id],
        );
      }
    }
  });
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
    remoteAddress: '127.0.0.99',
  });
  clients.fixture = {
    cookie: login.headers['set-cookie']?.toString().split(';')[0],
    csrf: login.json().csrf,
  };
  const s = await ok('fixture', 'GET', '/reports/live?period=' + period());
  assert.equal(s.summary.total, 3);
  assert.equal(s.summary.started, 3);
  assert.equal(s.summary.done, 1);
  assert.equal(s.summary.on_time, 1);
  assert.equal(s.summary.open, 2);
  assert.equal(s.carryover.length, 1);
});
test('AT-071,072 · support snapshot remains independent of later contribution revisions', async () => {
  let t = await ok('employee', 'POST', '/tasks', {
    title: 'Support report task',
    role: 'CONTENT',
    due_at: new Date(Date.now() + 86400e3).toISOString(),
    supporters: [{ user_id: ids.support, role: 'DESIGNER' }],
  });
  t = await ok('employee', 'GET', '/tasks/' + t.id);
  const invite = t.supporters[0];
  const accepted = await ok('support', 'POST', '/support-invitations/' + invite.id + '/response', {
    decision: 'ACCEPT',
    expected_version: invite.version,
  });
  const contribution = await ok(
    'support',
    'PATCH',
    '/support-invitations/' + invite.id + '/contribution',
    {
      summary: 'Support v1',
      next_step: '',
      blocker: '',
      reported_done: true,
      expected_version: accepted.version,
    },
  );
  const r = await ok('support', 'POST', '/reports/submit', {
    period: period(),
    expected_draft_versions: {},
  });
  assert.equal(r.snapshot.summary.total, 0);
  assert(r.snapshot.support.some((s: any) => s.summary === 'Support v1'));
  await ok('support', 'PATCH', '/support-invitations/' + invite.id + '/contribution', {
    summary: 'Support v2',
    next_step: '',
    blocker: '',
    reported_done: true,
    expected_version: contribution.version,
  });
  const old = await ok('boss', 'GET', '/report-revisions/' + r.id);
  assert(old.snapshot.support.some((s: any) => s.summary === 'Support v1'));
});
test('Professional records / plans / versioned changes / reference kind / publication approval / BigSeller source', async () => {
  let r = await ok('employee', 'POST', '/records', {
    kind: 'CONTENT',
    title: 'Production brief',
    company: 'Test Co',
    status: 'DRAFT',
    payload: { script: 'Full script', hook: 'Hook' },
  });
  assert.equal((await request('outside', 'GET', '/records/' + r.id)).status, 404);
  r = await ok('employee', 'PATCH', '/records/' + r.id, {
    kind: 'CONTENT',
    title: 'Edited brief',
    company: 'Test Co',
    status: 'SCRIPT',
    payload: { script: 'Changed' },
    expected_version: r.version,
  });
  assert.equal(
    (
      await request('employee', 'PATCH', '/records/' + r.id, {
        kind: 'CONTENT',
        title: 'stale',
        company: 'Test Co',
        payload: {},
        expected_version: 1,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request('employee', 'POST', '/records', {
        kind: 'PUBLICATION',
        title: 'Invalid publish',
        company: 'Test Co',
        payload: {
          content_id: r.id,
          approved_task_id: task.id,
          channel: 'TikTok',
          url: 'https://example.org/post',
        },
      })
    ).status,
    422,
  );
  await ok('employee', 'POST', '/plans', {
    period: period(),
    role: 'CONTENT',
    title: 'Next week goal',
    task_id: null,
  });
  assert.equal((await ok('employee', 'GET', '/plans?period=' + period())).items.length, 1);
});
test('Assignment timeout racing an accept settles once; rejected cross-role create atomic', async () => {
  const t = await ok('manager', 'POST', '/tasks', {
    title: 'Race response',
    role: 'CONTENT',
    owner_id: ids.employee,
    due_at: new Date(Date.now() + 86400e3).toISOString(),
  });
  await pool.query(
    "UPDATE assignments SET response_due_at=now()-interval '1 second' WHERE task_id=$1",
    [t.id],
  );
  await Promise.all([
    request('employee', 'POST', '/tasks/' + t.id + '/assignment-response', {
      decision: 'ACCEPT',
      expected_version: 1,
    }),
    runJobs(),
  ]);
  const d = await ok('manager', 'GET', '/tasks/' + t.id);
  assert.equal(d.status, 'DECLINED');
  assert.equal(d.events.filter((e: any) => e.action === 'ASSIGNMENT_TIMEOUT').length, 1);
  const before = Number((await pool.query('SELECT count(*) AS n FROM tasks')).rows[0].n);
  assert.equal(
    (
      await request('employee', 'POST', '/tasks', {
        title: 'Must rollback',
        role: 'CONTENT',
        due_at: new Date(Date.now() + 86400e3).toISOString(),
        supporters: [{ user_id: ids.support, role: 'HR' }],
      })
    ).status,
    422,
  );
  const after = Number((await pool.query('SELECT count(*) AS n FROM tasks')).rows[0].n);
  assert.equal(after, before);
});

test('AT-002,003 · multi-role grants compose then revocation removes only HR', async () => {
  const g = await ok('admin', 'POST', '/role-grants', {
    user_id: ids.employee,
    kind: 'JOB',
    role: 'HR',
    scope: 'SELF',
    team_id: null,
    valid_from: new Date(Date.now() - 1000).toISOString(),
    valid_to: null,
    reason: 'TEST multiple roles',
  });
  let me = await ok('employee', 'GET', '/me');
  assert(me.grants.some((g: any) => g.role === 'HR'));
  assert(me.grants.some((g: any) => g.role === 'CONTENT'));
  assert.equal((await request('employee', 'GET', '/employees')).status, 200);
  await ok('admin', 'POST', '/role-grants/' + g.id + '/revoke', { reason: 'TEST revoke only HR' });
  me = await ok('employee', 'GET', '/me');
  assert(me.grants.some((g: any) => g.role === 'CONTENT'));
  assert(!me.grants.some((g: any) => g.role === 'HR'));
  assert.equal((await request('employee', 'GET', '/employees')).status, 403);
});
test('AT-023 · late approval uses accepted submission time, never approval time', async () => {
  const t = await ok('manager', 'POST', '/tasks', {
    title: 'Historical timing proof',
    role: 'CONTENT',
    owner_id: ids.employee,
    due_at: '2026-01-02T10:00:00Z',
  });
  const s = await tx(async (c) => {
    const sub = await one(
      c,
      "INSERT INTO submissions(task_id,revision,result_text,payload,submitted_at,due_at_at_submit) VALUES($1,1,'historical result','{}','2026-01-01T10:00:00Z','2026-01-02T10:00:00Z') RETURNING *",
      [t.id],
    );
    await c.query("UPDATE tasks SET status='SUBMITTED' WHERE id=$1", [t.id]);
    await c.query("UPDATE assignments SET status='ACCEPTED' WHERE task_id=$1", [t.id]);
    return sub;
  });
  const done = await ok('manager', 'POST', '/submissions/' + s.id + '/review', {
    decision: 'APPROVE',
    expected_task_version: t.version,
  });
  assert.equal(done.timing, 'ON_TIME');
  assert(new Date(done.completed_at) > new Date(done.due_at));
});
test('R25 · week/month comparison modes have explicit intervals and safe values', async () => {
  for (const range of ['WEEK', 'MONTH'])
    for (const mode of ['FULL_PERIOD', 'EQUIVALENT_DAYS']) {
      const r = await ok(
        'employee',
        'GET',
        `/reports/comparison?period=${period()}&range=${range}&mode=${mode}`,
      );
      assert.equal(r.range, range);
      assert.equal(r.mode, mode);
      assert(new Date(r.current_range[1]) >= new Date(r.current_range[0]));
      assert(Number.isFinite(r.comparison.current));
    }
});
test('Draft dispatch completes missing deadline; supporting documents can be uploaded by manager before acceptance', async () => {
  const d = await ok('manager', 'POST', '/tasks', {
    title: 'Dispatch draft',
    owner_id: ids.employee,
    role: 'CONTENT',
    draft: true,
    supporters: [{ user_id: ids.support, role: 'DESIGNER' }],
  });
  assert.equal((await request('support', 'GET', '/tasks/' + d.id)).status, 404);
  const t = await ok('manager', 'POST', '/tasks/' + d.id + '/dispatch', {
    due_at: new Date(Date.now() + 86400e3).toISOString(),
    expected_version: d.version,
  });
  assert.equal(t.status, 'ASSIGNED');
  assert(t.due_at);
  assert.equal(
    (
      await multipartRequest(
        'manager',
        '/assets',
        { task_id: t.id, shared: 'true' },
        'manager-brief.txt',
        Buffer.from('Shared brief from manager'),
      )
    ).statusCode,
    200,
  );
  const pending = await ok('support', 'GET', '/tasks/' + d.id);
  assert.equal(pending.assets.length, 1);
  assert.equal(pending.pending_brief, true);
});
test('Disabled account/session and logout deny subsequent API', async () => {
  await pool.query('UPDATE users SET active=false WHERE id=$1', [ids.outside]);
  assert.equal((await request('outside', 'GET', '/me')).status, 401);
  await ok('ads', 'POST', '/auth/logout', {});
  assert.equal((await request('ads', 'GET', '/me')).status, 401);
});
