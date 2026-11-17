import { COUNTRY_CHARGES, FOB_BASIS_COUNTRIES, INSURANCE_PCT, MANUAL_REVIEW_AFTER_DAYS, NO_NATIONAL_VAT, STALE_AFTER_DAYS, STANDARD_VAT } from '../config/taxes';
import { EU_COUNTRIES } from '../data/ports';
import type { Product, TariffBook, TariffLine, TaxKind, TaxMeasure } from '../data/tariff/types';

/* ───────────────────────── Tiện ích ───────────────────────── */

export const digits = (s: string | undefined | null) => (s ?? '').replace(/\D/g, '');

/** Định dạng mã: 61091000 → 6109.10.00, 6109100010 → 6109.10.00.10 */
export function fmtCode(code: string): string {
  const d = digits(code);
  if (d.length <= 4) return d;
  return [d.slice(0, 4), ...(d.slice(4).match(/.{1,2}/g) ?? [])].join('.');
}

const SPECIFIC_UNIT = /[¢$€£]|\b(?:usd|eur|gbp|kg|g|l|liter|litre|doz|pcs?|each|no|m2|m3|t|tonne|hl)\b/i;

/**
 * Tách thuế suất dạng chữ thành % theo trị giá.
 *   "16.5%" → 16.5 · "Free" → 0 · "12.00 %" → 12 · "4% + 1¢/kg" → 4 (specific)
 *   "The duty provided in the applicable subheading + 20%" → 20 · "2.2¢/kg" → null (specific)
 */
export function parseRate(text: string | undefined | null): { pct: number | null; specific: boolean } {
  const t = (text ?? '').trim();
  if (!t) return { pct: null, specific: false };
  if (/^free\b/i.test(t)) return { pct: 0, specific: false };
  const m = t.match(/(\d+(?:\.\d+)?)\s*%/);
  const rest = t.replace(/(\d+(?:\.\d+)?)\s*%/g, ' ');
  const specific = /\d/.test(rest) && SPECIFIC_UNIT.test(rest);
  return { pct: m ? +m[1] : null, specific };
}

/** CSV tối giản theo RFC 4180 (hỗ trợ dấu ngoặc kép, dấu phẩy và xuống dòng trong ô). Bỏ dòng bắt đầu bằng # */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell), rows.push(row), (row = []), (cell = '');
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  const data = rows.filter((r) => r.some((x) => x.trim()) && !r[0].trim().startsWith('#'));
  if (!data.length) return [];
  const head = data[0].map((h) => h.trim());
  return data.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const list = (s: string) => s.split(/[\s;|]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);

/** products.csv: sku,name,hs6,<mã nước 1>,<mã nước 2>,… (cột nước là ISO alpha-2 hoặc EU) */
export function parseProductsCsv(csv: string): Product[] {
  return parseCsv(csv)
    .filter((r) => r.sku && digits(r.hs6).length === 6)
    .map((r) => {
      const codes: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) if (/^[A-Z]{2}$/.test(k) && digits(v)) codes[k] = digits(v);
      return { sku: r.sku, name: r.name, hs6: digits(r.hs6), codes };
    });
}

const KINDS: TaxKind[] = ['mfn', 'preferential', 'additional', 'vat', 'excise', 'other'];

/**
 * manual.csv – thuế nhập tay cho các nước chưa có API mở (EU, Việt Nam…):
 * country,code,description,kind,label,rate,origins,agreement,proof,validFrom,validTo,reviewedAt,source,note
 * `code` có thể là tiền tố (vd. HS6 610910) → áp dụng cho mọi mã quốc gia bên dưới.
 * Mỗi nước thành một TariffBook; `fetchedAt` = ngày rà soát cũ nhất của nước đó, rỗng nếu có dòng chưa đối chiếu.
 */
export function parseManualCsv(csv: string): TariffBook[] {
  const books = new Map<string, TariffBook>();
  const unreviewed = new Set<string>();
  for (const r of parseCsv(csv)) {
    const country = r.country?.toUpperCase();
    const code = digits(r.code);
    const kind = r.kind as TaxKind;
    if (!country || !code || !KINDS.includes(kind)) continue;
    const { pct, specific } = parseRate(r.rate);
    const m: TaxMeasure = {
      kind,
      label: r.label || kind,
      rate: r.rate,
      pct,
      ...(specific && { specific }),
      ...(r.origins && { origins: list(r.origins) }),
      ...(r.agreement && { agreement: r.agreement }),
      ...(r.proof && { proof: r.proof }),
      ...(r.validFrom && { validFrom: r.validFrom }),
      ...(r.validTo && { validTo: r.validTo }),
      ...(r.note && { note: r.note }),
      confidence: 'manual',
      source: r.source || 'Nhập tay',
    };
    let b = books.get(country);
    if (!b) {
      b = { country, source: 'Nhập tay – src/data/tariff/manual.csv', sourceUrl: '', fetchedAt: r.reviewedAt, lines: [] };
      books.set(country, b);
    }
    if (!r.reviewedAt) unreviewed.add(country);
    else if (!b.fetchedAt || r.reviewedAt < b.fetchedAt) b.fetchedAt = r.reviewedAt;
    let line = b.lines.find((l) => l.code === code);
    if (!line) b.lines.push((line = { code, description: r.description, measures: [] }));
    line.measures.push(m);
  }
  for (const c of unreviewed) books.get(c)!.fetchedAt = '';
  return [...books.values()];
}

/* ───────────────────────── Tra cứu ───────────────────────── */

/** Các biểu thuế áp dụng khi nhập vào `dest` (gồm biểu chung EU nếu là nước thành viên) */
export function booksFor(dest: string, books: TariffBook[]): TariffBook[] {
  return books.filter((b) => b.country === dest || (b.country === 'EU' && EU_COUNTRIES.has(dest)));
}

/** Mã quốc gia của sản phẩm tại nước nhập khẩu; không có thì dùng HS6 */
export function codeFor(p: Product, dest: string): string {
  return p.codes[dest] ?? (EU_COUNTRIES.has(dest) ? p.codes.EU : undefined) ?? p.hs6;
}

export interface LineMatch {
  /** Các dòng có mã là tiền tố của mã cần tra (từ chung đến riêng) */
  lines: { line: TariffLine; book: TariffBook }[];
  /** Khi chỉ biết mã ngắn (vd. HS6): các dòng chi tiết hơn để người dùng chọn */
  candidates: { line: TariffLine; book: TariffBook }[];
}

export function resolveLines(books: TariffBook[], code: string): LineMatch {
  const c = digits(code);
  const lines: LineMatch['lines'] = [];
  const candidates: LineMatch['candidates'] = [];
  for (const book of books)
    for (const line of book.lines) {
      if (c.startsWith(line.code)) lines.push({ line, book });
      else if (line.code.startsWith(c)) candidates.push({ line, book });
    }
  lines.sort((a, b) => a.line.code.length - b.line.code.length);
  // Có đúng 1 dòng chi tiết hơn (ở nguồn tự động) → dùng luôn
  const rateCands = candidates.filter((x) => x.line.measures.some((m) => m.kind === 'mfn'));
  if (rateCands.length === 1) {
    lines.push(rateCands[0]);
    return { lines, candidates: [] };
  }
  return { lines, candidates: rateCands.length ? rateCands : candidates };
}

/* ───────────────────────── Tính thuế ───────────────────────── */

export interface TaxInput {
  /** Nước nhập khẩu (ISO) */
  dest: string;
  /** Nước xuất xứ hàng hoá (ISO) */
  origin: string;
  /** Mã quốc gia hoặc HS6 */
  code: string;
  /** Trị giá hàng FOB (USD) */
  goodsValue: number;
  /** Chi phí đưa hàng đến cảng nhập (cước biển + phụ phí + phí cảng đi), USD */
  freight: number;
  /** YYYY-MM-DD – ngày dự kiến nhập khẩu */
  date: string;
  /** Ngày "hôm nay" để kiểm tra dữ liệu cũ (mặc định = ngày hiện tại) */
  today?: string;
}

export interface TaxRow {
  kind: TaxKind;
  label: string;
  rate: string;
  pct: number | null;
  base: number;
  /** null = không tính được (thuế tuyệt đối / chưa có số) */
  amount: number | null;
  note?: string;
  confidence: TaxMeasure['confidence'];
  source: string;
  agreement?: string;
  proof?: string;
}

export interface SourceInfo {
  country: string;
  source: string;
  sourceUrl: string;
  release?: string;
  fetchedAt: string;
  ageDays: number;
  stale: boolean;
  manual: boolean;
}

export interface TaxResult {
  input: TaxInput;
  code: string;
  basis: 'CIF' | 'FOB';
  cif: number;
  customsValue: number;
  /** Dòng biểu thuế khớp nhất (chi tiết nhất) */
  line?: TariffLine;
  candidates: TariffLine[];
  mfn?: TaxMeasure;
  /** Các ưu đãi FTA mà xuất xứ này có thể hưởng */
  preferences: TaxMeasure[];
  /** Ưu đãi được chọn (thấp hơn MFN) */
  chosen?: TaxMeasure;
  rows: TaxRow[];
  /** Thuế bổ sung có thể áp dụng tuỳ điều kiện – không cộng vào tổng */
  references: TaxMeasure[];
  dutyTotal: number;
  vatTotal: number;
  total: number;
  /** Tiền thuế tiết kiệm được nhờ ưu đãi so với MFN */
  saving: number;
  warnings: string[];
  sources: SourceInfo[];
}

const applies = (m: TaxMeasure, origin: string, date: string) =>
  (!m.origins || m.origins.includes(origin)) &&
  !m.excludedOrigins?.includes(origin) &&
  (!m.validFrom || m.validFrom <= date) &&
  (!m.validTo || m.validTo.slice(0, 10) >= date);

const rank = (m: TaxMeasure) => (m.origins ? 0 : 2) + (m.confidence === 'official' ? 0 : 1);
const days = (from: string, to: string) => Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000);

export function computeTaxes(input: TaxInput, allBooks: TariffBook[]): TaxResult {
  const { dest, origin, date } = input;
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const books = booksFor(dest, allBooks);
  const code = digits(input.code);
  const match = resolveLines(books, code);
  const warnings: string[] = [];

  const fromLines = match.lines.flatMap((x) => x.line.measures);
  const fromBooks = books.flatMap((b) => b.originMeasures ?? []);
  const all = [...fromLines, ...fromBooks, ...(COUNTRY_CHARGES[dest] ?? [])].filter((m) => applies(m, origin, date));

  // Trị giá tính thuế
  const goods = Math.max(0, input.goodsValue), freight = Math.max(0, input.freight);
  const insurance = ((goods + freight) * INSURANCE_PCT) / 100;
  const cif = goods + freight + insurance;
  const basis: TaxResult['basis'] = FOB_BASIS_COUNTRIES.has(dest) ? 'FOB' : 'CIF';
  const customsValue = basis === 'FOB' ? goods : cif;

  // 1) Thuế nhập khẩu: MFN (ưu tiên biểu riêng theo xuất xứ, dữ liệu chính thức)
  const mfn = all.filter((m) => m.kind === 'mfn').sort((a, b) => rank(a) - rank(b))[0];
  // 2) Ưu đãi FTA mà xuất xứ đủ điều kiện
  // Thấp nhất trước; bằng nhau thì ưu tiên hiệp định song phương (ít nước thành viên hơn)
  const preferences = all
    .filter((m) => m.kind === 'preferential')
    .sort((a, b) => (a.pct ?? 1e9) - (b.pct ?? 1e9) || (a.origins?.length ?? 1e9) - (b.origins?.length ?? 1e9));
  const best = preferences.find((p) => p.pct !== null);
  const chosen = best && (mfn?.pct == null || best.pct! < mfn.pct) ? best : undefined;
  const dutyMeasure = chosen ?? mfn;

  const rows: TaxRow[] = [];
  const row = (m: TaxMeasure, base: number, extraNote?: string): TaxRow => {
    const amount = m.pct === null ? null : (base * m.pct) / 100;
    const r: TaxRow = {
      kind: m.kind,
      label: m.label,
      rate: m.rate || '—',
      pct: m.pct,
      base,
      amount,
      note: [m.note, m.specific ? 'Có phần thuế tuyệt đối (theo lượng) chưa được tính.' : '', extraNote].filter(Boolean).join(' ') || undefined,
      confidence: m.confidence,
      source: m.source,
      agreement: m.agreement,
      proof: m.proof,
    };
    rows.push(r);
    return r;
  };

  let duty = 0, other = 0;
  if (dutyMeasure) {
    const r = row(dutyMeasure, customsValue, chosen && mfn ? `Thay cho MFN ${mfn.rate}.` : undefined);
    duty = r.amount ?? 0;
  }
  // 3) Thuế bổ sung theo xuất xứ (chống bán phá giá, đối ứng…) – chỉ cộng khi không phải "tham khảo"
  const additional = all.filter((m) => m.kind === 'additional' && m.confidence !== 'reference');
  for (const m of additional) duty += row(m, customsValue).amount ?? 0;
  const references = all.filter((m) => m.kind === 'additional' && m.confidence === 'reference');
  // 4) Thuế tiêu thụ đặc biệt
  let excise = 0;
  for (const m of all.filter((x) => x.kind === 'excise')) excise += row(m, customsValue + duty).amount ?? 0;
  // 5) Phí khác theo trị giá (MPF/HMF…)
  for (const m of all.filter((x) => x.kind === 'other')) other += row(m, customsValue).amount ?? 0;
  // 6) VAT/GST: base = CIF + thuế NK + thuế bổ sung + TTĐB
  const vatBase = cif + duty + excise;
  let vatMeasure = all.filter((m) => m.kind === 'vat').sort((a, b) => rank(a) - rank(b))[0];
  if (!vatMeasure && STANDARD_VAT[dest]) {
    const v = STANDARD_VAT[dest];
    vatMeasure = { kind: 'vat', label: v.label, rate: `${v.pct}%`, pct: v.pct, note: v.note, confidence: 'manual', source: 'Thuế suất tiêu chuẩn – src/config/taxes.ts' };
  }
  const vat = vatMeasure ? (row(vatMeasure, vatBase).amount ?? 0) : 0;
  if (!vatMeasure && !NO_NATIONAL_VAT.has(dest)) warnings.push(`Chưa có thuế suất VAT/GST cho ${dest} – bổ sung trong src/config/taxes.ts.`);

  const saving = chosen && mfn?.pct != null && chosen.pct != null ? (customsValue * (mfn.pct - chosen.pct)) / 100 : 0;

  // Cảnh báo
  if (!books.length) warnings.push(`Chưa có biểu thuế cho nước nhập khẩu ${dest}. Thêm dòng vào src/data/tariff/manual.csv hoặc viết bộ tải tự động trong scripts/update-tariffs.ts.`);
  else if (!match.lines.length && !match.candidates.length) warnings.push(`Không tìm thấy mã ${fmtCode(code)} trong biểu thuế của ${dest}.`);
  else if (!mfn && match.candidates.length > 1) warnings.push(`Mã ${fmtCode(code)} có ${match.candidates.length} dòng chi tiết với thuế suất khác nhau – chọn mã quốc gia đầy đủ trong danh mục hàng (products.csv).`);
  else if (!mfn) warnings.push(`Chưa có thuế nhập khẩu MFN cho mã ${fmtCode(code)} tại ${dest}.`);
  for (const p of preferences.filter((x) => x.pct === null))
    warnings.push(`Xuất xứ ${origin} có thể hưởng ưu đãi ${p.agreement ?? p.label} nhưng chưa có thuế suất – đang tính theo MFN. Tra mức hiện hành và cập nhật manual.csv.`);
  if (rows.some((r) => r.amount === null)) warnings.push('Một số khoản là thuế tuyệt đối/chưa có số nên không cộng vào tổng.');
  if (references.length) warnings.push(`Có ${references.length} thuế bổ sung theo xuất xứ cần xác minh (không cộng vào tổng) – xem mục "Cần xác minh".`);
  if (dest === 'US') warnings.push('Mỹ: kiểm tra thêm thuế Section 232 (thép, nhôm, đồng, ô tô, gỗ & nội thất…) và thuế chống bán phá giá/chống trợ cấp (AD/CVD) theo từng mặt hàng – chưa có trong dữ liệu tự động.');

  const sources: SourceInfo[] = books.map((b) => {
    const manual = !b.sourceUrl;
    const ageDays = b.fetchedAt ? days(b.fetchedAt.slice(0, 10), today) : Infinity;
    const stale = ageDays > (manual ? MANUAL_REVIEW_AFTER_DAYS : STALE_AFTER_DAYS);
    return { country: b.country, source: b.source, sourceUrl: b.sourceUrl, release: b.release, fetchedAt: b.fetchedAt, ageDays, stale, manual };
  });
  for (const s of sources.filter((x) => x.stale))
    warnings.push(
      !s.manual
        ? `Dữ liệu ${s.country} đã ${s.ageDays} ngày chưa cập nhật – chạy "npm run tariffs:update".`
        : s.fetchedAt
          ? `Dữ liệu nhập tay (${s.country}) đã ${s.ageDays} ngày chưa đối chiếu lại với nguồn chính thức.`
          : `Dữ liệu nhập tay (${s.country}) chưa được đối chiếu với nguồn chính thức – điền cột reviewedAt trong manual.csv sau khi kiểm tra.`,
    );

  const last = match.lines[match.lines.length - 1]?.line;
  return {
    input,
    code,
    basis,
    cif,
    customsValue,
    line: last,
    candidates: match.candidates.map((c) => c.line),
    mfn,
    preferences,
    chosen,
    rows,
    references,
    dutyTotal: duty + excise + other,
    vatTotal: vat,
    total: duty + excise + other + vat,
    saving,
    warnings,
    sources,
  };
}
