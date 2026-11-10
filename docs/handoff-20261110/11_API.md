# Hợp đồng API

Base `/api/v1`, session HttpOnly/SameSite của repo, CSRFheader cho mutation. `contracts/api_contract.json` liệt kê endpoint và scope; `contracts/payload_examples.json` có request/response chuẩn. Đây là thiết kế API target, không phải danh sách đã triển khai.

## Quy tắc chung

- Query filter allowlist, tham số hóa SQL; unknown enum hoặc trường payload →422; server không tin scope/actor/company do client khai.
- Mutation có `Idempotency-Key`, fingerprint quyền và body hash. Cùng key/body retry trả cùng kết quả nếu còn quyền; samekeydifferentbody 409. Reveal/password không đưa secret vào cache phản hồi.
- PATCH/action có expected_version hoặc expected_task_version đúng resource; conflict 409 trả codeVERSION_CONFLICT + current_version + không tựmerge. Rolechange invalidates capabilities.
- Decimal JSONstring, IDstring, timestampsISO8601 offset/UTC; date-onlyYYYY-MM-DD. Batch parse giữ ID không làm tròn.
- GET scope denied trả 404 cho object ngoài quyền để không dòID; hành động chưa có quyền 403.401 sessionexpired;422 validation;409 conflict;503 CONFIG_REQUIRED/SOURCE_REQUIRED cho chức năng chưa cấu hình (không giảsuccess).
- List `{items,next_cursor,as_of,filtered_total,facets,query_hash}`. facet/task sort theo 04; mọi endpoint mới có limit≤100.
- Genericerror `{code,message,field_errors:[{path,message}],request_id,retryable}`. Importerror thêmsheet,row,column,action; không echo secret/buyerPII.

## Tasks — request chuẩn

POST `/tasks` thêm `flow_mode=CHECKLIST,job_code,title,owner_id,due_at,description,priority,attachment_ids,resource_id?`. Không bắt reviewer ở flow mới. Trả version+capabilities. Checkliststatus mặc định WAITING. Route cũ vẫn hỗ trợ LEGACY_REVIEW bằng branchservice, không để client đổi flow của task tồn tại.

POST `/tasks/{id}/state` nhận `status=IN_PROGRESS|DONE`, `summary`, `expected_version`. DONE cần summary và server completed_at; không nhận timestamp completion giả từ client. WAITING→DONE được phép nếu đã làm ngoài hệ thống và có kết quả; tạo cả start event nếu started_atnull với nhãn recorded_at_completion, không giả thời lượng đã làm.

POST `/tasks/{id}/cancel` giữ route, phân branch flow mới; `reason,expected_version`. Reopen/transfer/deadlineNEWbranchAdmin-only. PATCH title/descriptionowner/Adminkhiopen, không sửa owner/due bằng routebrief.

## Import — request chuẩn

POST `/imports` multipart file+adapter_code+company_id+resource_id+period_start/end+basis. Trả batch id/version, chưa facts.

POST `/imports/{id}/preview` `{expected_version,sheet,header_row,adapter_version,source_context,confirmations}`. Server tạo rows/errors/coverage + previewtoken; client không tự gửi canonicalfacts để commit.

POST `/imports/{id}/commit` `{expected_version,preview_token,conflict_mode:REJECT|REPLACE,reason?}`. REPLACE chỉ Admin, exactpartition hoặc coveragepolicy explicit. Servercanonicalhash vàlockseries. Trả new source_revision và summary chỉ sau commit; revision cũ giữ nguyên.

## HR và nội dung

Typed routes `/candidates`, `/applications`, `/interviews`, `/content-items`, `/publications` tạo recordcontainer+typedextension cùngtx, không mở chung `/records` để user chọn kind bất kỳ. Salarytermamount gửi trong payload hiện tại quaHTTPS/LANtrusted, servercipher trước write; không list whole payroll trongbasicdto.

Contractbody gồm signed_on,effective_from,expires_on|null,kind,number,status,asset_ids,supersedes_contract_id. Correction tạo currentrevision mới với expectedcontainer version; không PATCH history row.

## Report snapshot contract v 2

`{schema_version:2,user_id,period,start,end,cutoff,policy_version,roles,summary,task_sections,professional_sections,narratives,recipients,source_manifest,availability,submitted_late}`. Khôngnhét originalfile raw hoặc sensitivedata. SourceavailabilityenumAVAILABLE/INCOMPLETE/MISSING_SOURCE/UNCONFIRMED_PERIOD/LEGACY_UNVERIFIED. Decimalstrings trongsnapshot.

GETrevision/XLSX sử dụng cùng scope, schema_version=1 renderlegacy. Thayroles chỉ lọc view hiện tại theopolicy, không sửa rawsnapshotstored.
