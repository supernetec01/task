# Quyết định và chính sách còn mở

Yêu cầu trực tiếp: máy chủ **Windows**, app/API cùng **3002**, frontend API tương đối, dữ liệu cục bộ, không công khai Internet. Ghi nhận từ người dùng ngày 06/11/2026.

Thiết kế kỹ thuật được chọn: modular monolith Node.js 24 + TypeScript, React, PostgreSQL 17, kho file private, worker riêng. Một installation = một workspace; nhiều pháp nhân lưu rõ `company`, không gộp nguồn. Không hỗ trợ chuyển tenant bằng ID client. Migration thực thi trong `migrations` thay thiết kế ứng viên; xem [mô hình](SCHEMA.md). Khả năng đa workspace độc lập triển khai bằng DB/instance riêng.

| Nhóm Q | Hành vi mặc định |
|---|---|
| Q01–02 | Lịch T2–T7 09–12/13–18 VN. Ngày ngoại lệ do Admin nhập. Hạn assignment được snapshot. Phản hồi quá hạn bị chặn; job tự timeout chỉ bật khi Admin xác nhận boundary `< due`. |
| Q03–04 | Reviewer được cấu hình theo người; thiếu reviewer không tự duyệt. Gia hạn cần bật policy reviewer; đổi lùi hạn chưa bật. |
| Q05–08 | Live ghi rõ đề xuất T2–CN, created_at. Chỉ nộp sau khi Admin xác nhận. Hủy/từ chối/nháp/chuyển tiếp tách riêng. Transfer có lịch sử; attribution theo owner hiện tại là giới hạn bản test, chưa giải quyết đầy đủ lịch sử ownership Q07. |
| Q09–14 | Người nhận là quản lý/sếp có scope hiện tại, không hardcode. Hỗ trợ không timeout, lý do từ chối tùy chọn, hạn chung, không chặn nộp vì supporter chưa xong. Chưa bật mời lại/rút lui/mời thêm sau tạo. Mở lại DONE chỉ bật khi có quyết định và lý do. |
| Q15–17 | Bồi hoàn mặc định UNSPECIFIED; không gọi đã nhận. Import chỉ theo mapping do người dùng xác nhận; không đoán file ads hay CR. Source conflict mặc định REJECT; REPLACE tạo revision, không cộng. |
| Q18 | Đăng nhập password Argon2id, session HttpOnly/SameSite/CSRF. Web password không có lịch sử readable. Platform versions AES-GCM dùng VAULT_KEY ngoài DB. Chưa có SSO/MFA/reset password qua email tự động hoặc key-rotation nhiều khóa. |
| Q19–21 | Sinh nhật job tắt tới khi policy xác nhận; 29/02 bỏ trong năm không nhuận nếu Admin đồng ý policy hiển thị. Scope quản lý luôn kiểm tra hiện tại. Lịch thiết bị/quay chỉ cảnh báo, không tự hủy. |
| Q22–25 | Pháp nhân/hạn mức/approvers phải cấu hình; thiếu policy không duyệt mua/chi. Không phát hành hóa đơn/thanh toán tự động. Upload kỹ thuật 25 MiB có thể cấu hình, không tự purge, backup không tự xóa. Không hứa SLA. Windows/LAN/firewall cần kiểm thử thực tế. |
| Q26–30 | Không chấm điểm/xếp hạng thái độ; recurring tắt mặc định, bật từng rule có duyệt. Chỉ thông báo trong app. Giữ brand Super Net/Vietnamese. Pending supporter không thấy file riêng. |

Admin ghi người chốt/lý do/ngày khi thay policy trong Thiết lập; audit lưu actor/thời gian. Các policy demo bật trong seed chỉ dành DB demo. Quyết định kỹ thuật ở đây không thay thế quyết định nghiệp vụ của chủ hệ thống.

Các extension P nâng cao (ERP đầy đủ, sổ tồn, thuế/BHXH, ngân hàng, hóa đơn điện tử, tự đổi password trên TikTok/Shopee, subscriptions tự gia hạn, định mức/điểm thái độ) không nằm trong nghiệp vụ tự động của bản này. Các nguồn thật chưa được cung cấp trong bộ tài liệu cần đối chiếu khi người dùng chạy thử.
