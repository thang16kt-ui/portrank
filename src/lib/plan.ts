import { COST_ITEMS, type ItemNo } from '../config/incoterms';
import { PRICING } from '../config/pricing';
import { VESSEL_CONFIG } from '../config/routing';
import type { BorderGate } from '../data/borderGates';
import { regionOf } from '../data/countries';
import { roadAvailability } from '../data/landBlocks';
import type { RateHit, RateProvider } from '../providers/RateProvider';
import type { TariffEntry, TariffProvider } from '../providers/TariffProvider';
import type { OfficialTariffResult, OfficialTariffSource } from './tariffSources';
import type { Incoterm, LngLat, Place, Port, Role, RouteResult, ShipmentInput, TransportMode } from '../types';
import { candidatePorts } from './candidates';
import { computeDuty, type DutyResult } from './duty';
import { sellerShare } from './incoterm';
import { contCount, inlandCost, inlandDays, lclWm, roadKm, truckingCost, warehouseHandling } from './inland';
import { estimateQuote } from './pricing';
import { coefficientOfVariation, pairFrequency, routeRisk, simulatePriceHistory, type PricePoint } from './ranking';
import { roadRoutes } from './road';
import { findRoute } from './routing';
import { transitDays } from './transit';

export interface PlanInput {
  role: Role;
  mine: Place;
  partner: Place;
  mode: TransportMode;
  shipment: ShipmentInput;
  /** Giá trị hàng (USD) và Incoterm mà giá đó đang được báo */
  goodsValue: number;
  valueTerm: Incoterm;
  hs: string;
  /** Xuất xứ (ISO2); rỗng = nước người bán */
  origin: string;
  hasCo: boolean;
  readyDate: string;
  radiusKm: number;
  avoidRedSea: boolean;
  avoidPanama: boolean;
  /** id hãng tàu; rỗng = tất cả */
  carriers: string[];
}

export interface CostLine {
  label: string;
  amount: number;
  note?: string;
}

export interface CostItem {
  n: ItemNo;
  /** null = chưa tính (đầu đó chỉ nhập quốc gia) */
  amount: number | null;
  estimated: boolean;
  note?: string;
  /** Nhãn nguồn giá thật */
  badge?: string;
  lines: CostLine[];
}

export interface PlanDays {
  inlandO: number;
  wait: number;
  main: number;
  handling: number;
  inlandD: number;
  total: number;
}

export interface PlanOption {
  key: string;
  mode: TransportMode;
  title: string;
  pol?: Port;
  pod?: Port;
  route?: RouteResult;
  gates?: BorderGate[];
  roadPath?: LngLat[];
  roadKm?: number;
  roadStraight?: boolean;
  originInlandKm: number | null;
  destInlandKm: number | null;
  items: CostItem[];
  /** Tổng 10 khoản (khoản chưa tính = 0) */
  total: number;
  low: number;
  high: number;
  days: PlanDays;
  duty: DutyResult;
  /** Giá hàng quy đổi: tại xưởng (EXW), FOB, CIF */
  value: { exw: number; fob: number; cif: number };
  rate?: RateHit;
  cv: number;
  frequency: number;
  risk: number;
  history: PricePoint[];
  warnings: string[];
}

export interface Plan {
  input: PlanInput;
  seller: Place;
  buyer: Place;
  options: PlanOption[];
  notes: string[];
  originPorts: Port[];
  destPorts: Port[];
  /** "Chi phí cảng đến cảng" / "Chi phí cửa đến cửa" / "Từ kho đến cảng"… */
  scopeTitle: string;
  scopeShort: string;
  domestic: boolean;
  /** Thuế suất lấy từ đâu: biểu thuế của bạn, nguồn chính thức (kèm lựa chọn mã / ghi chú), hoặc chưa có */
  tariffSource: { kind: 'user' | 'official' | 'none'; official?: OfficialTariffResult };
}

export interface PlanDeps {
  rates: RateProvider;
  tariffs: TariffProvider;
  /** Nguồn thuế chính thức (UK Trade Tariff, US HTS) – dùng khi biểu thuế của bạn chưa có mức thuế phù hợp */
  official?: OfficialTariffSource[];
  onProgress?: (done: number, total: number) => void;
}

export const sellerOf = (i: Pick<PlanInput, 'role' | 'mine' | 'partner'>) => (i.role === 'seller' ? i.mine : i.partner);
export const buyerOf = (i: Pick<PlanInput, 'role' | 'mine' | 'partner'>) => (i.role === 'seller' ? i.partner : i.mine);

export function scopeTitle(seller: Place, buyer: Place, mode: TransportMode): { title: string; short: string } {
  const sa = seller.kind === 'address', ba = buyer.kind === 'address';
  const port = mode === 'sea' ? 'cảng' : 'cửa khẩu';
  if (sa && ba) return { title: 'Chi phí cửa đến cửa', short: 'cửa đến cửa' };
  if (!sa && !ba) return { title: mode === 'sea' ? 'Chi phí cảng đến cảng' : 'Chi phí chặng chính (chưa tính nội địa)', short: mode === 'sea' ? 'cảng đến cảng' : 'chặng chính' };
  if (sa) return { title: `Chi phí từ kho đến ${port} (chưa tính nội địa nước nhập)`, short: `kho đến ${port}` };
  return { title: `Chi phí từ ${port} đến kho (chưa tính nội địa nước xuất)`, short: `${port} đến kho` };
}

const NOT_COUNTED = 'Chưa tính · nhập địa chỉ để tính';
const yieldUi = () => new Promise<void>((r) => setTimeout(r, 0));
const sum = (ls: CostLine[]) => ls.reduce((s, l) => s + l.amount, 0);
const r0 = (n: number) => Math.round(n);

/**
 * Điền khoản 6 (bảo hiểm) và 8 (thông quan nhập + thuế + VAT), tính tổng và khoảng ±12% cho phần ước tính.
 * Giá hàng được báo theo `valueTerm` → quy về giá tại xưởng bằng cách trừ các khoản người bán đã gánh;
 * vì bảo hiểm và thuế phụ thuộc trị giá CIF nên lặp vài vòng cho hội tụ.
 */
export function finalize(items: CostItem[], input: PlanInput, importCountry: string, tariff: TariffEntry | null, domestic: boolean): Pick<PlanOption, 'items' | 'total' | 'low' | 'high' | 'duty' | 'value'> {
  const P = PRICING;
  const get = (n: ItemNo) => items.find((i) => i.n === n)!;
  const amt = (n: ItemNo) => get(n).amount ?? 0;
  const hasValue = input.goodsValue > 0;
  const hasHs = input.hs.replace(/\D/g, '').length >= 4;
  const clearance = domestic ? 0 : P.customs.importPerShipment;
  let exw = input.goodsValue, fob = exw, cif = exw;
  let duty = computeDuty(importCountry, 0, 0, null, false);
  for (let k = 0; k < 8; k++) {
    const ins = hasValue ? P.insurance.rate * P.insurance.uplift * cif : 0;
    get(6).amount = ins;
    duty = domestic ? { ...computeDuty(importCountry, 0, 0, null, false), status: 'domestic' } : computeDuty(importCountry, cif, fob, tariff, hasValue && hasHs);
    get(8).amount = clearance + duty.total;
    const sellerPart = items.reduce((s, it) => s + (it.amount ?? 0) * sellerShare(input.valueTerm, it.n), 0);
    exw = Math.max(0, input.goodsValue - sellerPart);
    fob = exw + amt(1) + amt(2) + amt(3) + amt(4);
    cif = fob + amt(5) + amt(6);
  }
  const i6 = get(6), i8 = get(8);
  i6.amount = r0(i6.amount ?? 0);
  i6.note = hasValue ? `${(P.insurance.rate * 100).toFixed(2)}% × 110% × trị giá CIF (${r0(cif).toLocaleString('en-US')} USD)` : 'Nhập giá trị hàng để tính';
  i6.lines = hasValue ? [{ label: 'Phí bảo hiểm hàng hóa', amount: i6.amount }] : [];
  i8.lines = domestic ? [] : [{ label: 'Phí thông quan nhập khẩu', amount: clearance }];
  if (duty.status === 'ok') {
    i8.lines.push({ label: `Thuế nhập khẩu ${duty.entry!.dutyPct}% × trị giá ${duty.basis.basis}`, amount: r0(duty.duty) });
    if (duty.other) i8.lines.push({ label: `Thuế khác ${duty.entry!.otherPct}%`, amount: r0(duty.other) });
    if (duty.fees) i8.lines.push({ label: `${duty.entry!.feeLabel || 'Phí theo trị giá'} ${duty.entry!.feePct}%`, amount: r0(duty.fees) });
    if (!duty.vatMissing) i8.lines.push({ label: `VAT/GST ${duty.entry!.vatPct}%`, amount: r0(duty.vat) });
    i8.estimated = false;
    i8.note = duty.entry!.id.startsWith('uk-') || duty.entry!.id.startsWith('us-')
      ? `Thuế suất lấy tự động từ nguồn chính thức (${duty.entry!.id.startsWith('uk-') ? 'UK Trade Tariff' : 'US HTS'}) ngày ${duty.entry!.updatedAt}`
      : `Thuế suất theo biểu thuế bạn nhập · ${duty.entry!.verified ? 'đã xác minh' : 'chưa xác minh'}`;
  } else {
    i8.note = duty.status === 'domestic' ? 'Nội địa – không thông quan' : duty.status === 'no-value' ? 'Chưa gồm thuế · nhập mã HS và giá trị hàng' : 'Chưa gồm thuế · chưa có dữ liệu thuế suất';
  }
  i8.amount = r0(sum(i8.lines));
  const total = items.reduce((s, it) => s + (it.amount ?? 0), 0);
  const est = items.reduce((s, it) => s + (it.estimated ? it.amount ?? 0 : 0), 0);
  return { items, total, low: r0(total - est * P.rangePct), high: r0(total + est * P.rangePct), duty, value: { exw, fob, cif } };
}

function blankItems(): CostItem[] {
  return COST_ITEMS.map((c) => ({ n: c.n, amount: 0, estimated: true, lines: [] }));
}

function setItem(items: CostItem[], n: ItemNo, lines: CostLine[], extra: Partial<CostItem> = {}) {
  const it = items[n - 1];
  it.lines = lines.filter((l) => l.amount > 0).map((l) => ({ ...l, amount: r0(l.amount) }));
  it.amount = sum(it.lines);
  Object.assign(it, extra);
}
function setNull(items: CostItem[], n: ItemNo) {
  Object.assign(items[n - 1], { amount: null, lines: [], note: NOT_COUNTED });
}

function originOf(input: PlanInput, seller: Place) {
  return (input.origin || seller.country).toUpperCase();
}

async function lookupTariff(input: PlanInput, seller: Place, buyer: Place, deps: PlanDeps): Promise<{ entry: TariffEntry | null; source: Plan['tariffSource'] }> {
  if (input.hs.replace(/\D/g, '').length < 4 || seller.country === buyer.country) return { entry: null, source: { kind: 'none' } };
  const q = { importCountry: buyer.country, hs: input.hs, origin: originOf(input, seller), preferFta: input.hasCo };
  const user = await deps.tariffs.lookup(q);
  if (user) return { entry: user, source: { kind: 'user' } };
  const src = deps.official?.find((s) => s.supports(buyer.country));
  if (!src) return { entry: null, source: { kind: 'none' } };
  const official = await src.lookup(q);
  return { entry: official.entry, source: { kind: official.entry ? 'official' : 'none', official } };
}

/** Phương án đường biển: mọi cặp cảng đi × cảng đến */
async function seaOptions(input: PlanInput, seller: Place, buyer: Place, deps: PlanDeps, tariff: TariffEntry | null, notes: string[]) {
  const P = PRICING, sh = input.shipment;
  const o = candidatePorts(seller, input.radiusKm), d = candidatePorts(buyer, input.radiusKm);
  notes.push(...o.notes, ...d.notes);
  const pairs: [Port, Port][] = [];
  for (const a of o.ports) for (const b of d.ports) if (a.code !== b.code) pairs.push([a, b]);
  const domestic = seller.country === buyer.country;
  const options: PlanOption[] = [];
  let done = 0;
  for (const [pol, pod] of pairs) {
    let route: RouteResult;
    try {
      route = findRoute(pol, pod, { avoidRedSea: input.avoidRedSea, avoidPanama: input.avoidPanama });
    } catch {
      deps.onProgress?.(++done, pairs.length);
      continue;
    }
    const q = estimateQuote({ pol, pod, route, shipment: sh });
    const items = blankItems();
    const oKm = seller.kind === 'address' ? roadKm(seller.coord, pol.coord) : null;
    const dKm = buyer.kind === 'address' ? roadKm(pod.coord, buyer.coord) : null;
    if (oKm != null) {
      setItem(items, 1, [{ label: 'Bốc hàng lên xe tại kho', amount: warehouseHandling(sh) }]);
      setItem(items, 2, [{ label: `Xe kho → ${pol.name}`, amount: inlandCost(oKm, pol.region, sh), note: `≈ ${r0(oKm)} km × ${P.inland.perKm40[pol.region]} USD/km` }]);
    } else { setNull(items, 1); setNull(items, 2); }
    setItem(items, 3, domestic ? [] : [{ label: 'Phí thông quan xuất khẩu', amount: P.customs.exportPerShipment }], domestic ? { note: 'Nội địa – không thông quan' } : {});
    setItem(items, 4, q.lines.filter((l) => l.segment === 1));
    const rate = sh.mode === 'FCL' ? deps.rates.find({ pol: pol.code, pod: pod.code, container: sh.container, date: input.readyDate, carriers: input.carriers }) : null;
    if (rate) {
      const n = contCount(sh);
      setItem(items, 5, [
        { label: `Cước biển (${n} cont)`, amount: rate.entry.freight * n, note: `${rate.entry.freight} USD/cont` },
        { label: 'Phụ phí theo báo giá', amount: rate.entry.surcharges * n },
      ], { estimated: false, badge: rate.label });
    } else {
      setItem(items, 5, q.lines.filter((l) => l.segment === 2), { note: q.basis });
    }
    setItem(items, 7, q.lines.filter((l) => l.segment === 3));
    if (dKm != null) {
      setItem(items, 9, [{ label: `Xe ${pod.name} → kho`, amount: inlandCost(dKm, pod.region, sh), note: `≈ ${r0(dKm)} km × ${P.inland.perKm40[pod.region]} USD/km` }]);
      setItem(items, 10, [{ label: 'Dỡ hàng tại kho', amount: warehouseHandling(sh) }]);
    } else { setNull(items, 9); setNull(items, 10); }

    const fin = finalize(items, input, buyer.country, tariff, domestic);
    const main = transitDays(route, sh.cargo) - VESSEL_CONFIG.portDays;
    const days: PlanDays = { inlandO: inlandDays(oKm ?? 0), wait: VESSEL_CONFIG.cutoffDays, main, handling: VESSEL_CONFIG.portDays, inlandD: inlandDays(dKm ?? 0), total: 0 };
    days.total = days.inlandO + days.wait + days.main + days.handling + days.inlandD;
    const history = simulatePriceHistory(pol.code, pod.code, items[4].amount ?? 0, route);
    options.push({
      key: `${pol.code}>${pod.code}`, mode: 'sea', title: `${pol.name} → ${pod.name}`, pol, pod, route,
      originInlandKm: oKm, destInlandKm: dKm, ...fin, days, rate: rate ?? undefined,
      cv: coefficientOfVariation(history.map((h) => h.price)), frequency: pairFrequency(pol, pod), risk: routeRisk(route, pol, pod), history,
      warnings: route.warnings,
    });
    deps.onProgress?.(++done, pairs.length);
    if (done % 3 === 0) await yieldUi();
  }
  return { options, originPorts: o.ports, destPorts: d.ports, domestic };
}

/** Phương án đường bộ: qua các cửa khẩu giữa hai nước */
function roadOptions(input: PlanInput, seller: Place, buyer: Place, tariff: TariffEntry | null, notes: string[]) {
  const P = PRICING, sh = input.shipment, R = P.road;
  const domestic = seller.country === buyer.country;
  const routes = roadRoutes(seller.coord, seller.country, buyer.coord, buyer.country);
  if (seller.kind === 'country' || buyer.kind === 'country') notes.push('Đường bộ: đầu chỉ nhập quốc gia được tính từ tâm nước đó – nhập địa chỉ để có quãng đường chính xác.');
  if (routes[0].straight) notes.push('Chưa có dữ liệu cửa khẩu giữa hai nước này – vẽ một tuyến thẳng (bổ sung trong src/data/borderGates.ts).');
  const perKm = (R.perKm40[regionOf(seller.country)] + R.perKm40[regionOf(buyer.country)]) / 2;
  const cargoF = { dry: 1, reefer: 1.25, dg: 1.3, oog: 1.6 }[sh.cargo];
  const n = contCount(sh);
  const gateFee = sh.mode === 'FCL' ? R.gateFeePerCont * n : Math.max(40, (R.gateFeePerCont * lclWm(sh)) / P.lcl.cbmPer40);
  const options: PlanOption[] = routes.map((rt) => {
    const items = blankItems();
    const yardCost = truckingCost(R.yardKm, P.inland.perKm40[regionOf(seller.country)], sh, 60);
    const yardCostD = truckingCost(R.yardKm, P.inland.perKm40[regionOf(buyer.country)], sh, 60);
    if (seller.kind === 'address') {
      setItem(items, 1, [{ label: 'Bốc hàng lên xe tại kho', amount: warehouseHandling(sh) }]);
      setItem(items, 2, [{ label: 'Xe gom hàng kho → bãi giao hàng', amount: yardCost, note: `giả định ≈ ${R.yardKm} km` }]);
    } else { setNull(items, 1); setNull(items, 2); }
    setItem(items, 3, domestic ? [] : [{ label: 'Phí thông quan xuất khẩu', amount: P.customs.exportPerShipment }], domestic ? { note: 'Nội địa – không thông quan' } : {});
    setItem(items, 4, domestic ? [] : [{ label: 'Phí cửa khẩu phía xuất (bến bãi, soi chiếu…)', amount: gateFee }]);
    setItem(items, 5, [{ label: `Cước xe chặng chính`, amount: truckingCost(rt.km, perKm * cargoF, sh), note: `≈ ${r0(rt.km).toLocaleString('vi-VN')} km × ${(perKm * cargoF).toFixed(2)} USD/km` }]);
    setItem(items, 7, domestic ? [] : [{ label: 'Phí cửa khẩu phía nhập', amount: gateFee }]);
    if (buyer.kind === 'address') {
      setItem(items, 9, [{ label: 'Xe giao hàng bãi đến → kho', amount: yardCostD, note: `giả định ≈ ${R.yardKm} km` }]);
      setItem(items, 10, [{ label: 'Dỡ hàng tại kho', amount: warehouseHandling(sh) }]);
    } else { setNull(items, 9); setNull(items, 10); }
    const fin = finalize(items, input, buyer.country, tariff, domestic);
    const main = rt.km / R.kmPerDay;
    const border = domestic ? 0 : R.borderDays * Math.max(1, rt.gates.length);
    const days: PlanDays = { inlandO: 0, wait: 0, main, handling: border, inlandD: 0, total: main + border };
    const key = `road:${rt.gates.map((g) => g.id).join('+') || 'direct'}`;
    const history = simulatePriceHistory(key, `${seller.country}${buyer.country}`, items[4].amount ?? 0);
    const title = rt.gates.length ? `Qua ${rt.gates.map((g) => g.name.split(' (')[0]).join(' → ')}` : rt.straight ? 'Tuyến thẳng (chưa có dữ liệu cửa khẩu)' : 'Đường bộ nội địa';
    return {
      key, mode: 'road' as const, title, gates: rt.gates, roadPath: rt.path, roadKm: rt.km, roadStraight: rt.straight,
      originInlandKm: seller.kind === 'address' ? R.yardKm : null, destInlandKm: buyer.kind === 'address' ? R.yardKm : null,
      ...fin, days, cv: coefficientOfVariation(history.map((h) => h.price)) * 0.5, frequency: 7, risk: Math.min(1, 0.1 + 0.08 * rt.gates.length + (rt.straight ? 0.2 : 0)), history, warnings: [],
    };
  });
  return { options, originPorts: [] as Port[], destPorts: [] as Port[], domestic };
}

/** Tính toàn bộ phương án cho một lần bấm "Tìm tuyến tối ưu" */
export async function buildPlan(input: PlanInput, deps: PlanDeps): Promise<Plan> {
  const seller = sellerOf(input), buyer = buyerOf(input);
  const notes: string[] = [];
  let mode = input.mode;
  if (mode === 'road' && !roadAvailability(seller.country, buyer.country).ok) mode = 'sea';
  const { entry: tariff, source: tariffSource } = await lookupTariff(input, seller, buyer, deps);
  const res = mode === 'sea' ? await seaOptions({ ...input, mode }, seller, buyer, deps, tariff, notes) : roadOptions({ ...input, mode }, seller, buyer, tariff, notes);
  const scope = scopeTitle(seller, buyer, mode);
  return { input: { ...input, mode }, seller, buyer, notes, scopeTitle: scope.title, scopeShort: scope.short, tariffSource, ...res };
}
