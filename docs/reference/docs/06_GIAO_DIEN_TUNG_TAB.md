# 06 — Thiết kế giao diện và tương tác từng tab
## 1. Phong cách và bố cục
Giữ phong cách demo Super Net: xanh đậm, nền trắng/ngà, thẻ nhẹ, bo góc vừa, icon nét đơn, nhiều khoảng thở, chữ tiếng Việt rõ. Đây là hướng thiết kế đã được người dùng yêu cầu giữ. Logo chính thức và việc dùng logo Jielien thay Super Net chưa được chốt; không tự đổi công ty/brand theo ảnh logo được gửi.

| Token đề xuất | Giá trị |
|---|---|
| Primary | #176448, hover #12543C |
| Text đậm | #183C30 / body #293E34 |
| Background | #F5F6F1; surface #FFFFFF |
| Border | #E5E9E2 |
| Success / warning / danger | xanh / #B27A22 / #BE6355, luôn có nhãn chữ |
| Font | Be Vietnam Pro, fallback system-ui/Arial; self-host nếu production cần |
| Body | 14–15px production, label 12–13px, không bắt chước chữ quá nhỏ của demo |
| Heading | 24–30px page, 18–20px panel |
| Spacing / radius | thang 4/8/12/16/24/32px; cards 12px; controls 8px |
| Sidebar | 232–248px desktop; drawer mobile |
| Nội dung | padding 24–32px desktop, 16px mobile; max width rộng đủ dashboard |
| Form | 1 cột cho create nhanh, 2 cột cho advanced khi màn hình đủ rộng |
| Modal | create 620px, detail 840–960px; header/footer giữ thấy, body scroll |

Đề xuất khả dụng: mục tiêu thao tác phổ biến dưới 3 click; không biến đây thành KPI thời gian bắt buộc. Các màn hình có loading skeleton, empty state có CTA, error có Retry, quyền thiếu không hiện menu/nút. Mobile click target >=44px; focus rõ; label input có for/id; trạng thái không chỉ màu; bàn phím dùng được. Enter textarea xuống dòng, Escape/đóng không làm mất nháp chưa lưu.

## 2. Cấu trúc chung
Sidebar nhóm: Công việc; Chuyên môn; Đề nghị & phê duyệt; Tài khoản & quản trị. Chỉ render mục được cấp. Topbar breadcrumb, notification, avatar; chọn role preview chỉ có trong DEMO, tuyệt đối không xuất hiện như cách đổi quyền ở production. Nhân viên đa role thấy hợp chức năng được cấp; có filter role trong task/report, không cần đăng nhập lại.

## 3. Chi tiết từng tab
### 3.1 Tổng quan
- Nhân viên: lời chào, việc cần phản hồi, cần sửa, đến hạn, blocker, pending hỗ trợ; cards task chính và support tách nhãn.
- Quản lý/Boss: bộ lọc kỳ/team/người/role/người giao, cards tiến độ, chart trạng thái theo người, bảng việc cần can thiệp và chờ duyệt.
- Mỗi card/chart click mở danh sách có cùng scope/filter. Gắn dữ liệu cập nhật lúc/cutoff; số mẫu có nhãn DEMO.
- Không hiện bảng tất cả nhân viên cho role Content thường. Không show HR/salary/secret ở cards chung.

### 3.2 Việc của tôi
Thứ tự: banner Lời mời hỗ trợ chờ phản hồi → quick chips Tất cả/Phụ trách chính/Hỗ trợ/Chờ nhận/Cần sửa/Quá hạn → tìm/lọc người giao/role/tuần → list hoặc board. Người dùng không phải lọc lại mọi lần: lưu preference theo user, không ghi quyền vào localStorage.

Bảng: mã+tên, vai trò của tôi (chính/hỗ trợ), owner, bước tiếp theo, deadline, trạng thái chung, trạng thái hỗ trợ riêng nếu có. Hover/click cả row mở detail. Support pending hiển thị CTA phản hồi; đã từ chối không nằm trong việc đang làm. Board nhóm trạng thái chung nhưng nhãn hỗ trợ rõ, tránh gọi task pending support là đã nhận.

Nút “Thêm việc phát sinh” mở create nhanh. Không hiện employee selector tất cả công ty cho nhân viên tự tạo. Có thể xem người trong danh bạ tối thiểu để mời hỗ trợ, không đồng nghĩa đọc hồ sơ/công việc họ.

### 3.3 Công việc nhóm
Chỉ manager/Boss/Admin hoặc quyền tương ứng. List/board của task trong scope; filter owner, giver, role, due, priority, status, blocker, source. Hỗ trợ tổng hợp số pending/accepted/declined và mở roster. Không nhân nhiều dòng cùng task cho mỗi supporter trừ bảng contribution được ghi rõ.

### 3.4 Tạo task
Header “Tạo nhiệm vụ” hoặc “Thêm việc phát sinh”. Hiện tên, người làm (tự điền với nhân viên), deadline, mô tả, tài liệu. Thu gọn “Người hỗ trợ” gồm search tên + check nhiều người + role hỗ trợ nếu cần. Thu gọn “Tùy chọn thêm” gồm loại task/role/campaign/ưu tiên. Không bắt kênh/pillar/angle/series/estimated hours/tiêu chí nghiệm thu/bước tiếp theo lúc tạo.

Footer: Lưu nháp / Giao nhiệm vụ hoặc Lưu công việc; loading chống double-submit. Validation sát field, focus lỗi đầu tiên, giữ nội dung. File list hiện upload progress/retry/remove trước khi nộp.

### 3.5 Detail task
Header cố định: mã/tên, owner, deadline, role/type, status, hành động hợp lệ. Tab: Yêu cầu; Thực hiện; Nộp kết quả; Trao đổi & lịch sử. Roster hỗ trợ là section dễ thấy, mỗi người có trạng thái/giờ phản hồi/ghi chú/contribution; không chôn dưới hàng dài checklist trên mobile.

Yêu cầu: brief, refs, requirement version. Thực hiện: form động/checkpoint/next step/blocker. Nộp kết quả: text/file/link, revision, nút nộp. Lịch sử: giao/nhận/đổi hạn/sửa/review/mời hỗ trợ, có actor/time; không show bí mật.

Support pending dùng dialog ngắn brief/owner/deadline/role + ghi chú + hai nút Chấp nhận/Từ chối. Accepted: common task chỉ đọc, section “Phần hỗ trợ của tôi” có progress/result/attachment/đã báo xong. Các control owner không hiện thay vì nhìn một loạt disabled vô nghĩa; demo disabled chỉ làm tham khảo quyền.

### 3.6 Kế hoạch tuần & lịch
Chọn tuần và role. Panel kế hoạch đã chốt/phát sinh/việc chuyển tiếp; task gắn plan bằng link, không copy. Lịch công việc, lịch quay và lịch đăng có loại/màu/nhãn riêng. Thay ngày trên lịch không đổi deadline nếu chưa có quyền/luồng đổi hạn. “Lấy kế hoạch tuần sau” chỉ lấy item đã lập cho tuần đó, không tự dời mọi task cũ.

### 3.7 Nội dung & sản xuất
Tabs Nội dung / Kịch bản / Lịch quay / Lịch đăng / Hiệu quả / Tài nguyên theo permission. Card theo stage có tên content, owner, task tiếp theo, deadline, thumbnail bản final nếu có. Một content mở drawer timeline nghiên cứu→script→shoot/edit→publication, mỗi bước trỏ task/revision thật.

Lịch quay: thời gian/địa điểm, người quay/diễn, shotlist, props, thiết bị, cảnh báo xung đột. Đã hoàn thiện: file/link bản final, người duyệt; Đã đăng: URL/platform ID, kênh, ngày đăng; không dùng một trường video_url cho cả hai. Hiệu quả: chọn bài/live + kỳ đo + source; các chỉ số phù hợp, N/A khi thiếu.

### 3.8 Kinh doanh & quảng cáo
Các tab con theo role: Doanh thu; Quảng cáo; KOC & video; Hoàn/hủy & bồi hoàn; Nguồn dữ liệu. ADS không có quyền sales không thấy tab sales. Filter platform/shop/account/date/comparison/source; toàn shop khác cá nhân phải ghi nhãn.

Import wizard có 5 bước Upload → Chọn nguồn/sheet → Map & preview → Kiểm tra → Xác nhận. Hiện row lỗi cạnh raw value, tổng đối chiếu, warnings non-additive metrics và duplicate. Không import được thì giữ file/error batch, không hiện dashboard 0 khiến người dùng tưởng không doanh thu.

KOC: contact list, hợp tác, mẫu/vận đơn, lịch đăng, links, số liệu; phí/địa chỉ có permission riêng. Bồi hoàn: form ID đơn/SKU/nhiều dòng, amount chung, người nhập tự điền; số liệu không bị nhân theo SKU.

### 3.9 Kho & mẫu hàng / thiết bị
Hiện nguồn BigSeller/cutoff/sync status. Task kho; yêu cầu mẫu; mượn-trả; báo hỏng; báo cáo xuất. Chưa tích hợp hiển thị “Chưa kết nối”, không ghi đồng bộ thành công. Không show nút sửa trực tiếp tồn chuẩn. Lịch thiết bị theo đơn vị tài sản; người giữ/tình trạng/hạn trả và evidence.

### 3.10 Nhân sự & tuyển dụng
Tabs ứng viên/PV/nhân viên/sự kiện theo quyền. Kanban ứng tuyển tùy chọn; bảng có tên, vị trí, người tuyển, stage, next action. Detail ứng viên phân CV/portfolio/PV/history; employee có employment terms timeline, hợp đồng, ngày sinh; lương/CCCD nằm vùng quyền riêng và không hiện trong danh sách chung.

Notification HR: bắt đầu thử việc—người tuyển—đã thông báo/đã đọc; sinh nhật—ngày sinh—ngày nhắc—người nhận. Không có nút “Tự tính thưởng” khi chưa cấu hình tiền.

### 3.11 Đề nghị của tôi
Dành cho mọi role có quyền: card Mua/thuê / Mượn / Xuất mẫu / Tạm ứng / Hoàn chi / Hóa đơn. Tạo form theo loại, tự gắn task khi đi từ task. Bảng cho thấy đang chờ ai, bước hiện tại, ngày cần, số tiền trong scope; nhấn mở tiến trình duyệt. Không bắt Content điền định khoản/thuế suất/bank data nếu không cần lúc đề nghị.

### 3.12 Mua hàng & chứng từ
Chỉ người xử lý có quyền. Tab đề nghị/báo giá/mua/nhận-nghiệm thu/chứng từ/yêu cầu thanh toán. Phân biệt dự toán/đã duyệt/đã nhận/đã trả bằng nhãn, không chỉ một tick hoàn thành. Chi tiết hóa đơn có pháp nhân, NCC/khách, số/series/ngày/currency/file/check status; yêu cầu hóa đơn bán ra ghi external status, không giả nút phát hành thật.

### 3.13 Chờ phê duyệt
Hàng chờ tổng hợp theo task/request/role request/credential access nếu policy bật. Mỗi row: người đề nghị, loại, ngày cần, chờ bao lâu, approver, đúng revision. Detail: nội dung xin duyệt, before/after nếu sửa, evidence; Duyệt / Yêu cầu bổ sung / Từ chối theo loại. Không duyệt revision đã bị thay. Không lộ mọi chứng từ cho manager chỉ có quyền duyệt task.

### 3.14 Báo cáo — Nhân viên
Trên: chọn tuần/role → nhãn live/chưa nộp/đã nộp vN → KPI và role panels/charts. Giữa: bảng task chính với tabs Đã xong/Chưa xong/Từ chối/Hủy, phần hỗ trợ riêng, chuyển tiếp riêng. Dưới: bốn mục narrative bổ sung + Lưu nháp / Nộp báo cáo tuần, người nhận rõ. Có cập nhật nháp gần nhất và trạng thái lưu. Không ép nhập lại KPI.

### 3.15 Báo cáo — Quản lý/Boss
Mở tab thấy chọn tuần + danh sách nhân viên scope: Đã nộp/Chưa nộp, phiên bản, lúc nộp, Xem/Xuất. Chọn một người mở báo cáo: báo cáo tổng hợp/role/narrative ở trên, task và contributions ở dưới. Filter role/version/status/search; nút Xuất Excel của đúng report revision. Chưa nộp: chờ nhân viên nộp, không mở draft. Bản cũ có nhãn cutoff/version rõ; khi có bản mới, cho chọn phiên bản, không ghi đè.

### 3.16 Tài khoản nền tảng
Danh sách chỉ account được cấp; platform/company/login/valid_until. Secret mặc định ẩn, reveal/copy có quyền và audit; không ghi secret trong URL/notification. Update form nhắc “Bạn đã đổi trên nền tảng; thao tác này chỉ cập nhật bản lưu”. Admin có lịch sử phiên bản và actor/time, reveal từng version được ghi log. Nhân viên/Boss không có quyền history thì ẩn cả tab history và API không trả payload đó.

### 3.17 Đội ngũ & phân quyền
Admin: user, status, job role/access role, scope, từ/đến, người cấp, permission effective. Tạo cấp quyền có preview người đó sẽ thấy menu gì; hết hạn rõ ngày giờ. Quản lý chỉ thấy control đã được ủy quyền. Không hardcode boolean is_content/is_hr mỗi người.

### 3.18 Thiết lập
Admin: calendar/timezone/holidays, templates/schema versions, recurring rules, approval policies, metric/import profiles, source ownership, retention/backup, notification channel. Policy chưa chốt hiển thị Chưa cấu hình và chặn đúng hành động phụ thuộc. Không ép người dùng thấy bảng cấu hình kỹ thuật trong flow làm việc thường ngày.

## 4. Màn hình lỗi và trạng thái toàn app
401: cần đăng nhập; 403: không có quyền (danh sách không render row bị cấm); 404 cho ID không được tiết lộ theo policy; 409: dữ liệu vừa thay đổi, giữ nháp và tải bản mới; 422: lỗi field; 429: thử lại; 5xx/offline: giữ draft, không hiện thành công. Nút submit loading và khóa double-click nhưng server vẫn cần idempotency.

## 5. Bảo toàn thiết kế
Tái sử dụng components: AppShell, PermissionGate, TaskQuickCreate, DynamicTaskForm, TaskDetail, SupportInvitation, SupportRoster, ApprovalInbox, RoleReportSection, ReportSubmission, ImportWizard, SourceBadge, FileUploader, EmptyState. Tách API/data hooks khỏi layout. CSS token dùng nhất quán; chart có nhãn/tooltip/đơn vị, bảng export không phụ thuộc UI đang cuộn tới đâu.
