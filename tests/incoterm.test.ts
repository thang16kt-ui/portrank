import { describe, expect, it } from 'vitest';
import { COST_ITEMS, INCOTERMS, INCOTERM_ORDER, SEA_ONLY_EQUIVALENT, termsForMode } from '../src/config/incoterms';
import { costCutMatchesMatrix, riskTransferText, sellerShare, splitItems, suggestIncoterm } from '../src/lib/incoterm';
import { riskCellPos } from '../src/components/IncotermCard';
import type { Incoterm } from '../src/types';

/** Ma trận phân chia theo đặc tả: các khoản NGƯỜI BÁN trả */
const MATRIX: Record<Incoterm, number[]> = {
  EXW: [],
  FCA: [1, 2, 3],
  FAS: [1, 2, 3], // + một phần 4
  FOB: [1, 2, 3, 4],
  CFR: [1, 2, 3, 4, 5],
  CIF: [1, 2, 3, 4, 5, 6],
  CPT: [1, 2, 3, 4, 5],
  CIP: [1, 2, 3, 4, 5, 6],
  DAP: [1, 2, 3, 4, 5, 7, 9],
  DPU: [1, 2, 3, 4, 5, 7, 9, 10],
  DDP: [1, 2, 3, 4, 5, 7, 8, 9],
};

describe('ma trận 11 điều kiện', () => {
  it('đủ 11 điều kiện, xếp theo trách nhiệm người bán tăng dần', () => {
    expect(INCOTERM_ORDER).toEqual(['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']);
  });
  for (const t of INCOTERM_ORDER) {
    it(`${t}: khoản người bán trả khớp ma trận; điểm cắt chi phí khớp; có 3 điểm cần nhớ`, () => {
      for (let n = 1; n <= 10; n++) {
        const sh = sellerShare(t, n as never);
        if (t === 'FAS' && n === 4) expect(sh).toBe(0.5);
        else expect(sh).toBe(MATRIX[t].includes(n) ? 1 : 0);
      }
      expect(costCutMatchesMatrix(t)).toBe(true);
      expect(INCOTERMS[t].keyPoints).toHaveLength(3);
      expect(INCOTERMS[t].riskTransfer.length).toBeGreaterThan(20);
    });
  }
  it('nhóm C: điểm cắt chi phí và điểm cắt rủi ro ở hai vị trí khác nhau; các điều kiện khác trùng nhau', () => {
    for (const t of INCOTERM_ORDER) {
      const d = INCOTERMS[t];
      if (['CFR', 'CIF', 'CPT', 'CIP'].includes(t)) expect(d.costAt).toBeGreaterThan(d.riskAt);
      else expect(d.costAt).toBe(d.riskAt);
    }
  });
  it('điểm chuyển rủi ro tăng dần: EXW < FCA < FAS < FOB < DAP < DPU; DDP = DAP', () => {
    const r = (t: Incoterm) => INCOTERMS[t].riskAt;
    expect(r('EXW')).toBeLessThan(r('FCA'));
    expect(r('FCA')).toBeLessThan(r('FAS'));
    expect(r('FAS')).toBeLessThan(r('FOB'));
    expect(r('FOB')).toBeLessThan(r('DAP'));
    expect(r('DAP')).toBeLessThan(r('DPU'));
    expect(r('DDP')).toBe(r('DAP'));
    expect(r('CPT')).toBe(r('FCA'));
    expect(r('CFR')).toBe(r('FOB'));
  });
  it('bảo hiểm chỉ ở CIF (ICC C) và CIP (ICC A); thông quan nhập chỉ người bán làm ở DDP', () => {
    for (const t of INCOTERM_ORDER) {
      expect(INCOTERMS[t].insurance.by === 'seller').toBe(t === 'CIF' || t === 'CIP');
      expect(INCOTERMS[t].importClearance === 'seller').toBe(t === 'DDP');
      expect(INCOTERMS[t].exportClearance === 'buyer').toBe(t === 'EXW');
    }
    expect(INCOTERMS.CIF.insurance.level).toContain('ICC C');
    expect(INCOTERMS.CIP.insurance.level).toContain('ICC A');
  });
  it('cờ trên dải 10 ô: FOB sau ô 4, FCA sau ô 3, DPU cuối dải, EXW đầu dải', () => {
    expect(riskCellPos('EXW')).toBe(0);
    expect(riskCellPos('FCA')).toBe(3);
    expect(riskCellPos('FOB')).toBe(4);
    expect(riskCellPos('DPU')).toBe(10);
    expect(riskCellPos('FAS')).toBeGreaterThan(3);
    expect(riskCellPos('FAS')).toBeLessThan(4);
  });
  it('10 khoản có nhãn riêng cho đường biển và đường bộ', () => {
    expect(COST_ITEMS).toHaveLength(10);
    expect(COST_ITEMS[4].label.sea).toContain('Cước biển');
    expect(COST_ITEMS[4].label.road).toContain('Cước xe');
  });
});

describe('phương thức vận tải', () => {
  it('đường biển 11 nút, đường bộ 7 nút (bỏ FAS, FOB, CFR, CIF)', () => {
    expect(termsForMode('sea')).toHaveLength(11);
    expect(termsForMode('road')).toEqual(['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']);
  });
  it('quy đổi tương đương khi sang đường bộ', () => {
    expect(SEA_ONLY_EQUIVALENT).toEqual({ FAS: 'FCA', FOB: 'FCA', CFR: 'CPT', CIF: 'CIP' });
  });
  it('câu rủi ro chèn tên địa điểm và đổi từ theo phương thức', () => {
    const names = { origin: 'Bình Dương', portO: 'Cái Mép', portD: 'Hamburg', dest: 'Munich' };
    expect(riskTransferText('FOB', 'sea', names)).toBe('Hàng đã nằm trên tàu tại cảng đi Cái Mép.');
    expect(riskTransferText('CIP', 'sea', names)).toContain('hãng vận tải (hãng tàu)');
    expect(riskTransferText('CIP', 'sea', names)).toContain('cảng đến Hamburg');
    const road = riskTransferText('CPT', 'road', names);
    expect(road).toContain('nhà xe');
    expect(road).not.toMatch(/tàu|cảng/);
    expect(riskTransferText('DAP', 'road', names)).toContain('(Munich)');
  });
});

describe('splitItems', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ n: (i + 1) as never, amount: 100 }));
  it('FOB: người bán 400 (khoản 1–4), người mua 600', () => {
    const s = splitItems(items, 'FOB', 'seller');
    expect(s.seller).toBe(400);
    expect(s.buyer).toBe(600);
    expect(s.you).toBe(400);
  });
  it('FAS: một nửa khoản 4', () => {
    expect(splitItems(items, 'FAS', 'buyer').seller).toBe(350);
  });
  it('nhóm C: tùy chọn người bán trả phí cảng đến', () => {
    expect(splitItems(items, 'CPT', 'seller').seller).toBe(500);
    expect(splitItems(items, 'CPT', 'seller', { destChargesBySeller: true }).seller).toBe(600);
    expect(splitItems(items, 'FOB', 'seller', { destChargesBySeller: true }).seller).toBe(400);
  });
  it('khoản chưa tính (null) coi như 0', () => {
    const s = splitItems([{ n: 1, amount: null }, { n: 2, amount: 50 }], 'DDP', 'buyer');
    expect(s.seller).toBe(50);
    expect(s.you).toBe(0);
  });
});

describe('suggestIncoterm', () => {
  it('người bán book, hàng container → CIP', () => {
    expect(suggestIncoterm('seller', true, 'dry', 'sea').term).toBe('CIP');
  });
  it('người mua book → FCA; hàng quá khổ đi biển → FOB / CIF', () => {
    expect(suggestIncoterm('buyer', true, 'reefer', 'sea').term).toBe('FCA');
    expect(suggestIncoterm('buyer', true, 'oog', 'sea').term).toBe('FOB');
    expect(suggestIncoterm('buyer', false, 'oog', 'sea').term).toBe('CIF');
  });
  it('đường bộ chỉ gợi ý điều kiện mọi phương thức', () => {
    for (const r of ['seller', 'buyer'] as const) for (const b of [true, false]) for (const c of ['dry', 'oog'] as const) {
      expect(termsForMode('road')).toContain(suggestIncoterm(r, b, c, 'road').term);
    }
  });
});
