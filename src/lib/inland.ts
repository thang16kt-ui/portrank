import { PRICING } from '../config/pricing';
import type { LngLat, RegionId, ShipmentInput } from '../types';
import { haversineKm } from './geo';

const P = PRICING;

/** Quãng đường bộ ước tính = Haversine × 1,3 */
export const roadKm = (a: LngLat, b: LngLat) => haversineKm(a, b) * P.inland.roadFactor;

/** W/M của lô LCL */
export const lclWm = (sh: ShipmentInput) => Math.max(P.lcl.minCbm, sh.cbm, sh.weightKg / P.lcl.kgPerCbm);
export const contCount = (sh: ShipmentInput) => (sh.mode === 'FCL' ? Math.max(1, sh.quantity) : 1);

/** Khoản 1 / 10: bốc – dỡ hàng tại kho */
export function warehouseHandling(sh: ShipmentInput): number {
  if (sh.mode === 'LCL') return Math.max(P.warehouseHandling.lclMin, P.warehouseHandling.lclPerCbm * lclWm(sh));
  return (sh.container === '20GP' ? P.warehouseHandling['20'] : P.warehouseHandling['40']) * contCount(sh);
}

/** Cước xe theo km: FCL = đơn giá × số cont; LCL = tỷ lệ chỗ trên xe × hệ số gom hàng */
export function truckingCost(km: number, perKm40: number, sh: ShipmentInput, min = P.inland.minPerTrip): number {
  if (km <= 0) return 0;
  if (sh.mode === 'LCL') return Math.max(P.inland.lclMin, km * perKm40 * (lclWm(sh) / P.lcl.cbmPer40) * P.inland.lclShareMarkup);
  const f = sh.container === '20GP' ? P.inland.factor20 : 1;
  return Math.max(min, km * perKm40 * f) * contCount(sh);
}

/** Khoản 2 / 9: vận tải nội địa kho ↔ cảng */
export const inlandCost = (km: number, region: RegionId, sh: ShipmentInput) => truckingCost(km, P.inland.perKm40[region], sh);

/** Số ngày vận tải nội địa (làm tròn 0,5 ngày) */
export const inlandDays = (km: number) => (km <= 0 ? 0 : Math.max(0.5, Math.ceil((km / P.inland.kmPerDay) * 2) / 2));
