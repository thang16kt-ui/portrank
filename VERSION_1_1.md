# PortRank 1.1 — Phiên bản riêng để chỉnh sửa

- Ngày hoàn thiện: 18/11/2026.
- Nguồn: https://github.com/thang16kt-ui/portrank
- Commit gốc: e60878a6bfa0f07b4286269e0aa6d98903a32c1e.
- Nhánh: codex/portrank-v1.1-ui.
- Bản này dựa trên release/v1 đã review. Nhánh main đã có các thay đổi v2 sau đó; bản 1.1 không bao gồm các thay đổi đó.
- Website Render và nhánh main chưa được cập nhật bằng bản này.

## Đã thay đổi

- Tách luồng Lô hàng / Kết quả / Bản đồ, phù hợp màn hình hẹp.
- Gom form thành Tuyến vận chuyển và Thông tin lô hàng; thu gọn tùy chọn nâng cao.
- Tách nút Tính & so sánh khỏi Xem mô phỏng. Tính giá không tự chạy hoạt ảnh.
- Mở rộng vùng kết quả, thêm cảnh báo khi form đã đổi nhưng kết quả chưa tính lại.
- So sánh chênh lệch chi phí và số ngày với tuyến gốc trong bảng cảng thay thế.
- Đổi tên mục giá để nêu rõ dữ liệu mô phỏng; bỏ chi tiết lập trình khỏi thông báo người dùng.
- Lazy-load bản đồ và lớp 3D; tháo bản đồ khi chuyển màn hình; dừng phát khi rời bản đồ.
- Bỏ qua cập nhật hoạt ảnh khi tab trình duyệt bị ẩn; giữ ổn định mảng dữ liệu tuyến giữa các frame.
- Bắt lỗi khởi tạo WebGL và cô lập lỗi React của bản đồ để phần lập kế hoạch vẫn dùng được.
- Kiểm tra cảng, số container nguyên 1–500, CBM, trọng lượng và ngày hợp lệ.
- Thêm test hồi quy cho form, kết quả, dữ liệu cũ và lỗi khởi tạo bản đồ.

## Chạy trong Codex hoặc terminal

Yêu cầu Node.js hỗ trợ Vite 7 (đã kiểm tra bằng Node 24 trong workspace).

```bash
npm ci
npm run dev
```

Vite lắng nghe tại http://127.0.0.1:5173. Trong Codex Cloud cần chức năng preview/chuyển tiếp cổng để xem từ bên ngoài. Khi chạy trên máy cá nhân, mở địa chỉ đó trong trình duyệt của máy đang chạy server.

```bash
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

## Kiểm chứng và giới hạn

- Bộ test gốc 41 ca được giữ lại; thêm 14 ca kiểm tra đầu vào và 5 ca giao diện bằng jsdom.
- Test WebGL kiểm tra phản ứng khi hàm tạo bản đồ báo lỗi, không đo khả năng dựng hình GPU.
- Vite khởi động và trả HTML HTTP 200 trong môi trường thực thi.
- Preview trình duyệt tách biệt không truy cập được cổng localhost. Chromium trong runtime bị hạn chế socket, nên chưa hoàn thành kiểm tra hình ảnh desktop/mobile hoặc FPS.
- Giá, thời gian, độ ổn định và rủi ro vẫn là mô hình/mô phỏng. Chưa bổ sung API giá, tài khoản, đồng bộ dữ liệu hoặc tính chi phí kho–kho.
- Báo giá đã lưu chỉ nằm trong trình duyệt, tương thích key lưu trữ cũ.

## Đối chiếu phiên bản

Gói xuất gồm bản gốc nguyên trạng và bản 1.1. Không có node_modules, thông tin đăng nhập hay thư mục .git. Chạy npm ci trước khi sử dụng.
