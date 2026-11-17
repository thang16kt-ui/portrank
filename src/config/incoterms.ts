import type { Incoterm, TransportMode } from '../types';

/**
 * Incoterms® 2020 (ICC) – toàn bộ ở dạng DATA. Sơ đồ, dải 10 ô, hoạt ảnh đều sinh từ file này.
 * Số trong `sellerPays` là các khoản NGƯỜI BÁN trả (1 = trả hết, 0.5 = một phần); còn lại người mua trả.
 */

export type ItemNo = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface CostItemDef {
  n: ItemNo;
  label: Record<TransportMode, string>;
  short: Record<TransportMode, string>;
  /** Khoảng trên chuỗi vận tải (0–100%). Khoản 6 (bảo hiểm) và 8 (thuế) không nằm trên chuỗi. */
  span?: [number, number];
}

export const COST_ITEMS: CostItemDef[] = [
  { n: 1, label: { sea: 'Bốc hàng tại kho người bán', road: 'Bốc hàng tại kho người bán' }, short: { sea: 'Bốc hàng', road: 'Bốc hàng' }, span: [0, 5] },
  { n: 2, label: { sea: 'Vận tải nội địa nước xuất', road: 'Gom hàng kho → bãi giao hàng' }, short: { sea: 'Nội địa xuất', road: 'Gom hàng' }, span: [5, 20] },
  { n: 3, label: { sea: 'Thông quan xuất khẩu', road: 'Thông quan xuất khẩu' }, short: { sea: 'TQ xuất', road: 'TQ xuất' }, span: [20, 24] },
  { n: 4, label: { sea: 'Phí cảng đi (THC…)', road: 'Phí cửa khẩu phía xuất' }, short: { sea: 'Cảng đi', road: 'CK xuất' }, span: [24, 33] },
  { n: 5, label: { sea: 'Cước biển + phụ phí', road: 'Cước xe chặng chính' }, short: { sea: 'Cước biển', road: 'Cước xe' }, span: [33, 70] },
  { n: 6, label: { sea: 'Bảo hiểm hàng hóa', road: 'Bảo hiểm hàng hóa' }, short: { sea: 'Bảo hiểm', road: 'Bảo hiểm' } },
  { n: 7, label: { sea: 'Phí cảng đến (THC…)', road: 'Phí cửa khẩu phía nhập' }, short: { sea: 'Cảng đến', road: 'CK nhập' }, span: [70, 80] },
  { n: 8, label: { sea: 'Thông quan nhập + thuế NK + VAT', road: 'Thông quan nhập + thuế NK + VAT' }, short: { sea: 'TQ nhập + thuế', road: 'TQ nhập + thuế' } },
  { n: 9, label: { sea: 'Vận tải nội địa nước nhập', road: 'Giao hàng bãi đến → kho' }, short: { sea: 'Nội địa nhập', road: 'Giao hàng' }, span: [80, 96] },
  { n: 10, label: { sea: 'Dỡ hàng tại kho người mua', road: 'Dỡ hàng tại kho người mua' }, short: { sea: 'Dỡ hàng', road: 'Dỡ hàng' }, span: [96, 100] },
];

/** 5 trạm của chuỗi vận tải + vị trí (%) trên sơ đồ */
export const STATIONS: Record<TransportMode, { label: string; at: number; icon: string }[]> = {
  sea: [
    { label: 'Kho người bán', at: 3, icon: 'factory' },
    { label: 'Cảng đi', at: 27, icon: 'crane' },
    { label: 'Tàu', at: 51, icon: 'ship' },
    { label: 'Cảng đến', at: 75, icon: 'crane' },
    { label: 'Kho người mua', at: 97, icon: 'warehouse' },
  ],
  road: [
    { label: 'Kho người bán', at: 3, icon: 'factory' },
    { label: 'Bãi giao hàng', at: 27, icon: 'yard' },
    { label: 'Cửa khẩu', at: 51, icon: 'gate' },
    { label: 'Bãi đến', at: 75, icon: 'yard' },
    { label: 'Kho người mua', at: 97, icon: 'warehouse' },
  ],
};

export type NamedPlace = 'origin' | 'pol' | 'pod' | 'dest';

export interface IncotermDef {
  code: Incoterm;
  nameVi: string;
  /** 'any' = mọi phương thức; 'sea' = chỉ đường biển & thủy nội địa */
  group: 'any' | 'sea';
  sellerPays: Partial<Record<ItemNo, number>>;
  /** Điểm người bán hết trả chi phí vận tải (% chuỗi) */
  costAt: number;
  /** Điểm chuyển rủi ro (% chuỗi) */
  riskAt: number;
  /** Địa điểm ghi kèm điều kiện (FCA [cảng đi], CIP [cảng đến], DAP [nơi đến]…) */
  place: NamedPlace;
  exportClearance: 'seller' | 'buyer';
  importClearance: 'seller' | 'buyer';
  insurance: { by: 'seller' | 'none'; level?: string };
  /** Câu "Rủi ro chuyển giao khi nào" – có chỗ chèn {origin} {portO} {portD} {dest} {carrier} {vessel} */
  riskTransfer: string;
  summary: string;
  keyPoints: [string, string, string];
}

const d = (x: IncotermDef) => x;

export const INCOTERM_ORDER: Incoterm[] = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];

export const INCOTERMS: Record<Incoterm, IncotermDef> = {
  EXW: d({
    code: 'EXW', nameVi: 'Giao tại xưởng', group: 'any', sellerPays: {}, costAt: 0, riskAt: 0, place: 'origin',
    exportClearance: 'buyer', importClearance: 'buyer', insurance: { by: 'none' },
    riskTransfer: 'Người bán đặt hàng sẵn sàng tại kho của mình{origin}, hàng chưa bốc lên xe.',
    summary: 'Người bán chỉ cần chuẩn bị hàng tại kho; người mua lo toàn bộ vận tải, thủ tục và rủi ro.',
    keyPoints: [
      'Người mua phải tự làm thủ tục xuất khẩu ở nước người bán.',
      'Người bán không có nghĩa vụ bốc hàng lên xe.',
      'Trách nhiệm người bán thấp nhất trong 11 điều kiện.',
    ],
  }),
  FCA: d({
    code: 'FCA', nameVi: 'Giao cho người chuyên chở', group: 'any', sellerPays: { 1: 1, 2: 1, 3: 1 }, costAt: 24, riskAt: 24, place: 'pol',
    exportClearance: 'seller', importClearance: 'buyer', insurance: { by: 'none' },
    riskTransfer:
      'Người bán giao hàng cho {carrier} do người mua chỉ định. Giao tại kho người bán: sau khi hàng đã bốc lên xe. Giao tại {portO}: khi xe chở tới nơi, hàng chưa dỡ xuống.',
    summary: 'Người bán thông quan xuất và giao hàng cho người chuyên chở của người mua; người mua trả cước chính.',
    keyPoints: [
      'ICC khuyến nghị dùng thay FOB cho hàng container.',
      'Người bán làm thủ tục xuất khẩu; người mua chỉ định và trả tiền người chuyên chở.',
      'Phải ghi rõ địa điểm giao hàng vì nó quyết định ai bốc/dỡ.',
    ],
  }),
  FAS: d({
    code: 'FAS', nameVi: 'Giao dọc mạn tàu', group: 'sea', sellerPays: { 1: 1, 2: 1, 3: 1, 4: 0.5 }, costAt: 28, riskAt: 28, place: 'pol',
    exportClearance: 'seller', importClearance: 'buyer', insurance: { by: 'none' },
    riskTransfer: 'Hàng được đặt dọc mạn tàu tại {portO}.',
    summary: 'Người bán đưa hàng đến dọc mạn tàu tại cảng đi; từ đó người mua chịu chi phí và rủi ro.',
    keyPoints: [
      'Chỉ dùng cho đường biển và thủy nội địa; hợp với hàng rời, hàng siêu trường siêu trọng.',
      'Người mua chịu chi phí xếp hàng lên tàu.',
      'Không phù hợp với hàng container (giao tại bãi, không giao dọc mạn tàu).',
    ],
  }),
  FOB: d({
    code: 'FOB', nameVi: 'Giao hàng trên tàu', group: 'sea', sellerPays: { 1: 1, 2: 1, 3: 1, 4: 1 }, costAt: 33, riskAt: 33, place: 'pol',
    exportClearance: 'seller', importClearance: 'buyer', insurance: { by: 'none' },
    riskTransfer: 'Hàng đã nằm trên tàu tại {portO}.',
    summary: 'Người bán chịu mọi chi phí đến khi hàng lên tàu; người mua trả cước biển và chịu rủi ro từ đó.',
    keyPoints: [
      'Chỉ thật sự hợp với hàng rời, hàng không đóng container.',
      'Với container, hàng nằm ở bãi nhiều ngày trước khi lên tàu trong khi rủi ro vẫn thuộc người bán.',
      'Người mua tự book tàu và trả cước biển.',
    ],
  }),
  CFR: d({
    code: 'CFR', nameVi: 'Tiền hàng và cước phí', group: 'sea', sellerPays: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }, costAt: 70, riskAt: 33, place: 'pod',
    exportClearance: 'seller', importClearance: 'buyer', insurance: { by: 'none' },
    riskTransfer: 'Hàng đã nằm trên tàu tại {portO}, dù người bán trả cước đến {portD}.',
    summary: 'Người bán trả cước biển đến cảng đến, nhưng rủi ro đã chuyển cho người mua từ khi hàng lên tàu.',
    keyPoints: [
      'Điểm chuyển rủi ro (cảng đi) khác điểm người bán hết trả cước (cảng đến).',
      'Người bán không có nghĩa vụ mua bảo hiểm – người mua nên tự mua.',
      'Chỉ dùng cho đường biển; với container nên dùng CPT.',
    ],
  }),
  CIF: d({
    code: 'CIF', nameVi: 'Tiền hàng, bảo hiểm và cước phí', group: 'sea', sellerPays: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 }, costAt: 70, riskAt: 33, place: 'pod',
    exportClearance: 'seller', importClearance: 'buyer', insurance: { by: 'seller', level: 'mức tối thiểu (ICC C)' },
    riskTransfer: 'Hàng đã nằm trên tàu tại {portO}, dù người bán trả cước và bảo hiểm đến {portD}.',
    summary: 'Như CFR nhưng người bán mua thêm bảo hiểm mức tối thiểu cho người mua thụ hưởng.',
    keyPoints: [
      'Người bán trả cước đến cảng đến nhưng rủi ro đã chuyển từ cảng đi.',
      'Bảo hiểm chỉ ở mức tối thiểu (ICC C) – muốn cao hơn phải thỏa thuận.',
      'Chỉ dùng cho đường biển; với container nên dùng CIP.',
    ],
  }),
  CPT: d({
    code: 'CPT', nameVi: 'Cước phí trả tới', group: 'any', sellerPays: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }, costAt: 70, riskAt: 24, place: 'pod',
    exportClearance: 'seller', importClearance: 'buyer', insurance: { by: 'none' },
    riskTransfer: 'Người bán giao hàng cho {carrier} đầu tiên, dù người bán trả cước đến {portD}.',
    summary: 'Người bán trả cước đến nơi đến đã thỏa thuận; rủi ro chuyển ngay khi giao cho người chuyên chở đầu tiên.',
    keyPoints: [
      'Rủi ro chuyển rất sớm – khi giao cho người chuyên chở đầu tiên, không phải khi hàng đến nơi.',
      'Dùng được cho mọi phương thức, phù hợp hàng container.',
      'Người bán không có nghĩa vụ mua bảo hiểm.',
    ],
  }),
  CIP: d({
    code: 'CIP', nameVi: 'Cước phí và bảo hiểm trả tới', group: 'any', sellerPays: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 }, costAt: 70, riskAt: 24, place: 'pod',
    exportClearance: 'seller', importClearance: 'buyer', insurance: { by: 'seller', level: 'mức cao nhất (ICC A)' },
    riskTransfer: 'Người bán giao hàng cho {carrier} đầu tiên, dù người bán trả cước và bảo hiểm đến {portD}.',
    summary: 'Như CPT nhưng người bán phải mua bảo hiểm mọi rủi ro (ICC A) cho người mua thụ hưởng.',
    keyPoints: [
      'Giống CPT nhưng người bán phải mua bảo hiểm mức cao nhất (ICC A).',
      'Rủi ro vẫn chuyển từ khi giao cho người chuyên chở đầu tiên.',
      'Là lựa chọn ICC khuyến nghị thay CIF cho hàng container.',
    ],
  }),
  DAP: d({
    code: 'DAP', nameVi: 'Giao tại nơi đến', group: 'any', sellerPays: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 7: 1, 9: 1 }, costAt: 96, riskAt: 96, place: 'dest',
    exportClearance: 'seller', importClearance: 'buyer', insurance: { by: 'none' },
    riskTransfer: 'Hàng đến nơi đến{dest}, còn trên phương tiện, sẵn sàng để dỡ.',
    summary: 'Người bán đưa hàng tới nơi đến; người mua thông quan nhập, nộp thuế và dỡ hàng.',
    keyPoints: [
      'Người mua tự thông quan nhập khẩu và nộp thuế.',
      'Người bán không dỡ hàng khỏi phương tiện.',
      'Người bán chịu rủi ro suốt chặng vận chuyển nên thường tự mua bảo hiểm.',
    ],
  }),
  DPU: d({
    code: 'DPU', nameVi: 'Giao tại nơi đến đã dỡ hàng', group: 'any', sellerPays: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 7: 1, 9: 1, 10: 1 }, costAt: 100, riskAt: 100, place: 'dest',
    exportClearance: 'seller', importClearance: 'buyer', insurance: { by: 'none' },
    riskTransfer: 'Hàng đã được dỡ xong khỏi phương tiện tại nơi đến{dest}.',
    summary: 'Điều kiện duy nhất mà người bán phải dỡ hàng tại nơi đến; người mua thông quan nhập và nộp thuế.',
    keyPoints: [
      'Điều kiện duy nhất yêu cầu người bán dỡ hàng tại nơi đến.',
      'Người mua vẫn tự thông quan nhập khẩu và nộp thuế.',
      'Cần chắc chắn người bán dỡ được hàng tại địa điểm đã chọn.',
    ],
  }),
  DDP: d({
    code: 'DDP', nameVi: 'Giao đã nộp thuế', group: 'any', sellerPays: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 7: 1, 8: 1, 9: 1 }, costAt: 96, riskAt: 96, place: 'dest',
    exportClearance: 'seller', importClearance: 'seller', insurance: { by: 'none' },
    riskTransfer: 'Hàng đến nơi đến{dest}, đã thông quan nhập khẩu, còn trên phương tiện, sẵn sàng để dỡ.',
    summary: 'Người bán lo tất cả đến tận nơi, kể cả thông quan nhập và thuế; người mua chỉ dỡ hàng.',
    keyPoints: [
      'Người bán nộp cả thuế nhập khẩu và VAT ở nước người mua.',
      'Người bán cần có tư cách pháp lý (hoặc đại lý) để thông quan nhập ở nước người mua.',
      'Trách nhiệm người bán cao nhất; người mua chỉ dỡ hàng.',
    ],
  }),
};

/** Điều kiện dùng được theo phương thức */
export const termsForMode = (mode: TransportMode): Incoterm[] => INCOTERM_ORDER.filter((t) => mode === 'sea' || INCOTERMS[t].group === 'any');

/** Điều kiện tương đương khi chuyển từ đường biển sang phương thức khác */
export const SEA_ONLY_EQUIVALENT: Partial<Record<Incoterm, Incoterm>> = { FAS: 'FCA', FOB: 'FCA', CFR: 'CPT', CIF: 'CIP' };

export const GROUP_C: Incoterm[] = ['CFR', 'CIF', 'CPT', 'CIP'];
