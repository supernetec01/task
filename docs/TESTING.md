# Báo cáo kiểm thử — 06/11/2026

## Phạm vi đã chạy

Môi trường thực thi: Debian 13, Node.js 24.22.1, PostgreSQL 17 image chính thức pin digest, Chromium headless. Database thử nghiệm tách khỏi DB thiết kế ban đầu và không có dữ liệu công ty thật. Không có dữ liệu fixture hoặc mật khẩu thật được commit trong `.env`/backup. Dữ liệu mẫu trong tests chỉ là synthetic fixture.

| Lệnh / kiểm tra | Kết quả |
|---|---|
| `npm run build` | TypeScript UI/API + build JavaScript server và Vite production đạt |
| `npm test` | **36/36** nhóm kiểm thử đạt, 0 skipped/disabled, PostgreSQL thực |
| `npm run test:e2e` | **8/8** bài đạt: 4 kịch bản × desktop 1440×1000 và mobile 390×844 |
| `npm audit` và `npm audit --omit=dev` | 0 vulnerabilities ở lượt đã chạy |
| Compiled `node build/server/main.js` với NODE_ENV=production | health DB + static bundle đạt trên loopback |
| Compiled `node build/server/worker.js` | worker riêng khởi động, xử lý jobs và tạo log file đạt |
| Migration chạy lại bằng CLI JavaScript production | Không chạy lại migration đã áp dụng, không reset dữ liệu |
| `scripts/backup.mjs` → `scripts/restore.mjs` | Khôi phục vào DB + file directory trống khác, manifest checksums đạt |
| API trên bản khôi phục | Đăng nhập, đọc task, tải đúng byte file, đọc report revisions và giải mã vault bằng khóa được giữ riêng đạt |
| Kiểm tra Git | `.env`, dependencies, build, test artifacts, dump/data bị ignore; không đưa vào commit |

PostgreSQL tools cho diễn tập backup/restore chạy từ container PostgreSQL qua wrapper riêng của môi trường cloud, không có trong repo. Script bàn giao gọi `pg_dump`/`pg_restore` chuẩn từ PATH hoặc PG_BIN_DIR; cách tìm executable thực tế trên Windows vẫn cần nghiệm thu.

## Những gì integration tests kiểm tra

- Anonymous/CSRF/Origin/login, quyền Admin/HR/sales, cross-user/cross-team ID, nhiều JOB rồi thu hồi từng role; account disable/session logout.
- Calendar 8 giờ: T7 17h→T2 17h, T2 11h→T3 11h, CN 10h→T2 18h, T2 12h30→T3 12h; giữ giây lẻ; trừ 5 ngày làm việc.
- Giao nhanh OTHER, tự tạo/occurred_at không backdate created_at; nháp thiếu hạn được hoàn thiện khi giao; SCRIPT incomplete payload và nested field types.
- Assignment actor/state/version/idempotency; terminal race timeout/accept; notify dedupe.
- Support pending brief, accept/decline độc lập, hai POST đồng thời cùng key, contribution không hoàn thành task chính; hết role chặn ngay.
- Tiến độ/blocker không biến thành trạng thái khác; stale tab 409; submit revision bất biến, review đúng revision, không self-review; gia hạn giữ hạn gốc; duyệt muộn vẫn dựa giờ nộp.
- Báo cáo fixture 3 phát sinh/3 started/1 done/1 on-time/2 open, carryover riêng; draft không lộ quản lý; snapshot v1 không đổi khi nguồn/v2 thay; nộp đồng thời cùng key chỉ một revision; support snapshot riêng; lọc sau role expiry.
- XLSX là workbook thật, nguy cơ formula được giữ dưới dạng text; comparison zero/missing an toàn và khoảng tuần/tháng rõ.
- File upload/download bytes/checksum, signature sai bị chặn, file riêng không lộ pending supporter, role expiry cắt download, dữ liệu còn sau đóng/khởi tạo lại ứng dụng.
- CSV/XLSX upload thật, mapping/preview, dòng tổng không cộng vào daily, null khác 0, checksum cùng file khác tên bị chặn, preview hash cũ bị từ chối; nguồn gốc được giữ private; canonical metric revision/chồng nguồn.
- Claim một đơn/nhiều SKU, tổng allocation không vượt tiền cấp đơn, giữ SKU có số 0 đầu.
- HR scope/sensitive permission, bắt đầu thử việc một event/notification dù worker chạy lại; không tự thêm tiền payroll.
- Platform password ciphertext, current/history reveal theo quyền, audit không chứa plaintext.
- Request thiếu policy bị chặn; chưa có giá chỉ duyệt nhu cầu; sửa bản đã duyệt trở lại nháp và xóa policy snapshot để cần duyệt lại.

## Những gì E2E kiểm tra

1. Quản lý tạo task (Enter mô tả không đóng modal) → nhân viên nhận/bắt đầu/ghi tiến độ/nộp → quản lý duyệt → nhân viên bổ sung/nộp report → sếp chọn employee/revision và tải XLSX.
2. Nhân viên Content không thấy menu Admin/HR/sales; menu mobile dùng được và không tràn ngang viewport.
3. Lỗi mạng khi lưu task: nội dung được giữ, retry dùng cùng idempotency key, đóng modal hỏi trước khi bỏ nháp.
4. Supporter chấp nhận lời mời và lưu contribution qua UI; task chung vẫn chờ owner nhận, không tự DONE.

Các lỗi tìm thấy ở lượt trước (nhãn required/icon ảnh hưởng accessibility selector, không giữ thông báo sau reload report, cột grid tràn mobile, race chờ dialog trong test) đã được sửa và chạy lại các phần liên quan. Giới hạn login được giữ; hai server loopback độc lập dùng cho hai kích thước để các lần đăng nhập fixture không dùng chung bucket rate limit.

## Giới hạn và phần cần nghiệm thu tiếp

**36 integration groups + 8 E2E không có nghĩa 76 ca gốc đều đã đạt đầy đủ.** `ACCEPTANCE_STATUS.csv` phân biệt scope được automation bao phủ và các ca PARTIAL. Checklist gốc giữ nguyên trong `docs/reference/acceptance.csv`.

- Windows PowerShell/Task Scheduler/S4U, Windows filesystem ACL, firewall, reboot và truy cập LAN từ thiết bị công ty: **chưa chạy trên máy thật**.
- Nguồn TikTok/Shopee/ads/KOC thật, reconciliation/currency/attribution, số lượng người dùng/dữ liệu lớn: **chưa được cung cấp để nghiệm thu**. Không dùng số screenshot thành dữ liệu thật.
- Chính sách Q chưa chốt được giữ theo DECISIONS.md. Birthday full job integration theo holiday/leap/correction policy và attribution lịch sử sau transfer chưa nghiệm thu đầy đủ.
- Hồ sơ nghề nghiệp cho phép nhập/sửa typed data và file; chưa thay thế hệ thống analytics, payroll, ERP, ngân hàng, tồn BigSeller hoặc hóa đơn điện tử.
- Procurement/finance nâng cao P (PO/receipt/payment allocations/matching kế toán nhiều-nhiều) chưa bật; bản này triển khai đề nghị/phê duyệt/chứng từ và ghi nhận tham chiếu xử lý bên ngoài.
- Không có SSO/MFA, reset-password qua email hoặc vault multi-key rotation khi Q18 chưa chốt. Không tự purge dữ liệu hoặc hứa SLA.

## Chạy lại

Chỉ dùng DB có hậu tố `_test` và DATA_DIR riêng. `npm test` truncate toàn bộ bảng ứng dụng trong DB test trước tạo fixture. Sau đó `npm run build` và `npm run test:e2e`. Trên máy không có Chromium sẵn, cài browser test bằng Playwright. Không trỏ các lệnh này vào DB đang dùng cho nhân viên.

## Bổ sung username/admin — 06/11/2026

Migration 004 thêm username và email tùy chọn, giữ ID/hash cũ. Bộ tích hợp mới có 36 nhóm, bao gồm password 11 ký tự, username không email, bootstrap thật trên PostgreSQL và chạy lại không đổi hash. Lượt kiểm thử dùng DB mới riêng, không truncate DB cloud đang có dữ liệu. Bootstrap trên DB cloud hiện có cũng đã chạy thật, chuyển tài khoản admin fixture cũ thành username admin và giữ nguyên hash/ID. Không tạo hay đặt lại mật khẩu đã chọn của người dùng trên máy Windows từ xa.

`npm start` được chạy thật trên 0.0.0.0:3002; xác minh health/static, đăng nhập admin, quyền Admin, tiến trình vẫn trả health sau các request. Kiểm tra tiến trình con chiếm cùng cổng phải thoát 1 và hiện EADDRINUSE, giữ server đang chạy. Lời nhắc PowerShell và Windows LAN vẫn cần kiểm chứng tại máy công ty.
