# Kế hoạch tích hợp vào source hiện tại

## Điểm bắt đầu
Repository: https://github.com/supernetec01/task.git . Commit đã đọc/test trước đây: `559c9ab5045397c82ada28d81b2f34c35b5a251e`. Trước khi sửa, lấy main mới, đọc AGENTS.md nếu có, so khác biệt với commit này và cập nhật mốc dòng. Không sửa nhầm prototype rồi tuyên bố production đã nâng cấp.

## Map file → thay đổi
| File / component | Hiện trạng | Cần làm |
|---|---|---|
| `web/main.tsx` | nav hr vàaudit, nhãn Nhân sự&tuyển dụng / Nhật ký thay đổi |Đổi nhãn Nhân sự vàLịch sử mật khẩu; capabilities quyết định menu; không render generic audit; không group menu bằng vị trí mảng |
| `web/admin.tsx` / `Accounts` khoảng527 |Account cards, quyền từng người/role, user_id thô, secretupdate cócheckbox |Tách AccountList, AccountEditor, ViewerPicker, PasswordUpdateDialog; platform dropdown; người xem multi-select có tên; bỏ checkbox đổi ngoài; staff được update secret |
| `web/admin.tsx` / `Team`, `GrantForm` khoảng4–281 |Createuser không grants; cấp1role đóng modal |Wizard createuser+job_grants[] atomic; giữ hồ sơ mở; scope hợp lệ; reviewer picker; permissionversion |
| `web/modules.tsx` / `Records`, `Employees` khoảng210 |HRgeneric candidate/application/interview + tuyển dụng |Tách EmployeeDirectory vàEmployeeDrawer; loại bộ hồ sơ tuyển dụng khỏi menu/form; chỉ employee active/archive |
| `web/reports.tsx` |Report có nghiệp vụ hiện hữu |Giữ report/submitted/export; chỉ sửa chỗ cần link employee mới, không đổi cohort và timing ngầm |
| `web/ui.tsx`, `web/style.css` |Generic Form/Modal |Bổ sung drawer, multi-select, loading/empty/error; giữ các modal còn dùng; không đổi global component gây vỡ toànsite |
| `server/modules.ts` / accountAccess + account routes khoảng37,400–520 |Role-bound grants, generic audit, secretversions/reveal |Batch viewers transaction, catalogplatforms, currentpointer/version, staffupdate, Adminhistory query+reveal, không generic audit hành vi |
| `server/modules.ts` / HRroutes khoảng50,250–400 |created_by scope, sensitive gate, profile thiếucode/positions |Giữ hoặc mở scope theo policy được duyệt; mở rộng fields/linkuser/positions/archive/documents; bỏ candidate required ở flow mới |
| `server/app.ts` / users+grants khoảng300–450 |POST/users chỉuser, grant nhậnADMINSELF |Atomicuser+grants, validate scope/reviewer, dedupe active roles, return new permissions |
| `server/app.ts` / `/audit`, auth hooks |Generic audit endpoint + ghi usage |Retire màn/endpoint theo compatibility; dừng collect hànhvi nhưng giữsession/CSRF/idempotency/rate-limit |
| `server/base.ts` / cipher,decipher,audit |VAULT_KEY vàgeneric audithelper |Giữ encryption; healthstatus an toàn; rà callsites audit để ngừng insertusage; không phá bảng lịch sử nghiệp vụ |
| `server/logging.ts`, `server/main.ts` |Log vàstartup |Redactsecret/body/cookie; giữ chẩn đoán lỗi vận hành tối thiểu; không randomkey lúcstart |
| `server/files.ts` |assets task/record |Thêm employee document ACL/storage; không dùng taskshare để lưu hồ sơ HR |
| `server/worker.ts` |HRnotification/jobs |Birthday5workingdays theo policy; trial/contract reminders chỉ khi đã chốt; dedupe/outbox; offboarding nếu scheduled được chốt |
| `server/record-config.ts` |HR CANDIDATE/APPLICATION/INTERVIEW |Không cung cấp các loại tuyển dụng cho UI/API mới; giữ compatibility dữ liệu cũ, không drop records |
| `migrations/005_*.sql` hoặc số kế tiếp |001–004 đã dùng |Migration additive, backfill có preview, không sửa migration cũ, không mất ciphertext/FK |
| `tests/core.test.ts`, `tests/browser/*.spec.ts` |Generic audit và giao diện cũ có expectations |Sửa expectation theo yêu cầu mới, thêm regressiontests, không xóa assertion bảo mật để được pass |

Các mốc dòng chỉ là gợi ý tại commit audit, không phải vị trí vĩnh viễn. Dùng rg theo tên component/route.

## Thành phần React nên tách
`AccountList`, `PlatformSelect`, `AccountEditor`, `ViewerPicker`, `PasswordUpdateDialog`, `PasswordHistoryPage`, `PasswordHistoryDetail`, `EmployeeDirectory`, `EmployeeDrawer`, `EmployeeEditor`, `EmployeeDocuments`, `UserAccessWizard`, `SettingsOverview`.

Map logic từ HTML sang React state/hooks, dùng API client hiện hữu. Không copy globals/inlineonclick/mảngfixtures hoặc persona selector vào production. Không đưa secrets vào query cache lâu dài hoặc persistence plugin. Tách modal state, clear secret khi close, abort request cũ khi đổiaccount.

## Thứ tự thực hiện
1. Backup và baseline build/tests với DB riêng. Ghi commit và trạng thái migrations.
2. Chốt Q01/Q02/Q04 cho phần permissions; các UI/metadata độc lập tiếp tục làm.
3. Migration platformcatalog/profilefields/currentversion; giữ tương thích read cũ đến khi chuyển xong.
4. Backend DTO/validation/transactions, reviewer eligibility và multi-role. Test negative trước.
5. Passwordupdate/history endpoints, stop genericusage audit, giữ lịch sử nghiệp vụ. Test rollback/race/keymissing/revocation.
6. ReactUI account/history và userwizard; tích hợp form short, errors409/422/503 dễ hiểu.
7. EmployeeDirectory/drawer/files/archive, role/sensitive permissions và export.
8. Friendlysettings, reminderpolicy được duyệt; loại rawUUID/enum khỏi presentation.
9. Unit/API/E2E và nativePostgreSQL17/WindowsLAN. Chỉ sau khi đạt mới triển khai môi trường thật theo quy trình của người dùng.

## Tiêu chí hoàn thành
- UI giống trải nghiệm prototype nhưng backend là nguồn quyền duy nhất.
- Không nhân bản employee hoặc task khi thêm role.
- Không mất passwordversion, không lưu plaintext, không ghi usageaudit mới.
- Không lộ dữ liệu staffB cho staffA qua GET/download/export/API dù URL biết trước.
- Không reset admin, không tạo mật khẩu mặc định, không bật policy chưa chốt.
- Báo cáo bàn giao gồm file đã đổi, migration/backfill, test đã chạy, test chưa chạy và câu hỏi còn thiếu.

## Prompt có thể gửi Codex
> Hãy triển khai nâng cấp repository supernetec01/task theo gói này. Đọc README, spec01–04 và ACCEPTANCE.csv trước khi sửa. HTML chỉ là prototype tham khảo, không phải backend hoặc cơ chế quyền. Giữ dữ liệu hiện hữu và các lịch sử nghiệp vụ; ngừng nhật ký sử dụng chung theo yêu cầu mới. Tạo branch riêng, migration mới, sửa account/passwordhistory/employee/userpermissions/settings theo CODEX_PLAN. Không tự quyết Q01/Q02/Q04; làm các phần độc lập trước. Chạy tests với database_test riêng, không dùng production vì testcore cóTRUNCATE. Không reset admin hoặc ghi mật khẩu vào source/log/DBplaintext. Bàn giao diff, migrationguide, testresults và những phần còn chờ thông tin.
