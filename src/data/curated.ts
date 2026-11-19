import aCsv from './curated/A_2026-11-18.csv?raw';
import bCsv from './curated/B_2026-11-18.csv?raw';
import cCsv from './curated/C_2026-11-18.csv?raw';
import { parseCsv } from '../lib/csv';
import { parseChargeRows, parseMeasureRows } from '../lib/otherCharges';
import { parseTariffRows, resolveTariff, type TariffProvider } from '../providers/TariffProvider';

/**
 * DỮ LIỆU THUẾ ĐÃ TỔNG HỢP (gói "Dữ liệu thuế nhập khẩu – xuất xứ VN", ngày tra 2026-11-18) – xem curated/README_2026-11-18.md.
 *  A: thuế MFN/FTA theo MÃ QUỐC GIA (CA/MX/AU 8 số, JP 9 số, KR 10 số) cho 4 nhóm HS6: 090111, 610910, 640411, 940350. Giữ nguyên verified (22 dòng = 1, 83 dòng = 0).
 *  B: CHỈ CÓ TIÊU ĐỀ → phòng vệ thương mại "chưa kiểm tra" (KHÔNG phải 0).
 *  C: thuế/phí khác (VAT theo sản phẩm, thuế tiêu thụ đặc biệt Hàn Quốc, DTA Mexico, phí khai báo Úc…), có các khoản thay thế nhau.
 * Dữ liệu được đọc bằng đúng bộ đọc của trang Biểu thuế (không chỉnh tay số liệu).
 */
export const CURATED_DATE = '2026-11-18';
export const CURATED_LABEL = `Dữ liệu thuế đã tổng hợp (${CURATED_DATE.split('-').reverse().join('/')})`;

const a = parseTariffRows(parseCsv(aCsv));
export const CURATED_TARIFFS = a.entries.map((e, i) => ({ ...e, id: `curated-${e.importCountry}-${e.hs}-${e.origin}-${e.fta || 'MFN'}-${i}` }));
export const CURATED_TARIFF_ISSUES = [...a.errors, ...a.warnings];

const b = parseMeasureRows(parseCsv(bCsv));
export const CURATED_MEASURES = b.measures;

const c = parseChargeRows(parseCsv(cCsv));
export const CURATED_CHARGES = c.rules.map((r) => ({ ...r, id: `curated-${r.id}`, ...(r.ofId && { ofId: `curated-${r.ofId}` }) }));
export const CURATED_CHARGE_ISSUES = [...c.errors, ...c.warnings];

/** Xuất xứ có dòng ưu đãi FTA trong bảng A */
export const CURATED_ORIGINS = [...new Set(CURATED_TARIFFS.filter((e) => e.rateType === 'FTA').map((e) => e.origin))];
export const CURATED_COUNTRIES = [...new Set(CURATED_TARIFFS.map((e) => e.importCountry))];

export const curatedTariffProvider: TariffProvider & { origins: string[] } = {
  id: 'curated',
  label: CURATED_LABEL,
  enabled: true,
  origins: CURATED_ORIGINS,
  lookup: (q) => resolveTariff(CURATED_TARIFFS, q).entry,
  resolve: (q) => resolveTariff(CURATED_TARIFFS, q),
};
