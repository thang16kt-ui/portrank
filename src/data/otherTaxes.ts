import { EU_SET } from './countries';

/**
 * Các loại thuế / phí KHÁC (ngoài thuế nhập khẩu và VAT/GST tiêu chuẩn) có thể áp dụng khi nhập khẩu – theo nước nhập
 * và chương / nhóm HS. Đây là DANH MỤC THAM KHẢO do PortRank biên soạn, CHƯA XÁC MINH, KHÔNG cộng vào tổng thuế:
 * thuế suất phụ thuộc mặt hàng cụ thể, xuất xứ, dung tích, giá trị… – luôn tra văn bản / biểu thuế hiện hành.
 * `hs`: tiền tố mã HS (2, 4 hoặc 6 số); bỏ trống = mọi mặt hàng.
 */
export interface OtherTax {
  name: string;
  hs?: string[];
  /** Cách tính / ghi chú */
  detail: string;
  /** Thuế suất tham khảo (dạng chữ) – chỉ ghi khi phổ biến, ổn định */
  rate?: string;
}

const ALCOHOL = ['2203', '2204', '2205', '2206', '2207', '2208'];
const TOBACCO = ['24'];
const FUEL = ['2710', '2711'];
const CARS = ['8703'];

/** Áp dụng cho mọi nước */
const ALL: OtherTax[] = [
  { name: 'Thuế chống bán phá giá / chống trợ cấp / tự vệ', detail: 'Áp theo mặt hàng + xuất xứ (có khi theo từng nhà sản xuất), cộng thêm vào thuế nhập khẩu. Tra danh sách biện pháp phòng vệ thương mại đang có hiệu lực của nước nhập.' },
  { name: 'Phí hải quan, kiểm dịch, kiểm tra chuyên ngành', detail: 'Phí làm thủ tục, kiểm tra chất lượng / an toàn thực phẩm / kiểm dịch động thực vật tuỳ mặt hàng.' },
];

const EU: OtherTax[] = [
  { name: 'Thuế tiêu thụ đặc biệt (excise) EU', hs: [...ALCOHOL, ...TOBACCO, ...FUEL], detail: 'Rượu bia, thuốc lá, nhiên liệu: thuế theo lượng của từng nước thành viên, nộp khi hàng vào lưu thông.' },
  { name: 'CBAM – cơ chế điều chỉnh carbon biên giới', hs: ['72', '73', '76', '2523', '2716', '2804', '2808', '2814', '2834', '3102', '3105'], detail: 'Sắt thép, nhôm, xi măng, phân bón, hydro, điện: người nhập khẩu phải là "CBAM declarant" được cấp phép và mua chứng chỉ CBAM theo lượng phát thải (giai đoạn chính thức từ 2026).' },
];

const BY_COUNTRY: Record<string, OtherTax[]> = {
  VN: [
    { name: 'Thuế tiêu thụ đặc biệt (TTĐB)', hs: [...ALCOHOL, ...TOBACCO, '2710', '8703', '8711', '8415', '8903', '9504'], detail: 'Rượu bia, thuốc lá, xăng, ô tô dưới 24 chỗ, xe máy trên 125 cm³, điều hoà ≤ 90.000 BTU, du thuyền, bài lá…; tính trên (trị giá tính thuế + thuế NK).' },
    { name: 'Thuế bảo vệ môi trường (BVMT)', hs: ['2710', '2701', '2702', '2703', '2704', '2903', '392321', '392329', '3808'], detail: 'Xăng dầu, than, môi chất HCFC, túi ni lông, thuốc BVTV hạn chế sử dụng: thuế tuyệt đối theo đơn vị.' },
  ],
  CN: [
    { name: 'Thuế tiêu dùng (消费税)', hs: [...ALCOHOL, ...TOBACCO, '2710', '3303', '3304', '7113', '7114', '7116', '8703', '8711', '8903', '9101', '9102', '950631', '950632', '4418', '4421'], detail: 'Rượu, thuốc lá, xăng dầu, mỹ phẩm cao cấp, trang sức, ô tô, xe máy, du thuyền, đồng hồ cao cấp, gậy golf, sàn gỗ, đũa dùng một lần…; tính trên (CIF + thuế NK) / (1 − thuế suất tiêu dùng).' },
  ],
  JP: [
    { name: 'Thuế rượu', hs: ALCOHOL, detail: 'Thuế theo lít và độ cồn.' },
    { name: 'Thuế thuốc lá', hs: TOBACCO, detail: 'Thuế quốc gia + địa phương theo điếu / gam.' },
    { name: 'Thuế xăng dầu', hs: FUEL, detail: 'Thuế xăng, dầu diesel, LPG theo lít / kg.' },
  ],
  KR: [
    { name: 'Thuế tiêu dùng đặc biệt (개별소비세) + thuế giáo dục', hs: ['8703', '7113', '9101', '9102', '2710', ...TOBACCO], detail: 'Ô tô, trang sức / đồng hồ cao cấp, nhiên liệu, thuốc lá; thuế giáo dục tính thêm trên thuế tiêu dùng đặc biệt.' },
    { name: 'Thuế rượu (주세)', hs: ALCOHOL, detail: 'Theo loại rượu, kèm thuế giáo dục.' },
  ],
  IN: [
    { name: 'Social Welfare Surcharge (SWS)', detail: 'Phụ thu tính trên thuế hải quan cơ bản (BCD), phổ biến 10%; một số mặt hàng được miễn.', rate: '10% × BCD' },
    { name: 'IGST theo mặt hàng', detail: 'IGST nhập khẩu theo bậc 5% / 18% / 40% tuỳ mặt hàng (số VAT/GST tiêu chuẩn chỉ là bậc phổ biến); tính trên (trị giá + BCD + SWS).' },
    { name: 'Cess / AIDC', hs: [...TOBACCO, '2710', '8703', '7108', '7113', '0802'], detail: 'Thuế bổ sung (Agriculture Infrastructure & Development Cess, compensation cess) cho một số nhóm hàng.' },
  ],
  ID: [
    { name: 'PPh 22 nhập khẩu', detail: 'Thuế thu nhập tạm nộp khi nhập khẩu, thường 2,5% (có API) đến 7,5–10% (không có API / hàng tiêu dùng nhất định); tính trên (CIF + thuế NK).' },
    { name: 'PPnBM – thuế hàng xa xỉ', hs: ['8703', '8711', '8903', '9302', '9303', '7113'], detail: 'Ô tô, xe máy phân khối lớn, du thuyền, vũ khí, trang sức…' },
    { name: 'Cukai (thuế tiêu thụ đặc biệt)', hs: [...ALCOHOL, ...TOBACCO], detail: 'Rượu bia, thuốc lá.' },
  ],
  TH: [{ name: 'Thuế tiêu thụ đặc biệt (excise)', hs: [...ALCOHOL, ...TOBACCO, '2710', '2202', '8703', '8711', '3303'], detail: 'Rượu bia, thuốc lá, nhiên liệu, đồ uống có đường, ô tô, xe máy, nước hoa…; kèm thuế địa phương 10% trên thuế excise.' }],
  MY: [
    { name: 'Sales tax (thay VAT)', detail: 'Thuế bán hàng 5% hoặc 10% tuỳ mặt hàng, nhiều mặt hàng miễn – số VAT/GST tiêu chuẩn chỉ là mức phổ biến.' },
    { name: 'Thuế tiêu thụ đặc biệt (excise)', hs: [...ALCOHOL, ...TOBACCO, '8703', '8711', '2202'], detail: 'Rượu bia, thuốc lá, ô tô, xe máy, đồ uống có đường.' },
  ],
  PH: [{ name: 'Thuế tiêu thụ đặc biệt (excise)', hs: [...ALCOHOL, ...TOBACCO, '2710', '2202', '8703', '7113', '3303'], detail: 'Rượu bia, thuốc lá, nhiên liệu, đồ uống có đường, ô tô, trang sức, mỹ phẩm cao cấp.' }],
  SG: [{ name: 'Thuế tiêu thụ đặc biệt (excise)', hs: [...ALCOHOL, ...TOBACCO, '2710'], detail: 'Rượu bia, thuốc lá, xăng dầu – phần lớn hàng khác không có thuế nhập khẩu.' }],
  AU: [
    { name: 'Thuế tương đương excise', hs: ['2203', '2208', ...TOBACCO, '2710'], detail: 'Bia, rượu mạnh, thuốc lá, nhiên liệu.' },
    { name: 'Wine Equalisation Tax (WET)', hs: ['2204', '2205', '2206'], detail: 'Thuế rượu vang, tính trên giá trị.', rate: '29%' },
    { name: 'Luxury Car Tax (LCT)', hs: CARS, detail: 'Ô tô trên ngưỡng giá trị (điều chỉnh hằng năm).', rate: '33% phần vượt ngưỡng' },
  ],
  NZ: [{ name: 'Thuế tương đương excise', hs: [...ALCOHOL, ...TOBACCO, '2710'], detail: 'Rượu bia, thuốc lá, nhiên liệu.' }],
  CA: [
    { name: 'PST / HST theo tỉnh', detail: 'Ngoài GST 5% liên bang: PST hoặc HST tuỳ tỉnh nơi nhận hàng.' },
    { name: 'Thuế tiêu thụ đặc biệt (excise)', hs: [...ALCOHOL, ...TOBACCO, '2710'], detail: 'Rượu bia, thuốc lá, nhiên liệu.' },
  ],
  MX: [
    { name: 'DTA – phí thủ tục hải quan', detail: 'Derecho de Trámite Aduanero, tính trên trị giá hải quan (hàng có xuất xứ USMCA có mức riêng).', rate: '0,8%' },
    { name: 'IEPS – thuế sản xuất và dịch vụ đặc biệt', hs: [...ALCOHOL, ...TOBACCO, '2710', '2202', '1704', '1806'], detail: 'Rượu bia, thuốc lá, nhiên liệu, đồ uống có đường, đồ ăn nhiều calo.' },
  ],
  BR: [
    { name: 'IPI – thuế hàng công nghiệp', detail: 'Theo bảng TIPI, tính trên (CIF + thuế NK).' },
    { name: 'PIS/COFINS-importação', detail: 'Hai khoản đóng góp liên bang trên trị giá nhập khẩu (phổ biến tổng ~11,75%).' },
    { name: 'ICMS – thuế lưu thông hàng hoá của bang', detail: 'Thuế suất theo bang (thường 17–20%), tính "theo dentro" – số VAT/GST tiêu chuẩn chỉ xấp xỉ. Đang chuyển sang CBS/IBS theo lộ trình cải cách thuế.' },
    { name: 'AFRMM', detail: 'Phụ thu cước vận tải biển: tính trên cước biển quốc tế.', rate: '25% × cước biển' },
  ],
  US: [
    { name: 'Thuế bổ sung Section 232', hs: ['72', '73', '76', '74', '8703', '8708', '4407', '4418', '9401', '9403'], detail: 'Thép, nhôm, đồng, ô tô & phụ tùng, gỗ xẻ & nội thất…: thuế bổ sung theo Chương 99 của HTS, mức và phạm vi thay đổi thường xuyên.' },
    { name: 'Thuế tiêu thụ đặc biệt liên bang (excise)', hs: [...ALCOHOL, ...TOBACCO, '2710'], detail: 'Rượu bia, thuốc lá, nhiên liệu (TTB / IRS).' },
    { name: 'Thuế bán hàng của bang', detail: 'Không thu khi nhập khẩu; thu khi bán lẻ theo bang.' },
  ],
  GB: [{ name: 'Thuế tiêu thụ đặc biệt (excise) Anh', hs: [...ALCOHOL, ...TOBACCO, '2710'], detail: 'Rượu bia, thuốc lá, nhiên liệu (HMRC).' }],
  TR: [
    { name: 'Thuế hải quan bổ sung (İlave Gümrük Vergisi)', detail: 'Áp cho nhiều mặt hàng có xuất xứ ngoài EU/FTA (vd. Trung Quốc, Việt Nam) – cộng thêm vào thuế nhập khẩu.' },
    { name: 'ÖTV – thuế tiêu thụ đặc biệt', hs: [...ALCOHOL, ...TOBACCO, '2710', '8703', '8711', '3303', '7113'], detail: 'Ô tô, nhiên liệu, rượu bia, thuốc lá, hàng xa xỉ.' },
  ],
};

/** Thuế tiêu thụ đặc biệt vùng Vịnh (GCC) */
const GCC: OtherTax[] = [
  { name: 'Thuế tiêu thụ đặc biệt (excise) GCC', hs: [...TOBACCO, '2202'], detail: 'Thuốc lá, nước tăng lực: 100%; nước ngọt có ga, đồ uống có đường: 50% (tính trên giá bán lẻ).', rate: '50–100%' },
];
for (const c of ['AE', 'SA', 'OM', 'QA', 'BH']) BY_COUNTRY[c] = GCC;

const matchHs = (t: OtherTax, hs: string) => !t.hs || (hs.length >= 2 && t.hs.some((p) => hs.startsWith(p)));

/** Các thuế/phí khác có thể áp dụng cho mã HS khi nhập vào nước `iso2` (không gồm thuế NK và VAT tiêu chuẩn) */
export function otherTaxesFor(iso2: string, hs: string): OtherTax[] {
  const d = hs.replace(/\D/g, '');
  const list = [...(BY_COUNTRY[iso2] ?? []), ...(EU_SET.has(iso2) ? EU : []), ...ALL];
  return list.filter((t) => matchHs(t, d));
}
