# Đường bộ: bản thử OSRM và tùy chọn Google Maps

Bản thử riêng: https://portrank-road-google-maps.onrender.com/ · nhánh `codex/road-google-maps`. Tên miền giữ nguyên sau khi chuyển nguồn sang OSRM. Không đổi bản v2 hoặc dịch vụ `portrank-v2-sua-loi`.

## Bản thử đang chọn: OpenStreetMap / OSRM

Đặt `ROAD_ROUTING_PROVIDER=osrm-demo` trên backend Node. Không cần Google API key. Chọn thành phố/địa chỉ cụ thể ở hai đầu, rồi bấm tìm tuyến. Km, thời gian và toàn bộ hình học thuộc cùng một phương án từ OSRM; tối đa ba phương án. Bản đồ Leaflet 1.9.4 dùng nền OSM, không cần WebGL; giữ ghi công ở góc bản đồ.

- Hồ sơ **ô tô**, chưa xác nhận giới hạn chiều cao, tải trọng, đường cấm xe tải/container.
- Thời gian **chưa xét kẹt xe**, không dự báo theo giờ khởi hành, chưa cộng nghỉ tài xế, bốc dỡ hoặc thủ tục/chờ cửa khẩu. Không hiển thị ô chọn giờ đi ở chế độ OSRM.
- Cước vẫn là ước tính USD/km; tuyến thật không biến cước thành giá thị trường. Tuyến đường bộ cửa đến cửa không cộng thêm hai chặng kho–bãi 30 km.
- Demo không hỗ trợ `exclude=ferry` trong cấu hình đã thử. App yêu cầu `steps=true` và bỏ mọi phương án có bước không phải `driving`, gồm phà/tàu. Nếu không còn phương án liên tục thì báo lỗi.
- Từ chối điểm bị dời sang đường cách hơn 5 km. Không có đường/lỗi nguồn/timeout thì báo lỗi, xóa kết quả của yêu cầu cũ; không quay về Haversine × 1.3.
- OSRM demo dành cho sử dụng phi thương mại hợp lý, tối đa 1 truy vấn/giây và không bảo đảm hoạt động/cập nhật dữ liệu. Backend một instance chỉ cho một truy vấn đang chạy, tối thiểu 1.1 giây giữa các lần bắt đầu, cache RAM tối đa 8 tuyến trong 5 phút. Giao diện giữ thời điểm lấy dữ liệu gốc khi dùng cache. Không chạy truy vấn hàng loạt các cặp cảng.
- Nền bản đồ tải theo khung nhìn và dùng HTTP cache bình thường của trình duyệt, không tải sẵn bản đồ offline.

Khi đưa vào vận hành thương mại hoặc nhiều người dùng, chuyển sang OSRM tự vận hành hoặc dịch vụ định tuyến có hợp đồng/quota phù hợp. Tìm nguồn hỗ trợ xe tải nếu dùng để điều xe thực tế.

## Chạy và triển khai

```sh
cp .env.example .env
npm ci --include=dev
npm run dev
```

Vite đọc `.env` cho middleware server. Với bản build:

```sh
npm run build
node --env-file=.env server/index.mjs
```

Render dùng **Web Service / Node**, build `npm ci --include=dev && npm run build`, start `npm start`, `NODE_VERSION=24.22.1`, `ROAD_ROUTING_PROVIDER=osrm-demo`. Server lắng nghe `0.0.0.0:$PORT`. API không chạy trên Render Static Site.

| API | Kết quả |
| --- | --- |
| `GET /api/health` | HTTP 200, không gọi nguồn ngoài |
| `GET /api/road/config` | `provider=osrm`, `configured=true`, `trafficAware=false`, `demo=true`, không có key |
| `GET /api/road/routes?origin=106.7,10.77&destination=105.84,21.03` | Km tính từ `distanceMeters`, giờ/phút từ `durationSeconds`, tọa độ `[lng,lat]`, nguồn và thời điểm lấy |

## Tùy chọn Google

Đặt `ROAD_ROUTING_PROVIDER=google` (cũng là mặc định nếu chưa đặt biến), cấu hình `GOOGLE_ROUTES_API_KEY` và `GOOGLE_MAPS_BROWSER_KEY`. Không tự chuyển sang OSRM khi Google lỗi. [Hướng dẫn cấu hình Google](google-road-routing.md). Hình học Google chỉ vẽ trên Google Maps; hình học OSRM chỉ đi vào bản đồ OSM. Key máy chủ không gửi cho trình duyệt hoặc OSRM.

## Kiểm tra và phạm vi

Chạy `npm test` và `npm run build`. Test bao gồm lỗi nguồn, dữ liệu sai, phà/tàu, giới hạn truy vấn, cache, timeout, và sự khớp nhau của km/thời gian/nét vẽ/báo giá. Fixture chỉ mô phỏng giao thức, không phải kết quả đo thực tế. Kiểm tra một tuyến thực trên dịch vụ đã deploy trước khi bàn giao.

Thay đổi này xử lý phương thức **đường bộ độc lập**. Các chặng nội địa của phương án đường biển vẫn dùng mô hình cũ; không coi chúng đã được định tuyến OSRM.

## Nguồn chính thức đối chiếu 2026-11-19

- https://project-osrm.org/docs/v26.6.1/http.html
- https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server
- https://leafletjs.com/reference-1.9.4.html
- https://operations.osmfoundation.org/policies/tiles/
