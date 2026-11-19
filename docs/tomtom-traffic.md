# TomTom Traffic và hành trình xe–tàu–xe

## Bật trên máy chủ hiện có

Giữ nguyên Web Service Node, lệnh build và start của bản đường bộ. Đặt hai biến môi trường:

```text
ROAD_ROUTING_PROVIDER=tomtom
TOMTOM_API_KEY=<đặt bằng trường secret của dịch vụ hosting>
```

Không đặt key trong `VITE_*`, mã nguồn, bundle trình duyệt hoặc tệp báo cáo. Key đã có quyền Routing API và Traffic API là đủ; không tạo key mới khi đã có key hợp lệ. Sau khi cập nhật code và biến môi trường, triển khai lại dịch vụ.

## Hành vi

- Đường bộ độc lập: km, giây lái xe, polyline và các đoạn ùn tắc cùng lấy từ TomTom Calculate Route v1. Dịch vụ dùng hồ sơ `car`, tránh phà. Biểu tượng xe tải là hoạt ảnh; chưa xác nhận các giới hạn tải trọng/chiều cao/đường cấm xe tải.
- Đường biển giữa hai thành phố: chỉ lấy hai chặng đường bộ cho phương án cảng đang xem. Xe đi từ thành phố đến đường vào cảng, sau đó tàu chạy theo geometry tuyến biển của PortRank, rồi xe đi từ cảng đến thành phố nhận. Cảng ghim trên mặt nước có thể được nguồn đường bộ ghép vào đường tiếp cận gần đó; đây chưa phải xác nhận cổng kho/bến cụ thể.
- Giữ nút chuyển sang bản đồ 3D hiện có. Bản đồ hành trình Leaflet không cần WebGL. Lỗi bản đồ được cô lập khỏi form và bảng kết quả.
- Camera có thể theo từng chặng; có phát/dừng, tua và tốc độ mô phỏng. Mỗi chặng xe có đủ thời gian hiển thị. Tốc độ phát là minh họa tăng tốc; tổng thời gian biển và dự toán chi phí vẫn thuộc mô hình ước tính đang có.
- Màu nền từ TomTom Traffic raster `relative0`: tốc độ tương đối so với lúc thông thoáng. Không gửi `thickness` với style này vì endpoint thực tế trả HTTP 400. Có thể ẩn/hiện giao thông; màu trống không được coi là đường thông thoáng.
- Các đoạn sự cố/ùn tắc trả về trong Calculate Route được vẽ đè lên tuyến. Đi ngay được ghi `live`; chọn giờ tương lai được ghi `forecast`. Lớp màu nền luôn là giao thông hiện tại, không đổi thành dự báo theo đồng hồ hoạt ảnh.
- Khi trang đang mở và hiển thị, cập nhật giao thông mỗi 120 giây. Chặng giao hàng sau hành trình biển cũng lấy tình trạng **hiện tại**, không giả làm dữ liệu thực của ngày tàu đến.
- Các cảng nước khác có thể được bộ chọn cảng đề xuất. Giao diện hành trình phải hiện cảnh báo biên giới, quyền quá cảnh và phí thủ tục chưa xác nhận.

## API nội bộ

| Đường dẫn | Kết quả |
| --- | --- |
| `/api/road/config` | Nguồn đang chọn, tình trạng cấu hình; không có server key |
| `/api/road/routes?origin=lng,lat&destination=lng,lat` | Tối đa ba tuyến có cùng km, ETA, geometry, `trafficSections` |
| Thêm `via=lng,lat` | Một điểm đi qua, giữ thứ tự đầu–qua–cuối |
| Thêm `departureTime=RFC3339` | Dự báo giờ đi trong tương lai, từ chối thời điểm quá khứ |
| `/api/traffic/config` | Có cấu hình TomTom hay chưa và chu kỳ cập nhật |
| `/api/traffic/tiles/z/x/y.png` | PNG giao thông được proxy; không lộ key trong URL của trình duyệt |

Chỉ cho phép tọa độ và tile hợp lệ tới upstream cố định; không có tham số chọn URL tùy ý. Backend cache RAM có giới hạn trong 120 giây, gộp yêu cầu trùng, tối đa 8 yêu cầu đồng thời và 150 lần bắt đầu upstream/phút mỗi instance. Cache RAM không phải quota tháng toàn hệ thống. Dùng TomTom Freemium để nhà cung cấp dừng khi hết hạn mức thay vì tự nâng cấp gói.

Lỗi nguồn, hết quota, không có đường, hình học sai hoặc đường bị ghép cách đầu/cuối hơn 5 km sẽ trả lỗi. Không thay bằng số km tự đoán và không phát trọn hành trình nếu thiếu chặng cần thiết. Bộ kiểm tra không xác nhận tính pháp lý của cửa khẩu hay việc lưu thông xe tải.

## Kiểm tra

`npm test` và `npm run build`. Fixture giao thức là dữ liệu giả lập dùng trong test. Kiểm tra riêng một lượt đường bộ và một hành trình hai đầu cảng với key thật trên bản triển khai trước khi bàn giao. Ghi lại kết quả, không ghi lại key.

Tài liệu đối chiếu:

- https://docs.tomtom.com/routing-api/documentation/tomtom-maps/v1/calculate-route
- https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-flow/raster-flow-tiles
- https://docs.tomtom.com/pricing
