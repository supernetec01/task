import { test, expect, type Page } from '@playwright/test';
const password = 'Integration-Test-Password-2026!';
async function login(page: Page, user: string) {
  await page.goto('/');
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(user + '@test.local');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.locator('.sidebar')).toBeAttached();
  await expect(
    page.getByRole('heading', { name: 'Tổng quan công việc', exact: true }),
  ).toBeVisible();
}
async function nav(page: Page, name: string) {
  if (await page.getByRole('button', { name: 'Mở menu' }).isVisible())
    await page.getByRole('button', { name: 'Mở menu' }).click();
  await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
}
async function logout(page: Page) {
  if (await page.getByRole('button', { name: 'Mở menu' }).isVisible())
    await page.getByRole('button', { name: 'Mở menu' }).click();
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible();
}
test('Upgrade UI · accounts/viewers/password history, employee drawer/files/export, atomic multi-role user and settings', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const suffix = info.project.name + ' ' + Date.now(),
    label = 'Tài khoản E2E ' + suffix,
    employeeCode = 'E2E-' + info.project.name + '-' + Date.now();
  await login(page, 'admin');
  await nav(page, 'Tài khoản nền tảng');
  await page.getByRole('button', { name: '+ Thêm tài khoản nền tảng', exact: true }).click();
  let modal = page
    .getByRole('dialog')
    .filter({ has: page.getByLabel('Tên tài khoản / cửa hàng', { exact: true }) });
  await modal.getByLabel('Nền tảng', { exact: true }).selectOption({ label: 'TikTok' });
  await modal.getByLabel('Tên tài khoản / cửa hàng', { exact: true }).fill(label);
  await modal.getByLabel('Tài khoản đăng nhập', { exact: true }).fill('upgrade.login');
  await modal.getByLabel('Mật khẩu nền tảng', { exact: true }).fill('short');
  await modal.getByLabel('Pháp nhân', { exact: true }).fill('Công ty kiểm thử');
  await modal.getByLabel('Tìm người được xem').fill('employee');
  await modal.getByRole('checkbox', { name: /^employee / }).check();
  await modal.getByLabel('Tìm người được xem').fill('support');
  await modal.getByRole('checkbox', { name: /^support / }).check();
  await modal.getByLabel('Tìm người được xem').fill('');
  await expect(modal.getByRole('checkbox', { name: /^employee / })).toBeChecked();
  await modal.getByRole('button', { name: 'Lưu tài khoản', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await page.getByLabel('Tìm tài khoản nền tảng').fill(label);
  const row = page.locator('tbody tr').filter({ hasText: label });
  await expect(row).toContainText('employee');
  await expect(row).toContainText('support');
  await row.getByRole('button', { name: 'Xem mật khẩu hiện tại', exact: true }).click();
  await expect(row.locator('.secret-value')).toHaveText('short');
  await page.evaluate(() => window.dispatchEvent(new Event('sn-access-refresh')));
  await expect(row.locator('.secret-value')).not.toHaveText('short');
  await row.getByRole('button', { name: 'Xem mật khẩu hiện tại', exact: true }).click();
  await expect(row.locator('.secret-value')).toHaveText('short');
  await row.getByRole('button', { name: 'Ẩn mật khẩu hiện tại', exact: true }).click();
  await expect(row.locator('.secret-value')).not.toHaveText('short');
  await row.getByRole('button', { name: 'Cập nhật mật khẩu', exact: true }).click();
  modal = page.getByRole('dialog');
  await expect(modal.getByRole('checkbox')).toHaveCount(0);
  await modal.getByLabel('Mật khẩu mới', { exact: true }).fill('updated-short');
  await modal.getByLabel('Ghi chú', { exact: true }).fill('Thay đổi qua UI');
  await page.evaluate(async () => {
    const me = await (await fetch('/api/v1/me')).json();
    const data = await (await fetch('/api/v1/platform-accounts?sort=updated')).json();
    const current = data.items[0];
    const response = await fetch('/api/v1/platform-accounts/' + current.id + '/versions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': me.csrf,
        'idempotency-key': crypto.randomUUID(),
      },
      body: JSON.stringify({ secret: 'concurrent-short', expected_version: current.version }),
    });
    if (!response.ok) throw Error('Concurrent update fixture failed');
  });
  await modal.getByRole('button', { name: 'Lưu mật khẩu', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Dữ liệu vừa thay đổi');
  await expect(modal.getByLabel('Mật khẩu mới', { exact: true })).toHaveValue('updated-short');
  await modal
    .getByRole('button', { name: 'Lấy phiên bản mới, giữ nội dung đang nhập', exact: true })
    .click();
  await expect(modal.getByRole('alert')).toHaveCount(0);
  await expect(modal.getByLabel('Mật khẩu mới', { exact: true })).toHaveValue('updated-short');
  await modal.getByRole('button', { name: 'Lưu mật khẩu', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Đã cập nhật mật khẩu' })).toBeVisible();
  await page.screenshot({ path: 'test-results/upgrade-accounts-' + info.project.name + '.png' });
  await nav(page, 'Lịch sử mật khẩu');
  await page.getByLabel('Lọc lịch sử theo Tài khoản').selectOption({ label });
  const historyRow = page.locator('tbody tr').filter({ hasText: 'Cập nhật mật khẩu' }).first();
  await historyRow.getByRole('button', { name: 'Xem phiên bản', exact: true }).click();
  modal = page.getByRole('dialog');
  await modal.getByRole('button', { name: 'Xem mật khẩu trước', exact: true }).click();
  await modal.getByRole('button', { name: 'Xem mật khẩu sau', exact: true }).click();
  await expect(modal.locator('.secret-value').nth(0)).toHaveText('concurrent-short');
  await expect(modal.locator('.secret-value').nth(1)).toHaveText('updated-short');
  await modal.getByRole('button', { name: 'Đóng', exact: true }).click();
  await nav(page, 'Nhân sự');
  await expect(page.getByText('Ứng viên', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '+ Thêm nhân viên', exact: true }).click();
  modal = page.getByRole('dialog');
  await modal.getByLabel('Mã nhân sự', { exact: true }).fill(employeeCode);
  await modal.getByLabel('Họ tên', { exact: true }).fill('Nhân sự E2E ' + suffix);
  await modal.getByLabel('Ngày vào làm', { exact: true }).fill('2026-11-01');
  await modal.getByLabel('Content', { exact: true }).check();
  await modal.getByLabel('Thiết kế', { exact: true }).check();
  await modal.getByLabel('Bộ phận', { exact: true }).selectOption({ index: 1 });
  await modal.getByRole('button', { name: 'Lưu hồ sơ nhân viên', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Hồ sơ nhân viên', exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('tab')).toHaveCount(3);
  await drawer.getByRole('tab', { name: 'Công việc', exact: true }).click();
  await expect(drawer.getByText(/Content ·/)).toBeVisible();
  await drawer.getByRole('tab', { name: 'Tài liệu', exact: true }).click();
  await drawer.getByLabel('Tệp hồ sơ nhân sự', { exact: true }).setInputFiles({
    name: 'employee-e2e.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Private HR test file'),
  });
  await drawer.getByRole('button', { name: 'Tải tài liệu nhân sự', exact: true }).click();
  await expect(drawer.getByRole('link', { name: 'employee-e2e.txt', exact: true })).toBeVisible();
  await drawer.getByLabel('Phân loại tài liệu', { exact: true }).selectOption('PHOTO');
  await drawer.getByLabel('Tệp hồ sơ nhân sự', { exact: true }).setInputFiles({
    name: 'profile.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await drawer.getByRole('button', { name: 'Tải tài liệu nhân sự', exact: true }).click();
  await drawer.getByRole('button', { name: 'Đặt làm ảnh hồ sơ', exact: true }).click();
  await drawer.getByRole('tab', { name: 'Thông tin', exact: true }).click();
  await expect(drawer.getByRole('img')).toBeVisible();
  await expect
    .poll(() =>
      drawer
        .getByRole('img')
        .evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
    )
    .toBe(true);
  await drawer.locator('summary').filter({ hasText: 'Thông tin nhạy cảm' }).click();
  await drawer.getByLabel('Mã số thuế', { exact: true }).fill('00112233');
  await drawer.getByLabel('Tài khoản nhận lương', { exact: true }).fill('00001234');
  await drawer.getByRole('button', { name: 'Lưu thông tin nhạy cảm', exact: true }).click();
  await expect(drawer.getByText('Đã lưu thông tin nhạy cảm.', { exact: true })).toBeVisible();
  await drawer.locator('summary').filter({ hasText: 'Thông tin nhạy cảm' }).click();
  await expect(drawer.getByLabel('Mã số thuế', { exact: true })).toHaveValue('00112233');
  await expect(drawer.getByLabel('Tài khoản nhận lương', { exact: true })).toHaveValue('00001234');
  await drawer.locator('summary').filter({ hasText: 'Thông tin nhạy cảm' }).click();
  await page.screenshot({ path: 'test-results/upgrade-employee-' + info.project.name + '.png' });
  await drawer.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByLabel('Tìm nhân viên', { exact: true }).fill(employeeCode);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất Excel', exact: true }).click();
  expect((await dl).suggestedFilename()).toMatch(/\.xlsx$/);
  await nav(page, 'Đội ngũ & phân quyền');
  await page.getByRole('button', { name: '+ Tạo tài khoản', exact: true }).click();
  modal = page.getByRole('dialog');
  const username = 'ui_' + info.project.name.replaceAll('-', '_') + '_' + Date.now();
  await modal.getByLabel('Họ tên', { exact: true }).fill('Người dùng E2E');
  await modal.getByLabel('Username', { exact: true }).fill(username);
  await modal
    .getByLabel('Mật khẩu khởi tạo (ít nhất 11 ký tự)', { exact: true })
    .fill('UI-User-Test-2026!');
  await modal.getByLabel('Content', { exact: true }).check();
  await modal.getByLabel('Thiết kế', { exact: true }).check();
  await modal
    .getByLabel('Liên kết nhân viên đã có (không bắt buộc)')
    .selectOption({ label: employeeCode + ' · Nhân sự E2E ' + suffix });
  await modal.getByRole('button', { name: 'Tạo tài khoản và cấp quyền', exact: true }).click();
  await expect(
    page
      .getByRole('dialog')
      .getByRole('heading', { name: 'Quyền của Người dùng E2E', exact: true }),
  ).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Đóng', exact: true }).click();
  await nav(page, 'Thiết lập');
  await expect(page.getByRole('heading', { name: 'Lưu mật khẩu', exact: true })).toBeVisible();
  await expect(page.getByText('Đã cấu hình an toàn', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /VAULT_KEY/ })).toHaveCount(0);
  await page
    .getByRole('group', { name: 'Bán thời gian', exact: true })
    .getByRole('checkbox', { name: 'Hợp đồng', exact: true })
    .check();
  await page
    .getByLabel('Quyết định checklist / người chốt', { exact: true })
    .fill('Checklist qua UI kiểm thử');
  const policySave = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/settings/policies') && r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Lưu checklist đã chốt', exact: true }).click();
  expect((await policySave).status()).toBe(200);
  await expect(
    page
      .getByRole('group', { name: 'Bán thời gian', exact: true })
      .getByRole('checkbox', { name: 'Hợp đồng', exact: true }),
  ).toBeChecked();

  await logout(page);
  await login(page, 'employee');
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'Lịch sử mật khẩu', exact: true }),
  ).toHaveCount(0);
  await nav(page, 'Tài khoản nền tảng');
  await page.getByLabel('Tìm tài khoản nền tảng').fill(label);
  const sharedRow = page.locator('tbody tr').filter({ hasText: label });
  await expect(sharedRow).toBeVisible();
  await expect(sharedRow.getByRole('button', { name: 'Sửa thông tin', exact: true })).toHaveCount(
    0,
  );
  await sharedRow.getByRole('button', { name: 'Cập nhật mật khẩu', exact: true }).click();
  modal = page.getByRole('dialog');
  await modal.getByLabel('Mật khẩu mới', { exact: true }).fill('staff-short');
  await modal.getByRole('button', { name: 'Lưu mật khẩu', exact: true }).click();
  await expect(modal).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
