# Nghiệm thu và truy vết

Toàn bộ ca trong `acceptance.csv` và `contracts/acceptance.json` có status **NOT_EXECUTED**. Đây là ca dev phải chạy sau triển khai, không phải báo cáo đã test sản phẩm mới.

P0 không được bỏ: quyền, migration, importatomic, duplicate, ranh giới thời gian, snapshot và secret. Mỗi case bổ sung commit/testname/command/output/evidence. Browser cần tương tác luồng thật, không chỉh 1 đúng.

Mẫu originalcontrol ở 14. Fixturetasksort trong `fixtures/synthetic/task_sort.json` dùng anchor cố định. Kiểm thử serverdate và clock fake không đổi policy sản phẩm. KhônglấyN/A thành 0 đểtestpass.

## AUTH01 · Quyền

Yêu cầu: D01,D03

Thực hiện: Đăng nhập 5 ROLE; gọi cả URL/API ngoài menu

Kết quả cần đạt: Menu đúng và API403/404; không lộ dữ liệu

Trạng thái: NOT_EXECUTED

## AUTH02 · Quyền

Yêu cầu: D04

Thực hiện: HR giả request cấp ADMIN/BOSS, hoặc sửa targetAdmin

Kết quả cần đạt: 403 trước mọi insert/grant

Trạng thái: NOT_EXECUTED

## AUTH03 · Quyền

Yêu cầu: D01

Thực hiện: Một user HR+Content, revokeHR

Kết quả cần đạt: Content còn; HRDTO/notification/download bị chặn ngay

Trạng thái: NOT_EXECUTED

## AUTH04 · Quyền

Yêu cầu: D03

Thực hiện: Sếp đọc taskall, giao task; mở draft/payroll

Kết quả cần đạt: Taskall/giao được; draft/payroll denied

Trạng thái: NOT_EXECUTED

## AUTH05 · Quyền

Yêu cầu: D12

Thực hiện: Sàn đúng ROLE nhưng không resourcegrant

Kết quả cần đạt: Không import/readshop; Admin cấp cụ thể mới được

Trạng thái: NOT_EXECUTED

## AUTH06 · Quyền

Yêu cầu: D02

Thực hiện: ResetpasswordAdmin, kiểmlog/DB/idempotency

Kết quả cần đạt: HashArgon 2 id, session cũ thu hồi; không plaintext/cache

Trạng thái: NOT_EXECUTED

## TASK01 · Task

Yêu cầu: E02

Thực hiện: Nhân viên tự tạo và Sếp giao

Kết quả cần đạt: CHECKLIST WAITING, không reviewer/assignment/timeout

Trạng thái: NOT_EXECUTED

## TASK02 · Task

Yêu cầu: D05

Thực hiện: WAITING→DONE có summary; thiếu summary

Kết quả cần đạt: Có summary thành công; thiếu 422,DB không DONE

Trạng thái: NOT_EXECUTED

## TASK03 · Task

Yêu cầu: D05

Thực hiện: Hủy thiếu/trắnglýdo, sau đó hủy hợp lệ

Kết quả cần đạt: Bắt buộc lý do; state+event+actor+time cùngtx

Trạng thái: NOT_EXECUTED

## TASK04 · Task

Yêu cầu: E04

Thực hiện: Sếp sửa deadline trực tiếp; Admin sửa có reason

Kết quả cần đạt: Sếp 403; Adminversion+history, report cũ không đổi

Trạng thái: NOT_EXECUTED

## TASK05 · Task

Yêu cầu: E04

Thực hiện: Owner mở lại DONE; Admin mở lại

Kết quả cần đạt: Owner 403; Admin event mới, không xóa completion cũ

Trạng thái: NOT_EXECUTED

## TASK06 · Task

Yêu cầu: E03

Thực hiện: Hai writer cùng version, retry cùng key

Kết quả cần đạt: Một 409 giữ form; retry không nhân update/event

Trạng thái: NOT_EXECUTED

## TASK07 · Task

Yêu cầu: D05

Thực hiện: LegacyDONE bỏ approved submission bằng SQL/API

Kết quả cần đạt: Constraint vẫn chặn; checklist DONE không fake submission

Trạng thái: NOT_EXECUTED

## TASK08 · Task

Yêu cầu: E05

Thực hiện: LegacySUBMITTED/support sau migrate

Kết quả cần đạt: Duyệt/support route cũ hoạt động, flow không đổi nhầm

Trạng thái: NOT_EXECUTED

## SORT01 · Lọc/sort

Yêu cầu: E01

Thực hiện: FixtureA..G anchor 10/11/2026 14 hVN

Kết quả cần đạt: ATTENTION=A,B,C,D,E,F; DONE ẩn

Trạng thái: NOT_EXECUTED

## SORT02 · Lọc/sort

Yêu cầu: E01

Thực hiện: Đổi DUE_ASC và lọc DONE

Kết quả cần đạt: DUE=B,A,D,C,E,F; DONEchỉG

Trạng thái: NOT_EXECUTED

## SORT03 · Lọc/sort

Yêu cầu: E01

Thực hiện: Due=now, due lúc 00 VN, NEXT7

Kết quả cần đạt: Ranh giới half-open đúng; due=now không overdue

Trạng thái: NOT_EXECUTED

## SORT04 · Lọc/sort

Yêu cầu: E01

Thực hiện: Task tạo tháng 10 còn mở; mặcdịnhOPEN

Kết quả cần đạt: Không mất do filter tuần tạo tự động

Trạng thái: NOT_EXECUTED

## SORT05 · Lọc/sort

Yêu cầu: E01

Thực hiện: Owner/team/multistatus/date AND/OR

Kết quả cần đạt: ORtrongfield,ANDgiữafield; query scope không vượt quyền

Trạng thái: NOT_EXECUTED

## SORT06 · Lọc/sort

Yêu cầu: E01

Thực hiện: 150 tasks,30 page,đổi filter và cursor

Kết quả cần đạt: Totals/facets đúng toàn query; đổi query reset cursor

Trạng thái: NOT_EXECUTED

## SORT07 · Lọc/sort

Yêu cầu: E12

Thực hiện: Save task khi đangedit/sort; hourlyrefresh

Kết quả cần đạt: Không mất form/nhảy vị trí; có reload indicator

Trạng thái: NOT_EXECUTED

## IMP01 · Import

Yêu cầu: D12

Thực hiện: Đổi tên và thứ tự cột 2 file sales

Kết quả cần đạt: Mapping theoheader vẫn đúng; yêu cầu xác nhận sàn

Trạng thái: NOT_EXECUTED

## IMP02 · Import

Yêu cầu: D12

Thực hiện: KOCfile vào sales; missingcolumn

Kết quả cần đạt: Blockingerror đúngsheet/header; nofacts

Trạng thái: NOT_EXECUTED

## IMP03 · Import

Yêu cầu: E09

Thực hiện: XLSX hỏng/password/macros/zipbomb/file 25 MiB+

Kết quả cần đạt: Từ chối có hướng khắc phục; không thực thi code

Trạng thái: NOT_EXECUTED

## IMP04 · Import

Yêu cầu: D12

Thực hiện: KOCdescriptionrow 2 và returns XML row lặp

Kết quả cần đạt: Không tính description; grouping địa chỉ ô đủ data

Trạng thái: NOT_EXECUTED

## IMP05 · Import

Yêu cầu: E13

Thực hiện: 16.201.794₫,44.0,1.39%,ID dài,0 đầu

Kết quả cần đạt: Decimal/count/ratiođúng; ID kiểu chuỗi; precisionloss chặn

Trạng thái: NOT_EXECUTED

## IMP06 · Import

Yêu cầu: E13

Thực hiện: Ngày 31/02;missingyear;date 1904 serial

Kết quả cần đạt: Ngày in valid chặn; noyearguess; serialcorrectorreject

Trạng thái: NOT_EXECUTED

## IMP07 · Import

Yêu cầu: D12

Thực hiện: Cùng file 2 lần;byte khác facts như nhau

Kết quả cần đạt: Raw/canonicalduplicate,không nhân facts

Trạng thái: NOT_EXECUTED

## IMP08 · Import

Yêu cầu: D13

Thực hiện: Cùng range khác facts;Adminreplace

Kết quả cần đạt: Conflict; Adminreasonrevision mới; cũ bất biến

Trạng thái: NOT_EXECUTED

## IMP09 · Import

Yêu cầu: D12

Thực hiện: Partialoverlap hai worker commit đồng thời

Kết quả cần đạt: Serieslock/serializable ngăn 2 nguồn active overlap

Trạng thái: NOT_EXECUTED

## IMP10 · Import

Yêu cầu: D12

Thực hiện: Đổi metadata/revokegrant saupreview rồicommit

Kết quả cần đạt: PREVIEW_STALE/ACCESS_CHANGED;nofacts

Trạng thái: NOT_EXECUTED

## IMP11 · Import

Yêu cầu: D12

Thực hiện: Một row in valid hoặc failure giữa commit

Kết quả cần đạt: Rollback toàn batch; không partial success

Trạng thái: NOT_EXECUTED

## IMP12 · Import

Yêu cầu: G04

Thực hiện: Chưa chọn shop/company,hoặc shop khác company

Kết quả cần đạt: Không preview / commit vượt scope; lỗi đúng trường

Trạng thái: NOT_EXECUTED

## MET01 · Sales

Yêu cầu: D12

Thực hiện: Tổng 7 ngày mẫu TikTok

Kết quả cần đạt: 67.492.567;930 đơn;100 hủy;4 hoàn tiền

Trạng thái: NOT_EXECUTED

## MET02 · Sales

Yêu cầu: D12

Thực hiện: Tổng 7 ngày mẫu Shopee

Kết quả cần đạt: 28.040.779;360 đơn;36 hủy;2 hoàn tiền

Trạng thái: NOT_EXECUTED

## MET03 · Sales

Yêu cầu: E08

Thực hiện: Tính refund rate tuần;nguồn thiếu ngày không đủ tuần

Kết quả cần đạt: SUMcount/SUMorders; coverageincomplete,khôngfill 0

Trạng thái: NOT_EXECUTED

## MET04 · KOC

Yêu cầu: E10,G02

Thực hiện: Nguồn KOC chưa có kỳ, rồi xác nhận khớp tuần

Kết quả cần đạt: Chưa kỳ không vào báo cáo; tổng 52.399.786

Trạng thái: NOT_EXECUTED

## MET05 · KOC

Yêu cầu: D12

Thực hiện: Top 10 tỷ trọng vàzeroGMV

Kết quả cần đạt: Denominatorall 1307 rows; zero→N/A

Trạng thái: NOT_EXECUTED

## MET06 · KOC

Yêu cầu: G05

Thực hiện: Hoa hồng ước tính và thiếu quyết toán

Kết quả cần đạt: 1.678.199 nhãn ước tính; paidcommissionN/A

Trạng thái: NOT_EXECUTED

## MET07 · Returns

Yêu cầu: E08

Thực hiện: Mẫu 113 line/112 order; allCancel

Kết quả cần đạt: 112 đơn; không gọi đơn trả hàng; no doubleorderamount

Trạng thái: NOT_EXECUTED

## MET08 · Returns

Yêu cầu: E08

Thực hiện: Cùng order 2 SKU tiền mâu thuẫn

Kết quả cần đạt: ORDER_LEVEL_AMOUNT_CONFLICT, nobatchcommit

Trạng thái: NOT_EXECUTED

## MET09 · Returns

Yêu cầu: G05

Thực hiện: Raw status không có trongmapping

Kết quả cần đạt: UNMAPPED_STATUS; không tự classify return

Trạng thái: NOT_EXECUTED

## CONT01 · Content

Yêu cầu: D06

Thực hiện: Lưu draft/script;hoàn tất thiếu writer/script

Kết quả cần đạt: Lưu draftcho phép; complete gates không cho thiếu

Trạng thái: NOT_EXECUTED

## CONT02 · Content

Yêu cầu: D06

Thực hiện: Nhảy SCRIPTING→WAITING_EDIT;ngày quay tương lai

Kết quả cần đạt: Chặn order/date; giữ dữ liệu nháp

Trạng thái: NOT_EXECUTED

## CONT03 · Content

Yêu cầu: D06

Thực hiện: Dựng xong clip chưa đăng;2 lượt đăng

Kết quả cần đạt: 1 clipcompleted,2 publication; không cần link đăng để xong dựng

Trạng thái: NOT_EXECUTED

## CONT04 · Content

Yêu cầu: D06

Thực hiện: Externalparticipant, inactiveuser

Kết quả cần đạt: External name không tạo user; inactive phân công mới bị chặn

Trạng thái: NOT_EXECUTED

## CONT05 · Content

Yêu cầu: D06

Thực hiện: Sửa thông tin 2 tab không lưu rồiđóng

Kết quả cần đạt: Dirtyguard và không mất nháp khi đổi tab

Trạng thái: NOT_EXECUTED

## VID01 · Video

Yêu cầu: G01,G03

Thực hiện: 15 videofile hiện có

Kết quả cần đạt: Snapshotviews/tương tác đúng; GMVD7 N/A

Trạng thái: NOT_EXECUTED

## VID02 · Video

Yêu cầu: E06

Thực hiện: D10 snapshot của video đăng cũ;KOC7 dayattribution

Kết quả cần đạt: Không gắnD7 sau ngày đăng

Trạng thái: NOT_EXECUTED

## VID03 · Video

Yêu cầu: E06

Thực hiện: Nguồn window đúng 168 h+publishedprecision

Kết quả cần đạt: READY chỉ khi nguồn xác minh; NOT_DUE trước end

Trạng thái: NOT_EXECUTED

## VID04 · Video

Yêu cầu: E06

Thực hiện: Cùng title khác video ID;videohistoricalunlinked

Kết quả cần đạt: Khôngmerge theo title; giữ unlinked, không bịa script/owner

Trạng thái: NOT_EXECUTED

## HR01 · HR

Yêu cầu: D07

Thực hiện: HR tạo/sửa hồ sơ Admin đã tạo;trùng mã 0 đầu

Kết quả cần đạt: Xem toàn công ty;duplicate 422/409; ID/hash không đổi

Trạng thái: NOT_EXECUTED

## HR02 · HR

Yêu cầu: D07

Thực hiện: Sửa tên OFFICIAL

Kết quả cần đạt: Không biến phase về PROBATION

Trạng thái: NOT_EXECUTED

## HR03 · HR

Yêu cầu: D04

Thực hiện: Createuser+grant+link error giữa

Kết quả cần đạt: Rollbackall; không orphan user; uniqueprofilelink

Trạng thái: NOT_EXECUTED

## HR04 · Ứng viên

Yêu cầu: D07

Thực hiện: Một candidate 2 application;retryonboard

Kết quả cần đạt: 1 person;ứng tuyển riêng;1 employeeperacceptedapp

Trạng thái: NOT_EXECUTED

## HR05 · Lương

Yêu cầu: D07

Thực hiện: Term tương lai/correction cùng ngày

Kết quả cần đạt: Current chưa đổi; history cũ còn; cipher không plaintext

Trạng thái: NOT_EXECUTED

## HR06 · Lương

Yêu cầu: D08

Thực hiện: Sếp/basicDTO/reportexport truy cập amount

Kết quả cần đạt: Denied/không cột amount; HRsalaryauthorized

Trạng thái: NOT_EXECUTED

## HR07 · Hợp đồng

Yêu cầu: D07

Thực hiện: Signedcontractsupersede,nullableexpiry

Kết quả cần đạt: Revision cũ giữ;không nhắc expiry cho end null

Trạng thái: NOT_EXECUTED

## HR08 · Nghỉ việc

Yêu cầu: E11

Thực hiện: Todayleave+handover và future date

Kết quả cần đạt: Todaythu hồi đúng user; ngày tương lai dự kiến không tự khóa

Trạng thái: NOT_EXECUTED

## HR09 · Sinh nhật

Yêu cầu: D11

Thực hiện: Tháng 11 và 29/2 năm không nhuận;DOBmissing

Kết quả cần đạt: Tháng đúng;no missingDOBguess;29/2 policy đúng

Trạng thái: NOT_EXECUTED

## HR10 · Nhắc việc

Yêu cầu: D10,D11

Thực hiện: Workerretry,missedoffset,HRgrantrevoked

Kết quả cần đạt: Dedupe/catchup 1 lần; currentHRonly

Trạng thái: NOT_EXECUTED

## RPT01 · Báo cáo

Yêu cầu: D09

Thực hiện: Task tạo tuần trước done tuần này

Kết quả cần đạt: completed_in_period có task,không coi là phát sinh mới

Trạng thái: NOT_EXECUTED

## RPT02 · Báo cáo

Yêu cầu: D13

Thực hiện: Owner/metric/source thay đổi sau submit

Kết quả cần đạt: Snapshot và Excel revision cũ giữ nguyên

Trạng thái: NOT_EXECUTED

## RPT03 · Báo cáo

Yêu cầu: D01

Thực hiện: User 2 ROLE nộp 1 báo cáo

Kết quả cần đạt: 1 container với nhiều section; task không nhân

Trạng thái: NOT_EXECUTED

## RPT04 · Báo cáo

Yêu cầu: G01,G02

Thực hiện: Thiếu KOC period/D7 source khi nộp

Kết quả cần đạt: Nộp được phần khác; chỉ số null+availability,warnings

Trạng thái: NOT_EXECUTED

## RPT05 · Báo cáo

Yêu cầu: D03,D09

Thực hiện: Sếp truy cập nháp,nhận revision mới,lateSubmit

Kết quả cần đạt: Nháp denied; revisionnotification;lateflagđúng

Trạng thái: NOT_EXECUTED

## RPT06 · Báo cáo

Yêu cầu: D13

Thực hiện: Exportrevisionv 1 vàv 2,file ID bắt đầu 0 hoặc=

Kết quả cần đạt: Đúng renderer/snapshot; ID kiểu chuỗi,không formula injection

Trạng thái: NOT_EXECUTED

## ACC01 · Tài khoản

Yêu cầu: D02

Thực hiện: Revokeaccountshare rồireveal/replay

Kết quả cần đạt: 403/404 ngay; no cachedsecret

Trạng thái: NOT_EXECUTED

## ACC02 · Tài khoản

Yêu cầu: D02

Thực hiện: Platformpasswordversion;webreset

Kết quả cần đạt: CredentialhistoryAdminonly;web hash không plaintext

Trạng thái: NOT_EXECUTED

## MIG01 · Migration

Yêu cầu: D13

Thực hiện: Snapshotfingerprintsbaseline before/after

Kết quả cần đạt: ID/hash/cipher/report/task legacy giữ nguyên

Trạng thái: NOT_EXECUTED

## MIG02 · Migration

Yêu cầu: D01

Thực hiện: UseronlyMANAGER/ADS/WAREHOUSE/EXECUTIVE

Kết quả cần đạt: Adminclassificationqueue; noautoprivilege

Trạng thái: NOT_EXECUTED

## UI01 · UI

Yêu cầu: D01

Thực hiện: Desktop 1440 và mobile 390,các form lỗi/offline

Kết quả cần đạt: Không overflow page;đủ action;giữ nháp/focuserror

Trạng thái: NOT_EXECUTED

## OPS01 · Vận hành

Yêu cầu: D13

Thực hiện: RestoreDB+file+key vào đích riêng,health/cổng 3002

Kết quả cần đạt: Có bằng chứng; Windows LAN nếu chưa thử ghi PENDING

Trạng thái: NOT_EXECUTED
