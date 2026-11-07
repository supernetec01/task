# Bản nâng cấp sau duyệt QC · 07/11/2026

Các quyết định tại [APPROVED-REVIEW-20261107.md](APPROVED-REVIEW-20261107.md) thay thế các mục còn chờ về HR, tài khoản và hợp đồng trong tài liệu cũ.

## Những gì thay đổi

| Phần               | Hành vi mới                                                                                                                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nhân sự            | HR xem/sửa hồ sơ cơ bản toàn công ty, gồm hồ sơ Admin tạo. Không tạo bản sao dữ liệu theo role.                                                                                                                                                       |
| Lịch sử            | Tab Lịch sử chỉnh sửa lưu người sửa, thời gian, trước/sau; bảng append-only, chặn sửa/xóa. Không tái tạo giả giá trị trước/sau của các chỉnh sửa từ trước bản nâng cấp.                                                                               |
| Riêng tư           | Admin và ACCESS Ban lãnh đạo xem định danh, thuế, BHXH, ngân hàng. Quản lý/Sếp cũ không tự có quyền mới. HR xem/sửa lương/thưởng ở mục riêng; lịch sử lương cũng được mã hóa và kiểm quyền.                                                           |
| Cấp tài khoản      | Admin mở hồ sơ → Công việc → Cấp tài khoản cho nhân viên. Wizard điền sẵn tên/vị trí/bộ phận; vẫn chọn username và mật khẩu riêng tối thiểu 11 ký tự, chỉ lưu Argon2 hash.                                                                            |
| Làm mới            | HR, account, công việc và các danh sách nghiệp vụ chính tự tải lại mỗi 60 phút khi trang mở; có nút tải lại ngay. Không thay nội dung form đang sửa.                                                                                                  |
| Chia sẻ account    | Admin tick từng người ở nền tảng hoặc từng account. Nền tảng áp dụng cho account hiện tại/mới đang kế thừa; danh sách riêng account được ưu tiên. Có lọc người A xem account nào và danh sách người đang xem account A.                               |
| Chuyển quyền cũ    | Chỉ quyền share còn hiệu lực, có user hoạt động và JOB phù hợp tại thời điểm migration được chuyển. Sau đó share theo user, không mất quyền chỉ vì đổi JOB. Không sửa ciphertext/lịch sử mật khẩu.                                                    |
| Hợp đồng           | Worker nhắc trước 7 ngày lịch, chỉ JOB HR đang hiệu lực nhận. Chống gửi trùng; Admin/Ban lãnh đạo không nhận nếu không có JOB HR. Có bật/tắt trong Thiết lập.                                                                                         |
| Mẫu công việc      | Tất cả mẫu ngoài kho có trường theo mục đích; 60 mẫu được thay form/điều chỉnh, các mẫu chuyên biệt sẵn có được giữ và hoàn thiện. [Danh mục từng form](TASK-FORMS-20261107.md). Task cũ giữ snapshot. Mẫu do Admin tự sửa không bị migration ghi đè. |
| Phân tích sản phẩm | Phải tải file tài liệu và chọn làm kết quả; chỉ nhập chữ/link không thay được file bắt buộc.                                                                                                                                                          |
| Sản xuất video     | Kịch bản → kế hoạch, ngày quay, nhân sự → tư liệu → hậu kỳ → lịch đăng → link/nền tảng/thời điểm đã đăng. Server kiểm thứ tự bước, thông tin bắt buộc, ngày quay/đăng và chặn thời điểm đăng tương lai. Nộp đủ vẫn qua quy trình duyệt hiện có.       |
| Tổng quan          | Tổng hợp toàn bộ task phù hợp quyền/bộ lọc, vượt giới hạn 100 dòng của trang. Báo cáo tuần và snapshot lịch sử vẫn giữ kỳ riêng.                                                                                                                      |
| Đăng nhập LAN      | Giới hạn 10 lần/phút theo tài khoản + IP và 100 lần/phút tổng theo IP, tránh nhiều nhân viên chung mạng chặn lẫn nhau.                                                                                                                                |

## Các mục QC đã xử lý

- QC01: bỏ scope theo người tạo cho HR; QC02/QC06: lỗi tiếng Việt ở đầu form và dưới trường sai, focus đúng trường; QC07: báo rõ trùng mã nhân sự.
- QC03: lỗi nguồn nhập có thông báo và nút thử lại, không giả làm danh sách trống.
- QC04: checklist tính trên sự tồn tại tài liệu, độc lập với quyền đọc nội dung file.
- QC05: thay quy tắc TEAM cũ bằng quyền Ban lãnh đạo riêng và lương/thưởng riêng.
- QC08: chỉ gọi revision báo cáo sau khi chọn, không gọi UUID giả.
- UX01/UX02: bộ lọc HR mở riêng; KPI gọn; mobile dạng thẻ; form tạo ngắn, vị trí trước thông tin bổ sung.
- UX03: dịch nhãn nghiệp vụ, chọn cột import theo tiêu đề thay chỉ số 0/1; giữ quy tắc tổng hợp số liệu.
- UX04/UX05: account mobile dạng thẻ, hồ sơ hiện rõ user liên kết và có bước cấp tài khoản sau tạo.
- UX06/UX07: cập nhật mỗi giờ/thủ công và tổng hợp task trên toàn phạm vi đã lọc.

## Cập nhật trên Windows

1. Sao lưu DB và thư mục DATA_DIR theo quy trình hiện có; giữ nguyên `.env` và VAULT_KEY đang dùng.
2. Dừng API và worker, cập nhật source, mở PowerShell tại thư mục dự án.
3. Chạy:

```powershell
npm ci
npm run migrate
npm run build
npm start
```

Mở PowerShell thứ hai cùng thư mục để chạy worker:

```powershell
npm run worker
```

API mặc định nghe `0.0.0.0:3002`. Truy cập `http://localhost:3002` trên máy chủ hoặc `http://<IP-may-chu>:3002` trong LAN đã mở firewall. Với Task Scheduler đã cài, khởi động lại cả `SuperNet-api` và `SuperNet-worker` thay vì mở terminal. Xem [WINDOWS.md](WINDOWS.md).

Migration mới là `007.sql`, atomic và có khóa chống chạy đồng thời. Không chạy bootstrap để ghi đè admin; tài khoản/mật khẩu hiện có giữ nguyên. Thiếu migration mới, server dừng với `MIGRATION_REQUIRED` thay vì chạy với API thiếu bảng/cột. Nếu tách migration role/runtime role, cấp quyền cho các bảng và sequence mới theo SCHEMA.md trước khi khởi động.

## Thử nghiệm sau cập nhật

1. Admin tạo hồ sơ → HR tải lại thấy hồ sơ → HR sửa → kiểm tra lịch sử người sửa, trước/sau.
2. Admin cấp riêng quyền Ban lãnh đạo tại Đội ngũ & phân quyền; kiểm tra HR không đọc định danh/ngân hàng nhưng đọc được lương/thưởng.
3. Tick người ở nền tảng, tạo account kế thừa; kiểm tra lọc người xem. Đặt danh sách riêng account rồi thu hồi; kiểm tra người bị bỏ chọn không reveal được mật khẩu.
4. Tạo task phân tích sản phẩm và video mới; thử nộp thiếu file/link, rồi bổ sung đủ. Task cũ vẫn dùng phiên bản mẫu khi tạo.
5. Kiểm tra worker chạy và hợp đồng đến mốc 7 ngày chỉ xuất hiện trong thông báo HR.

Không nâng cấp nghiệp vụ kho trong đợt này; không xóa task/kho cũ. Không tự kết nối ERP, BigSeller, ngân hàng hoặc phát hành hóa đơn. Mốc nhắc hết thử việc và quy trình nghỉ việc đặt lịch tương lai vẫn cần quyết định riêng; không tự suy ra từ quyết định nhắc hợp đồng.
