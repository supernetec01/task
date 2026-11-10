import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const auth = JSON.parse(
  readFileSync(resolve(process.env.DATA_DIR || 'data', 'orders-browser-auth.json'), 'utf8'),
);
const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
async function login(page: Page, who: string) {
  await page.goto('/');
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(auth.users[who]);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(auth.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.locator('.sidebar')).toBeAttached();
  await nav(page);
}
async function nav(page: Page) {
  await expect(page.locator('.sidebar')).toBeAttached();
  if (await page.getByRole('button', { name: 'Mở menu' }).isVisible())
    await page.getByRole('button', { name: 'Mở menu' }).click();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'Quản lý đơn hàng', exact: true })
    .click();
}
async function call(page: Page, path: string, body?: any) {
  return page.evaluate(
    async ({ path, body }) => {
      const me = await (await fetch('/api/v1/me')).json();
      const r = await fetch('/api/v1' + path, {
        method: body ? 'POST' : 'GET',
        headers: body
          ? {
              'content-type': 'application/json',
              'x-csrf-token': me.csrf,
              'idempotency-key': crypto.randomUUID(),
            }
          : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!r.ok) throw Error(await r.text());
      return r.json();
    },
    { path, body },
  );
}
test('Orders UI: create product with 2 SKUs, create delivered order, preserve data and export filtered XLSX', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, 'market');
  await expect(page.getByRole('heading', { name: 'Hiệu quả gửi hàng' })).toBeVisible();
  await page.getByRole('tab', { name: 'Sản phẩm & SKU', exact: true }).click();
  await page.getByRole('button', { name: '+ Tạo sản phẩm', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Tạo sản phẩm', exact: true });
  const key = info.project.name + '-' + Date.now(),
    code = 'UI-SP-' + key,
    sku = 'UI-SKU-' + key;
  await dialog.getByLabel('Mã sản phẩm', { exact: true }).fill(code);
  await dialog.getByLabel('Tên sản phẩm', { exact: true }).fill('Sản phẩm giao diện');
  await dialog.getByLabel('Mã SKU', { exact: true }).fill(sku);
  await dialog.getByLabel('Tên phân loại / SKU', { exact: true }).fill('Đỏ');
  await dialog.getByRole('button', { name: '+ Thêm dòng' }).click();
  await dialog
    .getByLabel('Mã SKU', { exact: true })
    .nth(1)
    .fill(sku + '-2');
  await dialog.getByLabel('Tên phân loại / SKU', { exact: true }).nth(1).fill('Xanh');
  await dialog.getByRole('button', { name: 'Lưu sản phẩm', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(code, { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Đơn hàng', exact: true }).click();
  await page.getByRole('button', { name: '+ Tạo đơn hàng', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Tạo đơn hàng', exact: true });
  for (const [label, value] of Object.entries({
    'Mã đơn hàng': 'UI-ORDER-' + key,
    'Tên người nhận': 'Nguyễn Minh Anh',
    'Số điện thoại': '0901234567',
    'Tỉnh / Thành phố': 'TP Hồ Chí Minh',
    'Phường / Xã': 'Phường Sài Gòn',
    'Số nhà / Đường': '12 Nguyễn Huệ',
    'Mã vận đơn': 'UI-TRACK-' + key,
  }))
    await dialog.getByLabel(label, { exact: true }).fill(value);
  await dialog
    .getByLabel('SKU', { exact: true })
    .selectOption({ label: sku + ' · Sản phẩm giao diện / Đỏ' });
  await dialog.getByLabel('Số lượng', { exact: true }).fill('2');
  await dialog.getByRole('button', { name: '+ Thêm dòng' }).click();
  await dialog
    .getByLabel('SKU', { exact: true })
    .nth(1)
    .selectOption({ label: sku + '-2 · Sản phẩm giao diện / Xanh' });
  await dialog.getByLabel('Số lượng', { exact: true }).nth(1).fill('3');
  await dialog.getByLabel('Chi phí giao hàng (người gửi trả)', { exact: true }).fill('25000');
  await dialog.getByLabel('Doanh thu (người nhận trả)', { exact: true }).fill('450000');
  await dialog.getByLabel('Trạng thái đơn hàng', { exact: true }).selectOption('DELIVERED');
  await dialog.getByLabel('Ngày gửi hàng', { exact: true }).fill(today());
  await dialog.getByLabel('Ngày giao thành công thực tế', { exact: true }).fill(today());
  await dialog.getByRole('button', { name: 'Tạo đơn hàng', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const detail = page.getByRole('dialog', { name: 'Chi tiết đơn hàng', exact: true });
  await expect(detail).toContainText('UI-ORDER-' + key);
  await expect(detail).toContainText('Giao thành công');
  await expect(detail).toContainText('Đã thu');
  await detail.getByRole('tab', { name: 'Lịch sử cập nhật', exact: true }).click();
  await expect(detail).toContainText(auth.users.market);
  await detail.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByLabel('Tìm đơn hàng', { exact: true }).fill('UI-ORDER-' + key);
  await expect(page.locator('.order-table tbody tr')).toHaveCount(1);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '↓ Xuất Excel', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('SuperNet-orders.xlsx');
  await page.reload();
  await nav(page);
  await page.getByRole('tab', { name: 'Đơn hàng', exact: true }).click();
  await page.getByLabel('Tìm đơn hàng', { exact: true }).fill('UI-ORDER-' + key);
  await expect(page.getByRole('button', { name: 'UI-ORDER-' + key, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
test('Orders UI: KOC filters, actual receipt deadline, video form; BOSS has no edit/create/import controls', async ({
  page,
  browser,
}, info) => {
  await login(page, 'market');
  const products = await call(page, '/shipping-products'),
    sku = products.items[0].skus[0].id,
    key = info.project.name + '-' + Date.now();
  const actual = new Date(Date.now() - 8 * 86400000 + 7 * 3600000).toISOString().slice(0, 10);
  const o = await call(page, '/orders', {
    order_code: 'UI-KOC-' + key,
    carrier: 'SPX',
    kind: 'KOC',
    recipient_name: 'KOC Hoài An',
    phone: '0901111222',
    city: 'Hà Nội',
    ward: 'Phường Ba Đình',
    address: '18 Phố mẫu',
    shipping_cost: 22000,
    revenue: 0,
    order_date: actual,
    shipped_on: actual,
    delivered_on: actual,
    status: 'DELIVERED',
    items: [{ sku_id: sku, quantity: 1 }],
  });
  await page.getByRole('tab', { name: 'Theo dõi KOC', exact: true }).click();
  await page.getByLabel('Tìm đơn hàng', { exact: true }).fill(o.order_code);
  await page.getByLabel('Theo dõi video', { exact: true }).selectOption('WARNING_1');
  await page.getByRole('button', { name: o.order_code, exact: true }).click();
  let detail = page.getByRole('dialog', { name: 'Chi tiết đơn hàng', exact: true });
  await detail.getByRole('tab', { name: 'Theo dõi video', exact: true }).click();
  await expect(detail).toContainText('Nhắc lần 1');
  await detail.getByRole('button', { name: 'Ghi nhận đã đăng video', exact: true }).click();
  const video = page.getByRole('dialog', { name: 'Ghi nhận video KOC', exact: true });
  await video
    .getByLabel('Link video đã đăng', { exact: true })
    .fill('https://example.com/video/' + key);
  await video.getByRole('button', { name: 'Lưu video và hoàn thành', exact: true }).click();
  await expect(video).not.toBeVisible();
  await expect(detail).toContainText('Đã đăng video');
  await detail.getByRole('button', { name: 'Đóng', exact: true }).click();
  const ctx = await browser.newContext({
    baseURL: String(info.project.use.baseURL),
    viewport: info.project.use.viewport,
  });
  const boss = await ctx.newPage();
  await login(boss, 'boss');
  await boss.getByRole('tab', { name: 'Đơn hàng', exact: true }).click();
  await expect(boss.getByRole('button', { name: '+ Tạo đơn hàng', exact: true })).toHaveCount(0);
  await expect(boss.getByRole('button', { name: '↑ Nhập từ file', exact: true })).toHaveCount(0);
  await boss.getByLabel('Tìm đơn hàng', { exact: true }).fill(o.order_code);
  await boss.getByRole('button', { name: o.order_code, exact: true }).click();
  detail = boss.getByRole('dialog', { name: 'Chi tiết đơn hàng', exact: true });
  await expect(detail.getByRole('button', { name: 'Chỉnh sửa đơn', exact: true })).toHaveCount(0);
  await detail.getByRole('tab', { name: 'Theo dõi video', exact: true }).click();
  await expect(
    detail.getByRole('button', { name: 'Cập nhật link video', exact: true }),
  ).toHaveCount(0);
  await ctx.close();
});
test('Notification tabs: unread count, KOC deep link, marking read updates bell', async ({
  page,
}) => {
  await login(page, 'market');
  const order = (await call(page, '/orders?kind=KOC')).items[0];
  // Synthetic notification fixture only; worker delivery itself is covered by API tests.
  const { pool } = await import('../../server/base.js');
  const me = await call(page, '/me');
  const message = 'Nhắc KOC kiểm thử giao diện ' + Date.now();
  const id = (
    await pool.query(
      "INSERT INTO notifications(user_id,event_key,message,object_id,object_type,event_type,action_path) VALUES($1,$2,$5,$3,'shipping_order','KOC_VIDEO_1',$4) RETURNING id",
      [me.id, 'koc-video:ui:' + Date.now(), order.id, '/orders/' + order.id, message],
    )
  ).rows[0].id;
  await page.evaluate(() => window.dispatchEvent(new Event('sn-notifications-refresh')));
  await expect(page.locator('.notification-count')).toBeVisible();
  await page.getByRole('button', { name: 'Thông báo', exact: true }).click();
  await page.getByRole('tab', { name: /^Đơn hàng KOC/ }).click();
  const item = page.locator('.notification-item').filter({ hasText: message });
  await expect(item).toContainText('Chưa đọc');
  await item.getByRole('button', { name: 'Mở đơn hàng', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Chi tiết đơn hàng', exact: true })).toContainText(
    order.order_code,
  );
  expect(
    (await pool.query('SELECT read_at FROM notifications WHERE id=$1', [id])).rows[0].read_at,
  ).toBeTruthy();
  await page
    .getByRole('dialog', { name: 'Chi tiết đơn hàng', exact: true })
    .getByRole('button', { name: 'Đóng', exact: true })
    .click();
  await pool.query('DELETE FROM notifications WHERE id=$1', [id]);
});
