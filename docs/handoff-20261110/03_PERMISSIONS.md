# Ma trận quyền bắt buộc thực hiện ở API

SELF = đúng user trong session; ALL = mọi nhân viên trong instance. Có nhiều ROLE thì cộng quyền hợp lệ, nhưng hạn chế HR đối với user đặc quyền vẫn áp dụng trừ khi actor có Admin. Bộ chọn ROLE trong prototype là công cụ xem, không phải đăng nhập/authorization sản phẩm thật.

| Hành động | Admin | Sếp | Sàn | HR | Content |
|---|---|---|---|---|---|
| Xem task mới | ALL | ALL | SELF | SELF | SELF |
| Tạo task cho mình | Có | Có nếu có JOB bổ sung | Có | Có | Có |
| Giao task cho người khác | ALL | ALL | Không | Không | Không |
| Sửa tiến độ/kết quả task | ALL | Không, trừ SELF khi có JOB | SELF | SELF | SELF |
| Hủy task chưa đóng | ALL, lý do | Không | SELF, lý do | SELF, lý do | SELF, lý do |
| Sửa hạn/đổi owner/mở lại checklist | ALL, lý do | Không | Không | Không | Không |
| Bình luận task | Task được xem | Task được xem | SELF | SELF | SELF |
| Nộp báo cáo cá nhân | Có nếu có JOB | Có nếu có JOB | SELF | SELF | SELF |
| Đọc nháp báo cáo | Chỉ nháp của mình | Không đọc người khác | SELF | SELF | SELF |
| Xem báo cáo đã nộp | ALL | ALL | SELF | SELF | SELF |
| Sales/KOC/import sàn | ALL | Qua báo cáo đã nộp | Theo shop được cấp | Không | Không |
| Sản xuất/video/import video | ALL | Qua task/báo cáo | Không | Không | SELF hoặc nội dung tham gia |
| Hồ sơ nhân viên cơ bản | ALL | Không | Không | ALL | Không |
| Hồ sơ ứng viên/CV/phỏng vấn | ALL | Không | Không | ALL | Không |
| Lương và lịch sử lương | ALL | Không | Không | ALL | Không |
| Định danh/thuế/BHXH/ngân hàng | ALL | Không | Không | Không | Không |
| Hợp đồng/tài liệu HR cơ bản | ALL | Không | Không | ALL | Không |
| Tạo user gắn hồ sơ | ALL | Không | Không | Chuyên môn, user không đặc quyền | Không |
| Cấp Admin/Sếp | Có | Không | Không | Không | Không |
| Đặt lại password web/khóa user | Có | Không | Không | Không; offboarding chuyên môn theo luồng HR | Không |
| Chia sẻ tài khoản nền tảng | Có | Không | Không | Không | Không |
| Reveal/cập nhật credential hiện hành | Có | Chỉ nếu được share rõ | Được share rõ | Được share rõ | Được share rõ |
| Lịch sử credential cũ | Có | Không | Không | Không | Không |
| Mẫu/cấu hình/danh mục shop | Có | Không | Không | Không | Không |

## Scope dữ liệu sàn và nội dung

Thêm `resource_grants` để Admin cấp user được READ/WRITE nguồn SHOP hoặc CHANNEL; ROLE là điều kiện cần, resource grant là điều kiện đủ. Admin bypass; Sếp không tự nhận nguồn raw. Mặc định user mới **không có shop/channel**, UI yêu cầu Admin cấp; không dùng tên người tải làm khóa nguồn. Hai nhân viên cùng shop được chia sẻ một nguồn số liệu, không tạo hai bản KPI riêng vì khác owner. Ai tải có provenance, không quyết định quyền sở hữu nguồn.

Nội dung: writer/editor/camera/participant nội bộ là những người tham gia được xem hồ sơ; content owner chỉnh cấu trúc, người được phân công cập nhật bước của mình, Admin toàn quyền. Không cho mọi user Content tự sửa nội dung người khác chỉ vì có cùng JOB.

## Ánh xạ grants hiện có

| ROLE UI | Grants nền | Cách chuyển |
|---|---|---|
| Admin | ACCESS ADMIN, ALL | Giữ nguyên |
| Sếp | ACCESS BOSS, ALL | BOSS hiện hữu TEAM phải Admin xác nhận mở ALL, không tự mở |
| Sàn | JOB MARKETPLACE + ACCESS EMPLOYEE SELF | Giữ JOB, cấp EMPLOYEE nếu thiếu theo bundle |
| HR | JOB HR + ACCESS EMPLOYEE SELF | Quyền cấp 3 JOB được handler mới cho phép, không cần ADMIN |
| Content | JOB CONTENT + ACCESS EMPLOYEE SELF | DESIGNER-only thêm CONTENT theo mapping đã duyệt, giữ DESIGNER như legacy metadata |

MANAGER, ADS, ACCOUNTANT, WAREHOUSE, INTERN, TESTER_OPTIONAL, EXECUTIVE không có mapping tự động sang Sếp/HR/Content. Giữ grant và dữ liệu legacy; ghi `ROLE_MAPPING_REQUIRED` để Admin phân loại; không cho grant đó mở module V2 mới. Account legacy vẫn theo ACL riêng. Không xóa quyền historical hoặc vô hiệu user chỉ vì giao diện 5 ROLE chưa có mapping.

Legacy EXECUTIVE giữ truy cập lịch sử hiện có theo route cũ trong thời gian chuyển đổi, không có menu hoặc quyền mới ở V2, không cấp thêm. Sau Admin phân loại mới revoke có lý do. Migration không tự tước quyền hiện có không liên quan.

HR không được cấp user thiếu employee_id hoặc cấp cho user đã có Admin/Sếp; request có thêm role đặc quyền trả 403 trước khi insert. Thao tác create+grant+link cùng transaction. Actor user_id/permission không lấy từ payload.

Sửa scope/revoke/disable phải tăng permission_version, invalidate session khi phù hợp và fingerprint idempotency; reveal không cache secret. File/download/deep link kiểm lại quyền bản ghi hiện tại.
