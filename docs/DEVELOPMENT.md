# Tiếp tục phát triển SuperNet

Mã thực thi và migration là nguồn hiện trạng. Các gói đặc tả, prototype, ảnh chụp và báo cáo nghiệm thu cũ đã được dọn khỏi checkout; có thể xem lại trong lịch sử Git trước commit dọn dẹp ngày 10/11/2026. Đây là điểm tiếp tục xây từng chức năng, không phải xác nhận nghiệm thu nghiệp vụ hay triển khai Windows/LAN.

| Thành phần | Vị trí |
|---|---|
| Xác thực, grant 5 ROLE | `server/base.ts`, `user-access.ts`, `role-bundles.ts`, `handoff-access.ts` |
| Menu và UI | `server/capabilities.ts`, `web/main.tsx`, `web/hr-v2.tsx` |
| Công việc | `server/checklist.ts`, `tasks.ts`, `web/checklist.tsx` |
| Nội dung/video | `server/content.ts`, `web/content-v2.tsx` |
| Nhập nguồn và chỉ số | `server/source-parser.ts`, `source-imports.ts`, `config/import-adapters.json` |
| Nhân sự | `server/hr.ts`, `employees.ts`, `hr-jobs.ts`, `web/hr-v2.tsx` |
| Báo cáo | `server/report-v2.ts`, `reports.ts`, `web/reports.tsx` |
| DB | `migrations/001.sql` đến `011.sql`, áp dụng theo thứ tự trong một transaction |
| Hồi quy | `tests/*.test.ts`, `tests/browser/`, `tests/fixtures/` |

Không sửa migration đã áp dụng để đổi mô hình; thêm migration tiếp theo. Không xóa bảng hoặc reset dữ liệu để bắt đầu lại giao diện. Các chức năng cũ vẫn phục vụ đọc/làm việc với dữ liệu hiện có; mọi thao tác cấp quyền đều phải qua danh sách 5 ROLE. Chỉ số ADS, loại hình thực tập, nhãn EMPLOYEE của đối tượng nhân sự và tên sự kiện lịch sử không phải ROLE truy cập.

`config/task_templates.json` và `config/role_task_catalog.json` là danh mục hiện hành cho 3 chuyên môn. `config/legacy_task_templates.json` chỉ phục vụ snapshot dữ liệu cũ. Không thêm chuyên môn khác vào biểu mẫu, grant hoặc danh mục hiện hành.

Các XLSX trong `tests/fixtures/handoff/originals` cùng manifest checksum phục vụ hồi quy adapter. Chúng không xác nhận số liệu thật đã được gán đúng pháp nhân/shop/kênh hoặc đã đối soát. Giữ fixture khi sửa parser; không lưu dữ liệu người dùng mới vào Git.

Kiểm tra sau thay đổi: typecheck/build, các test API/DB liên quan, rồi Playwright khi thay giao diện/quyền. Dùng DB `_test` riêng. Windows và LAN cần kiểm tra trên máy công ty; môi trường cloud Linux không thay thế bước đó.
