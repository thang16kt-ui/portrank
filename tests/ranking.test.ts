import { describe, expect, it } from 'vitest';
import { WEIGHT_PRESETS } from '../src/config/weights';
import { buildPlan, type PlanInput } from '../src/lib/plan';
import { coefficientOfVariation, normalize, rankOptions, simulatePriceHistory, weightedScore } from '../src/lib/ranking';
import { createTableRateProvider } from '../src/providers/RateProvider';
import { createUserTariffProvider } from '../src/providers/TariffProvider';
import type { Place } from '../src/types';

const deps = { rates: createTableRateProvider([]), tariffs: createUserTariffProvider([]) };
const VN: Place = { kind: 'country', label: 'Việt Nam', country: 'VN', countryName: 'Việt Nam', coord: [106, 16] };
const DE: Place = { kind: 'country', label: 'Đức', country: 'DE', countryName: 'Đức', coord: [10, 51] };
const input = (p: Partial<PlanInput> = {}): PlanInput => ({
  role: 'seller', mine: VN, partner: DE, mode: 'sea',
  shipment: { cargo: 'dry', mode: 'FCL', container: '40HC', quantity: 1, cbm: 0, weightKg: 0, woodPallet: false },
  goodsValue: 0, valueTerm: 'FOB', hs: '', origin: '', hasCo: false, readyDate: '2026-11-20', radiusKm: 400,
  avoidRedSea: false, avoidPanama: false, carriers: [], ...p,
});

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
    expect(weightedScore({ cost: 100, stability: 0, time: 0, frequency: 0, risk: 0 }, WEIGHT_PRESETS.balanced)).toBeCloseTo(35, 6);
  });
  it('giá mô phỏng 12 tháng, seed cố định', () => {
    const a = simulatePriceHistory('VNSGN', 'DEHAM', 3000, undefined, new Date(2026, 0, 15));
    expect(a).toHaveLength(12);
    expect(a).toEqual(simulatePriceHistory('VNSGN', 'DEHAM', 3000, undefined, new Date(2026, 0, 15)));
    expect(a).not.toEqual(simulatePriceHistory('VNHPH', 'DEHAM', 3000, undefined, new Date(2026, 0, 15)));
  });
});

describe('rankOptions', async () => {
  const plan = await buildPlan(input(), deps);
  it('xếp hạng giảm dần theo điểm, hạng 1..n, có nhãn Rẻ nhất / Nhanh nhất / Ổn định nhất', () => {
    const r = rankOptions(plan.options, 'FCA', 'seller', WEIGHT_PRESETS.balanced);
    expect(r.map((x) => x.rank)).toEqual(r.map((_, i) => i + 1));
    for (let i = 1; i < r.length; i++) expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
    expect(r.flatMap((c) => c.tags)).toEqual(expect.arrayContaining(['Rẻ nhất', 'Nhanh nhất', 'Ổn định nhất']));
  });
  it('chi phí xếp hạng = phần người dùng trả theo Incoterm; nút "Tổng" dùng tổng 10 khoản', () => {
    const cpt = rankOptions(plan.options, 'CPT', 'seller', WEIGHT_PRESETS.balanced);
    cpt.forEach((r) => expect(r.cost).toBe(r.youPay));
    const tot = rankOptions(plan.options, 'CPT', 'seller', WEIGHT_PRESETS.balanced, 'total');
    tot.forEach((r) => expect(r.cost).toBe(r.option.total));
  });
  it('bạn trả + bên kia trả = tổng', () => {
    for (const t of ['EXW', 'FOB', 'CIF', 'DAP', 'DDP'] as const) {
      rankOptions(plan.options, t, 'buyer', WEIGHT_PRESETS.balanced).forEach((r) => expect(r.youPay + r.otherPays).toBeCloseTo(r.option.total, 6));
    }
  });
  it('trọng số 100% chi phí đưa phương án rẻ nhất lên đầu', () => {
    const r = rankOptions(plan.options, 'DDP', 'seller', { cost: 100, stability: 0, time: 0, frequency: 0, risk: 0 });
    expect(r[0].cost).toBe(Math.min(...r.map((x) => x.cost)));
  });
});
