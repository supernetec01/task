# Đặc tả từng màn hình

Các mục dưới kế thừa bố cục prototype đã duyệt. **02–04 và hợp đồng nghiệp vụ chi tiết thắng mọi ghi chú “đề xuất” cũ trong prototype.**

## Quy tắc giao diện chung

- Sidebar theo capability của API; không gửi toàn bộ dữ liệu về rồi lọc client. Không render bộ chọn ROLE hoặc panel hướng dẫn dev của prototype vào UI nhân viên thật.
- Mỗi form có loading, disable double-submit, lỗi tổng hợp và lỗi tại trường, focus trường sai, giữ nháp khi mạng lỗi/409. Đóng/Escape có hỏi bỏ thay đổi chưa lưu. Modal không chồng vô hạn.
- Danh sách phân biệt Empty, lỗi API, đang tải và chưa cấu hình; có Thử lại. Không biến lỗi 503 thành 0/Empty.
- Search debounce 300 ms, đổi filter reset cursor, khoảng date có nhãn VN. Mobile 390 px không overflow trang; bảng cần nhiều cột có scroll nội bộ hoặc thẻ, không thu font quá nhỏ.
- Table/board dùng cùng dữ liệu/bộ lọc. “Xóa bộ lọc” rõ ràng. Export không bao gồm cột nhạy cảm ngoài quyền.
- Nút destructive hủy/mở lại/nghỉ việc nêu đối tượng và lýdo cần thiết; không xóa lịch sử. Thông báo thành công chỉ sau API commit.
- Tự refresh 60 phút và nút thủcông; form đang sửa giữ nguyên, có badge dữ liệu mới để user tự tải lại. Quyền bị thu hồi ẩn secret và đóng nội dung không còn quyền ngay.
- Chuông có unread count, link đúng object, nút đọc; không lộ payload lương/secret.

## S01. Tổng quan

**Điểm sửa trong repo:** `web/main.tsx → Tasks/dashboard; server/tasks.ts → GET /tasks; server/capabilities.ts`

Thu gọn menu theo 5 ROLE. Tổng hợp đầy đủ phạm vi được phép, không chỉ 100 dòng trang đầu. Sếp chỉ xem task toàn công ty, giao việc và đọc báo cáo đã nộp.

**Bộ lọc và thứ tự:** Nhân viên (Admin/Sếp), bộ phận, chuyên môn; mặc định mọi việc đang mở, không giới hạn created_at. Click KPI dẫn sang tasks với cùng query.

| Trường / đối tượng | Kiểu | Bắt buộc ở đâu | Nguồn và cách dùng |
|---|---|---|---|
| user_id / display_roles | uuid / enum[] | Bắt buộc | Từ users + grants; quyền được API tính lại mỗi request |
| task_counts | object | Tự tính | waiting / doing / done / cancelled; loại task ngoài quyền |
| staff_progress | array | Tự tính | user_id, task đang mở, due_at, updated_at, phần việc đã làm |
| report_submission | array | Tự tính | employee_id, week_start, submitted_at, revision; không trả draft của người khác |

**Hành vi và kiểm tra:**

- Sếp không đọc lương, hồ sơ ứng viên, mật khẩu nền tảng chỉ do có ROLE Sếp.
- Task quá hạn = due_at < thời điểm hiện tại và chưa done/cancelled. Bản mẫu chưa chạy đồng hồ thực.

## S02. Công việc

**Điểm sửa trong repo:** `web/tasks.tsx; web/task-drawer.tsx; server/tasks.ts; tasks/task_updates/task_comments/task_events`

Luồng mới CHECKLIST: Chưa thực hiện → Đang thực hiện → Đã hoàn thành; Hủy bắt buộc lý do. Không tự sửa các task lịch sử đang dùng SUBMITTED/review.

**Bộ lọc và thứ tự:** Theo toàn bộ hợp đồng 04. Nhân viên SELF; không thấy owner filter để mở quyền.

| Trường / đối tượng | Kiểu | Bắt buộc ở đâu | Nguồn và cách dùng |
|---|---|---|---|
| id / title | uuid / string(255) | Bắt buộc | ID do server tạo; tiêu đề do người tạo nhập |
| owner_id / created_by | uuid | Bắt buộc | Chọn tài khoản đang hoạt động; người tạo theo session |
| due_at | timestamptz | Bắt buộc | Nhập theo Asia/Ho_Chi_Minh, lưu UTC |
| status / flow_mode | enum | Bắt buộc | CHECKLIST mới; giữ REVIEW_LEGACY cho task cũ |
| description / attachments | text / asset[] | Tùy chọn | File riêng, kiểm quyền task khi tải |
| update.summary / result | text | Bắt buộc khi DONE | Nhân viên ghi đã làm gì; bản cập nhật có actor và thời gian |
| cancel_reason | text | Bắt buộc khi CANCELLED | Không cho bỏ trống / toàn khoảng trắng |
| version / events | integer / append-only | Tự sinh | Chống ghi đè 409; giữ nội dung form khi xung đột |

**Hành vi và kiểm tra:**

- Nhân viên cập nhật task mình; Sếp xem và giao task, không cập nhật thay nhân viên theo mặc định đề xuất. Admin xử lý mọi task.
- Muốn sửa/hủy task DONE phải qua quyền Admin và lý do, cần chốt quy tắc mở lại; không có xóa lịch sử tùy ý.
- Ẩn tiến trình nhận việc trong checklist mới; không chuyển task cũ thành DONE chỉ bằng đổi nhãn.

## S03. Kinh doanh sàn

**Điểm sửa trong repo:** `web/business.tsx → Metrics; server/metrics.ts; metric_batches/metrics; web/reports.tsx`

Tạo báo cáo nguồn bán hàng ngày/tuần cho TikTok và Shopee, chọn nguồn bằng loại tải lên. Bổ sung shop/company bắt buộc, mapping theo header thay vị trí cột.

**Bộ lọc và thứ tự:** Pháp nhân bắt buộc một giá trị; nền tảng; shop (một hoặc nhiều cùng platform/company); khoảng ngày; loại chỉ tiêu. Mặc định tuần trước trọn vẹn nếu có dữ liệu, không có thì Empty chứ không đổi kỳ âm thầm. Ngày tăng dần; tổng tách platform, không gộp attribution.

| Trường / đối tượng | Kiểu | Bắt buộc ở đâu | Nguồn và cách dùng |
|---|---|---|---|
| company_id / shop_id / platform | uuid / uuid / enum | Bắt buộc | Danh mục riêng; shop thuộc đúng company và platform |
| business_date | date | Bắt buộc | Cột Ngày, DD/MM/YYYY; tiêu đề dòng 2 trong 2 mẫu |
| revenue | decimal | Bắt buộc | Cột Doanh thu |
| effective_revenue | decimal | Tùy chọn | Cột Doanh thu đơn hàng hiệu quả; không thay nhãn Doanh thu |
| orders | integer | Bắt buộc | Cột Tổng số đơn hàng, không dùng Tổng số bưu kiện |
| cancelled_orders | integer | Bắt buộc | Cột Số lượng đơn đã hủy |
| refunded_orders | integer | Bắt buộc | Cột SL đơn hoàn tiền; không dùng SL khách hoàn tiền |
| refund_amount / cancellation_amount | decimal | Tùy chọn | Số tiền đơn hàng hoàn tiền / Số tiền đơn hàng hủy |
| cancel_rate / refund_rate | decimal 0..1 | Tự tính | SUM(số đơn tương ứng) / SUM(tổng đơn) trong cùng kỳ; mẫu số 0 → N/A |

**Hành vi và kiểm tra:**

- Hai mẫu có cùng header và không có định danh sàn trong nội dung đã kiểm tra. Chỉ xác thực schema; cần người tải xác nhận đúng shop/platform.
- Doanh thu nguồn và GMV KOC không cộng vào nhau. Không gộp số liệu hai pháp nhân.
- Không lấy trung bình Tỷ lệ hoàn tiền từng ngày; không coi hoàn tiền là đã nhận hàng trả về.
- Nếu số nguồn không đủ chứng minh số đơn trả hàng, hiển thị N/A và cần nguồn riêng.

## S04. Doanh số KOC

**Điểm sửa trong repo:** `web/business.tsx; server/metrics.ts; cần schema/grain KOC aggregate mới hoặc mở rộng registry metrics`

Tạo tab tổng KOC và Top 10 theo GMV. Tách kỳ nguồn, creator identity và hoa hồng ước tính.

**Bộ lọc và thứ tự:** Pháp nhân, nền tảng, shop, kỳ nguồn đã xác nhận; tìm handle; Top 10/Toàn bộ. Top 10 GMV DESC, creator_key ASC. Không có kỳ hợp lệ thì chỉ xem nguồn chưa gắn tuần.

| Trường / đối tượng | Kiểu | Bắt buộc ở đâu | Nguồn và cách dùng |
|---|---|---|---|
| creator_handle / creator_id | string | Bắt buộc | Tên nhà sáng tạo; cần chuẩn hóa định danh, giữ nguyên giá trị gốc |
| period_start / period_end | date | Bắt buộc | File mẫu không có kỳ trong nội dung; người tải nhập và xác nhận kỳ xuất |
| gmv | decimal | Bắt buộc | GMV nhờ nhà sáng tạo (B) |
| orders | integer | Bắt buộc | Đơn hàng đã ghi nhận (F) |
| refund_amount | decimal | Bắt buộc | Hoàn tiền (E), có thể khác cohort/kỳ GMV |
| estimated_commission | decimal | Bắt buộc | Hoa hồng ước tính (V), không gọi là phải trả/đã trả |
| refund_items | integer | Tùy chọn | Số món đã hoàn tiền (H); không đổi thành số đơn |
| share | decimal | Tự tính | GMV từng KOC / GMV mọi KOC cùng kỳ/shop/nguồn sau xử lý trùng |

**Hành vi và kiểm tra:**

- Dòng 1 là header, dòng 2 là mô tả; dữ liệu bắt đầu dòng 3. Không đưa mô tả vào tổng.
- Top 10 sắp GMV giảm dần, đồng hạng dùng creator key ổn định; tỷ trọng mẫu số là toàn bộ KOC, không chỉ Top 10.
- Mẫu có 1.307 dòng KOC; tổng GMV 52.399.786; hoa hồng ước tính 1.678.199; hoàn tiền 2.029.427. Kỳ chưa xác nhận.
- File thiếu số đơn hủy/hoàn riêng và hoa hồng quyết toán. N/A khác 0. Không suy ra bằng số món hoàn tiền.

## S05. Tải dữ liệu lên

**Điểm sửa trong repo:** `web/business.tsx ImportUpload/preview; server/metrics.ts /imports; server/files.ts; metric_batches`

Bộ chọn 5 loại file cố định, xác thực theo nội dung; tên gốc tùy ý. Bản HTML đọc XLSX/CSV cục bộ để xem cấu trúc, không thay thế backend kiểm tra hoặc lưu database.

**Bộ lọc và thứ tự:** Lịch sử: loại nguồn, platform, shop/channel, pháp nhân, kỳ nguồn, người tải, trạng thái, thời gian tải. Mặc định created_at DESC,id DESC. Bộ lọc không làm thay loại nguồn của form đang sửa.

| Trường / đối tượng | Kiểu | Bắt buộc ở đâu | Nguồn và cách dùng |
|---|---|---|---|
| report_type | enum | Bắt buộc | TIKTOK_SALES / SHOPEE_SALES / KOC_SALES / TIKTOK_RETURNS / VIDEO_PERFORMANCE |
| company_id / shop_or_channel_id | uuid | Bắt buộc | Chọn từ danh mục có platform và pháp nhân |
| file_original_name / checksum / bytes | string / SHA256 / binary | Bắt buộc | Giữ tên gốc; loại file dựa nội dung và chữ ký file; checksum do server tính |
| sheet / header_row / mapping_version | string / int / int | Bắt buộc | Tự nhận diện nếu duy nhất; nhiều sheet đúng thì yêu cầu chọn |
| period_start / end / period_basis | date / date / enum | Bắt buộc | DATE_ROWS / EXPORT_PERIOD / SNAPSHOT; không suy ra từ tên file |
| preview_rows / errors | array | Tự sinh | Sheet, dòng, header/cột, giá trị lỗi, mã lỗi và hướng khắc phục |
| source_confirmation | actor + timestamp | Bắt buộc khi mơ hồ | Ví dụ sales cùng schema hoặc KOC thiếu kỳ |
| commit / revision | atomic | Sau kiểm tra | Server kiểm lại quyền, checksum, dữ liệu và version; ghi trọn bộ hoặc rollback |

**Hành vi và kiểm tra:**

- Lỗi chặn: thiếu cột bắt buộc, sai loại, rỗng, số âm/không hợp lệ, ngày không tồn tại, khóa dòng mâu thuẫn, kỳ không phù hợp, thiếu quyền.
- Mẫu đã có nguồn cần khóa company+shop+platform+kind+grain+period+entity; checksum chỉ bắt file byte giống, không đủ bắt cùng dữ liệu xuất lại.
- TikTok hoàn/hủy: sheet OrderSKUList, header dòng 1, mô tả dòng 2, 113 dòng dữ liệu/112 Order ID trong mẫu. Dùng địa chỉ ô để nhóm đúng hàng: XML nguồn lặp row elements cùng r.
- Order Amount và Order Refund Amount cấp đơn phải đối chiếu cùng Order ID, không SUM theo SKU. Nếu cùng đơn có tiền cấp đơn mâu thuẫn thì báo lỗi.
- Không đưa người nhận/điện thoại/địa chỉ người mua vào mô hình báo cáo; xử lý tối thiểu dữ liệu cần thiết.
- Không cộng file hoàn/hủy thêm vào chỉ tiêu tổng hợp sales; chỉ đối chiếu. Chọn basis created/paid/cancelled theo báo cáo đã thống nhất.

## S06. Sản xuất nội dung

**Điểm sửa trong repo:** `web/tasks.tsx + web/modules.tsx; server/record-config.ts CONTENT/SHOOT/DELIVERABLE/PUBLICATION; server/tasks.ts validateTaskWork; records`

Một hồ sơ nội dung xuyên suốt; các bước có dữ liệu riêng và timestamp hoàn thành. Liên kết task nguồn thay vì tạo nhiều task trùng nội dung.

**Bộ lọc và thứ tự:** q: mã/tên; stage nhiều lựa chọn; content owner; writer; camera; editor; participant; hạn; ngày quay dự kiến/thực tế; ngày hoàn tất dựng. Mặc định việc chưa hoàn tất, hạn gần trước rồi created_at DESC,id. Danh sách hoàn tất tách riêng.

| Trường / đối tượng | Kiểu | Bắt buộc ở đâu | Nguồn và cách dùng |
|---|---|---|---|
| content_id / title / brief | uuid / string / text | Bắt buộc | Tên nội dung, mục tiêu, campaign nếu có |
| script_text / script_assets / writer_id | text / asset[] / uuid | Bắt buộc trước xong kịch bản | Nội dung thoại và tài liệu riêng |
| shoot_location / scheduled_shoot_at | text / timestamptz | Bắt buộc trước quay | Kế hoạch quay |
| participants / camera_operator | user[] hoặc external[] / uuid | Bắt buộc | Danh mục user đang hoạt động; người ngoài có tên, vai trò và ghi chú |
| shot_at / raw_assets | timestamptz / asset hoặc URL[] | Bắt buộc trước xong quay | Ngày quay thực tế; file/link tư liệu |
| editor_id / final_assets / edited_at | uuid / asset hoặc URL[] / timestamptz | Bắt buộc trước xong dựng | Clip hoàn chỉnh và người dựng |
| stage_events | append-only | Tự sinh | Mỗi lần chuyển bước giữ actor, time, trước/sau; không chỉ lưu trạng thái cuối |

**Hành vi và kiểm tra:**

- Tách CLIP_READY và PUBLISHED. Video dựng xong nhưng chưa đăng vẫn được báo cáo đúng số clip hoàn chỉnh.
- Không cho nhảy bước khi thiếu dữ liệu bắt buộc; lưu nháp được phép chưa đủ trường.
- Một nội dung có nhiều publication, mỗi publication gắn nền tảng/kênh riêng.
- Task mẫu video hiện tại bắt đến published mới SUBMITTED. Phải tách production output và publication khi triển khai, giữ legacy snapshot.

## S07. Video đã đăng

**Điểm sửa trong repo:** `web/business.tsx Metrics VIDEO; server/metrics.ts; records PUBLICATION; cần publication_metrics snapshot/window`

Một dòng cho mỗi lượt đăng; gắn video_id từ URL, content_id, channel_id và thời gian. Màn hình D7 phân biệt đủ kỳ/chưa đủ kỳ/thiếu nguồn.

**Bộ lọc và thứ tự:** Nền tảng, kênh, người phụ trách, khoảng ngày đăng, khoảng ngày chốt, D7 status (NOT_DUE/MISSING_SOURCE/READY/AMBIGUOUS_DATE); q link/platformID/title. Mặc định published_at DESC NULLS LAST,id. Lọc D7 không lấp missing bằng 0.

| Trường / đối tượng | Kiểu | Bắt buộc ở đâu | Nguồn và cách dùng |
|---|---|---|---|
| publication_id / content_id | uuid | Bắt buộc | Liên kết nội dung và từng lượt đăng |
| platform / channel_id / video_url / platform_video_id | enum / uuid / URL / string | Bắt buộc | Không dùng tiêu đề làm khóa video |
| published_at / collected_at | timestamptz | Bắt buộc | Post time / Time; file mẫu thiếu năm và ngày dạng chữ tiếng Việt |
| views / likes / comments / shares | integer | Theo nguồn | Total views / Total likes / Total comments / Total shares |
| interaction_rate | decimal | Tự tính | (likes+comments+shares)/views cùng snapshot; views=0 → N/A |
| gmv / currency / attribution / source | decimal / enum / text / reference | Cần nguồn bổ sung | File hiện tại không có GMV; không tự điền 0 |
| window_start / window_end / measured_basis | timestamp / enum | Cần cho D7 | D7 đề xuất 168 giờ từ published_at; cần chốt với cách xuất dữ liệu nền tảng |

**Hành vi và kiểm tra:**

- Snapshot ngày 10/11 của video đăng tháng 6 không phải số liệu 7 ngày. 7 ngày attribution của KOC cũng không phải 7 ngày sau đăng video.
- Không trừ hai cumulative snapshot để suy ra unique viewers/ratio nếu nguồn không hỗ trợ.
- Ngày đăng có thể nằm trước kỳ ghi nhận. Không chặn video cũ chỉ vì post date nằm ngoài tuần upload.
- Thiếu năm cần xác nhận người dùng và lưu provenance, không lấy năm từ tên file.

## S08. Hồ sơ nhân viên

**Điểm sửa trong repo:** `web/employees.tsx; server/employees.ts; server/employee-history.ts; employee_profiles/positions/documents/revisions`

Giữ hồ sơ cơ bản, thêm timeline công tác, hợp đồng nhiều bản và lịch sử lương có ngày hiệu lực; HR toàn công ty.

**Bộ lọc và thứ tự:** q mã/tên/điện thoại/email trong quyền HR; bộ phận, vị trí, giaiđoạn, loại hình, khoảng ngày nhận việc, hồ sơ thiếu, tài khoản đã/chưa cấp. Đang làm/Đã nghỉ tách tab. Mặc định tên theo localevi rồi employee_code,id. Export đúng cùng filter.

| Trường / đối tượng | Kiểu | Bắt buộc ở đâu | Nguồn và cách dùng |
|---|---|---|---|
| employee_id / employee_code | uuid / string | Bắt buộc | Mã duy nhất không phân biệt hoa thường, giữ số 0 đầu |
| name / joined_on / team_id / positions | string / date / uuid / array | Bắt buộc | Vị trí khác ROLE truy cập |
| birthday / contact | date / object | Tùy chọn | Không tự điền ngày sinh thiếu |
| employment_phase / type | enum | Bắt buộc | PROBATION/OFFICIAL/LEFT; FULL_TIME/PART_TIME/INTERN/CONTRACTOR |
| probation_start / end / official_start | date | Theo giai đoạn | Mốc thực tế; không tính ngày bắt đầu chính thức từ hợp đồng một cách ngầm định |
| linked_user_id | uuid unique | Sau cấp tài khoản | Một hồ sơ một user; HR cấp chuyên môn theo policy mới |
| documents / history | asset[] / revision[] | Theo thao tác | Không giả lập trước/sau của dữ liệu lịch sử đã mất |

**Hành vi và kiểm tra:**

- Thêm hồ sơ không tự cấp ROLE. Wizard cấp user có liên kết hồ sơ và ROLE chuyên môn riêng.
- Nghỉ việc: xem task mở, bàn giao, ngày/lý do, thu hồi session và quyền chia sẻ; không xóa lịch sử.
- Bản mẫu dùng hồ sơ hoàn toàn giả. Định danh/thuế/ngân hàng đề xuất giữ quyền Admin như repo, cần chốt nếu HR cần thêm.
- Lương dùng mức có hiệu lực theo ngày. Mức tương lai không ghi đè mức hiện hành. Cần employee_salary_terms thay một trường payroll_cipher duy nhất.

## S09. Hồ sơ ứng viên

**Điểm sửa trong repo:** `server/record-config.ts còn CANDIDATE/APPLICATION/INTERVIEW; server/modules.ts hiện trả LEGACY_READ_ONLY cho save HR; web/employees.tsx chỉ danh bạ nhân viên`

Khôi phục nghiệp vụ tuyển dụng có chủ đích theo yêu cầu mới, tạo tab riêng với danh sách ứng viên, ứng tuyển và phỏng vấn. Không chỉ mở lại route cũ thiếu kiểm quyền.

**Bộ lọc và thứ tự:** q mã/tên/liên hệ; vị trí, stage, recruiter, nguồn CV, khoảng nhận CV, khoảng phỏng vấn. Mặc định lịch phỏng vấn tương lai gần nhất trước, sau đó received_on DESC,id. Không hiển thị contact người khác ngoài HR/Admin.

| Trường / đối tượng | Kiểu | Bắt buộc ở đâu | Nguồn và cách dùng |
|---|---|---|---|
| candidate_id / name / contact | uuid / string / object | Tên + ít nhất một liên hệ | Email/phone dùng tìm trùng nhưng không tự gộp người khác |
| application_id / position / received_on / source | uuid / enum / date / text | Bắt buộc | Một ứng viên có thể nhiều lần ứng tuyển |
| stage / next_action | enum / text | Bắt buộc / tùy chọn | Mới nhận, phỏng vấn, đánh giá, mời việc, nhận việc, không phù hợp |
| cv_assets / portfolio | private asset[] / URL | Tùy chọn | File CV có ACL HR/Admin; không public |
| interviews | array | Theo lịch | start/end, interviewer(s), location, outcome, notes |
| birthday | date | Tùy chọn | Nếu được cung cấp; danh sách sinh nhật không tự suy đoán |
| employee_id / accepted_at | uuid / date | Khi tiếp nhận | Giữ candidate/application reference; chống chuyển đổi lặp |

**Hành vi và kiểm tra:**

- Thông tin liên hệ, CV và đánh giá thuộc HR/Admin. ROLE Sếp chỉ nhận kết quả tổng hợp nếu không được cấp HR.
- Chuyển ứng viên thành nhân viên điền sẵn dữ liệu; yêu cầu mã nhân viên, ngày nhận việc và vị trí.

## S10. Hợp đồng & nhắc việc

**Điểm sửa trong repo:** `server/employees.ts employee_profiles.contract_*; server/worker.ts contract reminders; server/app.ts settings policies`

Từ một cặp ngày hợp đồng sang bảng contracts nhiều bản, theo dõi thử việc/chính thức/gia hạn/phụ lục và hồ sơ cần ký.

**Bộ lọc và thứ tự:** Bộ phận, nhân viên, loại hợp đồng, trạng thái, mốc 7/30 ngày, hết hạn trước/từ/đến, thiếu file. Mặc định EXPIRED chưa xử lý trước, sau đó due milestone gần nhất; expires_on ASC,id. Hợp đồng superseded không lẫn “Cần xử lý”.

| Trường / đối tượng | Kiểu | Bắt buộc ở đâu | Nguồn và cách dùng |
|---|---|---|---|
| contract_id / employee_id / number | uuid / uuid / string | Bắt buộc | Số hồ sơ trong phạm vi công ty |
| kind / signed_on / effective_from / expires_on | enum / date | Bắt buộc theo loại | Hợp đồng không xác định thời hạn cho expires_on null có nhãn riêng ở bản thật |
| status / previous_contract_id | enum / uuid | Bắt buộc / tùy chọn | DRAFT/SIGNED/ACTIVE/EXPIRED/SUPERSEDED; tránh nhắc hợp đồng đã thay |
| assets / salary_term_id | asset[] / uuid | Theo hồ sơ | Phụ lục lương liên kết đúng mức lương |
| reminder_rule / due_at / acknowledged_at | config / timestamp | Tự sinh | In-app notification, xử lý/dời nhắc theo policy |

**Hành vi và kiểm tra:**

- Repo hiện nhắc hết hợp đồng trước 7 ngày cho HR. Nhắc thử việc và mốc 30/7 là đề xuất mới cần duyệt.
- Tính ngày theo Asia/Ho_Chi_Minh; chạy job idempotent, chống trùng theo contract/rule/milestone.
- Chỉ HR đang hiệu lực nhận nhắc HR. Kết thúc hợp đồng không tự cho nghỉ việc hoặc tự khóa user.

## S11. Sinh nhật

**Điểm sửa trong repo:** `server/worker.ts birthdayOccurrence + workingDate; cần endpoint birthday month cả employees/candidates`

Danh sách tháng tách nhân viên và ứng viên; thêm khu vực người chưa có ngày sinh. Không coi sinh nhật ứng viên là nhận việc.

**Bộ lọc và thứ tự:** Tháng 1–12; entity EMPLOYEE/CANDIDATE; bộ phận hoặc vị trí; đang làm/đang ứng tuyển/toàn bộ theo quyền; thiếu ngày sinh. Mặc định tháng VN hiện tại; sort ngày sinh nhật trong tháng ASC,name,id.

| Trường / đối tượng | Kiểu | Bắt buộc ở đâu | Nguồn và cách dùng |
|---|---|---|---|
| entity_type / entity_id / name | enum / uuid / string | Bắt buộc | EMPLOYEE hoặc CANDIDATE |
| birthday / month / next_occurrence | date / int / date | Nếu đã cung cấp | Lọc tháng; hiển thị ngày/tháng, không cần công khai năm sinh toàn đội |
| reminder_policy | config | Theo cấu hình | Đầu tháng / trước 5 ngày làm việc là đề xuất; xử lý 29/2 cần chốt |

**Hành vi và kiểm tra:**

- Ứng viên đã tiếp nhận có thể hiện ở hai danh sách nhưng không nhân thông báo cho cùng người nếu đã liên kết.
- Ngày sinh thiếu → mục chưa có dữ liệu, không chuyển thành 01/01.
- Danh mục ngày trong bản mẫu chỉ ngày/tháng; bản thật muốn lịch theo thứ cần tính đúng năm/tháng.

## S12. Báo cáo tuần

**Điểm sửa trong repo:** `web/reports.tsx; server/reports.ts; plans/report_drafts/reports/report_revisions`

Một báo cáo tuần mỗi nhân viên, nhiều section theo ROLE được cấp; nộp tạo snapshot bất biến, Sếp chỉ xem bản đã nộp. Kế hoạch tuần nhập gọn trong báo cáo, có thể giữ plans API phía sau.

**Bộ lọc và thứ tự:** week_start bắt buộc; employee, bộ phận, chuyên môn section, đã/chưa nộp, trễ/đúng hạn, version. Sếp mặc định tuần trước trọnvẹn và bản mới nhất mỗi user; mở dropdown lịch sửversions. Hàng chưa nộp không có nút đọc draft.

| Trường / đối tượng | Kiểu | Bắt buộc ở đâu | Nguồn và cách dùng |
|---|---|---|---|
| report_id / employee_id / week_start / end | uuid / uuid / date | Bắt buộc | Đề xuất T2–CN; lưu policy_version |
| task_section | snapshot | Tự tổng hợp | Phát sinh, hoàn thành trong kỳ, chuyển tiếp, hủy; hỗ trợ nếu được giữ |
| market_section | snapshot | Theo ROLE | Nguồn sales đúng kỳ; KOC chỉ khi đã xác nhận kỳ; sources/revisions |
| content_section | snapshot | Theo ROLE | Đếm stage_events theo thời gian; publication theo posted_at; D7 đúng cửa sổ |
| hr_section | snapshot | Theo ROLE | Nhận việc/phỏng vấn/hợp đồng; loại thông tin lương/định danh |
| narrative / next_week | text | Nhân viên nhập | Kết quả khác, khó khăn, cần hỗ trợ, kế hoạch tới |
| submitted_at / revision / recipients / manifest | metadata | Khi nộp | Danh sách Sếp từ quyền, nguồn dữ liệu đúng phiên bản |

**Hành vi và kiểm tra:**

- Repo đang dùng cohort task created_at và trạng thái hiện tại; cần thiết kế truy vấn event/time đúng để báo cáo hoàn thành tuần này của task tạo tuần trước. Không chỉ sửa UI.
- Nộp lại tạo revision mới, không ghi đè snapshot. API Sếp không được đọc draft hoặc live cá nhân khác.
- Xuất Excel từ snapshot được chọn, không truy vấn live để xuất lại số khác.
- Admin có thể xem mọi báo cáo, người nhận nghiệp vụ là Sếp đang hiệu lực. Hạn nộpT2 10 h là đề xuất.

## S13. Tài khoản & phân quyền

**Điểm sửa trong repo:** `web/admin.tsx; web/user-access.tsx; server/user-access.ts; server/app.ts; grants/users/sessions`

Chỉ 5 ROLE hiển thị. Cần policy phân quyền mới cho HR tạo user và cấp chuyên môn; endpoint hiện tại Admin-only nên bắt buộc sửa backend kèm kiểm quyền.

**Bộ lọc và thứ tự:** q username/tên/mã nhân viên; ROLE nhiều lựa chọn; active; employee linked/unlinked; chuyên môn/nhóm. Mặc định active trước,name,id. HR không có nút cấp/quản lý user đặc quyền.

| Trường / đối tượng | Kiểu | Bắt buộc ở đâu | Nguồn và cách dùng |
|---|---|---|---|
| user_id / employee_id | uuid unique | Bắt buộc | Liên kết tài khoản với hồ sơ |
| username | string(3..64) | Bắt buộc | Unique case-insensitive; không trùng email legacy |
| initial_password / reset_password | secret | Bắt buộc khi tạo/reset | Tối thiểu 11 ký tự theo repo; Argon 2 id; không log/echo/cache mật khẩu |
| display_roles | enum[] | Ít nhất 1 | ADMIN/BOSS/MARKETPLACE/HR/CONTENT |
| role_changes | append-only | Khi thay đổi | Actor/time/before/after/reason; API cấm HR cấp Admin/Sếp |
| active / permission_version | bool / int | Tự quản lý | Khóa thu hồi session; quyền thay đổi có hiệu lực ngay |

**Hành vi và kiểm tra:**

- ADMIN→ACCESS ADMIN ALL. BOSS→ACCESS BOSS ALL. 3 chuyên môn→JOB tương ứng + EMPLOYEE; Content gom thiết kế vào profile chuyên môn, không cần ROLE DESIGNER cho người dùng chọn.
- HR không được sửa/reset/khóa tài khoản Admin hoặc Sếp và không tự nâng quyền. Kiểm tra request giả mạo roles trên server.
- Admin có quyền toàn hệ thống nhưng không đọc plaintext website từ hash. Có chức năng đặt lại mật khẩu.
- Một người nhiều ROLE là đề xuất tương thích yêu cầu cũ, cần duyệt. Thu hồi 1 ROLE không mất dữ liệu ROLE khác.

## S14. Tài khoản nền tảng

**Điểm sửa trong repo:** `web/accounts.tsx; server/accounts.ts; server/account-sharing.ts; platform_viewers/account_viewer_overrides/credential_versions`

Giữ chức năng chia sẻ tài khoản nền tảng đang có. Admin chọn người; nhân viên được chia sẻ xem/cập nhật bản lưu mật khẩu.

**Bộ lọc và thứ tự:** q label/login; platform; company; sharedviewer (Admin); sort UPDATED_DESC/NAME_ASC/PLATFORM. Giữ bộ lọc hai chiều user→account và account→viewers của repo.

| Trường / đối tượng | Kiểu | Bắt buộc ở đâu | Nguồn và cách dùng |
|---|---|---|---|
| platform_id / account_id / company / login | uuid / string | Bắt buộc | Pháp nhân và cửa hàng rõ |
| viewers / inheritance | user[] / bool | Do Admin cấp | Danh sách riêng ưu tiên nền tảng |
| current_version / secret_cipher | uuid / ciphertext | Nếu có mật khẩu | AES-256-GCM; VAULT_KEY ngoài DB |
| note / changed_by / changed_at | metadata | Khi cập nhật | Bản lưu sau khi đổi ngoài nền tảng |

**Hành vi và kiểm tra:**

- Sếp không tự thấy account chỉ vì có ROLE Sếp. Không dùng JOB để tự mở share.
- Bản mẫu không chứa mật khẩu thật và không lưu mật khẩu người dùng nhập.

## S15. Lịch sử mật khẩu

**Điểm sửa trong repo:** `web/accounts.tsx PasswordHistory; server/accounts.ts /credential-history`

Chỉ lịch sử mật khẩu nền tảng Admin. Giữ các lịch sử nghiệp vụ riêng trong HR/task/report, không đưa generic usage log trở lại.

**Bộ lọc và thứ tự:** Account, platform, actor, company, khoảng thời gian. Mặc định created_at DESC,id. Reveal từng phiên bản là hành động riêng, không tựreveal khi lọc.

| Trường / đối tượng | Kiểu | Bắt buộc ở đâu | Nguồn và cách dùng |
|---|---|---|---|
| credential_version_id / account_id | uuid | Bắt buộc | Bản trước và sau cùng account |
| actor / time / note | metadata | Bắt buộc | Lọc người, nền tảng, tài khoản, thời gian |
| before / after reveal | secret action | Admin-only | Ẩn mặc định, truy xuất từng lần; không cache response.secret |

**Hành vi và kiểm tra:**

- Mật khẩu website không có lịch sử đọc được. Lịch sử cập nhật lương/hồ sơ nằm đúng hồ sơ nhân viên.

## S16. Mẫu công việc

**Điểm sửa trong repo:** `web/template-admin.tsx; server/template-store.ts; task_templates/task_template_versions`

Giới hạn danh mục hiển thị ba chuyên môn. Tạo form đơn giản lúc thêm việc; trường chuyên môn ở bước thực hiện.

**Bộ lọc và thứ tự:** q tên/mã, chuyên môn, enabled, currentversion. Mặc định group,name,code. Bật/tắt không xóa snapshot cũ.

| Trường / đối tượng | Kiểu | Bắt buộc ở đâu | Nguồn và cách dùng |
|---|---|---|---|
| template_id / code / name / roles | uuid / string / enum[] | Bắt buộc | Chỉ MARKETPLACE/HR/CONTENT cấp mới |
| definition / fields / validation | JSON | Bắt buộc | required_by_action, fieldtype, source options |
| version / snapshot / reason | immutable | Khi cập nhật | Giữ task cũ nguyên hợp đồng mẫu |

**Hành vi và kiểm tra:**

- Mẫu video mới tách hoàn tất dựng và đăng, không buộc mọi loại công việc Content có link đã đăng.

## S17. Thiết lập

**Điểm sửa trong repo:** `web/admin.tsx Settings; server/app.ts /settings; settings/settings_history`

Lịch, kỳ báo cáo, mốc HR và danh mục nguồn. Các giá trị mới hiển thị trong bản mẫu là đề xuất, không tự bật policy thật.

**Bộ lọc và thứ tự:** Tabs Lịch&Báo cáo / Nhắc HR / Danh mục / Phân quyền nguồn. Danh mục có q,active,platform,company; sắp sort_order,name,id.

| Trường / đối tượng | Kiểu | Bắt buộc ở đâu | Nguồn và cách dùng |
|---|---|---|---|
| calendar / timezone / holidays | config | Bắt buộc | T2–T7 09–12/13–18; Asia/Ho_Chi_Minh; ngoại lệ |
| report_week / due_time | config | Cần duyệt | T2–CN; hạn nộpT2 10 h đề xuất |
| probation_offsets / contract_offsets | int[] | Cần duyệt | Thử việc 7,3; hợp đồng 30,7 ngày lịch đề xuất |
| companies / shops / channels / departments | catalogs | Bắt buộc trước import | Mã nguồn, tên, platform, company, active |
| decision_actor / reason / version | metadata | Khi thay đổi | Chỉ Admin và chống ghi đè |

**Hành vi và kiểm tra:**

- Không hard code mốc nhắc hoặc người nhận trongworker/UI.
- Pháp nhân Super Net vàJielienVN tách biệt; không gộp số liệu mặc định.

## S18. Thông báo

**Điểm sửa trong repo:** `server/worker.ts; outbox/notifications; web/main.tsx Notifications`

Chuông tập trung cho báo cáo/task/HR. Tách đối tượng, đường dẫn mở, người nhận và chống trùng.

**Bộ lọc và thứ tự:** Chưa đọc/Tất cả; loại TASK/REPORT/HR; khoảng thời gian. Mặc định unread trước,created_at DESC,id. Countunread trong toàn scope, không chỉ page.

| Trường / đối tượng | Kiểu | Bắt buộc ở đâu | Nguồn và cách dùng |
|---|---|---|---|
| event_type / object_type / object_id | enum / uuid | Bắt buộc | TASK, REPORT_REVISION, EMPLOYEE, CONTRACT |
| recipient / dedupe_key / created_at / read_at | metadata | Bắt buộc | Người nhận từ quyền hiện tại; key theo nghiệp vụ |
| title / body / action_url | text | Bắt buộc | Không có lương/định danh hoặc secret trongbody |

**Hành vi và kiểm tra:**

- Kiểm quyền khi đọc và khi mở deep link. HR mất ROLE không còn thấy nhắc HR.
- Báo cáo mới gửi ROLE Sếp; nhắc hợp đồng/sinh nhật gửi HR.

## S19. Tài khoản của tôi

**Điểm sửa trong repo:** `web/main.tsx profile; server/app.ts /auth/password`

Giữ đổi mật khẩu cá nhân; thêm form xác nhận mật khẩu mới.

**Bộ lọc và thứ tự:** Không có bộ lọc. Chỉ sessionuser; không cho chọn user khác.

| Trường / đối tượng | Kiểu | Bắt buộc ở đâu | Nguồn và cách dùng |
|---|---|---|---|
| current_password | secret | Bắt buộc | Argon 2 verify |
| new_password / confirm | secret | Bắt buộc | 11 ký tự trở lên; confirm chỉ client, server kiểm password |
| session invalidate | action | Khi đổi thành công | Thu hồi session khác theo repo |

**Hành vi và kiểm tra:**

- Khônglog, không plaintext DB, không đưa bí mật vào idempotencyresponse.
