# Mô hình dữ liệu thực thi

`docs/reference/candidate-schema.sql` là thiết kế tham khảo, không chạy vào database ứng dụng. `migrations/001.sql` → `002.sql` → `003.sql` → `004.sql` là migration thực tế, atomic, có bảng `schema_migrations` và advisory lock ngăn hai lần migrate đồng thời.

| Khối | Bảng | Thiết kế áp dụng |
|---|---|---|
| Identity | teams, users, grants, sessions | Tài khoản duy nhất, JOB/ACCESS độc lập; hiệu lực `[from,to)`, grant scope SELF/TEAM/ALL; một workspace mỗi instance |
| Task | tasks, assignments, owner_history, supporters, checkpoints, task_events | Một task ID, nhiều support; partial unique pending assignment; state transitions ở service |
| Submit/review | submissions, reviews, deadline_requests | Bản nộp/review immutable; FK kép approved_submission cùng task; DONE cần bản được duyệt và timing |
| Báo cáo | report_drafts, reports, report_revisions, plans | Draft riêng tư theo role; snapshot JSONB nguyên tử, immutable, source manifest/recipients; so sánh không sửa lịch sử |
| File/vận hành | assets, audit, outbox, notifications, idempotency, settings | Private storage key ngẫu nhiên; checksum/ACL; audit immutable; notification sau commit; key hash request trong transaction |
| Chuyên môn | records, record_links | Typed JSONB cho brief/hồ sơ mềm; module/kind/owner/company/status/role/version là cột; Zod kiểm payload theo registry và tham chiếu theo scope |
| HR | employee_profiles, employment_events | Hồ sơ/terms events, salary/identity ciphertext tách khỏi DTO thường; event unique |
| Nguồn số liệu | metric_batches, metrics, claims, claim_lines | Decimal NUMERIC, canonical key/grain/platform/source/revision; không sửa metric cũ; tổng tiền claim cấp đơn |
| Vault | platform_accounts, account_grants, credential_versions | Grant/hạn + role hiệu lực, encrypted append-only, Admin-only historical reveal |
| Đề nghị | approval_policies, requests, request_revisions, approval_decisions | Policy snapshot và bước/version, revision bất biến; không phải payment ledger/ERP |
| Worker | recurring_rules, generations | Enabled rõ, key rule/day chống trùng, timeout/HR/outbox dedupe |

Không tạo sẵn sổ tài chính/tồn kho giả. Các hồ sơ nghề nghiệp không thay bảng giao dịch tài chính đầy đủ; nếu mở rộng PO/receipt/invoice matching/payment allocation phải bổ sung relational schema/constraints và policy theo tài liệu gốc trước vận hành.

DB production: migration role riêng có quyền DDL; runtime role không superuser/không owner, chỉ CONNECT + USAGE schema + SELECT/INSERT/UPDATE/DELETE trên bảng và USAGE/SELECT sequence. Trigger immutable tiếp tục chặn UPDATE/DELETE lịch sử ngay cả khi runtime được DML. Backup role cần SELECT; quyền tạo DB/restore chỉ dành vận hành. Frontend không kết nối trực tiếp PostgreSQL. RLS đa tenant không dùng vì mỗi instance là một workspace; authorization bản ghi nằm tại API.

Migration 004 bổ sung username duy nhất không phân biệt hoa/thường và email liên hệ tùy chọn. Giữ ID/hash của users cũ, không xóa hay đặt lại mật khẩu. Bootstrap admin có advisory lock, chạy lại không ghi đè tài khoản.
