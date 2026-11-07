# Database, API và migration

Đây là thiết kế đề xuất để Codex triển khai trong repository hiện hữu. Không phải migration đã chạy, không được lấy schema mới tạo database rồi bỏ dữ liệu cũ. Tên route mới có thể điều chỉnh theo quy ước dự án, nhưng hợp đồng quyền và hành vi phải giữ.

## 1. Những bảng đang có
Source commit `559c9ab5045397c82ada28d81b2f34c35b5a251e`:
- `platform_accounts(id,label,platform,login,company,version,created_at)`.
- `account_grants(account_id,user_id,role,valid_to,revoked_at)`; unique theo account/user/role.
- `credential_versions(id,account_id,ciphertext,actor_id,note,created_at)`, có trigger bất biến.
- `employee_profiles(id,created_by,user_id,candidate_id,name,birthday,recruiter_id,employment_state,probation_start,official_start,contract_date,sensitive_cipher,version)`.
- `employment_events`, `users`, `grants`, `teams`, `audit`, `assets` và lịch sử nghiệp vụ khác.

## 2. Thay đổi schema đề xuất
| Bảng / cột | Kiểu / ràng buộc | Mục đích |
|---|---|---|
| `platforms` | UUID PK; `code` unique; `name`; `normalized_name` unique; enabled; sort_order; version; timestamps | Danh mục có thể thêm/đổi tên; không đổi ID khi đổi nhãn |
| `platform_accounts.platform_id` | FK platforms; nullable giai đoạn backfill | Thay việc nhập platform tự do |
| `platform_accounts.note` | text, max1000 phía API | Ghi chú chung |
| `platform_accounts.current_credential_version_id` | FK credential_versions | Chọn current rõ ràng, không phụ thuộc timestamp có thể trùng |
| `platform_accounts.updated_at` | timestamptz | Sắp xếp và hiển thị |
| `platform_accounts.sharing_version` | int >0 | Optimistic locking cho thay đổi người xem |
| `credential_versions.previous_version_id` | nullable FK cùng account | Xem old/new theo một chuỗi không bị gán nhầm |
| `credential_versions.revision` | int; unique(account_id,revision) | Phiên bản có thứ tự ổn định |
| `credential_versions.metadata_snapshot` | JSONB whitelist | Tên nền tảng, tên tài khoản và login tại lúc cập nhật; không chứa plaintext password |
| `credential_versions.key_id` | nullable cho legacy | Nhận biết khóa mã hóa khi có chính sách rotation; không chứa khóa |
| `employee_profiles.employee_code` | text, unique không phân biệt hoa/thường | Mã nhân sự giữ số0 đầu |
| `employee_profiles.joined_on` | date | Ngày vào làm |
| `employee_profiles.team_id` | FK teams | Bộ phận |
| `employee_profiles.manager_id` | FK users | Người quản lý đủ quyền, không phải chính mình |
| `employee_profiles.employment_type` | enum/check có catalog | Toàn thời gian/bán thời gian/thực tập/cộng tác; không trộn với chuyên môn |
| `employee_profiles.probation_end`, `contract_end`, `left_on` | date nullable | Các mốc công việc |
| `employee_profiles.contact` | JSONB whitelist | Điện thoại, email, địa chỉ, liên hệ khẩn cấp; không nhận JSON tùy ý |
| `employee_profiles.archived_at` | timestamptz nullable | Lưu trữ người nghỉ việc |
| `employee_positions` | id; employee_id FK; position_code; effective_from; effective_to; unique/constraint chống trùng khoảng vô lý | Một hồ sơ có nhiều vị trí, giữ lịch sử |
| `employee_documents` | id; employee_id FK; document_kind; asset_id FK; classification; metadata | Liên kết tài liệu riêng theo nhân sự, không chia sẻ qua task |

Không thêm readable password vào `users`. Giữ `password_hash` Argon2 như source hiện tại. Không chuyển toàn bộ tài liệu/CCCD/BHXH vào JSON response thường.

### Quyền tài khoản nền tảng
Chưa chốt Q01/Q02. Đề xuất giữ account-level sharing, dùng danh sách người xem trên UI và vẫn giữ các ràng buộc role còn hiệu lực ở server. Nếu một người có nhiều role, UI không cần tạo nhiều hàng trùng tên. Backend có thể tổng hợp nhiều account_grants thành một người.

Không xóa cột role hoặc tự đổi sang user-only grants trước khi xác nhận chính sách khi role hết hạn. Nếu thay mô hình, migration phải lưu lại role ràng buộc cũ, giới hạn hiệu lực và người cấp. Một user mất role A không được giữ quyền của A chỉ vì còn role B không liên quan.

## 3. API đề xuất
Base `/api/v1`. Tất cả request phải dùng session, CSRF đối với mutation và idempotency key theo cơ chế hiện tại. Response DTO có whitelist. Không đưa password vào querystring. Không dùng actor do client gửi.

### Nền tảng
- `GET /platforms`: `{items:[{id,name,enabled,version,sort_order}]}`; staff chỉ nhận danh mục cần cho tài khoản được xem; Admin nhận toàn bộ.
- `POST /platforms`: Admin; `{name}`. Trim, giới hạn80 ký tự, chống trùng case-insensitive. Server sinh code/ID.
- `PATCH /platforms/:id`: Admin; `{name,enabled,sort_order,expected_version}`. Disable không làm mất khả năng xem tài khoản cũ được chia sẻ; cấm chọn khi tạo mới.

### Danh sách tài khoản
- `GET /platform-accounts?platform_id=&search=&sort=&cursor=&limit=`.
- Response `{items:[{id,label,platform:{id,name},login,note,version,updated_at,capabilities,viewer_summary?}],next_cursor,total?}`.
- `capabilities` gồm `can_view`, `can_update_password`, `can_edit_metadata`, `can_manage_viewers`, `can_view_history`. Chỉ Admin có viewer_summary. Không có ciphertext, secret hoặc các version cũ.
- `GET /platform-accounts/:id` kiểm quyền như list. Metadata không được lộ bằng cách đoán UUID.

### Tạo và sửa tài khoản
- `POST /platform-accounts`: Admin; `{platform_id,label,login,secret,note,viewer_ids[],legal_entity_id?}`. Transaction tạo metadata, credential đầu và sharing. Trả `{id,version,sharing_version}`, không trả secret.
- `PATCH /platform-accounts/:id`: Admin; `{platform_id,label,login,note,expected_version}`. Không tự cập nhật secret.
- `PUT /platform-accounts/:id/viewers`: Admin; `{viewer_ids[],expected_sharing_version}`. Validate mỗi user đang hoạt động, scope cấp phù hợp, danh sách không lặp. Bổ sung/revoke đúng transaction. Response metadata mới và danh sách người xem có tên.
- Nếu còn dùng source endpoint `/platform-accounts/:id/grants`: UI batch không gọi nhiều request rời rồi báo thành công khi chỉ một phần lưu được. Viết batch transaction ở server.

### Xem mật khẩu hiện tại
- Giữ hoặc nâng cấp `POST /platform-accounts/:id/reveal`. Mọi người có quyền tài khoản được xem current. Response `{secret,credential_version_id,account_version}` với `Cache-Control:no-store`.
- Chỉ decrypt version hiện tại, không cho staff truyền arbitrary version_id vào endpoint này để đọc bản cũ.
- Xem/copy không tạo dòng lịch sử mật khẩu hoặc audit sử dụng chung.

### Cập nhật mật khẩu
- Giữ `/platform-accounts/:id/versions`, bỏ bắt buộc `external_changed_confirmed` khỏi contract UI mới. Body `{secret,note?,expected_version}`.
- Quyền: Admin hoặc staff được cấp xem tài khoản, user/role/grant còn hiệu lực.
- Transaction: `SELECT account FOR UPDATE` → kiểm expected_version → đọc current → so sánh secret chính xác → encrypt → insert version với previous pointer/revision/actor/server timestamp → cập nhật current pointer/account version → commit.
- Cùng password: trả200 `{changed:false,account_version}`; không insert. Lỗi validation422; mất quyền403/404; conflict409; thiếu key503 `CREDENTIAL_STORAGE_UNAVAILABLE`.
- Secret không bị trim làm thay đổi nội dung. Có thể chặn toàn khoảng trắng theo validation nhưng không tự thay chuỗi người dùng gửi. Không áp min11 của website lên mật khẩu nền tảng.

### Lịch sử
- `GET /credential-history?platform_id=&account_id=&actor_id=&from=&to=&cursor=&limit=`: Admin. Chỉ credential_versions metadata, không generic audit.
- `GET /credential-history/:id`: Admin; `{id,revision,account_snapshot,actor:{id,name},created_at,note,has_previous}`. Chưa có secret.
- `POST /credential-history/:id/reveal`: Admin; `{which:"before"|"after"}`; kiểm version trước cùng account, decrypt đúng phiên bản, response no-store. Không audit reveal theo yêu cầu ngừng nhật ký hành vi.
- Lịch sử không có API sửa/xóa từ UI. Không trả ciphertext trực tiếp ra client.

### Nhân sự
- Nâng cấp `GET /employees?status=active|archived&search=&team_id=&position=&phase=&type=&cursor=`. Scope là HR/Admin/manager được cấp hợp lệ; không mặc định mở toàn công ty chỉ vì frontend có menu.
- `GET /employees/:id`: thông tin cơ bản/công việc/document metadata đã kiểm scope; không sensitive_cipher.
- `POST /employees`: `{employee_code,name,joined_on,positions[],team_id?,manager_id?,phase,employment_type,contact?,user_id?}`. Không candidate_id hoặc recruiter_id trong form mới.
- `PATCH /employees/:id`: whitelist tương tự +expected_version; kiểm code unique, dates, manager eligibility, user link unique và positions không trùng.
- Sensitive API giữ riêng, giống source `/employees/:id/sensitive`, chỉ quyền HR_SENSITIVE/Admin phù hợp scope. Không suy ra từ JOB HR là đủ.
- `POST /employees/:id/leave`: `{left_on,reason?,expected_version,handover?}`; xử lý lifecycle/session/grants/file access atomically hoặc qua outbox tin cậy, không tuyên bố đã khóa tài khoản trước khi thực hiện.
- Tài liệu dùng assets kiểm employee access riêng. Cần migration hỗ trợ employee_id vì source assets hiện chỉ task_id/record_id; không gắn file nhân sự vào task giả để lách CHECK.
- `POST /employees/exports` tạo bản export theo filter và quyền; `GET /...export...` kiểm quyền lại lúc tải. XLSX thật; chỉ field được phép, chống công thức độc hại từ text.

### User và multi-role
- `POST /users` mở rộng body `{username,name,password,email?,employee_id?,team_id?,manager_id?,reviewer_id?,job_grants:[{role,valid_from?,valid_to?}],access_grant:{role,scope,team_id?,valid_from?,valid_to?}}`.
- Server transaction tạo user, hash password, nhiều grants, link employee hiện hữu nếu có. Link không được đổi sang employee khác sau khi đã có liên kết mà không có quy trình hợp lệ.
- Update quyền có `expected_permission_version`, trả snapshot mới. Tách danh sách muốn thêm và revoke, không replace bằng delete toàn bộ. Chặn tổ hợp Admin/SELF, JOB/ALL, reviewer không đủ scope trước khi commit.
- Các điều kiện active/grant expiry kiểm từ server clock. Vô hiệu hóa account phải invalidate session, không chờ frontend poll60s.

### Thiết lập
- `GET /settings/credential-storage-status`: Admin; `{configured:boolean,state:"ready"|"missing_key"|"decrypt_unavailable"}`. Không key, ciphertext hoặc errorstack.
- Lịch làm việc/calendar/policies dùng endpoint hiện có nhưng form tiếng Việt; các cờ chưa chốt không tự đặttrue.
- Không thêm textbox nhập khóa mã hóa trong prototype hay production.

## 4. Bảo mật, log và lịch sử
`server/base.ts` hiện dùng VAULT_KEY hex32byte và mã hóa. Giữ khóa ngoài DB/source, ổn định giữa các lần chạy, backup cùng kế hoạch phục hồi nhưng tách nơi truy cập. Không tạo random key mới mỗi lần start. Missing/invalid key chặn lưu/reveal an toàn, không downgrade plaintext. Kiểm sai key là trạng thái khác thiếu key; UI hướng dẫn phục hồi đúng, không tự ghi đè.

Phân biệt:
1. Lịch sử password: dữ liệu nghiệp vụ đã yêu cầu, immutable và mã hóa.
2. Task/review/report/employment/request revisions: cần để công việc vận hành, vẫn giữ.
3. Generic usage audit: ngừng các insert phục vụ theo dõi thao tác phần mềm theo yêu cầu mới. Kiểm mọi call `audit()` ở app/modules/worker/cli, không chỉ routeGET.
4. Session và idempotency: giữ để xác thực và chống lặp; không đưa vào trang lịch sử.
5. Error logs tối thiểu: mã lỗi/requestid/thông tin vận hành cần thiết, không requestbody/secret/cookie/sensitive fields. Nếu người dùng muốn tắt cả log lỗi vận hành, ghi thành quyết định cần chốt; không tự bật theo dõi hành vi dưới tên khác.

Không xóa audit table cũ hoặc bỏ immutable triggers để purge. Chưa có chỉ thị xóa dữ liệu lịch sử cũ. Chuẩn bị migration/cấu hình ngừng ghi mới, endpoint retirement, kiểm báo cáo/tests không phụ thuộc generic audit. Các operation cần metadata nghiệp vụ phải dùng bảng nghiệp vụ tương ứng.

## 5. Migration không mất dữ liệu
1. Backup DB + files + kế hoạch key trước thay đổi; DB kiểm thử riêng hậu tố_test. Không chạy core tests với DB công ty vì cóTRUNCATE.
2. Thêm migration005 hoặc số mới sau latest trên main; không sửa001–004.
3. Backfill platforms từ distinct platform cũ; trim/normalize có preview, không tự merge nhầm shop/pháp nhân.
4. Credential revision/previous pointer: order by created_at,id ổn định; current bản cuối. Giữ actor IDs, FK và ciphertext cũ; null actor hiển thị đã lưu trữ nếu cần chứ không giả tên người mới.
5. Employee code: xuất danh sách hồ sơ chưa có code/duplicateuserlink để HR gán hoặc xác nhận mapping. Không chế mãSN giả cho dữ liệu thật. Có giai đoạn nullable cho legacy, bắt buộc khi tạo mới.
6. CANDIDATE cũ không tự chuyển thành nhân viên đang làm; giữ archive/legacy, tách khỏi danh sáchactive. Không backfill joined_on bằng created_at nếu thiếu bằng chứng.
7. Giữ account_grants cũ, không làm rộng quyền trong migration. Mọi chuyển đổi mô hình cần test trước/sau cùng tập người có quyền.
8. Triển khai server tương thích rồi UI; khi cắt endpoint cũ có thông báo/reload hợp lệ. Rollback code không drop dữ liệu mới; không rollback bằng xóa lịch sử.
