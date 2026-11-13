import { describe, expect, it } from 'vitest';
import { PORT_BY_CODE as P } from '../src/data/ports';
import { INCOTERMS, payerOf, splitCosts, suggestIncoterm } from '../src/lib/incoterm';

describe('suggestIncoterm', () => {
  it('Người bán tự book → CPT/CIP tại cảng đến (container)', () => {
    const s = suggestIncoterm('seller', 'me', 'dry', P.VNSGN, P.DEHAM);
    expect(s.primary).toBe('CPT');
    expect(s.alternatives).toContain('CIP');
    expect(s.alternatives).toContain('DAP');
    expect(s.placeLabel).toContain('Hamburg');
  });
  it('Người bán, người mua book → FCA cảng đi', () => {
    const s = suggestIncoterm('seller', 'other', 'reefer', P.VNSGN, P.DEHAM);
    expect(s.primary).toBe('FCA');
    expect(s.placeLabel).toContain('Cát Lái');
  });
  it('Người mua tự book → FCA cảng đi', () => {
    expect(suggestIncoterm('buyer', 'me', 'dry', P.VNSGN, P.DEHAM).primary).toBe('FCA');
  });
  it('Người mua, người bán book → CIP cảng đến, DAP/DDP thay thế', () => {
    const s = suggestIncoterm('buyer', 'other', 'dg', P.VNSGN, P.DEHAM);
    expect(s.primary).toBe('CIP');
    expect(s.alternatives).toEqual(expect.arrayContaining(['DAP', 'DDP']));
  });
  it('Hàng quá khổ → nhóm FOB/CFR/CIF', () => {
    expect(suggestIncoterm('seller', 'me', 'oog', P.VNSGN, P.DEHAM).primary).toBe('CFR');
    expect(suggestIncoterm('seller', 'other', 'oog', P.VNSGN, P.DEHAM).primary).toBe('FOB');
    expect(suggestIncoterm('buyer', 'other', 'oog', P.VNSGN, P.DEHAM).primary).toBe('CIF');
  });
  it('Không bao giờ gợi ý FOB/CFR/CIF làm chính cho hàng container', () => {
    for (const role of ['seller', 'buyer'] as const)
      for (const booker of ['me', 'other'] as const)
        for (const cargo of ['dry', 'reefer', 'dg'] as const)
          expect(['FOB', 'CFR', 'CIF']).not.toContain(suggestIncoterm(role, booker, cargo, P.VNSGN, P.DEHAM).primary);
  });
});

describe('phân chia trách nhiệm', () => {
  it('5 chặng, EXW toàn bộ người mua, DDP toàn bộ người bán', () => {
    expect(INCOTERMS.EXW.payer.every((p) => p === 'buyer')).toBe(true);
    expect(INCOTERMS.DDP.payer.every((p) => p === 'seller')).toBe(true);
  });
  it('CIF: người bán trả cước (chặng trên tàu) nhưng rủi ro chuyển tại cảng đi', () => {
    expect(payerOf('CIF', 2)).toBe('seller');
    expect(payerOf('CIF', 3)).toBe('buyer');
    expect(INCOTERMS.CIF.riskAt).toBeLessThan(2);
  });
  it('FCA: cước biển do người mua trả', () => {
    expect(payerOf('FCA', 2)).toBe('buyer');
    const lines = [
      { id: 'thc_o', label: '', amount: 100, segment: 1 as const },
      { id: 'of', label: '', amount: 1000, segment: 2 as const },
      { id: 'thc_d', label: '', amount: 200, segment: 3 as const },
    ];
    expect(splitCosts('FCA', lines)).toEqual({ seller: 100, buyer: 1200 });
    expect(splitCosts('CPT', lines)).toEqual({ seller: 1100, buyer: 200 });
    expect(splitCosts('DAP', lines)).toEqual({ seller: 1300, buyer: 0 });
  });
});
