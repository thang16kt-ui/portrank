import { stripAccents } from '../data/countries';
import { parseDate, rowsToRecords, toDecimal } from './csv';
import { FX, specificDutyUsd, type DutyQty } from './specificDuty';

/**
 * Bảng B (phòng vệ thương mại: chống bán phá giá / chống trợ cấp / tự vệ / chống lẩn tránh) và
 * bảng C (thuế, phí khác: VAT theo sản phẩm, thuế tiêu thụ, phí khai báo…).
 * Nguyên tắc: không có dòng ≠ thuế 0. Khoản chưa đọc chắc được → "chưa tính", nêu rõ; các khoản thay thế nhau (cùng `group`) chỉ chọn một.
 */

const digits = (s: string) => s.replace(/\D/g, '');
const norm = (s: string) => stripAccents(s).toLowerCase();

/* ─────────────────────────── Bảng C ─────────────────────────── */

export interface Money {
  amount: number;
  currency: string;
}

export interface ChargeRule {
  id: string;
  country: string;
  /** Tiền tố HS; '' = theo giao dịch, mọi mã */
  hsPrefix: string;
  name: string;
  /**
   * vat: mức VAT/GST theo sản phẩm (thay mức tiêu chuẩn) · pct: % trên `basis` · fixed: số tiền mỗi tờ khai ·
   * excess: % trên phần trị giá mỗi món vượt ngưỡng · ofCharge: % trên số tiền của khoản `ofId` · unsupported: chưa đủ dữ liệu để tính
   */
  kind: 'vat' | 'pct' | 'fixed' | 'excess' | 'ofCharge' | 'unsupported';
  pct?: number;
  basis?: 'customs' | 'customs+duty';
  fixed?: Money;
  /** Ngưỡng mỗi món (excess) */
  threshold?: Money;
  ofId?: string;
  /** Mức tối thiểu của khoản */
  min?: Money;
  /** Điều kiện trị giá lô hàng (so với trị giá hải quan) */
  band?: { above?: Money; atLeast?: Money; below?: Money };
  /** Chỉ áp dụng cho phương thức */
  modes?: ('sea' | 'air' | 'road')[];
  /** Các khoản thay thế nhau – chỉ chọn một */
  group?: string;
  /** Biến thể dành cho hàng hưởng ưu đãi hiệp định */
  ftaVariant?: boolean;
  /** Biến thể không mặc định (vd. khai giấy thay cho khai điện tử) */
  altVariant?: boolean;
  /** Có cộng vào cơ sở tính VAT không; null = chưa xác nhận */
  vatBase: boolean | null;
  source: string;
  effectiveDate: string;
  updatedAt: string;
  /** Nguyên văn điều kiện (basis / min_max) */
  note: string;
}

export const CHARGE_CSV_HEADER = ['import_country', 'hs_prefix', 'tax_name', 'rate_pct', 'specific', 'basis', 'vat_base', 'min_max', 'source', 'effective_date', 'updated_at'];

const money = (s: string): Money | null => {
  const m = s.match(/([A-Z]{3})\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*([A-Z]{3})/);
  if (!m) return null;
  return m[1] ? { amount: +m[2], currency: m[1] } : { amount: +m[3], currency: m[4] };
};

/** Nhóm các khoản thay thế nhau theo tên (bộ dữ liệu C đã nhận) */
function groupOf(country: string, name: string): string | undefined {
  const n = norm(name);
  if (/^dta\b/.test(n)) return `${country}-DTA`;
  if (/^import processing charge/.test(n)) return `${country}-IPC`;
  if (/^biosecurity full import declaration/.test(n)) return `${country}-BIO`;
  return undefined;
}

export function parseChargeRows(rows: string[][]): { rules: ChargeRule[]; errors: string[]; warnings: string[] } {
  const recs = rowsToRecords(rows, {
    country: ['import_country', 'nuoc nhap'],
    hsPrefix: ['hs_prefix', 'hs'],
    name: ['tax_name', 'ten'],
    ratePct: ['rate_pct'],
    specific: ['specific'],
    basis: ['basis'],
    vatBase: ['vat_base'],
    minMax: ['min_max'],
    source: ['source', 'nguon'],
    effectiveDate: ['effective_date'],
    updatedAt: ['updated_at'],
  });
  const rules: ChargeRule[] = [], errors: string[] = [], warnings: string[] = [];
  recs.forEach((r, i) => {
    const line = i + 2;
    const country = (r.country ?? '').trim().toUpperCase();
    if (country.length !== 2) return errors.push(`Bảng C dòng ${line}: import_country phải là mã 2 chữ`);
    if (!r.name) return errors.push(`Bảng C dòng ${line}: thiếu tax_name`);
    if (!r.source) return errors.push(`Bảng C dòng ${line}: thiếu nguồn`);
    const eff = parseDate(r.effectiveDate), upd = parseDate(r.updatedAt);
    if (eff.invalid || upd.invalid) return errors.push(`Bảng C dòng ${line}: ngày không có thật`);
    const pct = toDecimal(r.ratePct);
    if (r.ratePct && !isFinite(pct)) return errors.push(`Bảng C dòng ${line}: không đọc được rate_pct "${r.ratePct}"`);
    if (isFinite(pct) && pct < 0) return errors.push(`Bảng C dòng ${line}: rate_pct âm`);
    const basisText = r.basis ?? '', mm = r.minMax ?? '', name = r.name, n = norm(name), nb = norm(basisText);
    const vb = (r.vatBase ?? '').trim();
    const base: ChargeRule = {
      id: `C${line}-${country}`, country, hsPrefix: digits(r.hsPrefix ?? ''), name, kind: 'unsupported', vatBase: vb === '1' ? true : vb === '0' ? false : null,
      source: r.source, effectiveDate: eff.iso, updatedAt: upd.iso, note: [basisText, mm].filter(Boolean).join(' · '),
    };
    const g = groupOf(country, name);
    if (g) base.group = g;
    if (/hiep dinh/.test(n)) base.ftaVariant = true;
    if (/khai giay/.test(n)) base.altVariant = true;
    if (/duong bien/.test(n)) base.modes = ['sea'];
    else if (/duong hang khong/.test(n)) base.modes = ['air'];
    // điều kiện trị giá lô hàng
    const above = mm.match(/(?:lớn hơn|trên)\s+([A-Z]{3}\s*\d+(?:\.\d+)?)/i), atLeast = mm.match(/từ\s+([A-Z]{3}\s*\d+(?:\.\d+)?)/i), below = mm.match(/nhỏ hơn\s+([A-Z]{3}\s*\d+(?:\.\d+)?)/i);
    if (above || atLeast || below) base.band = { ...(above && { above: money(above[1])! }), ...(atLeast && { atLeast: money(atLeast[1])! }), ...(below && { below: money(below[1])! }) };
    const min = mm.match(/tối thiểu\s+([A-Z]{3}\s*\d+(?:\.\d+)?)/i);
    if (min) base.min = money(min[1])!;
    const isVat = /\b(gst|vat|iva)\b|consumption tax(?! .*individual)/i.test(name) && !/individual consumption/i.test(name);
    if (isVat && isFinite(pct)) rules.push({ ...base, kind: 'vat', pct });
    else if (/max\s*\(\s*0/.test(nb) && isFinite(pct)) {
      const th = money(mm);
      if (!th) {
        warnings.push(`Bảng C dòng ${line}: "${name}" tính trên phần vượt ngưỡng nhưng không đọc được ngưỡng – chưa tính`);
        rules.push(base);
      } else rules.push({ ...base, kind: 'excess', pct, basis: 'customs+duty', threshold: th, note: `${base.note}${/mỗi bộ|moi bo/i.test(mm) ? ' (đang so ngưỡng mỗi món; hàng bán theo bộ dùng ngưỡng của bộ)' : ''}` });
    } else if (/so thue tieu thu dac biet|so thue/.test(nb) && isFinite(pct)) {
      const parent = rules.find((x) => x.country === country && x.hsPrefix === base.hsPrefix && x.kind === 'excess');
      if (parent) rules.push({ ...base, kind: 'ofCharge', pct, ofId: parent.id });
      else {
        warnings.push(`Bảng C dòng ${line}: "${name}" tính trên số thuế khác nhưng không tìm thấy khoản gốc – chưa tính`);
        rules.push(base);
      }
    } else if (isFinite(pct) && /^customs(\+duty)?$/.test(nb.replace(/\s/g, ''))) rules.push({ ...base, kind: 'pct', pct, basis: nb.includes('duty') ? 'customs+duty' : 'customs' });
    else if (r.specific && /tờ khai|to khai|entry/i.test(r.specific + basisText)) {
      const m = money(r.specific);
      if (m) rules.push({ ...base, kind: 'fixed', fixed: m });
      else {
        warnings.push(`Bảng C dòng ${line}: không đọc được số tiền "${r.specific}" – chưa tính`);
        rules.push(base);
      }
    } else rules.push(base);
  });
  return { rules, errors, warnings };
}

/** Các khoản của bảng C áp cho nước + mã HS tại ngày tính */
export function chargesFor(rules: ChargeRule[], country: string, hs: string, date: string): ChargeRule[] {
  const h = digits(hs);
  return rules.filter((r) => r.country === country && (!r.hsPrefix || h.startsWith(r.hsPrefix)) && (!r.effectiveDate || r.effectiveDate <= date));
}

/** Mức VAT theo sản phẩm (bảng C) – null nếu không có */
export function vatRuleFor(rules: ChargeRule[], country: string, hs: string, date: string): ChargeRule | null {
  return chargesFor(rules, country, hs, date).filter((r) => r.kind === 'vat').sort((a, b) => b.hsPrefix.length - a.hsPrefix.length)[0] ?? null;
}

const toUsd = (m: Money) => (FX.usdPer[m.currency] ? m.amount * FX.usdPer[m.currency] : NaN);

export interface ChargeLine {
  id: string;
  label: string;
  amount: number;
  vatBase: boolean;
  note: string;
}

export interface ChargeResult {
  lines: ChargeLine[];
  /** Khoản biết là có nhưng chưa tính được */
  missing: string[];
  /** Thông tin cần nhập thêm */
  needInputs: string[];
  /** Giả định đã dùng để chọn trong các khoản thay thế */
  assumptions: string[];
  /** Khoản phát sinh tuỳ dịch vụ – không cộng */
  contingent: string[];
}

/**
 * Tính các khoản của bảng C (trừ VAT theo sản phẩm). Trị giá theo USD; tiền tệ khác quy đổi tỷ giá ECB (dự toán, không phải tỷ giá hải quan).
 * `fta`: đã áp ưu đãi hiệp định (chọn biến thể DTA cố định ở Mexico…).
 */
export function computeCharges(
  rules: ChargeRule[],
  ctx: { customsValue: number; duty: number; qty?: DutyQty; mode?: 'sea' | 'road'; fta: boolean },
): ChargeResult {
  const res: ChargeResult = { lines: [], missing: [], needInputs: [], assumptions: [], contingent: [] };
  const amounts = new Map<string, number>();
  const inBand = (r: ChargeRule) => {
    if (!r.band) return true;
    const cur = (r.band.above ?? r.band.atLeast ?? r.band.below)!.currency;
    const rate = FX.usdPer[cur];
    if (!rate) return true;
    const v = ctx.customsValue / rate;
    return (!r.band.above || v > r.band.above.amount) && (!r.band.atLeast || v >= r.band.atLeast.amount) && (!r.band.below || v < r.band.below.amount);
  };
  const active = rules.filter((r) => r.kind !== 'vat');
  // chọn một khoản trong mỗi nhóm thay thế
  const chosen: ChargeRule[] = [];
  const groups = new Map<string, ChargeRule[]>();
  for (const r of active) {
    if (!r.group) chosen.push(r);
    else groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
  }
  for (const [g, list] of groups) {
    let c = list.filter(inBand);
    if (c.some((r) => r.modes)) {
      if (!ctx.mode) res.assumptions.push(`${list[0].name}: chưa biết phương thức – giả định đường biển`);
      const m = ctx.mode === 'road' ? 'road' : 'sea';
      c = c.filter((r) => !r.modes || r.modes.includes(m));
      if (!c.length) continue;
    }
    if (c.some((r) => r.ftaVariant)) {
      const pick = c.filter((r) => !!r.ftaVariant === ctx.fta);
      if (pick.length) {
        c = pick;
        if (ctx.fta) res.assumptions.push(`${c[0].name}: chọn vì đang áp thuế ưu đãi hiệp định – cần đủ điều kiện hồ sơ`);
      }
    }
    if (c.some((r) => r.altVariant) && c.some((r) => !r.altVariant)) {
      res.assumptions.push(`${g.split('-')[1]}: giả định khai điện tử (khai giấy có mức khác)`);
      c = c.filter((r) => !r.altVariant);
    }
    if (c[0]) chosen.push(c[0]);
  }
  chosen.sort((a, b) => rules.indexOf(a) - rules.indexOf(b));
  for (const r of chosen) {
    let amount: number | null = null, how = '';
    if (r.kind === 'pct') {
      const b = r.basis === 'customs+duty' ? ctx.customsValue + ctx.duty : ctx.customsValue;
      amount = (b * r.pct!) / 100;
      how = `${r.pct}% × ${r.basis === 'customs+duty' ? 'trị giá + thuế NK' : 'trị giá'}`;
      if (r.min) {
        const minUsd = toUsd(r.min);
        if (isFinite(minUsd) && amount < minUsd) [amount, how] = [minUsd, `${how} < tối thiểu ${r.min.currency} ${r.min.amount}`];
      }
    } else if (r.kind === 'fixed') {
      const v = toUsd(r.fixed!);
      if (isFinite(v)) [amount, how] = [v, `${r.fixed!.currency} ${r.fixed!.amount}/tờ khai`];
    } else if (r.kind === 'excess') {
      const units = ctx.qty?.units ?? 0;
      const th = toUsd(r.threshold!);
      if (!(units > 0)) {
        res.needInputs.push(`Số lượng món (để so ngưỡng ${r.threshold!.currency} ${r.threshold!.amount.toLocaleString('en-US')} của "${r.name}")`);
        res.missing.push(r.name);
        continue;
      }
      if (isFinite(th)) {
        const per = (ctx.customsValue + ctx.duty) / units;
        amount = units * Math.max(0, per - th) * (r.pct! / 100);
        how = `${r.pct}% × phần vượt ${r.threshold!.currency} ${r.threshold!.amount.toLocaleString('en-US')} mỗi món (${units} món, ≈ ${Math.round(per).toLocaleString('en-US')} USD/món)`;
      }
    } else if (r.kind === 'ofCharge') {
      const parent = amounts.get(r.ofId!);
      if (parent == null) {
        if (!res.missing.includes(r.name)) res.missing.push(r.name);
        continue;
      }
      [amount, how] = [(parent * r.pct!) / 100, `${r.pct}% × số thuế của khoản gốc`];
    } else {
      // không có mức → khoản phát sinh tuỳ dịch vụ
      res.contingent.push(`${r.name} – ${r.note || 'chưa có mức'}`);
      continue;
    }
    if (amount == null) {
      res.missing.push(`${r.name} (chưa có tỷ giá để quy đổi)`);
      continue;
    }
    amounts.set(r.id, amount);
    if (r.vatBase == null) res.missing.push(`Có cộng "${r.name}" vào cơ sở VAT hay không – chưa xác nhận (đang không cộng)`);
    res.lines.push({ id: r.id, label: r.name, amount: Math.round(amount * 100) / 100, vatBase: r.vatBase === true, note: [how, r.note].filter(Boolean).join(' · ') });
  }
  return res;
}

/* ─────────────────────────── Bảng B ─────────────────────────── */

export interface TradeMeasure {
  id: string;
  country: string;
  hs: string;
  origin: string;
  /** AD / CVD / SG / AC … */
  measure: string;
  /** Công ty / nhà sản xuất; '' hoặc '*' = mọi công ty khác */
  company: string;
  ratePct: number | null;
  specific: string;
  caseId: string;
  source: string;
  effectiveDate: string;
  expiryDate: string;
  updatedAt: string;
}

export const MEASURE_CSV_HEADER = ['import_country', 'hs', 'origin', 'measure', 'company', 'rate_pct', 'specific', 'case_id', 'source', 'effective_date', 'expiry_date', 'updated_at'];

export function parseMeasureRows(rows: string[][]): { measures: TradeMeasure[]; errors: string[] } {
  const recs = rowsToRecords(rows, {
    country: ['import_country'], hs: ['hs'], origin: ['origin'], measure: ['measure'], company: ['company'], ratePct: ['rate_pct'],
    specific: ['specific'], caseId: ['case_id'], source: ['source'], effectiveDate: ['effective_date'], expiryDate: ['expiry_date'], updatedAt: ['updated_at'],
  });
  const measures: TradeMeasure[] = [], errors: string[] = [];
  recs.forEach((r, i) => {
    const line = i + 2;
    const country = (r.country ?? '').trim().toUpperCase();
    if (country.length !== 2) return errors.push(`Bảng B dòng ${line}: import_country phải là mã 2 chữ`);
    if (digits(r.hs ?? '').length < 4) return errors.push(`Bảng B dòng ${line}: mã HS không hợp lệ`);
    if (!r.source) return errors.push(`Bảng B dòng ${line}: thiếu nguồn`);
    const pct = toDecimal(r.ratePct);
    if (r.ratePct && !isFinite(pct)) return errors.push(`Bảng B dòng ${line}: không đọc được rate_pct`);
    if (isFinite(pct) && pct < 0) return errors.push(`Bảng B dòng ${line}: rate_pct âm`);
    if (!r.ratePct && !r.specific) return errors.push(`Bảng B dòng ${line}: thiếu rate_pct hoặc specific – không được coi là 0`);
    const eff = parseDate(r.effectiveDate), exp = parseDate(r.expiryDate), upd = parseDate(r.updatedAt);
    if (eff.invalid || exp.invalid || upd.invalid) return errors.push(`Bảng B dòng ${line}: ngày không có thật`);
    if (eff.iso && exp.iso && exp.iso < eff.iso) return errors.push(`Bảng B dòng ${line}: expiry_date trước effective_date`);
    measures.push({
      id: `B${line}-${country}`, country, hs: digits(r.hs!), origin: (r.origin ?? '*').toUpperCase() || '*', measure: (r.measure ?? '').toUpperCase(),
      company: (r.company ?? '').trim(), ratePct: isFinite(pct) ? pct : null, specific: r.specific ?? '', caseId: r.caseId ?? '', source: r.source,
      effectiveDate: eff.iso, expiryDate: exp.iso, updatedAt: upd.iso,
    });
  });
  return { measures, errors };
}

const generalCompany = (c: string) => !c || c === '*' || /all others|other|tat ca|con lai|khac/i.test(norm(c));

export interface MeasureResult {
  lines: ChargeLine[];
  missing: string[];
  needInputs: string[];
  notes: string[];
}

/**
 * Áp các biện pháp bảng B: đúng nước, mã (biện pháp ở mã cha áp cho mã con; biện pháp chỉ ở MỘT SỐ mã con → cần phân loại),
 * xuất xứ, còn hiệu lực. Mức riêng theo công ty chỉ dùng khi biết công ty; chưa biết → mức "mọi công ty khác" và ghi rõ.
 */
export function computeMeasures(measures: TradeMeasure[], q: { country: string; hs: string; origin: string; date: string; company?: string; customsValue: number; qty?: DutyQty }): MeasureResult {
  const res: MeasureResult = { lines: [], missing: [], needInputs: [], notes: [] };
  const h = digits(q.hs);
  const rel = measures.filter((m) => m.country === q.country && (m.origin === '*' || m.origin === q.origin));
  const live = rel.filter((m) => (!m.effectiveDate || m.effectiveDate <= q.date) && (!m.expiryDate || m.expiryDate >= q.date));
  const expired = rel.filter((m) => h.startsWith(m.hs) && !live.includes(m));
  if (expired.length) res.notes.push(`Bỏ qua ${expired.length} biện pháp đã hết hạn/chưa hiệu lực tại ${q.date} (${expired.map((m) => m.caseId || m.measure).join(', ')}).`);
  const child = live.filter((m) => m.hs.startsWith(h) && m.hs.length > h.length);
  if (child.length) res.missing.push(`Có biện pháp ${[...new Set(child.map((m) => m.measure))].join('/')} cho mã con ${[...new Set(child.map((m) => m.hs))].join(', ')} – nhập mã chi tiết để xác định`);
  const hit = live.filter((m) => h.startsWith(m.hs));
  const byCase = new Map<string, TradeMeasure[]>();
  for (const m of hit) byCase.set(m.caseId || `${m.measure}-${m.hs}`, [...(byCase.get(m.caseId || `${m.measure}-${m.hs}`) ?? []), m]);
  for (const [caseId, list] of byCase) {
    const own = q.company ? list.find((m) => !generalCompany(m.company) && norm(m.company).includes(norm(q.company!))) : undefined;
    const general = list.find((m) => generalCompany(m.company));
    const m = own ?? general;
    const specificCos = list.filter((x) => !generalCompany(x.company));
    if (!m) {
      res.missing.push(`${list[0].measure} ${caseId}: chỉ có mức riêng cho ${specificCos.map((x) => x.company).join(', ')} – nhập tên nhà sản xuất`);
      res.needInputs.push('Tên nhà sản xuất / xuất khẩu (để chọn mức phòng vệ thương mại riêng)');
      continue;
    }
    if (!own && specificCos.length) res.notes.push(`${m.measure} ${caseId}: đang dùng mức chung ${m.ratePct ?? ''}${m.ratePct != null ? '%' : ''} – có mức riêng cho ${specificCos.map((x) => `${x.company} ${x.ratePct ?? x.specific}${x.ratePct != null ? '%' : ''}`).join(', ')}.`);
    let amount = m.ratePct != null ? (q.customsValue * m.ratePct) / 100 : 0;
    const parts = m.ratePct != null ? [`${m.ratePct}% × trị giá`] : [];
    if (m.specific) {
      const s = specificDutyUsd(m.specific, q.qty);
      if (s.usd == null) {
        res.missing.push(`${m.measure} ${caseId}: phần "${m.specific}" – ${s.note}`);
        if (s.reason === 'qty') res.needInputs.push(s.note);
      } else {
        amount += s.usd;
        parts.push(s.note);
      }
    }
    res.lines.push({ id: m.id, label: `${m.measure} ${caseId}${own ? ` (${own.company})` : ''}`.trim(), amount: Math.round(amount * 100) / 100, vatBase: true, note: [...parts, m.source].join(' · ') });
  }
  return res;
}

/** Bảng B có dữ liệu cho nước + mã này không (để phân biệt "đã kiểm tra" với "chưa kiểm tra") */
export const measuresCover = (measures: TradeMeasure[], country: string, hs: string) => measures.some((m) => m.country === country && (digits(hs).startsWith(m.hs) || m.hs.startsWith(digits(hs))));
