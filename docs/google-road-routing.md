# Đường bộ: quãng đường và thời gian từ Google Maps

Nhánh `codex/road-google-maps`, dựa trên `claude/v2-sua-loi` tại `334d04532aede873a76d25fbcab8a7f4172f0e41`.

## Hành vi

- Chọn thành phố/địa chỉ cho cả hai bên. Không dùng tâm quốc gia làm địa chỉ đường bộ.
- Bấm tìm tuyến: máy chủ gọi `computeRoutes` một lần, nhận tối đa ba phương án. Km, thời gian và tọa độ của mỗi phương án đi cùng nhau.
- Google Routes: `DRIVE`, `TRAFFIC_AWARE_OPTIMAL`, tránh phà, đơn vị metric. Để trống giờ khởi hành = đi ngay; giờ được nhập theo múi giờ thiết bị rồi gửi dạng RFC3339. Ngày hàng sẵn sàng là một trường riêng, không tự biến thành giờ đi.
- Giao diện hiển thị km và giờ/phút, giờ khởi hành, thời điểm lấy dữ liệu, nguồn Google Maps. Có thể khác ứng dụng Google Maps nếu khác điểm ghim, giờ đi, lựa chọn tránh phà hoặc thuật toán.
- Tuyến ô tô chưa xác nhận giới hạn tải trọng, chiều cao, đường cấm xe tải/container. Google công bố Large Vehicle Routing chỉ dành cho một số khách hàng, tại 48 bang liền nhau của Hoa Kỳ và Nhật Bản; không coi `DRIVE` ở Việt Nam là định tuyến xe tải.
- Thời gian là dự báo lái xe; chưa gồm nghỉ tài xế, bốc/dỡ, thủ tục cửa khẩu. Tuyến quốc tế cần kiểm tra cửa khẩu và quyền quá cảnh riêng.
- Cước vẫn là mô hình USD/km. Khoản 5 bao gồm quãng đường cửa đến cửa; khoản 2/9 không cộng thêm chặng 30 km giả định.
- Không có tuyến, sai key, hết quota, timeout, hoặc host tĩnh trả HTML thay API: báo rõ; không dùng lại đường chim bay × 1.3 và không hiển thị kết quả cũ cho yêu cầu mới.
- Cho phép đường bộ nội địa tại Úc, Nhật, Hàn Quốc. Khi không nối được giữa hai nước, báo lỗi, không tự chuyển kết quả sang đường biển.
- Tọa độ Google chỉ hiển thị trên Google Maps; không đưa vào lớp bản đồ MapLibre hay hoạt ảnh đường biển. Nếu chưa có key bản đồ, vẫn xem được km/giờ và mở liên kết chỉ đường.
- Không lưu hình học/thời gian Google vào localStorage. Khi mở phương án đã lưu, app gọi lại nguồn. Không có cache hướng dẫn đường đi ở máy chủ; phản hồi có `Cache-Control: no-store`.

## Bật nguồn dữ liệu

1. Tạo/chọn Google Cloud project, bật billing và **Routes API**.
2. Tạo key riêng cho máy chủ, giới hạn API là Routes API. Đặt `GOOGLE_ROUTES_API_KEY` trong biến môi trường máy chủ.
3. Bật **Maps JavaScript API** và tạo key công khai riêng, giới hạn API này và HTTP referrer cho đúng tên miền. Đặt `GOOGLE_MAPS_BROWSER_KEY` trong môi trường máy chủ. `/api/road/config` chỉ gửi key trình duyệt này, không gửi key Routes.
4. Chạy backend Node. Render **Static Site không thực thi API này**. Dùng Web Service riêng cho nhánh thử nghiệm, build `npm ci && npm run build`, start `npm start`. Điền hai biến môi trường ở Render; không đưa key vào GitHub hay tin nhắn.
5. Thiết lập quota Google Cloud phù hợp. Máy chủ giới hạn tối đa 30 lần gọi/phút và 4 yêu cầu đồng thời cho mỗi instance; quota dự án là giới hạn bổ sung cho nhiều instance. Một lần tìm tuyến có thể phát sinh phí Google; bản đồ cũng có cách tính phí riêng.
6. Trước khi phát hành công khai, bổ sung điều khoản sử dụng và chính sách quyền riêng tư của app theo yêu cầu Google Maps Platform; giữ nguyên ghi công trên bản đồ. Đây là yêu cầu vận hành dịch vụ, không tự nhận app đã có các trang này.

### Cấu hình bản thử Render riêng

| Trường | Giá trị |
| --- | --- |
| Tên dự kiến | `portrank-road-google-maps` (Render xác nhận tên/URL khi tạo) |
| Repository | `https://github.com/thang16kt-ui/portrank` |
| Branch | `codex/road-google-maps` |
| Service type / runtime | Web Service / Node |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |
| Khóa định tuyến phía server | `GOOGLE_ROUTES_API_KEY` |
| Khóa bản đồ phía trình duyệt | `GOOGLE_MAPS_BROWSER_KEY` |

Giữ bản thử là dịch vụ riêng, không thay nhánh hoặc cấu hình dịch vụ v2. Render cần chọn đúng workspace trước khi tạo. Máy chủ lắng nghe trên `0.0.0.0` và cổng `PORT` do Render cấp.

`/api/health` xác nhận máy chủ đang phục vụ HTTP, không gọi Google hoặc phát sinh truy vấn định tuyến. Kiểm tra `/api/road/config` để xem Google đã được cấu hình chưa; health thành công không có nghĩa là key Google đã hoạt động.

### Chạy local

```sh
cp .env.example .env
# Điền hai key trong .env trên máy của bạn.
npm run dev
```

Vite nạp `.env` cho middleware phía máy chủ; chỉ các biến có tiền tố `VITE_` được build cho client. **Không đặt key Routes với tiền tố `VITE_`.** `npm start` trên Render đọc biến môi trường do Render cấp. Muốn thử bản build local với file `.env`, dùng Node hỗ trợ `--env-file`:

```sh
npm run build
node --env-file=.env server/index.mjs
```

### API

| Đường dẫn | Kết quả |
| --- | --- |
| `GET /api/health` | HTTP 200, `{"status":"ok"}`, không gọi nguồn ngoài |
| `GET /api/road/config` | Trạng thái định tuyến, chế độ DRIVE, key trình duyệt công khai nếu được cấu hình |
| `GET /api/road/routes?origin=106.7,10.77&destination=105.84,21.03` | Tối đa ba tuyến; khoảng cách m, thời gian giây, tọa độ `[lng,lat]`, nguồn, thời điểm lấy/khởi hành |
| Thêm `departureTime=...` | RFC3339 có múi giờ, tại hiện tại/tương lai |

## Kiểm tra

`npm test` và `npm run build`. Các fixture của test Google là dữ liệu mô phỏng giao thức, không phải số đo hay kết quả thực tế đã được Google xác nhận. Chưa thử một truy vấn Google thực nếu chưa có key/billing.

Trước khi bật thật: thử cùng hai địa chỉ và cùng giờ đi trên Google Maps; chọn cùng tùy chọn tránh phà; so từng phương án km/giờ/nét vẽ. Thử thêm không có tuyến, key sai và quota; thử nội địa Úc/Nhật/Hàn. Với xe tải, cần nguồn định tuyến có hồ sơ kích thước/tải trọng ở thị trường vận chuyển.

## Tài liệu chính thức đã đối chiếu ngày 2026-11-18

- [Google computeRoutes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes)
- [Bật Routes API và API key](https://developers.google.com/maps/documentation/routes/get-api-key)
- [Large Vehicle Routing: điều kiện và phạm vi](https://developers.google.com/maps/documentation/routes/lvr-routes-etas)
- [Yêu cầu hiển thị, lưu trữ và ghi công](https://developers.google.com/maps/documentation/routes/policies)
