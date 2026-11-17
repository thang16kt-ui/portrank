import { COST_ITEMS, GROUP_C, INCOTERMS, type ItemNo } from '../config/incoterms';
import type { CargoType, Incoterm, Role, TransportMode } from '../types';

export interface SplitOptions {
  /** Nhóm C: tính phí cảng đến (khoản 7) cho người bán – mặc định người mua trả */
  destChargesBySeller?: boolean;
}

/** Tỷ lệ (0..1) người bán trả cho khoản n theo điều kiện `term` */
export function sellerShare(term: Incoterm, n: ItemNo, opts: SplitOptions = {}): number {
  if (n === 7 && opts.destChargesBySeller && GROUP_C.includes(term)) return 1;
  return INCOTERMS[term].sellerPays[n] ?? 0;
}

export interface ItemAmount {
  n: ItemNo;
  amount: number | null;
}

export interface Split {
  seller: number;
  buyer: number;
  /** Phần của người dùng (theo vai trò) và của bên kia */
  you: number;
  other: number;
  perItem: { n: ItemNo; amount: number; sellerShare: number; seller: number; buyer: number }[];
}

/** Chia 10 khoản chi phí giữa người bán / người mua. Khoản chưa tính (null) coi như 0. */
export function splitItems(items: ItemAmount[], term: Incoterm, role: Role, opts: SplitOptions = {}): Split {
  let seller = 0, buyer = 0;
  const perItem = items.map((it) => {
    const amount = it.amount ?? 0;
    const sh = sellerShare(term, it.n, opts);
    seller += amount * sh;
    buyer += amount * (1 - sh);
    return { n: it.n, amount, sellerShare: sh, seller: amount * sh, buyer: amount * (1 - sh) };
  });
  return { seller, buyer, you: role === 'seller' ? seller : buyer, other: role === 'seller' ? buyer : seller, perItem };
}

export interface PlaceNames {
  /** Nơi của người bán (địa chỉ hoặc nước) */
  origin: string;
  /** Cảng đi / bãi giao hàng */
  portO: string;
  /** Cảng đến / bãi đến */
  portD: string;
  /** Nơi của người mua */
  dest: string;
}

/** Địa điểm ghi kèm điều kiện, vd "CIP Cái Mép", "FCA Hamburg" */
export function namedPlace(term: Incoterm, names: PlaceNames): string {
  const k = INCOTERMS[term].place;
  return k === 'origin' ? names.origin : k === 'pol' ? names.portO : k === 'pod' ? names.portD : names.dest;
}

/** Câu "Rủi ro chuyển giao khi nào" – chèn tên địa điểm thật và đổi từ theo phương thức */
export function riskTransferText(term: Incoterm, mode: TransportMode, names?: Partial<PlaceNames>): string {
  const sea = mode === 'sea';
  const paren = (s?: string) => (s ? ` (${s})` : '');
  let t = INCOTERMS[term].riskTransfer
    .replace('{carrier}', sea ? 'hãng vận tải (hãng tàu)' : 'nhà xe')
    .replace('{origin}', paren(names?.origin))
    .replace('{dest}', paren(names?.dest))
    .replace('{portO}', sea ? `cảng đi${names?.portO ? ' ' + names.portO : ''}` : `bãi giao hàng / cửa khẩu${paren(names?.portO)}`)
    .replace('{portD}', sea ? `cảng đến${names?.portD ? ' ' + names.portD : ''}` : `nơi đến${paren(names?.portD)}`);
  if (!sea) t = t.replace(/trên tàu/g, 'trên xe').replace(/hãng tàu/g, 'nhà xe');
  return t;
}

/** Kiểm tra dữ liệu: vị trí cắt chi phí khớp với ma trận phân chia (dùng trong unit test) */
export function costCutMatchesMatrix(term: Incoterm): boolean {
  const def = INCOTERMS[term];
  return COST_ITEMS.filter((c) => c.span).every((c) => {
    const [a, b] = c.span!;
    const sh = def.sellerPays[c.n] ?? 0;
    if (sh === 1) return b <= def.costAt;
    if (sh === 0) return a >= def.costAt;
    return a < def.costAt && def.costAt < b;
  });
}

export interface IncotermSuggestion {
  term: Incoterm;
  reason: string;
  alternatives: Incoterm[];
}

/** Gợi ý theo vai trò, loại hàng, phương thức và việc ai muốn tự book vận tải chặng chính */
export function suggestIncoterm(role: Role, iBook: boolean, cargo: CargoType, mode: TransportMode): IncotermSuggestion {
  const sellerBooks = (role === 'seller') === iBook;
  const bulkLike = mode === 'sea' && cargo === 'oog';
  const who = role === 'seller' ? 'Bạn là người bán' : 'Bạn là người mua';
  if (sellerBooks) {
    if (bulkLike) return { term: 'CIF', alternatives: ['CFR', 'DAP'], reason: `${who}, người bán book tàu, hàng quá khổ không đóng container → CIF (có bảo hiểm) hoặc CFR.` };
    return { term: 'CIP', alternatives: ['CPT', 'DAP'], reason: `${who}, người bán book vận tải chặng chính, hàng ${mode === 'sea' ? 'container' : 'đi đường bộ'} → CIP (người bán mua bảo hiểm mức cao nhất). Muốn người bán giao tận nơi thì chọn DAP.` };
  }
  if (bulkLike) return { term: 'FOB', alternatives: ['FAS', 'FCA'], reason: `${who}, người mua book tàu, hàng quá khổ xếp thẳng lên tàu → FOB.` };
  return { term: 'FCA', alternatives: ['EXW', 'FOB'], reason: `${who}, người mua tự book vận tải chặng chính → FCA (ICC khuyến nghị thay FOB cho hàng container; người bán vẫn làm thủ tục xuất).` };
}

export const PARTY_LABEL = { seller: 'Người bán', buyer: 'Người mua' } as const;
