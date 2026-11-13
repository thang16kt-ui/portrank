import type { CargoType, ContainerType } from '../types';

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
  dry: 'Hàng khô thông thường',
  reefer: 'Hàng lạnh (Reefer)',
  dg: 'Hàng nguy hiểm (DG)',
  oog: 'Hàng quá khổ (Flat rack / Open top)',
};
