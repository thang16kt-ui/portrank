import { getPort } from '../data/ports';
import type { FormState } from '../store/useAppStore';
import type { Port, Quote, RouteResult, ShipmentInput } from '../types';
import { suggestIncoterm, type IncotermSuggestion } from './incoterm';
import { estimateQuote } from './pricing';
import { findRoute } from './routing';
import { evaluateRules, type ChecklistItem } from './rules';
import { schedule, transitDays } from './transit';

export interface PlanResult {
  pol: Port;
  pod: Port;
  route: RouteResult;
  shipment: ShipmentInput;
  quote: Quote;
  days: number;
  etd: Date;
  eta: Date;
  checklist: ChecklistItem[];
  suggestion: IncotermSuggestion;
  /** Khi tránh Biển Đỏ: so sánh với tuyến thường */
  baseline?: { route: RouteResult; days: number; total: number };
}

export const shipmentOf = (f: FormState): ShipmentInput => ({
  cargo: f.cargo,
  mode: f.mode,
  container: f.container,
  quantity: f.quantity,
  cbm: f.cbm,
  weightKg: f.weightKg,
  woodPallet: f.woodPallet,
});

export const routeOptionsOf = (f: FormState) => ({ avoidRedSea: f.avoidRedSea, avoidPanama: f.avoidPanama, engine: f.engine });

/** Tính toàn bộ kết quả cho một cặp cảng – hàm thuần */
export function computePlan(f: FormState, polCode = f.pol, podCode = f.pod, route?: RouteResult): PlanResult | null {
  const pol = getPort(polCode), pod = getPort(podCode);
  if (!pol || !pod || pol.code === pod.code) return null;
  const r = route ?? findRoute(pol, pod, routeOptionsOf(f));
  const shipment = shipmentOf(f);
  const quote = estimateQuote({ pol, pod, route: r, shipment, readyDate: f.readyDate });
  const days = transitDays(r, f.cargo);
  const { etd, eta } = schedule(f.readyDate, days);
  let baseline: PlanResult['baseline'];
  if (f.avoidRedSea || f.avoidPanama) {
    const br = findRoute(pol, pod, { ...routeOptionsOf(f), avoidRedSea: false, avoidPanama: false });
    if (Math.abs(br.distanceNm - r.distanceNm) > 1)
      baseline = { route: br, days: transitDays(br, f.cargo), total: estimateQuote({ pol, pod, route: br, shipment }).total };
  }
  const checklist = evaluateRules({ pol, pod, route: r, shipment, avoidRedSea: f.avoidRedSea, detourDays: baseline ? days - baseline.days : undefined });
  const suggestion = suggestIncoterm(f.role, f.booker, f.cargo, pol, pod);
  return { pol, pod, route: r, shipment, quote, days, etd, eta, checklist, suggestion, baseline };
}

export const usd = (n: number) => `${Math.round(n).toLocaleString('en-US')} USD`;
export const fmtNm = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} hải lý`;
