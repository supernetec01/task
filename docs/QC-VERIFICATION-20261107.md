# Xác nhận bản nâng cấp sau duyệt QC · 07/11/2026

- TypeScript và production build: đạt (`npm run build` gồm kiểm kiểu, biên dịch server và Vite).
- Backend/unit/integration: **72/72 đạt**.
- Playwright: **28/28 đạt** trên desktop 1440×1000 và mobile 390×844.
- Kiểm thử dùng PostgreSQL 17 và database `*_test` riêng; không dùng tài khoản/mật khẩu thật, không tác động DB máy Windows công ty.

## Các luồng đã xác nhận

1. Admin tạo hồ sơ, cấp user từ hồ sơ, HR nhìn thấy và sửa được; giai đoạn Chính thức không bị đổi về Thử việc khi sửa tên.
2. Lịch sử ghi người/thời gian/trước-sau; trigger chặn sửa/xóa. Lương/thưởng và lịch sử nhạy cảm được mã hóa; HR không đọc định danh/ngân hàng. Chỉ cấp EXECUTIVE rõ ràng mới mở quyền Ban lãnh đạo.
3. Checklist đủ dù HR không đọc file định danh; tài liệu PAYROLL có quyền riêng.
4. Worker nhắc mốc hợp đồng 7 ngày chỉ cho HR, retry không nhân thông báo, người mất JOB HR không đọc thông báo hợp đồng.
5. Quyền nền tảng kế thừa vào account mới; override account chặn riêng, bỏ override khôi phục kế thừa; tra cứu hai chiều và thu hồi có hiệu lực ở API reveal.
6. Form lỗi hiển thị tiếng Việt, đưa focus và đánh dấu trường sai; mô phỏng imports503 hiện alert/thử lại. Đây là kịch bản lỗi chủ động, không phải sự cố dữ liệu thật.
7. Đồng hồ browser giả lập 60 phút xác nhận danh sách tải lại và bản nháp trong modal giữ nguyên; nút tải lại thủ công hoạt động.
8. Mẫu phân tích sản phẩm chặn nộp chỉ bằng chữ/link; có file tài liệu mới nộp được. Video kiểm thứ tự bước, nhân sự, tư liệu, hậu kỳ, ngày và link đã đăng; chỉ cần nhập link một lần trong form video.
9. Task/report/review/export và hỗ trợ, lưu offline/idempotency, kiểm quyền menu, mật khẩu nền tảng/version và file riêng tiếp tục chạy.
10. Migration chạy thử trong schema tạm rồi rollback: ciphertext và snapshot task cũ giữ nguyên; share hết hiệu lực không được mở lại.
11. Login vẫn khóa khi vượt 10 lần theo account/IP, không chặn đồng nghiệp khác cùng IP; chặn tổng IP ở 100 lần/phút.
12. Dashboard tổng hợp đúng khi có 105 task, dù trang đầu chỉ 100 dòng; người ngoài phạm vi không nhận tổng đó.

## Ảnh giao diện đã chạy thật với dữ liệu mẫu

- [HR desktop](screenshots/approved-hr-desktop.png), [HR mobile](screenshots/approved-hr-mobile.png).
- [Lịch sử chỉnh sửa](screenshots/approved-history-desktop.png).
- [Lỗi form mobile](screenshots/approved-validation-mobile.png).
- [Task video](screenshots/approved-video-desktop.png), [Chọn người xem account mobile](screenshots/approved-viewers-mobile.png).

HTTP LAN được mô phỏng bằng hostname HTTP trỏ qua localhost trong Playwright: xác nhận ngữ cảnh không có `crypto.randomUUID` và luồng đăng nhập/lưu task vẫn chạy. Chưa thay thế việc thử Windows, firewall và hai máy LAN tại công ty. Tích hợp bên ngoài/kho không nằm trong đợt này. Hướng dẫn cập nhật: [RELEASE-APPROVED-20261107.md](RELEASE-APPROVED-20261107.md).
