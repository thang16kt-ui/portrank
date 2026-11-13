import type { CargoType, PassageId, ShipMode } from '../types';

/**
 * Rule engine dạng DỮ LIỆU: mỗi rule có điều kiện `when` và danh sách mục checklist.
 * Các điều kiện trong `when` kết hợp bằng AND; mảng bên trong là OR.
 * Placeholder trong text: {pol} {pod} {polCountry} {podCountry} {detourDays}
 */
export type CountryGroup = 'EU' | 'ASEAN' | 'UK' | 'US' | 'CA';

export interface RuleCondition {
  cargo?: CargoType[];
  mode?: ShipMode[];
  originCountry?: string[];
  destCountry?: string[];
  destGroup?: CountryGroup[];
  originGroup?: CountryGroup[];
  /** Tuyến đi qua ít nhất một trong các điểm */
  passes?: PassageId[];
  woodPallet?: boolean;
  /** Tuyến đang tránh Biển Đỏ & đi vòng Mũi Hảo Vọng */
  capeDetour?: boolean;
}

export type RuleCategory = 'Chứng từ' | 'Hải quan & khai báo' | 'Xuất xứ (C/O)' | 'Yêu cầu kỹ thuật' | 'Cảnh báo tuyến';

export interface RuleItem {
  title: string;
  detail: string;
  category: RuleCategory;
  severity: 'required' | 'recommended' | 'warning';
  /** Hạn chót tương đối (giờ trước khi xếp hàng) – để hiển thị */
  deadlineHoursBeforeLoading?: number;
}

export interface Rule {
  id: string;
  when: RuleCondition;
  items: RuleItem[];
}

export const RULES: Rule[] = [
  {
    id: 'base-docs',
    when: {},
    items: [
      { title: 'Hóa đơn thương mại (Commercial Invoice)', detail: 'Ghi rõ Incoterm, mã HS, đơn giá, tổng trị giá, đồng tiền thanh toán.', category: 'Chứng từ', severity: 'required' },
      { title: 'Phiếu đóng gói (Packing List)', detail: 'Số kiện, trọng lượng tịnh/cả bì, kích thước, số container/seal.', category: 'Chứng từ', severity: 'required' },
      { title: 'Vận đơn (B/L hoặc Sea Waybill)', detail: 'Kiểm tra shipper/consignee/notify khớp L/C hoặc hợp đồng. Chọn B/L gốc hay Surrendered/SWB.', category: 'Chứng từ', severity: 'required' },
      { title: 'Tờ khai hải quan xuất khẩu / nhập khẩu', detail: 'Khai báo tại {polCountry} (xuất) và {podCountry} (nhập).', category: 'Hải quan & khai báo', severity: 'required' },
    ],
  },
  {
    id: 'vgm',
    when: { mode: ['FCL'] },
    items: [{ title: 'Khai báo VGM (SOLAS)', detail: 'Xác nhận khối lượng toàn bộ container đã đóng hàng, gửi hãng tàu trước cut-off VGM.', category: 'Hải quan & khai báo', severity: 'required', deadlineHoursBeforeLoading: 24 }],
  },
  {
    id: 'ispm15',
    when: { woodPallet: true },
    items: [{ title: 'Dấu ISPM 15 cho pallet/bao bì gỗ', detail: 'Gỗ phải xử lý nhiệt (HT) hoặc hun trùng (MB) và đóng dấu IPPC. Pallet nhựa/gỗ ép không cần.', category: 'Yêu cầu kỹ thuật', severity: 'required' }],
  },
  {
    id: 'eu-ens',
    when: { destGroup: ['EU'] },
    items: [{ title: 'Khai ENS – ICS2 (EU)', detail: 'Hãng tàu/NVOCC khai Entry Summary Declaration trước khi xếp hàng tại cảng đi (tuyến biển container: ≥24h trước xếp). Cần mô tả hàng chi tiết + mã HS 6 số.', category: 'Hải quan & khai báo', severity: 'required', deadlineHoursBeforeLoading: 24 }],
  },
  {
    id: 'uk-ens',
    when: { destGroup: ['UK'] },
    items: [{ title: 'Khai ENS của Anh (S&S GB)', detail: 'Safety & Security declaration cho hàng nhập vào Vương quốc Anh, trước khi xếp hàng.', category: 'Hải quan & khai báo', severity: 'required', deadlineHoursBeforeLoading: 24 }],
  },
  {
    id: 'us-isf',
    when: { destGroup: ['US'] },
    items: [{ title: 'ISF 10+2 (Importer Security Filing)', detail: 'Người nhập khẩu Mỹ nộp ≥24h trước khi xếp hàng lên tàu tại cảng đi. Phạt tới 5.000 USD/lỗi.', category: 'Hải quan & khai báo', severity: 'required', deadlineHoursBeforeLoading: 24 }],
  },
  {
    id: 'ca-emanifest',
    when: { destGroup: ['CA'] },
    items: [{ title: 'eManifest Canada (ACI)', detail: 'Hãng tàu khai dữ liệu hàng hóa cho CBSA ≥24h trước khi xếp hàng.', category: 'Hải quan & khai báo', severity: 'required', deadlineHoursBeforeLoading: 24 }],
  },
  {
    id: 'vn-eu-co',
    when: { originCountry: ['VN'], destGroup: ['EU'] },
    items: [{ title: 'C/O EVFTA (mẫu EUR.1 hoặc tự chứng nhận REX)', detail: 'Để hưởng thuế ưu đãi EVFTA. Lô > 6.000 EUR cần mã REX để tự chứng nhận xuất xứ.', category: 'Xuất xứ (C/O)', severity: 'recommended' }],
  },
  {
    id: 'vn-uk-co',
    when: { originCountry: ['VN'], destGroup: ['UK'] },
    items: [{ title: 'C/O UKVFTA (EUR.1 UK)', detail: 'Hưởng ưu đãi thuế theo Hiệp định UKVFTA.', category: 'Xuất xứ (C/O)', severity: 'recommended' }],
  },
  {
    id: 'vn-asia-co',
    when: { originCountry: ['VN'], destCountry: ['JP', 'KR', 'CN', 'HK', 'AU', 'NZ', 'IN'] },
    items: [{ title: 'Kiểm tra C/O ưu đãi: RCEP / CPTPP / ACFTA / AKFTA / AJCEP / VKFTA / AANZFTA / AIFTA', detail: 'So sánh thuế suất giữa các FTA áp dụng cho {podCountry} để chọn mẫu C/O tối ưu (RCEP, form E, AK, AJ, VK, AANZ, AI…).', category: 'Xuất xứ (C/O)', severity: 'recommended' }],
  },
  {
    id: 'vn-asean-co',
    when: { originCountry: ['VN'], destGroup: ['ASEAN'] },
    items: [{ title: 'C/O mẫu D (ATIGA)', detail: 'Hưởng thuế 0% trong nội khối ASEAN. Có thể tự chứng nhận xuất xứ nếu đã đăng ký.', category: 'Xuất xứ (C/O)', severity: 'recommended' }],
  },
  {
    id: 'vn-cptpp-co',
    when: { originCountry: ['VN'], destCountry: ['CA', 'MX', 'CL', 'PE'] },
    items: [{ title: 'C/O CPTPP', detail: 'Áp dụng cho {podCountry}. Có thể tự chứng nhận xuất xứ theo CPTPP.', category: 'Xuất xứ (C/O)', severity: 'recommended' }],
  },
  {
    id: 'ke-pvoc',
    when: { destCountry: ['KE'] },
    items: [{ title: 'Chứng nhận PVoC (Kenya)', detail: 'Kiểm định trước khi giao hàng theo chương trình Pre-Export Verification of Conformity – thiếu sẽ bị phạt 15% CIF.', category: 'Hải quan & khai báo', severity: 'required' }],
  },
  {
    id: 'ng-soncap',
    when: { destCountry: ['NG'] },
    items: [{ title: 'SONCAP (Nigeria)', detail: 'Chứng nhận SONCAP + Form M do ngân hàng Nigeria cấp trước khi giao hàng.', category: 'Hải quan & khai báo', severity: 'required' }],
  },
  {
    id: 'au-bio',
    when: { destCountry: ['AU', 'NZ'] },
    items: [{ title: 'Kiểm dịch sinh học (BICON / MPI)', detail: 'Khai báo bao bì gỗ, chứng thư xử lý; container phải sạch đất/côn trùng. Mùa BMSB (09–04) áp dụng xử lý bắt buộc với một số mặt hàng.', category: 'Yêu cầu kỹ thuật', severity: 'required' }],
  },
  {
    id: 'reefer',
    when: { cargo: ['reefer'] },
    items: [
      { title: 'Cài đặt nhiệt độ & thông gió trên Booking/B/L', detail: 'Ghi rõ nhiệt độ cài đặt (°C), độ ẩm, % thông gió.', category: 'Yêu cầu kỹ thuật', severity: 'required' },
      { title: 'PTI container lạnh', detail: 'Pre-Trip Inspection trước khi đóng hàng; làm lạnh trước (pre-cool) hàng hóa.', category: 'Yêu cầu kỹ thuật', severity: 'required' },
      { title: 'Cắm điện tại bãi (plug-in)', detail: 'Đặt lịch cắm điện ở cảng đi/đến; tính phí điện lạnh theo ngày.', category: 'Yêu cầu kỹ thuật', severity: 'recommended' },
      { title: 'Chứng thư kiểm dịch / vệ sinh an toàn thực phẩm', detail: 'Phyto/Health certificate tùy mặt hàng (nông sản, thủy sản…).', category: 'Chứng từ', severity: 'recommended' },
    ],
  },
  {
    id: 'dg',
    when: { cargo: ['dg'] },
    items: [
      { title: 'Tờ khai hàng nguy hiểm IMDG (DG Declaration)', detail: 'Ghi UN number, Class, Packing Group, Proper Shipping Name, EmS.', category: 'Chứng từ', severity: 'required' },
      { title: 'MSDS / SDS', detail: 'Bảng dữ liệu an toàn 16 mục, bản tiếng Anh, còn hiệu lực.', category: 'Chứng từ', severity: 'required' },
      { title: 'Nhãn UN & placard trên kiện và container', detail: 'Dán nhãn theo IMDG Code, 4 mặt container.', category: 'Yêu cầu kỹ thuật', severity: 'required' },
      { title: 'Hãng tàu duyệt trước (DG approval)', detail: 'Gửi hồ sơ DG cho hãng tàu duyệt trước khi xác nhận booking; một số cảng trung chuyển có thể từ chối.', category: 'Hải quan & khai báo', severity: 'required' },
    ],
  },
  {
    id: 'oog',
    when: { cargo: ['oog'] },
    items: [
      { title: 'Bản vẽ kích thước & trọng tâm hàng', detail: 'Kích thước quá khổ (OH/OW/OL), trọng lượng, điểm móc cẩu.', category: 'Yêu cầu kỹ thuật', severity: 'required' },
      { title: 'Phương án chằng buộc (lashing/securing plan)', detail: 'Theo CSS Code; có thể cần giám định viên xác nhận.', category: 'Yêu cầu kỹ thuật', severity: 'required' },
      { title: 'Hãng tàu duyệt OOG / break-bulk', detail: 'Xác nhận vị trí xếp trên tàu & thiết bị flat rack / open top.', category: 'Hải quan & khai báo', severity: 'required' },
    ],
  },
  {
    id: 'red-sea',
    when: { passes: ['BAB_EL_MANDEB', 'SUEZ'] },
    items: [{ title: 'Tuyến qua Biển Đỏ – Bab el-Mandeb', detail: 'Rủi ro an ninh hàng hải; hãng tàu có thể áp phụ phí rủi ro chiến tranh (WRS) / phí bảo hiểm tăng hoặc đổi tuyến đột xuất. Kiểm tra điều khoản bảo hiểm (Institute War Clauses).', category: 'Cảnh báo tuyến', severity: 'warning' }],
  },
  {
    id: 'cape',
    when: { capeDetour: true },
    items: [{ title: 'Tuyến vòng Mũi Hảo Vọng', detail: 'Thời gian dài hơn khoảng {detourDays} ngày so với tuyến qua Suez; cân nhắc hạn giao hàng trên L/C, tồn kho, và phí lưu container.', category: 'Cảnh báo tuyến', severity: 'warning' }],
  },
  {
    id: 'panama',
    when: { passes: ['PANAMA'] },
    items: [{ title: 'Qua kênh đào Panama', detail: 'Mùa khô có thể giới hạn mớn nước/số lượt tàu → nguy cơ chậm tàu, phụ phí.', category: 'Cảnh báo tuyến', severity: 'warning' }],
  },
];
