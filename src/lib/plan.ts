import { COST_ITEMS, type ItemNo } from '../config/incoterms';
import { PRICING } from '../config/pricing';
import { VESSEL_CONFIG } from '../config/routing';
import type { BorderGate } from '../data/borderGates';
import { regionOf } from '../data/countries';
import { roadAvailability } from '../data/landBlocks';
import type { RateHit, RateProvider } from '../providers/RateProvider';
import { ServerRoadProvider, roadSourceLabel, type DrivingRoute, type RoadDirections, type RoadProvider } from '../providers/RoadProvider';
import { roadTransitCountries, transitCountryNames } from './roadCountries';
import type { TariffEntry, TariffProvider, TariffQuery, TariffResolution } from '../providers/TariffProvider';
import { autoSourceOf, type OfficialTariffResult, type OfficialTariffSource } from './tariffSources';
import type { Incoterm, LngLat, Place, Port, Role, RouteResult, ShipmentInput, TransportMode } from '../types';
import { candidatePorts } from './candidates';
import { computeDuty, domesticDuty, type Completeness, type DutyContext, type DutyResult } from './duty';
import { chargesFor, measuresCover, type ChargeRule, type TradeMeasure } from './otherCharges';
import { sellerShare } from './incoterm';
import { contCount, inlandCost, inlandDays, lclWm, roadKm, truckingCost, warehouseHandling } from './inland';
import { estimateQuote } from './pricing';
import { coefficientOfVariation, pairFrequency, routeRisk, simulatePriceHistory, type PricePoint } from './ranking';
import { findRoute } from './routing';
import { transitDays } from './transit';
import { unwrapLongitudes } from './geo';

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
  /** Số lượng để tính thuế tuyệt đối. 0 = CHƯA NHẬP (không lấy khối lượng cả bì / mặc định thay cho khối lượng tịnh) */
  dutyQty?: { units: number; netKg: number; liters: number };
  /** Ngày dự kiến khai hải quan nhập (chọn mức thuế, sàn/trần phí theo ngày); rỗng = ngày hàng sẵn sàng */
  customsDate?: string;
  /** Hiệp định người dùng chọn; rỗng = chưa chọn */
  fta?: string;
  /** Nhà sản xuất / xuất khẩu (mức phòng vệ thương mại riêng theo công ty) */
  company?: string;
  /** Xuất xứ (ISO2); rỗng = nước người bán */
  origin: string;
  hasCo: boolean;
  readyDate: string;
  /** RFC3339 journey departure time (road or truck–ship–truck); empty = depart now. */
  roadDepartureTime?: string;
  roadVia?: Place;
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
  drivingRoute?: DrivingRoute;
  roadDirections?: Omit<RoadDirections, 'routes'>;
  roadTransitCountries?: string[];
  originInlandKm: number | null;
  destInlandKm: number | null;
  items: CostItem[];
  /** Tổng 10 khoản ĐÃ TÍNH (khoản chưa tính không cộng – xem `completeness`/`missing`) */
  total: number;
  /** Mức đầy đủ của tổng: complete / partial / needs-input / unavailable */
  completeness: Completeness;
  /** Các khoản chưa có trong tổng (thuế chưa tính, nội địa chưa tính…) */
  missing: string[];
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
  /** Fixed baseline for depart-now simulations, including older saved plans. */
  calculatedAt?: string;
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
  /** Thuế suất lấy từ đâu: biểu thuế của bạn, dữ liệu đã tổng hợp, nguồn chính thức (kèm lựa chọn mã / ghi chú), hoặc chưa có */
  tariffSource: { kind: 'user' | 'curated' | 'official' | 'none'; official?: OfficialTariffResult; resolution?: TariffResolution; providerLabel?: string };
  /** Ngày dùng để chọn mức thuế */
  customsDate: string;
}

export interface PlanDeps {
  road?: RoadProvider;
  rates: RateProvider;
  tariffs: TariffProvider;
  /** Nguồn thuế chính thức (UK Trade Tariff, US HTS) – dùng khi biểu thuế của bạn chưa có mức thuế phù hợp */
  official?: OfficialTariffSource[];
  /** Dữ liệu thuế đã tổng hợp theo mã quốc gia (bảng A đi kèm app) – dùng sau bảng của bạn, trước nguồn chính thức */
  curated?: TariffProvider & { origins: string[] };
  /** Bảng C (thuế/phí khác) và bảng B (phòng vệ thương mại) */
  charges?: ChargeRule[];
  measures?: TradeMeasure[];
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

/** Bối cảnh tính thuế chung cho mọi phương án của một lần tính */
export interface DutySetup {
  entry: TariffEntry | null;
  ctx: DutyContext;
}

/**
 * Điền khoản 6 (bảo hiểm) và 8 (thông quan nhập + thuế + VAT), tính tổng và khoảng ±12% cho phần ước tính.
 * Giá hàng được báo theo `valueTerm` → quy về giá tại xưởng bằng cách trừ các khoản người bán đã gánh;
 * vì bảo hiểm và thuế phụ thuộc trị giá CIF nên lặp vài vòng cho hội tụ.
 * Các dòng của khoản 8 là các thành phần KHÔNG chồng nhau (phần % + phần tuyệt đối + bổ sung + khác + phí + VAT) → tổng dòng = khoản 8.
 */
export function finalize(
  items: CostItem[], input: PlanInput, importCountry: string, tariff: TariffEntry | DutySetup | null, domestic: boolean,
): Pick<PlanOption, 'items' | 'total' | 'low' | 'high' | 'duty' | 'value' | 'completeness' | 'missing'> {
  const setup: DutySetup = tariff && 'ctx' in tariff ? tariff : { entry: tariff as TariffEntry | null, ctx: {} };
  const P = PRICING;
  const get = (n: ItemNo) => items.find((i) => i.n === n)!;
  const amt = (n: ItemNo) => get(n).amount ?? 0;
  const hasValue = input.goodsValue > 0;
  const hasHs = input.hs.replace(/\D/g, '').length >= 4;
  const clearance = domestic ? 0 : P.customs.importPerShipment;
  let exw = input.goodsValue, fob = exw, cif = exw;
  let duty = computeDuty(importCountry, 0, 0, null, false);
  // PR-09: không thay khối lượng tịnh bằng khối lượng hàng / mặc định – thiếu thì báo cần nhập
  const qty = { units: input.dutyQty?.units ?? 0, netKg: input.dutyQty?.netKg ?? 0, liters: input.dutyQty?.liters ?? 0 };
  const ctx: DutyContext = { ...setup.ctx, mode: setup.ctx.mode ?? input.mode };
  for (let k = 0; k < 8; k++) {
    const ins = hasValue ? P.insurance.rate * P.insurance.uplift * cif : 0;
    get(6).amount = ins;
    duty = domestic ? domesticDuty(importCountry) : computeDuty(importCountry, cif, fob, setup.entry, hasValue && hasHs, qty, ctx);
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
  const missing: string[] = [];
  if (duty.status === 'ok') {
    const e = duty.entry!;
    i8.lines.push({ label: `Thuế nhập khẩu ${e.dutyPct}% × trị giá ${duty.basis.basis}`, amount: duty.adValorem });
    if (duty.specific > 0) i8.lines.push({ label: `Thuế tuyệt đối (${e.specificDuty})`, amount: duty.specific, note: duty.specificNote });
    else if (duty.specific < 0) i8.lines.push({ label: 'Điều chỉnh mức tối đa (MAX) của thuế nhập khẩu', amount: duty.specific, note: duty.specificNote });
    for (const l of duty.additionalLines) i8.lines.push(l);
    for (const l of duty.otherLines) i8.lines.push({ label: l.label, amount: l.amount, ...(l.note && { note: l.note }) });
    for (const l of duty.feeLines) i8.lines.push({ label: l.label, amount: l.amount, note: l.note });
    if (!duty.vatMissing && duty.vatPct) i8.lines.push({ label: `VAT/GST ${duty.vatPct}% × (${duty.vatBaseNote})`, amount: duty.vat });
    i8.estimated = false;
    const src = autoSourceOf(e);
    i8.note = `${src ? `Thuế suất lấy tự động (${src}) ngày ${e.fetchedAt ?? e.updatedAt}` : `Thuế suất theo ${e.id.startsWith('curated-') ? 'dữ liệu đã tổng hợp' : 'biểu thuế bạn nhập'} · ${e.verified ? 'đã xác minh' : 'chưa xác minh'}`}${duty.completeness !== 'complete' ? ' · CHƯA ĐỦ: ' + duty.missing.length + ' khoản chưa tính' : ''}`;
    missing.push(...duty.missing.map((m) => `Thuế: ${m}`));
  } else {
    i8.note = duty.status === 'domestic' ? 'Nội địa – không thông quan' : duty.status === 'no-value' ? 'Chưa gồm thuế · nhập mã HS và giá trị hàng' : 'Chưa gồm thuế · chưa có dữ liệu thuế suất';
    if (duty.status === 'no-value') missing.push('Thuế nhập khẩu, VAT (chưa nhập mã HS / giá trị hàng)');
    if (duty.status === 'no-data') missing.push('Thuế nhập khẩu, VAT (chưa có thuế suất)');
  }
  i8.amount = Math.round(i8.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  for (const it of items) if (it.amount == null) missing.push(`Khoản ${it.n} (${it.note ?? 'chưa tính'})`);
  const total = items.reduce((s, it) => s + (it.amount ?? 0), 0);
  const est = items.reduce((s, it) => s + (it.estimated ? it.amount ?? 0 : 0), 0);
  const completeness: Completeness =
    duty.status === 'no-data' ? 'unavailable' : duty.status === 'no-value' ? 'needs-input' : duty.status === 'ok' && duty.completeness !== 'complete' ? duty.completeness : missing.length ? 'partial' : 'complete';
  return { items, total, low: r0(total - est * P.rangePct), high: r0(total + est * P.rangePct), duty, value: { exw, fob, cif }, completeness, missing };
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

const MEASURES_IN_SOURCE = new Set(['uk', 'taric']);

async function lookupTariff(input: PlanInput, seller: Place, buyer: Place, deps: PlanDeps): Promise<{ setup: DutySetup; source: Plan['tariffSource']; date: string }> {
  const date = input.customsDate || input.readyDate || new Date().toISOString().slice(0, 10);
  const none = { setup: { entry: null, ctx: { date } }, source: { kind: 'none' as const }, date };
  if (input.hs.replace(/\D/g, '').length < 4 || seller.country === buyer.country) return none;
  const q: TariffQuery = { importCountry: buyer.country, hs: input.hs, origin: originOf(input, seller), preferFta: input.hasCo, fta: input.fta, date, mode: input.mode };
  const charges = chargesFor(deps.charges ?? [], buyer.country, input.hs, date);
  const measures = (deps.measures ?? []).filter((m) => m.country === buyer.country);
  const ctxFor = (entry: TariffEntry | null, providerId: string): DutyContext => ({
    date, mode: input.mode, charges, measures, origin: q.origin, company: input.company,
    measuresChecked: MEASURES_IN_SOURCE.has(providerId) || (!!entry && measuresCover(measures, buyer.country, entry.hs)),
  });
  const userRes = deps.tariffs.resolve ? deps.tariffs.resolve(q) : null;
  const user = userRes ? userRes.entry : await deps.tariffs.lookup(q);
  if (user || userRes?.choices?.length) return { setup: { entry: user, ctx: ctxFor(user, 'user') }, source: { kind: 'user', resolution: userRes ?? undefined }, date };
  const cur = deps.curated?.resolve?.(q);
  // dữ liệu tổng hợp chỉ có ưu đãi cho một số xuất xứ: xuất xứ khác + có C/O → để nguồn chính thức xét ưu đãi
  if (cur && (cur.entry || cur.choices?.length) && (!q.preferFta || deps.curated!.origins.includes(q.origin) || cur.entry?.rateType === 'FTA'))
    return { setup: { entry: cur.entry, ctx: ctxFor(cur.entry, 'curated') }, source: { kind: 'curated', resolution: cur, providerLabel: deps.curated!.label }, date };
  const src = deps.official?.find((s) => s.supports(buyer.country));
  if (!src) return none;
  const official = await src.lookup(q);
  return { setup: { entry: official.entry, ctx: ctxFor(official.entry, official.provider) }, source: { kind: official.entry ? 'official' : 'none', official }, date };
}

/** Phương án đường biển: mọi cặp cảng đi × cảng đến */
async function seaOptions(input: PlanInput, seller: Place, buyer: Place, deps: PlanDeps, tariff: DutySetup, notes: string[]) {
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

/** Distance, driving time and geometry all come from the same provider route. */
async function roadOptions(input: PlanInput, seller: Place, buyer: Place, deps: PlanDeps, tariff: DutySetup, notes: string[]) {
  const P = PRICING, sh = input.shipment, R = P.road;
  const domestic = seller.country === buyer.country;
  const directions = await (deps.road ?? ServerRoadProvider).lookup({ origin: seller, destination: buyer, departureTime: input.roadDepartureTime, via: input.roadVia });
  if (!directions.routes.length) throw new Error('Không tìm được tuyến đường ô tô cho hai địa điểm này.');
  const { routes, ...roadDirections } = directions;
  const transitChecks = await Promise.all(routes.map((rt) => rt.countryCodes?.length
    ? rt.countryCodes.filter((c) => c !== seller.country && c !== buyer.country)
    : roadTransitCountries(rt.path, [seller.country, buyer.country])));
  // A domestic shipment must not silently become an international transit route.
  // An explicitly chosen foreign waypoint is an intentional exception.
  const domesticOnly = domestic && (!input.roadVia || input.roadVia.country === seller.country);
  const selectedRoutes = routes.map((route, index) => ({ route, transitCountries: transitChecks[index] }))
    .filter(({ transitCountries }) => !domesticOnly || !transitCountries.length);
  if (!selectedRoutes.length) throw new Error('Chưa tìm được tuyến đường bộ nội địa cho hai điểm này. Không tự thay bằng tuyến quá cảnh nước khác. Hãy thử điểm đi qua trong nước hoặc đổi địa chỉ ghim.');
  const sourceLabel = roadSourceLabel(directions);
  notes.push(directions.provider === 'google'
    ? 'Quãng đường và thời gian lái xe: Google Maps, có xét giao thông tại giờ khởi hành. Kết quả có thể khác ứng dụng Google Maps do giờ đi, điểm ghim và lựa chọn tuyến.'
    : directions.provider === 'tomtom' ? 'Quãng đường và thời gian lái xe: TomTom, có xét giao thông. Đi ngay dùng dữ liệu hiện tại; chọn giờ tương lai dùng dự báo.'
    : 'Quãng đường và thời gian lái xe: OpenStreetMap / OSRM, theo mạng đường ô tô. Thời gian chưa xét kẹt xe hoặc giờ khởi hành. Nguồn demo dành cho chạy thử, có giới hạn và có thể tạm gián đoạn.');
  notes.push('Đây là tuyến ô tô (DRIVE), chưa xác nhận hạn chế chiều cao, tải trọng hay đường cấm xe tải/container.');
  notes.push('Thời gian lái xe chưa gồm nghỉ tài xế, bốc dỡ và làm thủ tục. Giá vận chuyển vẫn là ước tính theo đơn giá/km.');
  if (!domestic) notes.push('Tuyến xuyên biên giới: cửa khẩu, quyền quá cảnh, giờ mở cửa và thời gian chờ cần xác minh trước khi vận chuyển.');
  if (domesticOnly) notes.push('Chỉ đề xuất tuyến đường bộ nội địa; đã loại các phương án phát hiện đi qua nước khác.');
  if (input.roadVia) notes.push(`Đi qua: ${input.roadVia.label}. Tuyến tính qua điểm đã chọn; không có nghĩa là đã giới hạn tuyến trong một quốc gia.`);
  const perKm = (R.perKm40[regionOf(seller.country)] + R.perKm40[regionOf(buyer.country)]) / 2;
  const cargoF = { dry: 1, reefer: 1.25, dg: 1.3, oog: 1.6 }[sh.cargo];
  const n = contCount(sh);
  const gateFee = sh.mode === 'FCL' ? R.gateFeePerCont * n : Math.max(40, (R.gateFeePerCont * lclWm(sh)) / P.lcl.cbmPer40);
  const options: PlanOption[] = selectedRoutes.map(({ route: rt, transitCountries }) => {
    const transitNames = transitCountryNames(transitCountries);
    const km = rt.distanceMeters / 1000;
    const items = blankItems();
    setItem(items, 1, [{ label: 'Bốc hàng lên xe tại kho', amount: warehouseHandling(sh) }]);
    setItem(items, 2, [], { note: 'Chặng kho đi đã nằm trong tuyến đường bộ cửa đến cửa ở khoản 5.' });
    setItem(items, 3, domestic ? [] : [{ label: 'Phí thông quan xuất khẩu', amount: P.customs.exportPerShipment }], domestic ? { note: 'Nội địa – không thông quan' } : {});
    setItem(items, 4, domestic ? [] : [{ label: 'Phí cửa khẩu phía xuất (bến bãi, soi chiếu…)', amount: gateFee }]);
    setItem(items, 5, [{ label: 'Cước xe cửa đến cửa', amount: truckingCost(km, perKm * cargoF, sh), note: `${r0(km).toLocaleString('vi-VN')} km (${sourceLabel}) × ${(perKm * cargoF).toFixed(2)} USD/km; đơn giá ước tính` }]);
    setItem(items, 7, domestic ? [] : [{ label: 'Phí cửa khẩu phía nhập', amount: gateFee }]);
    setItem(items, 9, [], { note: 'Chặng đến kho đã nằm trong tuyến đường bộ cửa đến cửa ở khoản 5.' });
    setItem(items, 10, [{ label: 'Dỡ hàng tại kho', amount: warehouseHandling(sh) }]);
    if (transitCountries.length) {
      // Same-country endpoints do not prove the actual journey stays inside that country.
      for (const n of [3, 4, 7] as const) {
        items[n - 1].amount = null;
        items[n - 1].lines = [];
        items[n - 1].note = `Chưa tính thủ tục/cửa khẩu/quá cảnh qua ${transitNames}`;
      }
    }
    const fin = finalize(items, input, buyer.country, tariff, domestic);
    if (transitCountries.length) fin.missing.push(`Chi phí và thời gian quá cảnh ${transitNames}; cần xác nhận cửa khẩu, quyền quá cảnh`);
    const main = rt.durationSeconds / 86400;
    const days: PlanDays = { inlandO: 0, wait: 0, main, handling: 0, inlandD: 0, total: main };
    const key = `road:${rt.id}`;
    const history = simulatePriceHistory(key, `${seller.country}${buyer.country}`, items[4].amount ?? 0);
    const description = rt.description || `Đường bộ · ${sourceLabel}`;
    const title = domestic && !transitCountries.length ? `Nội địa · ${description}` : description;
    return {
      key, mode: 'road' as const, title, gates: [], roadKm: km, roadStraight: false,
      drivingRoute: rt, roadDirections, roadTransitCountries: transitCountries,
      // Google geometry must not leak into the MapLibre sea-map or its animation layers.
      roadPath: directions.provider !== 'google' ? unwrapLongitudes(rt.path) : undefined,
      originInlandKm: 0, destInlandKm: 0,
      ...fin, days, cv: coefficientOfVariation(history.map((h) => h.price)) * 0.5, frequency: 0, risk: 0, history,
      warnings: [...rt.warnings, ...(transitCountries.length ? [`Tuyến có dấu hiệu đi qua ${transitNames}. Hai đầu cùng nước vẫn có thể phải quá cảnh. Rà soát từ biên giới bản đồ khái quát; cần xác minh lộ trình và cửa khẩu trước khi đi.`] : [])],
    };
  });
  return { options, originPorts: [] as Port[], destPorts: [] as Port[], domestic };
}

/** Tính toàn bộ phương án cho một lần bấm "Tìm tuyến tối ưu" */
export async function buildPlan(input: PlanInput, deps: PlanDeps): Promise<Plan> {
  const calculatedAt = new Date().toISOString();
  const seller = sellerOf(input), buyer = buyerOf(input);
  const notes: string[] = [];
  const mode = input.mode;
  if (mode === 'road') {
    if (seller.kind !== 'address' || buyer.kind !== 'address') throw new Error('Đường bộ cần thành phố hoặc địa chỉ ở cả hai đầu, thay cho tên quốc gia.');
    const available = roadAvailability(seller.country, buyer.country);
    if (!available.ok) throw new Error(`Không có kết nối đường bộ: ${available.reason}. Hãy chọn phương thức khác.`);
  }
  const { setup, source: tariffSource, date } = await lookupTariff({ ...input, mode }, seller, buyer, deps);
  if (!input.customsDate && setup.entry) notes.push(`Ngày tính thuế: giả định = ngày hàng sẵn sàng (${date}). Nhập "Ngày khai hải quan dự kiến" nếu khác.`);
  const res = mode === 'sea' ? await seaOptions({ ...input, mode }, seller, buyer, deps, setup, notes) : await roadOptions({ ...input, mode }, seller, buyer, deps, setup, notes);
  const scope = scopeTitle(seller, buyer, mode);
  return { input: { ...input, mode }, calculatedAt, seller, buyer, notes, scopeTitle: scope.title, scopeShort: scope.short, tariffSource, customsDate: date, ...res };
}
