# 02 — Vai trò, phạm vi và quyền
## 1. Mô hình
User là tài khoản đăng nhập; membership là tư cách thành viên tổ chức; job_role là chuyên môn; access_role là tập quyền. Một người có nhiều role đồng thời, mỗi grant có valid_from, valid_to (nullable nếu được phép không hạn), revoked_at, granted_by, reason và scope.

Quyền hiệu lực = tài khoản đang hoạt động + membership hoạt động + ít nhất một grant cho đúng hành động/đối tượng/phạm vi còn hiệu lực + mọi ràng buộc nghiệp vụ đều đạt. Không lấy chữ “Admin” từ dữ liệu client để tin. Server trả `capabilities` để frontend dựng menu/nút.

Thời hạn theo khoảng nửa mở `[valid_from, valid_to)`: đúng thời điểm valid_to là hết quyền. Đây là quy ước kỹ thuật P; UI hiển thị rõ “Hết hiệu lực lúc…”. Không biến ngày hết hạn thành 00:00 vô ý; nếu admin chọn hết ngày thì server chuyển sang 00:00 ngày kế tiếp ở múi giờ VN.

## 2. Ma trận chức năng tối thiểu
Ký hiệu: Tự = chỉ mình; Nhóm = danh sách được quản lý; Được cấp = grant cụ thể; Toàn = trong workspace được cấp. Đây là thiết kế quyền nền để thực hiện R; các quyền tài chính nhạy cảm còn Q.

| Chức năng | Nhân viên / TTS | Quản lý | Boss | Admin |
|---|---|---|---|---|
| Tổng quan | Tự và task chung | Nhóm | Toàn theo scope | Toàn |
| Việc của tôi | Tự + lời mời/hỗ trợ có role hiệu lực | Tự + hỗ trợ | Tự + hỗ trợ | Tự + hỗ trợ |
| Giao task cho người khác | Không; được mời hỗ trợ | Nhóm | Trong scope | Toàn |
| Tạo phát sinh | Tự | Tự/nhóm | Trong scope | Toàn |
| Công việc nhóm | Không hiện trang quản trị nhóm | Nhóm | Trong scope | Toàn |
| Sửa tiến độ task chính | Owner | Không giả làm owner | Không giả làm owner | Override có audit nếu được bật |
| Nhận/từ chối hỗ trợ | Chính người được mời | Như nhân viên | Như nhân viên | Không nhận thay người khác |
| Cập nhật contribution | Chính người đã nhận | Xem nhóm | Xem scope | Xem; sửa quản trị có audit |
| Duyệt task | Không tự duyệt | Reviewer trong nhóm | Reviewer được cấp | Quyền cao nhất; quyết định gắn actor |
| Nháp báo cáo bổ sung | Chính nhân viên | Không xem nháp của cấp dưới | Không xem nháp của nhân viên | Truy cập hỗ trợ đặc biệt cần policy; không hiện mặc định |
| Bản báo cáo đã nộp | Của mình, lọc role còn hiệu lực | Nhóm/người nhận | Nhân viên trong scope/người nhận | Toàn theo quyền |
| Xuất Excel | Dữ liệu của mình trong quyền | Báo cáo đã nộp thuộc nhóm | Báo cáo đã nộp thuộc scope | Theo quyền |
| Hồ sơ HR | Chỉ thông tin cá nhân được phép | Không mặc định lương/CCCD | Quyền HR/nhạy cảm được cấp | Toàn có audit |
| Cấp role | Không | Chỉ quyền được ủy quyền, không vượt scope | Không tự mặc định từ Boss | Tạo/thu hồi/cấu hình |
| Tài khoản nền tảng | Tài khoản và role được cấp | Không tự được xem toàn bộ | Không tự được xem mọi mật khẩu | Toàn trong scope quản trị |
| Lịch sử mật khẩu nền tảng | Không | Không | Không | Có, thao tác reveal có audit |
| Phê duyệt mua/chi | Không tự duyệt | Theo policy | Theo policy | Không tự có policy duyệt chi nếu chưa cấu hình |
| Thiết lập hệ thống | Không | Chỉ phần được ủy quyền | Không mặc định quản trị | Có |

Admin có quyền quản trị cao nhất R; hạn chế tự duyệt chi và tiếp cận nháp HR là thiết kế kiểm soát P cần thống nhất Q, không được âm thầm biến thành ngoại lệ cho người khác. Override phải rõ người/lý do và không xóa audit.

## 3. Menu chuyên môn theo role
| Role / quyền | Menu/tab con có thể hiện |
|---|---|
| Content | Nội dung & sản xuất, lịch quay/lịch đăng, tài nguyên được cấp |
| Designer | Task thiết kế/brief và tài nguyên liên quan; không tự có dashboard GMV |
| Vận hành sàn | Doanh thu, KOC/video, hoàn/hủy, khiếu nại/bồi hoàn, import kinh doanh |
| ADS | Quảng cáo, hiệu quả video/campaign được cấp, import quảng cáo |
| Vận hành + ADS | Hợp các tab trên; cùng file không được ghi hai lần |
| HR | Ứng viên, phỏng vấn, nhân viên, sự kiện thử việc/sinh nhật |
| Kế toán | Chứng từ, yêu cầu hóa đơn, mua hàng/thanh toán được giao; không tự có toàn bộ hồ sơ HR |
| Kho | Yêu cầu xuất/trả mẫu, thiết bị, báo cáo xuất kho theo BigSeller |
| TTS chuyên môn | Chỉ mẫu/đầu việc được cấp và mentor; không kế thừa mọi quyền của chuyên viên |
| Booking KOC độc lập | Chỉ tạo role riêng nếu admin bật; hiện tại KOC thuộc vận hành theo tài liệu gốc |
| Tester (đề xuất từ trao đổi trước) | Issue, tái hiện lỗi, môi trường, bằng chứng, mức độ, kết quả kiểm lại; module tùy chọn |

Mua hàng/Đề nghị của tôi là quyền dùng chung theo scope, không phải mọi Content nhìn thấy quản trị mua hàng. Nhóm menu không còn mục con thì ẩn cả nhóm. Empty state chỉ dùng khi có quyền nhưng chưa có dữ liệu; không dùng trang Admin rỗng cho người không có quyền.

## 4. Task chung là ngoại lệ hẹp
- Owner/reviewer/manager có quyền đọc trong scope; supporter chỉ được task đã mời cho role còn hạn.
- PENDING: chỉ brief công việc, chủ việc, hạn, tài liệu đánh dấu được chia sẻ cho người được mời; không lộ toàn bộ file nhạy cảm trước chấp nhận.
- ACCEPTED: phần yêu cầu, tài liệu làm việc được chia sẻ, trao đổi chung và contribution; không lộ lương, đánh giá cá nhân, phí KOC/chứng từ tài chính chỉ vì task có link.
- DECLINED: bỏ khỏi danh sách task đang tham gia; giữ phản hồi ở owner/manager. Lịch sử tối thiểu lời mời của chính người đó có thể xem nếu role còn hạn (P).
- REVOKED/role expired/account disabled: không mở task bằng link cũ, tải file, xem export hay push payload cũ. Các bản đã tải xuống không thể thu hồi từ máy người dùng; web chỉ chặn truy cập tiếp theo.
- Không gửi notification chứa brief/secret nhạy cảm tới role vừa bị thu hồi; notification chỉ chứa mã/thông báo chung khi quyền thay đổi.

## 5. Hết role và dữ liệu đa role
Nếu A có Content + HR, hết HR: ẩn HR, chặn API/CCCD/ứng viên/file HR kể cả tự tạo; Content vẫn dùng bình thường. Một task HR có A tham gia không tự tái cấp HR sau khi hết hạn.

Báo cáo đã nộp cho quản lý vẫn giữ bản gốc trong quyền quản lý. Nhân viên xem lịch sử của mình chỉ nhận những khối role còn hiệu lực. Nếu narrative chung chứa nhiều role và không tách được an toàn: ẩn cả narrative đó với nhân viên khi một role trong scope narrative đã hết (giống logic demo); quản lý còn scope có thể xem. Production nên lưu narrative theo role + một phần chung có scope rõ, không trả full snapshot rồi che bằng CSS.

Thu hồi grant phải tăng permission_version, vô hiệu cache; request mới kiểm tra DB/time. WebSocket/polling không được mở đường đọc bypass. Session/identity còn hiệu lực không đồng nghĩa role còn hiệu lực.

## 6. Phân quyền dữ liệu nhạy cảm
Tách quyền HR cơ bản, HR compensation, identity document; tài chính read/verify/approve; credential current reveal/update và history reveal. File ACL kế thừa hồ sơ gốc + chia sẻ task tường minh. Upload lưu private object key, download qua API được kiểm tra và URL ký có TTL ngắn (đề xuất), không dùng public bucket.

Mật khẩu đăng nhập website: chỉ password hash/provider identity, không lưu AAA→BBB có thể đọc lại. Lịch sử yêu cầu giá trị trước/sau chỉ áp dụng **mật khẩu nền tảng dùng chung**, mã hóa từng version; cập nhật web không có nghĩa đã đổi ở nền tảng. Cần Q18 xác nhận cách đổi mật khẩu đăng nhập web, MFA và auth provider.
