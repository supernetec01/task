# Rà soát Super Net và hướng dẫn sửa cho Codex — 07/11/2026

## Kết luận
Source đã có nhiều nghiệp vụ backend; phần task chưa được chuyển sang thiết kế đơn giản trong ảnh. Không nên làm lại toàn bộ hệ thống hoặc chỉ thay CSS. Cần đồng bộ danh mục mẫu, bổ sung quản trị mẫu, tách trao đổi khỏi audit và gộp thao tác cập nhật/nộp kết quả.

Đây là báo cáo kiểm tra tĩnh và gói thiết kế bàn giao. Chưa sửa/push repository, chưa chạy bootstrap tài khoản thật, chưa xác nhận server đăng nhập thành công trong môi trường này.

## Bản source được kiểm tra
- Repository: https://github.com/supernetec01/task
- Nhánh: main
- Commit: `559c9ab5045397c82ada28d81b2f34c35b5a251e`
- Cây source của commit: `1561167c38ad44494f8bb45d0d83896f13ffddad`.
- Đã tải 72 file văn bản để đọc; không tải lại các tài liệu docs/reference trùng bộ yêu cầu gốc. Các kết luận dựa trên code, không dựa riêng vào ảnh lỗi cũ.
- Mốc dòng trong BACKLOG.csv là mốc của commit trên; Codex phải kiểm tra lại nếu main thay đổi.

## Các điểm xác nhận được
### F01 — Mã có trong catalog nhưng không có template; nhãn rơi về mã, backend rơi về OTHER
- Mức: P1 · Đã xác nhận
- Vị trí: `config/role_task_catalog.json; config/task_templates.json; web/tasks.tsx:126; server/tasks.ts:104,255,538`
- Sửa: Seed đủ nhãn tiếng Việt; FK catalog→template; không fallback âm thầm; báo lỗi cấu hình; kiểm tra toàn bộ role.
- Nghiệm thu: Mọi mã hiển thị có nhãn và phiên bản; role MARKETPLACE không còn LISTING_CREATE thô.

### F02 — Mẫu đọc JSON khi khởi động; chưa có quản trị mẫu task trong UI/API hiện tại
- Mức: P1 · Đã xác nhận
- Vị trí: `server/tasks.ts:21,296; web/admin.tsx`
- Sửa: Thêm bảng template/version/role mapping và editor Admin; snapshot phiên bản ở task.
- Nghiệm thu: Admin sửa tên/nhóm/trường/bật tắt; staff không có quyền; task cũ không đổi schema.

### F03 — Tạo task còn lộ role/type/priority/ngày phát sinh; chưa có đính kèm tại tạo
- Mức: P1 · Đã xác nhận
- Vị trí: `web/tasks.tsx:72-215`
- Sửa: Form chính tên, hạn, người phụ trách nếu cần; mô tả/tài liệu tùy chọn; mẫu và nâng cao thu gọn.
- Nghiệm thu: Task OTHER tạo được không chọn mẫu; chỉ một role thì tự chọn; thêm file không phải mở lại task.

### F04 — Bốn tab và cập nhật/nộp tách rời; thiếu chọn Đang làm/Đã xong trong cập nhật
- Mức: P1 · Đã xác nhận
- Vị trí: `web/tasks.tsx:263,408,449,537; server/tasks.ts:467`
- Sửa: Gộp thành Cập nhật & kết quả; đang làm gọi updates, đã xong gọi submit; giữ quy trình duyệt.
- Nghiệm thu: Chọn Đã xong→SUBMITTED; chỉ duyệt mới DONE; form không mất nội dung khi lỗi.

### F05 — Hủy đang là details inline, thiếu bước dialog như thiết kế
- Mức: P1 · Đã xác nhận
- Vị trí: `web/tasks.tsx:739-760; server/tasks.ts:700`
- Sửa: Nút trong menu ⋯; dialog lý do bắt buộc, xác nhận; hiển thị thông báo đã hủy.
- Nghiệm thu: Bỏ trống bị chặn; hủy dialog không gọi API; xác nhận một lần và lịch sử lưu lý do.

### F06 — Trao đổi đang render task_events/action/data; không có luồng chat task riêng trong tasks.ts
- Mức: P1 · Đã xác nhận
- Vị trí: `web/tasks.tsx:619-635; server/tasks.ts:86; migrations/001.sql`
- Sửa: Tách comments có API/permission; event history đọc riêng và diễn giải tiếng Việt.
- Nghiệm thu: Trao đổi chỉ tin người dùng; CREATED/EMPLOYEE_ADHOC/JSON không xuất hiện.

### F07 — Checkpoint 0/0 và các khối chung lặp ở nhiều tab làm modal dài
- Mức: P2 · Đã xác nhận
- Vị trí: `web/tasks.tsx:513,635-798`
- Sửa: Chỉ render section có nội dung hoặc hành động hợp lệ; đưa file/người hỗ trợ về thông tin.
- Nghiệm thu: Task đơn giản không có checkpoint và không phải cuộn qua khối trống.

### F08 — Danh sách hiện raw type; nộp đúng hạn nhưng chưa duyệt vẫn có thể gắn Quá hạn
- Mức: P2 · Đã xác nhận
- Vị trí: `web/tasks.tsx:42,56-58`
- Sửa: Dùng label registry; tách hạn công việc, thời điểm nộp, tình trạng chờ duyệt.
- Nghiệm thu: Nộp trước hạn, duyệt sau hạn: thể hiện đã nộp đúng hạn/chờ duyệt.

### F09 — Chi tiết dùng Modal chung, chưa phải drawer ba tab như ảnh tham chiếu
- Mức: P2 · Đã xác nhận
- Vị trí: `web/ui.tsx:223; web/style.css; web/tasks.tsx:295`
- Sửa: Thêm TaskDrawer riêng, không đổi toàn bộ modal dùng cho admin; header/footer cố định, body cuộn.
- Nghiệm thu: Desktop drawer bên phải; mobile toàn màn; focus trap/Esc/dirty guard hoạt động.

### F10 — Một số menu luôn hiện và group theo chỉ số; chưa thể kết luận mọi menu là rò quyền
- Mức: P2 · Cần kiểm thử UX/quyền
- Vị trí: `web/main.tsx:74-92,142; server/base.ts; server/files.ts; server/reports.ts`
- Sửa: Menu từ capabilities và nhóm khai báo; kiểm thử URL/API/file/export trực tiếp sau thu hồi quyền.
- Nghiệm thu: Không có quyền xem thì ẩn; server vẫn trả 403/404; dữ liệu cache được xóa sau đổi quyền.

### F11 — Report truy vấn owner hiện tại và trạng thái hiện tại; không phải tự động ảnh chụp as-of cuối tuần
- Mức: P2 · Giới hạn thiết kế hiện tại
- Vị trí: `server/reports.ts:61-85; docs/DECISIONS.md`
- Sửa: Giữ snapshot đã nộp; làm rõ live preview so với lịch sử; xác nhận chính sách khi chuyển chủ task.
- Nghiệm thu: Đổi owner không làm bản báo cáo đã nộp biến mất; báo cáo lịch sử không lặng lẽ đổi số.

### F12 — Có nền tảng import/report; chưa có bộ file TikTok/Shopee thật đầy đủ để chứng minh mapping và attribution
- Mức: P2 · Chưa nghiệm thu dữ liệu thật
- Vị trí: `server/metrics.ts; web/business.tsx; web/reports.tsx; docs/ACCEPTANCE_STATUS.csv`
- Sửa: Thêm fixtures đã ẩn thông tin, mapping theo file, preview/duplicate/revision; đối soát nguồn.
- Nghiệm thu: Không cộng overview với daily; không cộng unique; không gán GMV shop thành GMV video/nhân viên.


## Những phần đã có, cần giữ và kiểm thử hồi quy
1. `server/main.ts` đã gọi start(), kiểm tra DATABASE_URL/schema, listen mặc định 0.0.0.0:3002, catch lỗi và đặt exitCode=1. Không kết luận source hiện tại vẫn mắc lỗi thoát im lặng từ ảnh cũ.
2. `server/app.ts` hỗ trợ username khi đăng nhập. `server/cli.ts` có bootstrap username admin, hash Argon2, tối thiểu 11 ký tự, khóa advisory và không ghi đè admin hiện có. Việc này được xác nhận bằng đọc code, chưa chạy DB thật.
3. `server/base.ts` lọc grant còn hiệu lực; `server/tasks.ts` kiểm tra quyền owner/manager/support ở backend, invitation pending trả brief. Giữ nguyên nền tảng quyền này.
4. Có submissions/reviews/deadline_requests/owner_history và task_events. Giữ ID, lịch sử, version chống ghi đè và timestamp phía server.
5. Có reports/report_drafts/report_revisions và export ExcelJS. Cần điều chỉnh trình bày, không thay bằng báo cáo tự nhập toàn bộ.
6. Có modules cho dữ liệu nghiệp vụ, requests, vault, import metrics và worker. Những module này có mức hoàn thiện khác nhau; không mặc định coi tất cả đã nghiệm thu nghiệp vụ thực tế.
7. CI có build/unit/Playwright với PostgreSQL. File ACCEPTANCE_STATUS.csv của repo tự ghi nhận nhiều phạm vi chỉ partial/pending; không dùng nhãn “có test” để khẳng định mọi yêu cầu đã đúng.

## Phạm vi chưa thể xác nhận
Môi trường kiểm tra có Node24 nhưng chưa có node_modules/PostgreSQL; không chạy npm build/test/e2e hay server. Không kết luận build thất bại. Cần môi trường DB kiểm thử riêng và cấu hình khóa mã hóa; không sử dụng dữ liệu sản xuất để thử. Chưa có đầy đủ file doanh thu/ads gốc trong phiên này để đối soát mapping thực tế. UI_REFERENCE là prototype tương tác đã làm trước; chưa phải frontend tích hợp API.

## Thứ tự triển khai
1. Sao lưu + ghi nhận commit + chạy baseline tests trong DB riêng.
2. Đồng bộ catalog và template; migration dữ liệu mẫu có version, không sửa lịch sử task cũ.
3. Quản trị mẫu và quyền API.
4. TaskDrawer, CreateTask, merged update, cancel dialog, comments.
5. Reports theo nhân viên/role, kiểm thử thời điểm nộp và thu hồi quyền.
6. Đối soát import file thật, test responsive, Windows LAN và export.

Xem CODEX_START_HERE.md, UI_SPEC.md, DATABASE_API.md và ACCEPTANCE.md để triển khai. BASELINE_REQUIREMENTS.md giữ toàn bộ yêu cầu dài trước đây; nội dung thay đổi giao diện trong gói mới ưu tiên hơn màn hình cũ. Các chính sách chưa chốt không được tự bật hoặc suy đoán.
