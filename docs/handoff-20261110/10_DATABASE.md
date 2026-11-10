# Mô hình dữ liệu đích — mở rộng repo, không thay database

Từ điển máy đọc được nằm `schema/data_dictionary.json`. Bảng KEEP giữ nguyên, EXTEND bổ sung có migration, NEW là bảng phải tạo. SQL tham khảo có guard chặn thực thi nhầm; dev viết migration thật theo catalog và test.

## Nguyên tắc

- Dùng cùng PostgreSQL hiện có, một instance một workspace; company là pháp nhân nghiệp vụ, không phải tenant do client chọn để vượt quyền.
- Tái sử dụng users/grants/tasks/records/assets/reports/metric_batches. Typed extensions cho records dùng cùng ID để giữ liên kết; không tạo hai hệ thống dữ liệu song song.
- Facts V2 (sales/KOC/return/video) là canonical mới. `metrics` cũ chỉ legacy; báo cáo không SUM cả metrics cũ và facts mới cùng nguồn. Legacy mapping vào resource bắt buộc xác nhận, không đoán.
- Money NUMERIC(28,10), API decimalstring; IDs ngoài text. Date-only theoVN; timestamp UTC. Mọi relation khác company cần compositeFK hoặc serviceguard trong transaction.
- Tables lịch sử/facts append-only có trigger immutable_record hiện có. Pointer hiện hành có version/lock và FK cùng container. FK assets qua array phải validate owner/scope; migration thật có thể chuyển join table nếu cần FK vật lý, nhưng semantics không được bỏ.
- Source ranges overlap không chỉ unique exact key: lock series + kiểm overlap trongSERIALIZABLE. Không dùng extension chưa được kiểm tra là đãcó.

## Thay đổi constraint task bắt buộc

Migration 003 hiện có `done_has_approved_submission`: DONE cần approved_submission_id. Nếu chỉ thêm luồng tự xong ở UI sẽ lỗi DB. Phải:

1. Backfill mọi task hiện có `flow_mode=LEGACY_REVIEW` bằng default thêm column; fingerprint các trường cũ không đổi.
2. Mở status constraint cho WAITING và thêm crossconstraint status theo flow.
3. Thay constraint DONE thành hai nhánh: legacy giữ submission đúng task; checklist cần result_text/completed_at/timing, approved_submission_idNULL.
4. Không xóa FK approved_submission_matches_task; không fake submission/review; không sửa snapshotlegacy hoặc kéo cả legacy sangchecklist.
5. Worker assignmenttimeout và routelegacy chỉ áp dụng LEGACY_REVIEW. Endpointchecklist không gọi assign/reviewer logic.

## Index và giao dịch

Tasks: owner/status/due/id; global active due; code search hiện có. HR: lowercodeunique, phase/department/contractexpires. Candidate contact tìm trùng trongscope, không automerge. Content stage/owner/due, stageeventbusinessat, publicationchannel+id. Facts: revision+businessdate/creator/order/publication. Import: checksumcanonical/context. Report: user+period+revision.

Taskwrite lockrow + expectedversion; append events trong cùngtx. HRusergrantlink atomic. Contractcurrentrevision pointer cùngtx với immutable insert. Salaryrow cùng mốc dùng advisory lock. Importlockseries/partition. Reportconsistentcutoff, lockdraft. Notificationoutbox cùngtx với nghiệp vụ, worker idempotent.

## ERD

Các hình SVG tại `diagrams/` là bản xem offline. Mermaid nguồn cùng tên để Codex/reviewer chỉnh. Chia ERD theo miền để đọc rõ; identity+task, sourcefacts, content, HR không gộp thành một hình chằngchịt.

## KEEP · `users / grants / sessions`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `users.id` | uuid | Không | PK giữ nguyên |
| `users.username` | text | Không | Unique case-insensitive, giữ email legacy |
| `users.password_hash` | text | Không | Argon 2 id |
| `users.permission_version` | integer | Không | Tăng khi thay quyền |
| `grants.kind/role/scope` | text | Không | Bundle của 5 ROLE |
| `grants.valid_from/valid_to` | timestamptz | Có | Khoảng [from,to), to nullable |

- Không thêm bảng ROLE làm nguồn quyền song song. Derive UI profile từ grants.
- Không sửa hash/ID để ánh xạ ROLE.

## EXTEND · `tasks`

Không tạo bảng task_v 2 hoặc fake submission để đi vòng constraint.

| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK hiện có |
| `owner_id` | uuid | Không | FK users, owner hiện hành |
| `role` | text | Không | Job code của task, snapshot khi tạo |
| `flow_mode` | text | Không | NEW: LEGACY_REVIEW hoặc CHECKLIST; backfill legacy |
| `status` | text | Không | EXTEND WAITING; check theo flow_mode |
| `priority` | text | Không | NORMAL/URGENT hiện có |
| `due_at` | timestamptz | Không | Hạn bắt buộc checklist |
| `company_id` | uuid | Có | NEW FK companies, optional với task chung |
| `resource_id` | uuid | Có | NEW FK business_resources cùng company |
| `completed_at` | timestamptz | Có | Hoàn thành mới nhất |
| `cancelled_at` | timestamptz | Có | NEW khi hủy |
| `cancel_reason` | text | Có | NEW lý do hủy, null khi chưa hủy |
| `result_text` | text | Không | Kết quả, bắt buộc DONE checklist |
| `approved_submission_id` | uuid | Có | Null checklist; legacy giữ FK |
| `timing` | text | Có | ON_TIME/LATE khi DONE, theo due tại completion |
| `version` | integer | Không | Optimistic concurrency |

- CHECKLIST chỉ WAITING/IN_PROGRESS/DONE/CANCELLED. LEGACY_REVIEW chỉ 9 trạng thái cũ.
- Thay done_has_approved_submission bằng constraint phân nhánh flow_mode.
- CHECKLIST DONE cần completed_at,timing,result_text không rỗng và approved_submission_id IS NULL. Legacy DONE vẫn phải có submission được duyệt.
- CHECKLIST CANCELLED cần cancelled_at và trim(cancel_reason) không rỗng.
- Index (owner_id,flow_mode,status,due_at,id); thêm index due cho active.

## KEEP · `task_events / task_updates / owner_history`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `task_events.id` | bigint | Không | Event sequence ổn định |
| `task_events.data` | jsonb | Không | Bổ sung contract event_v 2: before/after,owner_at_event,job_at_event,due_snapshot,reason |
| `task_events.created_at` | timestamptz | Không | Server event time; business timestamp riêng trong data nếu cần |
| `task_updates.summary` | text | Không | Progress riêng, không biến system event thành chat |
| `owner_history.from_at/to_at` | timestamptz | Có | Khoảng không chồng lấn theo task |

- Immutable task_events/task_updates như repo.
- Task state update và event trong cùng transaction.

## NEW · `companies`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK gen_random_uuid |
| `code` | text | Không | Mã do Admin đặt |
| `name` | text | Không | Tên pháp nhân được xác nhận |
| `active` | boolean | Không | Soft disable |
| `version` | integer | Không | Expected version |
| `created_at` | timestamptz | Không | Server clock |
| `created_by` | uuid | Không | FK users |

- UNIQUE(lower(code)); không dùng text company trong file làm PK.

## NEW · `business_resources`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK |
| `company_id` | uuid | Không | FK companies |
| `platform_id` | uuid | Không | FK platforms hiện có |
| `kind` | text | Không | SHOP/CHANNEL |
| `label` | text | Không | Tên UI |
| `external_id` | text | Có | Mã shop/channel, nullable khi chưa cung cấp |
| `active` | boolean | Không | Cấm import mới khi disabled |
| `version` | integer | Không | Concurrency |
| `created_at` | timestamptz | Không | Server clock |
| `created_by` | uuid | Không | FK users |

- UNIQUE(id,company_id)
- UNIQUE(company_id,platform_id,kind,external_id) khi external_id IS NOT NULL.
- Disabled vẫn cho đọc lịch sử trong quyền.

## NEW · `resource_grants`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK |
| `resource_id` | uuid | Không | FK business_resources |
| `user_id` | uuid | Không | FK users |
| `permission` | text | Không | READ/WRITE; WRITE bao gồm READ |
| `valid_from` | timestamptz | Không | Bắt đầu |
| `valid_to` | timestamptz | Có | Hết hiệu lực |
| `revoked_at` | timestamptz | Có | Thu hồi |
| `granted_by` | uuid | Không | FK users Admin |
| `reason` | text | Không | Lý do không chứa secret |

- valid_to > valid_from nếu có; kiểm quyền hiện tại mỗi request.
- Không có grant chồng lấn cùng user/resource/permission; lock khi cấp.

## EXTEND · `metric_batches`

Typed facts V2 bên dưới là nguồn báo cáo mới; metrics EAV cũ giữ legacy, không dual-write cùng chỉ tiêu vào cả hai rồi SUM.

| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK hiện có |
| `company_id` | uuid | Có | NEW FK companies; legacy null đến khi map |
| `resource_id` | uuid | Có | NEW FK business_resources |
| `adapter_code` | text | Có | NEW 5 loại; legacy null |
| `adapter_version` | integer | Có | NEW bản mapping cố định |
| `period_start/period_end` | date | Có | NEW kỳ inclusive của nguồn |
| `period_basis` | text | Có | NEW DAILY/EXPORT_PERIOD/SNAPSHOT/DATE_CREATED/DATE_CANCELLED |
| `source_context` | jsonb | Không | NEW sheet/header/locale/precision/confirmation refs |
| `canonical_hash` | text | Có | NEW SHA256 normalized facts |
| `status` | text | Không | UPLOADED/INVALID/PREVIEWED/COMMITTED/ABORTED; map legacy hiện có |
| `preview_hash / version` | text / integer | Không | Giữ đồng bộ preview và commit |
| `owner_id / checksum / storage_key` | existing | Không | Uploader provenance và file gốc |

- Unique raw-checksum scoped company+resource+adapter; legacy unique(platform,shop,kind,checksum) phải review để không chặn hai company khác nhau.
- Commit mới cần tất cả metadata V2 đầy đủ. Không backfill guessed resource.

## NEW · `import_errors`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | bigint | Không | PK identity |
| `batch_id` | uuid | Không | FK metric_batches |
| `preview_version` | integer | Không | Phiên kiểm tra |
| `sheet` | text | Có | Tên sheet |
| `row_number` | integer | Có | 1-based |
| `column_name` | text | Có | Header nguồn |
| `code/severity` | text | Không | BLOCKING/WARNING và error code |
| `raw_value_redacted` | text | Có | Giá trị lỗi không có buyerPII/secret |
| `message_vi` | text | Không | Hướng khắc phục |
| `created_at` | timestamptz | Không | Server clock |

- Không lưu địa chỉ/số điện thoại người mua vào errorlog.

## NEW · `import_confirmations`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK |
| `batch_id` | uuid | Không | FK metric_batches |
| `batch_version` | integer | Không | Bind preview |
| `confirmed_metadata` | jsonb | Không | Nguồn/kỳ/năm/giờ/locale do người dùng xác nhận |
| `metadata_hash` | text | Không | SHA256 |
| `actor_id` | uuid | Không | FK users |
| `created_at` | timestamptz | Không | Server clock |

- Append-only; đổi metadata phải tạo confirmation và preview mới.

## NEW · `source_partitions`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK |
| `company_id` | uuid | Không | FK companies |
| `resource_id` | uuid | Không | FK resource cùng company |
| `adapter_code` | text | Không | Adapter |
| `grain` | text | Không | DAY/PERIOD/SNAPSHOT/WINDOW |
| `basis` | text | Không | Cohort/time basis |
| `attribution_key` | text | Không | Định nghĩa nguồn; NONE khi không áp dụng |
| `period_start/period_end` | date | Không | Kỳ inclusive (snapshot cùng ngày) |
| `currency` | text | Không | VND/... |
| `current_revision_id` | uuid | Có | FK composite tới revision cùng partition |
| `version` | integer | Không | Pointer concurrency |

- UNIQUE(company_id,resource_id,adapter_code,grain,basis,attribution_key,period_start,period_end,currency).
- Active period overlap cùngseries phải chặn bằng advisory lock + query trong transaction SERIALIZABLE; exact-range replace được phép.

## NEW · `source_revisions`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK |
| `partition_id` | uuid | Không | FK source_partitions |
| `revision` | integer | Không | Tăng dần |
| `batch_id` | uuid | Không | FK metric_batches |
| `previous_revision_id` | uuid | Có | Cùng partition, nullable lần đầu |
| `canonical_hash` | text | Không | Hash facts |
| `confirmation_id` | uuid | Có | FK import_confirmations nếu cần |
| `reason` | text | Không | Bắt buộc khi thay nguồn |
| `created_at` | timestamptz | Không | Server clock |
| `created_by` | uuid | Không | FK users |

- UNIQUE(partition_id,revision); UNIQUE(partition_id,id); immutable.
- Pointerpartition FK(partition_id,current_revision_id) DEFERRABLE; revision previous FK cùng partition.

## NEW · `sales_daily_facts`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK |
| `source_revision_id` | uuid | Không | FK source_revisions |
| `business_date` | date | Không | Ngày |
| `revenue` | numeric(28,10) | Không | Doanh thu |
| `effective_revenue` | numeric(28,10) | Có | Nguồn riêng |
| `orders` | bigint | Không | Tổng đơn |
| `cancelled_orders` | bigint | Không | Đơn hủy |
| `refunded_orders` | bigint | Không | Đơn hoàn tiền |
| `refund_amount` | numeric(28,10) | Có | Tiền hoàn |
| `cancelled_amount` | numeric(28,10) | Có | Tiền hủy |
| `source_row` | integer | Không | Dòng gốc |

- UNIQUE(source_revision_id,business_date)
- Tất cả count >=0; tiền nguồn hiện có >=0. Không áp dụng refunded+cancelled<=orders vì có thể overlap; warning nếu từng count>orders.
- Fact date nằm trong partition. Immutable.

## NEW · `koc_period_facts`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK |
| `source_revision_id` | uuid | Không | FK revision |
| `creator_key` | text | Không | Handle normalized có quy tắc giữ dấu |
| `creator_name_raw` | text | Không | Tên gốc |
| `gmv` | numeric(28,10) | Không | GMV nguồn |
| `orders` | bigint | Không | Đơn nguồn |
| `refund_amount` | numeric(28,10) | Không | Hoàn tiền |
| `estimated_commission` | numeric(28,10) | Không | Hoa hồng ước tính |
| `refunded_items` | bigint | Có | Số món hoàn, không phải đơn |
| `source_row` | integer | Không | Dòng nguồn |

- UNIQUE(source_revision_id,creator_key); duplicate creator trong file → error, không tự SUM.
- Không có paid_commission/cancelled_orders nếu chưa có source. Immutable.

## NEW · `return_order_facts`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK |
| `source_revision_id` | uuid | Không | FK revision |
| `order_id` | text | Không | ID text, không numeric |
| `status_raw/type_raw` | text | Không | Giá trị gốc |
| `normalized_type` | text | Không | CANCEL/RETURN_REFUND sau mapping xác minh |
| `order_amount/refund_amount` | numeric(28,10) | Không | Giá trị một lần cấp đơn |
| `created_at_source` | timestamptz | Không | Ngày tạo đơn nguồn |
| `cancelled_at_source` | timestamptz | Có | Có thể null |
| `creator_handle` | text | Có | Nếu có |

- UNIQUE(source_revision_id,order_id); nếu dòng SKU cùng đơn tiền khác nhau thì rejectbatch. Immutable.

## NEW · `return_sku_facts`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK |
| `order_fact_id` | uuid | Không | FK return_order_facts |
| `sku_id/seller_sku` | text | Có | ID nguồn |
| `package_id/variation` | text | Có | Nguồn |
| `quantity/returned_quantity` | numeric(18,4) | Có | Count theo SKU nếu có |
| `source_row` | integer | Không | Dòng gốc |

- UNIQUE(order_fact_id,source_row). Không chứa tiền cấp đơn lặp. Immutable.

## NEW · `content_items`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK đồng thời FK records.id kind CONTENT |
| `owner_id` | uuid | Không | FK users |
| `stage` | text | Không | SCRIPTING/WAITING_SHOOT/WAITING_EDIT/CLIP_READY |
| `writer_id/camera_operator_id/editor_id` | uuid | Có | FK users, nullable khi chưa phân công |
| `script_text` | text | Không | Lời thoại |
| `shoot_location` | text | Có | Địa điểm |
| `scheduled_shoot_at/actual_shot_at/edited_at` | timestamptz | Có | Mốc dự kiến/thực tế |
| `due_at` | timestamptz | Có | Hạn nội dung |
| `script_asset_ids/raw_asset_ids/final_asset_ids` | uuid[] | Có | File private thuộc content; service kiểm FK assets |
| `version` | integer | Không | Optimistic version |

- records giữ title/company và liên kết legacy. Extension là nguồn canonical V2, payloadlegacy chỉ đọc.
- Cùng records.id không có hai contenttypedrow. Không phát sinh bảng taskcopy.

## NEW · `content_participants`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK |
| `content_id` | uuid | Không | FK content_items |
| `participant_role` | text | Không | ACTOR/CAMERA/EDITOR/SUPPORT |
| `user_id` | uuid | Có | Nội bộ |
| `external_name` | text | Có | Ngoài công ty |
| `note` | text | Có | Ghi chú |

- CHECK đúng một user_id hoặc external_name không rỗng.
- Unique(content_id,participant_role,user_id) khi nội bộ; không auto-create user.

## NEW · `content_stage_events`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK |
| `content_id` | uuid | Không | FK content_items |
| `stage_code` | text | Không | SCRIPT/SHOOT/EDIT |
| `kind` | text | Không | COMPLETE/CORRECT/REOPEN |
| `business_at` | timestamptz | Không | Mốc nghiệp vụ |
| `created_at` | timestamptz | Không | Mốc ghi nhận |
| `actor_id/credited_user_id` | uuid | Không | Người thao tác và người được ghi nhận |
| `revision` | integer | Không | Phiên bản logical completion của stage |
| `supersedes_id` | uuid | Có | Event cùng content/stage |
| `snapshot` | jsonb | Không | Phân công, file, trạng thái tại event |
| `reason` | text | Không | Bắt buộc correction/reopen |

- UNIQUE(content_id,stage_code,revision); immutable; validate supersedes samecontent/stage.

## NEW · `publications`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK/FK records.id kind PUBLICATION |
| `content_id` | uuid | Không | FK content_items |
| `channel_id` | uuid | Không | FK business_resources.kind CHANNEL |
| `platform_video_id` | text | Có | Nếu trích được |
| `original_url/canonical_url` | text | Không | URL gốc và chuẩn hóa |
| `published_at` | timestamptz | Có | Có thể null khi nguồn chưa đầy đủ |
| `published_precision` | text | Không | SECOND/MINUTE/DATE/UNKNOWN |
| `publisher_id` | uuid | Không | FK users |
| `version` | integer | Không | Concurrency |

- UNIQUE(channel_id,canonical_url); UNIQUE(channel_id,platform_video_id) khi ID có.
- D7 cần precision ít nhất MINUTE và published_at được xác nhận.

## NEW · `video_snapshots`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK |
| `publication_id` | uuid | Không | FK publications |
| `source_revision_id` | uuid | Không | FK source_revisions |
| `collected_at` | timestamptz | Có | Nullable khi chỉ có rawdate |
| `collected_precision` | text | Không | MINUTE/DATE/UNKNOWN |
| `published_raw/collected_raw` | text | Không | Ngày nguyên văn |
| `views/likes/comments/shares` | bigint | Không | Nguồn không âm |
| `date_confirmation_id` | uuid | Có | Xác nhận ngày nếu có |
| `source_row` | integer | Không | Dòng gốc |

- UNIQUE(publication_id,source_revision_id); immutable. Unknownpublicationmatching phải userlink, không theo title.

## NEW · `video_window_facts`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK |
| `publication_id` | uuid | Không | FK publications |
| `source_revision_id` | uuid | Không | FK source |
| `window_start/window_end` | timestamptz | Không | Cửa sổ half-open thật |
| `metric` | text | Không | GMV/VIEWS/LIKES/COMMENTS/SHARES |
| `value` | numeric(28,10) | Có | Null nếu thiếu, có reason |
| `missing_reason` | text | Có | Lý do thiếu |
| `attribution_key` | text | Không | Định nghĩa của nguồn |
| `currency` | text | Không | Cho GMV; NONEcho counts |
| `window_verified` | boolean | Không | Không true nếu chỉ nhập nhãn D7 |

- window_end>window_start; value OR missing_reason; unique(publication,source_revision,window,metric,attribution).
- D7 gate kiểm cửa sổ 168 h exact và provenance, không chỉ window_verified của client. Immutable.

## NEW · `candidate_profiles`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK/FK records.id kind CANDIDATE |
| `birthday` | date | Có | Tùy cung cấp |
| `contact` | jsonb | Không | Phone/email HR-only |
| `version` | integer | Không | Concurrency |

- Tên ở records.title; CVasset record_id=candidateid. Không duplicate person.

## NEW · `job_applications`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK/FK records.id kind APPLICATION |
| `candidate_id` | uuid | Không | FK candidate_profiles |
| `position_code` | text | Không | MARKETPLACE/HR/CONTENT |
| `received_on` | date | Không | Ngày nhận |
| `recruiter_id` | uuid | Không | FKusers |
| `stage` | text | Không | NEW/INTERVIEW/EVALUATING/OFFER/HIRED/REJECTED |
| `source/next_action` | text | Không | Nguồn và bước tới |
| `version` | integer | Không | Concurrency |

- UNIQUE(id,candidate_id); nhiều application cùng candidate được phép.

## NEW · `interview_sessions`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK/FK records.id kind INTERVIEW |
| `application_id` | uuid | Không | FK job_applications |
| `starts_at/ends_at` | timestamptz | Không | Bắt đầu/kếtthúc |
| `location` | text | Không | Địa điểm/link họp |
| `outcome/notes` | text | Không | Nhậnxét HR-only |
| `version` | integer | Không | Concurrency |

- ends_at>starts_at; người phỏng vấn ở bảng interview_users.

## NEW · `interview_users`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `interview_id` | uuid | Không | FK interview_sessions |
| `user_id` | uuid | Không | FK users |

- PK(interview_id,user_id).

## NEW · `candidate_employee_links`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `application_id` | uuid | Không | PK/FK job_applications |
| `candidate_id` | uuid | Không | FK candidate_profiles |
| `employee_id` | uuid | Không | Unique FK employee_profiles |
| `accepted_at` | timestamptz | Không | Mốc nhận việc |
| `created_by` | uuid | Không | Actor HR/Admin |

- CompositeFK(application_id,candidate_id)→job_applications(id,candidate_id).
- Retry tạo cùng link trả existing employee; không 2 profile.

## NEW · `employee_contracts`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK |
| `employee_id` | uuid | Không | FK employee_profiles |
| `current_revision_id` | uuid | Có | Pointer samecontract |
| `supersedes_contract_id` | uuid | Có | Hợp đồng trước cùng employee |
| `version` | integer | Không | Concurrency |
| `created_at` | timestamptz | Không | Server clock |
| `created_by` | uuid | Không | FK users |

- UNIQUE(employee_id,id); previous compositeFK cùng employee; khôngtựtrỏ.

## NEW · `employee_contract_revisions`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK |
| `contract_id` | uuid | Không | FK employee_contracts |
| `revision` | integer | Không | Phiên bản |
| `number/kind/status` | text | Không | Số; PROBATION/OFFICIAL/EXTENSION/ADDENDUM; DRAFT/SIGNED/ACTIVE/EXPIRED/SUPERSEDED |
| `signed_on/effective_from` | date | Không | Mốc |
| `expires_on` | date | Có | Null không xác định thời hạn |
| `asset_ids` | uuid[] | Không | File phải thuộc employee |
| `reason` | text | Không | Lýdo bản mới |
| `created_at` | timestamptz | Không | Server clock |
| `created_by` | uuid | Không | FK users |

- UNIQUE(contract_id,revision); UNIQUE(contract_id,id); expires_on>=effective_from nếu có; immutable.
- contract current pointer FK(id,current_revision_id)→revisions(contract_id,id) DEFERRABLE.

## NEW · `employee_salary_terms`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | uuid | Không | PK |
| `employee_id` | uuid | Không | FK employee_profiles |
| `phase` | text | Không | PROBATION/OFFICIAL |
| `effective_from` | date | Không | Ngày hiệu lực |
| `revision` | integer | Không | Cùng mốc correction |
| `currency` | text | Không | VND/... |
| `encrypted_payload` | text | Không | AES-GCM JSON{amount decimalstring,gross_or_net,basis,note,reason} |
| `supersedes_id` | uuid | Có | Term trước cùng employee+phase+date, null lần đầu |
| `change_reason_code` | text | Không | Không chứa amount hoặcPII |
| `created_at` | timestamptz | Không | Server clock |
| `created_by` | uuid | Không | FK users |

- UNIQUE(employee_id,phase,effective_from,revision); immutable.
- revision 1 tạo mốc; correction revision+1 sameemployee/phase/date. Term superseded vẫn đọc được trong quyền.

## KEEP · `report_revisions / reports / report_drafts`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `reports.user_id/period` | uuid / date | Không | Uniquecontainer |
| `report_revisions.snapshot` | jsonb | Không | schema_version=2; taskeventattribution; modulefacts; availabilities |
| `report_revisions.recipients` | uuid[] | Không | Sếp đang có quyền lúcsubmit |
| `snapshot.source_manifest` | jsonb | Không | partition_id/revision_id/batch_hash/event_ids/policy_version |
| `report_drafts.version` | integer | Không | Không đọc nháp của người khác |

- Không UPDATE/DELETE snapshot cũ. Revisionv 1 vẫn đọc bằng rendererlegacy.

## EXTEND · `notifications / outbox / settings`



| Trường | Kiểu | Nullable | Ý nghĩa |
|---|---|---|---|
| `notifications.object_type / event_type / action_path` | text | Có | NEW, legacy nullable |
| `outbox.object_type / event_type / action_path` | text | Có | NEW corresponding payload |
| `settings.policies` | jsonb | Không | Nhắc 7/3,30/7,birthday,week/hạn; settings_history |
| `event_key` | text | Không | Unique(user_id,event_key) giữ repo |

- Không nhét secret/lương/định danh trongnotificationpayload.
- Deep-link phải servervalidate đường dẫn và quyền object; không open redirect.


## Tên cột vật lý và publication lịch sử

Các nhóm `a/b` ở bảng diễn giải là nhiều cột cùng kiểu; data_dictionary.json đã tách thành từng tên vật lý riêng và relationships.json có FK cụ thể. Publication có thêm origin=MANAGED/HISTORICAL_IMPORT; content_id/publisher_id chỉ nullable đối với nguồn lịch sử chưa liên kết. Không tự tạo attribution giả.
