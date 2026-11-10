import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hash as passwordHash, verify } from 'argon2';
import { pool, tx, one, actor, dataDir, localDate } from '../server/base.js';
import { buildApp } from '../server/app.js';
import { migrate } from '../server/cli.js';
import {
  readSource,
  parseSource,
  sourceDate,
  sourceNumber,
  sourcePercent,
} from '../server/source-parser.js';
import { checklistList } from '../server/checklist.js';
import { hrJobs } from '../server/hr-jobs.js';
import { runJobs } from '../server/worker.js';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
const ids: Record<string, string> = {},
  sessions: Record<string, { cookie: string; csrf: string }> = {};
const password = randomBytes(24).toString('base64url');
let app: Awaited<ReturnType<typeof buildApp>>;
const sourceRoot = 'tests/fixtures/handoff/';
const sources = JSON.parse(readFileSync(sourceRoot + 'source_manifest.json', 'utf8'))
  .original_files as any[];
async function request(
  who: string,
  method: string,
  path: string,
  body?: any,
  key: string = randomUUID(),
) {
  const s = sessions[who];
  const r = await app.inject({
    method: method as any,
    url: '/api/v1' + path,
    headers: { cookie: s.cookie, 'x-csrf-token': s.csrf, 'idempotency-key': key },
    payload: body,
  });
  return { status: r.statusCode, data: r.json() };
}
async function ok(who: string, method: string, path: string, body?: any, key?: string) {
  const r = await request(who, method, path, body, key);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
async function upload(
  code: string,
  who = 'market',
  resource = ids.shop,
  override?: { bytes?: Buffer; start?: string; end?: string },
) {
  const f = sources.find((f) => f.adapter === code),
    boundary = 'handoff-' + randomUUID();
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries({
    adapter_code: code,
    company_id: ids.company,
    resource_id: resource,
    period_start: override?.start || (code === 'VIDEO_PERFORMANCE' ? '2026-11-10' : '2026-11-02'),
    period_end: override?.end || (code === 'VIDEO_PERFORMANCE' ? '2026-11-10' : '2026-11-08'),
    basis:
      code === 'KOC_SALES'
        ? 'EXPORT_PERIOD'
        : code === 'TIKTOK_RETURNS'
          ? 'DATE_CREATED'
          : code === 'VIDEO_PERFORMANCE'
            ? 'SNAPSHOT'
            : 'DAILY',
  }))
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`),
    );
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="arbitrary-name.xlsx"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    override?.bytes || readFileSync(sourceRoot + f.file),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  const s = sessions[who];
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/imports',
    headers: {
      cookie: s.cookie,
      'x-csrf-token': s.csrf,
      'idempotency-key': randomUUID(),
      'content-type': 'multipart/form-data; boundary=' + boundary,
    },
    payload: Buffer.concat(parts),
  });
  assert.equal(r.statusCode, 200, r.body);
  return r.json();
}
const preview = (b: any, who = 'market') =>
  ok(who, 'POST', '/imports/' + b.id + '/preview', {
    expected_version: b.version,
    adapter_version: 1,
    source_context: { number_locale: 'vi-VN' },
    confirmations: {
      platform_source_confirmed: true,
      period_basis: 'Synthetic acceptance test source context; not a business source assignment',
    },
  });
const create = (who = 'content', extra: any = {}) =>
  ok(who, 'POST', '/tasks', {
    flow_mode: 'CHECKLIST',
    title: 'Synthetic handoff task',
    owner_id: ids.content,
    job_code: 'CONTENT',
    due_at: new Date(Date.now() + 86400e3).toISOString(),
    ...extra,
  });
before(async () => {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /_test$/);
  await migrate();
  await tx(async (c) => {
    const team = await one(c, 'INSERT INTO teams(name) VALUES($1) RETURNING id', [
      'Synthetic handoff ' + randomUUID(),
    ]);
    ids.team = team.id;
    for (const [name, role] of Object.entries({
      admin: 'ADMIN',
      boss: 'BOSS',
      market: 'MARKETPLACE',
      hr: 'HR',
      content: 'CONTENT',
      outsider: 'CONTENT',
    })) {
      const u = await one(
        c,
        'INSERT INTO users(username,name,password_hash,team_id) VALUES($1,$2,$3,$4) RETURNING id',
        [
          'handoff_' + name + '_' + randomUUID().slice(0, 8),
          'Synthetic ' + name,
          await passwordHash(password),
          team.id,
        ],
      );
      ids[name] = u.id;
      await c.query('INSERT INTO grants(user_id,kind,role,scope,reason) VALUES($1,$2,$3,$4,$5)', [
        u.id,
        ['ADMIN', 'BOSS'].includes(role) ? 'ACCESS' : 'JOB',
        role,
        ['ADMIN', 'BOSS'].includes(role) ? 'ALL' : 'SELF',
        'SYNTHETIC_TEST_ONLY',
      ]);
    }
  });
  app = await buildApp();
  for (const who of Object.keys(ids).filter((k) => k !== 'team')) {
    const u = (await pool.query('SELECT username FROM users WHERE id=$1', [ids[who]])).rows[0];
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: u.username, password },
    });
    assert.equal(r.statusCode, 200, r.body);
    sessions[who] = { cookie: String(r.headers['set-cookie']).split(';')[0], csrf: r.json().csrf };
  }
  const company = await ok('admin', 'POST', '/companies', {
    code: 'SYNTHETIC_' + randomUUID(),
    name: 'Synthetic test company — not a real source mapping',
  });
  ids.company = company.id;
  const platforms = (
    await pool.query("SELECT id,code FROM platforms WHERE code IN ('TIKTOK','SHOPEE')")
  ).rows;
  for (const [key, platform, kind] of [
    ['shop', 'TIKTOK', 'SHOP'],
    ['shopee', 'SHOPEE', 'SHOP'],
    ['channel', 'TIKTOK', 'CHANNEL'],
  ]) {
    const r = await ok('admin', 'POST', '/resources', {
      company_id: ids.company,
      platform_id: platforms.find((p) => p.code === platform).id,
      kind,
      label: 'Synthetic ' + key,
    });
    ids[key] = r.id;
    await ok('admin', 'PUT', '/resources/' + r.id + '/grants', {
      user_ids: [kind === 'SHOP' ? ids.market : ids.content],
      permission: 'WRITE',
      reason: 'Synthetic acceptance fixture',
      expected_version: r.version,
    });
  }
  writeFileSync(
    join(dataDir, 'handoff-browser-auth.json'),
    JSON.stringify({
      password,
      users: await pool
        .query('SELECT id,username FROM users WHERE id=ANY($1::uuid[])', [
          Object.values(ids).filter(
            (v) =>
              v !== ids.team &&
              v !== ids.company &&
              v !== ids.shop &&
              v !== ids.shopee &&
              v !== ids.channel,
          ),
        ])
        .then((r) => r.rows),
      ids,
    }),
    { mode: 0o600 },
  );
});
after(async () => {
  await app?.close();
  await pool.end();
});

test('AUTH01/04/05 · five roles, server object scope and resource grants', async () => {
  for (const [who, role] of [
    ['admin', 'ADMIN'],
    ['boss', 'BOSS'],
    ['market', 'MARKETPLACE'],
    ['hr', 'HR'],
    ['content', 'CONTENT'],
  ])
    assert((await ok(who, 'GET', '/me')).display_roles.includes(role));
  assert.equal((await request('boss', 'GET', '/employees')).status, 403);
  assert.equal(
    (
      await request(
        'boss',
        'GET',
        '/reports/live?schema_version=2&period=2026-11-02&employee=' + ids.content,
      )
    ).status,
    403,
  );
  assert.equal((await ok('outsider', 'GET', '/resources')).items.length, 0);
  assert.equal(
    (
      await request(
        'boss',
        'GET',
        '/sales/summary?company_id=' +
          ids.company +
          '&resource_id=' +
          ids.shop +
          '&from=2026-11-02&to=2026-11-08',
      )
    ).status,
    404,
  );
});
test('TASK01..07 · checklist complete/cancel, legacy constraints, idempotency and Admin-only corrections', async () => {
  const t = await create('boss');
  ids.task = t.id;
  assert.equal(t.status, 'WAITING');
  assert.equal(t.flow_mode, 'CHECKLIST');
  assert.equal(t.reviewer_id, null);
  assert.equal(
    (await pool.query('SELECT * FROM assignments WHERE task_id=$1', [t.id])).rowCount,
    0,
  );
  assert.equal(
    (
      await request('content', 'POST', '/tasks/' + t.id + '/state', {
        status: 'DONE',
        summary: ' ',
        expected_version: 1,
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await request('boss', 'POST', '/tasks/' + t.id + '/state', {
        status: 'DONE',
        summary: 'No substitute completion',
        expected_version: 1,
      })
    ).status,
    403,
  );
  const key = randomUUID(),
    body = { status: 'DONE', summary: 'Synthetic result persisted', expected_version: 1 };
  const done = await ok('content', 'POST', '/tasks/' + t.id + '/state', body, key);
  assert.equal(done.status, 'DONE');
  assert.equal(done.approved_submission_id, null);
  assert(done.completed_at);
  assert.deepEqual(await ok('content', 'POST', '/tasks/' + t.id + '/state', body, key), done);
  assert.equal(
    (
      await request('content', 'POST', '/tasks/' + t.id + '/reopen', {
        reason: 'owner cannot reopen',
        expected_version: done.version,
      })
    ).status,
    403,
  );
  const reopened = await ok('admin', 'POST', '/tasks/' + t.id + '/reopen', {
    reason: 'Synthetic correction',
    expected_version: done.version,
  });
  assert.equal(reopened.status, 'IN_PROGRESS');
  assert.equal(
    (
      await request('boss', 'POST', '/tasks/' + t.id + '/deadline', {
        due_at: new Date().toISOString(),
        reason: 'No authority',
        expected_version: reopened.version,
      })
    ).status,
    403,
  );
  const changed = await ok('admin', 'POST', '/tasks/' + t.id + '/deadline', {
    due_at: new Date(Date.now() + 3600e3).toISOString(),
    reason: 'Verified correction',
    expected_version: reopened.version,
  });
  assert.equal(
    (
      await request('content', 'POST', '/tasks/' + t.id + '/state', {
        status: 'DONE',
        summary: 'stale',
        expected_version: 1,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request('content', 'POST', '/tasks/' + t.id + '/cancel', {
        reason: ' ',
        expected_version: changed.version,
      })
    ).status,
    422,
  );
  const cancelled = await ok('content', 'POST', '/tasks/' + t.id + '/cancel', {
    reason: 'Synthetic cancellation',
    expected_version: changed.version,
  });
  assert(cancelled.cancelled_at);
  assert.equal(cancelled.cancel_reason, 'Synthetic cancellation');
  await assert.rejects(
    pool.query("UPDATE tasks SET flow_mode='LEGACY_REVIEW',status='DONE' WHERE id=$1", [t.id]),
    /task_done_by_flow/,
  );
});
test('SORT01..06 · anchored ordering, half-open dates, signed cursor, facets and full totals', async () => {
  await tx(async (c) => {
    const a = await actor(c, ids.content),
      anchor = '2026-11-10T07:00:00.000Z';
    const fixture = JSON.parse(readFileSync(sourceRoot + 'synthetic/task_sort.json', 'utf8'));
    assert(fixture);
    const defs = [
      ['A', '2026-11-09T10:00:00+07:00', 'URGENT'],
      ['B', '2026-11-08T10:00:00+07:00', 'NORMAL'],
      ['C', '2026-11-10T17:00:00+07:00', 'URGENT'],
      ['D', '2026-11-10T16:00:00+07:00', 'NORMAL'],
      ['E', '2026-11-12T10:00:00+07:00', 'NORMAL'],
      ['F', '2026-11-20T10:00:00+07:00', 'URGENT'],
    ];
    for (const [title, due, priority] of defs)
      await c.query(
        "INSERT INTO tasks(flow_mode,title,owner_id,created_by,role,status,source,due_at,priority,created_at) VALUES('CHECKLIST',$1,$2,$2,'CONTENT','WAITING','SYNTHETIC_TEST',$3,$4,'2026-10-01')",
        ['sort-fixture-' + title, a.id, due, priority],
      );
    // Sign a first cursor using the product service, then keep its anchor fixed
    // through subsequent pages. Fixture bucket comparison also tests SQL keys.
    const attention = await checklistList(c, a, { v2: '1', q: 'sort-fixture-' }, new Date(anchor));
    assert.deepEqual(
      attention.items.map((t) => t.title.slice(-1)),
      ['A', 'B', 'C', 'D', 'E', 'F'],
    );
    const first = await checklistList(
      c,
      a,
      { v2: '1', q: 'sort-fixture-', limit: 1 },
      new Date(anchor),
    );
    assert(first.next_cursor);
    const second = await checklistList(c, a, {
      v2: '1',
      q: 'sort-fixture-',
      limit: 1,
      cursor: first.next_cursor,
    });
    assert.equal(first.filtered_total, 6);
    assert.notEqual(first.items[0].id, second.items[0].id);
    await assert.rejects(
      checklistList(c, a, { v2: '1', q: 'other', limit: 1, cursor: first.next_cursor }),
      /Bộ lọc/,
    );
    await assert.rejects(checklistList(c, a, { v2: '1', sort: 'COMPLETED_DESC' }), /DONE/);
    const due = await checklistList(c, a, { v2: '1', q: 'sort-fixture-', sort: 'DUE_ASC' });
    assert.deepEqual(
      due.items.map((t) => t.title.slice(-1)),
      ['B', 'A', 'D', 'C', 'E', 'F'],
    );
  });
  const forbidden = await request('content', 'GET', '/tasks?v2=1&owner_ids=' + ids.market);
  assert.equal(forbidden.status, 403);
});
test('IMP01..06/MET01..09/VID01 · five original parsers, controls, malformed values and source contradiction', async () => {
  for (const f of sources) {
    const sheets = await readSource(readFileSync(sourceRoot + f.file), 'renamed.xlsx');
    const p = parseSource(
      sheets,
      f.adapter,
      { source_context: { number_locale: 'vi-VN' } },
      {
        start:
          f.adapter.endsWith('_SALES') && f.adapter !== 'KOC_SALES' ? '2026-11-02' : '2026-11-01',
        end:
          f.adapter.endsWith('_SALES') && f.adapter !== 'KOC_SALES' ? '2026-11-08' : '2026-11-30',
        basis: 'DATE_CREATED',
      },
    );
    if (f.adapter === 'TIKTOK_RETURNS') {
      assert.equal(p.facts.length, 113);
      assert.equal(new Set(p.facts.map((r) => r.order_id)).size, 112);
      assert(p.errors.some((e) => e.code === 'ORDER_LEVEL_AMOUNT_CONFLICT'));
    } else assert.equal(p.errors.length, 0, JSON.stringify(p.errors));
    if (f.adapter === 'KOC_SALES') {
      assert.equal(p.facts.length, 1307);
      assert.equal(
        p.facts.reduce((n, r) => n + BigInt(r.gmv), 0n),
        52399786n,
      );
      assert.equal(
        p.facts.reduce((n, r) => n + BigInt(r.estimated_commission), 0n),
        1678199n,
      );
    }
    if (f.adapter === 'TIKTOK_SALES')
      assert.equal(
        p.facts.reduce((n, r) => n + BigInt(r.revenue), 0n),
        67492567n,
      );
    if (f.adapter === 'SHOPEE_SALES')
      assert.equal(
        p.facts.reduce((n, r) => n + BigInt(r.revenue), 0n),
        28040779n,
      );
    if (f.adapter === 'VIDEO_PERFORMANCE') {
      assert.equal(p.facts.length, 15);
      assert(p.facts.every((r) => r.gmv === undefined));
    }
  }
  assert.equal(sourceNumber('16.201.794₫', 'vi-VN'), '16201794');
  assert.equal(sourceNumber('44.0', 'vi-VN', true), '44');
  assert.throws(() => sourceDate('31/02/2026'));
  assert.throws(() => sourceDate('10 tháng Mười'));
  assert.throws(() => sourceNumber('', 'vi-VN'));
  await assert.rejects(readSource(Buffer.from('not a workbook'), 'fake.xlsx'));
});
test('IMP07..12/MET01..06 · server preview/atomic commit, exact duplicates, source ACL and typed summaries', async () => {
  const b = await upload('TIKTOK_SALES');
  const p = await preview(b);
  assert.equal(p.valid_rows, 7);
  assert.equal(p.errors.length, 0);
  const commit = await ok('market', 'POST', '/imports/' + b.id + '/commit', {
    expected_version: p.version,
    preview_token: p.preview_token,
    conflict_mode: 'REJECT',
  });
  assert.equal(commit.rows, 7);
  const summary = await ok(
    'market',
    'GET',
    `/sales/summary?company_id=${ids.company}&resource_id=${ids.shop}&from=2026-11-02&to=2026-11-08`,
  );
  assert.equal(summary.summary.revenue, '67492567.0000000000');
  assert.equal(summary.summary.orders, '930');
  assert.equal(summary.availability, 'AVAILABLE');
  const k = await upload('KOC_SALES'),
    kp = await preview(k);
  assert.equal(kp.valid_rows, 1307);
  await ok('market', 'POST', '/imports/' + k.id + '/commit', {
    expected_version: kp.version,
    preview_token: kp.preview_token,
    conflict_mode: 'REJECT',
  });
  const ks = await ok(
    'market',
    'GET',
    `/koc/summary?company_id=${ids.company}&resource_id=${ids.shop}&from=2026-11-02&to=2026-11-08`,
  );
  assert.equal(ks.top10.length, 10);
  assert.equal(ks.summary.gmv, '52399786.0000000000');
  assert.equal(ks.paid_commission, null);
  const returns = await upload('TIKTOK_RETURNS'),
    rp = await preview(returns);
  assert(rp.errors.some((e: any) => e.code === 'ORDER_LEVEL_AMOUNT_CONFLICT'));
  assert.equal(
    (
      await request('market', 'POST', '/imports/' + returns.id + '/commit', {
        expected_version: rp.version,
        preview_token: rp.preview_token,
        conflict_mode: 'REJECT',
      })
    ).status,
    409,
  );
  const s = await upload('SHOPEE_SALES', 'market', ids.shopee),
    sp = await preview(s);
  await ok('market', 'POST', '/imports/' + s.id + '/commit', {
    expected_version: sp.version,
    preview_token: sp.preview_token,
    conflict_mode: 'REJECT',
  });
  const v = await upload('VIDEO_PERFORMANCE', 'content', ids.channel),
    vp = await preview(v, 'content');
  assert.equal(vp.valid_rows, 15);
  await ok('content', 'POST', '/imports/' + v.id + '/commit', {
    expected_version: vp.version,
    preview_token: vp.preview_token,
    conflict_mode: 'REJECT',
  });
  const publications = await ok('content', 'GET', '/publications');
  assert.equal(publications.items.length, 15);
  assert(
    publications.items.every(
      (p: any) =>
        p.origin === 'HISTORICAL_IMPORT' &&
        p.content_id === null &&
        p.d7.gmv === null &&
        p.d7.status === 'AMBIGUOUS_DATE',
    ),
  );
});
test('CONT01..04/VID02/04 · stage gates, private participants, clip ready without publication, independent publications', async () => {
  let ci = await ok('content', 'POST', '/content-items', {
    title: 'Synthetic production',
    writer_id: ids.content,
    camera_operator_id: ids.content,
    editor_id: ids.content,
  });
  ids.production = ci.id;
  assert.equal((await request('outsider', 'GET', '/content-items/' + ci.id)).status, 404);
  assert.equal(
    (
      await request('content', 'POST', '/content-items/' + ci.id + '/complete-stage', {
        stage: 'EDIT',
        expected_version: ci.version,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request('content', 'POST', '/content-items/' + ci.id + '/complete-stage', {
        stage: 'SCRIPT',
        expected_version: ci.version,
      })
    ).status,
    422,
  );
  ci = await ok('content', 'PATCH', '/content-items/' + ci.id, {
    script_text: 'Synthetic script',
    participants: [{ external_name: 'External fixture actor', participant_role: 'ACTOR' }],
    expected_version: ci.version,
  });
  ci = await ok('content', 'POST', '/content-items/' + ci.id + '/complete-stage', {
    stage: 'SCRIPT',
    expected_version: ci.version,
  });
  assert.equal(ci.stage, 'WAITING_SHOOT');
  ci = await ok('content', 'PATCH', '/content-items/' + ci.id, {
    actual_shot_at: new Date(Date.now() - 7200e3).toISOString(),
    shoot_location: 'Synthetic location',
    raw_links: ['https://example.com/raw'],
    expected_version: ci.version,
  });
  ci = await ok('content', 'POST', '/content-items/' + ci.id + '/complete-stage', {
    stage: 'SHOOT',
    expected_version: ci.version,
  });
  ci = await ok('content', 'PATCH', '/content-items/' + ci.id, {
    edited_at: new Date(Date.now() - 3600e3).toISOString(),
    final_links: ['https://example.com/final'],
    expected_version: ci.version,
  });
  ci = await ok('content', 'POST', '/content-items/' + ci.id + '/complete-stage', {
    stage: 'EDIT',
    expected_version: ci.version,
  });
  assert.equal(ci.stage, 'CLIP_READY');
  assert.equal(ci.events.length, 3);
  for (const suffix of ['777700000000000001', '777700000000000002'])
    await ok('content', 'POST', '/publications', {
      content_id: ci.id,
      channel_id: ids.channel,
      original_url: 'https://www.tiktok.com/@synthetic/video/' + suffix,
      published_at: new Date(Date.now() - 1800e3).toISOString(),
    });
  assert.equal(
    (await pool.query('SELECT * FROM publications WHERE content_id=$1', [ci.id])).rowCount,
    2,
  );
});
test('AUTH02/HR01..07 · candidate onboarding, atomic provisioning, encrypted salary corrections and contract history', async () => {
  const candidate = await ok('hr', 'POST', '/candidates', {
    name: 'Synthetic candidate',
    contact: { email: 'candidate@example.test' },
    birthday: '2000-02-29',
  });
  const application = await ok('hr', 'POST', '/applications', {
    candidate_id: candidate.id,
    position_code: 'CONTENT',
    received_on: localDate(),
    recruiter_id: ids.hr,
    source: 'Synthetic test',
  });
  const onboardBody = {
    employee_code: '00' + randomUUID(),
    joined_on: localDate(),
    phase: 'PROBATION',
    employment_type: 'FULL_TIME',
    team_id: ids.team,
    expected_version: 1,
  };
  const linked = await ok(
    'hr',
    'POST',
    '/applications/' + application.id + '/onboard',
    onboardBody,
  );
  assert.deepEqual(
    await ok('hr', 'POST', '/applications/' + application.id + '/onboard', onboardBody),
    linked,
  );
  ids.employee = linked.employee_id;
  assert.equal(
    (
      await request('hr', 'POST', '/users', {
        employee_id: linked.employee_id,
        name: 'Synthetic new user',
        username: 'handoff_privilege',
        initial_password: password,
        display_roles: ['ADMIN'],
        reason: 'denied',
      })
    ).status,
    403,
  );
  const user = await ok('hr', 'POST', '/users', {
    employee_id: linked.employee_id,
    name: 'Synthetic provisioned user',
    username: 'handoff_provisioned_' + randomUUID().slice(0, 8),
    initial_password: password,
    display_roles: ['CONTENT'],
    reason: 'Synthetic provisioning',
  });
  assert(user.id);
  let e = await ok('hr', 'GET', '/employees/' + linked.employee_id);
  const body = {
    phase: 'PROBATION',
    effective_from: localDate(),
    currency: 'VND',
    payload: { amount: '12345678', gross_or_net: 'GROSS', basis: 'Synthetic salary test' },
    expected_employee_version: e.version,
  };
  const t = await ok('hr', 'POST', '/employees/' + e.id + '/salary-terms', body);
  const db = (await pool.query('SELECT * FROM employee_salary_terms WHERE id=$1', [t.id])).rows[0];
  assert(!db.encrypted_payload.includes('12345678'));
  const current = await ok('hr', 'GET', '/employees/' + e.id + '/salary-terms');
  assert.equal(current.current.payload.amount, '12345678');
  assert.equal((await request('boss', 'GET', '/employees/' + e.id + '/salary-terms')).status, 403);
  assert(!JSON.stringify(await ok('hr', 'GET', '/employees/' + e.id)).includes('12345678'));
  e = await ok('hr', 'GET', '/employees/' + e.id);
  await ok('hr', 'POST', '/employees/' + e.id + '/contracts', {
    number: 'SYNTHETIC-001',
    kind: 'OFFICIAL',
    status: 'SIGNED',
    signed_on: localDate(),
    effective_from: localDate(),
    expires_on: null,
    reason: 'Synthetic contract',
    expected_version: 0,
    expected_employee_version: e.version,
  });
  const contracts = await ok('hr', 'GET', '/employees/' + e.id + '/contracts');
  assert.equal(contracts.items.length, 1);
  assert.equal(contracts.items[0].expires_on, null);
  assert.equal(
    (
      await request('hr', 'POST', '/users/' + ids.admin + '/grants', {
        display_roles: ['CONTENT'],
        reason: 'Denied privileged target',
        expected_version: 1,
      })
    ).status,
    403,
  );
});
test('RPT01..06 · multi-role v2, completion cohort, immutable snapshot, Boss recipients and HR redaction', async () => {
  const t = await create('content', { title: 'Synthetic carryover' });
  await pool.query("UPDATE tasks SET created_at=now()-interval '30 days' WHERE id=$1", [t.id]);
  await ok('content', 'POST', '/tasks/' + t.id + '/state', {
    status: 'DONE',
    summary: 'Completed this week',
    expected_version: t.version,
  });
  const now = new Date(Date.now() + 7 * 3600e3);
  now.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  const period = now.toISOString().slice(0, 10);
  const live = await ok('content', 'GET', '/reports/live?schema_version=2&period=' + period);
  assert(live.task_sections.completed_in_period.some((r: any) => r.id === t.id));
  assert(!live.principal.some((r: any) => r.id === t.id));
  const rev = await ok('content', 'POST', '/reports/submit', {
    schema_version: 2,
    period,
    expected_draft_versions: {},
  });
  assert.equal(rev.snapshot.schema_version, 2);
  assert(rev.recipients.includes(ids.boss));
  assert(!JSON.stringify(rev.snapshot).includes('12345678'));
  const before = JSON.stringify(rev.snapshot);
  await ok('admin', 'POST', '/tasks/' + t.id + '/reopen', {
    reason: 'Synthetic correction after submission',
    expected_version: 2,
  });
  const after = await ok('boss', 'GET', '/report-revisions/' + rev.id);
  assert.equal(JSON.stringify(after.snapshot), before);
});
test('HR09/10 · birthday groups, leap day, reminder dedupe and current HR authorization', async () => {
  const feb = await ok('hr', 'GET', '/hr/birthdays?month=2');
  assert(feb.candidates.some((p: any) => p.birthday === '2000-02-29'));
  await tx((c) => hrJobs(c));
  await tx((c) => hrJobs(c));
  await runJobs();
  const dup = (
    await pool.query(
      'SELECT user_id,event_key,count(*) FROM outbox GROUP BY user_id,event_key HAVING count(*)>1',
    )
  ).rows;
  assert.equal(dup.length, 0);
});

async function syntheticSales(start: string, end: string, amount: number) {
  const wb = new ExcelJS.Workbook(),
    ws = wb.addWorksheet('Synthetic sales');
  ws.addRow(['Báo cáo đơn hàng', `thời gian:${start}-${end}`, 'Tiền tệ:VND']);
  ws.addRow(['Ngày', 'Doanh thu', 'Tổng số đơn hàng', 'Số lượng đơn đã hủy', 'SL đơn hoàn tiền']);
  for (let day = +new Date(start); day <= +new Date(end); day += 86400e3) {
    const d = new Date(day).toISOString().slice(0, 10);
    ws.addRow([d.slice(8) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4), amount, 1, 0, 0]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
async function syntheticShop() {
  const existing = (await ok('admin', 'GET', '/resources')).items.find(
    (r: any) => r.id === ids.shop,
  );
  const r = await ok('admin', 'POST', '/resources', {
    company_id: ids.company,
    platform_id: existing.platform_id,
    kind: 'SHOP',
    label: 'Synthetic concurrency ' + randomUUID(),
  });
  await ok('admin', 'PUT', '/resources/' + r.id + '/grants', {
    user_ids: [ids.market],
    permission: 'WRITE',
    reason: 'Synthetic concurrent import test',
    expected_version: 1,
  });
  return r.id;
}
test('SORT03/05/06 · exact deadline, VN midnight, NEXT7 and 150 records across signed pages', async () => {
  await tx(async (c) => {
    const a = await actor(c, ids.content),
      now = new Date('2026-11-10T07:00:00.000Z');
    for (const [title, due] of [
      ['Equal', '2026-11-10T07:00:00Z'],
      ['Tomorrow', '2026-11-10T17:00:00Z'],
      ['Day8', '2026-11-17T17:00:00Z'],
    ])
      await c.query(
        "INSERT INTO tasks(flow_mode,title,owner_id,created_by,role,status,source,due_at) VALUES('CHECKLIST',$1,$2,$2,'CONTENT','WAITING','SYNTHETIC',$3)",
        ['Boundary ' + title, a.id, due],
      );
    assert.equal(
      (await checklistList(c, a, { q: 'Boundary Equal', deadline_preset: 'OVERDUE' }, now))
        .filtered_total,
      0,
    );
    const next = await checklistList(c, a, { q: 'Boundary ', deadline_preset: 'NEXT_7_DAYS' }, now);
    assert.deepEqual(
      next.items.map((t) => t.title),
      ['Boundary Tomorrow'],
    );
    const today = await checklistList(c, a, { q: 'Boundary ', deadline_preset: 'TODAY' }, now);
    assert.deepEqual(
      today.items.map((t) => t.title),
      ['Boundary Equal'],
    );
    await c.query(
      "INSERT INTO tasks(flow_mode,title,owner_id,created_by,role,status,source,due_at,created_at) SELECT 'CHECKLIST','Pagination fixture '||n,$1,$1,'CONTENT','WAITING','SYNTHETIC','2026-12-01','2026-10-01' FROM generate_series(1,150) n",
      [a.id],
    );
    const seen = new Set<string>();
    let cursor: any = undefined;
    do {
      const page = await checklistList(
        c,
        a,
        { q: 'Pagination fixture ', limit: 30, ...(cursor ? { cursor } : {}) },
        now,
      );
      assert.equal(page.filtered_total, 150);
      assert.equal(page.facets.WAITING, 150);
      for (const t of page.items) {
        assert(!seen.has(t.id));
        seen.add(t.id);
      }
      cursor = page.next_cursor;
    } while (cursor);
    assert.equal(seen.size, 150);
  });
});
test('IMP03/05/06 · hostile archives, formulas, 1904 dates, long IDs and source period/currency validation', async () => {
  await assert.rejects(readSource(Buffer.alloc(25 * 1024 * 1024 + 1), 'oversize.csv'));
  const wb = new ExcelJS.Workbook();
  wb.properties.date1904 = true;
  const ws = wb.addWorksheet('Synthetic');
  ws.addRow(['Ngày', 'Doanh thu', 'Tổng số đơn hàng', 'Số lượng đơn đã hủy', 'SL đơn hoàn tiền']);
  ws.addRow([new Date('2026-11-02T00:00:00Z'), 123, 1, 0, 0]);
  const bytes = Buffer.from(await wb.xlsx.writeBuffer());
  const sheets = await readSource(bytes, 'dates.xlsx');
  const p = parseSource(
    sheets,
    'TIKTOK_SALES',
    { source_context: { number_locale: 'vi-VN' } },
    { start: '2026-11-02', end: '2026-11-08', basis: 'DAILY' },
  );
  assert.equal(p.facts[0].business_date, '2026-11-02');
  ws.getCell('B2').value = { formula: '1+1', result: 2 };
  const formula = parseSource(
    await readSource(Buffer.from(await wb.xlsx.writeBuffer()), 'formula.xlsx'),
    'TIKTOK_SALES',
    { source_context: { number_locale: 'vi-VN' } },
    { start: '2026-11-02', end: '2026-11-08', basis: 'DAILY' },
  );
  assert(formula.errors.some((e) => e.code === 'REQUIRE_VALUES_EXPORT'));
  const zip = await JSZip.loadAsync(bytes);
  zip.file('xl/vbaProject.bin', 'synthetic invalid macro');
  await assert.rejects(readSource(await zip.generateAsync({ type: 'nodebuffer' }), 'macros.xlsx'));
  const adapter = JSON.parse(readFileSync('config/import-adapters.json', 'utf8')).adapters.find(
    (a: any) => a.code === 'TIKTOK_RETURNS',
  );
  const header = adapter.columns.map((c: any) => c.header);
  const values = adapter.columns.map(
    (c: any) =>
      (
        ({
          order_id: 1234567890123456789,
          status_raw: 'Đã hủy',
          type_raw: 'Cancel',
          order_amount: 1,
          refund_amount: 1,
          created_at_source: '02/11/2026 09:00:00',
        }) as any
      )[c.target] ?? null,
  );
  const loss = parseSource(
    [{ name: 'Synthetic', rows: [header, values] }],
    'TIKTOK_RETURNS',
    { source_context: { number_locale: 'en-US' } },
    { start: '2026-11-02', end: '2026-11-08', basis: 'DATE_CREATED' },
  );
  assert(loss.errors.some((e) => e.code === 'ID_PRECISION_LOSS'));
  const original = sources.find((f) => f.adapter === 'TIKTOK_SALES');
  const wrongPeriod = parseSource(
    await readSource(readFileSync(sourceRoot + original.file), 'renamed.xlsx'),
    'TIKTOK_SALES',
    { source_context: { number_locale: 'vi-VN' } },
    { start: '2026-11-01', end: '2026-11-30', basis: 'DAILY', currency: 'USD' },
  );
  assert(wrongPeriod.errors.some((e) => e.code === 'PERIOD_MISMATCH'));
  assert(wrongPeriod.errors.some((e) => e.code === 'CURRENCY_MISMATCH'));
});
test('IMP07..11 · canonical duplicate, concurrent overlap, Admin revision replacement and full rollback', async () => {
  const f = sources.find((f) => f.adapter === 'TIKTOK_SALES'),
    zip = await JSZip.loadAsync(readFileSync(sourceRoot + f.file));
  zip.file('synthetic-export-marker.txt', 'SYNTHETIC changed archive bytes, identical facts');
  const b = await upload('TIKTOK_SALES', 'market', ids.shop, {
      bytes: await zip.generateAsync({ type: 'nodebuffer' }),
    }),
    p = await preview(b);
  const duplicate = await request('market', 'POST', '/imports/' + b.id + '/commit', {
    expected_version: p.version,
    preview_token: p.preview_token,
    conflict_mode: 'REJECT',
  });
  assert.equal(duplicate.data.code, 'CANONICAL_DUPLICATE');
  const shop = await syntheticShop();
  const first = await upload('TIKTOK_SALES', 'market', shop, {
      bytes: await syntheticSales('2026-11-02', '2026-11-08', 500),
      start: '2026-11-02',
      end: '2026-11-08',
    }),
    second = await upload('TIKTOK_SALES', 'market', shop, {
      bytes: await syntheticSales('2026-11-05', '2026-11-11', 600),
      start: '2026-11-05',
      end: '2026-11-11',
    });
  const pp = await Promise.all([preview(first), preview(second)]);
  const commits = await Promise.all([
    request('market', 'POST', '/imports/' + first.id + '/commit', {
      expected_version: pp[0].version,
      preview_token: pp[0].preview_token,
      conflict_mode: 'REJECT',
    }),
    request('market', 'POST', '/imports/' + second.id + '/commit', {
      expected_version: pp[1].version,
      preview_token: pp[1].preview_token,
      conflict_mode: 'REJECT',
    }),
  ]);
  assert.deepEqual(commits.map((x) => x.status).sort(), [200, 409]);
  const winner =
    commits[0].status === 200
      ? { start: '2026-11-02', end: '2026-11-08' }
      : { start: '2026-11-05', end: '2026-11-11' };
  const replacement = await upload('TIKTOK_SALES', 'admin', shop, {
    ...winner,
    bytes: await syntheticSales(winner.start, winner.end, 700),
  });
  const rp = await preview(replacement, 'admin');
  const revision = await ok('admin', 'POST', '/imports/' + replacement.id + '/commit', {
    expected_version: rp.version,
    preview_token: rp.preview_token,
    conflict_mode: 'REPLACE',
    reason: 'Synthetic corrected source evidence',
  });
  assert.equal(revision.revision, 2);
  assert.equal(
    (
      await pool.query(
        'SELECT * FROM source_revisions WHERE partition_id=(SELECT partition_id FROM source_revisions WHERE id=$1)',
        [revision.source_revision],
      )
    ).rowCount,
    2,
  );
  const rollbackShop = await syntheticShop(),
    bad = await upload('TIKTOK_SALES', 'market', rollbackShop, {
      ...winner,
      bytes: await syntheticSales(winner.start, winner.end, 123),
    }),
    bp = await preview(bad);
  await pool.query(
    'ALTER TABLE sales_daily_facts ADD CONSTRAINT synthetic_injected_failure CHECK(revenue<>123) NOT VALID',
  );
  try {
    const fail = await request('market', 'POST', '/imports/' + bad.id + '/commit', {
      expected_version: bp.version,
      preview_token: bp.preview_token,
      conflict_mode: 'REJECT',
    });
    assert.equal(fail.status, 422);
    assert.equal(
      (await pool.query('SELECT * FROM source_revisions WHERE batch_id=$1', [bad.id])).rowCount,
      0,
    );
    assert.equal(
      (await pool.query('SELECT status FROM metric_batches WHERE id=$1', [bad.id])).rows[0].status,
      'PREVIEWED',
    );
  } finally {
    await pool.query('ALTER TABLE sales_daily_facts DROP CONSTRAINT synthetic_injected_failure');
  }
});
test('IMP10/AUTH03 · permission revoked after preview and multi-role HR removal take effect immediately', async () => {
  const shop = await syntheticShop(),
    batch = await upload('TIKTOK_SALES', 'market', shop, {
      bytes: await syntheticSales('2026-11-02', '2026-11-08', 999),
    }),
    p = await preview(batch);
  await ok('admin', 'PUT', '/resources/' + shop + '/grants', {
    user_ids: [],
    permission: 'WRITE',
    reason: 'Synthetic revoke after preview',
    expected_version: 2,
  });
  const denied = await request('market', 'POST', '/imports/' + batch.id + '/commit', {
    expected_version: p.version,
    preview_token: p.preview_token,
    conflict_mode: 'REJECT',
  });
  assert.equal(denied.status, 403);
  assert.equal(
    (await pool.query('SELECT * FROM source_revisions WHERE batch_id=$1', [batch.id])).rowCount,
    0,
  );
  await ok('admin', 'PUT', '/resources/' + shop + '/grants', {
    user_ids: [ids.market],
    permission: 'WRITE',
    reason: 'Synthetic regrant changes fingerprint',
    expected_version: 3,
  });
  const stale = await request('market', 'POST', '/imports/' + batch.id + '/commit', {
    expected_version: p.version,
    preview_token: p.preview_token,
    conflict_mode: 'REJECT',
  });
  assert.equal(stale.data.code, 'ACCESS_CHANGED');
  await pool.query(
    "INSERT INTO grants(user_id,kind,role,scope,reason) VALUES($1,'JOB','CONTENT','SELF','SYNTHETIC multi-role')",
    [ids.hr],
  );
  await pool.query(
    "UPDATE grants SET revoked_at=now() WHERE user_id=$1 AND kind='JOB' AND role='HR'",
    [ids.hr],
  );
  assert.equal((await request('hr', 'GET', '/candidates')).status, 403);
  assert.equal((await request('hr', 'GET', '/content-items')).status, 200);
  assert(
    (await ok('hr', 'GET', '/notifications')).items.every(
      (n: any) => !n.event_key.startsWith('hr:'),
    ),
  );
  await pool.query(
    "UPDATE grants SET revoked_at=NULL WHERE user_id=$1 AND kind='JOB' AND role='HR'",
    [ids.hr],
  );
});
test('VID03 · manual D7 requires private evidence, precise publication and exactly 168 hours', async () => {
  const p = (await ok('content', 'GET', '/publications')).items.find(
    (p: any) => p.origin === 'HISTORICAL_IMPORT',
  );
  const dated = await ok('content', 'POST', '/publications/' + p.id + '/confirm-date', {
    published_at: '2026-06-01T01:00:00.000Z',
    precision: 'MINUTE',
    source: 'SYNTHETIC explicit date confirmation',
    expected_version: p.version,
  });
  const boundary = 'evidence-' + randomUUID(),
    s = sessions.content;
  const bytes = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="record_id"\r\n\r\n${p.id}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="synthetic-proof.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4\nSYNTHETIC TEST WINDOW EVIDENCE\r\n--${boundary}--\r\n`,
  );
  const upload = await app.inject({
    method: 'POST',
    url: '/api/v1/assets',
    headers: {
      cookie: s.cookie,
      'x-csrf-token': s.csrf,
      'idempotency-key': randomUUID(),
      'content-type': 'multipart/form-data; boundary=' + boundary,
    },
    payload: bytes,
  });
  assert.equal(upload.statusCode, 200, upload.body);
  const body = {
    expected_version: dated.version,
    window_start: '2026-06-01T01:00:00.000Z',
    window_end: '2026-06-08T01:00:00.000Z',
    metric: 'GMV',
    value: '123.45',
    currency: 'VND',
    attribution_key: 'PUBLISHED_168H',
    source_asset_id: upload.json().id,
    source_basis:
      'SYNTHETIC source document with explicit published 168h attribution; not company data',
    confirmed: true,
  };
  assert.equal(
    (
      await request('content', 'POST', '/publications/' + p.id + '/window-facts', {
        ...body,
        window_end: '2026-06-08T02:00:00.000Z',
      })
    ).data.code,
    'WINDOW_NOT_COMPARABLE',
  );
  const ready = await ok('content', 'POST', '/publications/' + p.id + '/window-facts', body);
  assert.equal(ready.d7.status, 'READY');
  assert.equal(ready.d7.gmv, '123.4500000000');
  await assert.rejects(
    pool.query('UPDATE video_window_facts SET value=0 WHERE publication_id=$1', [p.id]),
    /immutable historical record/,
  );
});
test('HR05/07/08 · future salary, same-date correction, contract revisions, future leave and no phase reset', async () => {
  let e = await ok('hr', 'GET', '/employees/' + ids.employee);
  const future = {
    phase: 'PROBATION',
    effective_from: '2035-01-01',
    currency: 'VND',
    payload: { amount: '555', gross_or_net: 'NET', basis: 'SYNTHETIC future salary' },
    expected_employee_version: e.version,
  };
  await ok('hr', 'POST', '/employees/' + e.id + '/salary-terms', future);
  const terms = await ok('hr', 'GET', '/employees/' + e.id + '/salary-terms');
  assert.equal(terms.current.payload.amount, '12345678');
  assert.equal(terms.future[0].payload.amount, '555');
  e = await ok('hr', 'GET', '/employees/' + e.id);
  await ok('hr', 'POST', '/employees/' + e.id + '/salary-terms', {
    phase: 'PROBATION',
    effective_from: terms.current.effective_from,
    currency: 'VND',
    payload: {
      amount: '222',
      gross_or_net: 'GROSS',
      basis: 'SYNTHETIC correction',
      reason: 'SYNTHETIC corrected evidence',
    },
    supersedes_id: terms.current.id,
    expected_employee_version: e.version,
  });
  assert.equal(
    (await ok('hr', 'GET', '/employees/' + e.id + '/salary-terms')).current.payload.amount,
    '222',
  );
  e = await ok('hr', 'GET', '/employees/' + e.id);
  const contracts = await ok('hr', 'GET', '/employees/' + e.id + '/contracts'),
    co = contracts.items[0];
  await ok('hr', 'POST', '/employees/' + e.id + '/contracts', {
    contract_id: co.id,
    number: co.number,
    kind: 'OFFICIAL',
    status: 'ACTIVE',
    signed_on: co.signed_on,
    effective_from: co.effective_from,
    expires_on: null,
    reason: 'SYNTHETIC contract correction',
    expected_version: co.version,
    expected_employee_version: e.version,
  });
  const history = await ok('hr', 'GET', '/employees/' + e.id + '/contracts');
  assert.equal(history.history.length, 2);
  assert.equal(history.history[0].status, 'SIGNED');
  e = await ok('hr', 'GET', '/employees/' + e.id);
  await ok('hr', 'POST', '/employees/' + e.id + '/leave', {
    left_on: '2035-01-01',
    reason: 'SYNTHETIC future leave',
    confirm_disable: true,
    expected_version: e.version,
  });
  const planned = await ok('hr', 'GET', '/employees/' + e.id);
  assert.equal(planned.employment_state, 'PROBATION');
  assert.equal(planned.linked_user.active, true);
});

test('AUTH06 · Admin password reset revokes old sessions and persists only Argon2 hash', async () => {
  const e = await ok('hr', 'GET', '/employees/' + ids.employee),
    uid = e.linked_user.id;
  const u = (await pool.query('SELECT username,permission_version FROM users WHERE id=$1', [uid]))
    .rows[0];
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: u.username, password },
  });
  assert.equal(login.statusCode, 200);
  const cookie = String(login.headers['set-cookie']).split(';')[0];
  const newPassword = randomBytes(24).toString('base64url'),
    key = randomUUID();
  await ok(
    'admin',
    'POST',
    '/users/' + uid + '/reset-password',
    { new_password: newPassword, expected_version: u.permission_version },
    key,
  );
  const denied = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });
  assert.equal(denied.statusCode, 401);
  const row = (await pool.query('SELECT password_hash FROM users WHERE id=$1', [uid])).rows[0];
  assert(row.password_hash.startsWith('$argon2id$'));
  assert(await verify(row.password_hash, newPassword));
  assert(
    !JSON.stringify(
      (await pool.query('SELECT response FROM idempotency WHERE key=$1', [key])).rows,
    ).includes(newPassword),
  );
});
test('IMP02/05/07/MET03/05/09 · wrong source, duplicate bytes, exact ratios and missing coverage', async () => {
  assert.equal(sourcePercent('1.39%', 'en-US'), '0.0139');
  const f = sources.find((f) => f.adapter === 'KOC_SALES');
  const wrong = parseSource(
    await readSource(readFileSync(sourceRoot + f.file), 'arbitrary.xlsx'),
    'TIKTOK_SALES',
    { source_context: { number_locale: 'vi-VN' } },
    { start: '2026-11-02', end: '2026-11-08', basis: 'DAILY' },
  );
  assert(wrong.errors.some((e) => e.code === 'MISSING_COLUMN'));
  assert.equal(wrong.facts.length, 0);
  await assert.rejects(upload('TIKTOK_SALES'), /ALREADY_IMPORTED/);
  const sales = await ok(
    'market',
    'GET',
    `/sales/summary?company_id=${ids.company}&resource_id=${ids.shop}&from=2026-11-02&to=2026-11-08`,
  );
  assert.equal(sales.summary.cancelled_orders, '100');
  assert.equal(sales.summary.refunded_orders, '4');
  assert(Math.abs(Number(sales.summary.refund_rate) - 4 / 930) < 1e-12);
  const incomplete = await ok(
    'market',
    'GET',
    `/sales/summary?company_id=${ids.company}&resource_id=${ids.shop}&from=2026-11-01&to=2026-11-08`,
  );
  assert.equal(incomplete.availability, 'INCOMPLETE');
  assert.equal(incomplete.summary.days, 7);
  const koc = await ok(
    'market',
    'GET',
    `/koc/summary?company_id=${ids.company}&resource_id=${ids.shop}&from=2026-11-02&to=2026-11-08`,
  );
  assert(Math.abs(Number(koc.top10[0].share) - 16201794 / 52399786) < 1e-12);
  const defs = JSON.parse(readFileSync('config/import-adapters.json', 'utf8')).adapters.find(
    (a: any) => a.code === 'TIKTOK_RETURNS',
  );
  const header = defs.columns.map((c: any) => c.header);
  const row = defs.columns.map(
    (c: any) =>
      (
        ({
          order_id: '000001234567890123456789',
          status_raw: 'Unknown new status',
          type_raw: 'Cancel',
          order_amount: '1',
          refund_amount: '0',
          created_at_source: '02/11/2026 09:00:00',
        }) as any
      )[c.target] ?? null,
  );
  const bad = parseSource(
    [{ name: 'Synthetic', rows: [header, row] }],
    'TIKTOK_RETURNS',
    { source_context: { number_locale: 'en-US' } },
    { start: '2026-11-02', end: '2026-11-08', basis: 'DATE_CREATED' },
  );
  assert(bad.errors.some((e) => e.code === 'UNMAPPED_STATUS'));
});
test('RPT03 · multiple current jobs share one immutable container and never duplicate task IDs', async () => {
  const g = (
    await pool.query(
      "INSERT INTO grants(user_id,kind,role,scope,reason) VALUES($1,'JOB','HR','SELF','SYNTHETIC report multi-role') RETURNING id",
      [ids.content],
    )
  ).rows[0];
  try {
    const n = new Date(Date.now() + 7 * 3600e3);
    n.setUTCDate(n.getUTCDate() - ((n.getUTCDay() + 6) % 7));
    const period = n.toISOString().slice(0, 10);
    const report = await ok('content', 'POST', '/reports/submit', {
      schema_version: 2,
      period,
      expected_draft_versions: {},
    });
    assert.deepEqual([...report.snapshot.roles].sort(), ['CONTENT', 'HR']);
    assert.equal(
      report.snapshot.task_sections.unique_tasks.length,
      new Set(report.snapshot.task_sections.unique_tasks).size,
    );
    assert.equal(
      (
        await pool.query('SELECT * FROM reports WHERE user_id=$1 AND period=$2', [
          ids.content,
          period,
        ])
      ).rowCount,
      1,
    );
  } finally {
    await pool.query('UPDATE grants SET revoked_at=now() WHERE id=$1', [g.id]);
  }
});

test('SORT05/IMP12/RPT04/05 · combined scope filters, absent source availability and late Boss notification', async () => {
  await tx(async (c) => {
    const a = await actor(c, ids.boss);
    const all = await checklistList(c, a, {
      scope: 'team',
      q: 'sort-fixture-',
      owner_ids: ids.content,
      team_ids: ids.team,
      job_codes: 'CONTENT,HR',
      statuses: 'WAITING,DONE',
      status_group: 'CUSTOM',
    });
    assert.equal(all.filtered_total, 6);
    const none = await checklistList(c, a, {
      scope: 'team',
      q: 'sort-fixture-',
      owner_ids: ids.content,
      team_ids: randomUUID(),
      statuses: 'WAITING,DONE',
    });
    assert.equal(none.filtered_total, 0);
  });
  const old = (
    await pool.query('SELECT company_id FROM business_resources WHERE id=$1', [ids.shop])
  ).rows[0];
  assert.equal(old.company_id, ids.company);
  assert.equal(
    (
      await request(
        'market',
        'GET',
        `/sales/summary?company_id=${randomUUID()}&resource_id=${ids.shop}&from=2026-11-02&to=2026-11-08`,
      )
    ).status,
    422,
  );
  const shopee = await ok(
    'market',
    'GET',
    `/sales/summary?company_id=${ids.company}&resource_id=${ids.shopee}&from=2026-11-02&to=2026-11-08`,
  );
  assert.equal(shopee.summary.orders, '360');
  assert.equal(shopee.summary.cancelled_orders, '36');
  assert.equal(shopee.summary.refunded_orders, '2');
  const unmatched = await ok(
    'market',
    'GET',
    `/koc/summary?company_id=${ids.company}&resource_id=${ids.shop}&from=2026-11-01&to=2026-11-07`,
  );
  assert.equal(unmatched.availability, 'UNCONFIRMED_PERIOD');
  assert.equal(unmatched.summary.gmv, null);
  const report = await ok('content', 'POST', '/reports/submit', {
    schema_version: 2,
    period: '2026-11-02',
    expected_draft_versions: {},
  });
  assert.equal(report.snapshot.submitted_late, true);
  assert.equal(report.snapshot.availability, 'INCOMPLETE');
  await runJobs();
  const notices = await ok('boss', 'GET', '/notifications');
  assert(
    notices.items.some(
      (n: any) =>
        n.object_id === report.id &&
        n.object_type === 'REPORT_REVISION' &&
        n.event_type === 'REPORT_SUBMITTED',
    ),
  );
  const b = (await pool.query('SELECT birthday FROM employee_profiles WHERE id=$1', [ids.employee]))
    .rows[0];
  assert.equal(b.birthday, '2000-02-29');
  const missing = await ok('hr', 'GET', '/hr/birthdays?month=11&missing=true');
  assert(missing.employees.every((e: any) => e.birthday === null));
});

test('HR03/10/MET05/RPT06 · injected provisioning rollback, catch-up once, zero denominator and literal XLSX strings', async () => {
  const day = new Date(Date.now() + 7 * 3600e3 + 2 * 86400e3).toISOString().slice(0, 10),
    code = 'ATOMIC-' + randomUUID();
  const e = await ok('hr', 'POST', '/employees', {
    employee_code: code,
    name: 'Synthetic atomic provision',
    joined_on: localDate(),
    phase: 'PROBATION',
    employment_type: 'FULL_TIME',
    team_id: ids.team,
    positions: ['CONTENT'],
    probation_end: day,
  });
  await tx((c) => hrJobs(c));
  await tx((c) => hrJobs(c));
  const reminders = (
    await pool.query(
      "SELECT * FROM outbox WHERE object_id=$1 AND user_id=$2 AND event_type='PROBATION_END'",
      [e.id, ids.hr],
    )
  ).rows;
  assert.equal(reminders.length, 1);
  assert(reminders[0].event_key.includes('OVERDUE_MILESTONE'));
  await pool.query(
    `CREATE FUNCTION synthetic_fail_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${e.id}'::uuid AND NEW.user_id IS NOT NULL THEN RAISE EXCEPTION 'synthetic injected link failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`,
  );
  await pool.query(
    'CREATE TRIGGER synthetic_fail_link BEFORE UPDATE ON employee_profiles FOR EACH ROW EXECUTE FUNCTION synthetic_fail_link()',
  );
  const username = 'atomic_' + randomUUID().slice(0, 8);
  try {
    const r = await request('hr', 'POST', '/users', {
      employee_id: e.id,
      name: e.name,
      username,
      initial_password: password,
      display_roles: ['CONTENT'],
      reason: 'SYNTHETIC rollback injection',
    });
    assert.equal(r.status, 422);
    assert.equal(
      (await pool.query('SELECT * FROM users WHERE username=$1', [username])).rowCount,
      0,
    );
    assert.equal(
      (await pool.query('SELECT user_id FROM employee_profiles WHERE id=$1', [e.id])).rows[0]
        .user_id,
      null,
    );
  } finally {
    await pool.query('DROP TRIGGER synthetic_fail_link ON employee_profiles');
    await pool.query('DROP FUNCTION synthetic_fail_link()');
  }
  const adapter = JSON.parse(readFileSync('config/import-adapters.json', 'utf8')).adapters.find(
    (a: any) => a.code === 'KOC_SALES',
  );
  const wb = new ExcelJS.Workbook(),
    sheet = wb.addWorksheet('Synthetic zero source');
  sheet.addRow(adapter.columns.map((c: any) => c.header));
  sheet.addRow(adapter.columns.map((c: any) => (c.type === 'TEXT' ? null : 'Tổng GMV mô tả')));
  sheet.addRow(
    adapter.columns.map((c: any) => (c.target === 'creator_key' ? '000_zero_creator' : 0)),
  );
  const shop = await syntheticShop(),
    batch = await upload('KOC_SALES', 'market', shop, {
      bytes: Buffer.from(await wb.xlsx.writeBuffer()),
    }),
    previewed = await preview(batch);
  assert.equal(previewed.errors.length, 0);
  await ok('market', 'POST', '/imports/' + batch.id + '/commit', {
    expected_version: previewed.version,
    preview_token: previewed.preview_token,
    conflict_mode: 'REJECT',
  });
  const zero = await ok(
    'market',
    'GET',
    `/koc/summary?company_id=${ids.company}&resource_id=${shop}&from=2026-11-02&to=2026-11-08`,
  );
  assert.equal(zero.top10[0].share, null);
  assert.equal(zero.top10[0].creator_key, '000_zero_creator');
  const period = '2026-10-26';
  await ok('content', 'PUT', '/reports/draft', {
    period,
    role: 'COMMON',
    narrative: { results: '=SUM(1,2)', difficulties: '', support: '', next_week: '00123' },
    expected_version: 0,
  });
  const report = await ok('content', 'POST', '/reports/submit', {
    schema_version: 2,
    period,
    expected_draft_versions: { COMMON: 1 },
  });
  const s = sessions.boss;
  const exported = await app.inject({
    method: 'GET',
    url: '/api/v1/report-revisions/' + report.id + '/export',
    headers: { cookie: s.cookie },
  });
  assert.equal(exported.statusCode, 200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(exported.rawPayload as any);
  let literal = false,
    leading = false;
  book.eachSheet((sh) =>
    sh.eachRow((row) =>
      row.eachCell((cell) => {
        if (cell.value === '=SUM(1,2)') {
          literal = true;
          assert.equal(cell.formula, undefined);
        }
        if (cell.value === '00123') leading = true;
      }),
    ),
  );
  assert(literal && leading);
});
