import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hash as passwordHash } from 'argon2';
import ExcelJS from 'exceljs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pool, tx, one, rows, actor, localDate } from '../server/base.js';
import { migrate } from '../server/cli.js';
import { buildApp } from '../server/app.js';
import { orderReminders, addDays, videoState, orderPeriod } from '../server/orders.js';
import { runJobs } from '../server/worker.js';
const clients: Record<string, any> = {},
  ids: Record<string, string> = {};
const suffix = randomUUID().slice(0, 8),
  password = 'Orders-Test-' + randomUUID();
let app: Awaited<ReturnType<typeof buildApp>>, sku: string, sku2: string, order: any;
async function request(
  who: string,
  method: string,
  path: string,
  payload?: any,
  headers: any = {},
) {
  return app.inject({
    method: method as any,
    url: '/api/v1' + path,
    payload,
    headers: {
      cookie: clients[who]?.cookie || '',
      'x-csrf-token': clients[who]?.csrf || '',
      'idempotency-key': randomUUID(),
      ...headers,
    },
  });
}
async function ok(who: string, method: string, path: string, payload?: any) {
  const r = await request(who, method, path, payload);
  assert.equal(r.statusCode, 200, r.body);
  return r.json();
}
const input = (code: string, overrides: any = {}) => ({
  order_code: code,
  carrier: 'SPX',
  kind: 'CUSTOMER',
  recipient_name: 'Người nhận kiểm thử',
  phone: '0901234567',
  city: 'TP Hồ Chí Minh',
  ward: 'Phường Sài Gòn',
  address: '12 Đường thử nghiệm',
  status: 'CREATED',
  shipping_cost: 25000,
  revenue: 300000,
  order_date: localDate(),
  shipped_on: null,
  delivered_on: null,
  items: [
    { sku_id: sku, quantity: 2 },
    { sku_id: sku2, quantity: 3 },
  ],
  ...overrides,
});
const clean = (o: any) =>
  Object.fromEntries(
    [
      'order_code',
      'carrier',
      'tracking_number',
      'kind',
      'recipient_name',
      'phone',
      'city',
      'ward',
      'address',
      'status',
      'shipping_cost',
      'revenue',
      'order_date',
      'shipped_on',
      'delivered_on',
      'note',
      'items',
    ].map((k) => [
      k,
      k === 'items'
        ? o.items.map((i: any) => ({ sku_id: i.sku_id, quantity: i.quantity }))
        : ['shipping_cost', 'revenue'].includes(k)
          ? Number(o[k])
          : o[k],
    ]),
  );
before(async () => {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /_test$/);
  await migrate();
  app = await buildApp();
  const hashed = await passwordHash(password);
  await tx(async (c) => {
    for (const [name, role] of [
      ['admin', 'ADMIN'],
      ['boss', 'BOSS'],
      ['market', 'MARKETPLACE'],
      ['market2', 'MARKETPLACE'],
      ['content', 'CONTENT'],
    ]) {
      const u = await one(
        c,
        'INSERT INTO users(username,name,password_hash) VALUES($1,$2,$3) RETURNING id',
        [`orders_${name}_${suffix}`, name, hashed],
      );
      ids[name] = u.id;
      await c.query(
        "INSERT INTO grants(user_id,kind,role,scope,reason) VALUES($1,$2,$3,$4,'orders test')",
        [
          u.id,
          ['ADMIN', 'BOSS'].includes(role) ? 'ACCESS' : 'JOB',
          role,
          ['ADMIN', 'BOSS'].includes(role) ? 'ALL' : 'SELF',
        ],
      );
      if (name === 'market')
        await c.query(
          "INSERT INTO employee_profiles(created_by,user_id,name,employee_code,employment_state) VALUES($1,$1,'Vận hành thử nghiệm',$2,'OFFICIAL')",
          [u.id, 'EC01-' + suffix],
        );
    }
  });
  for (const name of Object.keys(ids)) {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: `orders_${name}_${suffix}`, password },
      remoteAddress: '127.0.1.' + (Object.keys(clients).length + 1),
    });
    assert.equal(r.statusCode, 200, r.body);
    clients[name] = {
      cookie: r.headers['set-cookie']!.toString().split(';')[0],
      csrf: r.json().csrf,
    };
  }
  await ok('market', 'POST', '/shipping-products', {
    code: 'TEST-SP-' + suffix,
    name: 'Bộ sản phẩm',
    skus: [
      { code: 'TEST-RED-' + suffix, name: 'Đỏ' },
      { code: 'TEST-BLUE-' + suffix, name: 'Xanh' },
    ],
  });
  const products = await ok('market', 'GET', '/shipping-products');
  const p = products.items.find((p: any) => p.code === 'TEST-SP-' + suffix);
  sku = p.skus[0].id;
  sku2 = p.skus[1].id;
  mkdirSync(process.env.DATA_DIR!, { recursive: true });
  writeFileSync(
    resolve(process.env.DATA_DIR!, 'orders-browser-auth.json'),
    JSON.stringify({
      password,
      users: Object.fromEntries(Object.keys(ids).map((k) => [k, `orders_${k}_${suffix}`])),
    }),
  );
});
after(async () => {
  await app?.close();
  await pool.end();
});
test('Order date rules: Monday/Sunday, month boundary, 7/15 calendar days from actual receipt', () => {
  assert.deepEqual(orderPeriod({ range: 'WEEK', date: '2026-11-08' }), {
    from: '2026-11-02',
    to: '2026-11-09',
    previousFrom: '2026-10-26',
    previousTo: '2026-11-02',
  });
  assert.deepEqual(orderPeriod({ range: 'MONTH', date: '2026-01-08' }), {
    from: '2026-01-01',
    to: '2026-02-01',
    previousFrom: '2025-12-01',
    previousTo: '2026-01-01',
  });
  const o = { kind: 'KOC', status: 'DELIVERED', delivered_on: '2026-11-01', video_url: '' };
  assert.equal(videoState(o, '2026-11-07'), 'WAITING_VIDEO');
  assert.equal(videoState(o, '2026-11-08'), 'WARNING_1');
  assert.equal(videoState(o, '2026-11-16'), 'WARNING_2');
  assert.equal(videoState({ ...o, status: 'RETURNING' }, '2026-11-16'), 'STOPPED');
});
test('All operational users read/write shared orders; BOSS read/export only; other roles denied; immutable creator', async () => {
  order = await ok('market', 'POST', '/orders', input('ORD-' + suffix));
  assert.equal(order.responsible_id, ids.market);
  assert.equal(order.created_by, ids.market);
  assert.equal(order.employee_code, 'EC01-' + suffix);
  assert.equal(order.items.length, 2);
  const visible = await ok('market2', 'GET', '/orders/' + order.id);
  assert.equal(visible.id, order.id);
  for (const who of ['market', 'market2', 'admin', 'boss'])
    assert.equal((await request(who, 'GET', '/orders/' + order.id)).statusCode, 200);
  for (const path of ['/orders', '/orders/' + order.id, '/shipping-products', '/order-imports'])
    assert.equal((await request('content', 'GET', path)).statusCode, 403);
  const bossMe = await ok('boss', 'GET', '/me');
  assert(bossMe.capabilities.menu_groups.flatMap((g: any) => g.items).includes('orders'));
  assert.equal(bossMe.capabilities.orders_write, false);
  for (const who of ['boss', 'content']) {
    assert.equal(
      (await request(who, 'POST', '/orders', input('BLOCKED-' + suffix))).statusCode,
      403,
    );
    assert.equal(
      (
        await request(who, 'PATCH', '/orders/' + order.id, {
          ...clean(order),
          expected_version: order.version,
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await request(who, 'POST', '/shipping-products', {
          code: 'BLOCK',
          name: 'Block',
          skus: [{ code: 'BLOCK' }],
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await request(who, 'POST', '/orders/' + order.id + '/video', {
          url: 'https://example.com/video',
          published_on: localDate(),
          expected_version: order.version,
        })
      ).statusCode,
      403,
    );
  }
  assert.equal(
    (
      await request('market', 'POST', '/orders', {
        ...input('FORGED-' + suffix),
        responsible_id: ids.admin,
      })
    ).statusCode,
    422,
  );
  const updated = await ok('market2', 'PATCH', '/orders/' + order.id, {
    ...clean(order),
    note: 'Người vận hành khác cập nhật',
    expected_version: order.version,
  });
  assert.equal(updated.responsible_id, ids.market);
  assert.equal(updated.created_by, ids.market);
  assert.equal(
    (
      await request('market', 'PATCH', '/orders/' + order.id, {
        ...clean(order),
        expected_version: order.version,
      })
    ).statusCode,
    409,
  );
  order = updated;
});
test('Delivery records collection on actual delivery date, reports count orders once and goods by SKU', async () => {
  const old = addDays(localDate(), -40);
  order = await ok('market', 'PATCH', '/orders/' + order.id, {
    ...clean(order),
    order_date: old,
    shipped_on: old,
    delivered_on: localDate(),
    status: 'DELIVERED',
    expected_version: order.version,
  });
  assert.equal(order.collected_on, localDate());
  const summary = await ok('boss', 'GET', '/orders/summary?range=WEEK&date=' + localDate());
  assert(Number(summary.current.revenue) >= 300000);
  const oldSummary = await ok('boss', 'GET', '/orders/summary?range=WEEK&date=' + old);
  assert(oldSummary.current.total >= 1);
  assert(Number(oldSummary.current.shipping_cost) >= 25000);
  assert(oldSummary.current.units >= 5);
  const exported = await request(
    'boss',
    'GET',
    '/orders/export?search=' + encodeURIComponent('ORD-' + suffix),
  );
  assert.equal(exported.statusCode, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(exported.rawPayload as any);
  const sheet = wb.worksheets[0];
  assert.equal(sheet.rowCount, 3);
  assert.equal(sheet.getCell(2, 4).value, '0901234567');
  assert.equal(sheet.getCell(2, 12).value, 25000);
  assert.equal(sheet.getCell(3, 12).value, null);
  const report = await request(
    'boss',
    'GET',
    '/orders/report-export?range=MONTH&date=' + localDate(),
  );
  assert.equal(report.statusCode, 200);
  const beforeUnits = (await ok('market', 'GET', '/orders/summary?range=WEEK&date=' + localDate()))
    .current.units;
  await ok(
    'market',
    'POST',
    '/orders',
    input('DELIVERED-NO-SHIP-' + suffix, { status: 'DELIVERED', delivered_on: localDate() }),
  );
  const afterUnits = (await ok('market', 'GET', '/orders/summary?range=WEEK&date=' + localDate()))
    .current.units;
  assert.equal(
    afterUnits - beforeUnits,
    5,
    'Delivered goods count even when SPX file has no separate dispatch date',
  );
  assert.equal(
    (await request('market', 'POST', '/orders', input('BAD-' + suffix, { status: 'DELIVERED' })))
      .statusCode,
    422,
  );
});
test('Backdated KOC: one reminder per threshold; only responsible user notified; video/returns stop reminders and unread badge', async () => {
  let koc = await ok(
    'market',
    'POST',
    '/orders',
    input('KOC-' + suffix, {
      kind: 'KOC',
      revenue: 0,
      order_date: addDays(localDate(), -20),
      shipped_on: addDays(localDate(), -19),
      delivered_on: addDays(localDate(), -8),
      status: 'DELIVERED',
    }),
  );
  assert.equal(koc.video_state, 'WARNING_1');
  await tx((c) => orderReminders(c));
  await runJobs();
  await runJobs();
  let inbox = await ok('market', 'GET', '/notifications?category=KOC');
  const reminders = inbox.items.filter((n: any) => n.object_id === koc.id);
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].event_type, 'KOC_VIDEO_1');
  assert.equal(reminders[0].action_path, '/orders/' + koc.id);
  assert(inbox.koc_unread_count >= 1);
  assert(
    !(await ok('market2', 'GET', '/notifications')).items.some((n: any) => n.object_id === koc.id),
  );
  const future = addDays(localDate(), 8);
  await tx((c) => orderReminders(c, future));
  await runJobs();
  inbox = await ok('market', 'GET', '/notifications?category=KOC');
  assert.equal(inbox.items.filter((n: any) => n.object_id === koc.id).length, 2);
  assert.equal(inbox.items.filter((n: any) => n.object_id === koc.id && !n.read_at).length, 1);
  assert.equal(
    (
      await request('market', 'POST', '/orders/' + koc.id + '/video', {
        url: '',
        published_on: localDate(),
        expected_version: koc.version,
      })
    ).statusCode,
    422,
  );
  koc = await ok('market', 'POST', '/orders/' + koc.id + '/video', {
    url: 'https://example.com/koc/video',
    published_on: localDate(),
    expected_version: koc.version,
  });
  assert.equal(koc.video_state, 'COMPLETED');
  assert.equal(
    (await ok('market', 'GET', '/notifications?category=KOC')).items.filter(
      (n: any) => n.object_id === koc.id && !n.read_at,
    ).length,
    0,
  );
  let returned = await ok(
    'market',
    'POST',
    '/orders',
    input('RETURN-' + suffix, {
      kind: 'KOC',
      revenue: 0,
      order_date: addDays(localDate(), -20),
      shipped_on: addDays(localDate(), -19),
      delivered_on: addDays(localDate(), -16),
      status: 'DELIVERED',
    }),
  );
  await runJobs();
  returned = await ok('market', 'PATCH', '/orders/' + returned.id, {
    ...clean(returned),
    status: 'RETURNING',
    expected_version: returned.version,
  });
  assert.equal(returned.video_state, 'STOPPED');
  await runJobs();
  const active = (
    await ok('market', 'GET', '/notifications?category=KOC&unread=true')
  ).items.filter((n: any) => n.object_id === returned.id);
  assert.equal(active.length, 0);
});
function multipart(bytes: Buffer, name: string) {
  const boundary = 'orders-' + randomUUID();
  return {
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    headers: { 'content-type': 'multipart/form-data; boundary=' + boundary },
  };
}
test('SPX file mapping/preview: multi SKU grouped, original date retained, atomic updates and stale preview blocked', async () => {
  const wb = new ExcelJS.Workbook(),
    sh = wb.addWorksheet('SPX'),
    product = (await ok('market', 'GET', '/shipping-products')).items.find(
      (p: any) => p.code === 'TEST-SP-' + suffix,
    );
  const headers = [
    'Mã đơn',
    'Vận đơn',
    'Tên',
    'SĐT',
    'TP',
    'Xã',
    'Đường',
    'SKU',
    'SL',
    'Ship',
    'Thu',
    'Ngày',
    'Trạng thái',
  ];
  sh.addRow(headers);
  for (const s of product.skus)
    sh.addRow([
      'SPX-' + suffix,
      'TRACK-' + suffix,
      'KOC thử nghiệm',
      '0901234567',
      'HCM',
      'Sài Gòn',
      '12 Đường mẫu',
      s.code,
      2,
      '25.000',
      '0',
      '01/11/2026',
      'Đã tạo',
    ]);
  const body = multipart(Buffer.from(await wb.xlsx.writeBuffer()), 'spx-test.xlsx');
  const upload = await request('market', 'POST', '/order-imports', body.payload, body.headers);
  assert.equal(upload.statusCode, 200, upload.body);
  const batch = upload.json();
  assert.deepEqual(batch.column_values[12], ['Đã tạo']);
  const columns = Object.fromEntries(
    [
      'order_code',
      'tracking_number',
      'recipient_name',
      'phone',
      'city',
      'ward',
      'address',
      'sku',
      'quantity',
      'shipping_cost',
      'revenue',
      'order_date',
      'status',
    ].map((k, i) => [k, i]),
  );
  const config = {
    columns,
    statuses: { 'Đã tạo': 'CREATED' },
    default_kind: 'KOC',
    date_format: 'DMY',
    money_format: 'VI',
  };
  let preview = await ok('market', 'POST', '/order-imports/' + batch.id + '/preview', config);
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.new_count, 1);
  assert.equal(preview.orders[0].input.items.length, 2);
  assert.equal(preview.orders[0].input.order_date, '2026-11-01');
  assert.equal(
    (
      await request('boss', 'POST', '/order-imports/' + batch.id + '/commit', {
        preview_token: preview.preview_token,
      })
    ).statusCode,
    403,
  );
  await ok('market', 'POST', '/order-imports/' + batch.id + '/commit', {
    preview_token: preview.preview_token,
  });
  const imported = (await ok('market2', 'GET', '/orders?search=SPX-' + suffix)).items[0];
  assert.equal(imported.items.length, 2);
  assert.equal(imported.import_id, batch.id);
  assert.equal(imported.created_by, ids.market);
  assert.equal(imported.responsible_id, ids.market);
  assert.equal(imported.uploader_username, `orders_market_${suffix}`);
  assert.equal(
    (
      await request('market', 'POST', '/order-imports/' + batch.id + '/commit', {
        preview_token: preview.preview_token,
      })
    ).statusCode,
    409,
  );
  const again = await request('market2', 'POST', '/order-imports', body.payload, body.headers);
  const batch2 = again.json();
  preview = await ok('market2', 'POST', '/order-imports/' + batch2.id + '/preview', config);
  assert.equal(preview.update_count, 1);
  const newer = await ok('market', 'PATCH', '/orders/' + imported.id, {
    ...clean(imported),
    note: 'Cập nhật sau khi xem trước',
    expected_version: imported.version,
  });
  assert(newer.version > imported.version);
  assert.equal(
    (
      await request('market2', 'POST', '/order-imports/' + batch2.id + '/commit', {
        preview_token: preview.preview_token,
      })
    ).statusCode,
    409,
  );
  preview = await ok('market2', 'POST', '/order-imports/' + batch2.id + '/preview', config);
  await ok('market2', 'POST', '/order-imports/' + batch2.id + '/commit', {
    preview_token: preview.preview_token,
  });
  const result = await ok('market', 'GET', '/orders/' + imported.id);
  assert.equal(result.created_by, ids.market);
  assert.equal(result.responsible_id, ids.market);
  assert.equal(result.uploader_username, `orders_market2_${suffix}`);
  assert.equal(result.import_id, batch.id);
  assert.equal(result.last_import_id, batch2.id);
  const badConfig = { ...config, statuses: {} };
  preview = await ok('market', 'POST', '/order-imports/' + batch2.id + '/preview', badConfig).catch(
    () => null,
  );
  assert.equal(preview, null);
});
