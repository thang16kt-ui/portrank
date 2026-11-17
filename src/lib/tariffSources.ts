import { todayIso } from './csv';
import type { TariffEntry, TariffQuery } from '../providers/TariffProvider';

/**
 * Adapter lấy thuế suất tự động từ NGUỒN CHÍNH THỨC (đã kiểm tra tài liệu API trước khi viết):
 *  - Anh: UK Trade Tariff API v2 (https://www.trade-tariff.service.gov.uk/api/v2/…) – JSON:API, cho phép gọi thẳng từ trình duyệt (CORS *).
 *  - Mỹ: USITC HTS REST (https://hts.usitc.gov/reststop/search?keyword=…) – chặn gọi từ trình duyệt, nên đi qua trung gian /api/hts.
 * Không có adapter cho EU TARIC, biểu thuế Việt Nam và WTO: các nguồn này không có API công khai dùng được
 * (TARIC trả HTML tải bằng JavaScript, yêu cầu lớn bị chuyển sang "gửi qua email") – vẫn tra tay ở trang Biểu thuế.
 */

export interface TariffChoice {
  code: string;
  description: string;
}

/** Kết quả từ nguồn chính thức */
export interface OfficialTariffResult {
  provider: 'uk' | 'us';
  providerLabel: string;
  /** Mã đã dùng để tra (10 số UK / HTS 8–10 số Mỹ) */
  code?: string;
  description?: string;
  entry: TariffEntry | null;
  /** Mã HS bạn nhập ứng với nhiều dòng thuế có thuế suất khác nhau → chọn mã chi tiết */
  choices?: TariffChoice[];
  /** Thông tin bổ sung (thuế phức hợp, thuế bổ sung Chương 99…) */
  notes: string[];
  /** Link trang tra cứu chính thức của mã này */
  url: string;
  error?: string;
}

export interface OfficialTariffSource {
  readonly id: 'uk' | 'us';
  readonly label: string;
  supports(importCountry: string): boolean;
  lookup(q: TariffQuery): Promise<OfficialTariffResult>;
}

const digits = (s: string) => s.replace(/\D/g, '');

/** "0.00 %" → 0; "Free" → 0; "4.4%" → 4.4; thuế phức hợp ("6.5% + 33 GBP / 100 kg", "4.4¢/kg") → null */
export function parsePercent(s: string | null | undefined): number | null {
  if (s == null) return null;
  const t = s.replace(/<[^>]+>/g, '').trim();
  if (/^free$/i.test(t)) return 0;
  const m = t.match(/^(\d+(?:\.\d+)?)\s*%$/);
  return m ? parseFloat(m[1]) : null;
}

/* ───────────────────────── UK Trade Tariff ───────────────────────── */

interface JsonApiRef { id: string; type: string }
interface JsonApiItem { id: string; type: string; attributes: Record<string, any>; relationships?: Record<string, { data: JsonApiRef | JsonApiRef[] | null }> }
interface JsonApiDoc { data: JsonApiItem; included?: JsonApiItem[] }

const UK_API = 'https://www.trade-tariff.service.gov.uk/api/v2';
const UK_WEB = 'https://www.trade-tariff.service.gov.uk/commodities';
/** Mã khu vực "mọi xuất xứ" (ERGA OMNES) và "Khu vực chịu VAT" */
const UK_ERGA_OMNES = '1011';

/** Đọc một commodity của UK Trade Tariff → thuế MFN, ưu đãi theo xuất xứ, VAT. Hàm thuần (có unit test). */
export function parseUkCommodity(doc: JsonApiDoc, origin: string) {
  const inc = new Map<string, JsonApiItem>();
  for (const i of doc.included ?? []) inc.set(`${i.type}:${i.id}`, i);
  const ref = (item: JsonApiItem, rel: string): JsonApiRef | null => {
    const d = item.relationships?.[rel]?.data;
    return Array.isArray(d) ? d[0] ?? null : d ?? null;
  };
  const refs = (item: JsonApiItem, rel: string): JsonApiRef[] => {
    const d = item.relationships?.[rel]?.data;
    return Array.isArray(d) ? d : d ? [d] : [];
  };
  const geo = (id: string) => inc.get(`geographical_area:${id}`);
  const inArea = (areaId: string) => {
    if (areaId === origin) return true;
    const g = geo(areaId);
    return !!g && refs(g, 'children_geographical_areas').some((c) => c.id === origin);
  };
  const measures = (doc.included ?? []).filter((i) => i.type === 'measure' && i.attributes.import);
  const rows = measures.map((m) => {
    const typeId = ref(m, 'measure_type')?.id ?? '';
    const areaId = ref(m, 'geographical_area')?.id ?? '';
    const de = ref(m, 'duty_expression');
    const expr = de ? inc.get(`duty_expression:${de.id}`)?.attributes : undefined;
    const excluded = refs(m, 'excluded_countries').some((c) => c.id === origin);
    return {
      typeId, areaId, excluded,
      area: geo(areaId)?.attributes.description as string | undefined,
      text: (expr?.verbose_duty ?? expr?.base ?? '') as string,
      pct: parsePercent(expr?.base ?? expr?.verbose_duty),
      quota: !!ref(m, 'order_number'),
      additionalCode: !!ref(m, 'additional_code'),
      conditions: refs(m, 'measure_conditions').length > 0,
      start: String(m.attributes.effective_start_date ?? '').slice(0, 10),
    };
  });
  const plain = (r: (typeof rows)[number]) => !r.quota && !r.additionalCode && !r.excluded;
  // 103 = Third country duty (MFN), 142 = Tariff preference, 305 = VAT
  const mfn = rows.find((r) => r.typeId === '103' && r.areaId === UK_ERGA_OMNES && plain(r)) ?? rows.find((r) => r.typeId === '103' && plain(r));
  const prefs = rows.filter((r) => r.typeId === '142' && plain(r) && inArea(r.areaId));
  // ưu đãi thấp nhất trong các hiệp định áp dụng được cho xuất xứ (chỉ xét mức thuế % thuần)
  const pref = prefs.filter((r) => r.pct != null).sort((a, b) => a.pct! - b.pct!)[0] ?? prefs[0];
  const vats = rows.filter((r) => r.typeId === '305' && !r.quota);
  const vat = vats.find((r) => !r.additionalCode && !r.conditions) ?? vats.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
  return {
    code: String(doc.data.attributes.goods_nomenclature_item_id ?? ''),
    description: String(doc.data.attributes.description_plain ?? doc.data.attributes.description ?? ''),
    mfn, pref, vat,
    otherVat: vats.filter((r) => r !== vat).map((r) => r.text),
  };
}

/** Danh sách mã 10 số (leaf) trong một heading, kèm mô tả có cấp cha. Hàm thuần. */
export function parseUkHeadingLeaves(doc: JsonApiDoc): TariffChoice[] {
  const comms = (doc.included ?? []).filter((i) => i.type === 'commodity');
  const stack: string[] = [];
  const out: TariffChoice[] = [];
  for (const c of comms) {
    const lvl = Number(c.attributes.number_indents ?? 0);
    const desc = String(c.attributes.description_plain ?? c.attributes.description ?? '').replace(/\s+/g, ' ').trim();
    stack.length = Math.max(0, lvl - 1);
    stack[lvl - 1] = desc;
    if (c.attributes.leaf) out.push({ code: String(c.attributes.goods_nomenclature_item_id), description: stack.filter(Boolean).slice(-3).join(' › ') });
  }
  // bỏ trùng mã (API có thể lặp)
  return out.filter((c, i) => out.findIndex((x) => x.code === c.code) === i);
}

const cache = new Map<string, Promise<unknown>>();
async function getJson<T>(url: string, timeoutMs = 9000): Promise<T> {
  let p = cache.get(url) as Promise<T> | undefined;
  if (!p) {
    p = (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
        if (res.status === 404) throw Object.assign(new Error('not-found'), { status: 404 });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as T;
      } finally {
        clearTimeout(timer);
      }
    })();
    cache.set(url, p);
    p.catch(() => cache.delete(url));
  }
  return p;
}

function ukEntry(code: string, origin: string, preferFta: boolean, parsed: ReturnType<typeof parseUkCommodity>): { entry: TariffEntry | null; notes: string[] } {
  const notes: string[] = [];
  const { mfn, pref, vat } = parsed;
  const usePref = preferFta && pref && pref.pct != null && (mfn?.pct == null || pref.pct <= mfn.pct);
  const chosen = usePref ? pref : mfn;
  if (!chosen) return { entry: null, notes: ['Không tìm thấy thuế nhập khẩu (Third country duty) cho mã này.'] };
  if (chosen.pct == null) return { entry: null, notes: [`Thuế phức hợp: ${chosen.text} – PortRank chỉ tự tính thuế dạng %, cần tính tay.`] };
  if (pref && !usePref) notes.push(`Có ưu đãi cho xuất xứ này (${pref.area ?? pref.areaId}: ${pref.text}) nếu có C/O hợp lệ – đang tính thuế MFN vì chưa tích “Có C/O”.`);
  if (vat && vat.pct == null) notes.push(`VAT dạng đặc biệt: ${vat.text}`);
  if (parsed.otherVat.length) notes.push(`Các mức VAT khác theo điều kiện: ${parsed.otherVat.join(', ')} – đang dùng mức chuẩn.`);
  return {
    notes,
    entry: {
      id: `uk-${code}-${origin}`,
      importCountry: 'GB', hs: code, origin: usePref ? origin : '*',
      rateType: usePref ? 'FTA' : 'MFN', fta: usePref ? `Ưu đãi UK – ${pref!.area ?? pref!.areaId}` : '',
      dutyPct: chosen.pct, vatPct: vat?.pct ?? null, otherPct: 0,
      source: `${UK_WEB}/${code}`, effectiveDate: chosen.start, updatedAt: todayIso(), verified: true,
    },
  };
}

export const UkTariffSource: OfficialTariffSource = {
  id: 'uk',
  label: 'UK Trade Tariff (HMRC/DBT)',
  supports: (c) => c === 'GB',
  async lookup(q) {
    const hs = digits(q.hs);
    const base = { provider: 'uk' as const, providerLabel: this.label, notes: [] as string[], entry: null, url: `${UK_WEB}/${hs.padEnd(10, '0')}` };
    if (hs.length < 6) return { ...base, error: 'Cần mã HS ít nhất 6 số' };
    try {
      let code = hs.length >= 10 ? hs.slice(0, 10) : '';
      if (!code) {
        const head = await getJson<JsonApiDoc>(`${UK_API}/headings/${hs.slice(0, 4)}`);
        const leaves = parseUkHeadingLeaves(head).filter((l) => l.code.startsWith(hs));
        if (!leaves.length && head.data.attributes.declarable) code = hs.slice(0, 4).padEnd(10, '0');
        else if (leaves.length === 1) code = leaves[0].code;
        else if (!leaves.length) return { ...base, error: `Không có mã ${hs} trong biểu thuế Anh` };
        else return { ...base, choices: leaves, notes: [`Mã ${hs} có ${leaves.length} dòng thuế 10 số – chọn mã chi tiết để lấy thuế suất.`] };
      }
      const doc = await getJson<JsonApiDoc>(`${UK_API}/commodities/${code}`);
      const parsed = parseUkCommodity(doc, q.origin);
      const { entry, notes } = ukEntry(code, q.origin, q.preferFta, parsed);
      return { ...base, code, description: parsed.description, entry, notes, url: `${UK_WEB}/${code}` };
    } catch (e) {
      const err = e as Error & { status?: number };
      return { ...base, error: err.status === 404 ? `Mã ${hs} không có trong biểu thuế Anh (cần mã 10 số hợp lệ)` : `Không gọi được UK Trade Tariff: ${err.message}` };
    }
  },
};

/* ───────────────────────── US HTS (USITC) ───────────────────────── */

export interface HtsRow {
  htsno: string;
  description: string;
  indent: string;
  general: string | null;
  special: string | null;
  other: string | null;
  footnotes?: { value?: string; columns?: string[] }[];
  additionalDuties?: string | null;
}

/** Mã chương trình ưu đãi trong cột "Special" của HTS theo nước xuất xứ (các FTA của Mỹ) */
const US_SPECIAL: Record<string, string[]> = {
  AU: ['AU'], BH: ['BH'], CL: ['CL'], CO: ['CO'], IL: ['IL'], JO: ['JO'], KR: ['KR'], MA: ['MA'], OM: ['OM'], PA: ['PA'], PE: ['PE'], SG: ['SG'],
  CA: ['S', 'S+'], MX: ['S', 'S+'], CR: ['P', 'P+'], DO: ['P', 'P+'], SV: ['P', 'P+'], GT: ['P', 'P+'], HN: ['P', 'P+'], NI: ['P', 'P+'], JP: ['JP'],
};

/** Thuế ưu đãi trong cột Special áp cho xuất xứ, vd "Free (A,AU,BH,CL)" */
export function usSpecialRate(special: string | null, origin: string): number | null {
  if (!special) return null;
  const codes = US_SPECIAL[origin];
  if (!codes) return null;
  for (const m of special.matchAll(/([^()]+?)\s*\(([^)]*)\)/g)) {
    const progs = m[2].split(',').map((x) => x.trim());
    if (progs.some((p) => codes.includes(p))) return parsePercent(m[1].replace(/^[,\s]+/, ''));
  }
  return null;
}

const fmtHts = (d: string) => (d.length <= 4 ? d : d.length <= 6 ? `${d.slice(0, 4)}.${d.slice(4)}` : `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}${d.length > 8 ? `.${d.slice(8, 10)}` : ''}`);

/** Chọn các dòng HTS có thuế suất (leaf) khớp mã HS. Hàm thuần. */
export function htsLeaves(rows: HtsRow[], hs: string): (HtsRow & { path: string })[] {
  const stack: string[] = [];
  const out: (HtsRow & { path: string })[] = [];
  for (const r of rows) {
    const lvl = Number(r.indent ?? 0);
    stack.length = lvl;
    stack[lvl] = (r.description ?? '').replace(/:$/, '').trim();
    const d = digits(r.htsno ?? '');
    if (!d || !(d.startsWith(hs) || hs.startsWith(d))) continue;
    if (r.general != null && r.general !== '') out.push({ ...r, path: stack.filter(Boolean).slice(-3).join(' › ') });
  }
  return out;
}

export function usEntry(row: HtsRow, origin: string, preferFta: boolean): { entry: TariffEntry | null; notes: string[] } {
  const notes: string[] = ['Mỹ không có VAT liên bang (thuế bán hàng do từng bang thu khi bán lẻ).'];
  const ch99 = (row.footnotes ?? []).map((f) => f.value ?? '').filter((v) => /99\d{2}\./.test(v));
  notes.push(
    `Chỉ gồm thuế cột General/Special của HTS – CHƯA gồm thuế bổ sung Chương 99 (Section 301/232, thuế đối ứng…)${ch99.length ? `; dòng này có chú thích: ${ch99.join(' · ')}` : ''}. Kiểm tra trên hts.usitc.gov hoặc với môi giới hải quan.`,
  );
  const mfn = parsePercent(row.general);
  const sp = preferFta ? usSpecialRate(row.special, origin) : null;
  const usePref = sp != null && (mfn == null || sp <= mfn);
  if (!usePref && mfn == null) return { entry: null, notes: [`Thuế phức hợp: “${row.general}” – PortRank chỉ tự tính thuế dạng %, cần tính tay.`, ...notes] };
  const code = digits(row.htsno);
  return {
    notes,
    entry: {
      id: `us-${code}-${origin}`,
      importCountry: 'US', hs: code, origin: usePref ? origin : '*',
      rateType: usePref ? 'FTA' : 'MFN', fta: usePref ? 'Ưu đãi FTA (cột Special)' : '',
      dutyPct: usePref ? sp! : mfn!, vatPct: 0, otherPct: 0,
      source: `https://hts.usitc.gov/search?query=${encodeURIComponent(row.htsno)}`, effectiveDate: '', updatedAt: todayIso(), verified: true,
    },
  };
}

/** Trung gian: dev server (vite) và máy chủ `npm start` có sẵn /api/hts; trang tĩnh trên Render dùng quy tắc rewrite */
export const HTS_PROXY = '/api/hts/search';

export const UsHtsSource: OfficialTariffSource = {
  id: 'us',
  label: 'US HTS (USITC)',
  supports: (c) => c === 'US',
  async lookup(q) {
    const hs = digits(q.hs);
    const base = { provider: 'us' as const, providerLabel: this.label, notes: [] as string[], entry: null, url: `https://hts.usitc.gov/search?query=${fmtHts(hs.slice(0, 6))}` };
    if (hs.length < 6) return { ...base, error: 'Cần mã HS ít nhất 6 số' };
    try {
      const rows = await getJson<HtsRow[]>(`${HTS_PROXY}?keyword=${encodeURIComponent(fmtHts(hs.slice(0, 6)))}`);
      if (!Array.isArray(rows)) throw new Error('Phản hồi không hợp lệ');
      const leaves = htsLeaves(rows, hs);
      if (!leaves.length) return { ...base, error: `Không có mã ${hs} trong HTS` };
      const distinct = new Set(leaves.map((l) => `${l.general}|${l.special}`));
      if (leaves.length > 1 && distinct.size > 1) {
        return { ...base, choices: leaves.map((l) => ({ code: digits(l.htsno), description: `${l.path} · ${l.general}` })), notes: [`Mã ${hs} có ${leaves.length} dòng thuế khác nhau trong HTS – chọn mã chi tiết.`] };
      }
      const row = leaves[0];
      const { entry, notes } = usEntry(row, q.origin, q.preferFta);
      if (leaves.length > 1) notes.unshift(`${leaves.length} dòng HTS khớp mã ${hs}, cùng thuế suất.`);
      return { ...base, code: digits(row.htsno), description: row.path, entry, notes, url: `https://hts.usitc.gov/search?query=${encodeURIComponent(row.htsno)}` };
    } catch (e) {
      return { ...base, error: `Không gọi được US HTS qua máy chủ trung gian (/api/hts): ${(e as Error).message}` };
    }
  },
};

export const OFFICIAL_SOURCES: OfficialTariffSource[] = [UkTariffSource, UsHtsSource];
export const officialSourceFor = (importCountry: string) => OFFICIAL_SOURCES.find((s) => s.supports(importCountry));
