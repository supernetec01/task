# Content Marketing — hồ sơ xuyên suốt và dữ liệu theo bước

## Trạng thái sản xuất

SCRIPTING → WAITING_SHOOT → WAITING_EDIT → CLIP_READY. PUBLISHED thuộc **publication**, không ghi đè CLIP_READY. Nội dung đã từng đăng vẫn có thể có lượt đăng tiếp theo. Stage correction chỉ Admin, reason và event mới; không xóa event cũ.

| Bước | Nháp | Điều kiện đánh dấu hoàn tất |
|---|---|---|
| Kịch bản | title,brief,writer; lời thoại có thể chưa đủ | lời thoại hoặc tài liệu kịch bản + writer_id + completed_atserver |
| Quay | ngày/địa điểm dự kiến, nhiều participant, cameraman | actual_shot_at,location,camera_operator; >=1 participant hoặc note no_actor; file/link raw; shot_at không tương lai |
| Dựng | editor,deadline,editnotes | editor_id + file/link final + edited_at; không trước actual_shot_at, không tương lai |
| Đăng | chọn content,platform,channel | contentCLIP_READY; URLhttp/https đúng platform nếu xác minh được; published_at đầy đủ, không tương lai; channelresourcegrant |

Người ngoài công ty: participant `source=EXTERNAL,name,role`, không tạo tài khoản hoặc tự cấp ROLE. Người trong công ty dùng user_id còn hoạt động, không dùng text tên làm FK. Người cùng JOB nhưng không tham gia không được đọc nội dung private.

Một content có owner, một writer, một cameraoperator/editor hiện hành và nhiều participants. Việc nhiều editor sau này chưa nằmV1; file source vẫn có metadata uploader. Các phân công thay đổi có version+history. user không còn hoạt động được giữ tên snapshot trong lịch sử.

## Stage events và báo cáo

`content_stage_events`: content_id, stage, event_kind(COMPLETE/CORRECT/REOPEN), occurred_at,business_at,actor_id,owner_at_event,role_at_event,assets/snapshot,reason. Backend kiểm monotonic order cho COMPLETE. Với correction cần một bản logical revision, xác định activecompletionevent theo stage, không count cả 2 lần.

Trong tuần [T2_00 VN,T2 kế_00 VN):
- scripts_completed = số content có activeSCRIPT_COMPLETE event trong kỳ, attribution writer_at_event.
- shoots_completed = số content activeSHOOT_COMPLETE, attribution camera_at_event; người thamgia có contribution riêng không nhân task.
- clips_completed = số content activeEDIT_COMPLETE, attribution editor_at_event.
- publications = số publication lần đăng có published_at trong kỳ, attribution publisher_id. Tách “video độc nhất”COUNTDISTINCTcontent nếu cần hiển thị thêm, khôngnhầm count lượt đăng.

Sửa due hoặc owner sau khi nộp báo cáo không đổi snapshot. Nhiều user phụ trách cùng nội dung giữđónggóp theo bước, không cộng thành nhiều video độc nhất.

## Snapshot video và D7

- publication(platform+channel+platform_video_id) unique; URL canonical bỏ tracking saukhi lưu url gốc. Nếu không trích được ID thì canonicalURL là khóa, không dùng title.
- snapshot lưu collected_at/precision, published_at/precision, views/likes/comments/shares,sourcebatch và cửa sổ nếu nguồn có. Thiếu year cần userconfirm cóprovenance; có date nhưng thiếu hour không đủ tínhD7 exact.
- `gmv` có source riêng và attributiondefinition, currency. File 15 video hiện có không chứa GMV. Không mở cột nhập 0 để che thiếu.
- D7 status: AMBIGUOUS_DATE (thiếu giờ/năm); NOT_DUE (now<endwindow); MISSING_SOURCE (đủ tuổi nhưng chưa có nguồn đúng window); READY (nguồn xác minh đúng [published,published+168 h)); NOT_COMPARABLE (definition khác).
- Không dùng toàn bộ cumulativeview/GMV ở D10 thayD7; không trừsnapshotD10-D3 để đoán D7. Có nguồn đúng window thì lưu một fact period source, idempotent/revision theo publication+metric+window+attribution.

API/UI cho nhập tay chỉ khi có chứng từ nguồn, cửa sổ và người xác nhận; không cho bypass D7 gate bằng nhập vào cột tự do.


## Video lịch sử chưa có hồ sơ sản xuất

Cho phép publication origin=HISTORICAL_IMPORT, content_id/publisher_id null, sau khi người tải xác nhận đúng kênh và link/ID video. Hiển thị “Chưa liên kết nội dung”; không tạo kịch bản, người viết hoặc stage event giả. Khi liên kết sau này ghi lịch sử. Publication tạo từ luồng sản xuất mới là MANAGED và bắt buộc content CLIP_READY + publisher_id.
