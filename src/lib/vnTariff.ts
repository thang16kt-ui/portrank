import { EU_SET, stripAccents } from '../data/countries';

/**
 * Biểu thuế NHẬP KHẨU VIỆT NAM theo mã 8 số – nạp từ file Excel/CSV chính thức (biểu thuế XNK do Bộ Tài chính / Tổng cục Hải quan
 * công bố, gồm cột thuế NK ưu đãi (MFN), các cột thuế ưu đãi đặc biệt theo FTA, VAT, TTĐB, BVMT).
 * Máy chủ Hải quan VN không cho kết nối từ ngoài VN nên không tải tự động được → `npm run tariffs:vn -- <file>`.
 */

const ASEAN_OTHERS = ['BN', 'KH', 'ID', 'LA', 'MY', 'MM', 'PH', 'SG', 'TH'];
const EU = [...EU_SET];

/** Hiệp định → các nước xuất xứ được hưởng khi nhập vào Việt Nam. Khoá là tên cột đã bỏ dấu, viết liền, in hoa */
export const VN_FTA: Record<string, { label: string; origins: string[]; match: RegExp }> = {
  ACFTA: { label: 'ACFTA (ASEAN–Trung Quốc)', origins: ['CN', ...ASEAN_OTHERS], match: /ACFTA/ },
  ATIGA: { label: 'ATIGA (ASEAN)', origins: ASEAN_OTHERS, match: /ATIGA/ },
  AJCEP: { label: 'AJCEP (ASEAN–Nhật Bản)', origins: ['JP', ...ASEAN_OTHERS], match: /AJCEP/ },
  VJEPA: { label: 'VJEPA (Việt Nam–Nhật Bản)', origins: ['JP'], match: /VJEPA/ },
  AKFTA: { label: 'AKFTA (ASEAN–Hàn Quốc)', origins: ['KR', ...ASEAN_OTHERS], match: /AKFTA/ },
  VKFTA: { label: 'VKFTA (Việt Nam–Hàn Quốc)', origins: ['KR'], match: /VKFTA/ },
  AANZFTA: { label: 'AANZFTA (ASEAN–Úc–New Zealand)', origins: ['AU', 'NZ', ...ASEAN_OTHERS], match: /AANZFTA/ },
  AIFTA: { label: 'AIFTA (ASEAN–Ấn Độ)', origins: ['IN', ...ASEAN_OTHERS], match: /AIFTA/ },
  AHKFTA: { label: 'AHKFTA (ASEAN–Hồng Kông)', origins: ['HK', ...ASEAN_OTHERS], match: /AHKFTA/ },
  VCFTA: { label: 'VCFTA (Việt Nam–Chile)', origins: ['CL'], match: /VCFTA/ },
  VNEAEU: { label: 'VN–EAEU (Liên minh Kinh tế Á – Âu)', origins: ['RU', 'BY', 'KZ', 'AM', 'KG'], match: /EAEU/ },
  CPTPP: { label: 'CPTPP', origins: ['AU', 'BN', 'CA', 'CL', 'JP', 'MY', 'MX', 'NZ', 'PE', 'SG', 'GB'], match: /CPTPP/ },
  VNCU: { label: 'VN–Cuba', origins: ['CU'], match: /VNCU/ },
  EVFTA: { label: 'EVFTA (Việt Nam–EU)', origins: EU, match: /EVFTA/ },
  UKVFTA: { label: 'UKVFTA (Việt Nam–Anh)', origins: ['GB'], match: /UKVFTA/ },
  VNLAO: { label: 'Việt Nam–Lào', origins: ['LA'], match: /VNLAO|VLFTA|VIETLAO/ },
  RCEP: { label: 'RCEP', origins: ['AU', 'CN', 'JP', 'KR', 'NZ', ...ASEAN_OTHERS], match: /RCEP/ },
  VIFTA: { label: 'VIFTA (Việt Nam–Israel)', origins: ['IL'], match: /VIFTA/ },
};

/** File dữ liệu public/data/vn/tariff.json */
export interface VnTariffFile {
  source: string;
  fileName: string;
  importedAt: string;
  /** Thứ tự các cột FTA trong mỗi dòng */
  ftas: string[];
  /** mã 8 số → [mô tả, MFN, VAT, TTĐB, BVMT (chữ), ...thuế FTA theo `ftas` (null = không được hưởng)] */
  codes: Record<string, [string, number | null, number | null, number | null, string, ...(number | null)[]]>;
}

const norm = (s: unknown) => stripAccents(String(s ?? '')).toUpperCase().replace(/[^A-Z0-9%]/g, '');

/** "20" / "20%" / "0,5" → số; "*", "-", "" → null */
export function vnRate(v: unknown): number | null {
  const t = String(v ?? '').trim().replace('%', '').replace(',', '.');
  if (!t || /^[*\-–x]$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Đọc bảng (đã đọc từ Excel/CSV thành mảng dòng) → dữ liệu biểu thuế. Hàm thuần. */
export function parseVnTariffTable(rows: string[][], fileName = '', importedAt = new Date().toISOString().slice(0, 10)): { data: VnTariffFile; problems: string[] } {
  const problems: string[] = [];
  // dòng tiêu đề: có cột mã hàng; ghép thêm dòng trên (tiêu đề 2 tầng: "Thuế suất ưu đãi đặc biệt" / "ACFTA"…)
  let h = -1, heads: string[] = [];
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const cand = rows[r].map((c, i) => norm(rows[r - 1]?.[i]) + norm(c));
    if (cand.some((x) => /MAHANG|MAHS|HSCODE|MASOHANG/.test(x))) {
      h = r;
      heads = cand;
      break;
    }
  }
  const empty: VnTariffFile = { source: '', fileName, importedAt, ftas: [], codes: {} };
  if (h < 0) return { data: empty, problems: ['Không tìm thấy dòng tiêu đề có cột "Mã hàng" / "Mã HS".'] };
  const col = (re: RegExp, not?: RegExp) => heads.findIndex((x) => re.test(x) && !(not && not.test(x)));
  const cCode = col(/MAHANG|MAHS|HSCODE|MASOHANG/);
  const cDesc = col(/MOTA/);
  const cMfn = col(/MFN|THUESUATUUDAI|THUENKUUDAI|NHAPKHAUUUDAI|UUDAI/, /DACBIET|THONGTHUONG|[A-Z]FTA|ATIGA|CPTPP|RCEP|EVFTA|AJCEP|VJEPA|EAEU/);
  const cVat = col(/VAT|GTGT/);
  const cExcise = col(/TTDB|TIEUTHUDACBIET/);
  const cEnv = col(/BVMT|BAOVEMOITRUONG/);
  const ftaCols = Object.entries(VN_FTA)
    .map(([k, f]) => ({ k, c: heads.findIndex((x) => f.match.test(x)) }))
    .filter((x) => x.c >= 0);
  if (cMfn < 0) problems.push('Không thấy cột thuế NK ưu đãi (MFN).');
  if (!ftaCols.length) problems.push('Không thấy cột thuế ưu đãi đặc biệt theo FTA nào (ACFTA, ATIGA, EVFTA, CPTPP, RCEP…).');
  const data: VnTariffFile = { source: 'Biểu thuế xuất nhập khẩu Việt Nam (file nạp)', fileName, importedAt, ftas: ftaCols.map((x) => x.k), codes: {} };
  for (const row of rows.slice(h + 1)) {
    const code = String(row[cCode] ?? '').replace(/\D/g, '');
    if (code.length !== 8) continue;
    data.codes[code] = [
      String(row[cDesc] ?? '').trim().slice(0, 160),
      cMfn >= 0 ? vnRate(row[cMfn]) : null,
      cVat >= 0 ? vnRate(row[cVat]) : null,
      cExcise >= 0 ? vnRate(row[cExcise]) : null,
      cEnv >= 0 ? String(row[cEnv] ?? '').trim() : '',
      ...ftaCols.map((x) => vnRate(row[x.c])),
    ];
  }
  if (!Object.keys(data.codes).length) problems.push('Không có dòng nào có mã hàng 8 số.');
  return { data, problems };
}

/** Các FTA mà hàng xuất xứ `origin` được hưởng cho một dòng, thấp nhất trước */
export function vnPreferences(file: VnTariffFile, code: string, origin: string): { key: string; label: string; pct: number }[] {
  const row = file.codes[code];
  if (!row) return [];
  return file.ftas
    .map((k, i) => ({ key: k, label: VN_FTA[k]?.label ?? k, pct: row[5 + i] as number | null, origins: VN_FTA[k]?.origins ?? [] }))
    .filter((x) => x.pct != null && x.origins.includes(origin))
    .map(({ key, label, pct }) => ({ key, label, pct: pct! }))
    .sort((a, b) => a.pct - b.pct);
}
