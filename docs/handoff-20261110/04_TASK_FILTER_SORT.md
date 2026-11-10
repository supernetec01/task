# Bộ lọc và thứ tự task — hợp đồng chính xác

## Mặc định và bố cục

- Nhân viên mở “Công việc của tôi”: owner=self, `status_group=OPEN`, không giới hạn ngày tạo.
- Admin/Sếp mở “Công việc đội ngũ”: toàn phạm vi được cấp, OPEN; có lọc nhân viên/bộ phận/chuyên môn.
- OPEN gồm checklist WAITING/IN_PROGRESS; legacy còn mở có ASSIGNED/ACCEPTED/IN_PROGRESS/SUBMITTED/CHANGES_REQUESTED. Legacy DRAFT ở bộ lọc “Nháp cũ”, DECLINED ở “Từ chối cũ”.
- DONE/CANCELLED không lẫn mặc định, có chip “Hoàn thành” và “Đã hủy”. “Tất cả” không làm mất dữ liệu legacy.
- Bảng: mã+tên, nhân viên/chuyên môn, hạn và nhãn quá hạn, trạng thái, cập nhật gần nhất. Mobile thẻ tương đương; board dùng cùng query/sort, không sắp khác ngầm định.
- Chip nhanh: Đang mở, Quá hạn, Hôm nay, 7 ngày tới, Hoàn thành, Đã hủy. Mỗi lần chọn chip reset status/date tương ứng trước khi áp dụng; không giữ bộ lọc mâu thuẫn ẩn.

## Bộ lọc

| Key | Kiểu / UI | Quy tắc |
|---|---|---|
| q | search tối đa 255 ký tự | title, code, owner name; trim, không phân biệt hoa/thường, không tự bỏ dấu làm đổi mã |
| owner_ids | multi-select tìm theo tên/mã | Admin/Sếp chọn nhiều; nhân viên khóa SELF, API reject owner khác |
| team_ids | multi-select | Chỉ Admin/Sếp; cùng owner filter là AND |
| job_codes | multi-select | MARKETPLACE/HR/CONTENT; task legacy giữ job code cũ trong vùng legacy |
| status_group | OPEN/DONE/CANCELLED/ALL/LEGACY_DRAFT/LEGACY_DECLINED | Nếu chọn status cụ thể thì UI hiển thị status_group=CUSTOM; không đồng thời áp dụng hai filter mâu thuẫn |
| statuses | multi enum | OR trong cùng trường; AND với các trường khác |
| deadline_preset | OVERDUE/TODAY/NEXT_7_DAYS/NONE | OVERDUE chỉ việc mở và due_at < as_of; TODAY theo ngày VN; NEXT7 từ 00 h ngày mai đến 00 h ngày thứ 8, không gồm hôm nay |
| due_from / due_to | datetime, UI khoảng ngày | ngày đến inclusive trên UI được đổi thành `< next_day_00VN`; không BETWEEN 23:59:59 |
| created_from / created_to | date, mục lọc nâng cao | Chỉ áp dụng khi user chọn, không tự ép về tuần hiện tại |
| completed_from / completed_to | date | Chỉ DONE; tìm “hoàn thành tuần này” dù tạo tháng trước |
| priority | NORMAL/URGENT | Trường nâng cao, mặc định mọi mức; không thêm thang điểm |
| flow_mode | CHECKLIST/LEGACY_REVIEW/ALL | ALL mặc định, badge công việc cũ phân biệt trạng thái chờ duyệt |
| sort | ATTENTION/DUE_ASC/UPDATED_DESC/CREATED_DESC/COMPLETED_DESC | Chỉ whitelist, không đưa SQL từ client |

UI có số bộ lọc đang áp dụng và “Xóa bộ lọc” về mặc định theo ROLE. Lưu view preference không nhạy cảm theo user, màn hình, version; không lưu dữ liệu task trong localStorage. API vẫn xác thực scope mỗi lần.

## Thứ tự mặc định ATTENTION

Thời điểm neo `as_of` do server cấp ở trang đầu. Khoảng ngày tính theo VN, không theo timezone browser.

| bucket | Nhóm | Thứ tự trong nhóm |
|---|---|---|
| 0 | Mở và quá hạn | URGENT trước NORMAL, due_at tăng dần, created_at giảm dần, id tăng dần |
| 1 | Mở, chưa quá hạn, đến hạn trong hôm nay | Như trên |
| 2 | Mở, hạn từ đầu ngày mai đến trước đầu ngày thứ 4 | Như trên (3 ngày lịch kế tiếp) |
| 3 | Mở, hạn xa hơn | Như trên |
| 4 | Legacy mở nhưng thiếu hạn do dữ liệu lỗi | updated_at giảm dần, id tăng dần; badge “Thiếu hạn”, không giấu |
| 5 | Legacy SUBMITTED chờ duyệt | submitted_at tăng dần, id tăng dần; không gắn “quá hạn thực hiện” mới |
| 6 | DONE nếu bộ lọc có | completed_at giảm dần, id tăng dần |
| 7 | CANCELLED nếu có | cancelled_at giảm dần, id tăng dần |
| 8 | Legacy nháp/từ chối nếu có | updated_at giảm dần, id tăng dần |

Quá hạn ưu tiên bucket 0 kể cả deadline cùng hôm nay. Đúng tại deadline (`as_of=due_at`) chưa quá hạn. Hạn 3 ngày là để sắp chú ý; chip 7 ngày độc lập và ghi nhãn rõ.

Không dùng updated_at cho nhóm đang mở làm task vừa lưu tự nhảy lên đầu. Sau lưu, giữ item tại vị trí đang xem và hiển thị “Đã cập nhật; tải lại để sắp xếp”; khi tải lại query mới mới đặt lại vị trí chuẩn.

## Pseudocode SQL cần chuyển thành query có scope trước

```sql
WITH authorized AS (... server-enforced scope ...),
filtered AS (... parameterized filters ...),
ranked AS (
 SELECT *,
 CASE
   WHEN status='SUBMITTED' AND flow_mode='LEGACY_REVIEW' THEN 5
   WHEN is_open AND due_at < :as_of THEN 0
   WHEN is_open AND due_at < :tomorrow_vn_utc THEN 1
   WHEN is_open AND due_at < :day4_vn_utc THEN 2
   WHEN is_open AND due_at IS NOT NULL THEN 3
   WHEN is_open THEN 4
   WHEN status='DONE' THEN 6 WHEN status='CANCELLED' THEN 7 ELSE 8 END bucket
 FROM filtered
)
-- normalize sort_due/sort_closed into nonnull keyset keys;
-- SQL comparator must match ASC/DESC per key, not a naive mixed-direction tuple.
SELECT ... FROM ranked ORDER BY bucket ASC, ... , id ASC LIMIT :limit_plus_one;
```

`is_open` loại SUBMITTED ra khỏi bucket thực hiện. Legacy SUBMITTED vẫn được OPEN query trả về nhưng đưa riêng bucket 5.

## Phân trang và tổng hợp

- Cursor keyset 30 item/trang, max 100. Cursor ký HMAC chứa sort version, normalized query hash, last keys, as_of; không chứa nội dung nhạy cảm. Đổi bất kỳ filter/sort/scope → xóa cursor.
- Stable tie-breaker luôn id; date null có sentinel key rõ. Quyền vẫn kiểm lại, cursor không phải quyền.
- as_of cố định ranh giới “hôm nay/quá hạn” khi lật trang, không hứa snapshot MVCC xuyên request. Nếu task được đổi status/owner khi đang phân trang có thể thay membership: hiện “Có dữ liệu mới”, reload từ đầu; không tự nối list theo cursor cũ sau mutation của chính user.
- `filtered_total` theo toàn bộ query. Status facet counts dùng cùng scope+non-status filters, bỏ status/group để cho người dùng thấy phân bố; gắn nhãn rõ “Theo bộ lọc khác”. Không lấy count từ 30 item trang đầu.
- `COMPLETED_DESC` chỉ hợp lệ khi query chỉ DONE; trả 422 nếu chọn với OPEN để tránh thứ tự vô nghĩa.

## Ví dụ kiểm thử chuẩn

Anchor 10/11/2026 14:00 VN: A quá hạn 09/11 URGENT, B quá hạn 08/11 NORMAL, C hôm nay 17 h URGENT, D hôm nay 16 h NORMAL, E ngày 12/11 NORMAL, F ngày 20/11 URGENT, G DONE. Mặc định OPEN thứ tự **A,B,C,D,E,F** (ưu tiên URGENT trong cùng bucket); G chỉ có khi lọc DONE/ALL. Thay đổi query sang DUE_ASC thì B,A,D,C,E,F. Task tạo tháng 10 còn mở vẫn có mặt.
