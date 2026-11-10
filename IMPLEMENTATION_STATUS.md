# SuperNet HANDOFF-1.0 — Implementation status

Baseline: `217671e39b85221f5653e24c86640400ede074db`; branch `upgrade/5-role-20261110`.

## Migration risks before implementation

- Existing DONE tasks require approved submissions (migration 003). Preserve the composite submission FK and legacy check; add conditional CHECKLIST constraints atomically.
- Preserve IDs, password hashes, credential/HR ciphertext, task/template/report snapshots. Compare fingerprints on a backed-up test database before/after migration.
- Preserve unmapped MANAGER/ADS/WAREHOUSE/EXECUTIVE grants and BOSS TEAM scope; require Admin classification. Do not promote them.
- Legacy source company/shop strings and incomplete content links require explicit mapping. Never infer source ownership.
- Existing salary amounts without effective dates remain legacy; do not manufacture dates.
- Only isolated *_test databases may be reset by tests. Production migrations/deployment are outside this task.

## Baseline inspection

React/TypeScript + Fastify + PostgreSQL 17, ExcelJS, private files, Argon2 sessions/CSRF, idempotency and optimistic versions. API and worker start separately. Existing checkout is clean; no AGENTS.md found. Prior baseline validation: build, 72 tests, 28 browser cases passed; these are baseline evidence, not acceptance of this upgrade.

## Sequence and dependencies

P0 inventory/fingerprint/restore → P1 role bundles/resources → P2 checklist/filter/sort → P3 source adapters/facts → P4 content/publications → P5 HR → P6 report v2/notifications → P7 UI/regression/delivery.

G01/G05: missing D7 GMV/settled commission/return source remain N/A / SOURCE_REQUIRED. G02–G04: require upload-specific confirmation of period, video dates, company and shop/channel. They do not block independent implementation.

## Acceptance tracking

NOT_EXECUTED means no acceptance claim. PASS requires actual command/browser evidence, not inspection alone.

| ID | Requirement | Baseline / status | Planned modules | Validation / dependency |
|---|---|---|---|---|
| AUTH01 | D01,D03 — Đăng nhập 5 ROLE; gọi cả URL/API ngoài menu | NOT_EXECUTED; baseline needs gap review | server/base.ts, capabilities.ts, user-access.ts; web/admin.tsx | Menu đúng và API403/404; không lộ dữ liệu; integration+browser |
| AUTH02 | D04 — HR giả request cấp ADMIN/BOSS, hoặc sửa targetAdmin | NOT_EXECUTED; baseline needs gap review | server/base.ts, capabilities.ts, user-access.ts; web/admin.tsx | 403 trước mọi insert/grant; integration+browser |
| AUTH03 | D01 — Một user HR+Content, revokeHR | NOT_EXECUTED; baseline needs gap review | server/base.ts, capabilities.ts, user-access.ts; web/admin.tsx | Content còn; HRDTO/notification/download bị chặn ngay; integration+browser |
| AUTH04 | D03 — Sếp đọc taskall, giao task; mở draft/payroll | NOT_EXECUTED; baseline needs gap review | server/base.ts, capabilities.ts, user-access.ts; web/admin.tsx | Taskall/giao được; draft/payroll denied; integration+browser |
| AUTH05 | D12 — Sàn đúng ROLE nhưng không resourcegrant | NOT_EXECUTED; baseline needs gap review | server/base.ts, capabilities.ts, user-access.ts; web/admin.tsx | Không import/readshop; Admin cấp cụ thể mới được; integration+browser |
| AUTH06 | D02 — ResetpasswordAdmin, kiểmlog/DB/idempotency | NOT_EXECUTED; baseline needs gap review | server/base.ts, capabilities.ts, user-access.ts; web/admin.tsx | HashArgon 2 id, session cũ thu hồi; không plaintext/cache; integration+browser |
| TASK01 | E02 — Nhân viên tự tạo và Sếp giao | NOT_EXECUTED; baseline needs gap review | server/tasks.ts; migrations; web/tasks.tsx | CHECKLIST WAITING, không reviewer/assignment/timeout; integration+browser |
| TASK02 | D05 — WAITING→DONE có summary; thiếu summary | NOT_EXECUTED; baseline needs gap review | server/tasks.ts; migrations; web/tasks.tsx | Có summary thành công; thiếu 422,DB không DONE; integration+browser |
| TASK03 | D05 — Hủy thiếu/trắnglýdo, sau đó hủy hợp lệ | NOT_EXECUTED; baseline needs gap review | server/tasks.ts; migrations; web/tasks.tsx | Bắt buộc lý do; state+event+actor+time cùngtx; integration+browser |
| TASK04 | E04 — Sếp sửa deadline trực tiếp; Admin sửa có reason | NOT_EXECUTED; baseline needs gap review | server/tasks.ts; migrations; web/tasks.tsx | Sếp 403; Adminversion+history, report cũ không đổi; integration+browser |
| TASK05 | E04 — Owner mở lại DONE; Admin mở lại | NOT_EXECUTED; baseline needs gap review | server/tasks.ts; migrations; web/tasks.tsx | Owner 403; Admin event mới, không xóa completion cũ; integration+browser |
| TASK06 | E03 — Hai writer cùng version, retry cùng key | NOT_EXECUTED; baseline needs gap review | server/tasks.ts; migrations; web/tasks.tsx | Một 409 giữ form; retry không nhân update/event; integration+browser |
| TASK07 | D05 — LegacyDONE bỏ approved submission bằng SQL/API | NOT_EXECUTED; baseline needs gap review | server/tasks.ts; migrations; web/tasks.tsx | Constraint vẫn chặn; checklist DONE không fake submission; integration+browser |
| TASK08 | E05 — LegacySUBMITTED/support sau migrate | NOT_EXECUTED; baseline needs gap review | server/tasks.ts; migrations; web/tasks.tsx | Duyệt/support route cũ hoạt động, flow không đổi nhầm; integration+browser |
| SORT01 | E01 — FixtureA..G anchor 10/11/2026 14 hVN | NOT_EXECUTED; baseline needs gap review | server/tasks.ts; migrations; web/tasks.tsx | ATTENTION=A,B,C,D,E,F; DONE ẩn; integration+browser |
| SORT02 | E01 — Đổi DUE_ASC và lọc DONE | NOT_EXECUTED; baseline needs gap review | server/tasks.ts; migrations; web/tasks.tsx | DUE=B,A,D,C,E,F; DONEchỉG; integration+browser |
| SORT03 | E01 — Due=now, due lúc 00 VN, NEXT7 | NOT_EXECUTED; baseline needs gap review | server/tasks.ts; migrations; web/tasks.tsx | Ranh giới half-open đúng; due=now không overdue; integration+browser |
| SORT04 | E01 — Task tạo tháng 10 còn mở; mặcdịnhOPEN | NOT_EXECUTED; baseline needs gap review | server/tasks.ts; migrations; web/tasks.tsx | Không mất do filter tuần tạo tự động; integration+browser |
| SORT05 | E01 — Owner/team/multistatus/date AND/OR | NOT_EXECUTED; baseline needs gap review | server/tasks.ts; migrations; web/tasks.tsx | ORtrongfield,ANDgiữafield; query scope không vượt quyền; integration+browser |
| SORT06 | E01 — 150 tasks,30 page,đổi filter và cursor | NOT_EXECUTED; baseline needs gap review | server/tasks.ts; migrations; web/tasks.tsx | Totals/facets đúng toàn query; đổi query reset cursor; integration+browser |
| SORT07 | E12 — Save task khi đangedit/sort; hourlyrefresh | NOT_EXECUTED; baseline needs gap review | server/tasks.ts; migrations; web/tasks.tsx | Không mất form/nhảy vị trí; có reload indicator; integration+browser |
| IMP01 | D12 — Đổi tên và thứ tự cột 2 file sales | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | Mapping theoheader vẫn đúng; yêu cầu xác nhận sàn; integration+browser |
| IMP02 | D12 — KOCfile vào sales; missingcolumn | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | Blockingerror đúngsheet/header; nofacts; integration+browser |
| IMP03 | E09 — XLSX hỏng/password/macros/zipbomb/file 25 MiB+ | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | Từ chối có hướng khắc phục; không thực thi code; integration+browser |
| IMP04 | D12 — KOCdescriptionrow 2 và returns XML row lặp | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | Không tính description; grouping địa chỉ ô đủ data; integration+browser |
| IMP05 | E13 — 16.201.794₫,44.0,1.39%,ID dài,0 đầu | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | Decimal/count/ratiođúng; ID kiểu chuỗi; precisionloss chặn; integration+browser |
| IMP06 | E13 — Ngày 31/02;missingyear;date 1904 serial | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | Ngày in valid chặn; noyearguess; serialcorrectorreject; integration+browser |
| IMP07 | D12 — Cùng file 2 lần;byte khác facts như nhau | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | Raw/canonicalduplicate,không nhân facts; integration+browser |
| IMP08 | D13 — Cùng range khác facts;Adminreplace | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | Conflict; Adminreasonrevision mới; cũ bất biến; integration+browser |
| IMP09 | D12 — Partialoverlap hai worker commit đồng thời | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | Serieslock/serializable ngăn 2 nguồn active overlap; integration+browser |
| IMP10 | D12 — Đổi metadata/revokegrant saupreview rồicommit | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | PREVIEW_STALE/ACCESS_CHANGED;nofacts; integration+browser |
| IMP11 | D12 — Một row in valid hoặc failure giữa commit | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | Rollback toàn batch; không partial success; integration+browser |
| IMP12 | G04 — Chưa chọn shop/company,hoặc shop khác company | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | Không preview / commit vượt scope; lỗi đúng trường; integration+browser |
| MET01 | D12 — Tổng 7 ngày mẫu TikTok | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | 67.492.567;930 đơn;100 hủy;4 hoàn tiền; integration+browser |
| MET02 | D12 — Tổng 7 ngày mẫu Shopee | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | 28.040.779;360 đơn;36 hủy;2 hoàn tiền; integration+browser |
| MET03 | E08 — Tính refund rate tuần;nguồn thiếu ngày không đủ tuần | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | SUMcount/SUMorders; coverageincomplete,khôngfill 0; integration+browser |
| MET04 | E10,G02 — Nguồn KOC chưa có kỳ, rồi xác nhận khớp tuần | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | Chưa kỳ không vào báo cáo; tổng 52.399.786; integration+browser |
| MET05 | D12 — Top 10 tỷ trọng vàzeroGMV | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | Denominatorall 1307 rows; zero→N/A; integration+browser |
| MET06 | G05 — Hoa hồng ước tính và thiếu quyết toán | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | 1.678.199 nhãn ước tính; paidcommissionN/A; integration+browser |
| MET07 | E08 — Mẫu 113 line/112 order; allCancel | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | 112 đơn; không gọi đơn trả hàng; no doubleorderamount; integration+browser |
| MET08 | E08 — Cùng order 2 SKU tiền mâu thuẫn | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | ORDER_LEVEL_AMOUNT_CONFLICT, nobatchcommit; integration+browser |
| MET09 | G05 — Raw status không có trongmapping | NOT_EXECUTED; baseline needs gap review | server/metrics.ts, files.ts; web/business.tsx; typed source facts | UNMAPPED_STATUS; không tự classify return; integration+browser |
| CONT01 | D06 — Lưu draft/script;hoàn tất thiếu writer/script | NOT_EXECUTED; baseline needs gap review | typed content service; web/content; publications; source facts | Lưu draftcho phép; complete gates không cho thiếu; integration+browser |
| CONT02 | D06 — Nhảy SCRIPTING→WAITING_EDIT;ngày quay tương lai | NOT_EXECUTED; baseline needs gap review | typed content service; web/content; publications; source facts | Chặn order/date; giữ dữ liệu nháp; integration+browser |
| CONT03 | D06 — Dựng xong clip chưa đăng;2 lượt đăng | NOT_EXECUTED; baseline needs gap review | typed content service; web/content; publications; source facts | 1 clipcompleted,2 publication; không cần link đăng để xong dựng; integration+browser |
| CONT04 | D06 — Externalparticipant, inactiveuser | NOT_EXECUTED; baseline needs gap review | typed content service; web/content; publications; source facts | External name không tạo user; inactive phân công mới bị chặn; integration+browser |
| CONT05 | D06 — Sửa thông tin 2 tab không lưu rồiđóng | NOT_EXECUTED; baseline needs gap review | typed content service; web/content; publications; source facts | Dirtyguard và không mất nháp khi đổi tab; integration+browser |
| VID01 | G01,G03 — 15 videofile hiện có | NOT_EXECUTED; baseline needs gap review | typed content service; web/content; publications; source facts | Snapshotviews/tương tác đúng; GMVD7 N/A; integration+browser |
| VID02 | E06 — D10 snapshot của video đăng cũ;KOC7 dayattribution | NOT_EXECUTED; baseline needs gap review | typed content service; web/content; publications; source facts | Không gắnD7 sau ngày đăng; integration+browser |
| VID03 | E06 — Nguồn window đúng 168 h+publishedprecision | NOT_EXECUTED; baseline needs gap review | typed content service; web/content; publications; source facts | READY chỉ khi nguồn xác minh; NOT_DUE trước end; integration+browser |
| VID04 | E06 — Cùng title khác video ID;videohistoricalunlinked | NOT_EXECUTED; baseline needs gap review | typed content service; web/content; publications; source facts | Khôngmerge theo title; giữ unlinked, không bịa script/owner; integration+browser |
| HR01 | D07 — HR tạo/sửa hồ sơ Admin đã tạo;trùng mã 0 đầu | NOT_EXECUTED; baseline needs gap review | server/employees.ts, worker.ts; typed HR; web/employees.tsx | Xem toàn công ty;duplicate 422/409; ID/hash không đổi; integration+browser |
| HR02 | D07 — Sửa tên OFFICIAL | NOT_EXECUTED; baseline needs gap review | server/employees.ts, worker.ts; typed HR; web/employees.tsx | Không biến phase về PROBATION; integration+browser |
| HR03 | D04 — Createuser+grant+link error giữa | NOT_EXECUTED; baseline needs gap review | server/employees.ts, worker.ts; typed HR; web/employees.tsx | Rollbackall; không orphan user; uniqueprofilelink; integration+browser |
| HR04 | D07 — Một candidate 2 application;retryonboard | NOT_EXECUTED; baseline needs gap review | server/employees.ts, worker.ts; typed HR; web/employees.tsx | 1 person;ứng tuyển riêng;1 employeeperacceptedapp; integration+browser |
| HR05 | D07 — Term tương lai/correction cùng ngày | NOT_EXECUTED; baseline needs gap review | server/employees.ts, worker.ts; typed HR; web/employees.tsx | Current chưa đổi; history cũ còn; cipher không plaintext; integration+browser |
| HR06 | D08 — Sếp/basicDTO/reportexport truy cập amount | NOT_EXECUTED; baseline needs gap review | server/employees.ts, worker.ts; typed HR; web/employees.tsx | Denied/không cột amount; HRsalaryauthorized; integration+browser |
| HR07 | D07 — Signedcontractsupersede,nullableexpiry | NOT_EXECUTED; baseline needs gap review | server/employees.ts, worker.ts; typed HR; web/employees.tsx | Revision cũ giữ;không nhắc expiry cho end null; integration+browser |
| HR08 | E11 — Todayleave+handover và future date | NOT_EXECUTED; baseline needs gap review | server/employees.ts, worker.ts; typed HR; web/employees.tsx | Todaythu hồi đúng user; ngày tương lai dự kiến không tự khóa; integration+browser |
| HR09 | D11 — Tháng 11 và 29/2 năm không nhuận;DOBmissing | NOT_EXECUTED; baseline needs gap review | server/employees.ts, worker.ts; typed HR; web/employees.tsx | Tháng đúng;no missingDOBguess;29/2 policy đúng; integration+browser |
| HR10 | D10,D11 — Workerretry,missedoffset,HRgrantrevoked | NOT_EXECUTED; baseline needs gap review | server/employees.ts, worker.ts; typed HR; web/employees.tsx | Dedupe/catchup 1 lần; currentHRonly; integration+browser |
| RPT01 | D09 — Task tạo tuần trước done tuần này | NOT_EXECUTED; baseline needs gap review | server/reports.ts; web/reports.tsx | completed_in_period có task,không coi là phát sinh mới; integration+browser |
| RPT02 | D13 — Owner/metric/source thay đổi sau submit | NOT_EXECUTED; baseline needs gap review | server/reports.ts; web/reports.tsx | Snapshot và Excel revision cũ giữ nguyên; integration+browser |
| RPT03 | D01 — User 2 ROLE nộp 1 báo cáo | NOT_EXECUTED; baseline needs gap review | server/reports.ts; web/reports.tsx | 1 container với nhiều section; task không nhân; integration+browser |
| RPT04 | G01,G02 — Thiếu KOC period/D7 source khi nộp | NOT_EXECUTED; baseline needs gap review | server/reports.ts; web/reports.tsx | Nộp được phần khác; chỉ số null+availability,warnings; integration+browser |
| RPT05 | D03,D09 — Sếp truy cập nháp,nhận revision mới,lateSubmit | NOT_EXECUTED; baseline needs gap review | server/reports.ts; web/reports.tsx | Nháp denied; revisionnotification;lateflagđúng; integration+browser |
| RPT06 | D13 — Exportrevisionv 1 vàv 2,file ID bắt đầu 0 hoặc= | NOT_EXECUTED; baseline needs gap review | server/reports.ts; web/reports.tsx | Đúng renderer/snapshot; ID kiểu chuỗi,không formula injection; integration+browser |
| ACC01 | D02 — Revokeaccountshare rồireveal/replay | NOT_EXECUTED; baseline needs gap review | server/accounts.ts; web/accounts.tsx | 403/404 ngay; no cachedsecret; integration+browser |
| ACC02 | D02 — Platformpasswordversion;webreset | NOT_EXECUTED; baseline needs gap review | server/accounts.ts; web/accounts.tsx | CredentialhistoryAdminonly;web hash không plaintext; integration+browser |
| MIG01 | D13 — Snapshotfingerprintsbaseline before/after | NOT_EXECUTED; baseline needs gap review | migrations; scripts; delivery docs | ID/hash/cipher/report/task legacy giữ nguyên; integration+browser |
| MIG02 | D01 — UseronlyMANAGER/ADS/WAREHOUSE/EXECUTIVE | NOT_EXECUTED; baseline needs gap review | migrations; scripts; delivery docs | Adminclassificationqueue; noautoprivilege; integration+browser |
| UI01 | D01 — Desktop 1440 và mobile 390,các form lỗi/offline | NOT_EXECUTED; baseline needs gap review | web/main.tsx, style.css; browser tests | Không overflow page;đủ action;giữ nháp/focuserror; integration+browser |
| OPS01 | D13 — RestoreDB+file+key vào đích riêng,health/cổng 3002 | NOT_EXECUTED; baseline needs gap review | migrations; scripts; delivery docs | Có bằng chứng; Windows LAN nếu chưa thử ghi PENDING; integration+browser |

## Delivery validation (10/11/2026)

Implementation is on `upgrade/5-role-20261110`; migrations 008–010 are additive. V2 services extend the original tables/routes; legacy work, content, account sharing, reports and unmapped grants remain accessible through explicitly labeled legacy paths. Approved role bundles and resource grants are enforced by the server.

- Build/typecheck: PASS. No lint script is defined.
- Existing and new server tests: 92 PASS, 0 failed/skipped.
- Full Chromium suite: 44 PASS across desktop/mobile and upgrade projects.
- npm audit: 0 vulnerabilities.
- Baseline restore + migrations 008–010: no original row modified/deleted in the fingerprinted tables. Six specialist bundle grants added.
- Separate DB/file-store restore: eight assets match checksums; vault decrypts with the retained key; health and authenticated task requests succeed.
- MET07: BLOCKED by the original refund-source contradiction (not bypassed).
- OPS01: cloud checks passed; company Windows/LAN verification remains pending.

The initial NOT_EXECUTED table above records the pre-implementation plan, not the final result. Final per-ID status and evidence: `docs/HANDOFF-ACCEPTANCE-20261110.csv` (71 PASS, 2 BLOCKED). Current test fixtures and source mappings are explicitly synthetic and confined to *_test databases. No production migration, deployment, account/password change or push was performed.

## Technical choices

Kept the modular monolith and existing session/CSRF/idempotency/version controls. Added typed extensions instead of replacing the record store. Cursor keys normalize mixed sort directions before signed keyset comparison. Source commits serialize each source series with advisory transaction locks, revalidate preview/permissions, and insert facts atomically. Original files retain checksums; monetary API values are decimal strings. JSON signing/hashing uses canonical key order to remain stable through PostgreSQL jsonb. Manual D7 input requires private evidence and the exact verified 168-hour window.

Known limits: legacy records lacking explicit typed links or salary effective dates remain legacy/unlinked; no fuzzy migration is performed. G01–G05 require real source/metadata at use time; missing values stay N/A. The production bundle emits Vite's size advisory; build succeeds. No claim is made that a new cloud task or a Windows company server has restored this environment.
