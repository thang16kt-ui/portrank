import { PRICING } from '../config/pricing';
import { EU_COUNTRIES } from '../data/ports';
import type { CostLine, Port, Quote, RouteResult, ShipmentInput } from '../types';
import { hasPassage } from './routing';

export interface RateRequest {
  pol: Port;
  pod: Port;
  route: RouteResult;
  shipment: ShipmentInput;
  /** ISO date YYYY-MM-DD */
  readyDate?: string;
}

export function destThcZone(pod: Port): keyof typeof PRICING.thcDest40 {
  if (EU_COUNTRIES.has(pod.country) || pod.country === 'GB') return 'EU_UK';
  if (pod.country === 'US' || pod.country === 'CA') return 'US_CA';
  return 'OTHER';
}

/** Cước gốc 40′ theo quãng đường */
export const base40 = (nm: number) => PRICING.base40.base + PRICING.base40.perNm * nm;

const round = (n: number) => Math.round(n);

/** Mô hình ước tính cước – hàm thuần, không phụ thuộc UI */
export function estimateQuote({ pod, route, shipment }: RateRequest): Quote {
  const P = PRICING;
  const nm = route.distanceNm;
  const b40 = base40(nm);
  const cargoF = P.cargoFactor[shipment.cargo];
  const lines: CostLine[] = [];
  const add = (l: CostLine) => {
    if (l.amount > 0) lines.push({ ...l, amount: round(l.amount) });
  };
  const surchargeKeys = (['SUEZ', 'PANAMA', 'CAPE_GOOD_HOPE'] as const).filter((k) => hasPassage(route, k));
  const surchargeName = { SUEZ: 'Phụ phí kênh Suez', PANAMA: 'Phụ phí kênh Panama', CAPE_GOOD_HOPE: 'Phụ phí vòng Mũi Hảo Vọng' };

  if (shipment.mode === 'FCL') {
    const q = Math.max(1, shipment.quantity);
    const cf = P.containerFactor[shipment.container];
    const is20 = shipment.container === '20GP';
    const perCont = b40 * cf * cargoF;
    add({ id: 'of', label: `Cước biển O/F (${q} cont)`, amount: perCont * P.split.oceanFreight * q, segment: 2, note: `${round(perCont * P.split.oceanFreight)} USD/cont` });
    add({ id: 'baf', label: 'BAF / LSS (phụ phí nhiên liệu)', amount: perCont * P.split.bafLss * q, segment: 2 });
    const cs = P.cargoSurchargePerCont[shipment.cargo];
    if (cs) add({ id: 'cargo', label: shipment.cargo === 'dg' ? 'Phụ phí hàng nguy hiểm (DG)' : 'Phụ phí hàng quá khổ (OOG)', amount: cs * q, segment: 2 });
    for (const k of surchargeKeys) add({ id: k, label: surchargeName[k], amount: P.routeSurcharge40[k] * cf * q, segment: 2 });
    add({ id: 'thc_o', label: 'THC cảng đi', amount: (is20 ? P.thcOrigin['20'] : P.thcOrigin['40']) * q, segment: 1 });
    const zone = destThcZone(pod);
    add({ id: 'thc_d', label: `THC cảng đến (${zone === 'EU_UK' ? 'EU/Anh' : zone === 'US_CA' ? 'Mỹ/Canada' : 'khu vực khác'})`, amount: P.thcDest40[zone] * (is20 ? P.thc20Ratio : 1) * q, segment: 3 });
  } else {
    const wm = Math.max(P.lcl.minCbm, shipment.cbm, shipment.weightKg / P.lcl.kgPerCbm);
    const perCbm = (b40 / P.lcl.cbmPer40) * P.lcl.markup * cargoF;
    add({ id: 'of', label: `Cước LCL (${wm.toFixed(2)} W/M)`, amount: perCbm * wm * P.split.oceanFreight, segment: 2, note: `${round(perCbm)} USD/CBM (gồm BAF)` });
    add({ id: 'baf', label: 'BAF / LSS (phụ phí nhiên liệu)', amount: perCbm * wm * P.split.bafLss, segment: 2 });
    for (const k of surchargeKeys) add({ id: k, label: surchargeName[k], amount: (P.routeSurcharge40[k] / P.lcl.cbmPer40) * wm, segment: 2 });
    const cs = P.cargoSurchargePerCont[shipment.cargo];
    if (cs) add({ id: 'cargo', label: 'Phụ phí loại hàng', amount: (cs / P.lcl.cbmPer40) * wm, segment: 2 });
    add({ id: 'cfs_o', label: 'Phí CFS cảng đi', amount: P.lcl.cfsPerCbm * wm, segment: 1 });
    add({ id: 'cfs_d', label: 'Phí CFS cảng đến', amount: P.lcl.cfsPerCbm * wm, segment: 3 });
  }
  add({ id: 'docs', label: 'Phí chứng từ (B/L, khai báo)', amount: P.docsPerShipment, segment: 1 });

  const total = lines.reduce((s, l) => s + l.amount, 0);
  return {
    lines,
    total,
    low: round(total * (1 - P.rangePct)),
    high: round(total * (1 + P.rangePct)),
    currency: 'USD',
    basis: `${round(nm).toLocaleString('vi-VN')} hải lý · cước gốc 40′ ≈ ${round(b40)} USD`,
    provider: 'model',
  };
}

