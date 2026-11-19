import { describe, expect, it } from 'vitest';
import { customsBasisOf } from '../src/data/customsBasis';
import { ftasBetween } from '../src/data/countries';
import { parseCsv } from '../src/lib/csv';
import { computeDuty } from '../src/lib/duty';
import { matchTariff, parseTariffRows, type TariffEntry } from '../src/providers/TariffProvider';

const T = (p: Partial<TariffEntry>): TariffEntry => ({
  id: Math.random().toString(36), importCountry: 'VN', hs: '940360', origin: '*', rateType: 'MFN', fta: '', dutyPct: 25, vatPct: 10, otherPct: 0,
  source: 'https://example.gov/vb', effectiveDate: '2026-01-01', updatedAt: new Date().toISOString().slice(0, 10), verified: false, ...p,
});

describe('trị giá tính thuế', () => {
  it('CIF cho Việt Nam, EU, Anh; FOB cho Mỹ, Canada, Úc; nước chưa có dữ liệu → CIF, chưa xác minh', () => {
    for (const c of ['VN', 'DE', 'FR', 'GB']) expect(customsBasisOf(c).basis).toBe('CIF');
    for (const c of ['US', 'CA', 'AU']) expect(customsBasisOf(c).basis).toBe('FOB');
    expect(customsBasisOf('ZZ').basis).toBe('CIF');
    expect(customsBasisOf('ZZ').verified).toBe(false);
    expect(customsBasisOf('DE').source).toMatch(/^https:/);
  });
});

describe('computeDuty', () => {
  it('thuế NK = trị giá × %, VAT = (trị giá + thuế NK + thuế khác) × %', () => {
    const d = computeDuty('VN', 10000, 9000, T({ dutyPct: 20, vatPct: 10, otherPct: 5 }));
    expect(d.status).toBe('ok');
    expect(d.customsValue).toBe(10000);
    expect(d.duty).toBeCloseTo(2000, 6);
    expect(d.other).toBeCloseTo(600, 6);
    expect(d.vat).toBeCloseTo(1260, 6);
    expect(d.total).toBeCloseTo(3860, 6);
  });
  it('Mỹ dùng trị giá FOB', () => {
    const d = computeDuty('US', 10000, 9000, T({ importCountry: 'US', dutyPct: 10, vatPct: null }));
    expect(d.customsValue).toBe(9000);
    expect(d.duty).toBeCloseTo(900, 6);
    // Mỹ không có VAT liên bang → 0, không phải "thiếu"
    expect(d.vatMissing).toBe(false);
    expect(d.vat).toBe(0);
  });
  it('không có thuế suất → "no-data", không tự đoán', () => {
    const d = computeDuty('VN', 10000, 9000, null);
    expect(d.status).toBe('no-data');
    expect(d.total).toBe(0);
    expect(computeDuty('VN', 10000, 9000, null, false).status).toBe('no-value');
  });
  it('cập nhật quá 90 ngày → cảnh báo', () => {
    expect(computeDuty('VN', 1, 1, T({ updatedAt: '2020-01-01' })).stale).toBe(true);
    expect(computeDuty('VN', 1, 1, T({})).stale).toBe(false);
  });
});

describe('matchTariff', () => {
  const list = [
    T({ id: 'mfn4', hs: '9403', dutyPct: 25 }),
    T({ id: 'mfn6', hs: '940360', dutyPct: 20 }),
    T({ id: 'fta', hs: '940360', origin: 'DE', rateType: 'FTA', fta: 'EVFTA', dutyPct: 0 }),
    T({ id: 'eu', importCountry: 'EU', hs: '940360', dutyPct: 2.7, vatPct: null }),
    T({ id: 'de', importCountry: 'DE', hs: '940360', dutyPct: 2.7, vatPct: 19 }),
  ];
  it('ưu tiên tiền tố HS dài nhất', () => {
    expect(matchTariff(list, { importCountry: 'VN', hs: '94036090', origin: 'CN', preferFta: false })!.id).toBe('mfn6');
    expect(matchTariff(list, { importCountry: 'VN', hs: '940310', origin: 'CN', preferFta: false })!.id).toBe('mfn4');
  });
  it('thuế FTA chỉ khi có C/O và đúng xuất xứ', () => {
    expect(matchTariff(list, { importCountry: 'VN', hs: '940360', origin: 'DE', preferFta: true })!.id).toBe('fta');
    expect(matchTariff(list, { importCountry: 'VN', hs: '940360', origin: 'DE', preferFta: false })!.id).toBe('mfn6');
    expect(matchTariff(list, { importCountry: 'VN', hs: '940360', origin: 'FR', preferFta: true })!.id).toBe('mfn6');
  });
  it('biểu thuế "EU" áp cho nước thành viên; mục riêng của nước ưu tiên hơn', () => {
    expect(matchTariff(list, { importCountry: 'FR', hs: '940360', origin: 'VN', preferFta: false })!.id).toBe('eu');
    expect(matchTariff(list, { importCountry: 'DE', hs: '940360', origin: 'VN', preferFta: false })!.id).toBe('de');
    expect(matchTariff(list, { importCountry: 'US', hs: '940360', origin: 'VN', preferFta: false })).toBeNull();
  });
});

describe('import biểu thuế CSV', () => {
  it('bắt buộc có nguồn và ngày cập nhật', () => {
    const csv = 'Nước nhập,Mã HS,Xuất xứ,Loại,Hiệp định,Thuế NK,VAT,Nguồn,Ngày cập nhật\nVN,9403.60,DE,FTA,EVFTA,0,10,https://x.gov,01/11/2026\nVN,940360,*,MFN,,25,10,,01/11/2026\nVN,940360,*,MFN,,25,10,https://x,';
    const { entries, errors } = parseTariffRows(parseCsv(csv));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ importCountry: 'VN', hs: '940360', origin: 'DE', rateType: 'FTA', fta: 'EVFTA', dutyPct: 0, vatPct: 10, updatedAt: '2026-11-01' });
    expect(errors).toHaveLength(2);
  });
});

describe('gợi ý FTA', () => {
  it('VN–DE: EVFTA; VN–GB: UKVFTA, CPTPP; VN–TH: ATIGA, RCEP', () => {
    expect(ftasBetween('VN', 'DE')).toEqual(['EVFTA']);
    expect(ftasBetween('VN', 'GB')).toEqual(expect.arrayContaining(['UKVFTA', 'CPTPP']));
    expect(ftasBetween('TH', 'VN')).toEqual(expect.arrayContaining(['ATIGA', 'RCEP']));
    expect(ftasBetween('US', 'DE')).toEqual([]);
  });
});
