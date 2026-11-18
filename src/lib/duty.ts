import { customsBasisOf, vatBasisOf, type CustomsBasis } from '../data/customsBasis';
import { standardVatOf } from '../data/vatRates';
import type { TariffEntry } from '../providers/TariffProvider';
import { daysSince } from './csv';
import { computeFees, round2, type FeeLine } from './fees';
import { computeCharges, computeMeasures, vatRuleFor, type ChargeLine, type ChargeRule, type TradeMeasure } from './otherCharges';
import { specificDutyUsd, type DutyQty } from './specificDuty';

export const TARIFF_STALE_DAYS = 90;

/** complete: đủ mọi khoản đã biết · partial: có khoản chưa tính / ước tính · needs-input: thiếu thông tin người dùng nhập được · unavailable: chưa có thuế suất */
export type Completeness = 'complete' | 'partial' | 'needs-input' | 'unavailable';

export interface DutyLine {
  label: string;
  amount: number;
  note?: string;
}

export interface DutyResult {
  /** 'ok' có thuế suất; 'no-data' chưa có thuế suất cho HS + nước; 'no-value' chưa nhập giá trị hàng / mã HS; 'domestic' nội địa */
  status: 'ok' | 'no-data' | 'no-value' | 'domestic';
  completeness: Completeness;
  basis: CustomsBasis & { country: string };
  /** Trị giá tính thuế nhập khẩu (CIF hoặc FOB tuỳ nước) */
  customsValue: number;
  /** Thuế nhập khẩu = phần theo trị giá + phần tuyệt đối (đã áp MIN/MAX) */
  duty: number;
  /** Phần thuế nhập khẩu theo trị giá (%) */
  adValorem: number;
  /** Phần thuế tuyệt đối (USD, gồm điều chỉnh MIN/MAX) – NẰM TRONG `duty`, chỉ để diễn giải */
  specific: number;
  specificNote?: string;
  /** Có phần thuế tuyệt đối nhưng chưa tính được (thiếu số lượng / dạng đặc biệt) */
  specificPending: boolean;
  /** Thuế bổ sung (chống bán phá giá / tự vệ / bảng B…) – có chịu VAT */
  additional: number;
  additionalLines: DutyLine[];
  /** Thuế khác (TTĐB, bảng C…) */
  other: number;
  otherLines: (DutyLine & { vatBase: boolean })[];
  /** Phí không chịu VAT (MPF/HMF…) */
  fees: number;
  feeLines: FeeLine[];
  /** Cơ sở tính VAT/GST và diễn giải */
  vatBase: number;
  vatBaseNote: string;
  vatPct: number | null;
  vatNote?: string;
  vat: number;
  /** duty + additional + other + fees + vat (đã làm tròn đến cent từng khoản) */
  total: number;
  entry: TariffEntry | null;
  /** Dữ liệu cũ (năm biểu thuế < năm tính, hoặc cập nhật quá 90 ngày) */
  stale: boolean;
  staleReason?: string;
  vatMissing: boolean;
  /** Khoản chưa tính được / ước tính – tổng chưa đầy đủ */
  missing: string[];
  /** Thông tin còn thiếu mà người dùng nhập được */
  needInputs: string[];
  /** Điều kiện để mức thuế đúng (C/O theo hiệp định, mục đích sử dụng…) */
  conditions: string[];
  /** Giả định đã dùng (kiểu khai, phương thức…) */
  assumptions: string[];
  /** Khoản phát sinh tuỳ dịch vụ – không cộng */
  contingent: string[];
}

export interface DutyContext {
  /** Ngày dự kiến tính thuế (YYYY-MM-DD) */
  date?: string;
  /** Phương thức vận chuyển vào nước nhập */
  mode?: 'sea' | 'road';
  /** Bảng C và bảng B */
  charges?: ChargeRule[];
  measures?: TradeMeasure[];
  /** Nguồn thuế đã tự gồm biện pháp phòng vệ (UK Trade Tariff, TARIC) hoặc bảng B có dữ liệu cho mã này */
  measuresChecked?: boolean;
  origin?: string;
  company?: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

function emptyResult(importCountry: string, status: DutyResult['status'], completeness: Completeness): DutyResult {
  return {
    status, completeness, basis: customsBasisOf(importCountry), customsValue: 0, duty: 0, adValorem: 0, specific: 0, specificPending: false,
    additional: 0, additionalLines: [], other: 0, otherLines: [], fees: 0, feeLines: [], vatBase: 0, vatBaseNote: '', vatPct: null, vat: 0, total: 0,
    entry: null, stale: false, vatMissing: false, missing: [], needInputs: [], conditions: [], assumptions: [], contingent: [],
  };
}

export function domesticDuty(importCountry: string): DutyResult {
  return emptyResult(importCountry, 'domestic', 'complete');
}

/** Dữ liệu cũ: dùng NĂM CỦA BIỂU THUẾ nếu có (ngày tải lại không làm dữ liệu mới hơn), nếu không thì ngày cập nhật/xác minh */
export function staleness(entry: TariffEntry, date = todayIso()): { stale: boolean; reason?: string } {
  const year = +date.slice(0, 4);
  if (entry.dataYear != null) {
    if (entry.dataYear < year) return { stale: true, reason: `Biểu thuế năm ${entry.dataYear} (đã ${year - entry.dataYear} năm) – tải lại không làm số liệu mới hơn; cần đối chiếu biểu hiện hành.` };
    return { stale: false };
  }
  if (entry.expiryDate && entry.expiryDate < date) return { stale: true, reason: `Mức thuế hết hiệu lực từ ${entry.expiryDate}.` };
  if (daysSince(entry.updatedAt) > TARIFF_STALE_DAYS) return { stale: true, reason: `Cập nhật lần cuối ${entry.updatedAt} (quá ${TARIFF_STALE_DAYS} ngày).` };
  return { stale: false };
}

/**
 * Thuế nhập khẩu = trị giá tính thuế × thuế suất + phần tuyệt đối theo lượng (MIN/MAX của cả khoản).
 * Thuế bổ sung (entry.additionalPct + bảng B) – có chịu VAT. Thuế/phí khác (entry.otherPct + bảng C) – chịu VAT theo cột vat_base.
 * Phí theo trị giá (MPF/HMF…) có sàn/trần, tính một lần mỗi tờ khai, không chịu VAT.
 * VAT/GST = cơ sở VAT theo nước × thuế suất. Cơ sở VAT mặc định = trị giá tính thuế + thuế NK + thuế bổ sung + thuế khác chịu VAT;
 * Úc/NZ: cộng cả cước + bảo hiểm quốc tế (VoTI) dù thuế NK tính trên FOB.
 * Mọi khoản làm tròn đến cent; tổng = tổng các khoản đã làm tròn → bảng chi tiết và thẻ tổng luôn khớp.
 */
export function computeDuty(importCountry: string, cif: number, fob: number, entry: TariffEntry | null, hasInputs = true, qty?: DutyQty, ctx: DutyContext = {}): DutyResult {
  const basis = customsBasisOf(importCountry);
  if (!hasInputs) return { ...emptyResult(importCountry, 'no-value', 'needs-input'), needInputs: ['Mã HS và giá trị hàng'] };
  if (!entry) return { ...emptyResult(importCountry, 'no-data', 'unavailable'), missing: ['Thuế suất nhập khẩu (chưa có dữ liệu cho mã HS + nước nhập)'] };
  const date = ctx.date || todayIso();
  const customsValue = round2(Math.max(0, basis.basis === 'CIF' ? cif : fob));
  const missing: string[] = [], needInputs: string[] = [], conditions = [...(entry.conditions ?? [])], assumptions: string[] = [], contingent: string[] = [];
  if (entry.estimate) missing.push(`Mức thuế chính xác của mã quốc gia – ${entry.estimate}`);
  for (const u of entry.unresolved ?? []) missing.push(u);

  // 1. thuế nhập khẩu: phần % + phần tuyệt đối
  const adValorem = round2((customsValue * entry.dutyPct) / 100);
  let duty = adValorem, specific = 0, specificNote: string | undefined, specificPending = false;
  if (entry.specificDuty) {
    const r = specificDutyUsd(entry.specificDuty, qty);
    specificNote = r.note;
    if (r.usd == null) {
      specificPending = true;
      if (r.reason === 'qty') {
        needInputs.push(r.note);
        missing.push(`Phần thuế tuyệt đối "${entry.specificDuty}" (thiếu số lượng)`);
      } else missing.push(`Phần thuế tuyệt đối "${entry.specificDuty}" – ${r.note}`);
    } else {
      let d = adValorem + r.usd;
      if (r.minUsd != null) d = Math.max(d, r.minUsd);
      if (r.maxUsd != null) d = Math.min(d, r.maxUsd);
      duty = round2(d);
      specific = round2(duty - adValorem);
    }
  }

  // 2. thuế bổ sung: theo nguồn + bảng B
  const additionalLines: DutyLine[] = [];
  if (entry.additionalPct) additionalLines.push({ label: `${entry.additionalLabel || 'Thuế bổ sung'} ${entry.additionalPct}%`, amount: round2((customsValue * entry.additionalPct) / 100) });
  if (ctx.measures?.length) {
    const m = computeMeasures(ctx.measures, { country: importCountry, hs: entry.hs, origin: ctx.origin ?? entry.origin, date, company: ctx.company, customsValue, qty });
    additionalLines.push(...m.lines.map((l) => ({ label: l.label, amount: l.amount, note: l.note })));
    missing.push(...m.missing);
    needInputs.push(...m.needInputs);
    assumptions.push(...m.notes);
  }
  if (!ctx.measuresChecked && !(ctx.measures ?? []).some((m) => m.country === importCountry && entry.hs.startsWith(m.hs)))
    missing.push('Thuế phòng vệ thương mại (chống bán phá giá / chống trợ cấp / tự vệ) – chưa kiểm tra cho mã + xuất xứ này');
  const additional = round2(additionalLines.reduce((s, l) => s + l.amount, 0));

  // 3. thuế/phí khác: entry.otherPct + bảng C
  const otherLines: (DutyLine & { vatBase: boolean })[] = [];
  if (entry.otherPct) otherLines.push({ label: `Thuế khác ${entry.otherPct}%`, amount: round2(((customsValue + duty) * entry.otherPct) / 100), vatBase: true });
  const rules = (ctx.charges ?? []).filter((r) => r.country === importCountry && (!r.hsPrefix || entry.hs.startsWith(r.hsPrefix)) && (!r.effectiveDate || r.effectiveDate <= date));
  let chargeLines: ChargeLine[] = [];
  if (rules.length) {
    const c = computeCharges(rules, { customsValue, duty, qty, mode: ctx.mode, fta: entry.rateType === 'FTA' });
    chargeLines = c.lines;
    otherLines.push(...c.lines.map((l) => ({ label: l.label, amount: l.amount, note: l.note, vatBase: l.vatBase })));
    missing.push(...c.missing);
    needInputs.push(...c.needInputs);
    assumptions.push(...c.assumptions);
    contingent.push(...c.contingent);
  }
  if (entry.otherPctMissing && !rules.some((r) => r.kind !== 'vat' && r.hsPrefix && entry.hs.startsWith(r.hsPrefix)))
    missing.push('Thuế khác (ô other_pct để trống trong nguồn – phụ thuộc điều kiện, chưa có quy tắc tính)');
  const other = round2(otherLines.reduce((s, l) => s + l.amount, 0));

  // 4. phí theo trị giá (không chịu VAT)
  const feeRules = entry.fees ?? (entry.feePct ? [{ code: 'FEE', label: entry.feeLabel || 'Phí theo trị giá', pct: entry.feePct }] : []);
  const f = computeFees(feeRules, customsValue, ctx.mode);
  assumptions.push(...f.skipped, ...f.assumed);
  for (const l of f.lines) if (/formal entry/.test(l.note)) assumptions.push('MPF: giả định tờ khai chính thức (formal entry)');
  const fees = round2(f.lines.reduce((s, l) => s + l.amount, 0));

  // 5. VAT/GST: mức theo sản phẩm (bảng C) thay cho mức tiêu chuẩn chưa xác minh
  let vatPct = entry.vatPct, vatNote = entry.vatNote;
  let vatProvisional = !!entry.vatProvisional;
  const rule = vatRuleFor(rules, importCountry, entry.hs, date);
  if (rule && vatProvisional) {
    vatPct = rule.pct!;
    vatProvisional = false;
    vatNote = `${rule.name} (bảng C) – ${rule.source}`;
    conditions.push(`VAT/GST ${rule.pct}%: ${rule.name} – áp dụng khi hàng đúng mô tả và mục đích sử dụng`);
  } else if (rule && entry.vatPct != null && rule.pct !== entry.vatPct) {
    assumptions.push(`Bảng C ghi ${rule.name} ${rule.pct}% – khác VAT ${entry.vatPct}% của dòng thuế; đang dùng mức của dòng thuế`);
  }
  if (vatPct == null) {
    const std = standardVatOf(importCountry);
    if (std === 0) vatPct = 0;
    else missing.push('VAT/GST (chưa có thuế suất)');
  } else if (vatProvisional) missing.push(`VAT/GST theo mức tiêu chuẩn ${vatPct}% – chưa xác minh cho mặt hàng này (có thể có mức giảm/miễn)`);
  const vb = vatBasisOf(importCountry);
  const vatOther = otherLines.filter((l) => l.vatBase).reduce((s, l) => s + l.amount, 0);
  const valueForVat = vb === 'CIF' ? round2(Math.max(0, cif)) : customsValue;
  const vatBase = round2(valueForVat + duty + additional + vatOther);
  const vatBaseNote =
    `${vb === 'CIF' && basis.basis !== 'CIF' ? 'trị giá CIF (gồm cước + bảo hiểm quốc tế)' : `trị giá ${basis.basis}`} + thuế NK` +
    (additional ? ' + thuế bổ sung' : '') + (vatOther ? ' + thuế/phí khác chịu VAT' : '') + (importCountry === 'AU' ? ' (VoTI; chưa gồm WET nếu là rượu vang)' : '');
  const vat = vatPct == null ? 0 : round2((vatBase * vatPct) / 100);
  if (importCountry === 'AU' && /^2204|^2205|^2206/.test(entry.hs)) missing.push('Thuế WET (rượu vang) – chưa hỗ trợ');
  if (chargeLines.some((l) => !l.vatBase) && vatPct) assumptions.push('Các khoản bảng C có vat_base = 0 / chưa xác nhận không cộng vào cơ sở VAT');

  const st = staleness(entry, date);
  const total = round2(duty + additional + other + fees + vat);
  const completeness: Completeness = needInputs.length ? 'needs-input' : missing.length ? 'partial' : 'complete';
  return {
    status: 'ok', completeness, basis, customsValue, duty, adValorem, specific, specificNote, specificPending, additional, additionalLines, other, otherLines,
    fees, feeLines: f.lines, vatBase, vatBaseNote, vatPct, ...(vatNote && { vatNote }), vat, total, entry,
    stale: st.stale, ...(st.reason && { staleReason: st.reason }), vatMissing: vatPct == null,
    missing: [...new Set(missing)], needInputs: [...new Set(needInputs)], conditions: [...new Set(conditions)], assumptions: [...new Set(assumptions)], contingent,
  };
}
