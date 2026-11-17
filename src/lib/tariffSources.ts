import { todayIso } from './csv';
import { matchTariff, type TariffEntry, type TariffQuery } from '../providers/TariffProvider';
import snapshotJson from '../data/tariffSnapshot.json';
import countries from 'i18n-iso-countries';
import { EU_SET } from '../data/countries';
import { VAT_DATA, standardVat } from '../data/vatRates';
import { tariffLookupLink } from '../data/customsBasis';

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
  provider: 'uk' | 'us' | 'wits';
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
  readonly id: 'uk' | 'us' | 'wits';
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
  // bằng thuế suất → ưu tiên hiệp định song phương (khu vực ít nước hơn), vd UKVFTA trước CPTPP
  const areaSize = (id: string) => (/^[A-Z]{2}$/.test(id) ? 1 : Math.max(1, refs(geo(id) ?? ({} as JsonApiItem), 'children_geographical_areas').length));
  const pref = prefs.filter((r) => r.pct != null).sort((a, b) => a.pct! - b.pct! || areaSize(a.areaId) - areaSize(b.areaId))[0] ?? prefs[0];
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
/** Xoá bộ nhớ đệm tra cứu (dùng trong test) */
export const clearTariffCache = () => cache.clear();
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
  if (chosen.pct == null) return { entry: null, notes: [`Thuế phức hợp: ${chosen.text} – PortRank chỉ tự tính thuế dạng %, cần tính tay.`] };
  if (pref && !usePref) notes.push(`Có ưu đãi cho xuất xứ này (${pref.area ?? pref.areaId}: ${pref.text}) nếu có C/O hợp lệ – đang tính thuế MFN vì chưa tích “Có C/O”.`);
  if (vat && vat.pct == null) notes.push(`VAT dạng đặc biệt: ${vat.text}`);
  if (parsed.otherVat.length) notes.push(`Các mức VAT khác theo điều kiện: ${parsed.otherVat.join(', ')} – đang dùng mức chuẩn.`);
  return {
    notes,
    entry: {
      id: `uk-${code}-${origin}`,
      importCountry: 'GB', hs: code, origin: usePref ? origin : '*',
      rateType: usePref ? 'FTA' : 'MFN', fta: usePref ? `UK – ${pref!.area ?? pref!.areaId}` : '',
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

/** Phí CBP tính trên trị giá: MPF 0,3464% (có mức tối thiểu/tối đa mỗi tờ khai, điều chỉnh theo năm tài chính) + HMF 0,125% (hàng qua cảng biển). 19 CFR 24.23, 24.24 */
export const US_MPF_PCT = 0.3464;
export const US_HMF_PCT = 0.125;

export function usEntry(row: HtsRow, origin: string, preferFta: boolean): { entry: TariffEntry | null; notes: string[] } {
  const notes: string[] = ['Mỹ không có VAT liên bang (thuế bán hàng do từng bang thu khi bán lẻ).'];
  const ch99 = (row.footnotes ?? []).map((f) => f.value ?? '').filter((v) => /99\d{2}\./.test(v));
  notes.push(
    `Tổng chỉ gồm thuế cột General/Special của HTS và phí MPF/HMF – CHƯA cộng thuế bổ sung Chương 99 (Section 301/232, thuế đối ứng…)${ch99.length ? `; dòng này có chú thích: ${ch99.join(' · ')}` : ''}. Kiểm tra trên hts.usitc.gov hoặc với môi giới hải quan.`,
  );
  const mfn = parsePercent(row.general);
  const sp = preferFta ? usSpecialRate(row.special, origin) : null;
  const usePref = sp != null && (mfn == null || sp <= mfn);
  if (!usePref && mfn == null) return { entry: null, notes: [`Thuế phức hợp: “${row.general}” – PortRank chỉ tự tính thuế dạng %, cần tính tay.`, ...notes] };
  const code = digits(row.htsno);
  // Hàng có xuất xứ USMCA (Canada, Mexico) được miễn MPF
  const mpfExempt = usePref && (origin === 'CA' || origin === 'MX');
  const feePct = +((mpfExempt ? 0 : US_MPF_PCT) + US_HMF_PCT).toFixed(4);
  notes.push(`Phí CBP: ${mpfExempt ? '' : `MPF ${US_MPF_PCT}% (có mức tối thiểu/tối đa mỗi tờ khai) + `}HMF ${US_HMF_PCT}% trên trị giá – đã cộng vào tổng.`);
  return {
    notes,
    entry: {
      id: `us-${code}-${origin}`,
      importCountry: 'US', hs: code, origin: usePref ? origin : '*',
      rateType: usePref ? 'FTA' : 'MFN', fta: usePref ? 'Mỹ – cột Special' : '',
      dutyPct: usePref ? sp! : mfn!, vatPct: 0, otherPct: 0, feePct, feeLabel: mpfExempt ? 'Phí HMF (CBP)' : 'Phí MPF + HMF (CBP)',
      source: `https://hts.usitc.gov/search?query=${encodeURIComponent(row.htsno)}`, effectiveDate: '', updatedAt: todayIso(), verified: true,
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
  const entry = snap.generatedAt ? matchTariff(snap.entries.filter((e) => e.id.startsWith(prefix)), q) : null;
  if (!entry) return { ...base, error };
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
      const { entry, notes } = usEntry(row, q.origin, q.preferFta);
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

/** Mã số WITS (ISO 3166 numeric) của nước nhập; nước EU → biểu thuế chung EU */
export function witsReporter(iso2: string): string | null {
  if (EU_SET.has(iso2)) return WITS_EU;
  const n = countries.alpha2ToNumeric(iso2);
  return n ? String(n).padStart(3, '0') : null;
}

const witsUrl = (reporter: string, partner: string, hs6: string, year: number) =>
  `${WITS_PROXY}/reporter/${reporter}/partner/${partner}/product/${hs6}/year/${year}/datatype/reported?format=JSON`;

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
      const mfn = await witsLatest(reporter, '000', hs6, years);
      if (!mfn) return { ...base, error: `WITS chưa có thuế MFN của ${q.importCountry} cho HS ${hs6} (6 năm gần nhất)` };
      const notes: string[] = [];
      const { t, year } = mfn;
      const isEu = reporter === WITS_EU;
      notes.push(`Thuế MFN theo biểu thuế ${isEu ? 'chung EU' : q.importCountry} năm ${year} (UNCTAD TRAINS qua WITS) – có thể đã thay đổi; xác nhận ở biểu thuế hiện hành.`);
      if (t.min != null && t.max != null && t.min !== t.max)
        notes.push(`HS6 ${hs6} gồm ${t.lines ?? 'nhiều'} dòng quốc gia, thuế từ ${t.min}% đến ${t.max}% – đang dùng trung bình ${t.pct}%. Mã quốc gia cụ thể có thể cao/thấp hơn.`);
      if (t.nomen && t.nomen !== 'H6') notes.push(`Biểu thuế năm ${year} dùng danh mục ${NOMEN[t.nomen] ?? t.nomen} – mã HS có thể khác HS 2022.`);
      // thuế ưu đãi theo đúng xuất xứ (TRAINS có dữ liệu cho một số cặp nước)
      let pref: WitsTariff | null = null;
      const partner = q.origin && q.origin !== '*' ? witsReporter(q.origin) : null;
      if (partner && partner !== reporter && !(isEu && EU_SET.has(q.origin))) {
        try {
          const p = parseWits(await getJson(witsUrl(reporter, partner, hs6, year)));
          if (p && p.tariffType !== 'MFN' && p.pct < t.pct) pref = p;
        } catch {
          /* không có dữ liệu ưu đãi */
        }
      }
      const usePref = !!pref && q.preferFta;
      if (pref && !usePref) notes.push(`TRAINS ghi thuế ưu đãi ${pref.pct}% cho hàng xuất xứ ${q.origin} – tích “Có C/O” để áp dụng.`);
      if (!pref) notes.push(`TRAINS năm ${year} không có thuế ưu đãi riêng cho xuất xứ ${q.origin}. Nếu có FTA, tra thuế ưu đãi ở nguồn chính thức rồi nhập vào trang Biểu thuế.`);
      const vat = standardVat(q.importCountry);
      if (vat) notes.push(`VAT/GST: dùng thuế suất tiêu chuẩn ${vat.pct}% (${VAT_DATA.source}) – một số mặt hàng có mức giảm/miễn.`);
      return {
        ...base,
        url,
        code: hs6,
        notes,
        entry: {
          id: `wits-${q.importCountry}-${hs6}-${usePref ? q.origin : '*'}`,
          importCountry: q.importCountry, hs: hs6, origin: usePref ? q.origin : '*',
          rateType: usePref ? 'FTA' : 'MFN', fta: usePref ? `TRAINS – ưu đãi cho ${q.origin}` : '',
          dutyPct: usePref ? pref!.pct : t.pct, vatPct: vat && vat.type !== 'none' ? vat.pct : vat ? 0 : null, otherPct: 0,
          source: `https://wits.worldbank.org/API/V1/SDMX/V21/datasource/TRN/reporter/${reporter}/partner/${usePref ? partner : '000'}/product/${hs6}/year/${year}/datatype/reported?format=JSON`,
          effectiveDate: `${year}-01-01`, updatedAt: todayIso(), verified: false,
        },
      };
    } catch (e) {
      return { ...base, error: `Không gọi được WITS qua máy chủ trung gian (/api/wits): ${(e as Error).message}` };
    }
  },
};

export const OFFICIAL_SOURCES: OfficialTariffSource[] = [UkTariffSource, UsHtsSource, WitsTariffSource];

/** Nhãn nguồn của mức thuế lấy tự động (theo tiền tố id) */
export function autoSourceOf(e: { id: string }): string | null {
  if (e.id.startsWith('uk-')) return 'UK Trade Tariff';
  if (e.id.startsWith('us-')) return 'US HTS';
  if (e.id.startsWith('wits-')) return 'WITS / UNCTAD TRAINS';
  return null;
}
export const officialSourceFor = (importCountry: string) => OFFICIAL_SOURCES.find((s) => s.supports(importCountry));
