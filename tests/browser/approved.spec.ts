import { test, expect, type Page } from '@playwright/test';
const password = 'Integration-Test-Password-2026!';
async function login(page: Page, user: string) {
  await page.goto('/');
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(user + '@test.local');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.locator('.sidebar')).toBeAttached();
  await nav(page, 'Công việc cũ');
}
async function nav(page: Page, name: string) {
  if (await page.getByRole('button', { name: 'Mở menu' }).isVisible())
    await page.getByRole('button', { name: 'Mở menu' }).click();
  await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
}
test('Approved HR UI · Admin-created profile visible/editable to HR, payroll separated, history and hourly refresh preserve draft', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  const suffix = info.project.name + '_' + Date.now(),
    code = 'APPROVED-' + suffix,
    name = 'Nhân viên duyệt ' + suffix;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, 'admin');
  await nav(page, 'Nhân sự');
  await page.getByRole('button', { name: '+ Thêm nhân viên', exact: true }).click();
  let modal = page.getByRole('dialog');
  await modal.getByLabel('Mã nhân sự', { exact: true }).fill(code);
  await modal.getByLabel('Họ tên', { exact: true }).fill(name);
  await modal.getByLabel('Ngày vào làm', { exact: true }).fill('2026-11-01');
  await modal.getByLabel('Bộ phận', { exact: true }).selectOption({ index: 1 });
  await modal.getByLabel('Giai đoạn công việc', { exact: true }).selectOption('OFFICIAL');
  await modal.getByLabel('Content Marketing', { exact: true }).check();
  await modal.getByRole('button', { name: 'Lưu hồ sơ nhân viên', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Hồ sơ nhân viên' })).toBeVisible();
  const adminDrawer = page.getByRole('dialog', { name: 'Hồ sơ nhân viên' });
  await adminDrawer.getByRole('tab', { name: 'Công việc', exact: true }).click();
  await adminDrawer
    .getByRole('button', { name: 'Cấp tài khoản cho nhân viên', exact: true })
    .click();
  const provisioning = page
    .getByRole('dialog')
    .filter({ has: page.getByLabel('Username', { exact: true }) });
  const username = 'approved_' + suffix;
  await expect(provisioning.getByLabel('Họ tên', { exact: true })).toHaveValue(name);
  await provisioning.getByLabel('Username', { exact: true }).fill(username);
  await provisioning
    .getByLabel('Mật khẩu khởi tạo (ít nhất 11 ký tự)', { exact: true })
    .fill('UI-Provisioning-Password-2026!');
  await expect(provisioning.getByLabel('Content Marketing', { exact: true })).toBeChecked();
  await provisioning
    .getByRole('button', { name: 'Tạo tài khoản và cấp quyền', exact: true })
    .click();
  await expect(provisioning).not.toBeVisible();
  await expect(adminDrawer).toContainText(username);
  await adminDrawer.getByRole('button', { name: 'Đóng', exact: true }).click();
  const hrContext = await browser.newContext({
    baseURL: String(info.project.use.baseURL),
    viewport: info.project.use.viewport,
  });
  const hr = await hrContext.newPage();
  await hr.clock.install();
  await login(hr, 'hr');
  await nav(hr, 'Nhân sự');
  await hr.getByLabel('Tìm nhân viên', { exact: true }).fill(code);
  const row = hr.locator('.employee-list tbody tr').filter({ hasText: code });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Mở hồ sơ', exact: true }).click();
  const drawer = hr.getByRole('dialog', { name: 'Hồ sơ nhân viên' });
  await expect(drawer.locator('summary').filter({ hasText: 'Thông tin nhạy cảm' })).toHaveCount(0);
  await drawer.locator('summary').filter({ hasText: 'Lương / thưởng' }).click();
  await drawer.getByLabel('Thông tin lương', { exact: true }).fill('Lương thử nghiệm');
  await drawer.getByLabel('Thông tin thưởng', { exact: true }).fill('Thưởng thử nghiệm');
  await drawer.getByRole('button', { name: 'Lưu lương / thưởng', exact: true }).click();
  await expect(drawer.getByText('Đã lưu lương / thưởng.', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Chỉnh sửa hồ sơ', exact: true }).click();
  modal = hr.getByRole('dialog').filter({ has: hr.getByLabel('Mã nhân sự', { exact: true }) });
  await expect(modal.getByLabel('Giai đoạn công việc', { exact: true })).toHaveValue('OFFICIAL');
  await modal.getByLabel('Họ tên', { exact: true }).fill(name + ' HR sửa');
  await modal.getByRole('button', { name: 'Lưu hồ sơ nhân viên', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await drawer.getByRole('tab', { name: 'Lịch sử chỉnh sửa', exact: true }).click();
  await expect(drawer.locator('.history-entry').first()).toContainText('hr');
  await drawer.locator('.history-entry').first().locator('summary').click();
  await expect(drawer.locator('.history-entry').first()).toContainText(name + ' HR sửa');
  await hr.screenshot({ path: 'test-results/approved-history-' + info.project.name + '.png' });
  await drawer.getByRole('button', { name: 'Chỉnh sửa hồ sơ', exact: true }).click();
  modal = hr.getByRole('dialog').filter({ has: hr.getByLabel('Mã nhân sự', { exact: true }) });
  await modal.getByLabel('Họ tên', { exact: true }).fill('Bản nháp chưa lưu');
  let listLoads = 0;
  hr.on('request', (r) => {
    if (r.url().includes('/api/v1/employees?')) listLoads++;
  });
  await hr.clock.fastForward(3600001);
  await expect.poll(() => listLoads).toBeGreaterThan(0);
  await expect(modal.getByLabel('Họ tên', { exact: true })).toHaveValue('Bản nháp chưa lưu');
  hr.once('dialog', (d) => d.accept());
  await modal.getByRole('button', { name: 'Đóng', exact: true }).click();
  await drawer.getByRole('button', { name: 'Đóng', exact: true }).click();
  await hr.getByRole('button', { name: 'Tải lại danh sách', exact: true }).click();
  await expect(row).toContainText(name + ' HR sửa');
  await hr.screenshot({ path: 'test-results/approved-hr-' + info.project.name + '.png' });
  expect(await hr.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await hrContext.close();
});
test('Approved errors · field validation is visible/focused and failed imports have retry', async ({
  page,
}, info) => {
  await login(page, 'admin');
  await nav(page, 'Quản lý tài khoản cũ');
  await page.getByRole('button', { name: '+ Tạo tài khoản', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Họ tên', { exact: true }).fill('QC lỗi form');
  await modal.getByLabel('Username', { exact: true }).fill('invalid username');
  await modal
    .getByLabel('Mật khẩu khởi tạo (ít nhất 11 ký tự)', { exact: true })
    .fill('UI-Review-Password-2026!');
  await modal.getByLabel('Content Marketing', { exact: true }).check();
  await modal.getByRole('button', { name: 'Tạo tài khoản và cấp quyền', exact: true }).click();
  await expect(modal.getByLabel('Username', { exact: true })).toBeFocused();
  await expect(modal.getByLabel('Username', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(modal.locator('.field-error')).toContainText('3–64');
  await expect(modal.locator('.field-error')).toBeInViewport();
  await page.screenshot({ path: 'test-results/approved-validation-' + info.project.name + '.png' });
  page.once('dialog', (d) => d.accept());
  await modal.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.route('**/api/v1/imports?kind=SALES', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'TEST_FAILURE', message: 'Không tải được nguồn nhập kiểm thử' }),
    }),
  );
  await nav(page, 'Nguồn số liệu cũ');

  await expect(page.getByRole('alert')).toContainText('Không tải được nguồn nhập kiểm thử');
  await expect(
    page.getByRole('button', { name: 'Thử tải lại nguồn nhập', exact: true }),
  ).toBeVisible();
  await page.unroute('**/api/v1/imports?kind=SALES');
  await page.getByRole('button', { name: 'Thử tải lại nguồn nhập', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('Approved account UI · platform viewer selection and two-way account lookup', async ({
  page,
}, info) => {
  await login(page, 'admin');
  await nav(page, 'Tài khoản nền tảng');
  await page.getByRole('button', { name: 'Chia sẻ theo nền tảng', exact: true }).click();
  let modal = page.getByRole('dialog');
  await modal
    .getByLabel('Nền tảng chia sẻ', { exact: true })
    .selectOption({ label: 'QC approved sharing' });
  await modal.getByLabel('Tìm người được xem', { exact: true }).fill('hr');
  await modal.getByRole('checkbox', { name: /^hr / }).check();
  await modal.getByRole('button', { name: 'Lưu người xem nền tảng', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await page
    .getByLabel('Lọc tài khoản theo người được xem', { exact: true })
    .selectOption({ label: 'hr · hr@test.local' });
  await page.getByLabel('Tìm tài khoản nền tảng', { exact: true }).fill('Inherited A');
  const row = page.locator('.account-list tbody tr').filter({ hasText: 'Inherited A' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('hr');
  await row.getByRole('button', { name: 'Người được xem', exact: true }).click();
  modal = page.getByRole('dialog');
  await expect(modal.getByRole('checkbox', { name: /^hr / })).toHaveCount(0);
  await modal.getByLabel('Dùng người xem của nền tảng (gồm tài khoản tạo mới)').uncheck();
  await expect(modal.getByRole('checkbox', { name: /^hr / })).toBeChecked();
  await page.screenshot({ path: 'test-results/approved-viewers-' + info.project.name + '.png' });
  page.once('dialog', (d) => d.accept());
  await modal.getByRole('button', { name: 'Đóng', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Approved video UI · different form, participant picker and publication link complete the production workflow', async ({
  page,
}, info) => {
  await login(page, 'employee');
  await page.getByRole('button', { name: '+ Thêm việc phát sinh', exact: true }).click();
  const modal = page.getByRole('dialog');
  const title = 'Video quy trình ' + info.project.name + ' ' + Date.now();
  await modal.getByLabel('Tên nhiệm vụ').fill(title);
  await modal.getByLabel('Thời hạn').fill('2030-11-10T17:00');
  await modal.locator('summary').filter({ hasText: 'Chọn mẫu công việc' }).click();
  await modal.getByLabel('Mẫu công việc', { exact: true }).selectOption('SHOOT');
  await modal.getByRole('button', { name: 'Lưu công việc', exact: true }).click();
  await expect(modal.getByRole('heading', { name: new RegExp(title) })).toBeVisible();
  await modal.getByRole('tab', { name: 'Cập nhật & kết quả', exact: true }).click();
  await expect(modal.getByLabel('Kịch bản hoàn chỉnh', { exact: true })).toBeVisible();
  await modal.getByLabel('Kịch bản hoàn chỉnh', { exact: true }).fill('Kịch bản video thử nghiệm');
  await modal.getByLabel('Kế hoạch quay / bối cảnh', { exact: true }).fill('Kế hoạch thử nghiệm');
  await modal.getByLabel('Ngày giờ quay', { exact: true }).fill('2026-11-01T09:00');
  await modal
    .getByRole('group', { name: 'Nhân sự đi quay (chọn tài khoản)', exact: true })
    .getByRole('checkbox', { name: 'employee', exact: true })
    .check();
  await modal
    .getByLabel('Link thư mục tư liệu quay', { exact: true })
    .fill('https://example.com/footage');
  await modal
    .getByLabel('Kết quả chỉnh sửa / hậu kỳ', { exact: true })
    .fill('Đã dựng và kiểm phụ đề');
  await modal
    .getByLabel('Link bản video hoàn chỉnh', { exact: true })
    .fill('https://example.com/final');
  await modal.getByLabel('Ngày dự kiến đăng', { exact: true }).fill('2026-11-02');
  await modal.getByLabel('Thời điểm đã đăng', { exact: true }).fill('2026-11-02T17:00');
  await modal.getByLabel('Nền tảng đã đăng', { exact: true }).fill('TikTok');
  await modal
    .getByLabel('Link video đã đăng', { exact: true })
    .fill('https://example.com/video/approved');
  await modal.getByLabel('Tình trạng cập nhật', { exact: true }).selectOption('SUBMITTED');
  await modal.getByRole('button', { name: 'Lưu cập nhật', exact: true }).click();
  await expect(modal.getByText('Chờ duyệt', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/approved-video-' + info.project.name + '.png' });
});
