import { todayIso } from './csv';
import { matchTariff, type TariffEntry, type TariffQuery } from '../providers/TariffProvider';
import { US_HMF_PCT, US_MPF_PCT, usFees } from './fees';
import snapshotJson from '../data/tariffSnapshot.json';
import countries from 'i18n-iso-countries';
import { EU_SET } from '../data/countries';
import { VAT_DATA, standardVat } from '../data/vatRates';
import { tariffLookupLink } from '../data/customsBasis';
import { vnPreferences, type VnTariffFile } from './vnTariff';

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
  provider: 'uk' | 'us' | 'wits' | 'taric' | 'vn';
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
  /** Thuế bổ sung có thể áp dụng theo xuất xứ – cần xác minh, không cộng vào tổng */
  additional?: Chapter99Item[];
  /** Ngày của bản chụp nếu kết quả lấy từ bản chụp (API không phản hồi) */
  snapshot?: string;
}

/** Một dòng thuế bổ sung Chương 99 của Mỹ (thuế đối ứng, Section 301…) – chỉ để tham khảo, KHÔNG cộng vào tổng */
export interface Chapter99Item {
  code: string;
  /** Nguyên văn cột General, vd "The duty provided in the applicable subheading + 20%" */
  rate: string;
  pct: number | null;
  /** Xuất xứ áp dụng (ISO2); null = mọi xuất xứ */
  origins: string[] | null;
  /** Mô tả (điều kiện, ngày xếp hàng, loại trừ…) */
  note: string;
}

/**
 * Bản chụp dữ liệu từ nguồn chính thức – tạo bởi `npm run tariffs:update` (scripts/update-tariffs.ts).
 * Dùng khi API trực tuyến không phản hồi, và để nạp vào trang Biểu thuế.
 */
export interface TariffSnapshot {
  /** YYYY-MM-DD, rỗng = chưa tạo */
  generatedAt: string;
  sources: { id: string; label: string; url: string; release?: string }[];
  entries: TariffEntry[];
  chapter99: Chapter99Item[];
  /** Kết quả kiểm tra danh mục hàng lúc tạo */
  report: string[];
}

export const TARIFF_SNAPSHOT = snapshotJson as unknown as TariffSnapshot;

export interface OfficialTariffSource {
  readonly id: 'uk' | 'us' | 'wits' | 'taric' | 'vn';
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
      addCode: String(inc.get(`additional_code:${ref(m, 'additional_code')?.id}`)?.attributes.code ?? ''),
      typeName: String(inc.get(`measure_type:${typeId}`)?.attributes.description ?? ''),
      conditions: refs(m, 'measure_conditions').length > 0,
      start: String(m.attributes.effective_start_date ?? '').slice(0, 10),
    };
  });
  const plain = (r: (typeof rows)[number]) => !r.quota && !r.additionalCode && !r.excluded;
  // 103 = Third country duty (MFN), 142 = Tariff preference, 305 = VAT
  const mfn = rows.find((r) => r.typeId === '103' && r.areaId === UK_ERGA_OMNES && plain(r)) ?? rows.find((r) => r.typeId === '103' && plain(r));
  const prefs = rows.filter((r) => r.typeId === '142' && plain(r) && inArea(r.areaId));
  // ưu đãi thấp nhất trong các hiệp định áp dụng được cho xuất xứ (chỉ xét mức thuế % thuần)
  // bằng thuế suất → ưu tiên hiệp định song phương (khu vực ít nước hơn), vd UKVFTA trước CPTPP
  const areaSize = (id: string) => (/^[A-Z]{2}$/.test(id) ? 1 : Math.max(1, refs(geo(id) ?? ({} as JsonApiItem), 'children_geographical_areas').length));
  const pref = prefs.filter((r) => r.pct != null).sort((a, b) => a.pct! - b.pct! || areaSize(a.areaId) - areaSize(b.areaId))[0] ?? prefs[0];
  const vats = rows.filter((r) => r.typeId === '305' && !r.quota);
  const vat = vats.find((r) => !r.additionalCode && !r.conditions) ?? vats.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
  // thuế bổ sung theo xuất xứ: chống bán phá giá / chống trợ cấp / tự vệ / thuế bổ sung (551–570, 695, 696)
  // theo công ty (mã bổ sung) → lấy mức "các công ty khác" (mã …999) hoặc mức không có mã bổ sung
  const additional: { pct: number; label: string; text: string; firms: number }[] = [];
  const addRows = rows.filter((r) => UK_ADDITIONAL_TYPES.has(r.typeId) && inArea(r.areaId) && !r.excluded && !r.quota);
  for (const typeId of new Set(addRows.map((r) => r.typeId))) {
    const list = addRows.filter((r) => r.typeId === typeId);
    const other = list.find((r) => r.addCode.endsWith('999') && r.pct != null) ?? list.find((r) => !r.additionalCode && r.pct != null);
    if (other && other.pct! > 0) additional.push({ pct: other.pct!, label: other.typeName || 'Thuế bổ sung', text: other.text, firms: list.filter((r) => r.additionalCode && !r.addCode.endsWith('999')).length });
  }
  return {
    code: String(doc.data.attributes.goods_nomenclature_item_id ?? ''),
    description: String(doc.data.attributes.description_plain ?? doc.data.attributes.description ?? ''),
    mfn, pref, vat, additional,
    otherVat: vats.filter((r) => r !== vat).map((r) => r.text),
  };
}

/** Loại biện pháp thuế bổ sung của UK Trade Tariff */
const UK_ADDITIONAL_TYPES = new Set(['551', '552', '553', '554', '555', '561', '562', '564', '565', '566', '570', '695', '696']);

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
/** Xoá bộ nhớ đệm tra cứu (dùng trong test) */
export const clearTariffCache = () => {
  cache.clear();
  textCache.clear();
};
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

export function ukEntry(code: string, origin: string, preferFta: boolean, parsed: ReturnType<typeof parseUkCommodity>): { entry: TariffEntry | null; notes: string[] } {
  const notes: string[] = [];
  const { mfn, pref, vat } = parsed;
  const usePref = preferFta && pref && pref.pct != null && (mfn?.pct == null || pref.pct <= mfn.pct);
  const chosen = usePref ? pref : mfn;
  if (!chosen) return { entry: null, notes: ['Không tìm thấy thuế nhập khẩu (Third country duty) cho mã này.'] };
  // thuế phức hợp ("6.5% + 33 GBP / 100 kg"): tính phần %, hiển thị phần tuyệt đối
  const split = chosen.pct == null ? splitDuty(chosen.text) : { pct: chosen.pct, specific: null };
  if (split.pct == null && !split.specific) return { entry: null, notes: [`Không đọc được thuế suất “${chosen.text}”.`] };
  if (split.pct == null) notes.push(`Thuế tuyệt đối ${split.specific}: tính theo số lượng / khối lượng nhập ở bảng Hàng hoá.`);
  if (split.specific) notes.push(`Thuế phức hợp ${chosen.text}: phần ${split.pct}% tính trên trị giá, phần ${split.specific} tính theo số lượng / khối lượng nhập ở bảng Hàng hoá.`);
  if (pref && !usePref) notes.push(`Có ưu đãi cho xuất xứ này (${pref.area ?? pref.areaId}: ${pref.text}) nếu có C/O hợp lệ – đang tính thuế MFN vì chưa tích “Có C/O”.`);
  if (vat && vat.pct == null) notes.push(`VAT dạng đặc biệt: ${vat.text}`);
  if (parsed.otherVat.length) notes.push(`Các mức VAT khác theo điều kiện: ${parsed.otherVat.join(', ')} – đang dùng mức chuẩn.`);
  const addPct = Math.round((parsed.additional ?? []).reduce((s, a) => s + a.pct, 0) * 100) / 100;
  for (const a of parsed.additional ?? [])
    notes.push(`${a.label} cho xuất xứ ${origin}: ${a.text || `${a.pct}%`}${a.firms ? ` (mức chung; ${a.firms} công ty có mức riêng theo mã bổ sung)` : ''} – đã cộng vào tổng.`);
  return {
    notes,
    entry: {
      id: `uk-${code}-${origin}`,
      importCountry: 'GB', hs: code, origin: usePref ? origin : '*',
      rateType: usePref ? 'FTA' : 'MFN', fta: usePref ? `UK – ${pref!.area ?? pref!.areaId}` : '',
      dutyPct: split.pct ?? 0, vatPct: vat?.pct ?? null, otherPct: 0, ...(split.specific && { specificDuty: split.specific }),
      ...(usePref && { conditions: [`Ưu đãi ${pref!.area ?? pref!.areaId}: cần chứng từ xuất xứ theo hiệp định`] }),
      ...(addPct > 0 && { additionalPct: addPct, additionalLabel: parsed.additional!.map((a) => a.label).join(' + ') }),
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
      if (err.status === 404) return { ...base, error: `Mã ${hs} không có trong biểu thuế Anh (cần mã 10 số hợp lệ)` };
      return fromSnapshot('uk-', q, base, `Không gọi được UK Trade Tariff: ${err.message}`);
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
export const US_SPECIAL: Record<string, string[]> = {
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

export { US_MPF_PCT, US_HMF_PCT } from './fees';

const CH99_UNRESOLVED = 'Thuế bổ sung Chương 99 của Mỹ (Section 301/232, thuế đối ứng…) – chưa cộng, cần xác minh theo xuất xứ';
const US_ADCVD = 'Thuế chống bán phá giá / chống trợ cấp của Mỹ (AD/CVD theo nhà sản xuất) – chưa kiểm tra';

export function usEntry(row: HtsRow, origin: string, preferFta: boolean, date = todayIso()): { entry: TariffEntry | null; notes: string[] } {
  const notes: string[] = ['Mỹ không có VAT liên bang (thuế bán hàng do từng bang thu khi bán lẻ).'];
  const ch99 = (row.footnotes ?? []).map((f) => f.value ?? '').filter((v) => /99\d{2}\./.test(v));
  notes.push(
    `Tổng chỉ gồm thuế cột General/Special của HTS và phí MPF/HMF – CHƯA cộng thuế bổ sung Chương 99 (Section 301/232, thuế đối ứng…)${ch99.length ? `; dòng này có chú thích: ${ch99.join(' · ')}` : ''}. Kiểm tra trên hts.usitc.gov hoặc với môi giới hải quan.`,
  );
  // thuế phức hợp ("90¢/pr. + 37.5%"): phần % trên trị giá + phần tuyệt đối theo lượng; thuế THUẦN tuyệt đối ("4.4¢/kg"): phần % = 0
  const general = splitDuty(row.general);
  const sp = preferFta ? usSpecialRate(row.special, origin) : null;
  // không có phần % NHƯNG có phần tuyệt đối → thuế thuần tuyệt đối (khác với không đọc được thuế suất)
  const pureSpecific = general.pct == null && !!general.specific && /\d/.test(general.specific) && /¢|\$|\b[A-Z]{3}\b/.test(general.specific);
  const mfn = general.pct ?? (pureSpecific ? 0 : null);
  const usePref = sp != null && (mfn == null || pureSpecific || sp <= mfn);
  if (!usePref && mfn == null) return { entry: null, notes: [`Không đọc được thuế suất “${row.general ?? ''}” – tra trên hts.usitc.gov.`, ...notes] };
  const specific = usePref ? null : general.specific;
  if (specific && !pureSpecific) notes.unshift(`Thuế phức hợp “${row.general}”: phần ${mfn}% tính trên trị giá, phần ${specific} tính theo số lượng / khối lượng nhập ở bảng Hàng hoá.`);
  if (specific && pureSpecific) notes.unshift(`Thuế tuyệt đối “${row.general}”: tính theo số lượng / khối lượng nhập ở bảng Hàng hoá (không có phần theo trị giá).`);
  const code = digits(row.htsno);
  // Hàng có xuất xứ USMCA (Canada, Mexico) hưởng ưu đãi được miễn MPF
  const mpfExempt = usePref && (origin === 'CA' || origin === 'MX');
  const fees = usFees(date, mpfExempt);
  notes.push(`Phí CBP: ${mpfExempt ? 'miễn MPF (USMCA) · ' : `MPF ${US_MPF_PCT}% có sàn/trần mỗi tờ khai · `}HMF ${US_HMF_PCT}% chỉ khi hàng dỡ từ tàu biển – tính riêng từng khoản.`);
  return {
    notes,
    entry: {
      id: `us-${code}-${origin}`,
      importCountry: 'US', hs: code, origin: usePref ? origin : '*',
      rateType: usePref ? 'FTA' : 'MFN', fta: usePref ? 'Mỹ – cột Special' : '',
      dutyPct: usePref ? sp! : mfn!, vatPct: 0, otherPct: 0, fees, ...(specific && { specificDuty: specific }),
      unresolved: [CH99_UNRESOLVED, US_ADCVD],
      ...(usePref && { conditions: ['Cột Special: cần chứng từ xuất xứ theo chương trình ưu đãi tương ứng'] }),
      source: `https://hts.usitc.gov/search?query=${encodeURIComponent(row.htsno)}`, effectiveDate: '', updatedAt: todayIso(), fetchedAt: todayIso(), verified: true,
    },
  };
}

/** Trung gian: dev server (vite) và máy chủ `npm start` có sẵn /api/hts; trang tĩnh trên Render dùng quy tắc rewrite */
export const HTS_PROXY = '/api/hts/search';
/** exportList trả đủ các dòng tiêu đề trung gian ("Other:") → mô tả cấp cha đúng. Không có thì quay về /search */
export const HTS_EXPORT_PROXY = '/api/hts/exportList';
/** Rewrite trên Render chuyển nguyên query string → phải tự gửi format (USITC trả 400 nếu thiếu) */
const HTS_EXPORT_FORMAT = '&format=JSON&styles=false';

/** Các dòng HTS dưới một mã HS6: thử exportList, lỗi (hoặc trang tĩnh chưa có rewrite) → /search */
async function htsRows(hs6: string): Promise<HtsRow[]> {
  const d = fmtHts(hs6);
  try {
    const rows = await getJson<HtsRow[]>(`${HTS_EXPORT_PROXY}?from=${d}&to=${d}.99.99${HTS_EXPORT_FORMAT}`);
    if (Array.isArray(rows) && rows.length) return rows;
  } catch {
    /* quay về /search */
  }
  const rows = await getJson<HtsRow[]>(`${HTS_PROXY}?keyword=${encodeURIComponent(d)}`);
  if (!Array.isArray(rows)) throw new Error('Phản hồi không hợp lệ');
  return rows;
}

/** Tên nước trong mô tả Chương 99 → ISO2 */
const CH99_COUNTRIES: [RegExp, string[]][] = [
  [/\bChina\b/, ['CN']], [/Hong Kong/, ['HK']], [/Viet ?nam/i, ['VN']], [/\bJapan\b/, ['JP']], [/South Korea|Republic of Korea/, ['KR']],
  [/Thailand/, ['TH']], [/Malaysia/, ['MY']], [/Indonesia/, ['ID']], [/Philippines/, ['PH']], [/Cambodia/, ['KH']], [/Burma|Myanmar/, ['MM']],
  [/\bLaos\b|Lao People/, ['LA']], [/Taiwan/, ['TW']], [/\bIndia\b/, ['IN']], [/Bangladesh/, ['BD']], [/Sri Lanka/, ['LK']], [/Pakistan/, ['PK']],
  [/Brazil/, ['BR']], [/Switzerland/, ['CH']], [/Liechtenstein/, ['LI']], [/United Kingdom/, ['GB']], [/Canada/, ['CA']], [/Mexico/, ['MX']],
  [/Australia/, ['AU']], [/New Zealand/, ['NZ']], [/Singapore/, ['SG']], [/Turkey|Türkiye/, ['TR']], [/South Africa/, ['ZA']], [/Israel/, ['IL']],
  [/Norway/, ['NO']], [/Brunei/, ['BN']], [/Argentina/, ['AR']], [/Chile/, ['CL']], [/Colombia/, ['CO']], [/Peru\b/, ['PE']], [/Ecuador/, ['EC']],
  [/Egypt/, ['EG']], [/Nigeria/, ['NG']], [/Kenya/, ['KE']], [/Ghana/, ['GH']], [/Morocco/, ['MA']], [/Saudi Arabia/, ['SA']], [/United Arab Emirates/, ['AE']],
  [/European Union/, 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ')],
];

/** Các dòng 9903.xx có thuế bổ sung (cột General có %) kèm xuất xứ áp dụng. Hàm thuần. */
export function parseChapter99(rows: HtsRow[]): Chapter99Item[] {
  const out: Chapter99Item[] = [];
  for (const r of rows) {
    if (!/^9903\./.test(r.htsno ?? '') || !/%/.test(r.general ?? '')) continue;
    const desc = (r.description ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const any = /product of any country/i.test(desc);
    const origins = any ? null : [...new Set(CH99_COUNTRIES.filter(([re]) => re.test(desc)).flatMap(([, iso]) => iso))];
    if (origins && !origins.length) continue;
    const m = (r.general ?? '').match(/(\d+(?:\.\d+)?)\s*%/);
    out.push({ code: r.htsno, rate: r.general!, pct: m ? +m[1] : null, origins, note: desc.length > 320 ? desc.slice(0, 317) + '…' : desc });
  }
  return out;
}

export const chapter99For = (items: Chapter99Item[], origin: string) => items.filter((i) => !i.origins || i.origins.includes(origin));

/** Khoảng mã Chương 99 cần tải: thuế đối ứng/IEEPA (9903.01–02) và Section 301 Trung Quốc (9903.88) */
export const CH99_RANGES: [string, string][] = [['9903.01.00', '9903.02.99'], ['9903.88.00', '9903.88.99']];

async function liveChapter99(): Promise<Chapter99Item[]> {
  const parts = await Promise.all(CH99_RANGES.map(([from, to]) => getJson<HtsRow[]>(`${HTS_EXPORT_PROXY}?from=${from}&to=${to}${HTS_EXPORT_FORMAT}`)));
  if (!parts.every(Array.isArray)) throw new Error('Phản hồi không hợp lệ');
  return parseChapter99(parts.flat());
}

/** Kết quả từ bản chụp khi API không phản hồi */
function fromSnapshot(prefix: 'uk-' | 'us-', q: TariffQuery, base: OfficialTariffResult, error: string): OfficialTariffResult {
  const snap = TARIFF_SNAPSHOT;
  let entry = snap.generatedAt ? matchTariff(snap.entries.filter((e) => e.id.startsWith(prefix)), q) : null;
  if (!entry) return { ...base, error };
  // bản chụp cũ lưu MPF+HMF gộp thành feePct → tách lại thành từng khoản có sàn/trần, HMF chỉ cho tàu biển
  if (prefix === 'us-' && entry.feePct != null) {
    const { feePct: _f, feeLabel: _l, ...rest } = entry;
    entry = { ...rest, fees: usFees(q.date || todayIso(), entry.feePct < US_MPF_PCT), unresolved: ['Thuế bổ sung Chương 99 của Mỹ – chưa cộng, cần xác minh theo xuất xứ', 'Thuế AD/CVD của Mỹ – chưa kiểm tra'] };
  }
  return {
    ...base,
    code: entry.hs,
    entry,
    snapshot: snap.generatedAt,
    additional: prefix === 'us-' ? chapter99For(snap.chapter99, q.origin) : undefined,
    notes: [`${error} – đang dùng bản chụp dữ liệu chính thức ngày ${snap.generatedAt.split('-').reverse().join('/')}.`, ...base.notes],
  };
}

export const UsHtsSource: OfficialTariffSource = {
  id: 'us',
  label: 'US HTS (USITC)',
  supports: (c) => c === 'US',
  async lookup(q) {
    const hs = digits(q.hs);
    const base = { provider: 'us' as const, providerLabel: this.label, notes: [] as string[], entry: null, url: `https://hts.usitc.gov/search?query=${fmtHts(hs.slice(0, 6))}` };
    if (hs.length < 6) return { ...base, error: 'Cần mã HS ít nhất 6 số' };
    // Thuế bổ sung Chương 99 theo xuất xứ: tải song song, lỗi → dùng bản chụp
    const ch99 = liveChapter99().catch(() => TARIFF_SNAPSHOT.chapter99);
    try {
      const rows = await htsRows(hs.slice(0, 6));
      const leaves = htsLeaves(rows, hs);
      if (!leaves.length) return { ...base, error: `Không có mã ${hs} trong HTS` };
      const distinct = new Set(leaves.map((l) => `${l.general}|${l.special}`));
      if (leaves.length > 1 && distinct.size > 1) {
        return { ...base, choices: leaves.map((l) => ({ code: digits(l.htsno), description: `${l.path} · ${l.general}` })), notes: [`Mã ${hs} có ${leaves.length} dòng thuế khác nhau trong HTS – chọn mã chi tiết.`] };
      }
      const row = leaves[0];
      const { entry, notes } = usEntry(row, q.origin, q.preferFta, q.date);
      if (leaves.length > 1) notes.unshift(`${leaves.length} dòng HTS khớp mã ${hs}, cùng thuế suất.`);
      const additional = chapter99For(await ch99, q.origin);
      return { ...base, code: digits(row.htsno), description: row.path, entry, notes, additional, url: `https://hts.usitc.gov/search?query=${encodeURIComponent(row.htsno)}` };
    } catch (e) {
      return fromSnapshot('us-', q, base, `Không gọi được US HTS qua máy chủ trung gian (/api/hts): ${(e as Error).message}`);
    }
  },
};

/* ───────────────── WITS / UNCTAD TRAINS (mọi nước, theo HS6) ───────────────── */

/** Trung gian: WITS không cho gọi từ trình duyệt (không có CORS). Trên Render: rewrite /api/wits/* */
export const WITS_PROXY = '/api/wits';
/** Mã WITS của EU (biểu thuế chung cho 27 nước) */
const WITS_EU = '918';

export interface WitsTariff {
  /** Thuế trung bình đơn giản các dòng quốc gia trong HS6 (%) */
  pct: number;
  min: number | null;
  max: number | null;
  lines: number | null;
  /** MFN / PRF / AHS… */
  tariffType: string;
  /** Danh mục HS của biểu thuế năm đó: H6 = HS 2022, H5 = HS 2017… */
  nomen: string;
}

/** Đọc phản hồi SDMX-JSON của WITS TRAINS. Hàm thuần. */
export function parseWits(doc: any): WitsTariff | null {
  const series = doc?.dataSets?.[0]?.series;
  const attrs: { id: string; values: { id?: string; name?: string }[] }[] = doc?.structure?.attributes?.observation ?? [];
  if (!series) return null;
  const obs: (number | null)[] | undefined = (Object.values(series)[0] as { observations?: Record<string, (number | null)[]> })?.observations?.['0'];
  if (!obs || obs[0] == null) return null;
  const attr = (id: string) => {
    const i = attrs.findIndex((a) => a.id === id);
    if (i < 0) return undefined;
    const v = obs[i + 1];
    return v == null ? undefined : (attrs[i].values[v]?.id ?? attrs[i].values[v]?.name);
  };
  const num = (id: string) => {
    const v = attr(id);
    return v == null || !isFinite(+v) ? null : Math.round(+v * 100) / 100;
  };
  return { pct: Math.round(obs[0] * 100) / 100, min: num('MIN_RATE'), max: num('MAX_RATE'), lines: num('TOTALNOOFLINES'), tariffType: attr('TARIFFTYPE') ?? 'MFN', nomen: attr('NOMENCODE') ?? '' };
}

const NOMEN: Record<string, string> = { H6: 'HS 2022', H5: 'HS 2017', H4: 'HS 2012', H3: 'HS 2007' };

/** Lãnh thổ hải ngoại thuộc lãnh thổ hải quan EU (vùng ngoại vi: Guadeloupe, Martinique, Réunion, Guyane, Mayotte, Saint-Martin) */
export const EU_OUTERMOST = new Set(['GP', 'MQ', 'RE', 'GF', 'YT', 'MF']);
/** Thuộc lãnh thổ hải quan EU → dùng biểu thuế chung EU */
export const inEuCustoms = (iso2: string) => EU_SET.has(iso2) || EU_OUTERMOST.has(iso2);

/** Mã số WITS (ISO 3166 numeric) của nước nhập; nước EU → biểu thuế chung EU */
export function witsReporter(iso2: string): string | null {
  if (inEuCustoms(iso2)) return WITS_EU;
  const n = countries.alpha2ToNumeric(iso2);
  return n ? String(n).padStart(3, '0') : null;
}

const witsUrl = (reporter: string, partner: string, hs6: string, year: number) =>
  `${WITS_PROXY}/reporter/${reporter}/partner/${partner}/product/${hs6}/year/${year}/datatype/reported?format=JSON`;

/**
 * Biểu thuế MFN theo HS6 tải sẵn cho mọi nước có số liệu TRAINS (public/data/wits/{nước}.json, danh sách ở index.json),
 * tạo bởi `npm run tariffs:update`. Lý do: tường lửa của World Bank chặn yêu cầu đi qua rewrite của Render (403).
 * Nước không có file → gọi trực tiếp /api/wits (chạy được với dev server / npm start).
 */
/** File tải sẵn: hs6 → thuế trung bình, hoặc [trung bình, min, max, số dòng] khi các dòng quốc gia khác nhau */
export type WitsRate = number | [number, number, number, number];

export interface WitsBulkFile {
  reporter: string;
  year: number;
  /** Danh mục HS của biểu thuế gốc (H6 = HS 2022, H5 = HS 2017…) */
  nomen: string;
  fetchedAt: string;
  /** Khoá luôn là mã HS6 theo HS 2022 (đã quy đổi nếu biểu thuế gốc dùng danh mục cũ) */
  rates: Record<string, WitsRate>;
  /** Có giá trị khi đã quy đổi từ danh mục cũ sang HS 2022 */
  converted?: string;
  /** Mã HS 2022 → các mã gốc dùng để quy đổi (chỉ ghi khi khác mã HS 2022) */
  conv?: Record<string, string[]>;
}

/** Nhóm đối tác của TRAINS có thành viên rõ ràng (để tra ưu đãi theo nhóm) */
export const PREF_GROUPS: Record<string, string[]> = {
  N52: ['BN', 'KH', 'ID', 'LA', 'MY', 'MM', 'PH', 'SG', 'TH', 'VN'],
  C02: ['BN', 'KH', 'ID', 'LA', 'MY', 'MM', 'PH', 'SG', 'TH', 'VN', 'AU', 'NZ'],
};
export const PREF_GROUP_LABEL: Record<string, string> = { N52: 'ASEAN', C02: 'ASEAN–Úc–New Zealand (AANZFTA)' };

/** Thuế ưu đãi theo đối tác của một nước nhập (public/data/wits/pref/{nước}.json) – chỉ mã thấp hơn MFN */
export interface WitsPrefFile {
  reporter: string;
  fetchedAt: string;
  /** mã đối tác WITS (704, 156, 918 = EU, N52 = ASEAN…) → năm số liệu + mã HS6 theo mức thuế */
  partners: Record<string, { year: number; byRate: Record<string, string> }>;
}

/** Nén { hs6: thuế } → { thuế: "hs6hs6hs6…" } (mỗi mã 6 ký tự). Hàm thuần. */
export function packRates(rates: Record<string, number>): Record<string, string> {
  const out: Record<string, string[]> = {};
  for (const [hs, r] of Object.entries(rates)) (out[String(r)] ??= []).push(hs);
  return Object.fromEntries(Object.entries(out).map(([r, codes]) => [r, codes.sort().join('')]));
}

/** Tra thuế của mã HS6 trong bảng đã nén; null nếu không có. Hàm thuần. */
export function unpackRate(byRate: Record<string, string>, hs6: string): number | null {
  for (const [r, codes] of Object.entries(byRate))
    for (let i = codes.indexOf(hs6); i >= 0; i = codes.indexOf(hs6, i + 1)) if (i % 6 === 0) return +r;
  return null;
}

/**
 * Quy đổi bảng thuế theo danh mục cũ sang HS 2022 bằng bảng tương quan (HS 2022 → mã cũ).
 * Một mã HS 2022 ứng với nhiều mã cũ → trung bình, khoảng min–max. Hàm thuần.
 */
export function convertToHs2022(rates: Record<string, WitsRate>, concord: Record<string, string[]>): { rates: Record<string, WitsRate>; conv: Record<string, string[]> } {
  const out: Record<string, WitsRate> = {};
  const conv: Record<string, string[]> = {};
  const r2 = (x: number) => Math.round(x * 100) / 100;
  for (const [hs22, srcs] of Object.entries(concord)) {
    const found = srcs.filter((c) => rates[c] != null);
    if (!found.length) continue;
    const vals = found.map((c) => rates[c]!);
    const avg = r2(vals.reduce<number>((s, v) => s + (Array.isArray(v) ? v[0] : v), 0) / vals.length);
    const min = r2(Math.min(...vals.map((v) => (Array.isArray(v) ? v[1] : v))));
    const max = r2(Math.max(...vals.map((v) => (Array.isArray(v) ? v[2] : v))));
    const lines = vals.reduce<number>((s, v) => s + (Array.isArray(v) ? v[3] : 1), 0);
    out[hs22] = min !== max ? [avg, min, max, lines] : avg;
    if (found.length !== 1 || found[0] !== hs22) conv[hs22] = found;
  }
  return { rates: out, conv };
}

/** Đọc phản hồi SDMX-JSON product=all → bảng thuế theo HS6. Hàm thuần. */
export function parseWitsAll(doc: any): { nomen: string; rates: WitsBulkFile['rates'] } {
  const dims: { id: string; values: { id: string }[] }[] = doc?.structure?.dimensions?.series ?? [];
  const attrs: { id: string; values: { id?: string; name?: string }[] }[] = doc?.structure?.attributes?.observation ?? [];
  const products = dims.find((d) => d.id === 'PRODUCTCODE')?.values ?? [];
  // WITS xếp mã sản phẩm trong khoá series KHÔNG theo keyPosition khai báo → lấy vị trí có nhiều giá trị khác nhau nhất
  const keys = Object.keys(doc?.dataSets?.[0]?.series ?? {}).map((k) => k.split(':'));
  const distinct = keys[0]?.map((_, i) => new Set(keys.map((k) => k[i])).size) ?? [];
  const pi = distinct.length && Math.max(...distinct) > 1 ? distinct.indexOf(Math.max(...distinct)) : -1;
  const ai = (id: string) => attrs.findIndex((a) => a.id === id);
  const [iMin, iMax, iLines, iNomen] = ['MIN_RATE', 'MAX_RATE', 'TOTALNOOFLINES', 'NOMENCODE'].map(ai);
  const val = (obs: (number | null)[], i: number) => {
    if (i < 0 || obs[i + 1] == null) return null;
    const v = attrs[i].values[obs[i + 1]!];
    return v?.id ?? v?.name ?? null;
  };
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const rates: WitsBulkFile['rates'] = {};
  let nomen = '';
  for (const [key, s] of Object.entries(doc?.dataSets?.[0]?.series ?? {})) {
    const obs = (s as { observations?: Record<string, (number | null)[]> }).observations?.['0'];
    if (!obs || obs[0] == null) continue;
    const code = products[pi < 0 ? 0 : +key.split(':')[pi]]?.id;
    if (!code || !/^\d{6}$/.test(code)) continue;
    nomen ||= String(val(obs, iNomen) ?? '');
    const avg = r2(obs[0]), min = val(obs, iMin), max = val(obs, iMax), lines = val(obs, iLines);
    rates[code] = min != null && max != null && r2(+min) !== r2(+max) ? [avg, r2(+min), r2(+max), +(lines ?? 0)] : avg;
  }
  return { nomen, rates };
}

const bulkKey = (iso2: string) => (inEuCustoms(iso2) ? 'EU' : iso2);

interface BulkHit {
  year: number;
  nomen: string;
  t: WitsTariff | null;
  /** Mã gốc (danh mục cũ) dùng để quy đổi sang HS 2022 */
  conv?: string[];
}

const baseUrl = () => (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** Thuế từ file tải sẵn; null nếu nước không có file (→ gọi trực tiếp) */
async function witsFromBulk(iso2: string, hs6: string): Promise<BulkHit | null> {
  let f: WitsBulkFile;
  try {
    f = await getJson<WitsBulkFile>(`${baseUrl()}data/wits/${bulkKey(iso2)}.json`);
  } catch {
    return null;
  }
  if (!f || typeof f !== 'object' || !f.rates) return null;
  const r = f.rates[hs6];
  const hit: BulkHit = { year: f.year, nomen: f.nomen, t: null, conv: f.conv?.[hs6] };
  if (r == null) return hit;
  const [pct, min, max, lines] = Array.isArray(r) ? r : [r, r, r, null];
  hit.t = { pct, min, max, lines, tariffType: 'MFN', nomen: f.converted ? 'H6' : f.nomen };
  return hit;
}

/** Nhãn của đối tác trong biểu ưu đãi */
const prefLabel = (partner: string, origin: string) => PREF_GROUP_LABEL[partner] ?? (partner === WITS_EU ? 'ưu đãi cho EU' : `ưu đãi riêng cho ${origin}`);

/**
 * Thuế ưu đãi tải sẵn cho xuất xứ `origin` tại nước nhập: xét đối tác = chính nước đó (EU → 918) và các nhóm có nước đó
 * (ASEAN, AANZFTA). undefined = nước nhập không có file ưu đãi; status 'none' = không có biểu ưu đãi cho xuất xứ này.
 */
async function witsPrefFromBulk(importIso: string, origin: string, hs6: string) {
  let f: WitsPrefFile;
  try {
    f = await getJson<WitsPrefFile>(`${baseUrl()}data/wits/pref/${bulkKey(importIso)}.json`);
  } catch {
    return undefined;
  }
  if (!f?.partners) return undefined;
  const own = witsReporter(origin);
  const cands = [own, ...Object.entries(PREF_GROUPS).filter(([, m]) => m.includes(origin)).map(([g]) => g)].filter((c): c is string => !!c && !!f.partners[c]);
  if (!cands.length) return { status: 'none' as const };
  let best: { pct: number; partner: string; year: number } | null = null;
  for (const c of cands) {
    const r = unpackRate(f.partners[c].byRate, hs6);
    if (r != null && (!best || r < best.pct)) best = { pct: r, partner: c, year: f.partners[c].year };
  }
  if (!best) return { status: 'not-lower' as const, partner: cands[0], year: f.partners[cands[0]].year };
  return { status: 'ok' as const, ...best };
}

/** Năm gần nhất có dữ liệu (TRAINS thường trễ 1–3 năm) */
async function witsLatest(reporter: string, partner: string, hs6: string, years: number[]): Promise<{ year: number; t: WitsTariff } | null> {
  for (const year of years) {
    try {
      const t = parseWits(await getJson(witsUrl(reporter, partner, hs6, year)));
      if (t) return { year, t };
    } catch (e) {
      if ((e as { status?: number }).status !== 404) throw e;
    }
  }
  return null;
}

export const WitsTariffSource: OfficialTariffSource = {
  id: 'wits',
  label: 'WITS – UNCTAD TRAINS (World Bank)',
  supports: (c) => c !== 'GB' && c !== 'US' && witsReporter(c) != null,
  async lookup(q) {
    const hs6 = digits(q.hs).slice(0, 6);
    const reporter = witsReporter(q.importCountry)!;
    // link tra cứu chính thức của nước nhập (EU → TARIC, VN → Hải quan VN, khác → WTO)
    const url = tariffLookupLink(q.importCountry).url;
    const base = { provider: 'wits' as const, providerLabel: this.label, notes: [] as string[], entry: null, url: 'https://wits.worldbank.org/' };
    if (hs6.length < 6) return { ...base, error: 'Cần mã HS ít nhất 6 số (chuẩn HS6)' };
    const now = new Date().getFullYear();
    const years = [now - 1, now - 2, now - 3, now - 4, now - 5, now - 6];
    try {
      const bulk = await witsFromBulk(q.importCountry, hs6);
      if (bulk && !bulk.t)
        return {
          ...base,
          error: `Biểu thuế ${bulkKey(q.importCountry)} năm ${bulk.year} (TRAINS) không có mã HS6 ${hs6}${bulk.nomen && bulk.nomen !== 'H6' ? ` (biểu thuế gốc dùng ${NOMEN[bulk.nomen] ?? bulk.nomen}, đã quy đổi sang HS 2022 nhưng mã này không có tương ứng)` : ''} – kiểm tra lại mã theo chuẩn HS6 hoặc tra ở nguồn chính thức của nước nhập`,
        };
      const mfn = bulk?.t ? { year: bulk.year, t: bulk.t } : await witsLatest(reporter, '000', hs6, years);
      if (!mfn) return { ...base, error: `WITS chưa có thuế MFN của ${q.importCountry} cho HS ${hs6} (6 năm gần nhất)` };
      const notes: string[] = [];
      const { t, year } = mfn;
      const isEu = reporter === WITS_EU;
      const age = now - year;
      notes.push(`Thuế MFN theo biểu thuế ${isEu ? 'chung EU' : q.importCountry} năm ${year} (UNCTAD TRAINS qua WITS)${age >= 4 ? ` – số liệu đã ${age} năm, rất có thể đã thay đổi` : ' – có thể đã thay đổi'}; xác nhận ở biểu thuế hiện hành.`);
      if (t.min != null && t.max != null && t.min !== t.max)
        notes.push(`HS6 ${hs6} gồm ${t.lines ?? 'nhiều'} dòng quốc gia, thuế từ ${t.min}% đến ${t.max}% – đang dùng trung bình ${t.pct}%. Mã quốc gia cụ thể có thể cao/thấp hơn.`);
      if (bulk?.nomen && bulk.nomen !== 'H6')
        notes.push(`Biểu thuế gốc năm ${year} dùng ${NOMEN[bulk.nomen] ?? bulk.nomen}${bulk.conv ? ` – mã ${hs6} (HS 2022) được quy đổi từ mã ${bulk.conv.join(', ')}` : ''} theo bảng tương quan của WITS.`);
      else if (t.nomen && t.nomen !== 'H6') notes.push(`Biểu thuế năm ${year} dùng danh mục ${NOMEN[t.nomen] ?? t.nomen} – mã HS có thể khác HS 2022.`);
      // thuế ưu đãi theo xuất xứ: dữ liệu tải sẵn (nước nhập có file ưu đãi); không có file → gọi trực tiếp
      let pref: { pct: number; label: string; partner: string; year: number } | null = null;
      let prefNote = '';
      const o = q.origin && q.origin !== '*' ? q.origin.toUpperCase() : '';
      const partner = o ? witsReporter(o) : null;
      const sameBloc = isEu && inEuCustoms(o);
      const fromBulk = o && !sameBloc ? await witsPrefFromBulk(q.importCountry, o, hs6) : undefined;
      const noFta = `Nếu có FTA, tra thuế ưu đãi ở nguồn chính thức rồi nhập vào trang Biểu thuế.`;
      if (fromBulk?.status === 'ok') pref = { pct: fromBulk.pct, label: prefLabel(fromBulk.partner, o), partner: fromBulk.partner, year: fromBulk.year };
      else if (fromBulk?.status === 'not-lower') prefNote = `TRAINS năm ${fromBulk.year} có biểu ưu đãi ${prefLabel(fromBulk.partner, o)} nhưng mã ${hs6} không thấp hơn MFN.`;
      else if (fromBulk?.status === 'none') prefNote = `TRAINS không có biểu thuế ưu đãi cho hàng xuất xứ ${o} tại ${isEu ? 'EU' : q.importCountry} (thường do không có FTA, hoặc FTA mới chưa có số liệu). ${noFta}`;
      else if (partner && partner !== reporter && !sameBloc) {
        try {
          const p = parseWits(await getJson(witsUrl(reporter, partner, hs6, year)));
          if (p && p.tariffType !== 'MFN' && p.pct < t.pct) pref = { pct: p.pct, label: `ưu đãi cho ${o}`, partner, year };
          else prefNote = `TRAINS năm ${year} không có thuế ưu đãi riêng cho xuất xứ ${o}. ${noFta}`;
        } catch (e) {
          prefNote =
            (e as { status?: number }).status === 404
              ? `TRAINS năm ${year} không có thuế ưu đãi riêng cho xuất xứ ${o}. ${noFta}`
              : `Chưa kiểm tra được thuế ưu đãi cho xuất xứ ${o} (WITS không phản hồi). ${noFta}`;
        }
      }
      const usePref = !!pref && q.preferFta;
      if (pref && !usePref) notes.push(`TRAINS năm ${pref.year} ghi thuế ưu đãi ${pref.pct}% (${pref.label}) cho hàng xuất xứ ${o} – tích “Có C/O” để áp dụng.`);
      if (pref && usePref) notes.push(`Đang áp dụng thuế ưu đãi ${pref.pct}% (${pref.label}, TRAINS năm ${pref.year}) – cần C/O hợp lệ theo hiệp định.`);
      if (prefNote) notes.push(prefNote);
      const vat = standardVat(q.importCountry);
      if (vat) notes.push(`VAT/GST: thuế suất tiêu chuẩn ${vat.pct}% (${VAT_DATA.source}) – CHƯA xác minh cho mặt hàng (có thể có mức giảm/miễn).`);
      // PR-03: WITS chỉ có HS6 → mã quốc gia (8–10 số) và HS6 nhiều dòng thuế chỉ là ƯỚC TÍNH, không chốt
      const full = digits(q.hs);
      const estimates: string[] = [];
      if (!usePref && t.min != null && t.max != null && t.min !== t.max) estimates.push(`trung bình HS6 ${t.pct}% của ${t.lines ?? 'nhiều'} dòng quốc gia (từ ${t.min}% đến ${t.max}%)`);
      if (full.length > 6) estimates.push(`WITS chỉ có số liệu HS6 ${hs6}; chưa tra được mức riêng của mã ${full}`);
      const dataYear = usePref ? pref!.year : year;
      return {
        ...base,
        url,
        code: hs6,
        notes,
        entry: {
          id: `wits-${q.importCountry}-${hs6}-${usePref ? q.origin : '*'}`,
          importCountry: q.importCountry, hs: hs6, origin: usePref ? q.origin : '*',
          rateType: usePref ? 'FTA' : 'MFN', fta: usePref ? `TRAINS – ${pref!.label}` : '',
          dutyPct: usePref ? pref!.pct : t.pct, vatPct: vat && vat.type !== 'none' ? vat.pct : vat ? 0 : null, ...(vat && vat.type !== 'none' && { vatProvisional: true }), otherPct: 0,
          ...(estimates.length && { estimate: estimates.join('; ') }),
          ...(usePref && { conditions: [`Ưu đãi ${pref!.label}: cần C/O / chứng từ xuất xứ theo hiệp định tương ứng; số liệu TRAINS năm ${pref!.year}`] }),
          unresolved: ['Thuế phòng vệ thương mại (chống bán phá giá / tự vệ) – WITS không có, chưa kiểm tra'],
          source: `https://wits.worldbank.org/API/V1/SDMX/V21/datasource/TRN/reporter/${reporter}/partner/${usePref ? pref!.partner : '000'}/product/${hs6}/year/${dataYear}/datatype/reported?format=JSON`,
          // năm thống kê TRAINS KHÔNG phải ngày hiệu lực pháp lý → để trống ngày hiệu lực, ghi năm dữ liệu
          effectiveDate: '', dataYear, fetchedAt: todayIso(), updatedAt: todayIso(), verified: false,
        },
      };
    } catch (e) {
      return { ...base, error: `Không gọi được WITS qua máy chủ trung gian (/api/wits): ${(e as Error).message}` };
    }
  },
};

/* ───────────────── EU TARIC (nguồn chính thức cho 27 nước EU) ───────────────── */

/** Trung gian: TARIC không cho gọi từ trình duyệt. Trên Render: rewrite /api/taric/* → ec.europa.eu/taxation_customs/dds2/taric/* */
export const TARIC_PROXY = '/api/taric';
const TARIC_WEB = 'https://ec.europa.eu/taxation_customs/dds2/taric';

/** Tách thuế suất dạng chữ: "8.00 % + 2.50 EUR / 100 kg" → { pct: 8, specific: "2.50 EUR / 100 kg" }; "90¢/pr. + 37.5%" → { pct: 37.5, specific: "90¢/pr." } */
export function splitDuty(text: string | null | undefined): { pct: number | null; specific: string | null } {
  const t = (text ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return { pct: null, specific: null };
  if (/^free$/i.test(t)) return { pct: 0, specific: null };
  let pct: number | null = null;
  const rest: string[] = [];
  for (const part of t.split(/\s\+\s|\+/)) {
    // "4.00 % MIN 0.30 EUR / 100 kg" → phần % + phần MIN/MAX
    const m = part.trim().match(/^(\d+(?:\.\d+)?)\s*%\s*(.*)$/);
    if (m) {
      pct = (pct ?? 0) + parseFloat(m[1]);
      if (m[2].trim()) rest.push(m[2].trim());
    } else if (part.trim()) rest.push(part.trim());
  }
  return { pct, specific: rest.length ? rest.join(' + ') : null };
}

export interface TaricMeasure {
  /** Tên vùng áp dụng, vd "ERGA OMNES", "Viet Nam" */
  area: string;
  /** Mã vùng: "1011" (mọi nước), "VN", "1008"… */
  areaCode: string;
  type: string;
  duty: string | null;
  start: string;
  end: string;
  addCode?: string;
  addDesc?: string;
  import: boolean;
}

const strip = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const dmy = (d: string) => (d ? d.split('-').reverse().join('-') : '');

/** Đọc trang measures_details.jsp của TARIC → danh sách biện pháp. Hàm thuần. */
export function parseTaricDetails(html: string): TaricMeasure[] {
  const out: TaricMeasure[] = [];
  let area = '', areaCode = '';
  const parts = html.split(/(?=<div id="geographical_area" class="measure_area">)|(?=<div id="measure_\d+">)/);
  for (const b of parts) {
    if (b.startsWith('<div id="geographical_area"')) {
      const name = strip(b.match(/<span class="country[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '');
      const m = name.match(/^(.*)\(([^()]*)\)\s*$/);
      area = (m ? m[1] : name).trim();
      areaCode = m ? m[2].trim().split(/\s+/).pop()! : name;
      continue;
    }
    if (!b.startsWith('<div id="measure_')) continue;
    const desc = b.match(/class="td_measure_description[^"]*"[^>]*>([\s\S]*?)<\/td>\s*<td width="5%"/)?.[1] ?? '';
    const type = strip(desc.replace(/<span[\s\S]*?<\/span>/g, '')).replace(/:\s*$/, '').trim();
    const period = strip(desc).match(/\((\d{2}-\d{2}-\d{4})\s*-\s*(\d{2}-\d{2}-\d{4})?\s*\)/);
    const duty = b.match(/class="duty_rate">([^<]*)</)?.[1];
    const add = strip(b).match(/Additional Code ([A-Z0-9]{4}):\s*(.*?)(?:\s*\[Show conditions\]|\s*$)/);
    out.push({
      area, areaCode, type: type.split(' (')[0].trim(),
      duty: duty ? strip(duty) : null,
      start: dmy(period?.[1] ?? ''), end: dmy(period?.[2] ?? ''),
      ...(add && { addCode: add[1], addDesc: add[2].trim().slice(0, 120) }),
      import: !/title="Measures for(&nbsp;|\s)export/.test(b),
    });
  }
  return out;
}

/** Hiệp định của EU theo nước đối tác (để ghi tên ưu đãi) */
const EU_FTA: Record<string, string> = {
  VN: 'EVFTA', JP: 'EU–Japan EPA', KR: 'EU–Korea FTA', SG: 'EUSFTA', CA: 'CETA', GB: 'EU–UK TCA', MX: 'EU–Mexico', CL: 'EU–Chile', NZ: 'EU–New Zealand FTA',
  CH: 'EU–Thuỵ Sĩ', NO: 'EEA', TR: 'Liên minh thuế quan EU–Thổ Nhĩ Kỳ', MA: 'EU–Maroc', ZA: 'EU–SADC EPA', CO: 'EU–Colombia/Peru/Ecuador', PE: 'EU–Colombia/Peru/Ecuador', EC: 'EU–Colombia/Peru/Ecuador',
};
const ADDITIONAL = /anti-dumping|countervailing|safeguard|additional duty|retaliat|countermeasure|counter-measure/i;
const NONTARIFF = /import control|restriction on (entry|import)|prohibition|surveillance|licen[cs]e|authori[sz]ation/i;

const textCache = new Map<string, Promise<string>>();
async function getText(url: string, timeoutMs = 20000): Promise<string> {
  let p = textCache.get(url);
  if (!p) {
    p = (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
        return await res.text();
      } finally {
        clearTimeout(timer);
      }
    })();
    textCache.set(url, p);
    p.catch(() => textCache.delete(url));
  }
  return p;
}

export const TaricSource: OfficialTariffSource = {
  id: 'taric',
  label: 'EU TARIC (Uỷ ban châu Âu)',
  supports: (c) => inEuCustoms(c),
  async lookup(q) {
    const code = digits(q.hs).slice(0, 10);
    const origin = q.origin && q.origin !== '*' ? q.origin.toUpperCase() : '';
    const date = todayIso().replace(/-/g, '');
    const page = `${TARIC_WEB}/measures.jsp?Lang=en&Taric=${code}&Area=${origin}&SimDate=${date}&Expand=false`;
    const base = { provider: 'taric' as const, providerLabel: this.label, notes: [] as string[], entry: null, url: page };
    if (code.length < 6) return { ...base, error: 'Cần mã HS ít nhất 6 số (chuẩn HS6)' };
    const fallback = async (why: string) => {
      const w = await WitsTariffSource.lookup(q);
      return { ...w, notes: [`${why} – dùng số liệu WITS thay thế.`, ...w.notes] };
    };
    let measures: TaricMeasure[];
    try {
      const first = await getText(`${TARIC_PROXY}/measures.jsp?Lang=en&Taric=${code}&Area=${origin}&SimDate=${date}&Expand=false`);
      const link = first.match(/measures_details\.jsp\?[^"' ]+/)?.[0]?.replace(/&amp;/g, '&');
      if (!link) return fallback(/deferred/i.test(first) && !/measures_details/.test(first) ? 'TARIC chuyển yêu cầu sang xử lý chậm' : `TARIC không có mã ${code}`);
      measures = parseTaricDetails(await getText(`${TARIC_PROXY}/${link}`)).filter((m) => m.import);
    } catch (e) {
      return fallback(`Không gọi được TARIC qua máy chủ trung gian (/api/taric): ${(e as Error).message}`);
    }
    const valid = measures.filter((m) => !m.end || m.end >= todayIso());
    const mfnM = valid.find((m) => m.type === 'Third country duty' && (m.areaCode === '1011' || /ERGA OMNES/.test(m.area)) && m.duty);
    if (!mfnM) return fallback(`TARIC không có thuế MFN chung cho mã ${code}${code.length < 10 ? ' (có thể chỉ quy định ở mã 10 số chi tiết)' : ''}`);
    const mfn = splitDuty(mfnM.duty);
    const notes: string[] = [];
    if (code.length < 10) notes.push(`Tra theo mã ${code}: gồm các biện pháp áp cho cả nhóm. Một số biện pháp chỉ áp cho mã TARIC 10 số chi tiết – nhập đủ 10 số để chính xác.`);
    // ưu đãi theo xuất xứ (Area lọc sẵn theo xuất xứ: hiệp định song phương, GSP…)
    const prefs = valid
      .filter((m) => m.type === 'Tariff preference' && m.duty && m.areaCode !== '1011')
      .map((m) => ({ m, d: splitDuty(m.duty) }))
      .filter((x) => x.d.pct != null)
      .sort((a, b) => a.d.pct! - b.d.pct!);
    const best = prefs[0];
    const usePref = !!best && q.preferFta && (mfn.pct == null || best.d.pct! <= mfn.pct);
    if (best && !q.preferFta) notes.push(`Có thuế ưu đãi ${best.m.duty} cho hàng xuất xứ ${best.m.area} (${EU_FTA[best.m.areaCode] ?? best.m.area}) nếu có chứng từ xuất xứ hợp lệ – tích “Có C/O” để áp dụng.`);
    if (usePref) notes.push(`Đang áp dụng thuế ưu đãi ${best!.m.duty} (${EU_FTA[best!.m.areaCode] ?? best!.m.area}) – cần chứng từ xuất xứ (REX / EUR.1 / tự chứng nhận) theo hiệp định.`);
    if (origin && !best) notes.push(`TARIC không có thuế ưu đãi cho xuất xứ ${origin} với mã này – áp thuế MFN.`);
    const quota = valid.find((m) => /preferential tariff quota/i.test(m.type));
    if (quota) notes.push(`Có hạn ngạch thuế quan ưu đãi (${quota.area}${quota.duty ? `: ${quota.duty}` : ''}) – chỉ áp trong hạn ngạch còn lại.`);
    // thuế bổ sung theo xuất xứ: chống bán phá giá / chống trợ cấp / tự vệ – lấy mức "Other" (mã bổ sung …999) nếu theo công ty
    let additionalPct = 0;
    const addLabels: string[] = [];
    const byType = new Map<string, TaricMeasure[]>();
    for (const m of valid.filter((x) => ADDITIONAL.test(x.type))) byType.set(m.type, [...(byType.get(m.type) ?? []), m]);
    for (const [type, list] of byType) {
      const other = list.find((m) => m.addCode?.endsWith('999') && m.duty) ?? list.find((m) => !m.addCode && m.duty);
      const d = splitDuty(other?.duty);
      if (d.pct != null && d.pct > 0) {
        additionalPct += d.pct;
        addLabels.push(type);
        const firms = list.filter((m) => m.addCode && !m.addCode.endsWith('999')).length;
        notes.push(`${type} cho xuất xứ ${other!.area}: ${other!.duty}${firms ? ` (mức chung "Other"; ${firms} công ty có mức riêng theo mã bổ sung)` : ''} – đã cộng vào tổng.`);
      } else if (list.length) notes.push(`${type} cho xuất xứ ${list[0].area}: theo điều kiện / mã bổ sung của từng công ty – kiểm tra trên TARIC.`);
    }
    const lowValue = valid.filter((m) => /low-value consignment|handling fee/i.test(m.type));
    if (lowValue.length) notes.push(`Áp cho bưu kiện thương mại điện tử giá trị thấp (không áp cho lô hàng container): ${lowValue.map((m) => `${m.type} ${m.duty ?? ''}`.trim()).join('; ')}.`);
    const nonTariff = [...new Set(valid.filter((m) => NONTARIFF.test(m.type)).map((m) => m.type))];
    if (nonTariff.length) notes.push(`Biện pháp phi thuế quan cần kiểm tra: ${nonTariff.join('; ')}.`);
    const chosen = usePref ? best!.d : mfn;
    if (chosen.pct == null && !chosen.specific) return { ...base, code, notes, error: 'Không đọc được thuế suất trên TARIC' };
    if (chosen.pct == null) notes.unshift(`Thuế tuyệt đối ${chosen.specific}: tính theo số lượng / khối lượng nhập ở bảng Hàng hoá.`);
    const vat = standardVat(q.importCountry);
    if (vat) notes.push(`VAT nhập khẩu của ${q.importCountry}: thuế suất tiêu chuẩn ${vat.pct}% (${VAT_DATA.source}) – TARIC không chứa VAT quốc gia.`);
    return {
      ...base,
      code,
      notes,
      entry: {
        id: `taric-${q.importCountry}-${code}-${usePref ? origin : '*'}`,
        importCountry: q.importCountry, hs: code, origin: usePref ? origin : '*',
        rateType: usePref ? 'FTA' : 'MFN', fta: usePref ? `EU – ${EU_FTA[best!.m.areaCode] ?? best!.m.area}` : '',
        dutyPct: chosen.pct ?? 0, vatPct: vat ? vat.pct : null, ...(vat && { vatProvisional: true }), otherPct: 0,
        ...(usePref && { conditions: [`Ưu đãi ${EU_FTA[best!.m.areaCode] ?? best!.m.area}: cần chứng từ xuất xứ (EUR.1 / REX / tự chứng nhận) theo hiệp định`] }),
        ...(additionalPct > 0 && { additionalPct: Math.round(additionalPct * 100) / 100, additionalLabel: addLabels.join(' + ') }),
        ...(chosen.specific && { specificDuty: chosen.specific }),
        source: page, effectiveDate: (usePref ? best!.m.start : mfnM.start) || '', updatedAt: todayIso(), verified: true,
      },
    };
  },
};

/* ───────────────── Biểu thuế Việt Nam (file chính thức đã nạp, mã 8 số) ───────────────── */

export const VnTariffSource: OfficialTariffSource = {
  id: 'vn',
  label: 'Biểu thuế XNK Việt Nam (file đã nạp)',
  supports: (c) => c === 'VN',
  async lookup(q) {
    const d = digits(q.hs);
    const base = { provider: 'vn' as const, providerLabel: this.label, notes: [] as string[], entry: null, url: 'https://www.customs.gov.vn/' };
    let file: VnTariffFile;
    try {
      file = await getJson<VnTariffFile>(`${baseUrl()}data/vn/tariff.json`);
      if (!file?.codes) throw new Error('trống');
    } catch {
      const w = await WitsTariffSource.lookup(q);
      return { ...w, notes: ['Chưa nạp biểu thuế Việt Nam theo mã 8 số (npm run tariffs:vn -- <file Excel>) – dùng số liệu WITS theo HS6.', ...w.notes] };
    }
    if (d.length < 6) return { ...base, error: 'Cần mã HS ít nhất 6 số (chuẩn HS6)' };
    let code = d.length >= 8 ? d.slice(0, 8) : '';
    if (!code || !file.codes[code]) {
      const under = Object.keys(file.codes).filter((c) => c.startsWith(d.slice(0, Math.min(d.length, 8))));
      if (under.length === 1) code = under[0];
      else if (under.length > 1)
        return { ...base, choices: under.slice(0, 60).map((c) => ({ code: c, description: `${file.codes[c][0]} · ${file.codes[c][1] ?? '—'}%` })), notes: [`Mã ${d} có ${under.length} dòng 8 số trong biểu thuế Việt Nam – chọn mã chi tiết.`] };
      else {
        const w = await WitsTariffSource.lookup(q);
        return { ...w, notes: [`Mã ${d} không có trong biểu thuế Việt Nam đã nạp – dùng số liệu WITS theo HS6.`, ...w.notes] };
      }
    }
    const [desc, mfn, vatPct, excise, env] = file.codes[code];
    if (mfn == null) return { ...base, code, description: desc, error: `Dòng ${code} không ghi thuế NK ưu đãi (MFN) dạng % – tra văn bản gốc.` };
    const notes: string[] = [`Biểu thuế Việt Nam ${file.fileName ? `(${file.fileName}) ` : ''}nạp ngày ${file.importedAt.split('-').reverse().join('/')}.`];
    const o = q.origin && q.origin !== '*' ? q.origin.toUpperCase() : '';
    const prefs = o ? vnPreferences(file, code, o) : [];
    const wanted = q.fta ? prefs.find((p) => p.key.toUpperCase() === q.fta!.toUpperCase().replace(/[^A-Z0-9]/g, '') || p.label.toUpperCase().includes(q.fta!.toUpperCase())) : undefined;
    const best = wanted ?? prefs[0];
    const usePref = !!best && q.preferFta && best.pct <= mfn;
    if (best && best.pct < mfn && !q.preferFta) notes.push(`Có thuế ưu đãi đặc biệt ${best.pct}% (${best.label}) cho hàng xuất xứ ${o} – tích “Có C/O” để áp dụng.`);
    if (usePref) notes.push(`Đang áp dụng ${best!.label}: ${best!.pct}% – cần C/O mẫu tương ứng.${prefs.length > 1 ? ` Hiệp định khác: ${prefs.slice(1, 4).map((p) => `${p.label} ${p.pct}%`).join(', ')}.` : ''}`);
    if (o && !prefs.length) notes.push(`Không có thuế ưu đãi đặc biệt cho xuất xứ ${o} ở dòng này – áp thuế NK ưu đãi (MFN).`);
    if (excise != null && excise > 0) notes.push(`Thuế TTĐB ${excise}% (tính trên trị giá + thuế NK) – đã cộng vào tổng.`);
    if (env) notes.push(`Thuế bảo vệ môi trường: ${env} – thuế tuyệt đối, chưa cộng vào tổng.`);
    const vat = vatPct ?? standardVat('VN')?.pct ?? null;
    if (vatPct == null) notes.push(`File không ghi VAT – dùng thuế suất tiêu chuẩn ${vat}%.`);
    return {
      ...base,
      code,
      description: desc,
      notes,
      entry: {
        id: `vn-${code}-${usePref ? o : '*'}`,
        importCountry: 'VN', hs: code, origin: usePref ? o : '*',
        rateType: usePref ? 'FTA' : 'MFN', fta: usePref ? best!.label : '',
        dutyPct: usePref ? best!.pct : mfn, vatPct: vat, ...(vatPct == null && { vatProvisional: true }), otherPct: excise ?? 0,
        ...(usePref && { conditions: [`${best!.label}: cần C/O mẫu tương ứng${!wanted && prefs.length > 1 ? ` – chưa chọn hiệp định, đang dùng mức thấp nhất trong ${prefs.length} hiệp định` : ''}`] }),
        unresolved: [...(env ? [`Thuế bảo vệ môi trường (${env}) – thuế tuyệt đối, chưa cộng`] : []), 'Thuế phòng vệ thương mại của Việt Nam – chưa kiểm tra'],
        source: `${file.source}${file.fileName ? ` – ${file.fileName}` : ''}`, effectiveDate: '', updatedAt: file.importedAt, verified: true,
      },
    };
  },
};

export const OFFICIAL_SOURCES: OfficialTariffSource[] = [UkTariffSource, UsHtsSource, TaricSource, VnTariffSource, WitsTariffSource];

/** Nhãn nguồn của mức thuế lấy tự động (theo tiền tố id) */
export function autoSourceOf(e: { id: string }): string | null {
  if (e.id.startsWith('uk-')) return 'UK Trade Tariff';
  if (e.id.startsWith('us-')) return 'US HTS';
  if (e.id.startsWith('wits-')) return 'WITS / UNCTAD TRAINS';
  if (e.id.startsWith('taric-')) return 'EU TARIC';
  if (e.id.startsWith('vn-')) return 'Biểu thuế Việt Nam';
  return null;
}
export const officialSourceFor = (importCountry: string) => OFFICIAL_SOURCES.find((s) => s.supports(importCountry));
