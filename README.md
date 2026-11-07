# Super Net — web quản lý công việc nội bộ

Ứng dụng TypeScript gồm React UI, Fastify API, PostgreSQL 17, worker và kho file riêng trên máy chủ. Frontend và API cùng cổng **3002**, API tương đối `/api/v1`. Dữ liệu nghiệp vụ không dùng localStorage hay dịch vụ cloud. Giao diện và nghiệp vụ dựa trên hai tài liệu người dùng cung cấp trong `docs/reference`.

Đây là bản bàn giao **để kiểm thử nội bộ**, không đồng nghĩa đã nghiệm thu trên máy Windows/LAN của công ty. Xem [báo cáo kiểm thử](docs/TESTING.md), [ma trận yêu cầu](docs/REQUIREMENTS.csv), [chính sách còn mở](docs/DECISIONS.md) và [hướng dẫn Windows](docs/WINDOWS.md).

## Cập nhật giao diện 07/11

Đã thêm drawer công việc ba tab, tạo việc kèm tài liệu, cập nhật/nộp kết quả chung, trao đổi riêng và quản trị mẫu có phiên bản. Bản này **có migration 005**; người đang dùng cần sao lưu rồi chạy `npm run migrate` sau build. Xem [phạm vi sửa và lệnh cập nhật Windows](docs/REDESIGN-20261107.md).

## Chạy thử trên Windows

1. Cài Git, **Node.js 24 LTS**, **PostgreSQL 17** từ nguồn chính thức. Thêm thư mục `bin` PostgreSQL vào PATH (phải có `psql`, `pg_dump`, `pg_restore`). Không mở cổng database cho LAN.
2. Clone repo, chạy PowerShell tại thư mục dự án:

   ```powershell
   git clone https://github.com/supernetec01/task.git
   cd task
   Copy-Item .env.example .env
   ```

3. Tạo database riêng, đặt `DATABASE_URL` trong `.env`. Mỗi bản production/demo/test phải dùng DB và DATA_DIR riêng. Tạo `VAULT_KEY` ngẫu nhiên **32 byte dạng hex**, lưu ngoài Git, giữ bản dự phòng riêng có kiểm soát quyền; không thay khóa khi DB đã có credential. Có thể tạo bằng trình quản lý bí mật hoặc công cụ crypto cục bộ. Đặt `HOST=0.0.0.0`, `PORT=3002`, `NODE_ENV=production`, `DATA_DIR=C:/ProgramData/SuperNet/files`. Hạn upload mặc định 25 MiB là giới hạn kỹ thuật cho bản test, cần chốt Q24 trước dữ liệu thật.
4. Chạy:

   ```powershell
   .\scripts\Preflight.ps1
   .\scripts\Setup.ps1
   .\scripts\Bootstrap.ps1
   ```

   Bootstrap tạo username **admin**, hỏi mật khẩu ẩn ít nhất **11 ký tự** và xác nhận lại; không cần email. Nếu admin đã có thì giữ nguyên ID, mật khẩu và dữ liệu, không hỏi để ghi đè. Tài khoản admin bị khóa/thiếu quyền cần quản trị hiện tại kiểm tra, bootstrap không tự nâng quyền.
5. Mở hai cửa sổ PowerShell tại dự án:

   ```powershell
   .\scripts\Start-SuperNet.ps1 -Component api
   ```

   ```powershell
   .\scripts\Start-SuperNet.ps1 -Component worker
   ```

6. Trên máy chủ mở `http://localhost:3002`. Đăng nhập Admin, tạo nhóm/người dùng, cấp JOB + ACCESS, cấu hình reviewer và phạm vi. Cấp MANAGER theo nhóm hoặc BOSS theo phạm vi để giao/duyệt/xem báo cáo. Người quản lý không được tự duyệt task của mình.
7. Trong **Thiết lập**, chốt các chính sách cần thiết trước nộp báo cáo/tự timeout/duyệt hạn, ghi người quyết định và lý do. Tạo policy đề nghị với pháp nhân/tiền tệ/hạn mức/người duyệt khi đã được chốt. Thiếu policy trả `CONFIG_REQUIRED`.
8. Dùng [hướng dẫn Windows](docs/WINDOWS.md) để cấu hình quyền dữ liệu, startup tasks và firewall chỉ cho subnet tin cậy. Truy cập từ máy khác bằng `http://<IP-LAN-máy-chủ>:3002`. Máy chủ phải bật và nối mạng. Không port-forward hoặc công khai lên Internet.

PowerShell có thể yêu cầu script được ký theo policy IT; không cần tắt execution policy hay chạy ứng dụng bằng Administrator. Các script Windows chưa được thực thi trong cloud Linux.

## Chạy bằng lệnh chuẩn (Linux hoặc Windows)

```text
npm ci
npm run build
npm run migrate
npm run bootstrap
npm start
# tiến trình thứ hai:
npm run worker
```

Trước `bootstrap`, cung cấp `ADMIN_PASSWORD` qua biến môi trường cục bộ an toàn, không ghi vào Git/log. Trên Windows ưu tiên `Bootstrap.ps1` vì mật khẩu được nhập ẩn. Bản production chạy JavaScript đã build trong `build/server`, frontend trong `dist`, không dùng dev server. Cần build lại sau khi thay mã. `npm run dev` chỉ dành cho phát triển API; có thể chạy `npx vite --host 127.0.0.1` để phát triển UI với proxy API.

## Demo độc lập

Tạo **DB trống riêng** và DATA_DIR riêng, cấu hình `.env` trỏ tới DB đó, đặt `DEMO_MODE=true`, cấp `DEMO_PASSWORD` ít nhất 11 ký tự qua môi trường rồi chạy `npm run migrate` và `npm run seed:demo`. Không chạy seed trên production; script từ chối DB đã có tài khoản. Demo không thêm doanh thu hay hồ sơ HR giả vào dữ liệu thật.

Tài khoản demo: `admin@demo.local`, `manager@demo.local`, `boss@demo.local`, `employee@demo.local`, `support@demo.local`, `hr@demo.local`, `sales@demo.local`, `ads@demo.local`. Tất cả dùng **mật khẩu bạn vừa cung cấp**, không có mật khẩu cố định trong mã. Demo bật các policy cơ bản chỉ trong DB demo và có nhãn MÔI TRƯỜNG DEMO.

## Các luồng có thể thử

- Admin cấp nhiều chuyên môn/phạm vi/thời hạn, thu hồi ngay, vô hiệu tài khoản; API kiểm tra quyền lại mỗi request.
- Tạo nhanh OTHER hoặc loại task chuyên môn; nháp → giao → nhận/từ chối trong 8 giờ làm việc → tiến độ/checkpoint/blocker → nộp phiên bản → yêu cầu sửa/duyệt → đánh giá theo giờ nộp của bản được duyệt và hạn cuối.
- Mời nhiều người hỗ trợ ngay lúc tạo; nhận/từ chối độc lập; contribution riêng; không nhân task hoặc tự hoàn thành task chính.
- Upload private, checksum/type/size, download theo quyền; pending supporter chỉ thấy brief và file được chia sẻ rõ.
- Kế hoạch tuần, báo cáo tự tổng hợp theo role, narrative riêng tư, snapshot/revision bất biến, người nhận trong scope, XLSX thật và so sánh tuần/tháng.
- Content/Designer: thư viện task, hồ sơ sản phẩm/chiến dịch/nội dung, lịch quay, deliverable, bài đăng đã liên kết bản duyệt, live và tài nguyên.
- Vận hành/ADS: nhập tay hoặc XLSX/CSV → chọn sheet/map/profile số → preview/errors → commit nguyên tử → revision khi chồng nguồn; GMV/ads/grain/unique/ratio tách biệt. Bồi hoàn cấp đơn, nhiều SKU không nhân tiền.
- HR: ứng viên/ứng tuyển/phỏng vấn → hồ sơ nhân viên → thử việc/chính thức/nghỉ; thông báo tuyển dedupe, nhắc sinh nhật theo lịch khi policy được chốt; salary/identity cần quyền riêng và được mã hóa.
- Kho: thiết bị, mượn/trả, mẫu và tham chiếu xuất BigSeller; không có sổ tồn cạnh tranh hoặc giả đồng bộ BigSeller.
- Kho tài khoản: grant theo role/hạn; cập nhật bản lưu sau khi xác nhận đã đổi ở nền tảng; AES-256-GCM, lịch sử chỉ Admin, reveal có audit.
- Đề nghị: nhiều loại, policy nhiều bước có snapshot, không tự duyệt, chưa có giá chỉ duyệt nhu cầu, sửa bản đã duyệt cần nộp/duyệt lại. Chứng từ và trạng thái xử lý ngoài hệ thống không tự biến thành thanh toán hay hóa đơn đã phát hành.

## Sao lưu và khôi phục

```text
node scripts/backup.mjs D:/SuperNetBackups
```

Script khóa ghi nghiệp vụ bằng advisory lock dùng chung với API/worker, chạy `pg_dump` custom và copy file, tạo manifest SHA-256. Không tự purge backup. Có thể dùng ổ khác/NAS; tài khoản chạy cần quyền ghi đích. `PG_BIN_DIR` có thể trỏ thư mục công cụ PostgreSQL. VAULT_KEY, mật khẩu DB và cấu hình môi trường cần sao lưu riêng, không đặt cạnh dump trong gói chia sẻ.

Khôi phục vào **DB trống khác** và thư mục dữ liệu trống khác: đặt `RESTORE_DATABASE_URL`, `RESTORE_DATA_DIR` trong môi trường tiến trình rồi chạy `node scripts/restore.mjs <thư-mục-backup>`. Script kiểm tra checksum và từ chối ghi đè DB hiện tại/DB có bảng. Khôi phục đúng VAULT_KEY trước thử vault. Sau đó chạy migration theo phiên bản tương ứng và smoke test bằng cấu hình DB/file đã khôi phục.

## Kiểm thử

`npm test` **xóa dữ liệu các bảng trong DB có hậu tố `_test`** rồi tạo fixture riêng; tuyệt đối không trỏ DATABASE_URL tới dữ liệu thật. `npm run test:e2e` chạy bản build bằng Chromium qua loopback: cần chạy `npm test` trước để tạo tài khoản fixture. Dùng `npx playwright install chromium` nếu máy chưa có trình duyệt cho test. Xem `docs/TESTING.md` để phân biệt kết quả đã chạy và kiểm tra tại công ty còn chờ.

## Sửa đăng nhập / khởi động (06/11/2026)

Nếu Bootstrap.ps1 báo không đọc được trạng thái, xem [chẩn đoán bootstrap](docs/BOOTSTRAP_TROUBLESHOOTING.md). Bản mới hiện mã lỗi gốc, không yêu cầu gửi `.env` hoặc mật khẩu.

Sau khi pull bản mới: `npm ci`, `npm run build`, `npm run migrate`, sau đó chạy `scripts/Bootstrap.ps1` trên Windows hoặc `npm run bootstrap` trong terminal tương tác. Không truyền mật khẩu trên dòng lệnh. Bootstrap Node cũng có lời nhắc ẩn nếu chưa có admin và chưa cấp ADMIN_PASSWORD. Mật khẩu được băm Argon2id; không lưu plaintext hoặc log mật khẩu.

Đăng nhập bằng **Tên đăng nhập**, tài khoản quản trị là **admin**; email chỉ là thông tin liên hệ tùy chọn. Email của tài khoản cũ vẫn đăng nhập được. Migration 004 giữ nguyên hash/ID; tài khoản cũ khác được giữ tên đăng nhập email đầy đủ để tránh đụng tên. Admin duy nhất có email bắt đầu admin và grant Admin được chuyển username thành admin mà không đổi mật khẩu.

Trong `.env`, đặt `HOST=0.0.0.0`, `PORT=3002`. Chạy `npm start` và giữ cửa sổ mở; terminal phải hiện `Super Net is running on 0.0.0.0:3002`. Kiểm tra `http://localhost:3002/api/health`. PowerShell `scripts/Start-SuperNet.ps1` mặc định đặt đúng host/port; có thể chỉ định ListenHost/Port khi kiểm thử riêng.

Log HTTP production trước đây chỉ vào `DATA_DIR/logs`, không in console. Trên cloud chưa tái hiện được việc tiến trình cũ tự thoát thành công; không khẳng định nguyên nhân Windows khi chưa có exit code/log trên máy đó. Bản sửa in banner sau bind thành công, kiểm tra DB/migration, báo lỗi khởi động ra stderr và thoát mã 1. `npm start` từ chối build thiếu/cũ thay vì dùng artifact không đồng bộ; chạy lại `npm run build`. Với `EADDRINUSE`, xem tiến trình chiếm 3002, không tự dừng dịch vụ lạ; lỗi PostgreSQL cần kiểm tra dịch vụ/URL riêng. Nếu vẫn thoát, xem `$LASTEXITCODE` và thông báo ngay trong terminal. Không cần in nội dung .env hay mật khẩu để chẩn đoán.
