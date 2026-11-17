# PortRank – Tối ưu chi phí vận chuyển cửa đến cửa

Web app chạy local, giao diện tiếng Việt, nền tối. Bạn nhập điểm của **bên mình** và **bên đối tác** ở bất kỳ đâu trên thế giới.
Mỗi bên chọn độc lập một trong hai nhánh:

| | Nhánh A – chỉ nhập **quốc gia** | Nhánh B – nhập **địa chỉ / thành phố** |
| --- | --- | --- |
| Cảng ứng viên | Mọi cảng container của nước đó (nước không giáp biển → cảng gần nhất của nước láng giềng, có ghi chú) | Các cảng trong bán kính R (mặc định 400 km, kể cả nước láng giềng); không có → 3 cảng gần nhất |
| Khoản 1, 2 / 9, 10 | “Chưa tính · nhập địa chỉ để tính” | Bốc/dỡ tại kho + vận tải nội địa kho ↔ cảng |
| Tên kết quả | “Chi phí cảng đến cảng” | “Chi phí cửa đến cửa” (hỗn hợp: “Từ kho đến cảng”…) |

App ghép mọi cặp cảng đi × cảng đến, tính **10 khoản chi phí**, **xếp hạng** và vẽ mỗi phương án thành một **đường cong phát sáng**
trên bản đồ thế giới 2D nền tối. Chọn **phương thức vận tải** và **Incoterm** bằng hai hàng nút; “Bạn trả” đổi ngay, kèm sơ đồ
Incoterm và hoạt ảnh giải thích. Ước tính **thuế nhập khẩu + VAT** từ biểu thuế bạn nhập (luôn kèm nguồn và ngày cập nhật).

> ⚠️ **Mọi con số giá là ƯỚC TÍNH** (nhãn “Ước tính”, khoảng ±12%), trừ khi bạn nhập bảng giá thật (nhãn “Giá thật”).
> Số thuế là ước tính để lập kế hoạch; số chính thức do cơ quan hải quan xác định.

## Phiên bản

| | Nhánh | Link | Nội dung |
| --- | --- | --- | --- |
| V1 | `release/v1` | portrank.onrender.com | Một tuyến A → B, tàu 3D, cước, Incoterm, xếp hạng cảng thay thế |
| V2 (cũ) | `release/v2-mang-tuyen` | – | Mạng tuyến đa cảng nền sáng |
| **V2** | `v2` | portrank-v2.onrender.com | Bản này – làm lại theo prompt bản 2 (cửa đến cửa, hai nhánh, nền tối) |

## Chạy

```bash
npm install
npm run dev        # http://localhost:5173
```

Không cần API key. Cần Internet cho: gợi ý địa chỉ Photon (không có mạng vẫn dùng được ~300 thành phố có sẵn), font, và
dữ liệu cảng 3D (vector tiles OpenStreetMap qua OpenFreeMap). Bản đồ thế giới (Natural Earth, gói `world-atlas`) nằm sẵn trong app.

| Lệnh | Mô tả |
| --- | --- |
| `npm test` | 151 unit test (Vitest): routing, pricing + bảng giá, incoterm (đủ 11 điều kiện), duty, ranking, plan (tiêu chí hoàn thành), track + cảnh cảng, rules, nguồn thuế UK/US/WITS + Chương 99 + bản chụp + chuẩn HS6, DCSA + máy chủ trung gian |
| `npm start` | Máy chủ Node phục vụ `dist/` + API trung gian (`/api/hts`, `/api/schedules`) |
| `npm run tariffs:update` | Tải lại bản chụp biểu thuế (Mỹ, Anh) cho `src/data/tariffProducts.csv`, danh mục HS 2022 chuẩn và VAT/GST tiêu chuẩn |
| `npm run tariffs:check` | Kiểm tra mã trong danh mục hàng, gợi ý mã còn thiếu (không ghi file) |
| `npm run build` | Kiểm tra type + build production vào `dist/` |
| `npm run gen:ship` / `gen:crane` | Sinh lại mô hình tàu / cẩu bờ `.glb` (tự vẽ bằng code, CC0) |
| `npx tsx scripts/check-land.ts [searoute\|graph] [ALL\|POL-POD]` | Kiểm tra tuyến biển không cắt qua đất liền |

## Bố cục

- Giao diện mặc định **nền trắng theo phong cách V1** (thanh tiêu đề navy, bảng trắng, điểm nhấn xanh dương). Nút **🌙 Nền tối / ☀️ Nền trắng** ở góc trên cùng bên phải đổi màu toàn bộ giao diện; lựa chọn lưu trên trình duyệt. Màu bản đồ chỉnh riêng bằng nút 🎨.

- **Bảng nhập dọc (380 px)**: `1 · Tuyến` (tôi là, bên tôi, bên đối tác, hãng tàu) · `2 · Hàng hóa` (loại hàng, FCL/LCL, container,
  mã HS, giá trị hàng + Incoterm của giá đó) · `3 · Điều kiện giao hàng` – **chỉ hai hàng nút**: Phương thức (🚢 Đường biển / 🚚 Đường bộ)
  và Điều kiện (11 nút, đường bộ còn 7). Mục ít dùng gập trong **Tùy chọn thêm**. Dưới 900 px thành bottom sheet.
- **Bản đồ**: mặc định là **Bản đồ chi tiết** – nền vector OpenFreeMap Liberty (như V1), tên địa danh tiếng Việt. Chủ đề tự vẽ từ Natural Earth (nền `#070B14`, đất xanh than, viền bờ biển phát sáng 2 lớp line) vẫn chọn được. Nút **🎨 Màu bản đồ** đổi chủ đề (Bản đồ chi tiết, Tối phát sáng, Hải quân, Hải đồ, Sáng tối giản, Neon tím, Đen trắng) hoặc chỉnh từng màu (biển, đất, biên giới, viền bờ, quầng sáng, tuyến theo hạng, đường bộ, nội địa, cảng, bên bán/mua) và độ phát sáng; lưu trên trình duyệt (`src/config/mapThemes.ts`). Hạng 1 vàng cam có hạt sáng chạy liên tục,
  hạng 2–3 xanh lơ, còn lại rất mờ. Đoạn nội địa đứt nét. Nhánh A tô sáng viền quốc gia; nhánh B có ghim công ty với vòng sáng lan tỏa.
  Nhãn cảng: tên + UN/LOCODE + tổng chi phí của phương án tốt nhất qua cảng. Hover → tooltip; click → chọn phương án:
  các đường khác mờ đi, hiện **đường biển thật** (nút bật/tắt) với tàu chạy, ghim eo biển / kênh đào.
- **Bảng kết quả ngang**: Tổng quan (Bạn trả · Tổng về đến kho · Thời gian · Thuế và VAT, Copy báo giá, Lưu) |
  **Thẻ sơ đồ Incoterm** + dải 10 ô “Ai trả khoản nào” | Xếp hạng tuyến (liên kết hai chiều với bản đồ) | Xem chi tiết
  (Bảng chi phí · Thuế nhập khẩu · Điều kiện, chứng từ · Biến động giá · Hãng tàu & lộ trình).
- Trang: **Bảng giá của tôi**, **Biểu thuế**, **Lịch tàu**, **Danh mục cảng**, **Đã lưu**.

## Logic tính toán (`src/lib`)

- `plan.ts` – dựng phương án: cảng ứng viên (`candidates.ts`), tuyến biển thật (`routing.ts`, searoute/marnet + đồ thị dự phòng,
  xử lý kinh tuyến 180°), đường bộ qua cửa khẩu (`road.ts`, `data/borderGates.ts`), 10 khoản chi phí, thời gian.
- **10 khoản** (`config/incoterms.ts`, hệ số trong `config/pricing.ts`): 1 bốc hàng tại kho · 2 nội địa nước xuất (Haversine × 1,3 × đơn giá/km
  theo khu vực) · 3 thông quan xuất · 4 phí cảng đi · 5 cước biển `550 + 0,27 × hải lý` (40′) + phụ phí · 6 bảo hiểm (% × 110% × CIF) ·
  7 phí cảng đến · 8 thông quan nhập + thuế NK + VAT · 9 nội địa nước nhập · 10 dỡ hàng.
- **Thời gian** = nội địa đi + chờ tàu + hải lý/(16 × 24) + làm hàng + nội địa đến. Đường bộ: km/500 + 1 ngày mỗi cửa khẩu.
- **Giá hàng** báo theo một Incoterm → quy về giá tại xưởng / FOB / CIF (lặp cho hội tụ vì bảo hiểm và thuế phụ thuộc CIF).
- **Incoterm** (`config/incoterms.ts`, dạng data): ma trận người bán trả, điểm cắt chi phí / rủi ro (% chuỗi – có test khớp ma trận),
  câu “Rủi ro chuyển giao khi nào” tự chèn địa điểm thật và đổi từ theo phương thức, 3 “Điểm cần nhớ” cho từng điều kiện.
  Đổi sang đường bộ khi đang chọn FAS/FOB/CFR/CIF → tự chuyển FCA/FCA/CPT/CIP và báo một dòng.
- **Xếp hạng** (`ranking.ts`): `35% chi phí + 25% ổn định giá + 20% thời gian + 10% tần suất + 10% rủi ro` (đổi theo Ưu tiên, có slider).
  Chi phí = **phần bạn trả theo Incoterm đang chọn** (nút chuyển sang “Tổng”). Ổn định giá dùng chuỗi giá 12 tháng **mô phỏng** (seed cố định).
- **Thuế** (`duty.ts`): trị giá tính thuế CIF hoặc FOB theo nước (`data/customsBasis.ts`, có cờ `verified` + link nguồn);
  thuế NK = trị giá × %; VAT = (trị giá + thuế NK + thuế khác) × %. **Không có thuế suất nào hard-code** – lấy từ biểu thuế bạn nhập
  hoặc nguồn chính thức (Anh, Mỹ); thiếu dữ liệu thì hiện
  “Chưa có dữ liệu thuế” + nút “Nhập thuế suất” + link tra cứu chính thức. Mức thuế cập nhật quá 90 ngày có cảnh báo vàng. Gợi ý FTA.

## Nguồn dữ liệu có thể thay thế (`src/providers`, `src/lib`)

| Interface | Đang dùng | Ghi chú |
| --- | --- | --- |
| `GeocodingProvider` | Photon (OSM, debounce 400 ms) + ~300 thành phố offline (`data/cities.ts`) | – |
| `RateProvider` | Bảng giá của tôi (CSV / Excel / nhập tay) – giá thật còn hiệu lực ghi đè ước tính | Để nối sau: Freightos, Xeneta, API hãng tàu |
| `TariffProvider` | 1) Biểu thuế bạn nhập → 2) **nguồn chính thức tự động** (`lib/tariffSources.ts`) | Xem mục *Thuế tự động* |
| `ScheduleProvider` | 1) Lịch tàu bạn nhập → 2) **API hãng tàu chuẩn DCSA** qua máy chủ PortRank | Xem mục *Lịch tàu từ API hãng* |

**Lịch tàu không bao giờ được tự sinh.** Hãng chưa có lịch → “Chưa có lịch tàu của [hãng] cho tuyến này” + nút Nhập lịch + link trang hãng;
thời gian quay về ước tính. Khi chọn một lộ trình: dòng thời gian (rời kho → cut-off → ETD → chuyển tải → ETA → về kho), bản đồ vẽ
đúng các chặng qua cảng chuyển tải, tàu dừng tại cảng chuyển tải, thanh “Ngày X / Y” dùng ngày thật. Liên minh hãng tàu trong
`data/carriers.ts` là thông tin tham khảo, **chưa xác minh**.

## Kết nối nguồn ngoài

### Thuế tự động từ nguồn chính thức
Đã đọc tài liệu API hiện hành của từng nguồn trước khi viết adapter (`src/lib/tariffSources.ts`, test với phản hồi thật trong `tests/fixtures/`):

| Nước nhập | Nguồn | Cách gọi | Lấy gì |
| --- | --- | --- | --- |
| Anh | UK Trade Tariff API v2 (`/api/v2/headings`, `/api/v2/commodities`) | Trình duyệt gọi thẳng (API cho phép CORS) | Thuế MFN (Third country duty), ưu đãi theo xuất xứ (Tariff preference, có xét nhóm nước như CPTPP), VAT |
| Mỹ | USITC HTS REST (`/reststop/exportList`, dự phòng `/reststop/search`) | Qua trung gian `/api/hts/exportList` và `/api/hts/search` (USITC chặn gọi từ trình duyệt) | Cột General (MFN), cột Special (FTA của Mỹ), phí MPF 0,3464% + HMF 0,125% (cộng vào tổng). Thuế bổ sung **Chương 99** theo xuất xứ (thuế đối ứng, Section 301 – vd. Việt Nam +20%) hiện mục **“Cần xác minh”**, KHÔNG cộng vào tổng vì phụ thuộc ngày xếp hàng và danh mục loại trừ |
| **Mọi nước khác** (EU, Việt Nam, Nhật, Hàn, Ấn Độ, ASEAN, Úc, Canada, Mexico, Brazil, Trung Đông, châu Phi…) | WITS – UNCTAD TRAINS (World Bank, SDMX API) | Qua trung gian `/api/wits/…` (WITS không có CORS) | Thuế MFN theo **HS6** của năm gần nhất có số liệu (thường trễ 1–3 năm), kèm khoảng thuế min–max giữa các dòng quốc gia; thuế ưu đãi theo đúng xuất xứ nếu TRAINS có. EU tra biểu thuế chung (mã 918). Ghi rõ năm số liệu, đánh dấu chưa xác minh |
| EU TARIC, biểu thuế VN, WTO | – | Không làm | TARIC không có API công khai; biểu thuế VN không có API; WTO cần key → mức thuế theo mã quốc gia 8–10 số vẫn tra tay ở trang **Biểu thuế** (được ưu tiên hơn WITS) |

- Mã HS 6 số ứng với nhiều dòng thuế 10 số → hiện danh sách để chọn (không tự đoán). Thuế phức hợp (vd “6,5% + 33 GBP/100 kg”) → báo cần tính tay.
- Mỗi mức thuế lấy tự động ghi **nguồn (link trang chính thức)** và **ngày lấy**; có nút “Lưu vào biểu thuế của tôi”. Tắt/bật ở trang Biểu thuế.
- Trung gian HTS: dev server (`npm run dev`) và `npm start` có sẵn; trên Render (trang tĩnh) dùng quy tắc **Rewrite** `/api/hts/search` → `https://hts.usitc.gov/reststop/search`
  và thêm `/api/hts/exportList` → `https://hts.usitc.gov/reststop/exportList` (thiếu quy tắc này app vẫn chạy: quay về `/search`, Chương 99 lấy từ bản chụp),
  `/api/wits/*` → `https://wits.worldbank.org/API/V1/SDMX/V21/datasource/TRN/*`.
- **WITS tải sẵn:** tường lửa của World Bank chặn yêu cầu đi qua rewrite của Render (403). Vì vậy `npm run tariffs:update` tải sẵn
  **toàn bộ biểu thuế MFN theo HS6** (1 lần gọi `product/all` mỗi nước) của EU, Việt Nam và ~45 nước nhập khẩu chính vào `public/data/wits/{nước}.json`
  (~85 KB/nước, chỉ tải file của nước đang tra). Nước ngoài danh sách `WITS_BULK` (`src/lib/tariffSources.ts`) → gọi `/api/wits` trực tiếp
  (chạy với `npm run dev` / `npm start`; trên trang tĩnh Render sẽ báo không gọi được).
- Hai ưu đãi cùng thuế suất (vd. UKVFTA và CPTPP cùng 0%) → chọn hiệp định song phương.

### Chuẩn mã HS6, VAT/GST và các thuế khác
- **Ô nhập mã HS** theo chuẩn **HS6 (HS 2022 của WCO)**: gợi ý khi gõ số hoặc từ khoá tiếng Anh, kiểm tra mã có trong danh mục, hiện mô tả
  chương › nhóm › phân nhóm. Nhập mã quốc gia 8–10 số vẫn được: 6 số đầu phải là HS6 hợp lệ, phần sau là mở rộng của từng nước.
  Danh mục `public/data/hs6.json` (5.600+ mã HS6, tải khi mở ô nhập) lấy từ GitHub [`datasets/harmonized-system`](https://github.com/datasets/harmonized-system).
- **VAT/GST tiêu chuẩn** ~130 nước: `src/data/vatRates.json` từ gói npm [`sales-tax`](https://github.com/valeriansaliou/node-sales-tax) (MIT) – chỉ là thuế suất tiêu chuẩn.
- **Các thuế / phí khác có thể áp dụng** (`src/data/otherTaxes.ts`): theo nước nhập và chương HS – TTĐB & thuế BVMT (VN), thuế tiêu dùng (TQ, Hàn),
  SWS/IGST (Ấn Độ), PPh 22 (Indonesia), excise các nước, CBAM & excise (EU), Section 232 (Mỹ), DTA/IEPS (Mexico), IPI/PIS/COFINS/ICMS (Brazil),
  excise GCC, thuế bổ sung Thổ Nhĩ Kỳ, chống bán phá giá… – **danh mục tham khảo, chưa xác minh, không cộng vào tổng**.

### Bản chụp biểu thuế & cập nhật định kỳ
`npm run tariffs:update` (`scripts/update-tariffs.ts`) tải thuế cho danh mục hàng `src/data/tariffProducts.csv` từ nguồn chính thức,
dùng chính các hàm phân tích của app, rồi ghi `src/data/tariffSnapshot.json` (MFN, FTA theo từng xuất xứ, phí MPF/HMF, các dòng Chương 99).
`npm run tariffs:check` chỉ kiểm tra: mã HS6 còn trong HS 2022 (GitHub `datasets/harmonized-system`), mã Mỹ/Anh trong danh mục còn hiệu lực, gợi ý mã còn thiếu.

| Dùng ở đâu | Cách dùng |
| --- | --- |
| API trực tuyến không phản hồi | Tự lấy mức thuế từ bản chụp, ghi rõ “Bản chụp ngày …” |
| Trang **Biểu thuế** | Nút “Nạp … mức thuế” → thêm MFN + FTA cho xuất xứ đang chọn vào bảng của bạn (đánh dấu chưa xác minh) |
| EU / Việt Nam | `src/data/tariffManual.csv` (cùng mẫu CSV của trang Biểu thuế) → đưa vào bản chụp, luôn **chưa xác minh** – đối chiếu TARIC/biểu thuế VN trước khi dùng |

Workflow `.github/workflows/update-tariffs.yml` chạy khi sửa danh mục hàng trên nhánh `v2`, và ngày 1 & 15 hằng tháng (lịch chỉ chạy khi file có trên nhánh mặc định),
mở pull request khi dữ liệu thay đổi – cần bật *Settings → Actions → General → Allow GitHub Actions to create and approve pull requests*.
Mạng cần proxy: `NODE_USE_ENV_PROXY=1 npm run tariffs:update`.

### Lịch tàu từ API hãng (DCSA Commercial Schedules 1.0)
- Theo đặc tả công khai của DCSA: `GET {gốc API của hãng}/v1/point-to-point-routes?placeOfReceipt=…&placeOfDelivery=…&departureStartDate=…&limit=50`,
  header `API-Version: 1`, phân trang bằng header `Next-Page-Cursor` (trang sau chỉ gửi `?cursor=`). Chuyển đổi dữ liệu: `src/lib/dcsa.ts`
  (chặng `VESSEL` theo `sequenceNumber`, cảng chuyển tải, cut-off `DCO`/`VCO`/`FCO`).
- **Key hãng tàu chỉ nằm ở máy chủ** (`server/api.mjs`), trình duyệt gọi `/api/schedules`. Mỗi hãng cấp key riêng trên cổng developer của hãng.
- Chạy máy chủ: `npm run build && npm start` (cổng `PORT`, mặc định 8080) với biến môi trường (mẫu trong `.env.example`):
  ```
  DCSA_CARRIERS=MAERSK,CMACGM
  DCSA_MAERSK_URL=<gốc API do hãng cấp>        DCSA_MAERSK_HEADERS={"Consumer-Key":"<key>"}
  DCSA_CMACGM_URL=<gốc API>                    DCSA_CMACGM_KEY=<key>   DCSA_CMACGM_KEY_HEADER=KeyId
  ```
  `<ID>` dùng mã hãng trong `src/data/carriers.ts` (MSC, MAERSK, CMACGM, COSCO, HAPAG, ONE, EVERGREEN, HMM, YANGMING, ZIM, OOCL, WANHAI, PIL).
  Hãng dùng OAuth (đổi client id/secret lấy token) chưa được hỗ trợ – chỉ hỗ trợ key gửi bằng header.
- Trên Render: cần một **Web Service** Node (build `npm ci && npm run build`, start `npm start`) để giữ key; trang tĩnh không có máy chủ nên
  mục Hãng tàu sẽ ghi “Trang đang chạy dạng tĩnh…”.

### Ảnh thực Google Photorealistic 3D Tiles (Mức 2)
- Đặt `VITE_GOOGLE_MAPS_KEY` khi build (Render: Environment của trang V2 → Save, rebuild and deploy). Không có key → không hiện nút.
- Key nằm trong mã chạy trên trình duyệt (giống Google Maps JS) → giới hạn key theo **HTTP referrer** (tên miền của bạn) và chỉ cho phép **Map Tiles API**.
  Dịch vụ cần billing và tính phí theo lượt dùng – xem bảng giá và điều khoản của Google trước khi bật.
- Chỉ nạp khi bấm **📷 Ảnh thực** trong chế độ cảng 3D: gọi `https://tile.googleapis.com/v1/3dtiles/root.json` một lần để kiểm tra
  (key sai / chưa bật API → báo lỗi, giữ bố cục OpenStreetMap), rồi hiển thị bằng `Tile3DLayer` của deck.gl.
  Ghi công: logo Google + bản quyền của các tile đang hiển thị (gộp, sắp theo tần suất) trên một dòng cuối khung nhìn, theo chính sách Map Tiles API.

## Chế độ 3D

- **Xem 3D**: chuyển cùng bản đồ sang quả địa cầu (MapLibre globe), tàu (mô hình `.glb`) hoặc xe tải chạy dọc tuyến, camera bám theo.
- **Xem cảng 3D – Mức 1** (không cần key): bấm ghim cảng → “Xem cảng 3D”. Hình dạng thật của bờ, cầu cảng, vùng nước, bãi,
  nhà kho (đùn khối), đường bộ, đường sắt lấy từ vector tiles OpenStreetMap (schema OpenMapTiles qua OpenFreeMap). App quét lưới 40 m
  quanh cảng để tìm mép bến, rồi đặt **cẩu bờ** (`public/models/crane.glb`) dọc mép bến – dùng vị trí `man_made=crane` từ Overpass
  nếu truy cập được, không thì rải đều theo số cẩu trong thông tin cảng – cùng **chồng container** và **tàu đậu** minh họa.
  Góc màn hình ghi rõ: “Bố cục cảng theo dữ liệu bản đồ; container, cẩu và tàu là hình minh họa”.
- **Mức 2 – ảnh thực Google 3D Tiles**: xem mục *Kết nối nguồn ngoài*.
- **Thẻ thông tin cảng** 6 nhóm; mỗi trường `{ value, source, updatedAt, verified }`, trường thiếu ghi “Chưa có dữ liệu”.
  Bộ dữ liệu đi kèm chỉ có nhận diện cơ bản – năng lực, terminal, hãng tàu, THC, free time… nhập ở trang **Danh mục cảng**
  (từ World Port Index của NGA, UN/LOCODE, trang cảng vụ / đơn vị khai thác).

## Nguồn & giấy phép

- Bản đồ thế giới: Natural Earth (public domain) qua `world-atlas`. Cảng 3D: © OpenStreetMap contributors, OpenFreeMap / OpenMapTiles.
- Geocoding: Photon (komoot) – dữ liệu © OpenStreetMap.
- Mạng tuyến biển: `searoute-js` (MIT) / marnet – Eurostat, Oak Ridge National Labs.
- Incoterms® là nhãn hiệu của Phòng Thương mại Quốc tế (ICC). Sơ đồ và hoạt ảnh do PortRank tự thiết kế, ghi chú “Theo Incoterms® 2020 của ICC”.
- Mô hình tàu, cẩu: tự sinh bằng code (CC0). Danh sách cảng, tần suất, chuỗi giá 12 tháng: **dữ liệu mô phỏng** để minh họa.
