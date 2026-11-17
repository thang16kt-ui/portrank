/**
 * Chuẩn mã HS 6 số (HS 2022 của WCO) – mã chung cho mọi nước.
 * Mã quốc gia (8–10 số) = HS6 + phần mở rộng riêng của từng nước. Thuế toàn cầu (WITS/TRAINS) tra theo HS6;
 * nguồn chính thức (Anh, Mỹ) tra theo mã quốc gia.
 * Danh mục: public/data/hs6.json – tạo bởi `npm run tariffs:update` từ GitHub datasets/harmonized-system.
 */

export interface HsCatalog {
  version: string;
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  /** [mã 2/4/6 số, mô tả tiếng Anh] */
  items: [string, string][];
}

export interface HsIndex {
  catalog: HsCatalog;
  byCode: Map<string, string>;
  hs6: [string, string][];
}

export const hsDigits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** Mã HS6 chuẩn của một mã bất kỳ (6–10 số); rỗng nếu chưa đủ 6 số */
export const hs6Of = (code: string | null | undefined) => {
  const d = hsDigits(code);
  return d.length >= 6 ? d.slice(0, 6) : '';
};

/** 6109100012 → 6109.10.00.12 */
export const fmtHsCode = (code: string) => {
  const d = hsDigits(code);
  return d.length <= 4 ? d : [d.slice(0, 4), ...(d.slice(4).match(/.{1,2}/g) ?? [])].join('.');
};

export function indexHs(catalog: HsCatalog): HsIndex {
  return { catalog, byCode: new Map(catalog.items), hs6: catalog.items.filter(([c]) => c.length === 6) };
}

export interface HsInfo {
  input: string;
  hs6: string;
  /** Phần mở rộng quốc gia (sau 6 số đầu) */
  national: string;
  valid: boolean;
  chapter?: string;
  heading?: string;
  subheading?: string;
  problem?: string;
}

/** Kiểm tra mã theo chuẩn HS6 và lấy mô tả chương / nhóm / phân nhóm */
export function describeHs(idx: HsIndex, input: string): HsInfo {
  const d = hsDigits(input);
  const hs6 = hs6Of(d);
  const base: HsInfo = { input: d, hs6, national: d.slice(6), valid: false };
  if (d.length < 6) return { ...base, problem: d ? `Cần ít nhất 6 số (hiện có ${d.length}) – mã HS6 là chuẩn chung của mọi nước.` : undefined };
  if (d.length > 10) return { ...base, problem: 'Mã HS tối đa 10 số.' };
  const chapter = idx.byCode.get(d.slice(0, 2)), heading = idx.byCode.get(d.slice(0, 4)), subheading = idx.byCode.get(hs6);
  if (!subheading)
    return { ...base, chapter, heading, problem: heading ? `Nhóm ${d.slice(0, 4)} có trong ${idx.catalog.version} nhưng không có phân nhóm ${fmtHsCode(hs6)} – chọn mã gợi ý bên dưới.` : `Không có mã ${fmtHsCode(hs6)} trong ${idx.catalog.version}.` };
  return { ...base, valid: true, chapter, heading, subheading };
}

/** Gợi ý mã HS6: gõ số → khớp tiền tố; gõ chữ (tiếng Anh) → khớp mọi từ trong mô tả */
export function searchHs(idx: HsIndex, query: string, limit = 8): { code: string; desc: string; heading?: string }[] {
  const q = query.trim();
  if (!q) return [];
  const d = hsDigits(q);
  let hits: [string, string][];
  if (/^[\d.\s]+$/.test(q)) {
    if (d.length < 2) return [];
    hits = idx.hs6.filter(([c]) => c.startsWith(d.slice(0, 6)));
  } else {
    const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
    if (!words.length) return [];
    hits = idx.hs6
      .map(([c, desc]) => {
        const full = `${idx.byCode.get(c.slice(0, 4)) ?? ''} ${desc}`.toLowerCase();
        return { c, desc, ok: words.every((w) => full.includes(w)), score: words.filter((w) => desc.toLowerCase().includes(w)).length };
      })
      .filter((x) => x.ok)
      .sort((a, b) => b.score - a.score)
      .map((x) => [x.c, x.desc] as [string, string]);
  }
  return hits.slice(0, limit).map(([code, desc]) => ({ code, desc, heading: idx.byCode.get(code.slice(0, 4)) }));
}

let loading: Promise<HsIndex> | null = null;
/** Tải danh mục chuẩn (một lần, ~800 KB, nén ~200 KB) */
export function loadHsIndex(): Promise<HsIndex> {
  if (!loading) {
    const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    loading = fetch(`${base}data/hs6.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<HsCatalog>;
      })
      .then(indexHs);
    loading.catch(() => (loading = null));
  }
  return loading;
}
