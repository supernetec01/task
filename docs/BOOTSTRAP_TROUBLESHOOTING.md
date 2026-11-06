# Bootstrap.ps1 không đọc được trạng thái

Thông báo cũ `Cannot inspect bootstrap status` chỉ cho biết lệnh Node thất bại; không chứng minh `.env` sai hoặc migration thiếu. Một lỗi đã tái hiện trên Node/PostgreSQL là `AggregateError` có `code=ECONNREFUSED` nhưng `message` rỗng. CLI cũ in mỗi `message` nên lỗi gốc biến mất. Windows PowerShell cũng có khác biệt trong cách xử lý stderr của native process.

Bản sửa trả JSON có mã lỗi/hướng dẫn, không serialize error DB hoặc connection string. PowerShell đọc riêng stdout/stderr, có timeout 20 giây và chỉ hỏi mật khẩu khi trạng thái đọc thành công. Không có bước reset DB hay thay mật khẩu admin đang tồn tại.

Sau `git pull`, chạy tại thư mục dự án:

```powershell
npm ci
npm run build
npm run migrate
.\scripts\Bootstrap.ps1
```

Để lấy chẩn đoán chỉ đọc, không tạo/sửa tài khoản:

```powershell
node build/server/cli.js bootstrap-status --json
$LASTEXITCODE
```

| Mã | Cần kiểm tra |
|---|---|
| CONFIG_REQUIRED / CONFIG_INVALID | DATABASE_URL trong `.env` còn thiếu, sai cấu trúc hoặc là mẫu REPLACE_WITH…; sửa riêng trên máy, không gửi mật khẩu/URL vào chat. |
| ECONNREFUSED | PostgreSQL chưa chạy hoặc host/port sai. Dùng lệnh đọc bên dưới; nếu DB ở máy hiện tại thì địa chỉ 127.0.0.1 thường giúp tránh nhầm IPv4/IPv6. |
| 28P01 / 28000 | Thông tin đăng nhập **database** hoặc pg_hba.conf; đây không phải mật khẩu admin website. |
| 3D000 | Database được chỉ định chưa tồn tại; tạo đúng DB bằng pgAdmin/createdb trước migrate. |
| 42P01 / 42703 | Chưa có bảng/cột cần thiết; chạy migration trên đúng DB thành công rồi bootstrap lại. |
| 42501 | Role DB thiếu quyền; dùng MIGRATION_DATABASE_URL riêng cho migrate và cấp DML cho runtime theo WINDOWS.md. |
| ETIMEDOUT / ENOTFOUND | Host, port, service hoặc kết nối chưa tới được; không đổi mật khẩu hay xóa dữ liệu để xử lý lỗi mạng. |

Kiểm tra chỉ đọc trên Windows (thay port bằng port DB thật nếu khác 5432):

```powershell
Get-Service -Name '*postgres*'
Test-NetConnection -ComputerName 127.0.0.1 -Port 5432
```

Nếu service đang Stopped, người vận hành khởi động **đúng service PostgreSQL đã cài**, rồi chạy lại kiểm tra. Không dừng tiến trình lạ hoặc tự tạo database mới để thay thế dữ liệu cũ. Nếu service không có trong danh sách, kiểm tra PostgreSQL đã cài chưa hoặc DB được đặt trên host nào.

Trạng thái thành công có dạng `{"ok":true,"exists":true}` hoặc `exists:false`, exit code 0. `exists:true` thì bootstrap giữ nguyên admin. `exists:false` mới hỏi mật khẩu ẩn tối thiểu 11 ký tự. Không dùng giá trị bí mật từ ví dụ hoặc tạo password mặc định.

Đã chạy build và 5 kiểm tra chẩn đoán, gồm subprocess Node thật thiếu cấu hình/kết nối bị từ chối và đọc trạng thái admin cloud. Chưa chạy PowerShell trên máy Windows công ty; chưa xác định lỗi DB cụ thể của máy người dùng từ thông báo cũ.
