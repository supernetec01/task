# Hướng dẫn sử dụng theo vai trò

> Các luồng HR, lương/thưởng, cấp tài khoản từ hồ sơ, chia sẻ nền tảng/account và form task mới được hướng dẫn tại [Bản sau duyệt QC](RELEASE-APPROVED-20261107.md). Quyết định mới thay thế phạm vi HR/share cũ.
## Admin

Đăng nhập tài khoản đã bootstrap. Vào **Đội ngũ & phân quyền** để tạo nhóm/người dùng; chọn quản lý và người duyệt mặc định. Cấp ít nhất một chuyên môn JOB và quyền ACCESS phù hợp. Chuyên môn cho biết dữ liệu vị trí nào được đọc; ACCESS xác định giao/duyệt theo cá nhân/nhóm/toàn tổ chức. Có thể cấp nhiều JOB; role hết hạn theo đúng thời điểm, không phải tự chuyển thành cuối ngày.

Sau khi chốt với chủ hệ thống, vào **Thiết lập** xác nhận lịch/ngày nghỉ/chính sách tuần, timeout, gia hạn. Quyết định phải có lý do/người chốt. Không bật toàn bộ chỉ để bỏ lỗi cấu hình. Recurring không tạo task trừ rule được bật. Kiểm tra **Nhật ký thay đổi** để truy vết, không xóa lịch sử.

Admin tạo tài khoản nền tảng, cấp người/role/thời hạn tại từng tài khoản. Lịch sử chỉ hiện metadata; muốn xem từng mật khẩu cũ cần bấm riêng và được audit. Không nhầm mật khẩu nền tảng với mật khẩu đăng nhập website.

## Nhân viên

**Việc của tôi** gồm task chính và lời mời hỗ trợ còn hiệu lực. Có tìm kiếm/trạng thái/role, bảng hoặc board. **Thêm việc phát sinh** chỉ cần tên/role/hạn; loại mặc định OTHER. Trường chuyên môn chỉ xuất hiện khi thực hiện, không bắt nhập toàn bộ lúc giao.

Task được giao: Nhận hoặc Từ chối trong 8 giờ làm việc. Sau khi nhận, bấm bắt đầu; ghi tiến độ/bước tiếp theo/khó khăn, đánh dấu checkpoint nếu có. **Nộp kết quả** bằng văn bản hoặc file/link; task dựng/quay/thiết kế cần đầu ra file/link. Cần sửa sẽ có feedback và lần nộp mới; bản cũ giữ nguyên. Đề nghị gia hạn không tự đổi hạn trước khi người có quyền quyết định.

Lời mời hỗ trợ: chỉ thấy brief và tệp được chia sẻ khi pending. Chấp nhận/Từ chối chỉ thay lời mời của mình. Sau chấp nhận, cập nhật **Phần hỗ trợ của tôi**; báo xong không hoàn tất task chính, không cho sửa người phụ trách/hạn hoặc nộp thay owner.

**Kế hoạch tuần** lưu việc dự định và có thể liên kết task, không copy task. **Báo cáo** tự tổng hợp: kiểm tra chính/hỗ trợ/chuyển tiếp; bổ sung kết quả khác, khó khăn, hỗ trợ và kế hoạch sau. Có nháp theo role hoặc chung; nhấn **Nộp báo cáo tuần** tạo snapshot/phiên bản mới. Quản lý không đọc được nháp. Xem lại bản đã nộp hoặc tải XLSX đúng phiên bản. Hết role sẽ không được tải lại khối dữ liệu của role đó.

Nếu có lỗi mạng hoặc 409, nội dung chưa được xác nhận đã lưu. Giữ cửa sổ, đọc lỗi, tải bản mới/đối chiếu trước khi sửa tiếp; không cho rằng thao tác đã hoàn tất chỉ vì bấm nút.

## Quản lý và sếp

**Công việc nhóm** chỉ có nhân viên trong scope được cấp. Giao task ngắn, có thể chọn hỗ trợ ngay khi tạo. Mở task để xem tiến độ/blocker, các lần nộp và contribution. Duyệt đúng bản nộp hiện tại hoặc yêu cầu sửa có feedback. Không tự duyệt task của mình; cần người duyệt khác.

**Báo cáo → Báo cáo đã nộp** chọn tuần, nhân viên và phiên bản. Chưa nộp chỉ hiện trạng thái chờ, không mở draft/live của nhân viên. Báo cáo/số nguồn lịch sử không thay khi task hoặc import được sửa sau đó. Xuất Excel theo role/phiên bản được chọn. Sếp không tự có quyền HR nhạy cảm hoặc mật khẩu nền tảng của người khác.

## Chuyên môn

- **Content/Designer**: hồ sơ sản phẩm/chiến dịch/nội dung, lịch quay, file bàn giao, bài đăng/live. Mã hồ sơ được hiển thị để liên kết; bài đăng cần đúng task đã duyệt của nội dung. Hồ sơ mềm có phiên bản, không gọi file hoàn thiện là bài đã đăng.
- **Vận hành/ADS**: chọn đúng nền tảng/shop/tiền tệ/loại nguồn. Upload không tự ghi KPI. Chọn sheet/dòng tiêu đề/cột ngày/mapping/locale; xem preview và sửa hết lỗi trước khi commit. Dòng tổng và phần trăm thay đổi tách khỏi dòng ngày. Nguồn chồng kỳ cần quyết định tạo revision, không cộng thêm. Unique/ratio/snapshot không cộng ngang ngày; GMV ads và GMV shop không cộng thành doanh thu chung. N/A khác 0. Bồi hoàn nhập tiền cấp đơn, SKU giữ chuỗi có số 0 đầu.
- **HR**: tạo ứng viên/ứng tuyển/lịch phỏng vấn; chuyển thành hồ sơ nhân viên bằng tham chiếu. Ghi ngày thực tế bắt đầu thử việc; hệ thống thông báo một lần, không tự tính thưởng. Lên chính thức/nghỉ việc giữ lịch sử. Hồ sơ lương/định danh chỉ qua quyền nhạy cảm riêng. Job sinh nhật chỉ chạy khi policy được chốt.
- **Kho**: ghi thiết bị/mượn/trả/mẫu và tham chiếu dòng BigSeller. Web không tự đồng bộ hoặc sửa tồn BigSeller. Cảnh báo trùng lịch cần người điều phối xử lý, không tự hủy lịch.
- **Kế toán/đề nghị**: nhân viên tạo nháp nhu cầu. Chưa có policy sẽ chưa nộp được. Có policy thì duyệt từng bước; chưa có giá chỉ thành “Cần báo giá”. Sửa số tiền/pháp nhân/NCC sau duyệt trở lại nháp và cần duyệt lại. Xử lý ngoài hệ thống phải có mã/căn cứ; app không tự chuyển tiền hoặc phát hành hóa đơn điện tử.

## Vận hành

Đọc WINDOWS.md và README. Chạy cả API và worker, theo dõi log, backup DB + file nhất quán và giữ khóa vault riêng. Kiểm thử restore định kỳ theo lịch đã chốt. Máy chủ phải bật/nối mạng; lỗi máy chủ khiến mọi người không truy cập được.
