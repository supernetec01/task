# 10 — Thông tin còn thiếu; Codex không được tự quyết định
Các mục dưới đây không có nghĩa toàn bộ dự án phải dừng. Triển khai phần độc lập đã rõ; để cấu hình hoặc tắt đúng tính năng phụ thuộc.

| ID | Cần chủ hệ thống cung cấp / chốt | Phần bị ảnh hưởng | Cách xử lý khi chưa chốt |
|---|---|---|---|
| Q01 | Danh sách ngày lễ/nghỉ bổ sung; calendar theo cá nhân hay chung; thay lịch sau giao có tính lại hạn cũ không? | 8h và sinh nhật | Dùng lịch T2–T7/trưa đã xác nhận, hiển thị không có ngoại lệ; chưa tự thêm luật ngày lễ |
| Q02 | Phản hồi đúng tại mốc response_due_at có chấp nhận không? (P: < hạn; = hạn là timeout) | Race/boundary nhận việc | Lưu chính sách kỹ thuật công khai, xác nhận trước bật auto-timeout production |
| Q03 | Ai có quyền đổi deadline/approve deadline request? Có cho đổi lùi hạn không? | Deadline workflow | Owner đề nghị; người có quyền mới quyết định; không tự gia hạn |
| Q04 | Reviewer của từng người/task tự tạo; ai thay khi reviewer nghỉ? | Giao/nộp/review | Thiếu reviewer giữ nháp/báo cấu hình, không tự duyệt |
| Q05 | Tuần có chính thức T2–CN không; task “phát sinh” có dùng created_at như demo không? | Report cohort | P: theo created_at và tuần T2–CN; ghi rõ trong cấu hình, cần xác nhận trước chốt báo cáo thật |
| Q06 | So sánh tuần/tháng đang chạy muốn cùng số ngày hay cả kỳ? | Charts/comparison | Cho lựa chọn, nhãn date ranges; không tự so không tương đương |
| Q07 | Task chuyển owner/giao lại tính cho người nào; hỗ trợ tính theo tuần tạo hay tuần nhận? | Report cá nhân/hỗ trợ | Giữ owner history và cả hai ngày; chưa tự chốt attribution lịch sử |
| Q08 | Draft/hủy/từ chối có nằm tổng phát sinh không; task cũ muốn hiển thị chuyển tiếp mức nào? | Đối chiếu count | Hiện riêng, không âm thầm loại hoặc gọi là hoàn thành |
| Q09 | Quản lý/sếp nào là người nhận report; có cần phản hồi/duyệt/chốt hoặc deadline nộp báo cáo không? | Delivery/submission | Không hardcode người demo; chỉ nhân viên tự nhấn nộp theo yêu cầu hiện tại |
| Q10 | Hỗ trợ có timeout 8h như nhận task chính không? Mời hỗ trợ trong nhóm hay toàn công ty? | Invitation rules | Chưa auto-timeout supports; directory chỉ dữ liệu tối thiểu theo scope được cấu hình |
| Q11 | Từ chối hỗ trợ có bắt buộc lý do không; có được rút lui sau khi nhận không? | Response workflow | Giống demo: ghi chú tùy chọn, chưa có rút lui |
| Q12 | Ai được thêm/bỏ/mời lại supporter sau tạo? Có được mời task đã DONE không? | Điều phối nhóm | Create ban đầu đã có; thao tác sau đó giữ feature off tới khi chốt |
| Q13 | Hỗ trợ có phần việc/deadline riêng hay dùng deadline chung; phải xong hết mới nộp task chính không? | Checkpoint/blocking | Demo dùng hạn chung; không chặn chỉ vì người hỗ trợ chưa báo xong |
| Q14 | Ai được mở lại task DONE; báo cáo đã nộp có cần correction riêng không? | Reopen/revisions | Không sửa DONE trực tiếp; bản báo cáo cũ immutable |
| Q15 | Bồi hoàn nhập là yêu cầu/được duyệt/đã nhận; tính theo entered_at hay ngày phát sinh nghiệp vụ? | Claims/cash semantics | entered_at theo yêu cầu, giữ amount_stage UNSPECIFIED khi chưa rõ; không gọi đã nhận |
| Q16 | File TikTok/Shopee đầy đủ: header+rows+shop/account/currency/timezone, định nghĩa GMV/revenue/CR, kỳ nguồn? | Import mapping | Screenshot chỉ map cột nhìn được; cột bị cắt/ads không đoán |
| Q17 | Vận hành hay ADS nhập nguồn ads gốc; ưu tiên manual vs import; cách thay batch chồng kỳ? | Source ownership/dedupe | Chỉ một canonical record/revision; xung đột phải resolve, không sum |
| Q18 | Auth provider/login web, đổi/reset password, MFA; ai duyệt account grants? TTL/grant và key management? | Auth/vault | Không dùng password demo; web password không có readable history |
| Q19 | Sinh nhật 29/02/ngày nghỉ; HR nhận theo nhóm hay tất cả; bắt đầu thử việc nhập bù thì báo lúc nào? | HR jobs | Rule chưa đủ có cảnh báo; dedupe event tránh lặp |
| Q20 | Quản lý đổi nhóm còn được xem report lịch sử cũ không? Boss theo công ty/team nào? | Historical ACL | Current scope kiểm lại; giữ data, không cho truy cập mặc định vượt scope |
| Q21 | Xung đột lịch quay/thiết bị cần chặn hay cảnh báo; ai override? | Scheduling | Cảnh báo đề xuất; không tự hủy lịch |
| Q22 | Một hay nhiều pháp nhân trong ứng dụng; danh sách shop/company và người có quyền? | Company scope | Schema sẵn company_id; không gộp pháp nhân theo logo/tên nhân viên |
| Q23 | Hạn mức/approver/các bước mua, tạm ứng, hoàn chi, chứng từ, yêu cầu xuất hóa đơn; tự duyệt có cấm không? | Procurement/finance | Thiếu policy không auto-approve, không phát hành invoice/chi tiền |
| Q24 | Loại/kích thước file, NAS hay object storage, thời gian giữ video/CV/export/audit/secrets; ai xóa? | Storage/retention | Không tự purge; cấu hình trước vận hành thật |
| Q25 | Hosting, backup RPO/RTO, môi trường, số user/data volume; ai vận hành? | Architecture sizing/ops | Không hứa SLA; triển khai cấu hình phù hợp môi trường sau khảo sát |
| Q26 | KPI/định mức và thái độ: có cần chấm điểm không, tiêu chí/trọng số/appeal? | Performance | Hiện số task và nhận xét có bằng chứng; không tự cho điểm/xếp hạng |
| Q27 | Kế toán/kho/TTS/Tester cần các task nào bắt buộc, tần suất cụ thể? | Recurring role rules | Thư viện mẫu để chọn; không bật hàng loạt |
| Q28 | Có cần thông báo email/Zalo ngoài in-app, người nhận và thời gian yên lặng? | External notifications | Chỉ in-app; không gửi ra ngoài tự động |
| Q29 | Logo chính thức/giao diện Super Net hay Jielien, có giao diện song ngữ Việt/Hoa không? | Brand/localization | Giữ demo Super Net và tiếng Việt; không tự đổi brand |
| Q30 | Quy định người được mời xem file nhạy cảm, phần trao đổi riêng manager/owner? | Task shared ACL | Chia sẻ explicit, pending chỉ brief/files được đánh dấu; không toàn quyền file |

## Bộ file nguồn nên cung cấp tiếp
1. Kết quả kinh doanh TikTok đủ cột và số liệu (ảnh hiện có để đối chiếu), chi phí quảng cáo TikTok đủ sheet/header/rows.
2. Các file tương ứng Shopee; tối thiểu hai kỳ liên tiếp, giữ đơn vị/currency/timezone/shop ID (có thể giả hóa ID).
3. KOC/video/live file mẫu gồm nhiều video một KOC, mã/link và attribution nếu có.
4. Khiếu nại/bồi hoàn một đơn nhiều SKU để kiểm không nhân tiền; file xuất kho BigSeller có đơn vị.
5. Mẫu report tuần mong muốn của Content, vận hành, ADS, HR/kế toán/kho; role nào chưa có thì chỉ đề xuất, không gọi đã chốt.
6. Danh sách role/người quản lý/Boss/reviewer và phạm vi; approval matrix mua/chi; không cần gửi mật khẩu thật hoặc CCCD thật để phát triển.
