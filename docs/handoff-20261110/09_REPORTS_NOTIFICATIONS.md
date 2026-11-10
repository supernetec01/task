# Báo cáo tuần và thông báo

## Kỳ và thời điểm

`week_start` phải là thứ Hai. Range `[week_start 00:00VN,nextMonday00:00VN)`, UTC quy đổi ở server. Hạn nộp nextMonday 10:00 VN; nếu có ngày lễ vẫn giữ hạn calendar trừ Admin đổi cấu hình, không tự dời. Nộp trễ được nhưng late=true. Không auto-submit hoặc đọc nháp người khác.

## Tập task

- created_in_period: created_at trong kỳ; open carryover: đã tồn tại trước kỳ và còn mở tại cutoff.
- completed_in_period: completion event thực sự trong kỳ, task có thể tạo tháng trước; ghi nhận người phụ trách tại thời điểm hoàn thành. Nếu đã mở lại trước cutoff thì ghi reopening, không coi là done hiện tại; tổng event hoàn thành và done hiện tại tách tránh 2 nghĩa.
- cancelled_in_period và assigned/transferred_in_period từ eventtime. Không gộp canceled/declined thành khối hoàn thành.
- activity_in_period lấy cập nhật và sự kiện giai đoạn liên quan dù task không tạo trong tuần. Chi tiết taskrows có nhãn cohort và cờ is_counted flags; một task có thể nhiều nhãn nhưng total unique dùng COUNT DISTINCT id.
- Lịch sử người phụ trách cần FK/thời điểm hiệu lực. Legacy không đủ event lịch sử: ghi ATTRIBUTION_UNKNOWN hoặc cohort legacy, không tái tạo bằng owner hiện tại.

## Snapshot và nguồn

Một user/week có container, nhiều revision. Các phần chuyên môn trên JOB vẫn hiệu lực tại nộp; narrative COMMON riêng. Dữ liệu nguồn dùng active partition revision tại cutoff và manifest id/revision/hash. Doanh số theo ngày đủ tuần mới đủ dữ liệu; KOC period khớp tuần; Video theo giai đoạn, lần đăng và cửa sổ D7 hợp lệ.

Thiếu dữ liệu không cản nhân viên nộp toàn bộ báo cáo: phần snapshot có`availability=MISSING_SOURCE/INCOMPLETE/UNCONFIRMED_PERIOD`, chỉ số null,warning rõ; không lấy số chưa xác nhận hoặc số 0. Báo cáo Sếp không HR amount/identity/credential.

Submit transaction khóa các phiên bản nháp + reports container, dựng snapshot nhất quán REPEATABLE READ hoặc tương đương có locks phù hợp, kiểm tra phiên bản và người nhận và insert revision+outbox. Revision bất biến, không sửa SOURCE sau khi đã nộp. Người nhận ROLE BOSS ALL đang hiệu lực, không hard code user. Không có Sếp nhận→CONFIG_REQUIRED giữ nháp, Admin cấp người nhận.

Xuất XLSX từ revision gồm tổng quan,task/tiến độ,phần theo ROLE,narrative,kế hoạch tiếp theo,nguồn dữ liệu. N/A là chuỗi kèm lý do thiếu không phải 0; ID kiểu chuỗi chống mất 0 đầu, giá trị bắt đầu= không thực thi formula.

## Thông báo

| Loại | Người nhận | Khóa chống trùng | Mở tới |
|---|---|---|---|
| TASK_ASSIGNED | owner | task:id:assigned:version | Chi tiết task |
| REPORT_SUBMITTED | từng Sếp đang có quyền | report_revision:id:recipient | Revision đúng |
| PROBATION_END | HR đang có quyền | employee:id:probation_end:date:offset | Hồsơ/công tác |
| CONTRACT_EXPIRY | HR đang có quyền | contract:id:revision:end:offset | Hợp đồng |
| BIRTHDAY_MONTH | HR đang có quyền | year:month:recipient | Danh sách tháng |
| BIRTHDAY_SOON | HR đang có quyền | personcanonical:year:offset:recipient | Hồsơ |

Thêm object_type,actionpath,eventtype để không đoán deep-link từ event key string. Transaction ghi outbox; worker drain và ON CONFLICT unique. Kiểm role hiện tại khi đọc notification; mất HR thì không trả HR notification. Không lộ số lương,DOB đầy đủ,bank,thông tin bí mật trong nội dung. Notification không có tác dụng tự gia hạn HĐ/tự chuyển phase.

Nhắc bù khi worker phục hồi: worker dừng trong ngày phải gửi 1 lần khi phục hồi cùng ngày; nếu qua offset bị lỡ nhưng chưa qua hạn thì tạo 1 nhắc OVERDUE_MILESTONE hợp nhất, không gửi dồn 4 mốc. Hết hạn chưa xử lý hiện queue expiry, không gửi lặp hằng phút. Phiên bản quy tắc thay đổi kiểm tra worker state trước gửi.
