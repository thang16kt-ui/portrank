import type { Booker, CargoType, CostLine, CostSegment, Incoterm, Party, Port, Role } from '../types';

export const SEGMENTS = ['Kho người bán', 'Cảng đi', 'Trên tàu', 'Cảng đến', 'Kho người mua'] as const;

export interface IncotermSpec {
  code: Incoterm;
  name: string;
  /** Ai trả phí ở từng chặng 0..4 */
  payer: [Party, Party, Party, Party, Party];
  /**
   * Điểm chuyển rủi ro, đo theo vị trí trên thanh 0..5
   * (0 = tại kho người bán, 1 = giao cho người vận tải tại cảng đi, 1.5 = hàng lên tàu, 4 = tại kho người mua…)
   */
  riskAt: number;
  riskLabel: string;
  /** Địa điểm chỉ định */
  place: 'pol' | 'pod' | 'seller' | 'buyer';
  seaOnly: boolean;
  note: string;
}

const S: Party = 'seller', B: Party = 'buyer';

export const INCOTERMS: Record<Incoterm, IncotermSpec> = {
  EXW: { code: 'EXW', name: 'Giao tại xưởng', payer: [B, B, B, B, B], riskAt: 0, riskLabel: 'Tại kho người bán', place: 'seller', seaOnly: false, note: 'Người mua lo mọi thứ, kể cả thông quan xuất khẩu.' },
  FCA: { code: 'FCA', name: 'Giao cho người chuyên chở', payer: [S, S, B, B, B], riskAt: 1, riskLabel: 'Giao cho người vận tải tại cảng đi', place: 'pol', seaOnly: false, note: 'Khuyến nghị cho hàng container. Người bán thông quan xuất khẩu và giao hàng tại bãi/CFS cảng đi.' },
  FOB: { code: 'FOB', name: 'Giao lên tàu', payer: [S, S, B, B, B], riskAt: 1.5, riskLabel: 'Hàng đã xếp lên tàu tại cảng đi', place: 'pol', seaOnly: true, note: 'Chỉ dùng cho vận tải biển / thủy nội địa, phù hợp hàng rời hoặc hàng quá khổ.' },
  CFR: { code: 'CFR', name: 'Tiền hàng và cước', payer: [S, S, S, B, B], riskAt: 1.5, riskLabel: 'Hàng đã xếp lên tàu tại cảng đi', place: 'pod', seaOnly: true, note: 'Người bán trả cước tới cảng đến nhưng rủi ro chuyển khi hàng lên tàu.' },
  CIF: { code: 'CIF', name: 'Tiền hàng, bảo hiểm và cước', payer: [S, S, S, B, B], riskAt: 1.5, riskLabel: 'Hàng đã xếp lên tàu tại cảng đi', place: 'pod', seaOnly: true, note: 'Như CFR + người bán mua bảo hiểm tối thiểu (ICC C).' },
  CPT: { code: 'CPT', name: 'Cước phí trả tới', payer: [S, S, S, B, B], riskAt: 1, riskLabel: 'Giao cho người vận tải đầu tiên', place: 'pod', seaOnly: false, note: 'Người bán trả cước tới nơi đến, rủi ro chuyển khi giao cho người vận tải đầu tiên.' },
  CIP: { code: 'CIP', name: 'Cước phí và bảo hiểm trả tới', payer: [S, S, S, B, B], riskAt: 1, riskLabel: 'Giao cho người vận tải đầu tiên', place: 'pod', seaOnly: false, note: 'Như CPT + người bán mua bảo hiểm mức cao (ICC A) theo Incoterms 2020.' },
  DAP: { code: 'DAP', name: 'Giao tại nơi đến', payer: [S, S, S, S, B], riskAt: 4, riskLabel: 'Tại nơi đến, chưa dỡ hàng', place: 'buyer', seaOnly: false, note: 'Người bán chịu mọi chi phí/rủi ro tới nơi đến; người mua dỡ hàng và nộp thuế nhập khẩu.' },
  DPU: { code: 'DPU', name: 'Giao tại nơi đến đã dỡ', payer: [S, S, S, S, B], riskAt: 4.5, riskLabel: 'Tại nơi đến, đã dỡ hàng', place: 'buyer', seaOnly: false, note: 'Như DAP nhưng người bán dỡ hàng.' },
  DDP: { code: 'DDP', name: 'Giao đã nộp thuế', payer: [S, S, S, S, S], riskAt: 5, riskLabel: 'Tại kho người mua, đã thông quan', place: 'buyer', seaOnly: false, note: 'Người bán lo cả thuế nhập khẩu – cần có đại diện tại nước nhập.' },
};

export interface IncotermSuggestion {
  primary: Incoterm;
  alternatives: Incoterm[];
  placeLabel: string;
  reason: string;
}

/**
 * Gợi ý Incoterm 2020 theo vai trò, bên book tàu và loại hàng.
 * Hàng container → ưu tiên FCA/CPT/CIP (khuyến nghị ICC). FOB/CFR/CIF chỉ cho hàng quá khổ/hàng rời.
 */
export function suggestIncoterm(role: Role, booker: Booker, cargo: CargoType, pol: Port, pod: Port): IncotermSuggestion {
  const seaTerms = cargo === 'oog';
  const sellerBooks = (role === 'seller' && booker === 'me') || (role === 'buyer' && booker === 'other');
  if (sellerBooks) {
    if (role === 'seller') {
      const primary: Incoterm = seaTerms ? 'CFR' : 'CPT';
      return {
        primary,
        alternatives: seaTerms ? ['CIF', 'DAP'] : ['CIP', 'DAP'],
        placeLabel: `${primary} ${pod.name}`,
        reason: `Bạn là người bán và tự book tàu → bạn kiểm soát cước tới ${pod.name}. ${seaTerms ? 'Hàng quá khổ/không đóng container kín nên có thể dùng nhóm điều kiện đường biển (CFR/CIF).' : 'Hàng container nên dùng CPT/CIP thay cho CFR/CIF (rủi ro chuyển khi giao cho người vận tải, không phải khi lên tàu).'} Chọn DAP nếu giao tận kho người mua.`,
      };
    }
    const primary: Incoterm = seaTerms ? 'CIF' : 'CIP';
    return {
      primary,
      alternatives: seaTerms ? ['CFR', 'DAP', 'DDP'] : ['CPT', 'DAP', 'DDP'],
      placeLabel: `${primary} ${pod.name}`,
      reason: `Bạn là người mua, người bán book tàu → người bán trả cước và bảo hiểm tới ${pod.name}. ${seaTerms ? 'Hàng quá khổ có thể dùng CIF.' : 'CIP buộc người bán mua bảo hiểm mức ICC (A).'} Chọn DAP/DDP nếu muốn nhận hàng tại kho.`,
    };
  }
  const primary: Incoterm = seaTerms ? 'FOB' : 'FCA';
  return {
    primary,
    alternatives: seaTerms ? ['FCA', 'EXW'] : ['FOB', 'EXW'],
    placeLabel: `${primary} ${pol.name}`,
    reason:
      role === 'seller'
        ? `Bạn là người bán, người mua book tàu → bạn giao hàng cho hãng tàu do người mua chỉ định tại ${pol.name}. ${seaTerms ? 'Hàng quá khổ xếp trực tiếp lên tàu nên dùng FOB.' : 'Hàng container nên dùng FCA thay FOB.'}`
        : `Bạn là người mua và tự book tàu → nhận hàng tại ${pol.name}. ${seaTerms ? 'Hàng quá khổ có thể dùng FOB.' : 'FCA giúp người bán vẫn thông quan xuất khẩu, rủi ro chuyển khi giao cho hãng tàu.'}`,
  };
}

/** Bên chịu phí của 1 dòng chi phí theo Incoterm */
export const payerOf = (inc: Incoterm, segment: CostSegment): Party => INCOTERMS[inc].payer[segment];

export function splitCosts(inc: Incoterm, lines: CostLine[]) {
  let seller = 0, buyer = 0;
  for (const l of lines) (payerOf(inc, l.segment) === 'seller' ? (seller += l.amount) : (buyer += l.amount));
  return { seller, buyer };
}

export const PARTY_LABEL: Record<Party, string> = { seller: 'Người bán', buyer: 'Người mua' };
