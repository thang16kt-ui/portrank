# Tuyến đường bộ nội địa

Hai điểm cùng quốc gia mặc định xin tuyến tránh qua biên giới. Client gửi domesticCountry theo quốc gia đã chọn; máy chủ TomTom yêu cầu avoid=borderCrossings cùng avoid=ferries, lấy cả các phần country và traffic. Cache tách riêng yêu cầu nội địa với yêu cầu quốc tế.

Máy chủ đọc phần country phủ toàn bộ hình học tuyến và chuẩn hóa ISO alpha-3 thành alpha-2. Tuyến có phần ở nước khác bị loại khỏi yêu cầu nội địa. Nếu dữ liệu quốc gia thiếu hoặc không phủ hết tuyến, không coi đó là bằng chứng tuyến nằm trong nước; phía lập phương án dùng bộ rà soát biên giới trên hình học làm phương án dự phòng.

Bộ lập phương án chỉ đưa tuyến nội địa còn lại vào xếp hạng khi hai điểm cùng nước. Không chọn tuyến quá cảnh chỉ vì ngắn hoặc rẻ hơn. Quãng đường, giờ chạy, hình học và chi phí/km luôn thuộc cùng một tuyến. Tên phương án có tiền tố Nội địa. Nếu không còn tuyến phù hợp, báo chưa tìm được tuyến nội địa, không vẽ đường thẳng và không tự chuyển sang quá cảnh.

Hai điểm khác quốc gia không bị áp điều kiện nội địa. Điểm đi qua do người dùng chủ động chọn ở nước khác là ngoại lệ rõ ràng; các cảnh báo và khoản phí quá cảnh chưa biết vẫn được giữ.

Các kiểm thử bao gồm: tuyến quá cảnh ngắn hơn tuyến trong nước; chỉ có tuyến quá cảnh; Google/OSRM thiếu country metadata; phần country TomTom thiếu phạm vi; cache nội địa/quốc tế; điểm đi qua trong/ngoài nước; khoảng cách và giờ chạy giữ cùng tuyến.

Bộ biên giới khái quát chỉ là rà soát, không xác nhận quyền vận tải hay hạn chế xe tải/container.
