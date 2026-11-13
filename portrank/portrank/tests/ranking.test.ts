import { describe, expect, it } from 'vitest';
import { WEIGHT_PRESETS } from '../src/config/weights';
import { PORT_BY_CODE as P } from '../src/data/ports';
import { coefficientOfVariation, normalize, portsWithin, rankAlternatives, simulatePriceHistory, weightedScore } from '../src/lib/ranking';
import type { ShipmentInput } from '../src/types';

const shipment: ShipmentInput = { cargo: 'dry', mode: 'FCL', container: '40HC', quantity: 1, cbm: 0, weightKg: 0, woodPallet: false };
const options = { avoidRedSea: false, avoidPanama: false };

describe('chuẩn hóa & điểm', () => {
  it('normalize: tốt nhất = 100, tệ nhất = 0', () => {
    expect(normalize([100, 200, 300])).toEqual([100, 50, 0]);
    expect(normalize([1, 2, 3], false)).toEqual([0, 50, 100]);
    expect(normalize([5, 5])).toEqual([100, 100]);
  });
  it('CV = độ lệch chuẩn / trung bình', () => {
    expect(coefficientOfVariation([10, 10, 10])).toBe(0);
    expect(coefficientOfVariation([8, 12])).toBeCloseTo(0.2, 6);
  });
  it('trọng số 35/25/20/10/10', () => {
    const s = weightedScore({ cost: 100, stability: 0, time: 0, frequency: 0, risk: 0 }, WEIGHT_PRESETS.balanced);
    expect(s).toBeCloseTo(35, 6);
  });
});

describe('dữ liệu giá mô phỏng', () => {
  it('12 tháng, seed cố định (tái lập được)', () => {
    const a = simulatePriceHistory('VNSGN', 'DEHAM', 3000, undefined, new Date(2026, 0, 15));
    const b = simulatePriceHistory('VNSGN', 'DEHAM', 3000, undefined, new Date(2026, 0, 15));
    const c = simulatePriceHistory('VNHPH', 'DEHAM', 3000, undefined, new Date(2026, 0, 15));
    expect(a).toHaveLength(12);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a.every((p) => p.price > 0)).toBe(true);
  });
});

describe('rankAlternatives', () => {
  it('bán kính 0 → chỉ cặp gốc', () => {
    const r = rankAlternatives({ pol: P.VNSGN, pod: P.DEHAM, radiusKm: 0, shipment, options, weights: WEIGHT_PRESETS.balanced });
    expect(r).toHaveLength(1);
    expect(r[0].isCurrent).toBe(true);
  });
  it('bán kính 300 km quanh Cát Lái gồm Cái Mép; quanh Hamburg gồm Bremerhaven', () => {
    expect(portsWithin(P.VNSGN, 300).map((p) => p.code)).toContain('VNCMT');
    expect(portsWithin(P.DEHAM, 300).map((p) => p.code)).toContain('DEBRV');
  });
  it('xếp hạng giảm dần theo điểm, có nhãn Rẻ nhất / Nhanh nhất / Ổn định nhất', () => {
    const r = rankAlternatives({ pol: P.VNSGN, pod: P.DEHAM, radiusKm: 500, shipment, options, weights: WEIGHT_PRESETS.balanced });
    expect(r.length).toBeGreaterThan(3);
    for (let i = 1; i < r.length; i++) expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
    const tags = r.flatMap((c) => c.tags);
    expect(tags).toEqual(expect.arrayContaining(['Rẻ nhất', 'Nhanh nhất', 'Ổn định nhất']));
    const cheapest = r.find((c) => c.tags.includes('Rẻ nhất'))!;
    expect(cheapest.scores.cost).toBe(100);
    expect(Math.min(...r.map((c) => c.cost))).toBe(cheapest.cost);
  });
  it('ưu tiên "Giá thấp" đưa cặp rẻ nhất lên đầu nhiều hơn', () => {
    const r = rankAlternatives({ pol: P.VNSGN, pod: P.DEHAM, radiusKm: 500, shipment, options, weights: { cost: 100, stability: 0, time: 0, frequency: 0, risk: 0 } });
    expect(r[0].tags).toContain('Rẻ nhất');
  });
});
