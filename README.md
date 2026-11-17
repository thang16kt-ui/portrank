# PortRank – Global Freight Planner

Web app chạy local (giao diện tiếng Việt) để lập kế hoạch vận tải biển container:

- Chọn **cảng đi / cảng đến** bất kỳ trong ~100 cảng container lớn (tìm theo tên, quốc gia, UN/LOCODE, hoặc click trên bản đồ).
- **Hoạt ảnh tàu 3D** chạy trên tuyến đường biển thực tế, trên **quả địa cầu 3D** (MapLibre globe) hoặc **bản đồ phẳng 2D**.
- Ghim cảng đi (xanh) / cảng đến (cam) rơi xuống có hiệu ứng bounce; ghim xám + popup ngắn khi tàu đi qua eo biển / kênh đào.
- Tính **cước ước tính**, **thời gian vận chuyển**, **checklist điều kiện & chứng từ**, **gợi ý Incoterms® 2020** kèm thanh phân chia trách nhiệm.
- **Xếp hạng cặp cảng thay thế** trong bán kính R theo chi phí, độ ổn định giá, thời gian, tần suất tàu, rủi ro.
- **Thuế nhập khẩu theo mặt hàng** (tab *Thuế NK*): MFN, ưu đãi FTA theo xuất xứ, thuế bổ sung, VAT/GST, phí khác – dữ liệu Mỹ & Anh tự động cập nhật từ API chính thức.

> ⚠️ **Mọi con số giá là MÔ HÌNH ƯỚC TÍNH / DỮ LIỆU MÔ PHỎNG**, không phải giá thị trường.

## Chạy

```bash
npm install
npm run dev        # http://localhost:5173
```

Không cần API key. Bản đồ nền lấy từ [OpenFreeMap](https://openfreemap.org) (`tiles.openfreemap.org/styles/liberty`) nên cần Internet.

Các lệnh khác:

| Lệnh | Mô tả |
| --- | --- |
| `npm test` | Unit test (Vitest) cho `routing`, `pricing`, `incoterm`, `ranking`, `rules`, `tariff` |
| `npm run build` | Kiểm tra type + build production vào `dist/` |
| `npm run gen:ship` | Sinh lại model tàu `public/models/ship.glb` |
| `npm run tariffs:update` | Tải lại biểu thuế (Mỹ, Anh, HS 2022) cho danh mục hàng; thêm `-- US` để chỉ tải một nước |
| `npm run tariffs:check` | Kiểm tra mã trong danh mục hàng với biểu thuế hiện hành, gợi ý mã còn thiếu (không ghi file) |
| `npx tsx scripts/check-land.ts [searoute\|graph] [ALL\|POL-POD]` | Kiểm tra tuyến không cắt qua đất liền (Natural Earth 1:50m) |
| `npx tsx scripts/build-marnet-mask.ts` | Tiền xử lý mạng tuyến searoute (nắn cạnh cắt qua đảo/đất liền) |

## Cấu trúc

```
src/
  components/  Header, Sidebar, PortCombobox, MapView, DeckLayers, MapOverlays, PlaybackBar,
               ResultPanel, Overview, CostTable, TaxTab, Conditions, IncotermBar, AltRanking
  config/      pricing.ts (hệ số cước), rules.ts (rule điều kiện dạng dữ liệu), weights.ts (trọng số xếp hạng), taxes.ts (VAT/GST, phí),
               routing.ts (tốc độ tàu, engine, thời lượng hoạt ảnh)
  data/        ports.ts (~100 cảng), seaNodes.ts (eo biển/kênh đào + đồ thị dự phòng), marnetPatch.json,
               tariff/ (danh mục hàng, biểu thuế tự động + nhập tay)
  lib/         routing.ts, geo.ts (densify, bearing, unwrap 180°), pricing.ts (RateProvider), transit.ts,
               rules.ts, incoterm.ts, ranking.ts, results.ts, tariff.ts (tra mã & tính thuế)
  store/       useAppStore.ts (Zustand)
  pages/       PriceWatch (Theo dõi giá – Recharts), SavedQuotes (Báo giá đã lưu – localStorage)
public/models/ship.glb
scripts/       gen-ship-glb.mjs, build-marnet-mask.ts, check-land.ts, land.ts, update-tariffs.ts
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

## Thuế nhập khẩu theo mặt hàng

Tab **Thuế NK** tính các loại thuế áp dụng khi hàng vào nước có cảng đến, theo mặt hàng, xuất xứ và trị giá FOB nhập ở thanh bên:

| Loại | Nội dung | Cách tính |
| --- | --- | --- |
| Thuế nhập khẩu (MFN) | Thuế suất thông thường của dòng hàng; biểu riêng cho một số xuất xứ (vd. cột 2 của Mỹ) | % × trị giá hải quan |
| Ưu đãi FTA | Thuế suất theo hiệp định mà xuất xứ được hưởng (KORUS, USMCA, UKVFTA, CPTPP, EVFTA…). Tự chọn mức thấp nhất, kèm chứng từ C/O cần có | thay cho MFN nếu thấp hơn |
| Thuế bổ sung | Chống bán phá giá, đối ứng, Section 301… theo xuất xứ. Mục có điều kiện phức tạp (vd. chương 99 của Mỹ) chỉ hiển thị **Cần xác minh**, không cộng vào tổng | % × trị giá hải quan |
| VAT / GST | Theo dòng hàng (Anh – từ API) hoặc thuế suất tiêu chuẩn của nước nhập (`src/config/taxes.ts`) | % × (CIF + thuế NK + thuế bổ sung + TTĐB) |
| Phí khác | MPF, HMF (Mỹ) | % × trị giá hải quan |

Trị giá hải quan = **CIF** (FOB + cước & phí đến cảng nhập + bảo hiểm 0,3%) với đa số nước; **FOB** với Mỹ, Canada, Úc, New Zealand, Nam Phi.
Thuế suất dạng tuyệt đối (¢/kg, €/100 kg…) được hiển thị nhưng chưa cộng vào tổng.

### Dữ liệu & cách cập nhật

```
src/data/tariff/
  products.csv      Danh mục hàng: sku, tên, HS6 và mã quốc gia của từng nước (cột VN, EU, US, GB…)
  manual.csv        Thuế nhập tay cho nước chưa có API (EU, Việt Nam…); cột reviewedAt = ngày đã đối chiếu
  generated/*.json  Dữ liệu tải tự động – KHÔNG sửa tay
src/config/taxes.ts VAT/GST tiêu chuẩn theo nước, phí MPF/HMF, nước tính thuế trên FOB, ngưỡng cảnh báo dữ liệu cũ
```

| Nước | Nguồn | Cập nhật |
| --- | --- | --- |
| HS 2022 (6 số) | GitHub [`datasets/harmonized-system`](https://github.com/datasets/harmonized-system) | Tự động – kiểm tra HS6 trong danh mục còn hợp lệ |
| Mỹ | [USITC HTS REST API](https://hts.usitc.gov/) – MFN, ưu đãi FTA (cột Special), cột 2, thuế bổ sung chương 99 theo nước | Tự động |
| Anh | [UK Trade Tariff API v2](https://www.trade-tariff.service.gov.uk/) – MFN, ưu đãi theo từng hiệp định, thuế bổ sung, VAT | Tự động |
| EU, Việt Nam, nước khác | TARIC / biểu thuế quốc gia (không có API mở) | Nhập tay vào `manual.csv` |

1. **Thêm mặt hàng:** thêm một dòng vào `products.csv` (chỉ cần HS6), chạy `npm run tariffs:check` → script liệt kê các mã quốc gia hợp lệ để chọn, điền vào cột US/GB.
2. **Cập nhật thuế:** `npm run tariffs:update` (nếu mạng cần proxy: `NODE_USE_ENV_PROXY=1 npm run tariffs:update`). Script báo mã nào không còn trong biểu thuế để chọn lại.
3. **Tự động:** workflow `.github/workflows/update-tariffs.yml` chạy ngày 1 và 15 hằng tháng, mở pull request khi dữ liệu thay đổi
   (cần bật *Settings → Actions → General → Allow GitHub Actions to create and approve pull requests*).
4. **Cảnh báo trong app:** dữ liệu tự động cũ hơn 35 ngày, dữ liệu nhập tay chưa đối chiếu (hoặc quá 180 ngày), ưu đãi FTA chưa có thuế suất, mã không có trong biểu thuế.

> ⚠️ Thuế mang tính tham khảo. Thuế bổ sung của Mỹ (Section 232, AD/CVD, chương 99) phụ thuộc điều kiện riêng của từng lô hàng – luôn xác nhận với hải quan / đại lý khai thuê.

## Model tàu 3D

`public/models/ship.glb` là tàu container low-poly **do script `scripts/gen-ship-glb.mjs` sinh ra bằng code** (thân tàu, cabin,
ống khói, ~200 container nhiều màu) – không dùng tài sản bên ngoài; phát hành theo **CC0**. Có thể thay bằng model CC0 khác
(ví dụ từ Poly Pizza / Kenney / Sketchfab CC0): đặt mũi tàu theo trục +X, trục Z hướng lên, dài 1 đơn vị.
Nếu không tải được model, app dùng icon tàu 2D xoay theo hướng di chuyển.

## Nguồn dữ liệu & giấy phép

- Bản đồ nền: © OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors.
- Mạng tuyến biển: `searoute-js` (MIT) / marnet – Eurostat, Oak Ridge National Labs.
- Đường bờ biển để kiểm tra (chỉ dùng trong script): Natural Earth qua `world-atlas` (public domain).
- Danh mục HS 2022: [`datasets/harmonized-system`](https://github.com/datasets/harmonized-system) (UN Comtrade, ODC-PDDL).
- Biểu thuế Mỹ: USITC Harmonized Tariff Schedule (public domain). Biểu thuế Anh: UK Trade Tariff – HMRC (Open Government Licence v3.0).
- Danh sách cảng, số tuyến/tuần, chỉ số ùn tắc, chuỗi giá: **dữ liệu tĩnh / mô phỏng** để minh hoạ.
