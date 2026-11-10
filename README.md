# SuperNet

Nền tảng để tiếp tục phát triển từng chức năng, chỉ sử dụng **ADMIN, BOSS, MARKETPLACE, HR, CONTENT**. React/TypeScript, Fastify và PostgreSQL 17; frontend/API cùng cổng 3002, worker chạy riêng.

## Phát triển

Cần Node.js 24 và PostgreSQL 17. Dùng `.env.example` để tạo cấu hình riêng: `DATABASE_URL`, `DATA_DIR`, `VAULT_KEY`. Không đưa mật khẩu hoặc `.env` vào Git. Giữ nguyên `VAULT_KEY` khi nâng cấp dữ liệu đang có.

```sh
npm ci
npm run build
npm run migrate
npm run bootstrap
npm start
```

`bootstrap` tạo Admin khi chưa có, nhập mật khẩu ẩn hoặc dùng `ADMIN_PASSWORD` trong môi trường riêng. Trong terminal thứ hai, cùng cấu hình, chạy `npm run worker`. Kiểm tra `/api/health`, đăng nhập rồi thử tạo công việc. API phát triển dùng `npm run dev`; UI dùng `npx vite --host 127.0.0.1` với proxy API của repository.

## Năm ROLE

| ROLE | Phạm vi |
|---|---|
| ADMIN | Quản trị hệ thống, tài khoản và cấu hình |
| BOSS | Giao việc, quản lý công việc và xem báo cáo toàn công ty |
| MARKETPLACE | Vận hành sàn; dữ liệu shop theo quyền được cấp |
| HR | Tuyển dụng, hồ sơ nhân sự; cấp ROLE chuyên môn gắn hồ sơ |
| CONTENT | Nội dung, video; dữ liệu kênh theo quyền được cấp |

Một người có thể có nhiều ROLE. HR chỉ cấp MARKETPLACE/HR/CONTENT; ADMIN cấp quyền quản trị. Chuyên môn dùng JOB/SELF; ADMIN và BOSS dùng ACCESS/ALL. Hồ sơ nhạy cảm chỉ ADMIN; lương được cấp cho ADMIN/HR. Chia sẻ shop/kênh và tài khoản nền tảng vẫn quản lý riêng.

## Cập nhật hệ thống đang dùng

Sao lưu DB và file bằng `node scripts/backup.mjs <thư-mục-backup>`, giữ cấu hình/khóa mã hóa riêng. Thử khôi phục bằng `scripts/restore.mjs` vào DB và DATA_DIR trống khác trước khi nâng cấp dữ liệu thật. Đặt `PG_BIN_DIR` nếu công cụ PostgreSQL chưa có trong PATH.

Dừng API/worker, chạy `npm ci`, `npm run build`, `npm run migrate`, rồi khởi động lại. Migration mới nhất là **011.sql**: thu hồi mọi grant ngoài 5 ROLE (kể cả quyền cấp trong tương lai), BOSS không có scope ALL và grant CONTENT tự ánh xạ từ DESIGNER ở migration 008; tăng phiên bản quyền và xóa session của người bị ảnh hưởng. Không tự chuyển người sang ROLE khác. ADMIN cần xem lại tài khoản và cấp quyền có chủ đích.

Migration cũng thu hồi grant tài khoản theo ROLE đã bỏ, xóa ánh xạ mẫu công việc sang chuyên môn đã bỏ, tắt mẫu không còn chuyên môn hợp lệ và lịch công việc thuộc ROLE đã bỏ. Grant đã thu hồi, công việc, hồ sơ nhân viên, báo cáo và các bản ghi lịch sử được giữ lại. Các migration cũ và mẫu snapshot lịch sử được giữ để nâng cấp/đọc dữ liệu cũ; chúng không phải danh sách ROLE đang hỗ trợ.

## Kiểm thử

```sh
npm run build
npm test
npm run test:e2e
```

Dùng DB riêng có hậu tố `_test` và DATA_DIR riêng: `npm test` xóa dữ liệu kiểm thử rồi tạo fixture cho Playwright. Chromium cần được cài để chạy trình duyệt. Xem [hướng dẫn phát triển](docs/DEVELOPMENT.md), [triển khai Windows](docs/WINDOWS.md) và [chẩn đoán bootstrap](docs/BOOTSTRAP_TROUBLESHOOTING.md).

Demo chỉ chạy trên DB trống riêng: migrate, đặt `DEMO_MODE=true` và `DEMO_PASSWORD` riêng (ít nhất 11 ký tự), rồi `npm run seed:demo`. Tài khoản: `admin@demo.local`, `boss@demo.local`, `content@demo.local`, `hr@demo.local`, `marketplace@demo.local`.
