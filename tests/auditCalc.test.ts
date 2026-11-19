import { describe, expect, it } from 'vitest';
import { COST_ITEMS } from '../src/config/incoterms';
import { PRICING } from '../src/config/pricing';
import { computeDuty } from '../src/lib/duty';
import { computeFees, usFees } from '../src/lib/fees';
import { finalize, type CostItem, type PlanInput } from '../src/lib/plan';
import { usEntry } from '../src/lib/tariffSources';
import type { TariffEntry } from '../src/providers/TariffProvider';

/** Ca kiểm thử trong báo cáo PortRank v2 (2026-11-18). Số GIẢ LẬP để thử thuật toán, không phải thuế suất thực tế. */
const T = (p: Partial<TariffEntry>): TariffEntry => ({
  id: 't', importCountry: 'JP', hs: '610910', origin: '*', rateType: 'MFN', fta: '', dutyPct: 5, vatPct: 10, otherPct: 0, source: 'fixture', effectiveDate: '', updatedAt: new Date().toISOString().slice(0, 10), verified: false, ...p,
});
const items = (): CostItem[] => COST_ITEMS.map((c) => ({ n: c.n, amount: 0, estimated: true, lines: [] }));
const input = (p: Partial<PlanInput> = {}): PlanInput => ({
  role: 'seller', mine: { kind: 'country', country: 'VN', countryName: 'Việt Nam', label: 'VN', coord: [106, 16] }, partner: { kind: 'country', country: 'JP', countryName: 'Nhật Bản', label: 'JP', coord: [139, 36] },
  mode: 'sea', shipment: { cargo: 'dry', mode: 'FCL', container: '40HC', quantity: 1, cbm: 5, weightKg: 1500, woodPallet: false },
  goodsValue: 10000, valueTerm: 'CIF', hs: '610910', origin: 'VN', hasCo: false, readyDate: '2026-11-18', radiusKm: 400, avoidRedSea: false, avoidPanama: false, carriers: [],
  ...p,
});
const sumLines = (it: CostItem) => Math.round(it.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;

describe('PR-01 · thuế tuyệt đối chỉ tính một lần', () => {
  it('CIF 10000, 5% + 1 USD/kg × 100 kg, VAT 10%, thông quan 120 → khoản 8 = 1780', () => {
    expect(PRICING.customs.importPerShipment).toBe(120);
    const f = finalize(items(), input({ dutyQty: { units: 0, netKg: 100, liters: 0 } }), 'JP', T({ specificDuty: '1 USD/kg' }), false);
    expect(f.value.cif).toBeCloseTo(10000, 6);
    expect(f.duty.duty).toBe(600);
    expect(f.duty.specific).toBe(100);
    expect(f.duty.vat).toBe(1060);
    expect(f.duty.total).toBe(1660);
    const i8 = f.items[7];
    expect(i8.amount).toBe(1780);
    expect(sumLines(i8)).toBe(1780); // chi tiết = tổng khoản
    expect(i8.lines.map((l) => l.amount)).toEqual([120, 500, 100, 1060]);
  });
  it('chỉ có thuế tuyệt đối: 0% + 1 USD/kg × 100 kg → thuế 100', () => {
    const f = finalize(items(), input({ dutyQty: { units: 0, netKg: 100, liters: 0 } }), 'JP', T({ dutyPct: 0, specificDuty: '1 USD/kg' }), false);
    expect(f.duty.duty).toBe(100);
    expect(f.items[7].amount).toBe(120 + 100 + 1010);
    expect(sumLines(f.items[7])).toBe(f.items[7].amount);
  });
  it('MIN/MAX: 4% MIN 1 USD/kg, 100 kg, trị giá 1000 → thuế = 100 (mức sàn); dòng điều chỉnh không cộng trùng', () => {
    const d = computeDuty('JP', 1000, 1000, T({ dutyPct: 4, specificDuty: 'MIN 1 USD/kg' }), true, { units: 0, netKg: 100, liters: 0 });
    expect(d.adValorem).toBe(40);
    expect(d.duty).toBe(100);
    expect(d.specific).toBe(60);
    const cap = computeDuty('JP', 10000, 10000, T({ dutyPct: 10, specificDuty: 'MAX 2 USD/kg' }), true, { units: 0, netKg: 100, liters: 0 });
    expect(cap.duty).toBe(200);
    expect(cap.adValorem + cap.specific).toBe(200);
  });
});

describe('PR-02 · cơ sở GST của Úc gồm cước và bảo hiểm', () => {
  it('FOB 10000, CIF 12000, thuế 5% → thuế 500 (trên FOB), GST = (12000 + 500) × 10% = 1250', () => {
    const d = computeDuty('AU', 12000, 10000, T({ importCountry: 'AU', dutyPct: 5, vatPct: 10 }));
    expect(d.customsValue).toBe(10000);
    expect(d.duty).toBe(500);
    expect(d.vatBase).toBe(12500);
    expect(d.vat).toBe(1250);
  });
  it('nước khác: cơ sở VAT = trị giá tính thuế + thuế (không cộng cước hai lần)', () => {
    const d = computeDuty('JP', 12000, 10000, T({ dutyPct: 5 }));
    expect(d.vatBase).toBe(12600);
  });
});

describe('PR-08 · thiếu khoản thuế không được báo là đủ', () => {
  it('VAT chưa có → partial, không coi là 0 đã xác nhận', () => {
    const d = computeDuty('JP', 10000, 10000, T({ vatPct: null }), true, undefined, { measuresChecked: true });
    expect(d.completeness).toBe('partial');
    expect(d.missing.join(' ')).toContain('VAT/GST');
  });
  it('thuế $1/pr. nhưng chưa nhập số lượng → needs-input, nêu đúng trường thiếu', () => {
    const d = computeDuty('JP', 10000, 10000, T({ specificDuty: '$1/pr.' }), true, { units: 0, netKg: 0, liters: 0 }, { measuresChecked: true });
    expect(d.completeness).toBe('needs-input');
    expect(d.needInputs.join(' ')).toContain('số lượng sản phẩm');
  });
  it('không có thuế suất → unavailable; tổng logistics chỉ là phần đã biết', () => {
    const f = finalize(items(), input(), 'JP', null, false);
    expect(f.completeness).toBe('unavailable');
    expect(f.duty.missing[0]).toContain('Thuế suất');
    expect(f.missing.some((m) => m.includes('chưa có thuế suất'))).toBe(true);
  });
  it('phòng vệ thương mại chưa kiểm tra → partial; đủ dữ liệu → complete', () => {
    expect(computeDuty('JP', 1000, 1000, T({})).completeness).toBe('partial');
    expect(computeDuty('JP', 1000, 1000, T({}), true, undefined, { measuresChecked: true }).completeness).toBe('complete');
  });
});

describe('PR-09 · không lấy khối lượng mặc định làm khối lượng tịnh', () => {
  it('FCL chưa nhập KL tịnh (khối lượng hàng mặc định 1500) → needs-input, thuế tuyệt đối không tính', () => {
    const f = finalize(items(), input({ dutyQty: { units: 0, netKg: 0, liters: 0 } }), 'JP', T({ specificDuty: '1 USD/kg' }), false);
    expect(f.duty.specific).toBe(0);
    expect(f.duty.specificPending).toBe(true);
    expect(f.duty.completeness).toBe('needs-input');
    expect(f.completeness).toBe('needs-input');
  });
  it('nhập 100 kg tịnh → phần tuyệt đối 100 USD', () => {
    const f = finalize(items(), input({ dutyQty: { units: 0, netKg: 100, liters: 0 } }), 'JP', T({ specificDuty: '1 USD/kg' }), false);
    expect(f.duty.specific).toBe(100);
  });
});

describe('PR-12 / PR-13 · MPF có sàn/trần theo năm tài chính, HMF chỉ cho tàu biển', () => {
  const fees = usFees('2026-11-18', false);
  it('trị giá 5000, đường biển: MPF = sàn 34.58 + HMF 6.25 = 40.83', () => {
    const r = computeFees(fees, 5000, 'sea');
    expect(r.lines.map((l) => [l.code, l.amount])).toEqual([['MPF', 34.58], ['HMF', 6.25]]);
    expect(r.lines.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(40.83, 2);
  });
  it('trị giá 1.000.000: MPF = trần 670.86 + HMF 1250 (HMF không bị chặn trần) = 1920.86', () => {
    const r = computeFees(fees, 1_000_000, 'sea');
    expect(r.lines.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(1920.86, 2);
  });
  it('đường bộ Canada → Mỹ: không có HMF, MPF tính riêng', () => {
    const r = computeFees(fees, 10000, 'road');
    expect(r.lines.map((l) => [l.code, l.amount])).toEqual([['MPF', 34.64]]);
    expect(r.skipped[0]).toContain('HMF');
  });
  it('ngày chuyển năm tài chính: trước 2026-10-01 chưa có văn bản trong app → báo chưa xác nhận', () => {
    expect(usFees('2026-10-01', false)[0].note).not.toContain('chưa có văn bản');
    expect(usFees('2026-09-30', false)[0].note).toContain('chưa có văn bản');
    expect(usFees('2027-10-01', false)[0].note).toContain('chưa có văn bản');
  });
  it('MPF tính một lần mỗi tờ khai trong computeDuty (không theo container), miễn MPF cho USMCA', () => {
    const e = T({ importCountry: 'US', dutyPct: 0, vatPct: 0, fees: usFees('2026-11-18', false) });
    expect(computeDuty('US', 5000, 5000, e, true, undefined, { mode: 'sea' }).fees).toBeCloseTo(40.83, 2);
    expect(computeDuty('US', 10000, 10000, e, true, undefined, { mode: 'road' }).fees).toBeCloseTo(34.64, 2);
    expect(usFees('2026-11-18', true).map((f) => f.code)).toEqual(['HMF']);
  });
});

describe('PR-23 · thuế thuần tuyệt đối của Mỹ', () => {
  const row = (general: string) => ({ htsno: '9999.00.00.00', description: 'Fixture', general, special: '', other: '', indent: '1', footnotes: [] });
  it('"4.4¢/kg" + 100 kg → 4.4 USD; thiếu lượng → needs-input', () => {
    const { entry } = usEntry(row('4.4¢/kg'), 'VN', false, '2026-11-18');
    expect(entry).toMatchObject({ dutyPct: 0, specificDuty: '4.4¢/kg' });
    const d = computeDuty('US', 1000, 1000, entry, true, { units: 0, netKg: 100, liters: 0 }, { mode: 'sea' });
    expect(d.duty).toBeCloseTo(4.4, 6);
    expect(computeDuty('US', 1000, 1000, entry, true, { units: 0, netKg: 0, liters: 0 }).completeness).toBe('needs-input');
  });
  it('dạng không hỗ trợ (theo độ cồn) → không gán thuế 0, báo chưa tính', () => {
    const { entry } = usEntry(row('1.5 USD / % vol/hl'), 'VN', false);
    expect(entry).not.toBeNull();
    const d = computeDuty('US', 1000, 1000, entry, true, { units: 0, netKg: 100, liters: 100 });
    expect(d.specificPending).toBe(true);
    expect(d.completeness).toBe('partial');
  });
  it('thuế phức hợp cũ không hồi quy: "90¢/pr. + 37.5%"', () => {
    const { entry } = usEntry(row('90¢/pr. + 37.5%'), 'VN', false);
    expect(entry).toMatchObject({ dutyPct: 37.5, specificDuty: '90¢/pr.' });
    const d = computeDuty('US', 1000, 1000, entry, true, { units: 10, netKg: 0, liters: 0 });
    expect(d.duty).toBeCloseTo(375 + 9, 6);
  });
  it('không đọc được thuế suất → không tạo mức thuế', () => {
    expect(usEntry(row('See chapter 99'), 'VN', false).entry).toBeNull();
  });
});
