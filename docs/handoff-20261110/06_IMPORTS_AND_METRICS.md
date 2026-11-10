# Nhập file và chỉ tiêu — nguồn là hợp đồng, không dựa tên file

## Adapter và mapping

| Adapter | Header / data | Bắt buộc | Tùy chọn / chỉ tiêu riêng |
|---|---|---|---|
| TIKTOK_SALES | Header dòng 2, dữ liệu từ 3; title/thời gian/VND dòng 1 | Ngày → date; Doanh thu → revenue; Tổng số đơn hàng → orders; Số lượng đơn đã hủy → cancelled_orders; SL đơn hoàn tiền → refunded_orders | Doanh thu đơn hàng hiệu quả; Số tiền đơn hàng hoàn tiền; Số tiền đơn hàng hủy; Số lượng đơn hàng hiệu quả |
| SHOPEE_SALES | Như trên | Như trên | Không có tín hiệu riêng sàn trong mẫu; yêu cầu sourceconfirm |
| KOC_SALES | Header 1, mô tả 2, dữ liệu 3; Sheet 1 nguồn là “Sheet 1” | Tên nhà sáng tạo → handle; GMV nhờ nhà sáng tạo → gmv; Đơn hàng đã ghi nhận → orders; Hoàn tiền → refund; Hoa hồng ước tính → estimated_commission | GMV buổiLIVE/video/thẻ sản phẩm; Số món đã hoàn tiền chỉ là item count |
| TIKTOK_RETURNS | OrderSKUList, header 1, mô tả 2, dữ liệu 3 | Order ID, Order Status, Cancelation/Return Type, Order Amount, Order Refund Amount, Created Time | SKU ID, Seller SKU, Quantity, Sku Quantity of return, Cancelled Time, Paid Time, Creator Handle, Package ID |
| VIDEO_PERFORMANCE | Content, header 1, dữ liệu 2 | Video title, Video link, Post time, Total likes, Total comments, Total shares, Total views | Time → ngày thu thập; KHÔNG có GMV |

`contracts/import_adapters.json` là mapping machine-readable; header so bằng UnicodeNFC,trim,collapsewhitespace,casefold. Không đổi dấu tiếng Việt hoặc fuzzy-match cột gần giống. Alias ngoài danh sách phải tạo adapterversion mới. Chỉ số cột mẫu giúp kiểm tra, **không hardcode index**. Nhiều sheet khớp yêu cầu chọn; không lấy sheet đầu. Sheet XML cần nhóm theo địa chỉ ô/r vì file hoàn hủy có nhiều rowelement cùngr.

## Quy trình nguyên tử

1. Chọn company + resource(shop/channel) + adapter + sourceperiod/basis. Role/resource ACL kiểm server.
2. Upload vào storage riêng, checksum/type/size/zip limits, batch UPLOADED. Lưu originalfilename và rawchecksum; không ghi KPI.
3. Detectsheet/header → map theoadapter → parse → canonical rows → error list có sheet,row,column,code. Bỏ đúng descriptionrow được nhận diện; không tự bỏ các dòng lỗi/saiID hoặc giátrị tiền rỗng.
4. Preview hiển thị mẫu 5 dòng đã chuẩn hóa (ẩnbuyerPII), số dòng hợp lệ/lỗi, nguồn, kỳ, currency, warnings, totalsexpected. Có lỗi blocking thì không được Confirm.
5. Người tải xác nhận metadata mơ hồ. Previewtoken do server ký/bind batch_version+checksum+mapping_version+canonical_hash+metadata+permissionfingerprint. Đổi nguồn/kỳ/file phải preview lại.
6. Commit transaction: kiểm quyền hiện tại; khóa sourcepartition; kiểm token/batchversion/idempotency; kiểm conflict; INSERT immutable facts + partitionrevision + outbox rồi mark COMMITTED. Rollback toàn bộ nếu có lỗi; không commit phần “dòng đúng”.
7. Trùng byte trong cùng source báo ALREADY_IMPORTED, link batch cũ. Cùng facts nhưng byte khác dùng canonical_hash báo CANONICAL_DUPLICATE. Overlap khác nội dung trả SOURCE_CONFLICT. Chọn “Thay phiên bản” cần Admin, reason và preview ảnh hưởng; không cộng cả 2 revision active.

V1 sales cần input trọn phạm vi ngày như file; dòng ngoài kỳ trả PERIOD_MISMATCH (không imlặnglọc). KOC cần ký xác nhận kỳ xuất; snapshotvideo dùng collectiondate, không dùng postdate để loại video cũ. Returns chọn DATE_CREATED mặc định để đối chiếu cohort sales nếu có; “hủy trong tuần” cần DATE_CANCELLED rõ ràng, không trộn 2 basis.

## Số, ngày và ID

- `16.201.794₫` → decimalstring `16201794`; plain `44.0` → integer 44 nếu phần lẻ 0; `1.39%` → ratio 0.0139. Localeprofilevi/en rõ; chuỗimơhồ phải error NUMBER_FORMAT, không đoán.
- Mẫu số 0 → null+missing_reason=ZERO_DENOMINATOR. Tiền thiếu không thành 0. Count không âm/nguyên. Kiểm decimal precision tối đa 28,scale 10; VND hiển thị nguyên nhưng DBkhônground nguồn.
- DD/MM/YYYY thành date-only; kiểm ngày tồn tại. XLSXserial phải đọc workbookdate 1904 vàcelltype/style; nếu parser không hỗ trợ thì chặn/người dùng CSV, không hiểu serial thành ID/ngày giả.
- OrderID/SKUID/creatorID/videoplatformID text. Số Excel đã bị làm tròn do >15 digit không thể khôi phục: ID_PRECISION_LOSS, yêu cầu nguồn text gốc.
- File mật khẩu, macroenabled, link ngoài/fomulacell ởcột số nguồn → chặn hoặc REQUIRE_VALUES_EXPORT; không chạy macro hoặc tính formula dofile cung cấp.

## Công thức báo cáo

| Chỉ tiêu | Công thức / ý nghĩa |
|---|---|
| Doanh thu sàn tuần | SUM(revenue_day) trên các facts active cùng company/shop/platform/currency và 7 ngày |
| Tổng đơn / hủy / hoàn tiền | SUM(count_day) cùng basis; không dùng bưu kiện hoặc khách hoàn tiền |
| Tỷ lệ hủy / hoàn tiền | tổng count tương ứng / tổngorders; không average tỷ lệ ngày |
| Doanh thu hiệu quả | Chỉ hiển thị cột nguồn riêng; không mặc định trừ một lần nữa từrevenue |
| GMV KOC | SUM(periodcreator_gmv) cùng partition revision; không cộng nguồn KOC vào doanhthu sàn |
| Hoa hồng | SUM(estimated_commission), nhãn ước tính; quyết toánN/A nếu thiếu nguồn |
| Top 10 | ORDER BY gmv DESC, normalized_creator_key ASC; tỷ trọng=gmv_creator/total_gmv_all_creators |
| KOC hoàn tiền | Tổng refund nguồn, có thể khác cohort GMV; không gọi GMV net cùng kỳ hoặc số đơn trả hàng |
| Video engagement | (likes+comments+shares)/views cùng snapshot; no source/zero→N/A |

Sales đủ 7 ngày mới gắn “Đủ dữ liệu tuần”. Thiếu ngày không tự điền 0: coverage=incomplete, hiển thị bao nhiêungày/7; bản nộp có thể gồm phần thiếu với cờINCOMPLETE và warning, tuyệtđối không gọi tổng tuần đầy đủ. KOC aggregate chỉ gắn tuần khi period khớp 100%, không phân bổ theo ngày.

## Hoàn/hủy cấp đơn và SKU

Keyline = company+shop+platform+order_id+sku_id+variation+package_id (thiếu key thì dùng sourcerownumber làm line provenance, không tạoquankệgiả). Keyorder = company+shop+platform+order_id+sourcepartitionrevision.

Order Amount và Order Refund Amount là cấp đơn: trong các dòng SKU cùng đơn phải thống nhất (null khác 0). Thống nhất thì lấymộtgiátrị; khác nhau → ORDER_LEVEL_AMOUNT_CONFLICT. Count đơn dùng COUNT DISTINCT OrderID. Itemquantity cộng theo line. Không sumrefundmoney theoSKU.

Mẫu 113 line/112 OrderID, nên count 113 đơn là lỗi. Chỉ data đã xác nhận type/status được classify cancel/return; unknownstatus → UNMAPPED_STATUS, không tự đổi thành khác/0. Lưu rawstatus và code. Nguồn returns chỉ đối chiếu, không ghi đè facts sales vì khác basis/cohort.

## Error contract

Mỗi lỗi `{code,severity,sheet,row,column,raw_value_redacted,message_vi,action}`. Blockingcó: WRONG_REPORT_TYPE,MISSING_COLUMN,EMPTY_FILE,INVALID_NUMBER,INVALID_DATE,PERIOD_MISMATCH,ID_PRECISION_LOSS,DUPLICATE_ENTITY_KEY,ORDER_LEVEL_AMOUNT_CONFLICT,UNMAPPED_STATUS,PREVIEW_STALE,SOURCE_CONFLICT,ACCESS_CHANGED. Hướng khắc phục nêu chọn lại file/đổi loại báo cáo/xuất text/xác nhận nguồn, không báo lỗi chung chung.
