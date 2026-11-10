# Quyết định sản phẩm và quy ước triển khai

## Đã được chấp thuận qua bản thiết kế

| ID | Quyết định | Hệ quả |
|---|---|---|
| D01 | Chỉ 5 ROLE hiển thị: Admin, Sếp, Vận hành Sàn TMĐT, HR, Content Marketing | Nhiều ROLE trên một tài khoản; không có ROLE phụ hiện trên UI cấp quyền. |
| D02 | Admin toàn quyền; mật khẩu website chỉ reset, không đọc plaintext từ hash | Không reset/đổi hash khi migrate. |
| D03 | Sếp xem tiến độ mọi nhân viên, giao task, nhận báo cáo tuần | Không tự có HR/lương/nháp/credential; không cần duyệt từng task checklist. |
| D04 | HR tạo user gắn nhân viên và cấp ba ROLE chuyên môn | Chỉ Admin cấp Admin/Sếp; HR không sửa hoặc khóa tài khoản có Admin/Sếp. |
| D05 | Checklist mới: Chưa thực hiện / Đang thực hiện / Đã hoàn thành / Đã hủy | Nhân viên hoàn thành việc mình, kết quả bắt buộc; hủy cần lý do. |
| D06 | Sản xuất tách clip hoàn chỉnh và lượt đăng | Một nội dung có nhiều lượt đăng; báo cáo tính theo mốc từng bước. |
| D07 | Nhân sự/ứng viên/hợp đồng/lịch sử lương riêng, sinh nhật tách hai nhóm | Không tự cấp quyền theo chức danh. |
| D08 | HR quản lý lương; định danh/thuế/BHXH/ngân hàng giữ quyền Admin của thiết kế | Sếp không nhận các dữ liệu này trong báo cáo. Legacy EXECUTIVE không cấp mới và không gộp vào Sếp. |
| D09 | Báo cáo tuần T2–CN, hạn nộp đề xuất được duyệt: T2 10:00 | Múi giờ VN; quá hạn được nộp nhưng có nhãn trễ, không tự nộp thay. |
| D10 | Mốc nhắc: thử việc 7,3 ngày lịch; hợp đồng 30,7 ngày lịch | Nhận HR còn hiệu lực, trong app, không tự chuyển trạng thái lao động. |
| D11 | Sinh nhật: danh sách đầu tháng và nhắc trước 5 ngày làm việc | 29/2 bỏ qua nhắc ngày trong năm không nhuận, vẫn hiện danh sách tháng 2. |
| D12 | Nhập dữ liệu chọn loại trước, giữ tên gốc | Backend kiểm tra nội dung, preview, confirm, commit nguyên tử. |
| D13 | Bản nộp báo cáo/số liệu nguồn có phiên bản, lịch sử không ghi đè | Xuất file theo snapshot đã chọn. |

Ngày chấp thuận: 10/11/2026 qua tin nhắn đồng ý toàn bộ nâng cấp/thiết kế. D09–D11 là cấu hình khởi đầu có thể đổi bởi Admin có ghi lý do; migration không được ghi đè cấu hình doanh nghiệp đã khác mà không có diff/review.

## Quy ước được xác định trong bộ bàn giao để không còn khoảng trống cho Codex

| ID | Quy ước chính xác |
|---|---|
| E01 | Thứ tự task và bộ lọc theo 04. Quá hạn dựa due_at thật; không có điểm KPI/thái độ. |
| E02 | Task mới mặc định CHECKLIST + WAITING, cả tự tạo và Sếp giao. Không tạo assignment/response timeout ở flow này. |
| E03 | Chỉ owner hoặc Admin cập nhật trạng thái task mới. Owner được sửa title/description khi chưa đóng. Sếp chỉ tạo/giao và đọc. |
| E04 | Chỉ Admin sửa hạn/đổi owner/mở lại task mới; bắt buộc lý do. Nhân viên đề nghị qua trao đổi; chưa có workflow duyệt hạn mới cho Sếp. |
| E05 | V1 không thêm người hỗ trợ vào checklist mới. Task hỗ trợ legacy giữ API/UI cũ trong vùng “Công việc cũ”, không nhân task trong báo cáo. |
| E06 | D7 chuẩn dữ liệu lưu cửa sổ [published_at, published_at+168 h). Chỉ nguồn được xác minh đúng cửa sổ này mới gắn D7. Nếu nguồn dùng định nghĩa khác, lưu nhãn khác và cần quyết định trước khi gọi là D7. |
| E07 | Tổng kinh doanh theo shop+company+platform; không mặc định cộng hai pháp nhân. Không cộng GMV KOC thêm vào doanh thu sàn. |
| E08 | Hoàn tiền nguồn sales không có nghĩa hàng đã trả về kho; chỉ tiêu đơn trả hàng không đủ nguồn hiện N/A. |
| E09 | Import V1 chỉ nhận XLSX/CSV, tối đa 25 MiB, XLSX giải nén tối đa 100 MiB/2000 entry. File mã hóa/password/macros từ chối. |
| E10 | KOC period aggregate chỉ gắn được báo cáo tuần nếu kỳ nguồn khớp toàn tuần; không chia đều/cắt theo ngày để lấp kỳ. |
| E11 | Nghỉ việc hiệu lực hôm nay/quá khứ có xác nhận bàn giao; ngày tương lai chỉ lưu dự kiến, chưa tự khóa tài khoản. |
| E12 | Danh sách tự refresh mỗi 60 phút khi trang mở và nút tải lại; có thay đổi trong form thì không ghi đè. Task tab mở không nhảy vị trí khi đổi trạng thái trước khi người dùng lưu xong. |
| E13 | Tiền dùng NUMERIC/decimal string trên API; count integer, ID nền tảng text; date-only giữ YYYY-MM-DD; giờ lưu UTC. |
| E14 | Không hard-delete task, contract, lương hoặc revision đã phát sinh. Dữ liệu sai sửa bằng revision/correction có lý do. |

## Những gì còn thiếu là nguồn dữ liệu, không phải thiếu quyền bắt đầu viết code

G01 GMV video theo cửa sổ D7; G02 kỳ thực tế của file KOC; G03 năm/giờ ngày video chưa đầy đủ; G04 mã cửa hàng/pháp nhân của từng file; G05 nguồn trả hàng riêng và hoa hồng quyết toán. Đã có hành vi xử lý ở 14; không suy ra từ tên file. Dev vẫn làm toàn bộ UI/API và adapter có mẫu, chỉ chặn commit/chỉ tiêu thiếu nguồn tương ứng.
