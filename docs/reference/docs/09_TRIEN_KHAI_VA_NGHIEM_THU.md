# 09 — Kế hoạch triển khai và nghiệm thu
## 1. Thứ tự triển khai
### A — Lõi có dữ liệu thật
Auth/session; workspace/membership; Admin gán nhiều role/scope/hạn; API permissions; lịch 8h; core task và form ngắn; nhận/từ chối; tiến độ/blocker/submission/review/deadline history; task nhóm invitations/contributions; file private; notifications in-app; audit/outbox/idempotency.

**Demo end-to-end để nghiệm thu A:** quản lý giao task → nhân viên nhận → mời hỗ trợ/được mời → một người nhận, một người từ chối → ghi phần hỗ trợ → owner nộp → manager yêu cầu sửa/hạn mới → owner nộp lại → manager duyệt → số đúng/trễ phản ánh giờ nộp đúng revision. Role hết hạn chặn ngay API/file.

### B — Kế hoạch và báo cáo tuần
Week plans; live report tách role; support/carryover; narrative draft; nộp immutable revision; manager/Boss list employees/period; Excel thật; chart drilldown và so sánh theo policy đã được xác nhận.

**Nghiệm thu B:** employee submit v1 → Boss xem/excel → task nguồn sửa → v1 giữ nguyên → employee submit v2 → Boss chọn v1/v2 được. Không đọc draft người khác; no double-count support/multi-role.

### C — Chuyên môn và nhập nguồn
Content research/script/shoot/edit/publish/live; assets; KOC; manual metrics/import pipeline; business dashboard theo file thật; HR và sự kiện; platform account vault. Làm module nào phải có template/source mapping/permissions/test module đó. Dữ liệu ads chưa đủ không chặn core tasks/reports.

### D — Nghiệp vụ mở rộng theo ưu tiên
Requests/approvals/mua/thuê/mượn/mẫu/chứng từ/yêu cầu hóa đơn/tạm ứng/hoàn chi; chỉ bật khi approver/limits/company/fields đã chốt. Kho vẫn BigSeller. Tester/tri thức/quyền sử dụng/subscriptions/budget nâng cao là P, không bắt buộc build trước go-live lõi.

## 2. Definition of Done từng tính năng
- Có UI đúng scope, API/data persistence, validation server, trạng thái loading/error/empty, audit sự kiện cần thiết.
- Read/write/export/download kiểm tra quyền; test trực tiếp API, không chỉ hide menu.
- Có kịch bản happy path + sai quyền + sai state + retry/double-click/concurrency nếu thay đổi trạng thái terminal.
- Không số mock, không timer hardcode ngày demo, không localStorage làm source dùng chung. Có demo seed tách môi trường, nhãn rõ.
- Migration và seed repeatable, config/version được lưu, rollback/recovery documented; không overwrite dữ liệu thật.
- Cập nhật catalog/docs/tests khi thay đổi thiết kế. Các Q giải quyết có quyết định người chốt/ngày/ảnh hưởng.

## 3. Nghiệm thu theo vai trò
| Người kiểm thử | Luồng cần làm được |
|---|---|
| Admin | Tạo user, cấp đa role có hạn, xem effective permissions, thu hồi, xem audit/history secrets theo quyền |
| Nhân viên | Nhìn đúng menu, tạo phát sinh nhanh, nhận/từ chối, tiến độ/nộp, cập nhật support, draft/nộp report |
| Quản lý | Giao trong scope, xem roster, xử lý blocker/đổi hạn/review, xem report đã nộp của nhóm |
| Boss | Mở report chọn người/tuần/role/version, drilldown done/open/support, tải XLSX đúng bản |
| HR | Hồ sơ/quyền nhạy cảm riêng; đúng một thông báo thử việc và sinh nhật đúng lịch |
| Vận hành/ADS | Upload preview/import đúng loại nguồn, đối chiếu totals, không trùng, metric thiếu giữ N/A |
| Kế toán/Kho | Đúng hồ sơ theo phân công, approval không vượt policy, không sửa tồn chuẩn hoặc giả thanh toán |

## 4. Test dữ liệu và UX
`tests/acceptance.csv` là checklist chạy, không phải kết quả các test đã được thực thi. `tests/fixtures.json` hoàn toàn giả để test, không phải hồ sơ công ty thật. Phải có integration test Postgres/transaction và end-to-end trên môi trường gần production. DDL trong gói chỉ được static review, không tuyên bố đã chạy DB.

Ưu tiên test timezone + cutoff + boundary, role expiry giữa session, direct URL/file access, salary/secret serialization, assignment timeout race, simultaneous support response, stale review, report snapshot immutability, import dedupe, formula injection trong export và cấp claim cấp đơn.

## 5. Dữ liệu ban đầu cần nhập khi triển khai
Workspace/pháp nhân; danh sách nhân viên/account; role và phạm vi; manager/Boss/reviewer mapping; calendar/ngoại lệ; task types/templates enabled; recurring rules được duyệt; shops/channels/source owners; approver policy; nguồn file thật; retention/backup. Không lấy người nhận hardcode `vu` hoặc `boss-demo` từ demo làm cấu hình production.

## 6. Chuyển từ frontend demo sang production
- Giữ CSS tokens/layout/components; bỏ selector đổi role giả và nhãn mẫu ở môi trường thật.
- Thay seed arrays/localStorage bằng API hooks; không upload tự động dữ liệu cũ của trình duyệt thành dữ liệu nhân sự thật.
- Task/demo IDs string/number phải map UUID/code production; mọi timestamp fixed Nov 2026 thay server clock/local date.
- HTML export generator demo có thể tham khảo định dạng nhưng production export server theo report snapshot/quyền.
- HR/KOC/accounts/role grants forms trong demo nhiều thao tác chỉ toast; thay bằng endpoint thực, không giữ toast thành công giả.
- Business charts có nhãn dữ liệu mẫu: thay bằng nguồn thật hoặc empty state; không lấp bằng random.
- Giữ các kịch bản UX đã kiểm tra, bổ sung backend security tests trước go-live.

## 7. Checklist go-live
Môi trường staging, HTTPS/auth/session; DB least privilege/RLS reviewed; secrets out of bundle/log; backup+restore test; migration rehearsal; file ACL và retention; error monitoring không PII/secret; job queue retry; giới hạn upload/rate; permission/cache invalidation; import reconciliation; XLSX mở được; quyền người thật/manager/Boss đúng; chưa có policy thì feature off; người phụ trách xử lý sự cố rõ. Không gửi email/đổi mật khẩu/phát hành hóa đơn/thanh toán ngân hàng tự động chỉ vì có nút frontend.
