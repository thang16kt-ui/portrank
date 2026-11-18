import { EU_SET } from '../data/countries';
import { parseDate, rowsToRecords, toDecimal } from '../lib/csv';

/** Một khoản phí theo trị giá có sàn/trần và phạm vi riêng (vd. MPF, HMF của Mỹ). Tính một lần mỗi tờ khai */
export interface FeeRule {
  code: string;
  label: string;
  pct: number;
  /** Mức sàn / trần mỗi tờ khai (USD) */
  minUsd?: number;
  maxUsd?: number;
  /** Chỉ áp dụng cho các phương thức này (vd. HMF: chỉ hàng bốc/dỡ từ tàu biển thương mại) */
  modes?: ('sea' | 'road')[];
  /** Diễn giải / giả định (kiểu khai, năm tài chính…) */
  note?: string;
  source?: string;
}

/**
 * Một mức thuế do người dùng nhập (hoặc do adapter nguồn chính thức trả về).
 * KHÔNG có thuế suất nào được hard-code trong mã nguồn.
 */
export interface TariffEntry {
  id: string;
  /** Nước nhập (ISO2) hoặc 'EU' cho biểu thuế chung của EU */
  importCountry: string;
  /** Mã HS / mã quốc gia dạng CHUỖI (giữ số 0 đầu, 6–10 số). Khớp chính xác hoặc mã này là tiền tố của mã tra */
  hs: string;
  /** Xuất xứ (ISO2) hoặc '*' = mọi xuất xứ */
  origin: string;
  rateType: 'MFN' | 'FTA';
  /** Tên hiệp định nếu là thuế ưu đãi */
  fta: string;
  dutyPct: number;
  /** VAT/GST %, null = chưa nhập */
  vatPct: number | null;
  /** VAT/GST là mức tiêu chuẩn của nước nhập, CHƯA xác minh cho mặt hàng (có thể có mức giảm/miễn) */
  vatProvisional?: boolean;
  /** Điều kiện / nguồn của mức VAT theo sản phẩm */
  vatNote?: string;
  /** Thuế khác (TTĐB, BVMT…) % trên (trị giá + thuế NK) */
  otherPct: number;
  /** Ô thuế khác để trống trong file nguồn (phụ thuộc điều kiện – xem bảng C) – không coi là 0 */
  otherPctMissing?: boolean;
  /** Phí theo trị giá đơn giản (định dạng cũ). Nguồn mới dùng `fees` */
  feePct?: number;
  feeLabel?: string;
  /** Các khoản phí có sàn/trần, phạm vi theo phương thức (MPF/HMF…) */
  fees?: FeeRule[];
  /** Thuế bổ sung theo xuất xứ (chống bán phá giá / chống trợ cấp / tự vệ…) % trên trị giá tính thuế – có chịu VAT */
  additionalPct?: number;
  additionalLabel?: string;
  /** Phần thuế tuyệt đối / theo lượng (vd. "90¢/pr.", "2.50 EUR / 100 kg") – tính theo số lượng nhập ở bảng Hàng hoá */
  specificDuty?: string;
  /** Link hoặc số hiệu văn bản nguồn */
  source: string;
  /** Ngày bắt đầu hiệu lực của MỨC THUẾ (không phải ngày tra) – '' = chưa xác định */
  effectiveDate: string;
  /** Ngày hết hiệu lực – '' = chưa có */
  expiryDate?: string;
  /** Năm của biểu thuế (số liệu thống kê TRAINS…) – dùng để cảnh báo dữ liệu cũ */
  dataYear?: number;
  /** Ngày tải / tra dữ liệu (khác ngày hiệu lực) */
  fetchedAt?: string;
  /** Ngày cập nhật / xác minh */
  updatedAt: string;
  verified: boolean;
  /** Mức thuế là ước tính (vd. trung bình HS6 của nhiều dòng quốc gia) – lý do */
  estimate?: string;
  /** Khoản có thể phải nộp nhưng nguồn này chưa tính (thuế bổ sung Chương 99, phòng vệ thương mại…) */
  unresolved?: string[];
  /** Điều kiện phải đáp ứng để mức này đúng (C/O theo hiệp định, mục đích sử dụng…) */
  conditions?: string[];
  description?: string;
}

export interface TariffQuery {
  importCountry: string;
  hs: string;
  origin: string;
  /** Có C/O / chứng từ xuất xứ → xét thuế ưu đãi FTA */
  preferFta: boolean;
  /** Hiệp định người dùng chọn (khớp không phân biệt hoa thường); rỗng = chưa chọn */
  fta?: string;
  /** Ngày dự kiến tính thuế (khai hải quan) YYYY-MM-DD; rỗng = hôm nay */
  date?: string;
  /** Phương thức vận chuyển vào nước nhập (HMF của Mỹ chỉ áp cho tàu biển) */
  mode?: 'sea' | 'road';
}

/** Kết quả chọn mức thuế: entry (nếu chốt được), các mã con để chọn (khi mã chưa đủ chi tiết), các phương án MFN/FTA */
export interface TariffResolution {
  entry: TariffEntry | null;
  /** Mã nhập chưa đủ chi tiết: các mã quốc gia con có mức khác nhau → phải chọn */
  choices?: { code: string; description?: string; dutyPct: number }[];
  /** Các mức có thể áp dụng (MFN + từng FTA hợp lệ tại ngày tính), thấp nhất trước */
  alternatives: TariffEntry[];
  /** Điều kiện để mức đã chọn đúng */
  conditions: string[];
  notes: string[];
}

export interface TariffProvider {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly note?: string;
  lookup(q: TariffQuery): TariffEntry | null | Promise<TariffEntry | null>;
  /** Chọn mức thuế đầy đủ (mã con, phương án FTA, điều kiện) */
  resolve?(q: TariffQuery): TariffResolution;
}

const digits = (s: string) => s.replace(/\D/g, '');
const today = () => new Date().toISOString().slice(0, 10);
const normFta = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Còn hiệu lực tại ngày `date` (ngày hiệu lực trống = chưa xác định → vẫn dùng, ghi chú) */
export const validAt = (e: Pick<TariffEntry, 'effectiveDate' | 'expiryDate'>, date: string) => (!e.effectiveDate || e.effectiveDate <= date) && (!e.expiryDate || e.expiryDate >= date);

/** Thứ tự xác định (không phụ thuộc thứ tự dòng): thuế thấp hơn, rồi tên hiệp định, rồi nguồn */
const stableCmp = (a: TariffEntry, b: TariffEntry) => a.dutyPct - b.dutyPct || a.fta.localeCompare(b.fta) || a.source.localeCompare(b.source) || a.id.localeCompare(b.id);

/** Nhiều phiên bản cùng mã/xuất xứ/loại/hiệp định → bản có ngày hiệu lực gần nhất ≤ ngày tính */
function latestVersions(list: TariffEntry[]): TariffEntry[] {
  const by = new Map<string, TariffEntry>();
  for (const e of list) {
    const k = [e.importCountry, digits(e.hs), e.origin, e.rateType, normFta(e.fta)].join('|');
    const cur = by.get(k);
    if (!cur || e.effectiveDate > cur.effectiveDate || (e.effectiveDate === cur.effectiveDate && stableCmp(e, cur) < 0)) by.set(k, e);
  }
  return [...by.values()];
}

/**
 * Chọn mức thuế – kết quả KHÔNG phụ thuộc thứ tự dòng:
 *  1. đúng nước nhập (hoặc 'EU'), còn hiệu lực tại ngày tính;
 *  2. mã HS: dòng có mã là tiền tố dài nhất của mã tra. Nếu chỉ có các mã CON (mã tra chưa đủ chi tiết) có mức khác nhau → trả `choices`, không tự chốt;
 *  3. MFN: đúng xuất xứ trước, rồi '*'; nước riêng trước 'EU';
 *  4. FTA: chỉ khi có C/O và đúng xuất xứ. Nếu người dùng chọn hiệp định → dùng đúng hiệp định đó; nếu chưa chọn → mức thấp nhất, kèm điều kiện cần xác nhận.
 */
export function resolveTariff(entries: TariffEntry[], q: TariffQuery): TariffResolution {
  const out: TariffResolution = { entry: null, alternatives: [], conditions: [], notes: [] };
  const hs = digits(q.hs);
  if (hs.length < 4) return out;
  const date = q.date || today();
  const countryOk = (e: TariffEntry) => e.importCountry === q.importCountry || (e.importCountry === 'EU' && EU_SET.has(q.importCountry));
  const originOk = (e: TariffEntry) => e.origin === '*' || e.origin === '' || e.origin === q.origin;
  const pool = entries.filter((e) => countryOk(e) && originOk(e) && digits(e.hs) && (hs.startsWith(digits(e.hs)) || digits(e.hs).startsWith(hs)));
  const live = pool.filter((e) => validAt(e, date));
  if (live.length < pool.length) out.notes.push(`Đã bỏ qua ${pool.length - live.length} dòng chưa có hiệu lực hoặc đã hết hiệu lực tại ngày tính ${date}.`);
  const covering = live.filter((e) => hs.startsWith(digits(e.hs)));
  let codeRows: TariffEntry[];
  if (covering.length) {
    const len = Math.max(...covering.map((e) => digits(e.hs).length));
    codeRows = covering.filter((e) => digits(e.hs).length === len);
  } else {
    const children = live.filter((e) => digits(e.hs).startsWith(hs) && digits(e.hs).length > hs.length);
    if (!children.length) return out;
    const codes = [...new Set(children.map((e) => digits(e.hs)))].sort();
    const rowsOf = (c: string) => latestVersions(children.filter((e) => digits(e.hs) === c));
    const mfnOf = (c: string) => rowsOf(c).filter((e) => e.rateType === 'MFN').sort(stableCmp)[0];
    // chữ ký mức thuế của từng mã con (MFN + mọi FTA) – chỉ gộp khi MỌI mã con giống hệt nhau
    const sig = (c: string) => rowsOf(c).map((e) => [e.rateType, normFta(e.fta), e.origin, e.dutyPct, e.vatPct, e.otherPct, e.specificDuty ?? ''].join(':')).sort().join('|');
    const reps = codes.map(mfnOf);
    if (codes.length === 1 || reps.some((r) => !r) || codes.some((c) => sig(c) !== sig(codes[0]))) {
      out.choices = codes.map((c, i) => ({ code: c, dutyPct: reps[i]?.dutyPct ?? NaN, ...(reps[i]?.description && { description: reps[i]!.description }) }));
      out.notes.push(`Mã ${hs} chưa đủ chi tiết: có ${codes.length} mã quốc gia ${codes.join(', ')} – chọn đúng mã theo đặc tính hàng (không tự chốt một mã con).`);
      return out;
    }
    out.notes.push(`Các mã ${codes.join(', ')} thuộc ${hs} có cùng mọi mức thuế – tính theo mã ${hs}; khi khai báo vẫn phải chọn đúng mã chi tiết.`);
    // không gán mã con cụ thể (vd. mã địa lý) cho hàng: giữ mã cha đã nhập
    codeRows = children.filter((e) => digits(e.hs) === codes[0]).map((e) => ({ ...e, id: `${e.id}~${hs}`, hs }));
  }
  const rows = latestVersions(codeRows);
  const pickMfn = rows
    .filter((e) => e.rateType === 'MFN')
    .sort((a, b) => Number(b.origin === q.origin) - Number(a.origin === q.origin) || Number(b.importCountry === q.importCountry) - Number(a.importCountry === q.importCountry) || stableCmp(a, b))[0];
  const ftas = rows.filter((e) => e.rateType === 'FTA' && e.origin === q.origin).sort((a, b) => Number(b.importCountry === q.importCountry) - Number(a.importCountry === q.importCountry) || stableCmp(a, b));
  out.alternatives = [...(pickMfn ? [pickMfn] : []), ...ftas].sort(stableCmp);
  let entry: TariffEntry | null = pickMfn ?? null;
  if (q.preferFta && ftas.length) {
    const want = normFta(q.fta ?? '');
    if (want) {
      const hit = ftas.find((e) => normFta(e.fta).includes(want) || want.includes(normFta(e.fta)));
      if (hit) {
        entry = hit;
        out.conditions.push(`Áp dụng ${hit.fta}: cần chứng từ xuất xứ theo ${hit.fta} và đáp ứng quy tắc xuất xứ, vận chuyển của hiệp định.`);
      } else out.notes.push(`Không có mức ưu đãi theo hiệp định "${q.fta}" cho mã này – đang dùng ${pickMfn ? 'MFN' : 'mức có sẵn'}.`);
    } else {
      const best = ftas[0];
      if (!pickMfn || best.dutyPct <= pickMfn.dutyPct) {
        entry = best;
        out.conditions.push(
          ftas.length > 1
            ? `Chưa chọn hiệp định: đang dùng mức thấp nhất ${best.dutyPct}% (${best.fta}) trong ${ftas.length} hiệp định (${ftas.map((f) => `${f.fta} ${f.dutyPct}%`).join(', ')}). Mỗi hiệp định cần C/O / chứng từ riêng – chọn hiệp định ở ô "Hiệp định".`
            : `Áp dụng ${best.fta}: cần chứng từ xuất xứ theo ${best.fta} và đáp ứng quy tắc xuất xứ, vận chuyển của hiệp định.`,
        );
      }
    }
  } else if (!q.preferFta && ftas.length && pickMfn && ftas[0].dutyPct < pickMfn.dutyPct) {
    out.notes.push(`Có mức ưu đãi thấp hơn: ${ftas.map((f) => `${f.fta} ${f.dutyPct}%`).join(', ')} – tích "Có C/O" và chọn hiệp định nếu đủ điều kiện.`);
  }
  if (entry && !entry.effectiveDate) out.notes.push('Dòng thuế chưa ghi ngày bắt đầu hiệu lực – chưa xác nhận được mức tại ngày tính.');
  out.entry = entry;
  return out;
}

/** Tương thích cũ: chỉ trả mức thuế đã chốt */
export function matchTariff(entries: TariffEntry[], q: TariffQuery): TariffEntry | null {
  return resolveTariff(entries, q).entry;
}

export function createUserTariffProvider(entries: TariffEntry[]): TariffProvider {
  return { id: 'user', label: 'Biểu thuế tôi nhập', enabled: true, lookup: (q) => matchTariff(entries, q), resolve: (q) => resolveTariff(entries, q) };
}

/**
 * Các nguồn chính thức – CHƯA bật. Trước khi viết adapter phải kiểm tra tài liệu API hiện hành của từng nguồn.
 * Thứ tự ưu tiên: bảng người dùng nhập → nguồn chính thức theo nước → WTO → API landed cost trả phí.
 */
export const OFFICIAL_TARIFF_SOURCES: { id: string; label: string; url: string; enabled: boolean; note: string }[] = [
  { id: 'uk-tariff', label: 'UK Trade Tariff API', url: 'https://www.trade-tariff.service.gov.uk/', enabled: true, note: 'Tự động cho nước nhập = Anh: thuế MFN, ưu đãi theo xuất xứ, VAT (src/lib/tariffSources.ts)' },
  { id: 'us-hts', label: 'US HTS (USITC)', url: 'https://hts.usitc.gov/', enabled: true, note: 'Tự động cho nước nhập = Mỹ qua trung gian /api/hts: cột General / Special, phí MPF/HMF; thuế bổ sung Chương 99 theo xuất xứ hiện “cần xác minh”, không cộng vào tổng' },
  { id: 'taric', label: 'EU TARIC', url: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp', enabled: false, note: 'Không có API công khai (trang HTML tải bằng JavaScript) – tra tay rồi nhập vào bảng' },
  { id: 'vn', label: 'Biểu thuế Việt Nam', url: 'https://www.customs.gov.vn/', enabled: false, note: 'Không có API công khai – tra tay' },
  { id: 'wits', label: 'WITS – UNCTAD TRAINS (World Bank)', url: 'https://wits.worldbank.org/', enabled: true, note: 'Tự động cho mọi nước nhập khác (gồm EU, Việt Nam) qua /api/wits: thuế MFN theo HS6 năm gần nhất có số liệu (trễ 1–3 năm), ưu đãi theo xuất xứ nếu TRAINS có; VAT/GST tiêu chuẩn từ gói sales-tax' },
  { id: 'wto', label: 'WTO Tariff & Trade Data', url: 'https://ttd.wto.org/', enabled: false, note: 'API cần đăng ký key, dữ liệu cập nhật chậm – dùng WITS thay thế' },
];

/** Bộ 12 cột A (tương thích file tổng hợp gửi bên ngoài) */
export const TARIFF_CSV_HEADER = ['import_country', 'hs', 'origin', 'rate_type', 'fta', 'duty_pct', 'vat_pct', 'other_pct', 'source', 'effective_date', 'updated_at', 'verified'];
/** Định dạng ĐẦY ĐỦ (schema_version 2): A + các thành phần ảnh hưởng tiền thuế – xuất/nhập không mất dữ liệu */
export const TARIFF_CSV_FULL_HEADER = [
  ...TARIFF_CSV_HEADER,
  'expiry_date', 'specific_duty', 'additional_pct', 'additional_label', 'fee_pct', 'fee_label', 'fees_json',
  'vat_provisional', 'vat_note', 'data_year', 'estimate', 'unresolved', 'conditions', 'description', 'schema_version',
];
export const TARIFF_SCHEMA_VERSION = 2;

const cell = (v: unknown) => (v == null ? '' : String(v));
/** Một dòng theo định dạng A (mất các thành phần mở rộng) hoặc đầy đủ */
export function tariffToRow(t: TariffEntry, full = true): string[] {
  const a = [t.importCountry, t.hs, t.origin, t.rateType, t.fta, cell(t.dutyPct), cell(t.vatPct), t.otherPctMissing ? '' : cell(t.otherPct), t.source, t.effectiveDate, t.updatedAt, t.verified ? '1' : '0'];
  if (!full) return a;
  return [
    ...a, t.expiryDate ?? '', t.specificDuty ?? '', cell(t.additionalPct), t.additionalLabel ?? '', cell(t.feePct), t.feeLabel ?? '', t.fees?.length ? JSON.stringify(t.fees) : '',
    t.vatProvisional ? '1' : '', t.vatNote ?? '', cell(t.dataYear), t.estimate ?? '', (t.unresolved ?? []).join(' | '), (t.conditions ?? []).join(' | '), t.description ?? '', String(TARIFF_SCHEMA_VERSION),
  ];
}

/** Nguồn ghi có thuế tuyệt đối ("tuyệt đối: 1 USD/kg", "specific", "¢/kg"…) mà cột specific_duty trống → không được coi là không có thuế */
const SPECIFIC_HINT = /tuy[eệ]t\s*đ[oố]i|specific|theo\s+l[ưu][ợo]ng|\d\s*(¢|USD|EUR|GBP|JPY|KRW|AUD|CAD|MXN)\s*\/\s*(kg|pr|pair|l|hl|unit|chi[eế]c|đôi)/i;

export function parseTariffRows(rows: string[][]): { entries: TariffEntry[]; errors: string[]; warnings: string[] } {
  const recs = rowsToRecords(rows, {
    importCountry: ['import_country', 'nuoc nhap', 'country'],
    hs: ['ma hs', 'hs code', 'hscode', 'national_code'],
    origin: ['xuat xu'],
    rateType: ['rate_type', 'loai thue suat', 'loai'],
    fta: ['hiep dinh'],
    dutyPct: ['duty_pct', 'thue nk', 'thue nhap khau', 'duty'],
    vatPct: ['vat_pct', 'vat', 'gst'],
    otherPct: ['other_pct', 'thue khac'],
    source: ['nguon', 'link'],
    effectiveDate: ['effective_date', 'ngay hieu luc'],
    expiryDate: ['expiry_date', 'ngay het hieu luc', 'het hieu luc'],
    updatedAt: ['updated_at', 'ngay cap nhat'],
    verified: ['da xac minh'],
    specificDuty: ['specific_duty', 'thue tuyet doi'],
    additionalPct: ['additional_pct', 'thue bo sung'],
    additionalLabel: ['additional_label'],
    feePct: ['fee_pct'],
    feeLabel: ['fee_label'],
    feesJson: ['fees_json'],
    vatProvisional: ['vat_provisional'],
    vatNote: ['vat_note'],
    dataYear: ['data_year'],
    estimate: ['estimate'],
    unresolved: ['unresolved'],
    conditions: ['conditions'],
    description: ['description', 'mo ta'],
  });
  const entries: TariffEntry[] = [], errors: string[] = [], warnings: string[] = [];
  recs.forEach((r, i) => {
    const line = i + 2;
    const cc = (r.importCountry ?? '').trim().toUpperCase();
    if (cc.length !== 2) return errors.push(`Dòng ${line}, cột import_country: nước nhập phải là mã 2 chữ (VN, DE, EU…)`);
    const hs = digits(r.hs ?? '');
    if (hs.length < 4 || hs.length > 12) return errors.push(`Dòng ${line}, cột hs: mã HS không hợp lệ "${r.hs ?? ''}"`);
    // thuế suất: số thập phân nghiêm ngặt (0.125 = 0,125%, không phải 125). Cho phép dạng phức hợp "5% + 1 USD/kg"
    let duty = toDecimal(r.dutyPct);
    let specific = (r.specificDuty ?? '').trim();
    if (!isFinite(duty) && r.dutyPct && /[+]|\/|¢/.test(r.dutyPct)) {
      const m = r.dutyPct.match(/^\s*(\d+(?:\.\d+)?)\s*%\s*\+\s*(.+)$/);
      if (m) [duty, specific] = [parseFloat(m[1]), specific || m[2].trim()];
      else if (!/%/.test(r.dutyPct)) [duty, specific] = [0, specific || r.dutyPct.trim()];
    }
    if (!isFinite(duty)) return errors.push(`Dòng ${line}, cột duty_pct: thiếu hoặc không đọc được thuế suất "${r.dutyPct ?? ''}" (dùng dấu chấm thập phân, vd 0.125)`);
    if (duty < 0) return errors.push(`Dòng ${line}, cột duty_pct: thuế suất âm (${duty}) không hợp lệ`);
    const vat = toDecimal(r.vatPct), other = toDecimal(r.otherPct), add = toDecimal(r.additionalPct), fee = toDecimal(r.feePct);
    if (r.vatPct && !isFinite(vat)) return errors.push(`Dòng ${line}, cột vat_pct: không đọc được "${r.vatPct}"`);
    if (r.otherPct && !isFinite(other)) return errors.push(`Dòng ${line}, cột other_pct: không đọc được "${r.otherPct}"`);
    for (const [k, v] of [['vat_pct', vat], ['other_pct', other], ['additional_pct', add], ['fee_pct', fee]] as const)
      if (isFinite(v) && v < 0) return errors.push(`Dòng ${line}, cột ${k}: giá trị âm (${v}) không hợp lệ`);
    if (!r.source) return errors.push(`Dòng ${line}, cột source: thiếu nguồn (bắt buộc)`);
    const upd = parseDate(r.updatedAt), eff = parseDate(r.effectiveDate), exp = parseDate(r.expiryDate);
    if (upd.invalid) return errors.push(`Dòng ${line}, cột updated_at: ngày không có thật "${r.updatedAt}"`);
    if (!upd.iso) return errors.push(`Dòng ${line}, cột updated_at: thiếu ngày cập nhật (bắt buộc)`);
    if (eff.invalid) return errors.push(`Dòng ${line}, cột effective_date: ngày không có thật "${r.effectiveDate}"`);
    if (exp.invalid) return errors.push(`Dòng ${line}, cột expiry_date: ngày không có thật "${r.expiryDate}"`);
    if (eff.iso && exp.iso && exp.iso < eff.iso) return errors.push(`Dòng ${line}: ngày hết hiệu lực ${exp.iso} trước ngày hiệu lực ${eff.iso}`);
    let fees: FeeRule[] | undefined;
    if (r.feesJson) {
      try {
        fees = JSON.parse(r.feesJson);
        if (!Array.isArray(fees) || fees.some((f) => typeof f.pct !== 'number' || f.pct < 0)) throw new Error();
      } catch {
        return errors.push(`Dòng ${line}, cột fees_json: không đọc được danh sách phí`);
      }
    }
    const unresolved = (r.unresolved ?? '').split(' | ').map((x) => x.trim()).filter(Boolean);
    if (!specific && SPECIFIC_HINT.test(r.source)) {
      warnings.push(`Dòng ${line}: nguồn có nhắc thuế tuyệt đối/theo lượng nhưng cột specific_duty trống – dòng được đánh dấu "chưa đủ" cho tới khi bạn nhập phần thuế này.`);
      unresolved.push('Phần thuế tuyệt đối ghi trong nguồn chưa được nhập vào cột specific_duty');
    }
    const type = (r.rateType ?? '').toUpperCase().includes('FTA') || r.fta ? 'FTA' : 'MFN';
    const year = toDecimal(r.dataYear);
    entries.push({
      id: `${Date.now().toString(36)}-${i}`,
      importCountry: cc,
      hs,
      origin: (r.origin ?? '*').trim().toUpperCase() || '*',
      rateType: type,
      fta: r.fta ?? '',
      dutyPct: duty,
      vatPct: isFinite(vat) ? vat : null,
      otherPct: isFinite(other) ? other : 0,
      ...(!r.otherPct && { otherPctMissing: true }),
      ...(specific && { specificDuty: specific }),
      ...(isFinite(add) && add > 0 && { additionalPct: add, additionalLabel: r.additionalLabel ?? '' }),
      ...(isFinite(fee) && fee > 0 && { feePct: fee, feeLabel: r.feeLabel ?? '' }),
      ...(fees?.length && { fees }),
      ...(/^1|true$/i.test(r.vatProvisional ?? '') && { vatProvisional: true }),
      ...(r.vatNote && { vatNote: r.vatNote }),
      ...(isFinite(year) && { dataYear: year }),
      ...(r.estimate && { estimate: r.estimate }),
      ...(unresolved.length && { unresolved }),
      ...(r.conditions && { conditions: r.conditions.split(' | ').map((x) => x.trim()).filter(Boolean) }),
      ...(r.description && { description: r.description }),
      source: r.source,
      effectiveDate: eff.iso,
      ...(exp.iso && { expiryDate: exp.iso }),
      updatedAt: upd.iso,
      verified: /^(1|true|yes|x|co|có|da|đã)/i.test(r.verified ?? ''),
    });
  });
  return { entries, errors, warnings };
}
