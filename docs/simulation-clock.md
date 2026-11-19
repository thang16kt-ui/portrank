# Mô phỏng theo ngày, giờ khởi hành — yêu cầu 5–6

## Cách dùng

1. Chọn địa chỉ đi/đến và phương thức đường bộ hoặc đường biển.
2. Nhập **Ngày, giờ khởi hành**, hoặc bấm **Đi ngay** để dùng thời điểm lấy tuyến.
3. Bấm **Tìm tuyến tối ưu**. Đổi giờ hoặc địa chỉ sau đó sẽ hiện nhắc tính lại kết quả.
4. Mở **Thông tin hành trình** để xem giờ mô phỏng, chặng đang đi, giờ đến dự kiến và trạng thái. Trên bản đồ chỉ giữ thanh chọn chặng và điều khiển phát/dừng, tiến độ, theo chặng, tốc độ. Giờ tương lai có nhãn **Dự báo**; ghi chú giới hạn nằm ở tooltip nhãn, không tạo đoạn văn dài.
5. Phát/dừng, kéo tiến độ hoặc chọn tốc độ xem. Bấm một chặng để nhảy tới đầu chặng đó.

Giờ nhập và giờ hiển thị dùng múi giờ thiết bị, ghi rõ trên giao diện. Yêu cầu API chuyển thành ISO 8601 có múi giờ. Không chấp nhận ngày không hợp lệ hoặc giờ đã qua.

## Quy tắc thời gian

- Đồng hồ và thanh tiến độ dùng cùng tổng thời lượng. Giờ đến = giờ khởi hành + tổng thời lượng các chặng.
- Tốc độ xem chỉ tác động hoạt ảnh, không tác động tổng thời gian, ETA hoặc báo giá.
- Chặng xe đầu tiên dùng giờ khởi hành đã chọn. Chặng xe cuối dùng giờ kết thúc chặng xe đầu cộng thời lượng chặng biển. Không gọi cả hai đầu cảng cùng giờ hiện tại.
- Một lần tính giữ cố định tuyến, thời lượng và mốc khởi hành trong khi phát. Lớp giao thông hiện tại có thể cập nhật riêng. Tính lại tuyến để lấy bộ thời gian mới.
- Nếu thiếu tuyến nội địa hoặc API lỗi, không phát trọn hành trình và không tạo ETA toàn trình từ các chặng còn lại.
- OSRM vẫn mô phỏng đồng hồ theo giờ người dùng chọn, nhưng không có dự báo giao thông theo giờ đó.
- Bản đồ biển 3D cũ hiển thị rõ chỉ tính chặng biển. Xe–tàu–xe hiển thị tổng thời lượng ba chặng. Chưa cộng chờ chuyến/bốc dỡ ở cảng; lịch vận hành thực tế cần đối chiếu trước khi vận chuyển.

## Phạm vi giao thông

Chọn giờ tương lai có thể lấy ETA dự báo từ nguồn định tuyến. Điều này không tự xác nhận màu giao thông là dự báo tại từng thời điểm xe đi qua. Giao diện phân biệt rõ dữ liệu giao thông hiện tại và phần dự báo chưa xác nhận; không tự tạo chu kỳ giờ cao điểm.

Không thêm số tài xế, biến thời gian nghỉ hoặc lịch đổi lái.

## Xác minh

- Kiểm thử chuyển đổi giờ nhập, ngày không hợp lệ/đã qua, múi giờ Việt Nam, qua nửa đêm/năm và hành trình một tuần.
- Kiểm thử đồng hồ/ETA không phụ thuộc tốc độ xem, ranh giới đổi chặng và vị trí kéo tiến độ.
- Kiểm thử giờ khởi hành chặng cuối, lỗi chặng đầu, thiếu dữ liệu và trạng thái giao thông chưa xác nhận.
- `npm test` và `npm run build`.
- Toàn bộ 306 kiểm thử qua. Sau lần rà cuối, 25 kiểm thử liên quan thời gian/TomTom/Google traffic được chạy lại và qua.
- API công khai của bản PortRank hiện có trả HTTP 200 với `trafficMode: forecast`, giữ đúng giờ khởi hành tương lai gửi lên. Đây là kiểm tra kết nối/giờ đi, không phải xác minh độ chính xác dự báo từng đoạn đường.
- Đã triển khai và kiểm tra trên web: nhập giờ tương lai, nhắc tính lại khi đổi đầu vào, phát/dừng, kéo 50%/100%, đổi tốc độ và chuyển ba chặng. Giờ đến không đổi theo tốc độ xem.
- Vùng nhìn bản đồ chừa khoảng theo chiều cao thực tế của thanh điều khiển để tránh che vị trí xe/tàu.

Khóa API là cấu hình của máy chủ. Không có khóa Google/TomTom trong thay đổi này.

## Bố cục mô phỏng

Giờ mô phỏng nằm trong hộp Thông tin hành trình có thể thu gọn, chia hai cột; mở mặc định trên màn hình rộng. Thanh điều khiển sát đáy bản đồ chỉ có chọn chặng, phát/dừng, tiến độ, theo chặng và tốc độ. Bỏ ba dòng cập nhật/phóng to/giải thích dự báo dài; nhãn Dự báo và tooltip giữ đúng ý nghĩa nguồn dữ liệu. Bản đồ chừa khoảng bên cạnh hộp thông tin khi mở để nhìn được xe/tuyến. Bảng chi phí và xếp hạng tuyến giữ bố cục hiện có.
