import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const auth = JSON.parse(
  readFileSync(resolve(process.env.DATA_DIR || 'data', 'handoff-browser-auth.json'), 'utf8'),
);
async function login(page: Page, who: string) {
  const user = auth.users.find((u: any) => u.id === auth.ids[who]);
  await page.goto('/');
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(user.username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(auth.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đăng xuất', exact: true })).toBeVisible();
}
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Mở menu' });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.nav').getByRole('button', { name, exact: true }).click();
}
test.afterEach(async ({ page }, info) => {
  await page.screenshot({ path: info.outputPath('screen.png'), fullPage: true });
});
test('HANDOFF TASK/UI · employee checklist save, complete and server persistence', async ({
  page,
}) => {
  await login(page, 'content');
  await page.getByRole('button', { name: /Thêm việc phát sinh/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Thêm công việc', exact: true });
  const title = 'Browser checklist ' + Date.now();
  await dialog.getByLabel('Tên công việc', { exact: true }).fill(title);
  await dialog.getByLabel('Thời hạn (giờ Việt Nam)', { exact: true }).fill('2027-01-01T17:00');
  await dialog.getByRole('button', { name: 'Lưu công việc', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Chi tiết công việc', exact: true });
  await expect(detail.getByRole('heading', { name: new RegExp(title) })).toBeVisible();
  await expect(detail.getByText('Chưa thực hiện', { exact: false }).first()).toBeVisible();
  await detail.getByRole('button', { name: 'Tiến độ & kết quả', exact: true }).click();
  await detail.getByLabel('Trạng thái công việc', { exact: true }).selectOption('DONE');
  await detail
    .getByLabel('Đã thực hiện / kết quả', { exact: true })
    .fill('Browser result persisted to PostgreSQL');
  await detail.getByRole('button', { name: 'Lưu tiến độ / kết quả', exact: true }).click();
  await expect(detail.getByText('Đã hoàn thành', { exact: false }).first()).toBeVisible();
  await detail.getByRole('button', { name: 'Đóng chi tiết', exact: true }).click();
  await page.getByRole('button', { name: 'Hoàn thành', exact: true }).click();
  await page.getByLabel('Tìm công việc', { exact: true }).fill(title);
  await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Hoàn thành', exact: true }).click();
  await page.getByLabel('Tìm công việc', { exact: true }).fill(title);
  await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});
test('HANDOFF CONTENT · real script stage and persisted production profile', async ({ page }) => {
  await login(page, 'content');
  await navigate(page, 'Nội dung & sản xuất');
  await page.getByRole('button', { name: 'Thêm nội dung', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Thêm hồ sơ nội dung' });
  const title = 'Browser content ' + Date.now();
  await create.getByLabel('Tên nội dung', { exact: true }).fill(title);
  await create.getByLabel('Người viết kịch bản', { exact: true }).selectOption(auth.ids.content);
  await create.getByRole('button', { name: 'Lưu hồ sơ nội dung', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Hồ sơ sản xuất nội dung' });
  await editor.getByLabel('Lời thoại / kịch bản', { exact: true }).fill('Synthetic browser script');
  await editor.getByRole('button', { name: 'Lưu nháp / thông tin sản xuất', exact: true }).click();
  await expect(editor.getByText('Đã lưu thành công', { exact: false }).first()).toBeVisible();
  await editor.getByLabel('Đã lưu đủ dữ liệu và kiểm tra bước hiện tại', { exact: true }).check();
  await editor.getByRole('button', { name: 'Hoàn tất bước hiện tại', exact: true }).click();
  await expect(editor.getByText('Chờ quay', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Đóng chi tiết' }).click();
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();
});
test('HANDOFF HR · create candidate, application and private server data', async ({ page }) => {
  await login(page, 'hr');
  await navigate(page, 'Nhân sự');
  await page.getByRole('button', { name: 'Ứng viên & phỏng vấn', exact: true }).click();
  const name = 'Browser candidate ' + Date.now();
  await page.getByLabel('Họ tên ứng viên', { exact: true }).fill(name);
  await page.getByLabel('Email ứng viên', { exact: true }).fill('browser@example.test');
  await page.getByRole('button', { name: 'Lưu ứng viên', exact: true }).click();
  await expect(
    page.getByLabel('Hồ sơ ứng viên', { exact: true }).locator('option:checked'),
  ).toHaveText(new RegExp(name));
  await page.getByLabel('Vị trí ứng tuyển', { exact: true }).selectOption('CONTENT');
  await page.getByLabel('Ngày nhận CV', { exact: true }).fill('2026-11-10');
  await page.getByLabel('Nguồn ứng viên', { exact: true }).fill('Synthetic browser test');
  await page.getByRole('button', { name: 'Lưu ứng tuyển', exact: true }).click();
  await expect(page.locator('summary').filter({ hasText: name })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});
test('HANDOFF MARKET · typed sales and KOC summaries from confirmed test sources', async ({
  page,
}) => {
  await login(page, 'market');
  await navigate(page, 'Kinh doanh');
  const form = page.locator('form').filter({ has: page.getByLabel('Báo cáo', { exact: true }) });
  await form.getByLabel('Shop', { exact: true }).selectOption(auth.ids.shop);
  await form.getByLabel('Từ ngày', { exact: true }).fill('2026-11-02');
  await form.getByLabel('Đến ngày', { exact: true }).fill('2026-11-08');
  await form.getByRole('button', { name: 'Xem báo cáo nguồn', exact: true }).click();
  await expect(page.getByText('67492567.0000000000', { exact: true })).toBeVisible();
  await form.getByLabel('Báo cáo', { exact: true }).selectOption('koc');
  await form.getByRole('button', { name: 'Xem báo cáo nguồn', exact: true }).click();
  await expect(page.getByText('52399786.0000000000', { exact: true })).toBeVisible();
  await expect(page.getByText(/Chưa có nguồn hoa hồng quyết toán/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});
test('HANDOFF BOSS/AUTH · scope allows assignment and submitted reports, denies HR and source API', async ({
  page,
}) => {
  await login(page, 'boss');
  await expect(
    page.locator('.nav').getByRole('button', { name: 'Nhân sự', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator('.nav').getByRole('button', { name: 'Kinh doanh', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: /Giao nhiệm vụ/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Thêm công việc', exact: true });
  await dialog
    .getByLabel('Tên công việc', { exact: true })
    .fill('Boss browser assignment ' + Date.now());
  await dialog.getByLabel('Người phụ trách', { exact: true }).selectOption(auth.ids.content);
  await dialog.getByLabel('Chuyên môn', { exact: true }).selectOption('CONTENT');
  await dialog.getByLabel('Thời hạn (giờ Việt Nam)', { exact: true }).fill('2027-01-01T17:00');
  await dialog.getByRole('button', { name: 'Lưu công việc', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Chi tiết công việc', exact: true });
  await expect(detail.getByRole('heading', { name: /Boss browser assignment/ })).toBeVisible();
  await detail.getByRole('button', { name: 'Tiến độ & kết quả', exact: true }).click();
  await expect(detail.getByRole('button', { name: 'Lưu tiến độ / kết quả' })).toHaveCount(0);
  const hr = await page.request.get('/api/v1/employees');
  expect(hr.status()).toBe(403);
});
test('HANDOFF ADMIN · source catalog persists from settings and only five roles are offered', async ({
  page,
}) => {
  await login(page, 'admin');
  await navigate(page, 'Thiết lập');
  const companyForm = page
    .locator('form')
    .filter({ has: page.getByLabel('Mã pháp nhân', { exact: true }) });
  const name = 'Browser company ' + Date.now();
  await companyForm.getByLabel('Mã pháp nhân', { exact: true }).fill('BROWSER_' + Date.now());
  await companyForm.getByLabel('Tên pháp nhân', { exact: true }).fill(name);
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/companies') && r.request().method() === 'POST',
  );
  await companyForm.getByRole('button', { name: 'Lưu', exact: true }).click();
  expect((await saved).status()).toBe(200);
  const response = await page.request.get('/api/v1/companies');
  expect((await response.json()).items.some((c: any) => c.name === name)).toBe(true);
  await navigate(page, 'Đội ngũ & phân quyền');
  const form = page
    .locator('form')
    .filter({ has: page.getByLabel('Mật khẩu ban đầu (ít nhất 11 ký tự)', { exact: true }) });
  await expect(
    form.getByRole('group', { name: 'ROLE', exact: true }).getByRole('checkbox'),
  ).toHaveCount(5);
  await expect(form.getByText('EXECUTIVE', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test('HANDOFF CONT05/SORT07 · unsaved content survives tabs/hourly refresh and close requires confirmation', async ({
  page,
}) => {
  await login(page, 'content');
  await navigate(page, 'Nội dung & sản xuất');
  await page.getByRole('button', { name: 'Thêm nội dung', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Thêm hồ sơ nội dung' }),
    title = 'Unsaved content ' + Date.now();
  await create.getByLabel('Tên nội dung', { exact: true }).fill(title);
  await create.getByRole('button', { name: 'Lưu hồ sơ nội dung', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Hồ sơ sản xuất nội dung' });
  await editor
    .getByLabel('Lời thoại / kịch bản', { exact: true })
    .fill('Unsaved script must remain');
  await editor.getByRole('button', { name: 'Thông tin nội dung', exact: true }).click();
  await editor.getByLabel('Brief', { exact: true }).fill('Unsaved brief must remain');
  await editor.getByRole('button', { name: 'Kịch bản / quay / dựng', exact: true }).click();
  await expect(editor.getByLabel('Lời thoại / kịch bản', { exact: true })).toHaveValue(
    'Unsaved script must remain',
  );
  await page.clock.install();
  await page.clock.fastForward(3600000);
  await expect(editor.getByLabel('Lời thoại / kịch bản', { exact: true })).toHaveValue(
    'Unsaved script must remain',
  );
  page.once('dialog', (d) => d.dismiss());
  await editor.getByRole('button', { name: 'Đóng chi tiết', exact: true }).click();
  await expect(editor).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await editor.getByRole('button', { name: 'Đóng chi tiết', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const response = await page.request.get('/api/v1/content-items');
  const item = (await response.json()).items.find((c: any) => c.title === title);
  expect(item.script_text).toBe('');
  expect(item.brief).toBe('');
});

test('HANDOFF SORT07 · completion updates its row in place until explicit reload', async ({
  page,
}) => {
  await login(page, 'content');
  await navigate(page, 'Việc của tôi');
  const session = await page.request.get('/api/v1/me').then((r) => r.json()),
    prefix = 'Stable row ' + Date.now();
  for (const suffix of ['A', 'B']) {
    const r = await page.request.post('/api/v1/tasks', {
      headers: { 'x-csrf-token': session.csrf, 'idempotency-key': prefix + suffix },
      data: {
        flow_mode: 'CHECKLIST',
        owner_id: auth.ids.content,
        job_code: 'CONTENT',
        title: prefix + suffix,
        due_at: '2027-01-01T10:00:00.000Z',
      },
    });
    expect(r.status()).toBe(200);
  }
  await page.getByLabel('Tìm công việc', { exact: true }).fill(prefix);
  const rows = page.locator('table.task-table tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(prefix + 'B');
  await rows
    .first()
    .getByRole('button', { name: prefix + 'B', exact: true })
    .click();
  const detail = page.getByRole('dialog', { name: 'Chi tiết công việc', exact: true });
  await detail.getByRole('button', { name: 'Tiến độ & kết quả', exact: true }).click();
  await detail.getByLabel('Trạng thái công việc', { exact: true }).selectOption('DONE');
  await detail
    .getByLabel('Đã thực hiện / kết quả', { exact: true })
    .fill('Stable ordering browser evidence');
  await detail.getByRole('button', { name: 'Lưu tiến độ / kết quả', exact: true }).click();
  await expect(detail.getByText('Đã hoàn thành', { exact: false }).first()).toBeVisible();
  await detail.getByRole('button', { name: 'Đóng chi tiết', exact: true }).click();
  await expect(rows.first()).toContainText(prefix + 'B');
  await expect(rows.first()).toContainText('Đã hoàn thành');
  await page.getByRole('button', { name: 'Tải lại từ đầu', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(prefix + 'A');
});
