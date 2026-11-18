import { describe, expect, it } from 'vitest';
import { computeDuty } from '../src/lib/duty';
import { FX, parseSpecific, specificDutyUsd } from '../src/lib/specificDuty';
import { splitDuty } from '../src/lib/tariffSources';
import type { TariffEntry } from '../src/providers/TariffProvider';

const q = (p: Partial<{ netKg: number; units: number; liters: number }> = {}) => ({ netKg: 0, units: 0, liters: 0, ...p });

describe('đọc thuế tuyệt đối', () => {
  it('các dạng của Mỹ, EU, Anh', () => {
    expect(parseSpecific('90¢/pr.')).toMatchObject([{ amount: 0.9, currency: 'USD', basis: 'units', per: 1 }]);
    expect(parseSpecific('4.4¢/kg')).toMatchObject([{ amount: 0.044, basis: 'kg', per: 1 }]);
    expect(parseSpecific('$1.25/doz.')).toMatchObject([{ amount: 1.25, basis: 'units', per: 12 }]);
    expect(parseSpecific('25¢ each')).toMatchObject([{ amount: 0.25, basis: 'units', per: 1 }]);
    expect(parseSpecific('2.50 EUR / 100 kg')).toMatchObject([{ amount: 2.5, currency: 'EUR', basis: 'kg', per: 100 }]);
    expect(parseSpecific('33.00 GBP / 100 kg/net')).toMatchObject([{ currency: 'GBP', basis: 'kg', per: 100 }]);
    expect(parseSpecific('1.20 EUR / hl')).toMatchObject([{ basis: 'liters', per: 100 }]);
    expect(parseSpecific('MIN 0.30 EUR / 100 kg')).toMatchObject([{ bound: 'MIN', amount: 0.3 }]);
  });
  it('dạng theo độ cồn / thành phần, hoặc không có đơn vị → không tự tính', () => {
    expect(parseSpecific('1.75 EUR / % vol/hl')).toBeNull();
    expect(parseSpecific('3.00 EUR')).toBeNull();
  });
  it('splitDuty tách phần % và phần MIN/MAX', () => {
    expect(splitDuty('4.00 % MIN 0.30 EUR / 100 kg')).toEqual({ pct: 4, specific: 'MIN 0.30 EUR / 100 kg' });
  });
});

describe('tính thuế tuyệt đối', () => {
  it('quy đổi EUR → USD theo tỷ giá ECB', () => {
    const r = specificDutyUsd('2.50 EUR / 100 kg', q({ netKg: 2000 }));
    expect(r.usd).toBeCloseTo(50 * FX.usdPer.EUR);
    expect(r.note).toContain('ECB');
  });
  it('thiếu số lượng → báo cần nhập', () => {
    const r = specificDutyUsd('90¢/pr.', q());
    expect(r.usd).toBeNull();
    expect(r.note).toContain('số lượng sản phẩm');
  });
  it('computeDuty: % + tuyệt đối, phần tuyệt đối vào trị giá tính VAT', () => {
    const e: TariffEntry = { id: 'x', importCountry: 'US', hs: '64041179', origin: '*', rateType: 'MFN', fta: '', dutyPct: 37.5, vatPct: 10, otherPct: 0, specificDuty: '90¢/pr.', source: 's', effectiveDate: '', updatedAt: '2026-11-17', verified: true };
    const d = computeDuty('JP', 10000, 10000, e, true, q({ units: 1000 }));
    expect(d.specific).toBeCloseTo(900);
    expect(d.duty).toBeCloseTo(3750 + 900);
    expect(d.vat).toBeCloseTo((10000 + 4650) * 0.1);
    expect(d.specificPending).toBe(false);
    const none = computeDuty('JP', 10000, 10000, e, true, q());
    expect(none.specificPending).toBe(true);
    expect(none.duty).toBeCloseTo(3750);
  });
  it('MIN: thuế không thấp hơn ngưỡng theo lượng', () => {
    const e: TariffEntry = { id: 'x', importCountry: 'DE', hs: '0000', origin: '*', rateType: 'MFN', fta: '', dutyPct: 4, vatPct: null, otherPct: 0, specificDuty: 'MIN 10.00 USD / 100 kg', source: 's', effectiveDate: '', updatedAt: '2026-11-17', verified: true };
    // 4% × 1000 = 40 USD < MIN 10 USD × 10 = 100 USD → thuế 100
    expect(computeDuty('DE', 1000, 1000, e, true, q({ netKg: 1000 })).duty).toBeCloseTo(100);
    // 4% × 100000 = 4000 > MIN → giữ 4000
    expect(computeDuty('DE', 100000, 100000, e, true, q({ netKg: 1000 })).duty).toBeCloseTo(4000);
  });
});
