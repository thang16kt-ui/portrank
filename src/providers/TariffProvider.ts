import { EU_SET } from '../data/countries';
import { rowsToRecords, toIsoDate, toNumber } from '../lib/csv';

/**
 * Một mức thuế do người dùng nhập (hoặc do adapter nguồn chính thức trả về).
 * KHÔNG có thuế suất nào được hard-code trong mã nguồn.
 */
export interface TariffEntry {
  id: string;
  /** Nước nhập (ISO2) hoặc 'EU' cho biểu thuế chung của EU */
  importCountry: string;
  /** Mã HS (6 số trở lên; khớp theo tiền tố dài nhất) */
  hs: string;
  /** Xuất xứ (ISO2) hoặc '*' = mọi xuất xứ */
  origin: string;
  rateType: 'MFN' | 'FTA';
  /** Tên hiệp định nếu là thuế ưu đãi */
  fta: string;
  dutyPct: number;
  /** VAT/GST %, null = chưa nhập */
  vatPct: number | null;
  /** Thuế khác (TTĐB, BVMT…) % trên (trị giá + thuế NK) */
  otherPct: number;
  /** Link hoặc số hiệu văn bản nguồn */
  source: string;
  effectiveDate: string;
  updatedAt: string;
  verified: boolean;
}

export interface TariffQuery {
  importCountry: string;
  hs: string;
  origin: string;
  /** Có C/O hợp lệ → ưu tiên thuế FTA */
  preferFta: boolean;
}

export interface TariffProvider {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly note?: string;
  lookup(q: TariffQuery): TariffEntry | null | Promise<TariffEntry | null>;
}

const digits = (s: string) => s.replace(/\D/g, '');

/** Chọn mức thuế phù hợp nhất: đúng nước nhập (hoặc 'EU'), tiền tố HS dài nhất, ưu tiên FTA đúng xuất xứ nếu có C/O */
export function matchTariff(entries: TariffEntry[], q: TariffQuery): TariffEntry | null {
  const hs = digits(q.hs);
  if (hs.length < 4) return null;
  let best: TariffEntry | null = null, bestScore = -1;
  for (const e of entries) {
    const countryOk = e.importCountry === q.importCountry || (e.importCountry === 'EU' && EU_SET.has(q.importCountry));
    const ehs = digits(e.hs);
    if (!countryOk || !ehs || !(hs.startsWith(ehs) || ehs.startsWith(hs))) continue;
    const originExact = e.origin === q.origin;
    if (e.origin !== '*' && e.origin !== '' && !originExact) continue;
    if (e.rateType === 'FTA' && !(q.preferFta && originExact)) continue;
    const score = Math.min(ehs.length, hs.length) * 10 + (e.importCountry === q.importCountry ? 3 : 0) + (e.rateType === 'FTA' ? 2 : 0) + (originExact ? 1 : 0);
    if (score > bestScore) { best = e; bestScore = score; }
  }
  return best;
}

export function createUserTariffProvider(entries: TariffEntry[]): TariffProvider {
  return { id: 'user', label: 'Biểu thuế tôi nhập', enabled: true, lookup: (q) => matchTariff(entries, q) };
}

/**
 * Các nguồn chính thức – CHƯA bật. Trước khi viết adapter phải kiểm tra tài liệu API hiện hành của từng nguồn.
 * Thứ tự ưu tiên: bảng người dùng nhập → nguồn chính thức theo nước → WTO → API landed cost trả phí.
 */
export const OFFICIAL_TARIFF_SOURCES: { id: string; label: string; url: string; enabled: boolean; note: string }[] = [
  { id: 'taric', label: 'EU TARIC', url: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp', enabled: false, note: 'Chưa có adapter – tra tay rồi nhập vào bảng' },
  { id: 'uk-tariff', label: 'UK Trade Tariff API', url: 'https://www.trade-tariff.service.gov.uk/', enabled: false, note: 'Chưa có adapter' },
  { id: 'us-hts', label: 'US HTS (USITC)', url: 'https://hts.usitc.gov/', enabled: false, note: 'Chưa có adapter' },
  { id: 'vn', label: 'Biểu thuế Việt Nam', url: 'https://www.customs.gov.vn/', enabled: false, note: 'Chưa có adapter' },
  { id: 'wto', label: 'WTO Tariff & Trade Data', url: 'https://ttd.wto.org/', enabled: false, note: 'Chưa có adapter – dữ liệu cập nhật chậm, phải ghi rõ năm' },
];

export const TARIFF_CSV_HEADER = ['import_country', 'hs', 'origin', 'rate_type', 'fta', 'duty_pct', 'vat_pct', 'other_pct', 'source', 'effective_date', 'updated_at', 'verified'];

export function parseTariffRows(rows: string[][]): { entries: TariffEntry[]; errors: string[] } {
  const recs = rowsToRecords(rows, {
    importCountry: ['import_country', 'nuoc nhap', 'country'],
    hs: ['ma hs', 'hs code', 'hscode'],
    origin: ['xuat xu'],
    rateType: ['rate_type', 'loai thue suat', 'loai'],
    fta: ['hiep dinh'],
    dutyPct: ['duty_pct', 'thue nk', 'thue nhap khau', 'duty'],
    vatPct: ['vat_pct', 'vat', 'gst'],
    otherPct: ['other_pct', 'thue khac'],
    source: ['nguon', 'link'],
    effectiveDate: ['effective_date', 'ngay hieu luc'],
    updatedAt: ['updated_at', 'ngay cap nhat'],
    verified: ['da xac minh'],
  });
  const entries: TariffEntry[] = [], errors: string[] = [];
  recs.forEach((r, i) => {
    const line = i + 2;
    const duty = toNumber(r.dutyPct);
    const cc = (r.importCountry ?? '').trim().toUpperCase();
    if (cc.length !== 2) return errors.push(`Dòng ${line}: nước nhập phải là mã 2 chữ (VN, DE, EU…)`);
    if (digits(r.hs ?? '').length < 4) return errors.push(`Dòng ${line}: mã HS không hợp lệ`);
    if (!isFinite(duty)) return errors.push(`Dòng ${line}: thiếu thuế suất`);
    if (!r.source) return errors.push(`Dòng ${line}: thiếu nguồn (bắt buộc)`);
    const updatedAt = toIsoDate(r.updatedAt);
    if (!updatedAt) return errors.push(`Dòng ${line}: thiếu ngày cập nhật (bắt buộc)`);
    const vat = toNumber(r.vatPct), other = toNumber(r.otherPct);
    const type = (r.rateType ?? '').toUpperCase().includes('FTA') || r.fta ? 'FTA' : 'MFN';
    entries.push({
      id: `${Date.now().toString(36)}-${i}`,
      importCountry: cc,
      hs: digits(r.hs!),
      origin: (r.origin ?? '*').trim().toUpperCase() || '*',
      rateType: type,
      fta: r.fta ?? '',
      dutyPct: duty,
      vatPct: isFinite(vat) ? vat : null,
      otherPct: isFinite(other) ? other : 0,
      source: r.source,
      effectiveDate: toIsoDate(r.effectiveDate),
      updatedAt,
      verified: /^(1|true|yes|x|co|có|da|đã)/i.test(r.verified ?? ''),
    });
  });
  return { entries, errors };
}
