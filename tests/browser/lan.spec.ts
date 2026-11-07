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
  await dialog.getByRole('button', { name: 'Lưu công việc', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: new RegExp(title) })).toBeVisible();
  await expect(dialog.getByText('Đang làm', { exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/lan-${info.project.name}.png`, fullPage: true });
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
