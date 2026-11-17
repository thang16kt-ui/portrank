import type { CargoType, ContainerType, RegionId } from '../types';

/**
 * MÔ HÌNH CƯỚC ƯỚC TÍNH – KHÔNG PHẢI GIÁ THỊ TRƯỜNG.
 * Toàn bộ hệ số dưới đây có thể chỉnh sửa. Đơn vị: USD.
 */
export const PRICING = {
  /** Cước gốc container 40′ = base + perNm × hải lý */
  base40: { base: 550, perNm: 0.27 },
  /** Tỷ trọng trong cước gốc */
  split: { oceanFreight: 0.82, bafLss: 0.18 },

  containerFactor: { '20GP': 0.62, '40GP': 1.0, '40HC': 1.08, '40RF': 1.0 } as Record<ContainerType, number>,

  cargoFactor: { dry: 1.0, reefer: 1.7, dg: 1.4, oog: 1.9 } as Record<CargoType, number>,
  /** Phụ phí cố định / container theo loại hàng */
  cargoSurchargePerCont: { dry: 0, reefer: 0, dg: 180, oog: 450 } as Record<CargoType, number>,

  /** Phụ phí tuyến (/40′, nhân hệ số container) */
  routeSurcharge40: { SUEZ: 280, PANAMA: 240, CAPE_GOOD_HOPE: 160 },

  /** THC cảng đi */
  thcOrigin: { '40': 190, '20': 130 },
  /** THC cảng đến theo khu vực (/40′). 20′ = × thc20Ratio */
  thcDest40: { EU_UK: 260, US_CA: 420, OTHER: 180 },
  thc20Ratio: 130 / 190,

  lcl: {
    /** giá/CBM = cước gốc 40′ / cbmPer40 × markup × hệ số hàng */
    cbmPer40: 26,
    markup: 1.35,
    cfsPerCbm: 28,
    minCbm: 1,
    /** Quy đổi W/M: 1 tấn = 1 CBM */
    kgPerCbm: 1000,
  },

  docsPerShipment: 85,

  /* ───── Cửa đến cửa (10 khoản) ───── */
  /** Khoản 1 & 10: bốc / dỡ hàng tại kho, USD / container */
  warehouseHandling: { '20': 60, '40': 90, lclPerCbm: 6, lclMin: 30 },
  /** Khoản 2 & 9: vận tải nội địa – USD/km cho 1 container 40′, theo khu vực. Quãng đường = Haversine × roadFactor */
  inland: {
    roadFactor: 1.3,
    perKm40: { SEA: 1.3, NEA: 1.6, SA: 1.2, ME: 1.5, EU: 2.0, MED: 1.8, AF: 2.0, NA: 2.4, LATAM: 1.8, OC: 2.2 } as Record<RegionId, number>,
    factor20: 0.85,
    minPerTrip: 120,
    /** LCL: tính theo tỷ lệ chỗ trên xe, có hệ số gom hàng */
    lclShareMarkup: 1.6,
    lclMin: 60,
    kmPerDay: 400,
  },
  /** Khoản 3 & 8: thông quan, USD / lô */
  customs: { exportPerShipment: 80, importPerShipment: 120 },
  /** Khoản 6: bảo hiểm = rate × 110% × trị giá CIF */
  insurance: { rate: 0.002, uplift: 1.1 },

  /* ───── Đường bộ ───── */
  road: {
    /** Cước xe chặng chính, USD/km cho 1 container 40′ (hoặc 1 xe) theo khu vực */
    perKm40: { SEA: 1.5, NEA: 1.7, SA: 1.4, ME: 1.7, EU: 2.1, MED: 1.9, AF: 2.3, NA: 2.5, LATAM: 2.0, OC: 2.3 } as Record<RegionId, number>,
    /** Phí cửa khẩu mỗi phía, USD / container */
    gateFeePerCont: 150,
    kmPerDay: 500,
    borderDays: 1,
    /** Giả định quãng gom hàng kho → bãi giao hàng và bãi đến → kho (km) */
    yardKm: 30,
  },

  /** Khoảng giá ± */
  rangePct: 0.12,
};

export const CONTAINER_LABEL: Record<ContainerType, string> = {
  '20GP': "20′ GP",
  '40GP': "40′ GP",
  '40HC': "40′ HC",
  '40RF': "40′ Reefer",
};

export const CARGO_LABEL: Record<CargoType, string> = {
  dry: 'Hàng khô',
  reefer: 'Hàng lạnh',
  dg: 'Hàng nguy hiểm (DG)',
  oog: 'Hàng quá khổ',
};
