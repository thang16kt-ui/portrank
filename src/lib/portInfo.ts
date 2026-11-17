import { PRICING } from '../config/pricing';
import { countryName } from '../data/countries';
import type { Port, Sourced } from '../types';

/** Ngày lập bộ dữ liệu tĩnh đi kèm app */
export const DATASET_DATE = '2026-11-15';

export interface PortFieldDef {
  key: string;
  label: string;
  group: string;
  hint?: string;
}

export const PORT_GROUPS = ['Nhận diện', 'Năng lực', 'Dịch vụ và kết nối', 'Chi phí và thời gian', 'Thủ tục'] as const;

export const PORT_FIELDS: PortFieldDef[] = [
  { key: 'name', label: 'Tên cảng', group: 'Nhận diện' },
  { key: 'locode', label: 'Mã UN/LOCODE', group: 'Nhận diện' },
  { key: 'country', label: 'Quốc gia', group: 'Nhận diện' },
  { key: 'coord', label: 'Tọa độ', group: 'Nhận diện' },
  { key: 'kind', label: 'Loại cảng', group: 'Nhận diện', hint: 'Biển / sông' },
  { key: 'timezone', label: 'Múi giờ', group: 'Nhận diện', hint: 'vd. UTC+7' },
  { key: 'channelDepth', label: 'Độ sâu luồng', group: 'Năng lực', hint: 'm' },
  { key: 'berthDepth', label: 'Độ sâu cầu bến', group: 'Năng lực', hint: 'm' },
  { key: 'maxVessel', label: 'Cỡ tàu lớn nhất', group: 'Năng lực', hint: 'TEU / DWT' },
  { key: 'berths', label: 'Số bến', group: 'Năng lực' },
  { key: 'cranes', label: 'Số cẩu bờ', group: 'Năng lực' },
  { key: 'teu', label: 'Sản lượng TEU/năm', group: 'Năng lực' },
  { key: 'terminals', label: 'Bến (terminal) & đơn vị khai thác', group: 'Năng lực' },
  { key: 'carriers', label: 'Hãng tàu ghé cảng', group: 'Dịch vụ và kết nối' },
  { key: 'weeklyCalls', label: 'Số chuyến/tuần', group: 'Dịch vụ và kết nối' },
  { key: 'mainRoutes', label: 'Tuyến chính', group: 'Dịch vụ và kết nối' },
  { key: 'road', label: 'Kết nối đường bộ', group: 'Dịch vụ và kết nối' },
  { key: 'rail', label: 'Kết nối đường sắt', group: 'Dịch vụ và kết nối' },
  { key: 'icd', label: 'Cảng cạn (ICD)', group: 'Dịch vụ và kết nối' },
  { key: 'thc', label: 'THC', group: 'Chi phí và thời gian', hint: 'USD/cont' },
  { key: 'freeTime', label: 'Miễn lưu bãi (free time)', group: 'Chi phí và thời gian', hint: 'ngày' },
  { key: 'cutoff', label: 'Giờ cắt máng (cut-off)', group: 'Chi phí và thời gian' },
  { key: 'avgWait', label: 'Thời gian chờ trung bình', group: 'Chi phí và thời gian' },
  { key: 'customsOffice', label: 'Cơ quan hải quan quản lý', group: 'Thủ tục' },
  { key: 'hours', label: 'Giờ làm việc', group: 'Thủ tục' },
  { key: 'special', label: 'Yêu cầu riêng của cảng', group: 'Thủ tục' },
];

const src = (value: string, source: string): Sourced<string> => ({ value, source, updatedAt: DATASET_DATE, verified: false });

/** Giá trị có sẵn trong bộ dữ liệu tĩnh của app (chưa xác minh). Trường khác: "Chưa có dữ liệu". */
export function builtinPortInfo(p: Port): Record<string, Sourced<string>> {
  const S = 'Danh mục cảng PortRank (theo UN/LOCODE)';
  const river = (p.approach?.length ?? 0) >= 4;
  return {
    name: src(p.name, S),
    locode: src(p.code, S),
    country: src(countryName(p.country), S),
    coord: src(`${Math.abs(p.coord[1]).toFixed(2)}°${p.coord[1] >= 0 ? 'B' : 'N'}, ${Math.abs(p.coord[0]).toFixed(2)}°${p.coord[0] >= 0 ? 'Đ' : 'T'}`, S),
    kind: src(river ? 'Cảng sông / cửa sông' : 'Cảng biển', 'Suy ra từ luồng vào cảng trong dữ liệu tuyến'),
    weeklyCalls: src(`≈ ${p.weeklyServices} dịch vụ/tuần`, 'Số MÔ PHỎNG của PortRank (dùng để xếp hạng) – không phải số thật'),
    thc: src(`≈ ${PRICING.thcOrigin['40']} USD/40′ (chiều xuất)`, 'Mô hình ước tính PortRank'),
  };
}

/** Gộp dữ liệu có sẵn với dữ liệu người dùng nhập (ưu tiên người dùng) */
export function portInfoOf(p: Port, user: Record<string, Sourced<string>> | undefined): Record<string, Sourced<string> | undefined> {
  return { ...builtinPortInfo(p), ...(user ?? {}) };
}

export const PORT_STALE_DAYS = 180;
