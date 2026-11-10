# Triển khai Windows tại công ty

Chưa thực thi các script Windows trong môi trường cloud Linux; cần nghiệm thu trên máy thật.

## Cài đặt và quyền

Làm theo README để cài Node 24, PostgreSQL 17, `.env`, production build, migration và bootstrap. Đặt thư mục code riêng với dữ liệu: ví dụ `C:\SuperNet\app`, `C:\ProgramData\SuperNet\files`, backup ổ khác/NAS. Đảm bảo người dùng chạy dịch vụ có quyền đọc code/config, ghi DATA_DIR/logs. Giới hạn ACL `.env` cho người vận hành và tài khoản dịch vụ; không để tệp này trong thư mục web public hoặc Git. Mật khẩu DB/Vault key không truyền qua tham số startup.

PostgreSQL chỉ nghe loopback, `pg_hba.conf` chỉ cho tài khoản DB đã cấu hình dùng SCRAM. Tạo migration role riêng và runtime role ít quyền theo hướng dẫn quyền SQL bên dưới. CLI migrate đọc `MIGRATION_DATABASE_URL` nếu được đặt; API/worker dùng `DATABASE_URL`. Kiểm tra quyền runtime sau migration bằng người vận hành. Ví dụ cấp quyền (đổi tên role đúng cài đặt):

```sql
GRANT CONNECT ON DATABASE supernet TO supernet_runtime;
GRANT USAGE ON SCHEMA public TO supernet_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO supernet_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO supernet_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE supernet_migrator IN SCHEMA public
 GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO supernet_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE supernet_migrator IN SCHEMA public
 GRANT USAGE,SELECT ON SEQUENCES TO supernet_runtime;
```

Tạo role/mật khẩu riêng bằng công cụ PostgreSQL trên máy; không dùng password mẫu trong `.env.example`. Không để runtime role là superuser, owner hoặc có quyền CREATE trên schema production.

## Khởi động bền vững

`Start-SuperNet.ps1` chạy JavaScript production đã build, cho API hoặc worker. Có thể dùng service manager đã được công ty chuẩn hóa; bộ này cung cấp Task Scheduler startup tasks để tránh phụ thuộc người đăng nhập mở terminal.

1. Tạo tài khoản Windows cục bộ riêng cho dịch vụ, cấp **Log on as a batch job**, quyền thư mục cần thiết. Cấu hình PostgreSQL auto-start trước; startup API có thể được Task Scheduler restart nếu DB chưa sẵn sàng.
2. Tại PowerShell quản trị, xem trước việc đăng ký:

   ```powershell
   .\scripts\Install-Tasks.ps1 -ServiceAccount "$env:COMPUTERNAME\SuperNetSvc" -WhatIf
   ```

3. Dùng cùng lệnh bỏ `-WhatIf` sau khi đã kiểm tra đường dẫn/quyền. Script không tự tạo tài khoản, không ghi mật khẩu và từ chối đè task hiện có. S4U chỉ dùng tài nguyên cục bộ; tác vụ backup tới NAS phải chạy bằng danh tính có quyền NAS riêng.
4. Điều khiển:

   ```powershell
   Start-ScheduledTask -TaskName SuperNet-api
   Start-ScheduledTask -TaskName SuperNet-worker
   Get-ScheduledTaskInfo -TaskName SuperNet-api
   Get-ScheduledTaskInfo -TaskName SuperNet-worker
   # Dừng trước khi bảo trì/cập nhật:
   Stop-ScheduledTask -TaskName SuperNet-worker
   Stop-ScheduledTask -TaskName SuperNet-api
   ```

5. Reboot máy và thử lại khi chưa đăng nhập người dùng để xác minh cả hai tiến trình tự chạy. Task Scheduler restart tối đa 10 lần, cách 1 phút; nếu vẫn lỗi đọc logs và DB, không lặp vô hạn. API/worker có JSON logs tại `DATA_DIR/logs`, xoay theo ngày/10 MiB; không tự xóa trước khi chốt retention.

Không đăng ký task chạy Node trực tiếp mà thiếu working directory: runtime đọc `.env`, config và dist theo thư mục dự án. Dùng script start đi kèm.

## Mạng LAN

Chạy `scripts/Preflight.ps1` trước khi start: báo phiên bản Windows, IP/profile mạng và tiến trình chiếm 3002. Script không dừng tiến trình lạ. Cấu hình `.env` `HOST=0.0.0.0`, `PORT=3002`. Cố định IP hoặc nhờ IT đặt DHCP reservation. Chỉ đặt Private profile cho mạng công ty tin cậy.

`scripts/Firewall.ps1` cần **IP LAN thật của máy chủ và CIDR LAN nhân viên thật**; hỗ trợ `-WhatIf`. Không dùng 0.0.0.0/0, không Public profile, không mở 5432. IT kiểm tra các rule rộng có sẵn; một rule hẹp mới không vô hiệu hóa rule rộng cũ. Không router port forwarding hoặc công khai Internet. Nếu có domain policy, phối hợp IT thay vì sửa tùy tiện profile máy.

Trên máy chủ kiểm tra `http://localhost:3002/api/health` rồi đăng nhập. Trên máy khác chạy `Test-NetConnection -ComputerName <IP-LAN> -Port 3002`, mở `http://<IP-LAN>:3002` và thực hiện task/upload/report bằng tài khoản thử nghiệm. Xác nhận API vẫn dùng đường dẫn tương đối; không yêu cầu browser gọi localhost của máy chủ.

HTTP LAN dùng `COOKIE_SECURE=false` để browser gửi cookie; trước dữ liệu thật nên triển khai HTTPS nội bộ bằng certificate tin cậy rồi chuyển `COOKIE_SECURE=true`. Không tắt kiểm tra certificate. Nếu dùng reverse proxy, giữ Host/Origin nhất quán và chỉ cấu hình trust proxy sau kiểm thử. Không coi HTTP LAN là đã bảo vệ đường truyền.

## Sao lưu, cập nhật, khôi phục

- Chạy backup script vào ổ khác/NAS bằng tài khoản có quyền; sao lưu khóa vault/config riêng, kiểm soát truy cập. Không đặt backup dưới thư mục DATA_DIR. Chốt lịch/giữ bản/RPO/RTO với người vận hành; không tự purge.
- Trước cập nhật: backup và xác nhận manifest, giữ phiên bản code + Node/PG + key tương ứng. Dừng API và worker, pull phiên bản đã kiểm thử, `npm ci`, build, migration, start lại cả hai. Không xóa DATA_DIR/dist bên ngoài thư mục app.
- Nếu migration thất bại, transaction rollback và không start bản lỗi. Rollback bản đã đổi dữ liệu bằng restore vào DB/file riêng trước, smoke test rồi mới chuyển cấu hình; không chạy down migration phá lịch sử hoặc đè DB đang hoạt động.
- Diễn tập restore theo README, đăng nhập/xem file/report/vault bằng khóa đã phục hồi. Kiểm tra checksum đơn thuần không thay thế chạy thử dữ liệu đã restore.

Máy chủ phải bật và kết nối LAN để nhân viên truy cập. Quyền nhân viên/reviewer/Boss, dữ liệu shop, pháp nhân, policy, upload/retention cần cấu hình bằng thông tin thật trước nghiệm thu.
