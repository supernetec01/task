# Super Net — Bộ bàn giao sửa dự án theo 5 ROLE

Phiên bản: **HANDOFF-1.0 · 10/11/2026**. Ngôn ngữ sản phẩm: tiếng Việt. Múi giờ: Asia/Ho_Chi_Minh.

Repo: https://github.com/supernetec 01/task.git

Commit đối chiếu: `217671e39b85221f5653e24c86640400ede074db`, nhánh `main`; kiểm tra lại ngày 10/11/2026, chưa thay đổi so với khi thiết kế.

**Trạng thái:** khách hàng đã đồng ý bản thiết kế 5 ROLE trong cuộc trò chuyện. Gói này là đặc tả triển khai, không phải bản phần mềm đã nâng cấp. Không có commit, migration hoặc thay đổi dữ liệu production được thực hiện trong gói bàn giao này.

## Bắt đầu

1. Giải nén cả thư mục. Mở `START_HERE.html` để đọc tài liệu và xem sơ đồ offline.
2. Xem bản duyệt trong `prototype/`; thao tác ở đó chỉ là mẫu, không thay hệ thống thật.
3. Gửi `01_CODEX_EXECUTION_CONTRACT.md` làm chỉ dẫn đầu tiên cho Codex. Đọc tiếp quyết định, quyền, task, dữ liệu và API theo thứ tự chỉ định.
4. Codex đối chiếu HEAD hiện tại với commit gốc. Nếu đã có thay đổi, lập bảng phần giao nhau; không ghi đè code mới hoặc âm thầm quay lại commit cũ.
5. Triển khai trong nhánh riêng, từng lát chức năng; migration thật do dev tạo theo database hiện tại và kiểm thử trước khi áp dụng.

## Thứ tự ưu tiên tài liệu

`02_DECISIONS.md` và `03_PERMISSIONS.md` → `04_TASK_FILTER_SORT.md` → hợp đồng từng nghiệp vụ/API/database → tiêu chí nghiệm thu → prototype hình thức → tài liệu cũ trong repo.

Prototype là chuẩn bố cục và đường đi chính. Nếu logic thử nghiệm trong prototype mâu thuẫn đặc tả (form chưa lưu, số minh họa, bộ chọn ROLE), **đặc tả nghiệp vụ thắng**. Không bê nguyên state cục bộ, mật khẩu mẫu hoặc dữ liệu giả sang production.

## Nội dung gói

| Tệp / thư mục | Dùng để làm gì |
|---|---|
| 01_CODEX_EXECUTION_CONTRACT.md | Chỉ dẫn Codex, cách không tự đoán, điều kiện dừng đúng phạm vi |
| 02_DECISIONS.md | Quyết định được chốt và dữ liệu còn thiếu |
| 03_PERMISSIONS.md | Ma trận quyền theo hành động, nhiều ROLE và quyền legacy |
| 04_TASK_FILTER_SORT.md | Bộ lọc, thứ tự, nhóm hạn, cursor, ví dụ chuẩn |
| 05_SCREEN_SPEC.md | 19 màn hình, dữ liệu, thao tác, bộ lọc, trạng thái UI |
| 06_IMPORTS_AND_METRICS.md | 5 adapter, cột nguồn, công thức và kiểm tra lỗi |
| 07_CONTENT_VIDEO.md | Kịch bản, quay, dựng, lượt đăng, snapshot và D7 |
| 08_HR.md | Nhân viên, tuyển dụng, lương, hợp đồng, sinh nhật |
| 09_REPORTS_NOTIFICATIONS.md | Báo cáo tuần và thông báo bất biến, đúng kỳ |
| 10_DATABASE.md + schema/ | ERD, từ điển dữ liệu, ràng buộc, SQL tham khảo |
| 11_API.md + contracts/ | Endpoint, payload, lỗi, idempotency, cursor |
| 12_MIGRATION_AND_DELIVERY.md | File repo cần sửa, thứ tự làm, backup/restore |
| 13_ACCEPTANCE.md + acceptance.csv | Tiêu chí nghiệm thu có ID và truy vết |
| 14_GAPS_AND_PROVENANCE.md | Nguồn, dữ liệu thiếu, giới hạn và đối chiếu prototype |
| diagrams/ | Sơ đồ Mermaid + SVG xem trực tiếp không cần mạng |
| fixtures/ | Mẫu gốc giữ nguyên byte, hash; fixture tổng hợp ghi rõ synthetic |
| prototype/ | Giao diện đã duyệt nguyên bản, không thay lịch sử file duyệt |
| enhancements/ | Bản bổ sung tương tác bộ lọc task mới, riêng với bản duyệt |
| manifest.json | Danh sách file và SHA-256 |

Mỗi endpoint mang nhãn NEW/EXTEND/KEEP. Mỗi bảng mang nhãn NEW/EXTEND/KEEP. Không hiểu nhãn NEW là đã tồn tại trong repo.
