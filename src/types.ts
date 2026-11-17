export type LngLat = [number, number];

export type RegionId =
  | 'SEA' // Đông Nam Á
  | 'NEA' // Đông Bắc Á
  | 'SA' // Nam Á
  | 'ME' // Trung Đông
  | 'EU' // Châu Âu
  | 'MED' // Địa Trung Hải
  | 'AF' // Châu Phi
  | 'NA' // Bắc Mỹ
  | 'LATAM' // Mỹ Latinh
  | 'OC'; // Châu Đại Dương

export interface Port {
  /** UN/LOCODE, ví dụ VNSGN */
  code: string;
  /** Tên hiển thị tiếng Việt */
  name: string;
  /** ISO 3166-1 alpha-2 */
  country: string;
  countryName: string;
  region: RegionId;
  /** [lon, lat] vị trí bến (đã đặt ra phía mặt nước) */
  coord: LngLat;
  /** Luồng ra biển (từ bến → biển thoáng), dùng cho cảng sông */
  approach?: LngLat[];
  /** Số dịch vụ tàu/tuần (mô phỏng) */
  weeklyServices: number;
  /** Chỉ số ùn tắc 0–1 (mô phỏng) */
  congestion: number;
  /** Từ khóa tìm kiếm phụ */
  aliases?: string[];
}

export type CargoType = 'dry' | 'reefer' | 'dg' | 'oog';
export type ShipMode = 'FCL' | 'LCL';
export type ContainerType = '20GP' | '40GP' | '40HC' | '40RF';
export type Role = 'seller' | 'buyer';
export type Booker = 'me' | 'other';
export type Priority = 'balanced' | 'cheap' | 'stable' | 'fast';

export type PassageId =
  | 'MALACCA'
  | 'SINGAPORE'
  | 'SUNDA'
  | 'LOMBOK'
  | 'BAB_EL_MANDEB'
  | 'SUEZ'
  | 'GIBRALTAR'
  | 'PANAMA'
  | 'CAPE_GOOD_HOPE'
  | 'CAPE_HORN'
  | 'MAGELLAN'
  | 'HORMUZ'
  | 'DOVER'
  | 'BOSPHORUS'
  | 'DARDANELLES'
  | 'TAIWAN'
  | 'KOREA'
  | 'TORRES'
  | 'BASS'
  | 'KIEL'
  | 'FLORIDA'
  | 'MESSINA'
  | 'DANISH'
  | 'ANTIMERIDIAN';

export interface Passage {
  id: PassageId;
  name: string;
  coord: LngLat;
  kind: 'canal' | 'strait' | 'cape' | 'line';
  /** Bán kính (km) để coi tuyến là "đi qua" */
  radiusKm: number;
}

export interface RouteOptions {
  avoidRedSea: boolean;
  avoidPanama: boolean;
  engine?: 'searoute' | 'graph';
}

export interface PassageHit {
  id: PassageId;
  name: string;
  kind: Passage['kind'];
  coord: LngLat;
  /** Hải lý tính từ cảng đi đến điểm này */
  atNm: number;
}

export interface RouteResult {
  /** Toạ độ đã làm dày (~20 km/điểm), kinh độ đã "unwrap" liên tục */
  coords: LngLat[];
  /** Hải lý cộng dồn tại mỗi điểm */
  cumNm: number[];
  distanceNm: number;
  passages: PassageHit[];
  engine: 'searoute' | 'graph';
  /** Ghi chú (vd: không tránh được Biển Đỏ vì cảng nằm trong Biển Đỏ) */
  warnings: string[];
}

export interface ShipmentInput {
  cargo: CargoType;
  mode: ShipMode;
  container: ContainerType;
  quantity: number;
  cbm: number;
  weightKg: number;
  woodPallet: boolean;
}

export type Party = 'seller' | 'buyer';

export type CostSegment = 0 | 1 | 2 | 3 | 4;

export interface CostLine {
  id: string;
  label: string;
  amount: number;
  /** Chặng phát sinh: 0 Kho bán · 1 Cảng đi · 2 Trên tàu · 3 Cảng đến · 4 Kho mua */
  segment: CostSegment;
  note?: string;
}

export interface Quote {
  lines: CostLine[];
  total: number;
  low: number;
  high: number;
  currency: 'USD';
  basis: string;
  provider: string;
}

export type Incoterm = 'EXW' | 'FCA' | 'FAS' | 'FOB' | 'CFR' | 'CIF' | 'CPT' | 'CIP' | 'DAP' | 'DPU' | 'DDP';

/** Phương thức vận tải – mở rộng được (sau này thêm 'rail' | 'air', cũng dùng 7 điều kiện "mọi phương thức") */
export type TransportMode = 'sea' | 'road';

/** Điểm của một bên: nhánh A (quốc gia) hoặc nhánh B (địa chỉ/thành phố) */
export interface Place {
  kind: 'country' | 'address';
  label: string;
  /** ISO 3166-1 alpha-2 */
  country: string;
  countryName: string;
  coord: LngLat;
  source?: string;
}

/** Giá trị có nguồn – dùng cho thông tin cảng, thuế… */
export interface Sourced<T> {
  value: T;
  source: string;
  updatedAt: string; // YYYY-MM-DD
  verified: boolean;
}
