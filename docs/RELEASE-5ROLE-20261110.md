# Bàn giao nâng cấp 5 ROLE · 10/11/2026

Branch: `upgrade/5-role-20261110`. Baseline: `217671e39b85221f5653e24c86640400ede074db`.

Ứng dụng vẫn là React/TypeScript + Fastify + PostgreSQL 17; frontend/API cùng cổng 3002, worker riêng. Không triển khai production hoặc push repository trong phiên này.

## Chức năng và mã nguồn

- Phân quyền 5 ROLE, HR cấp tài khoản gắn hồ sơ, đặt lại mật khẩu Admin, quyền theo pháp nhân/shop/kênh: `server/handoff-access.ts`, `role-bundles.ts`, `capabilities.ts`, `web/hr-v2.tsx`.
- Checklist, kết quả bắt buộc, hủy/mở lại/bàn giao/đổi hạn có version và lịch sử; bộ lọc, giờ Việt Nam, cursor ký và thứ tự ổn định: `server/checklist.ts`, `tasks.ts`, `web/checklist.tsx`.
- Năm adapter, kiểm tra workbook/ZIP, preview/confirmation, immutable facts, chống trùng/giao kỳ và thay revision: `server/source-parser.ts`, `source-imports.ts`, `metrics.ts`, `web/sources.tsx`.
- Kịch bản → quay → dựng, nhiều lượt đăng, video lịch sử, snapshot và nguồn D7 có chứng từ: `server/content.ts`, `video-window.ts`, `web/content-v2.tsx`.
- Tuyển dụng, phỏng vấn, tiếp nhận nhân viên, hợp đồng nhiều revision, lương mã hóa theo ngày hiệu lực, nghỉ việc dự kiến/thực tế, sinh nhật và nhắc việc: `server/hr.ts`, `hr-jobs.ts`, `employees.ts`, `worker.ts`, `web/hr-v2.tsx`.
- Báo cáo V2 theo sự kiện, nhiệm vụ chuyển tiếp, nhiều chuyên môn, nguồn đúng kỳ, snapshot/XLSX bất biến và thông báo Sếp: `server/report-v2.ts`, `reports.ts`, `web/reports.tsx`.
- Giao diện task, dữ liệu và quyền cũ được giữ trong các mục có nhãn “cũ”. Không tự ánh xạ MANAGER/ADS/WAREHOUSE/EXECUTIVE sang quyền mới; không cấp mới EXECUTIVE.

## Thiết lập và chạy

Dùng checkout hiện có. Cần Node.js 24, PostgreSQL 17 và công cụ `psql`, `pg_dump`, `pg_restore`. Cấu hình từ `.env.example`; không ghi bí mật vào Git. Giữ nguyên `VAULT_KEY` đang bảo vệ dữ liệu cũ. DATABASE_URL, DATA_DIR phải tách riêng giữa production/demo/test.

```bash
npm ci
npm run build
npm run migrate
npm start
```

Trong terminal thứ hai, cùng thư mục/cấu hình:

```bash
npm run worker
```

Kiểm tra nội bộ `/api/health` phải trả `{"ok":true}`, sau đó đăng nhập và thực hiện một request/task thật. Main kiểm tra migration 010 trước khởi động. Với phát triển, dùng `npm run dev`; UI riêng có thể chạy `npx vite --host 127.0.0.1` với proxy API của repository.

Môi trường cloud hiện tại dùng `/workspace/task`, cấu hình riêng `/workspace/.cloud-setup/task.env`, PostgreSQL trong `/workspace/.cloud-setup/pgdata`. Script cục bộ `/workspace/.cloud-setup/install.sh` đã được chạy lại thành công. Chạy `source /workspace/.cloud-setup/task.env` trong mỗi terminal; giữ npm cache trong `/workspace/.npm-cache`. API mới và worker đang chạy với database thử nghiệm, không phải dữ liệu công ty.

## Nâng cấp dữ liệu thật — chỉ người vận hành đã được ủy quyền thực hiện

1. Ghi nhận branch/HEAD và thay đổi cục bộ. Đọc `IMPLEMENTATION_STATUS.md`, bảng nghiệm thu và bộ đặc tả trong `docs/handoff-20261110`.
2. Sao lưu nhất quán DB/file bằng `node scripts/backup.mjs <thư-mục-backup-riêng>`. Đặt `PG_BIN_DIR` nếu công cụ PostgreSQL chưa có trong PATH. Giữ VAULT_KEY và cấu hình bí mật riêng khỏi gói chia sẻ.
3. Chạy `node scripts/handoff-preview.mjs --write <fingerprint-truoc.json>` trên bản sao thử nghiệm. Không in `.env`, mật khẩu hoặc ciphertext ra log.
4. Dừng API/worker writer khi triển khai code và schema đồng bộ. `npm ci`, `npm run build`, rồi `npm run migrate` bằng tài khoản migration thích hợp. Không seed/reset/bootstrap dữ liệu đang sử dụng.
5. Chạy `node scripts/handoff-preview.mjs --compare <fingerprint-truoc.json>`. `MODIFIED`/`MISSING` là lỗi phải điều tra. `ADDED` cần review: bundle chuyên môn có thể thêm CONTENT cho DESIGNER và EMPLOYEE cho chuyên môn còn hiệu lực. Không tự mở BOSS TEAM thành ALL.
6. Review hàng đợi `/api/v1/role-mappings`, nguồn legacy chưa xác nhận, lương chưa rõ ngày hiệu lực và nội dung chưa liên kết. Chọn nguồn theo mã/pháp nhân thực tế, không theo filename.
7. Khởi động API/worker, kiểm tra health, đăng nhập bằng từng ROLE, quyền file và source, báo cáo đã nộp. Windows/LAN cần kiểm tra PowerShell/firewall/hai máy thật theo `docs/WINDOWS.md`; phần này chưa được chạy trong cloud Linux.

Migrations 008–010 thêm typed tables và ràng buộc theo flow. Task hiện có vẫn `LEGACY_REVIEW`; FK submission đúng task vẫn giữ. Không có fake submission để hoàn thành checklist. Hash mật khẩu, credential/HR ciphertext, template snapshot và report snapshot cũ không bị viết lại.

## Khôi phục

Tạo DB trống **khác** và thư mục DATA_DIR trống **khác**. Đặt `RESTORE_DATABASE_URL`, `RESTORE_DATA_DIR`, rồi chạy `node scripts/restore.mjs <backup-folder>`. Giữ đúng VAULT_KEY, kiểm checksum, chạy migration tương ứng và health/đăng nhập trước khi chuyển người dùng. Script từ chối ghi đè DB/thư mục đang có dữ liệu.

Sau khi đã có V2 writes, rollback không phải DROP các bảng mới. Dừng writer, giữ dữ liệu V2 phát sinh, phục hồi bản backup vào đích riêng và thống nhất kế hoạch đối soát với chủ hệ thống trước khi chuyển lại.

## Kiểm tra theo ROLE

- **Admin:** tạo pháp nhân/shop/kênh và cấp READ/WRITE; cấp đúng 5 ROLE; sửa hạn/bàn giao/mở lại checklist với lý do; kiểm tra lịch sử credential.
- **Sếp:** giao checklist cho người đang có chuyên môn; chỉ đọc tiến độ và báo cáo đã nộp. Thử HR/lương/raw shop phải bị từ chối nếu không có ROLE/quyền bổ sung.
- **Sàn:** chọn nguồn được cấp, upload → preview → xác nhận → commit; xem doanh thu và KOC đúng kỳ. Không cộng KOC vào doanh thu, không biến hoa hồng ước tính thành quyết toán.
- **HR:** tạo ứng viên/ứng tuyển/phỏng vấn → tiếp nhận hồ sơ → cấp tài khoản chuyên môn; thêm hợp đồng và lương theo ngày. Lương tương lai không đổi mức hiện hành. Nghỉ việc tương lai không tự khóa user.
- **Content:** tạo hồ sơ, phân công và hoàn tất từng bước với bằng chứng; clip xong không cần đăng; mỗi lượt đăng riêng. Ngày/giờ chưa đủ phải xác nhận; GMV D7 cần chứng từ đúng cửa sổ.

## Kết quả và giới hạn

92 kiểm thử server đạt; toàn bộ 44 ca Chromium desktop/mobile/upgrade đạt. Build/typecheck đạt; repository không có lint script. npm audit: 0 lỗ hổng. Ảnh UI và log tại `docs/evidence-20261110`; bảng 73 ca tại `docs/HANDOFF-ACCEPTANCE-20261110.csv`.

Restore baseline rồi chạy 008–010 giữ nguyên fingerprint mọi hàng cũ trong các bảng đã kiểm; chỉ thêm 6 grant bundle được duyệt. Restore DB/file-store riêng giải mã được credential và xác minh 8 file; cả instance chính và bản restore đều qua health + đăng nhập + request task có xác thực.

**Nguồn hoàn/hủy bị chặn:** 113 dòng SKU / 112 đơn được đọc đúng, nhưng đơn `586925627499971625` có refund `143999` và `72000` ở dòng 108/109. Quy tắc yêu cầu tiền cấp đơn thống nhất; cần nguồn sửa/xác minh, không tự cộng hoặc chọn một giá trị. MET07 = BLOCKED.

G01–G05 vẫn là yêu cầu nguồn/metadata thực tế: GMV D7, kỳ KOC, năm/giờ video, shop/pháp nhân, nguồn trả hàng và hoa hồng quyết toán. Test chỉ dùng mapping synthetic trong *_test, không xác nhận chúng thay doanh nghiệp. Windows/LAN = PENDING_SITE_VERIFICATION (OPS01 BLOCKED phần tại chỗ). Bundle frontend có cảnh báo kích thước của Vite; build vẫn thành công.
