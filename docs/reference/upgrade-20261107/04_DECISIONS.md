# Quyết định đã chốt và những phần cần thêm thông tin

## Đã chốt từ yêu cầu người dùng
- Nhân viên được chia sẻ tài khoản nền tảng có quyền xem tài khoản/mật khẩu hiện tại và cập nhật mật khẩu mới sau khi tự đổi bên ngoài.
- Admin chọn nhiều người được xem bằng checkbox; nền tảng có danh sách sẵn và thêm mới.
- Lịch sử chỉ ghi lưu/cập nhật mật khẩu; chỉ Admin xem lịch sử cũ, không ghi toàn bộ hành vi dùng phần mềm như hiện tại.
- Mật khẩu nền tảng cũ/mới có thể xem theo quyền, phải mã hóa. Website login password chỉ hash.
- Bỏ tuyển dụng khỏi Nhân sự; quản lý nhân viên đang làm, mã nhân sự, tên, vị trí và thông tin cần thiết.
- Một người nhiều vị trí/role, Admin cấp; hết role mất quyền tương ứng. Staff không xem dữ liệu riêng của đồng nghiệp, ngoại lệ chia sẻ được cấp rõ.
-8giờ làm việc để phản hồi task;9–12/13–18 từT2–T7; bỏ nghỉtrưa vàChủnhật. Sinh nhật nhắc5ngàylàmviệc.

## Đề xuất thiết kế, không coi là chính sách đã được duyệt
- Phân loại hồ sơ: phase thử việc/chính thức và employment_type toàn thời gian/bán thời gian/thực tập/cộng tác tách nhau.
- Nhắc hết thử việc/hợp đồng, checklist hồ sơ thiếu, liên hệ khẩn cấp, lifecycle nghỉ việc và đồng bộ khóa user.
- Platform disable/reorder, export hồ sơ, scope lựa chọn nâng cao.
- Bỏ checkbox xác nhận đổi ngoài nền tảng; dùng một dòng hướng dẫn. Chống tạo phiên bản khi mật khẩu không thay đổi.

## Câu hỏi phải ghi rõ trước các phần phụ thuộc
| ID | Cần thêm thông tin | Hướng xử lý chưa được tự suy đoán |
|---|---|---|
| Q01 | Tick xem theo từng tài khoản/cửa hàng hay toàn bộ nền tảng? Tài khoản thêm mới có tự chia sẻ không? |Prototype theo từng account, giống cấu trúc source hiện có; không bật cascade toànplatform |
| Q02 | Khi người có2role được chia sẻ tài khoản, quyền gắn với role nào? Hết1role có mất account đó không? |Giữ ràng buộc role cũ, không bỏ rolebinding hoặc chuyểnuser-only ngầm; UI vẫn checkbox theo người |
| Q03 | Bỏ tuyển dụng có bỏ thông báo thưởng người giới thiệu lúc bắt đầu thử việc không? |Không xóa recruiter history, không tự phát sinh tiền; giữ policy cũ tắt nếu chưa chốt |
| Q04 | HR xem/sửa toàn công ty hay nhóm/nhân viên được giao? Manager được xem trường nào? |Giữ scope backend hiện có; không mở rộng HR_ALL chỉ từ menu |
| Q05 | Nhắc hết thử việc/hợp đồng trước bao nhiêu ngày, lịch hay làm việc? |Chỉ thiết kế, không chạy worker rule tự chọn |
| Q06 | Những tài liệu nào bắt buộc theo từng loại nhân viên? |Checklist demo không phải chuẩn bắt buộc cho mọi người |
| Q07 | Mẫu mã nhân sự, ai cấp, có tự tăngSN hay nhập tay; xử lý nhân viên cũ chưa có mã? |Tạo mới unique; legacy chờ mapping HR; không chế mã thật |
| Q08 | Pháp nhân của tài khoản/hồ sơ có cần chọn khi quản lý nhiều công ty? |Không gộp SuperNet và pháp nhân khác; giữ dữ liệucompany cũ |
| Q09 | Ngày lễ, sinh29/2, lịch người làm bán thời gian, nhắc khi ngày sinh điều chỉnh? |Không tự bật policy chưa xác nhận |
| Q10 | Nghỉ việc có thể đặt trước ngày hiệu lực? Task chưa xong giao ai, xử lý sharedcredentials thế nào? |Bản mẫu minh họa hiệu lực ngay; production cần quy trình bàn giao và xét ngày |
| Q11 | Muốn dừng cả access/error logs vận hành hay chỉ nhật ký hành vi chung? |Ngừng generic audit hành vi; chỉ giữ log lỗi tối thiểu không secret, không tracking dưới tên khác |

Các phần không phụ thuộc câu hỏi có thể triển khai ngay: đổi nhãn/menu, drawer, label rõ, nhiều checkbox, picker người có tên, filter/sort, lỗi dễ hiểu, giữ hash/encryption và thêm test. Không cần hỏi lại quyền sửa bản mẫu vì người dùng đã yêu cầu.

## Ưu tiên đặc tả
1. Yêu cầu mới nhất của người dùng.
2. Quy tắc đã chốt được giữ trong gói này.
3. Đề xuất được ghi rõ là đề xuất.
4. Hình/prototype chỉ là minh họa trải nghiệm. Hành vi demo có thể giản lược; không dùng để ghi đè backend rules.

Không có quyết định nào cho phép xóa DB, reset password admin, xóa audit cũ hoặc tự triển khai chức năng ERP/payroll/hóa đơn điện tử hoàn chỉnh.
