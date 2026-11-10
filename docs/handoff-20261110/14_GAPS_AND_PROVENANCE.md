# Dữ liệu còn thiếu, nguồn và giới hạn

## Tình trạng dữ liệu nguồn

| ID | Thiếu gì | Hành vi bắt buộc | Ai cung cấp |
|---|---|---|---|
| G01 | GMV của từng video trong đúng cửa sổ D7 | D7 GMV=null/MISSING_SOURCE; không suy từ lượt thích/lượt xem/KOC | Nhân viên xuất nguồn phù hợp; Admin xác nhận adapter |
| G02 | Kỳ thực tế của file KOC không nằm trong nội dung | Chưa được gắn vào báo cáo tuần; form xác nhận kỳ nguồn | Người tải file |
| G03 | Ngày video thiếu năm và giờ, collectiondate dạng chữ | Lưu raw/precision, yêu cầu confirm; không tính D7 exact khi thiếu giờ | Người quản lý kênh |
| G04 | Mã shop/kênh, pháp nhân, externalIDs chưa được file nhận diện | Danh mục do Admin cấu hình; bắt buộc chọn nguồn/confirm | Admin/người tải |
| G05 | Nguồn trả hàng riêng, hoa hồng quyết toán chưa có | Không đào tạo mapping giả; hiển thị N/A | Nhân viên Sàn |

Các mục G không cản làm khung UI/API/schema, sales/KOC mẫu và checklist/HR. Chỉ chặn số hoặc commit thiếu metadata tương ứng. Không tự hỏi lại các quyết định D/E đã chốt.

## Số kiểm tra từ 5 file mẫu

| Nguồn | Số kiểm tra | Giới hạn |
|---|---|---|
| TikTok sales | 7 ngày; doanhthu 67.492.567 VND;930 đơn;100 hủy;4 hoàn tiền;refund 234.569 | Chưa xác nhận shop/company; không gọi GMV kế toán |
| Shopee sales | 7 ngày;28.040.779 VND;360 đơn;36 hủy;2 hoàn tiền;refund 95.665 | Cùng header TikTok,không auto-detect platform |
| KOC | 1.307 dòng KOC;GMV52.399.786;hoa hồng ước tính 1.678.199;refund 2.029.427;orders 726 | Chưa xác nhận kỳ; không phải paid commission |
| File hoàn/hủy | 113 line,112 OrderID; mọi type=Cancel,status=Đã hủy | Không có mẫu Return/Refund riêng; không suy ra mapping trả hàng |
| Video | 15 video;ContentSheet;views/likes/comments/shares | Không GMV,ngày thiếu year/hour; collected 10/11 không khớp tên file 02–08/11 |

File gốc trong fixtures/originals giữ nguyên byte và tên để dev thấy vì sao filename không phải id entity. `source_manifest.json` ghi SHA256,bố cục tiêu đề và expected totals. Dữ liệu test nhân sự/task ở bản bổ sung là synthetic rõ ràng.

## Prototype đã duyệt không phải code production

- Chuyển ROLE là chế độ xem thử, không auth.
- Mutations phần lớn chỉ RAM/toast; báo cáo trong mockup chưa filter event theo tuần, metadata chưa đầy nhật.
- Bộ lọc task ở mockup đầu chỉ search/status; bộ lọc và sort chuẩn mới ở 04 + taskfilterpreview. Không coi thiếu UI trong mockup là bỏ yêu cầu 04.
- Bộ đọc file phía trình duyệt trong mockup đã thử đọc 7 rows sales và chặn KOC ở sales, nhưng chưa có server hash/persistence/transaction/ACL. Phải dùng backend ExcelJS hiện có, không dùng client parsed facts làm nguồn tin.
- Form hợp đồng/lương mockup chưa thể hiện đủ null end date/correction/futureterm; tài liệu 08/10 thắng.
- Bảng ghi chú thiết kế trong mockup là ghi chú trước duyệt, có chữ“đề xuất”. Từ gói này D01–D13 đã chốt; không hỏi lại bởi nhãn cũ.

## Tính đầy đủ của gói

Đã đối chiếu code và migrations trong repo tại BASE commit. Đã phân tích 5 file để mapping/số control. Các schema SQL là reference bị guard, **chưa được áp dụng/chạy test sản phẩm**. Mục 13 có status NOT_EXECUTED cho dev chạy sau khi code. Kiểm tra đóng gói chỉ xác thực links/JSON/Mermaidfile/SVG/hashes, không thay nghiệm thu.
