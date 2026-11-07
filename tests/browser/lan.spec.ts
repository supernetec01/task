import { test, expect, type Page } from '@playwright/test';

// Simulate the browser's real HTTP LAN security context. All network traffic is
// fulfilled from this test's loopback server; no DNS or external host is contacted.
async function lanOrigin(page: Page, localBase: string) {
  const origin = 'http://supernet-lan.test';
  const local = new URL(localBase);
  await page.route(origin + '/**', async (route) => {
    const request = route.request(),
      target = new URL(request.url());
    const headers: Record<string, string> = { ...request.headers(), host: local.host };
    if (headers.origin) headers.origin = local.origin;
    const response = await route.fetch({
      url: local.origin + target.pathname + target.search,
      headers,
    });
    await route.fulfill({ response });
  });
  return origin;
}
test('HTTP LAN renders login, authenticates and persists a task without randomUUID', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const origin = await lanOrigin(page, String(info.project.use.baseURL));
  await page.goto(origin);
  expect(await page.evaluate(() => isSecureContext)).toBe(false);
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');
  await expect(page.getByLabel('Tên đăng nhập', { exact: true })).toBeVisible();
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill('employee@test.local');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Integration-Test-Password-2026!');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Tổng quan công việc', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '+ Thêm việc phát sinh', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const title = 'LAN regression ' + info.project.name + ' ' + Date.now();
  await dialog.getByLabel('Tên nhiệm vụ').fill(title);
  await dialog.getByLabel('Thời hạn').fill('2030-11-10T17:00');
  await expect(dialog.getByLabel('Chuyên môn của công việc')).toHaveCount(0);
  await expect(dialog.getByLabel('Mẫu công việc', { exact: true })).not.toBeVisible();
  await expect(dialog.getByLabel('Ưu tiên')).not.toBeVisible();
  await dialog.getByLabel('Tài liệu khi tạo công việc').setInputFiles({
    name: 'lan-evidence.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Browser creation evidence'),
  });
  await expect(dialog.getByText('· Sẵn sàng', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Lưu công việc', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: new RegExp(title) })).toBeVisible();
  await expect(dialog.locator('.badge').filter({ hasText: /^Đang làm$/ })).toBeVisible();
  await page.screenshot({ path: `test-results/lan-${info.project.name}.png`, fullPage: false });
  await expect(dialog.getByRole('tab')).toHaveCount(3);
  await expect(dialog.getByRole('link', { name: 'lan-evidence.txt' })).toBeVisible();
  await expect(dialog.getByText('0/0', { exact: true })).toHaveCount(0);
  await dialog.getByRole('tab', { name: 'Cập nhật & kết quả', exact: true }).click();
  await dialog.getByLabel('Nội dung cập nhật / kết quả').fill('Bản nháp giữ nguyên');
  await page.route(origin + '/api/v1/tasks/*/update-result', (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'VERSION_CONFLICT', message: 'Bản khác vừa cập nhật' }),
    }),
  );
  await dialog.getByRole('button', { name: 'Lưu cập nhật', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Bản khác vừa cập nhật');
  await expect(dialog.getByLabel('Nội dung cập nhật / kết quả')).toHaveValue('Bản nháp giữ nguyên');
  await dialog.getByRole('tab', { name: 'Thông tin', exact: true }).click();
  await dialog.getByRole('tab', { name: 'Cập nhật & kết quả', exact: true }).click();
  await expect(dialog.getByLabel('Nội dung cập nhật / kết quả')).toHaveValue('Bản nháp giữ nguyên');
  page.once('dialog', (d) => d.dismiss());
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  expect(
    await page.evaluate(() =>
      document.querySelector('dialog.task-drawer')?.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.unroute(origin + '/api/v1/tasks/*/update-result');
  await dialog.getByRole('button', { name: 'Lưu cập nhật', exact: true }).click();
  await expect(dialog.getByText('Đã lưu cập nhật công việc.', { exact: true })).toBeVisible();
  await dialog.getByRole('tab', { name: 'Trao đổi', exact: true }).click();
  const message = '<script>alert(1)</script> Tin nhắn người dùng';
  await dialog.getByLabel('Nội dung trao đổi').fill(message);
  await dialog.getByRole('button', { name: 'Gửi trao đổi', exact: true }).click();
  await expect(dialog.locator('.comment p')).toHaveText(message);
  await expect(dialog.getByText('CREATED', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('EMPLOYEE_ADHOC', { exact: true })).toHaveCount(0);
  const box = await dialog.boundingBox();
  expect(box!.x + box!.width).toBeCloseTo(info.project.use.viewport!.width, 0);
  const cancellations: string[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/cancel')) cancellations.push(r.url());
  });
  await dialog.getByRole('button', { name: 'Thao tác khác', exact: true }).click();
  await dialog.getByRole('menuitem', { name: 'Hủy công việc', exact: true }).click();
  const cancel = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('button', { name: 'Xác nhận hủy', exact: true }) });
  await cancel.getByRole('button', { name: 'Xác nhận hủy', exact: true }).click();
  expect(cancellations).toHaveLength(0);
  await cancel.getByRole('button', { name: 'Quay lại', exact: true }).click();
  expect(cancellations).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Thao tác khác', exact: true }).click();
  await dialog.getByRole('menuitem', { name: 'Hủy công việc', exact: true }).click();
  await cancel.getByLabel('Lý do hủy').fill('Kiểm thử hủy có lý do');
  await cancel.getByRole('button', { name: 'Xác nhận hủy', exact: true }).click();
  await expect(dialog.getByText('Đã hủy công việc.', { exact: true })).toBeVisible();
  expect(cancellations).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Thao tác khác', exact: true }).click();
  await dialog.getByRole('menuitem', { name: 'Lịch sử hệ thống', exact: true }).click();
  await expect(page.getByText('Kiểm thử hủy có lý do', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test('An invalid session response shows a readable error rather than a blank page', async ({
  page,
}, info) => {
  const origin = await lanOrigin(page, String(info.project.use.baseURL));
  await page.route(origin + '/api/v1/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.goto(origin);
  await expect(page.getByRole('alert')).toContainText('Dữ liệu phiên đăng nhập không hợp lệ');
  await expect(page.getByLabel('Tên đăng nhập', { exact: true })).toBeVisible();
});
test('HTML returned by an API is reported without exposing a JSON parser failure', async ({
  page,
}, info) => {
  const origin = await lanOrigin(page, String(info.project.use.baseURL));
  await page.route(origin + '/api/v1/me', (route) =>
    route.fulfill({
      status: 502,
      contentType: 'text/html',
      body: '<html>Upstream unavailable</html>',
    }),
  );
  await page.goto(origin);
  await expect(page.getByRole('alert')).toContainText('Máy chủ chưa trả dữ liệu hợp lệ');
});

test('A rendering exception is caught and offers reload instead of leaving the page blank', async ({
  page,
}, info) => {
  const origin = await lanOrigin(page, String(info.project.use.baseURL));
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined, configurable: true });
    Object.defineProperty(Crypto.prototype, 'getRandomValues', {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: 'Không thể hiển thị trang' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tải lại trang', exact: true })).toBeVisible();
});
