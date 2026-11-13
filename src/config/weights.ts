import type { Priority } from '../types';

export interface Weights {
  cost: number;
  stability: number;
  time: number;
  frequency: number;
  risk: number;
}

/** Bộ trọng số xếp hạng theo "Ưu tiên" (tổng = 100) */
export const WEIGHT_PRESETS: Record<Priority, Weights> = {
  balanced: { cost: 35, stability: 25, time: 20, frequency: 10, risk: 10 },
  cheap: { cost: 55, stability: 15, time: 15, frequency: 5, risk: 10 },
  stable: { cost: 20, stability: 50, time: 15, frequency: 5, risk: 10 },
  fast: { cost: 15, stability: 10, time: 50, frequency: 15, risk: 10 },
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  balanced: 'Cân bằng',
  cheap: 'Giá thấp',
  stable: 'Giá ổn định',
  fast: 'Nhanh nhất',
};

export const CRITERIA_LABEL: Record<keyof Weights, string> = {
  cost: 'Chi phí',
  stability: 'Ổn định giá',
  time: 'Thời gian',
  frequency: 'Tần suất tàu',
  risk: 'Rủi ro',
};

/** Điểm rủi ro (0 tốt → 1 xấu) cộng thêm khi tuyến đi qua (mô phỏng) */
export const PASSAGE_RISK: Record<string, number> = {
  BAB_EL_MANDEB: 0.45,
  SUEZ: 0.15,
  PANAMA: 0.15,
  CAPE_GOOD_HOPE: 0.12,
  HORMUZ: 0.2,
  MALACCA: 0.03,
};
