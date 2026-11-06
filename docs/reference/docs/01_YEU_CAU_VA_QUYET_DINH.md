# 01 — Phạm vi và các quyết định có hiệu lực
## 1. Nhãn bắt buộc
- **R / Đã xác nhận:** người dùng nêu rõ. Phải triển khai; không đổi theo suy đoán của Codex.
- **P / Đề xuất thiết kế:** phương án để thực hiện yêu cầu, không phải phát biểu của người dùng. Được dùng làm thiết kế kỹ thuật; chính sách nghiệp vụ chưa chốt phải cấu hình hoặc hỏi.
- **Q / Cần bổ sung:** thiếu thông tin có ảnh hưởng. Không tự đặt giá trị, không chặn phần độc lập đã đủ dữ liệu.
- **DEMO:** minh họa UX, không phải dữ liệu hoặc quyền thật.

## 2. Sổ yêu cầu hợp nhất
| ID | Yêu cầu đã xác nhận | Hành vi bắt buộc |
|---|---|---|
| R01 | Web nội bộ quản lý công việc và kết quả nhân viên | Một người có nhiều task, xem tiến độ và drilldown từng task |
| R02 | Nhiều role cho một tài khoản | Admin cấp vai trò, phạm vi và thời hạn; không nhân bản user |
| R03 | Role hết hạn tắt hoàn toàn quyền vị trí đó | Nhân viên không đọc dữ liệu của role cũ; lịch sử còn cho quản lý có quyền |
| R04 | Nhân viên không xem dữ liệu của nhau | Ngoại lệ giới hạn task chung được mời theo R35–R39; không mở hồ sơ/role khác |
| R05 | Chỉ hiện chức năng có quyền xem | Menu, tab con, nút, API, URL trực tiếp, file và export đều theo quyền |
| R06 | Người quản lý giao việc nhanh | Tên nhiệm vụ, người làm, deadline; mô tả và tài liệu hỗ trợ; trường nâng cao thu gọn |
| R07 | Nhân viên thêm việc phát sinh ngoài việc chính | Tự điền người tạo/chủ việc/nguồn/ngày giờ; nhân viên nhập nhiệm vụ và hạn |
| R08 | Mỗi loại task có dữ liệu riêng | Nghiên cứu không bắt trường quay; dựng/video hoàn thiện có file/link; đo hiệu quả có số liệu nguồn |
| R09 | Không bắt quản lý nhập hết ngay khi tạo | Trường chuyên môn bổ sung ở thực hiện/nộp/đo; validation theo hành động |
| R10 | Người được giao phản hồi nhận hoặc từ chối | Lưu phản hồi và thông báo lại người giao |
| R11 | Hạn phản hồi 8 giờ làm việc từ khi giao | Thay hoàn toàn quy tắc 12h cũ; không đếm từ lúc mở thông báo |
| R12 | Làm T2–T7, 09–12 và 13–18 | Bỏ trưa, ngoài giờ và Chủ nhật. Ngày lễ/ngoại lệ cần Q01 |
| R13 | Hết hạn không phản hồi mặc định từ chối | Lưu TIMEOUT, báo người giao, không tự giao người khác |
| R14 | Nhân viên cập nhật tiến độ, khó khăn và hỗ trợ cần thiết | Có bước tiếp theo, người cần hỗ trợ, lịch sử |
| R15 | Nộp trước/đúng deadline được đánh giá theo giờ nộp | Tách submitted_at và approved_at; phút/giờ theo server |
| R16 | Quản lý duyệt hoặc yêu cầu chỉnh sửa | Duyệt đúng revision; giữ các lần nộp/sửa/đổi deadline |
| R17 | Deadline mới dùng để đánh giá cuối | Khi hoàn thành và hết sửa, dùng lần nộp được duyệt và hạn cuối áp dụng; giữ hạn gốc |
| R18 | Báo cáo tuần tự tổng hợp | Không bắt nhân viên viết lại task hoặc cộng số bằng tay |
| R19 | Đếm task phát sinh trong tuần | Hiện tổng, đã làm, hoàn thành, đúng hạn, trễ hạn, chưa xong; hủy/từ chối riêng |
| R20 | Báo cáo riêng theo nhân viên và role | Một người đa role có các khối báo cáo chuyên môn; task hỗ trợ tách riêng |
| R21 | Báo cáo ở trên, việc cụ thể ở dưới | Có Đã xong/Chưa xong; bấm truy vết nguồn/task |
| R22 | Nhân viên bổ sung nội dung rồi nhấn nộp | Draft riêng tư; nộp cho quản lý và sếp xem |
| R23 | Sếp chọn báo cáo tuần của từng nhân viên | Chọn tuần/người/role/phiên bản; danh sách Đã nộp/Chưa nộp |
| R24 | Xuất file Excel | Theo quyền và bộ lọc, có tổng hợp/narrative/chi tiết |
| R25 | So sánh tuần/tháng trước | Ghi rõ khoảng ngày, nguồn và tính đầy đủ; kỳ tương đương xem P06/Q06 |
| R26 | Dữ liệu nhập tay hoặc file xuất nền tảng | TikTok/Shopee có định dạng khác nhau; có mapping/version/preview |
| R27 | GMV và chi phí quảng cáo lấy từ file | Không dùng task count suy ra doanh thu, không tự đo analytics chỉ bằng URL |
| R28 | Bồi hoàn tính từ nhân viên nhập | Ghi người nhập/ngày/ID đơn/SKU/số tiền; nhân viên chịu trách nhiệm dữ liệu |
| R29 | BigSeller là nguồn tồn kho | Web không xây sổ tồn song song làm nguồn cạnh tranh trong phạm vi hiện tại |
| R30 | HR hồ sơ ứng viên → nhân viên và lịch sử | Người tuyển, thử việc/chính thức, ngày hợp đồng/sinh nhật; lương/CCCD có quyền riêng |
| R31 | Bắt đầu thử việc tạo thông báo thưởng tuyển dụng | Chỉ thông báo HR; số thưởng do HR nhập vào bảng lương |
| R32 | Sinh nhật báo HR trước 5 ngày làm việc | Nhân viên đang thử việc/chính thức; không tự áp dụng ứng viên chưa nhận việc |
| R33 | Nhân viên tự đổi mật khẩu nền tảng, web lưu bản cập nhật | Không tự đổi ở TikTok/Shopee; giữ hiện tại và lịch sử người sửa/thời gian/giá trị trước sau, Admin xem lịch sử |
| R34 | Đề xuất mua dụng cụ, mua hàng, hóa đơn, quản lý/sếp phê duyệt | Phân biệt đề nghị mua, duyệt nhu cầu, mua thật, chứng từ và yêu cầu xuất hóa đơn; policy chi tiết cần Q |
| R35 | Một task có nhiều người hỗ trợ | Một task ID, một người phụ trách chính, nhiều invitation/contribution |
| R36 | Một nhân viên tạo task, task xuất hiện cho người hỗ trợ | Không buộc mỗi người tạo lại task; vào Việc của tôi với lời mời |
| R37 | Người hỗ trợ chấp nhận hoặc từ chối | Phản hồi độc lập từng người; từ chối không làm task chung từ chối |
| R38 | Theo dõi trạng thái tham gia của từng thành viên | Chờ phản hồi/đã nhận/từ chối; phản hồi và thời điểm lưu lại |
| R39 | Người hỗ trợ cập nhật phần hỗ trợ riêng (thiết kế đã có ở demo) | Không thay owner, deadline hoặc tự duyệt kết quả chung |
| R40 | Giao diện dễ dùng, đẹp như demo | Nền sáng/xanh đậm, form ngắn, sidebar theo role, list/board, responsive |
| R41 | Đóng gói rõ để Codex không đoán | Database, luồng, quyền, API, UI, test, các Q và giới hạn demo được bàn giao |

**Lưu ý R39:** mã này truy vết tính năng bổ trợ đã làm trong demo (P13), không phải một quyết định nghiệp vụ được người dùng xác nhận riêng. Chỉ yêu cầu chấp nhận/từ chối hỗ trợ là phát biểu trực tiếp mới nhất.

## 3. Đề xuất thực hiện có nhãn
| ID | Đề xuất kỹ thuật / chính sách chưa phải quyết định người dùng |
|---|---|
| P01 | Kiến trúc module trong một app, PostgreSQL quan hệ, kho file, worker/outbox; không microservices sớm |
| P02 | Task có một role chính để tính báo cáo, các role liên quan qua link; hỗ trợ có role riêng |
| P03 | Tự tạo task cho mình thì tự nhận (không chờ tự đồng ý); lưu sự kiện SELF_CREATED |
| P04 | Bản báo cáo đã nộp immutable; chỉnh sau nộp thành revision, người nhận giữ snapshot |
| P05 | Tuần báo cáo T2 00:00 tới T2 kế tiếp 00:00 theo Asia/Ho_Chi_Minh; cần chốt Q05 |
| P06 | So kỳ đang chạy với cùng số ngày đã đủ dữ liệu của kỳ trước; cho chọn cả kỳ nếu gắn nhãn |
| P07 | Phản hồi hỗ trợ chưa mặc định timeout 8h cho tới khi chốt Q10; hạn assignment chính vẫn 8h |
| P08 | Từ chối hỗ trợ bắt buộc chọn phản hồi nhưng ghi chú là tùy chọn như demo; Q11 nếu cần bắt lý do |
| P09 | Reviewer mặc định quản lý trực tiếp; thiếu cấu hình thì lưu nháp/báo thiếu, không tự duyệt |
| P10 | Tách kết quả công việc, hiệu quả kinh doanh, đánh giá thái độ; chưa có thang điểm thì không chấm |
| P11 | Chưa tự đánh giá thái độ bằng số lần online, gõ phím hoặc thời gian đăng nhập |
| P13 | Contribution riêng của từng supporter và báo xong phần hỗ trợ; đã mô phỏng, cần xác nhận điều kiện nghiệm thu nếu muốn bắt buộc |
| P12 | Multi-company có company_id cho tài chính/shop/tài khoản; không gộp pháp nhân, cần Q22 xác nhận phạm vi |

## 4. Những nội dung cũ đã bị thay thế
- 12h → 8 giờ làm việc. Ví dụ thứ Bảy 17h → thứ Hai 12h không còn đúng; với lịch đã chốt là thứ Hai 17h.
- Sau hết role vẫn cho nhân viên xem → không còn được xem role đó; quản lý có quyền giữ lịch sử.
- Thưởng khi lên chính thức → chỉ thông báo HR từ lúc bắt đầu thử việc; tiền do HR quyết định trong bảng lương.
- Nộp/duyệt cùng mốc → tách giờ nộp và giờ duyệt.
- Báo cáo chỉ là bảng live → thêm draft bổ sung, nộp, snapshot và người nhận.
- Nhân viên A tuyệt đối không có task B → ngoại lệ task được mời hỗ trợ, chỉ scope task chung.
- “Hai file TikTok không có dữ liệu” không được dùng như kết luận về hệ thống xuất TikTok: người dùng đã cung cấp screenshot bảng kinh doanh có số liệu; mapping chi tiết dựa screenshot/bytes file cần phân biệt.

## 5. Giới hạn phạm vi
Không tự làm ERP/sổ kế toán đầy đủ, sổ tồn thay BigSeller, phát hành hóa đơn điện tử thật, thanh toán ngân hàng, gửi email bên ngoài, đồng bộ mật khẩu nền tảng hoặc chấm điểm nhân viên khi chưa có chính sách/tích hợp được chốt. Các extension vẫn được thiết kế điểm nối; không giả vờ đã kết nối.
