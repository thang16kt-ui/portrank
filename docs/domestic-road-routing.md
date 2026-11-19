# Bổ sung tuyến nội địa, giữ phương án quá cảnh

Mọi cặp thành phố/địa chỉ cùng quốc gia mặc định tìm cả phương án nội địa và phương án thông thường (có thể quá cảnh). Không có danh sách địa điểm đặc biệt hoặc điều kiện riêng cho Hà Nội – TP.HCM.

Client gửi domesticCountry theo quốc gia của hai đầu và includeTransit=true cho hành trình đường bộ. Máy chủ TomTom chạy song song hai yêu cầu trên cùng tọa độ, điểm đi qua và giờ khởi hành: một yêu cầu tránh biên giới và một yêu cầu thông thường. Mỗi yêu cầu dùng cache, giới hạn tần suất và thời gian chờ hiện có. Không gọi bổ sung khi hai đầu khác quốc gia hoặc có điểm đi qua chủ động chọn ở nước khác. Chặng xe nối cảng vẫn dùng tuyến nội địa riêng để mô phỏng.

TomTom trả cả phần country và traffic. Phần country phải phủ toàn bộ hình học trước khi coi đó là danh sách quốc gia đã xác nhận; mã alpha-3 được đổi thành alpha-2. Nếu thiếu hoặc không đầy đủ, bộ lập phương án dùng rà soát biên giới khái quát và giữ cảnh báo về giới hạn dữ liệu.

Kết quả là hợp của hai nhóm tuyến, loại trùng theo hình học và giữ mã tuyến duy nhất. Nếu một nguồn tìm kiếm lỗi, vẫn giữ nhóm còn lại và hiện ghi chú thiếu phương án bổ sung. Không tạo tuyến hoặc khoảng cách giả. Khoảng cách, thời lượng, hình học và chi phí/km luôn thuộc cùng một phương án.

Tên tuyến có nhãn Nội địa hoặc Quá cảnh kèm quốc gia đi qua. Cả hai nhóm đều được hiển thị để so sánh. Tuyến quá cảnh chưa biết phí cửa khẩu/thủ tục vẫn có khoản chưa tính và nhãn chưa đủ, không được coi tổng tạm tính là tổng hoàn chỉnh. Xếp hạng hiện có đặt phương án đủ khoản trước phương án thiếu khoản.

Kiểm thử bao gồm nhiều quốc gia (VN, TH, AU), tuyến quá cảnh ngắn hơn tuyến nội địa, chỉ có tuyến quá cảnh, loại trùng, mã tuyến duy nhất, lỗi một truy vấn, cache từng truy vấn, điểm đi qua trong/ngoài nước và tính nhất quán khoảng cách/giờ chạy. Bộ biên giới khái quát không xác nhận quyền vận tải hay hạn chế xe tải/container.
