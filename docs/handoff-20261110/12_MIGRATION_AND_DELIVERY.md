# Kế hoạch sửa repo và giao sản phẩm

## Baseline và nguyên tắc thay đổi

HEAD đã đọc: `217671e39b85221f5653e24c86640400ede074db`. Không clone sourceprototype thành app production độc lập. FileHTML là mẫu review; repo React/Fastify/PostgreSQL vẫn là app cần sửa.

| Vùng repo | Việc phải làm | Phụ thuộc / rủi ro |
|---|---|---|
| server/base.ts, capabilities.ts, user-access.ts | Permission bundles 5 ROLE, resourceACL, HRgrantlimited | Không gộp Sếp=EXECUTIVE; không mất legacy |
| web/main.tsx, admin.tsx, user-access.tsx | Menu 5 ROLE, form cấp user, bộ lọc theoScope | Capabilities từ server; không đưa switch ROLE vào sản phẩm của mockup |
| server/tasks.ts + migrations | CHECKLIST, constraints có flow, sort/filter/cursor, events | Migration 003 DONEconstraint; worker timeout phải bỏ checklist |
| web/tasks.tsx, task-drawer.tsx, ui.tsx | Checklist 4 trạng thái, hủy lý do, filters 04, giữ nháp | Không đưa systemevent vào Trao đổi |
| server/metrics.ts, files.ts | Adapter 5 loại,previewconfirm,typedfacts,revisions | Kiểm raw/canonicalduplicates; không SUM SKU order |
| web/business.tsx | UIchoose source, errors tại dòng, summary/top 10 | Không dựa filename; sourceACL |
| record-config.ts/modules.ts và typedservices mới | HRcandidates/contenttypedextensions | SaveHRlegacy hiện 410; không mở toàn kind tùyý |
| web/employees.tsx, server/employees.ts, employee-history.ts | Contracts/salaryterms/candidateworkflows | Sensitivecipher/history; currentdatephase |
| reports.ts hai phía | Snapshotv 2,eventattribution,coverage,filters Sếp | V1 immutable vẫn đọc; không sửa nguồn lịch sử |
| worker.ts, app.ts/settings | HR mốc 7/3,30/7,birthday,outboxtyped | Dedup+catchup+currentroles |
| web/accounts.tsx, server/accounts.ts | GiữACL/reveal/history; chỉ chỉnh navigation | Không secretcache / webplaintext |

## Thứ tự triển khai

P0: baselineinventory + tests `_test` + backup/restoretest + đọc migrationcatalog. Tạo requirementstatusmap.

P1: nguồn quyền 5 ROLE/resourcecatalog + migrationadditive. Chưa đổi task behavior khi code/constraint chưa đi cùng nhau.

P2: checklist + filters/sort + taskevents + tests quyền/version/cancel. Seedtest synthetic riêng, không seed DB production.

P3: sourceadapters sales/KOC/returns + canonicalfact + preview/commit + metricreports. G01 GMV thiếu vẫnN/A.

P4: contenttypedworkflow + publication + snapshots/D7 gates; chuyển dữ liệu cũ cóprovenance. Không tự tạo kịch bản từ title video.

P5: HRtypedcandidate,contracts,salaryterms,reminders,offboarding. Linkuseratomic và HR restricted grant.

P6: reportv 2 + Sếpreceive/export + provenance + coverage. Snapshot legacy không thay đổi.

P7: UIdesktop/mobile, legacyregression, migrate/restorecomparison, hướng dẫn Windows LAN. Đóng requirementmap.

## Preview migration bắt buộc

- Đếm users/tasks/submissions/reviews/reportrevisions/assets/credentials/employeeprofiles và role grants.
- Hash các cột task cũ, approvedsubmission,templatesnapshot,report.snapshot,credentialcipher,HRcipher. Bytecipher giữ nguyên.
- Danh sách users chỉ ROLE ngoài 5 hoặc BOSSTEAM/MANAGER/EXECUTIVE cần Admin classification, không tự cấp quyền.
- Company/resource legacytext chưa xác nhận: đưaqueue chưa mapping; không đưa vàobáocáoV2 bằngguess.
- Sau migrate so fingerprint; chấp nhận chỉ cột metadata flowmode/default/pointermới theo danh sách. Số liệu và id cũ không đổi.
- Salarylegacy currentvalue: importtermLEGACY_UNKNOWN_EFFECTIVE nếu có căn cứ mã hóa nhưng thiếu date; không bịa effectivefrom từjoined_on. Chưa thành lịch sử lương có ngày cho đến HR xác nhận.
- Dữ liệu Contentlegacy đã có SCRIPT/SHOOT/EDIT/PUBLISH: map bằng explicit IDs/refs, không fuzzy match title. Chưa đủ link thì LEGACY_UNLINKED.

## Nâng cấp và rollback

Giữ Windows/Node 24/PostgreSQL17/cổng 3002, API và worker riêng. BackupDB+DATA_DIRnhấtquán; giữVAULT_KEY cũ riêng. Dừng writer khi deploymigrationcode đồng bộ; chạy migrations bằng migration role. Build/health đúng schema trước bật user.

Rollback additive sauđãcóV2 writes không phải chạy DROP table. Dừng writer, giữexportV2, khôi phục backup và file store vào DB/thư mục riêng đểverify, chấp nhận kếhoạch phục hồi dữ liệu phát sinh với chủhệthống. Không xóa dữ liệu người dùng để testrollback.

## Điều kiện hoàn thành

`npm run build`, unit/integration và browser phù hợp thật trên DB_test; existingregression giữ. QAcaseid có bằng chứng; không coi docsyntaxcheck là product test. WindowsPowerShell,firewall,hai máy LAN và worker được người vận hành kiểm thật; nếu chưa có ghiPENDING_SITE_VERIFICATION, không tuyên bố đạt.
