# Chức năng, giao diện và luồng sử dụng

## 1. Quy ước giao diện
- Xanh chính `#176348`, nền `#F5F7F2`, chữ `#163C33`, viền `#DCE5DC`. Font system có tiếng Việt. Chữ thân14px, tiêu đề30px; nút/control cao tối thiểu42–44px.
- Sidebar228px trên desktop. Hồ sơ mở drawer620px bên phải; mobile dùng toàn màn hình. Modal rộng tối đa640px/94vw, nội dung cuộn và nút lưu luôn tìm thấy.
- Có loading, empty, không có quyền và lỗi. Lỗi giữ nguyên form. Submit có trạng thái đang lưu, chặn click lặp. Đóng/Esc khi đã sửa phải hỏi trước khi bỏ nội dung.
- Không hiện UUID, enum tiếng Anh hoặc timestampISO ở giao diện thông thường. Ngày giờ hiển thị theo `Asia/Ho_Chi_Minh`.
- Search thực tế cần debounce khoảng300ms và giữ focus. API có phân trang. Bản mẫu chỉ dùng `onchange` và dữ liệu ít; không sao chép cách render lại toàn trang vào React.
- Label, focus, keyboard và dialog phải dùng được. Mobile không tràn ngang cả trang; bảng có thể cuộn trong vùng riêng hoặc đổi thành card.

## 2. Tài khoản nền tảng
### 2.1. Danh sách
Cột: nền tảng/tên tài khoản, tên đăng nhập, mật khẩu che, người được xem (Admin), thao tác.

Tìm theo tên tài khoản hoặc login; lọc nền tảng; sắp xếp mới cập nhật, tên A–Z hoặc nền tảng. Không tìm kiếm nội dung mật khẩu. Danh sách không được trả password hoặc ciphertext.

Nút Xem/Ẩn và Sao chép lấy mật khẩu hiện tại qua endpoint riêng có kiểm quyền. Đóng, chuyển trang hoặc mất quyền phải xóa secret khỏi state. Không lưu secret vào localStorage, IndexedDB, URL hoặc cache lâu dài.

Admin có Thêm tài khoản, Sửa thông tin và chọn người được xem. Staff chỉ thấy tài khoản được chia sẻ, được xem/copy và cập nhật mật khẩu; không tự chia sẻ tiếp hoặc sửa login/nền tảng.

### 2.2. Thêm và sửa tài khoản
| Trường | Quy tắc |
|---|---|
| Nền tảng | Bắt buộc; chọn catalog, có +Thêm nền tảng cho Admin |
| Tên tài khoản / cửa hàng | Bắt buộc, trim,1–150 ký tự |
| Tài khoản đăng nhập | Bắt buộc,1–255 ký tự; chấp nhận username/email/điện thoại theo nền tảng |
| Mật khẩu | Bắt buộc khi thêm mới; không dùng chính sách tối thiểu11 của website cho nền tảng |
| Ghi chú | Tùy chọn, tối đa1000 ký tự |
| Người được xem | Checkbox nhiều người; để trống thì chỉ Admin xem |
| Pháp nhân | Giữ liên kết cũ; chưa chốt cách chọn mặc định, xemQ08 |

Một lần lưu phải tạo metadata, mật khẩu phiên bản đầu và quyền chia sẻ trong cùng giao dịch. Thiếu khóa mã hóa hoặc lỗi quyền không được để lại dữ liệu nửa chừng.

Sửa metadata không tự tạo phiên bản mật khẩu. Mật khẩu không điền lại vào form sửa; dùng hộp Cập nhật mật khẩu riêng. Đổi tên nền tảng giữ nguyênID và liên kết tài khoản/lịch sử.

### 2.3. Người được xem
Hiển thị họ tên, mã nhân sự và vị trí; không hiện user_id. Có tìm kiếm, nhiều checkbox, tích sẵn người đang có quyền. Tìm kiếm không làm mất lựa chọn ngoài bộ lọc. Một người nhiều role vẫn chỉ xuất hiện một lần.

Lưu thay đổi theo transaction; bỏ tích là thu hồi ngay, không xóa lịch sử. Backend phải kiểm quyền ở mỗi request, kể cả đang mở trang cũ. Phạm vi toàn nền tảng hay từng tài khoản và cách liên kết với role chưa chốt: xemQ01/Q02. Prototype minh họa từng tài khoản, không phải quyết định tự chia sẻ tài khoản mới.

### 2.4. Cập nhật mật khẩu
Luồng: mở tài khoản được chia sẻ → Cập nhật mật khẩu → nhập mật khẩu mới + ghi chú tùy chọn → Lưu.

Chỉ có một dòng hướng dẫn “Đổi mật khẩu trên nền tảng trước, sau đó cập nhật tại đây.” Không checkbox xác nhận bắt buộc. Website không tự đăng nhập hoặc đổi mật khẩu bên ngoài.

Server kiểm quyền, khóa accountrow, kiểm expected_version và lưu một phiên bản mới đã mã hóa. Người cập nhật và thời gian lấy từ server, không từ client. Password giống bản hiện tại thì không tạo phiên bản mới. Hai người lưu đồng thời: một người thành công, người kia nhận409 và được hướng dẫn tải lại. Retry không tạo hai phiên bản.

Mật khẩu mới không bị tự trim thành chuỗi khác. Có thể từ chối chuỗi toàn khoảng trắng nhưng phải giữ chính xác các ký tự được chấp nhận.

## 3. Lịch sử mật khẩu
Đổi menu Nhật ký thay đổi thành Lịch sử mật khẩu. Chỉ Admin xem.

Danh sách gồm thời gian, nền tảng/tài khoản/login, người cập nhật, loại thay đổi và nút Xem. Hai loại: Lưu mật khẩu lần đầu / Cập nhật mật khẩu. Lọc theo nền tảng, tài khoản, người cập nhật và khoảng ngày; thứ tự mới nhất trước.

Chi tiết: tên tài khoản tại lúc cập nhật, người thực hiện, thời gian, mật khẩu trước và sau được che riêng, nút hiện/ẩn, ghi chú. Bản đầu tiên không có mật khẩu trước. List/detailmetadata không trả plaintext hàng loạt; reveal riêng cần Admin.

Không có nút sửa hoặc xóa lịch sử. Staff xem current không được đọc version cũ. Password website vẫn chỉ hash; không có lịch sử mật khẩu website có thể đọc lại.

### 3.1. Ngừng nhật ký sử dụng chung
Không tiếp tục ghi hành vi chung như LOGIN, LOGOUT, USER_CREATED, ROLE_GRANTED, xem/copy tài khoản. Đây là thay đổi phần thu thập, không chỉ lọc giao diện.

Generic audit cũ chưa tự xóa. Retire màn/endpoint cũ có kế hoạch tương thích. Giữ các bảng lịch sử nghiệp vụ riêng: task_events, submissions/reviews, report_revisions, employment_events, request_revisions. Session, CSRF, rate limit và idempotency vẫn hoạt động. Log lỗi vận hành tối thiểu không được chứa secret, cookie, body hoặc tracking hành vi dưới tên khác.

## 4. Nhân sự
### 4.1. Phạm vi
Bỏ ứng viên, lịch phỏng vấn và lịch sử tuyển dụng khỏi màn này. Dữ liệu tuyển dụng cũ không tự xóa. Thông báo thưởng giới thiệu nhân viên lúc bắt đầu thử việc còn cần xác nhậnQ03.

Default là nhân viên đang làm. Tab Đã nghỉ việc là vùng lưu trữ, chỉ người có quyền xem. HR/Admin/manager phải theo scope được cấp; không tự cho toàn bộ staff xem danh sách đồng nghiệp.

### 4.2. Danh sách
- Tìm mã nhân sự/họ tên, lọc bộ phận, vị trí, giai đoạn và loại hình.
- Cột: nhân sự (tên+mã), bộ phận, nhiều vị trí, ngày vào làm, giai đoạn/loại hình, mở hồ sơ.
- Ba thẻ: đang làm, đang thử việc và cần bổ sung hồ sơ. Thử việc là tập con của đang làm.
- Số hồ sơ thiếu dựa checklist cấu hình theo loại nhân viên; checklist trong prototype chỉ là ví dụ.
- Xuất XLSX đúng bộ lọc, scope và các trường được phép. Không xuất trường ẩn chỉ bằng thay tham số.

### 4.3. Hồ sơ
| Tab | Nội dung |
|---|---|
| Thông tin | Mã, họ tên, ảnh tùy chọn, ngày sinh, liên hệ, địa chỉ, người liên hệ khẩn cấp |
| Công việc | Bộ phận, nhiều vị trí, quản lý, ngày vào làm, thử việc/chính thức, loại hình, hợp đồng và lịch sử công tác |
| Tài liệu | File hồ sơ, phân loại tài liệu, checklist còn thiếu và quyền tải |

Form tạo chỉ bắt buộc mã nhân sự, họ tên, ngày vào làm và ít nhất một vị trí. Mã là chuỗi duy nhất, giữ số0 đầu. Không tạo mãSN ở client bằng đếm số dòng. Team/manager có thể bổ sung sau nhưng phải cảnh báo chưa đủ điều kiện phân quyền/giao task khi cần.

Tách ba khái niệm: chuyên môn/vị trí; giai đoạn thử việc/chính thức; loại hình toàn thời gian/bán thời gian/thực tập/cộng tác. Không dùng một trường cho tất cả.

CCCD, mã số thuế, BHXH, thông tin nhận lương và lương nằm trong endpoint/quyền riêng. JOB HR không mặc nhiên là HR_SENSITIVE. Tài liệu nhân sự không tự chia sẻ với supporter của task.

### 4.4. Liên kết tài khoản
Một người có một hồ sơ dù nhiều vị trí. Employeeprofile liên kết0/1 user; không gắn tự động bằng họ tên. Khi tạo tài khoản cho nhân viên hiện hữu phải có picker liên kết, không tạo thêm một nhân viên trùng.

Vị trí trong hồ sơ khác quyền website. Không tự cấp/revoke role chỉ vì sửa vị trí hồ sơ. Nếu muốn đồng bộ cần thao tác riêng thể hiện rõ thay đổi quyền. Lịch sử công tác giữ độc lập với grants.

### 4.5. Nghỉ việc và nhắc việc
Ghi ngày nghỉ và lý do, lưu trữ hồ sơ, xử lý khóa user/session và thu hồi quyền theo quy trình được chốt. Task/report/passwordhistory vẫn giữ. Có danh sách việc cần bàn giao; không tự giao cho người bất kỳ. Ngày hiệu lực tương lai xemQ10.

Sinh nhật nhắc trước5 ngày làm việc theo yêu cầu cũ. Ngày lễ/ngày29/2 và correctionpolicy phải chốt trước khi bật đầy đủ. Nhắc hết thử việc/hợp đồng là đề xuất, ngưỡng ngày chưa chốt. Worker retry phải tránh gửi trùng.

## 5. Đội ngũ & phân quyền
Form bốn nhóm:
1. Họ tên, username, password khởi tạo và email tùy chọn.
2. Chọn nhiều chuyên môn bằng checkbox.
3. Cấp truy cập Nhân viên / Quản lý / Sếp / Admin, phạm vi hợp lệ.
4. Bộ phận, quản lý và người duyệt; có “Người duyệt giống quản lý”.

Lưu user và nhiều grants atomically. Username3–64 ký tựASCII chữ/số/_.-; password website ít nhất11 codepoints, Argon2, không hardcode, không ghi log.

Reviewer picker chỉ có người đang hoạt động, là manager/Boss/Admin đủ scope, khác chính nhân viên. Server kiểm lại khi lưu hồ sơ và khi giao/review.

Admin chỉALL; JOB chỉSELF; các quyền quản lý theo scope thật. Không cho chọn Admin+SELF rồi báo cấp thành công. HR_SENSITIVE là quyền bổ sung. Hiệu lực ngay/không hạn mặc định, customdates thu gọn. Thêm role không làm mất role cũ; thu hồi một role không ảnh hưởng role còn lại.

Không ghi generic usageaudit, nhưng grants vẫn giữ thông tin nghiệp vụ cấp/thu hồi và hiệu lực cần cho quyền truy cập. Không xóa grants để sửa quyền.

## 6. Thiết lập
Các card tiếng Việt: Nền tảng; Lưu mật khẩu; Lịch làm việc; Nhân sự & thông báo. Không bắt gõJSON, enum, UUID hoặc khóa mã hóa.

Nền tảng có thêm/đổi tên. Enable/disable/reorder là đề xuất cần tích hợp, chưa có trong prototype. Disable giữ tài khoản cũ và lịch sử, không cho chọn khi tạo mới.

Lưu mật khẩu hiển thị trạng thái cấu hình an toàn; không show key. Thiếu key: hướng dẫn người vận hành thiết lập. Mất/sai key khi đã có dữ liệu: cần phục hồi key cũ, không tự tạo mới.

Lịch: T2–T7,09–12 và13–18, phản hồi8 giờ làm việc; sinh nhật5 ngày làm việc. Các cờ chính sách chưa chốt không tự bật.

## 7. Task và báo cáo được giữ
Reference task: tên tự do, hạn, owner, mô tả/file tùy chọn, chọn mẫu khi cần; drawer3tab; cập nhật Đang làm/Đã xong, nộp xong làSUBMITTED chờ duyệt; hủy có lý do; trao đổi chỉ tin người dùng, history riêng.

Report tự tổng hợp+nhân viên bổ sung+nộp revision→manager/Boss xem/xuất. Lọc người/role/tuần, tổng quan trên và task cụ thể dưới; không xem nháp của người khác. Không đổi cohort/timing hoặc doanh thu attribution khi chưa có chính sách.

Giữ các sửa startup0.0.0.0:3002, username và bootstrapmin11 hiện có; không viết lại nếu kiểm thử đã đạt.
