# PortRank – Global Freight Planner

Web app chạy local (giao diện tiếng Việt) để lập kế hoạch vận tải biển container:

- Chọn **cảng đi / cảng đến** bất kỳ trong ~100 cảng container lớn (tìm theo tên, quốc gia, UN/LOCODE, hoặc click trên bản đồ).
- **Hoạt ảnh tàu 3D** chạy trên tuyến đường biển thực tế, trên **quả địa cầu 3D** (MapLibre globe) hoặc **bản đồ phẳng 2D**.
- Ghim cảng đi (xanh) / cảng đến (cam) rơi xuống có hiệu ứng bounce; ghim xám + popup ngắn khi tàu đi qua eo biển / kênh đào.
- Tính **cước ước tính**, **thời gian vận chuyển**, **checklist điều kiện & chứng từ**, **gợi ý Incoterms® 2020** kèm thanh phân chia trách nhiệm.
- **Xếp hạng cặp cảng thay thế** trong bán kính R theo chi phí, độ ổn định giá, thời gian, tần suất tàu, rủi ro.

> ⚠️ **Mọi con số giá là MÔ HÌNH ƯỚC TÍNH / DỮ LIỆU MÔ PHỎNG**, không phải giá thị trường.

## Phiên bản

| | Nhánh | Nội dung |
| --- | --- | --- |
| **V1** | `release/v1` | Một tuyến A → B, hoạt ảnh tàu, cước, điều kiện, Incoterm, xếp hạng cảng thay thế |
| **V2** | `v2` | **Mạng tuyến đa cảng**: vẽ đồng thời mọi tuyến từ các cảng quanh A tới các cảng quanh B, nhãn thời gian / chi phí / quãng đường ngay trên đường, các tàu "đua" theo số ngày thực, nền bản đồ tối giản, hoạt ảnh chậm hơn |

### V2 – Mạng tuyến đa cảng
- Lấy mọi cảng trong bán kính R quanh **A** và quanh **B** (mặc định 500 km), ghép tất cả cặp → mỗi cặp một tuyến.
- Mỗi tuyến một màu theo thứ hạng (8 tuyến đầu; còn lại màu xám), các tuyến chạy chung được **tách làn song song** kiểu bản đồ metro, có viền trắng để nổi trên nền.
- **Nhãn trên đường**: số ngày · cước ước tính · hải lý. Nhãn chồng nhau được tự lật phía hoặc ẩn (ưu tiên hạng cao); rê chuột/click để xem tên tuyến. Chọn hiển thị nhãn Tất cả / Top 5 / Ẩn.
- **Hoạt ảnh "đua"**: tất cả tàu xuất phát cùng lúc, thời gian tính theo NGÀY nên tuyến nhanh cập bến trước (🏁 thứ tự về đích). Mặc định ~1 giây thực / 1 ngày hành trình (15–60 giây), tốc độ x0.5 / x1 / x2 / x5 – chỉnh trong `src/config/routing.ts`.
- Rê chuột lên đường / nhãn / dòng trong bảng **"Mạng tuyến"** → làm nổi tuyến đó, các tuyến khác mờ đi; click → các tab Tổng quan / Chi phí / Điều kiện / Incoterm chuyển sang tuyến đó.
- Nền bản đồ: *Sáng tối giản* (OpenFreeMap Positron, mặc định), *Chi tiết* (Liberty), *Tối*. Mặc định bản đồ phẳng 2D; vẫn chuyển được sang 3D Globe.
- Chuyển về chế độ một tuyến (như V1) ở thanh bên: *Chế độ hiển thị → Một tuyến A → B*.
- Logic thuần trong `src/lib/network.ts` (có test `tests/network.test.ts`).

## Chạy

```bash
npm install
npm run dev        # http://localhost:5173
```

Không cần API key. Bản đồ nền lấy từ [OpenFreeMap](https://openfreemap.org) (`tiles.openfreemap.org/styles/liberty`) nên cần Internet.

Các lệnh khác:

| Lệnh | Mô tả |
| --- | --- |
| `npm test` | Unit test (Vitest) cho `routing`, `pricing`, `incoterm`, `ranking`, `rules`, `network` |
| `npm run build` | Kiểm tra type + build production vào `dist/` |
| `npm run gen:ship` | Sinh lại model tàu `public/models/ship.glb` |
| `npx tsx scripts/check-land.ts [searoute\|graph] [ALL\|POL-POD]` | Kiểm tra tuyến không cắt qua đất liền (Natural Earth 1:50m) |
| `npx tsx scripts/build-marnet-mask.ts` | Tiền xử lý mạng tuyến searoute (nắn cạnh cắt qua đảo/đất liền) |

## Cấu trúc

```
src/
  components/  Header, Sidebar, PortCombobox, MapView, DeckLayers, MapOverlays, PlaybackBar,
               ResultPanel, Overview, CostTable, Conditions, IncotermBar, AltRanking
  config/      pricing.ts (hệ số cước), rules.ts (rule điều kiện dạng dữ liệu), weights.ts (trọng số xếp hạng),
               routing.ts (tốc độ tàu, engine, thời lượng hoạt ảnh)
  data/        ports.ts (~100 cảng), seaNodes.ts (eo biển/kênh đào + đồ thị dự phòng), marnetPatch.json
  lib/         routing.ts, geo.ts (densify, bearing, unwrap 180°), pricing.ts (RateProvider), transit.ts,
               rules.ts, incoterm.ts, ranking.ts, results.ts
  store/       useAppStore.ts (Zustand)
  pages/       PriceWatch (Theo dõi giá – Recharts), SavedQuotes (Báo giá đã lưu – localStorage)
public/models/ship.glb
scripts/       gen-ship-glb.mjs, build-marnet-mask.ts, check-land.ts, land.ts
tests/         *.test.ts (Vitest)
```

## Tìm tuyến

- **Engine chính – searoute-js:** dùng mạng lưới hàng hải *marnet* đi kèm gói npm [`searoute-js`](https://www.npmjs.com/package/searoute-js)
  (dữ liệu Eurostat/ORNL). Hàm `searoute()` gốc có 2 hạn chế: không nối được kinh tuyến 180° (Hải Phòng → Los Angeles
  ra ~20.700 hải lý vì đi vòng thế giới) và không có tuỳ chọn tránh vùng. Vì vậy `src/lib/routing.ts` dựng lại đồ thị từ
  chính dữ liệu đó: nối các đỉnh ±180°, bỏ tuyến Bắc Cực, lọc cạnh trong vùng tránh (Biển Đỏ/Suez, Panama) và chạy Dijkstra.
- **Làm sạch mạng:** `scripts/build-marnet-mask.ts` kiểm từng cạnh với bản đồ đất liền Natural Earth 1:50m (`world-atlas`):
  đỉnh nằm trên bờ được dời ra biển, cạnh cắt qua đảo được nắn qua 1–2 điểm trung gian, cạnh không sửa được thì bỏ
  → `src/data/marnetPatch.json`. Kênh đào Suez/Panama/Kiel và eo Bosphorus/Dardanelles được miễn.
- **Engine dự phòng – đồ thị eo biển:** ~150 nút (eo biển, kênh đào, mũi đất) + Dijkstra trong `src/data/seaNodes.ts`.
  Khi bật *Tránh Biển Đỏ* thì bỏ các cạnh `BAB-RED`, `RED-SUEZ`… Tự động dùng nếu engine chính không ra tuyến; có thể
  chọn thủ công ở *Sidebar → Nâng cao*.
- **Cảng sông/vịnh** (Cát Lái, Hamburg, Antwerp, Houston, Seattle…) có `approach` – luồng từ bến ra biển thoáng.
- Toạ độ tuyến được **làm dày** ~20 km/điểm theo great-circle, kinh độ được *unwrap* để không vẽ ngang bản đồ khi qua 180°.
- Phát hiện tuyến **đi qua** Suez / Panama / Mũi Hảo Vọng / các eo biển (bán kính quanh từng điểm) để hiển thị và tính phụ phí.

## Mô hình tính toán

- **Thời gian:** `T = hải lý / (tốc độ × 24) + 2 ngày làm hàng + 1 ngày/kênh đào`; 16 hải lý/giờ (reefer 17) – `src/config/routing.ts`.
- **Cước (USD):** cước gốc 40′ = `550 + 0.27 × hải lý` (O/F 82%, BAF/LSS 18%), hệ số container/loại hàng, phụ phí
  Suez/Panama/Mũi Hảo Vọng, THC hai đầu, LCL theo W/M + CFS, phí chứng từ, khoảng ±12% – tất cả trong `src/config/pricing.ts`.
- **RateProvider:** interface để thay bằng API giá thật (Freightos, Xeneta, API hãng tàu) – xem `createCsvRateProvider()`
  trong `src/lib/pricing.ts` cho ví dụ đọc bảng giá CSV của forwarder.
- **Điều kiện & chứng từ:** rule engine dạng dữ liệu (`src/config/rules.ts`): VGM, ISPM 15, ENS/ICS2, ENS Anh, ISF 10+2,
  eManifest, C/O EVFTA/UKVFTA/RCEP/CPTPP/ATIGA…, PVoC, SONCAP, kiểm dịch Úc, reefer/DG/OOG, cảnh báo Biển Đỏ / Mũi Hảo Vọng / Panama.
- **Incoterm:** theo vai trò + ai book tàu; hàng container ưu tiên FCA/CPT/CIP (khuyến nghị ICC), FOB/CFR/CIF chỉ cho hàng quá khổ.
- **Xếp hạng:** mọi cặp POL × POD trong bán kính R; chuẩn hoá 0–100; `Score = 35% chi phí + 25% ổn định giá + 20% thời gian
  + 10% tần suất + 10% rủi ro` (đổi theo *Ưu tiên*, có slider). Độ ổn định = CV của **chuỗi giá 12 tháng mô phỏng, seed cố định**.

## Model tàu 3D

`public/models/ship.glb` là tàu container low-poly **do script `scripts/gen-ship-glb.mjs` sinh ra bằng code** (thân tàu, cabin,
ống khói, ~200 container nhiều màu) – không dùng tài sản bên ngoài; phát hành theo **CC0**. Có thể thay bằng model CC0 khác
(ví dụ từ Poly Pizza / Kenney / Sketchfab CC0): đặt mũi tàu theo trục +X, trục Z hướng lên, dài 1 đơn vị.
Nếu không tải được model, app dùng icon tàu 2D xoay theo hướng di chuyển.

## Nguồn dữ liệu & giấy phép

- Bản đồ nền: © OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors.
- Mạng tuyến biển: `searoute-js` (MIT) / marnet – Eurostat, Oak Ridge National Labs.
- Đường bờ biển để kiểm tra (chỉ dùng trong script): Natural Earth qua `world-atlas` (public domain).
- Danh sách cảng, số tuyến/tuần, chỉ số ùn tắc, chuỗi giá: **dữ liệu tĩnh / mô phỏng** để minh hoạ.
