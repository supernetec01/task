import { test, expect, type Page } from '@playwright/test';
const password = 'Integration-Test-Password-2026!';
async function login(page: Page, user: string) {
  await page.goto('/');
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(user + '@test.local');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tổng quan công việc' })).toBeVisible();
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
test('Production UI: manager assigns → employee accepts/submits → manager reviews → employee submits report → boss exports', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const title = 'E2E công việc ' + info.project.name + ' ' + Date.now();
  await login(page, 'manager');
  await page.getByRole('button', { name: '+ Giao nhiệm vụ', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tên nhiệm vụ').fill(title);
  await dialog.getByLabel('Người phụ trách chính').selectOption({ label: 'employee' });
  await dialog.getByLabel('Thời hạn').fill('2030-11-10T17:00');
  await dialog.getByLabel('Mô tả').fill('Dòng đầu');
  await dialog.getByLabel('Mô tả').press('Enter');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Mô tả').type('Dòng tiếp theo');
  await dialog.getByRole('button', { name: 'Giao nhiệm vụ', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Giao nhiệm vụ', exact: true }),
  ).not.toBeVisible();
  await expect(dialog.getByText('Chờ nhận', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await logout(page);
  await login(page, 'employee');
  await nav(page, 'Việc của tôi');
  await page.getByLabel('Tìm task').fill(title);
  await page.getByRole('button', { name: title, exact: true }).click();
  await dialog.getByRole('button', { name: 'Nhận việc', exact: true }).click();
  await expect(dialog.getByText('Đã nhận', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Bắt đầu thực hiện', exact: true }).click();
  await dialog.getByRole('button', { name: 'Thực hiện', exact: true }).click();
  await dialog.getByLabel('Tiến độ / việc đã thực hiện').fill('Đã hoàn thành');
  await dialog.getByLabel('Bước tiếp theo', { exact: true }).fill('Nộp kết quả');
  await dialog.getByRole('button', { name: 'Cập nhật tiến độ', exact: true }).click();
  await dialog.getByRole('button', { name: 'Nộp kết quả', exact: true }).click();
  await dialog.getByLabel('Kết quả công việc').fill('Kết quả E2E có dữ liệu thật');
  await dialog.getByRole('button', { name: 'Nộp cho người duyệt', exact: true }).click();
  await expect(dialog.getByText('Chờ duyệt', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await logout(page);
  await login(page, 'manager');
  await nav(page, 'Công việc nhóm');
  await page.getByLabel('Tìm task').fill(title);
  await page.getByRole('button', { name: title, exact: true }).click();
  await dialog.getByRole('button', { name: 'Nộp kết quả', exact: true }).click();
  await dialog.getByLabel('Quyết định', { exact: true }).selectOption('APPROVE');
  await dialog.getByLabel('Nhận xét').fill('Đạt yêu cầu');
  await dialog.getByRole('button', { name: 'Xác nhận quyết định', exact: true }).click();
  await expect(dialog.getByText('Hoàn thành', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await logout(page);
  await login(page, 'employee');
  await nav(page, 'Báo cáo');
  await expect(
    page.getByRole('heading', { name: 'Bổ sung báo cáo · Bổ sung chung' }),
  ).toBeVisible();
  await page
    .getByLabel('Kết quả khác chưa có trong task')
    .fill('Nội dung bổ sung E2E ' + info.project.name);
  await page.getByRole('button', { name: 'Lưu nháp riêng tư', exact: true }).click();
  await expect(page.getByLabel('Kết quả khác chưa có trong task')).toHaveValue(
    'Nội dung bổ sung E2E ' + info.project.name,
  );
  await page.getByRole('button', { name: 'Nộp báo cáo tuần', exact: true }).click();
  await expect(page.getByText(/Báo cáo đã nộp thành công/)).toBeVisible();
  await page.screenshot({
    path: 'test-results/report-' + info.project.name + '.png',
    fullPage: true,
  });
  await logout(page);
  await login(page, 'boss');
  await nav(page, 'Báo cáo');
  await page.getByRole('button', { name: 'Báo cáo đã nộp', exact: true }).click();
  await page.getByLabel('Phiên bản của employee').selectOption({ index: 1 });
  await expect(page.getByRole('button', { name: 'Xuất Excel', exact: true })).toBeVisible();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất Excel', exact: true }).click();
  expect((await dl).suggestedFilename()).toMatch(/\.xlsx$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('Employee UI exposes no Admin, HR or sales controls; mobile menu keyboard accessible', async ({
  page,
}) => {
  await login(page, 'employee');
  if (await page.getByRole('button', { name: 'Mở menu' }).isVisible())
    await page.getByRole('button', { name: 'Mở menu' }).click();
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'Thiết lập', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'Nhân sự & tuyển dụng', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'Kinh doanh', exact: true }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('Offline save preserves task draft, retries the same key, closing asks before discarding', async ({
  page,
}) => {
  await login(page, 'employee');
  await page.getByRole('button', { name: '+ Thêm việc phát sinh', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tên nhiệm vụ').fill('Không mất bản nháp khi offline');
  await dialog.getByLabel('Thời hạn').fill('2030-11-10T17:00');
  const keys: string[] = [];
  await page.route('**/api/v1/tasks', (route) => {
    keys.push(route.request().headers()['idempotency-key']);
    return route.abort('internetdisconnected');
  });
  await dialog.getByRole('button', { name: 'Lưu công việc', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Mất kết nối');
  await expect(dialog.getByLabel('Tên nhiệm vụ')).toHaveValue('Không mất bản nháp khi offline');
  expect(keys.length).toBe(2);
  expect(keys[0]).toBe(keys[1]);
  page.once('dialog', (d) => d.dismiss());
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(dialog).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(dialog).not.toBeVisible();
});
test('Support invitation can be accepted and contribution saved on desktop/mobile without completing the task', async ({
  page,
}) => {
  await login(page, 'support');
  await nav(page, 'Việc của tôi');
  await page.getByLabel('Tìm task').fill('File persistence task');
  await page.getByRole('button', { name: 'File persistence task', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /File persistence task/ })).toBeVisible();
  if (await dialog.getByLabel('Phản hồi', { exact: true }).isVisible()) {
    await expect(dialog.getByRole('button', { name: 'Nộp cho người duyệt' })).toHaveCount(0);
    await dialog.getByLabel('Phản hồi', { exact: true }).selectOption('ACCEPT');
    await dialog.getByRole('button', { name: 'Gửi phản hồi', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole('button', { name: 'File persistence task', exact: true }).click();
  }
  await dialog.getByLabel('Phần hỗ trợ của tôi').fill('Contribution qua browser');
  await dialog.getByLabel('Đã hoàn thành phần hỗ trợ').check();
  await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(dialog.getByText('Chờ nhận', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
