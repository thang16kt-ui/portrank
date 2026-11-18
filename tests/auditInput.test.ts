import { afterEach, describe, expect, it } from 'vitest';
import { computeDuty } from '../src/lib/duty';
import { parseCsv, parseDate, toDecimal, toNumber } from '../src/lib/csv';
import { inputFingerprint, runPlan } from '../src/lib/actions';
import { createTableRateProvider, parseRateRows } from '../src/providers/RateProvider';
import { parseScheduleRows } from '../src/providers/ScheduleProvider';
import { TARIFF_CSV_FULL_HEADER, TARIFF_CSV_HEADER, parseTariffRows, tariffToRow, type TariffEntry } from '../src/providers/TariffProvider';
import { usFees } from '../src/lib/fees';
import { DEFAULT_FORM, useAppStore } from '../src/store/useAppStore';
import { useDataStore } from '../src/store/useDataStore';
import { toCsv } from '../src/lib/csv';

const A = (rows: string[]) => parseTariffRows(parseCsv([TARIFF_CSV_HEADER.join(','), ...rows].join('\n')));

describe('PR-10 · số thập phân ba chữ số', () => {
  it('cột thuế: 0.125 → 0.125; 1.234; 7.5; 0; trống', () => {
    expect([toDecimal('0.125'), toDecimal('1.234'), toDecimal('7.5'), toDecimal('0'), toDecimal('7,5')]).toEqual([0.125, 1.234, 7.5, 0, 7.5]);
    expect(toDecimal('')).toBeNaN();
    expect(toDecimal('1.234,5')).toBeNaN(); // mơ hồ → không đoán
  });
  it('file A duty_pct=0.125 → 0,125% (12.5 USD trên 10000), không phải 125%', () => {
    const r = A(['JP,610910,*,MFN,,0.125,10,0,fixture,,2026-11-18,0']);
    expect(r.entries[0].dutyPct).toBe(0.125);
    expect(computeDuty('JP', 10000, 10000, r.entries[0]).adValorem).toBe(12.5);
  });
  it('bảng giá vẫn hiểu định dạng địa phương "2.150" = 2150 nhưng có cảnh báo', () => {
    expect(toNumber('2.150')).toBe(2150);
    const r = parseRateRows(parseCsv('pol,pod,container,freight_usd\nVNCMT,DEHAM,40HC,2.150'));
    expect(r.entries[0].freight).toBe(2150);
    expect(r.warnings[0]).toContain('phân cách hàng nghìn');
  });
});

describe('PR-11 · CSV round-trip giữ thành phần thuế mở rộng', () => {
  const complex: TariffEntry = {
    id: 'x', importCountry: 'US', hs: '6404110000', origin: '*', rateType: 'MFN', fta: '', dutyPct: 20, vatPct: 0, otherPct: 0,
    specificDuty: '90¢/pr.', additionalPct: 25, additionalLabel: 'AD fixture', fees: usFees('2026-11-18', false),
    source: 'fixture', effectiveDate: '2026-01-01', expiryDate: '2027-12-31', dataYear: 2026, updatedAt: '2026-11-18', verified: false,
  };
  it('xuất định dạng đầy đủ rồi nhập lại → cùng tổng thuế', () => {
    const csv = toCsv([TARIFF_CSV_FULL_HEADER, tariffToRow(complex, true)]);
    const back = parseTariffRows(parseCsv(csv));
    expect(back.errors).toEqual([]);
    const e = back.entries[0];
    expect(e).toMatchObject({ hs: '6404110000', specificDuty: '90¢/pr.', additionalPct: 25, expiryDate: '2027-12-31', dataYear: 2026 });
    const qty = { units: 100, netKg: 0, liters: 0 };
    const ctx = { mode: 'sea' as const, measuresChecked: true, date: '2026-11-18' };
    expect(computeDuty('US', 5000, 5000, e, true, qty, ctx).total).toBe(computeDuty('US', 5000, 5000, complex, true, qty, ctx).total);
  });
  it('12 cột A vẫn xuất được (tương thích), định dạng đầy đủ là file riêng', () => {
    expect(tariffToRow(complex, false)).toHaveLength(12);
    expect(TARIFF_CSV_FULL_HEADER.slice(0, 12)).toEqual(TARIFF_CSV_HEADER);
  });
  it('nguồn ghi thuế tuyệt đối nhưng cột specific trống → cảnh báo + "chưa đủ", không coi là không có thuế', () => {
    const r = A(['JP,610910,*,MFN,,0,10,0,Synthetic fixture; tuyệt đối: 1 USD/kg,,2026-11-18,0']);
    expect(r.warnings[0]).toContain('specific_duty');
    expect(computeDuty('JP', 1000, 1000, r.entries[0], true, undefined, { measuresChecked: true }).completeness).toBe('partial');
  });
  it('cột duty_pct dạng phức hợp "5% + 1 USD/kg" được tách', () => {
    expect(A(['JP,610910,*,MFN,,5% + 1 USD/kg,10,0,fixture,,2026-11-18,0']).entries[0]).toMatchObject({ dutyPct: 5, specificDuty: '1 USD/kg' });
  });
});

describe('PR-14 · mã container không hợp lệ', () => {
  it('40TYPO bị báo lỗi kèm dòng/cột, không trở thành mọi loại', () => {
    const r = parseRateRows(parseCsv('pol,pod,container,freight_usd\nVNCMT,DEHAM,40TYPO,100\nVNCMT,DEHAM,*,200\nVNCMT,DEHAM,40HC,300'));
    expect(r.errors).toEqual([expect.stringContaining('Dòng 2, cột container')]);
    expect(r.entries.map((e) => e.container)).toEqual(['*', '40HC']);
    const p = createTableRateProvider(r.entries.filter((e) => e.container !== '*'));
    expect(p.find({ pol: 'VNCMT', pod: 'DEHAM', container: '20GP', date: '2026-11-18', carriers: [] })).toBeNull();
  });
});

describe('PR-15 · số âm', () => {
  it('thuế âm, cước âm bị loại; số 0 giữ; dòng hợp lệ khác không đổi', () => {
    const t = A(['JP,610910,*,MFN,,-5,10,0,fixture,,2026-11-18,0', 'JP,610920,*,MFN,,0,10,0,fixture,,2026-11-18,0']);
    expect(t.errors[0]).toContain('âm');
    expect(t.entries.map((e) => [e.hs, e.dutyPct])).toEqual([['610920', 0]]);
    const r = parseRateRows(parseCsv('pol,pod,container,freight_usd\nVNCMT,DEHAM,40HC,-100\nVNCMT,DEHAM,40HC,0'));
    expect(r.errors[0]).toContain('âm');
    expect(r.entries.map((e) => e.freight)).toEqual([0]);
  });
});

describe('PR-16 · ngày không có thật và thứ tự mốc', () => {
  it('2026-02-31, 2026-99-99 bị từ chối; 2028-02-29 hợp lệ; ngày có giờ/múi giờ', () => {
    expect(parseDate('2026-02-31').invalid).toBe(true);
    expect(parseDate('2026-99-99').invalid).toBe(true);
    expect(parseDate('2027-02-29').invalid).toBe(true);
    expect(parseDate('2028-02-29')).toMatchObject({ iso: '2028-02-29', invalid: false });
    expect(parseDate('2026-12-31T23:30:00+07:00')).toMatchObject({ iso: '2026-12-31', time: '23:30:00+07:00' });
    expect(parseDate('31/12/2026').iso).toBe('2026-12-31');
    expect(A(['JP,610910,*,MFN,,1,10,0,fixture,2026-02-31,2026-11-18,0']).errors[0]).toContain('effective_date');
  });
  it('báo giá có valid_to trước valid_from bị loại', () => {
    const r = parseRateRows(parseCsv('pol,pod,container,freight_usd,valid_from,valid_to\nVNCMT,DEHAM,40HC,100,2026-12-31,2026-01-01'));
    expect(r.entries).toEqual([]);
    expect(r.errors[0]).toContain('valid_to');
  });
  it('lịch tàu: ETA chuyển tải sau ETA cuối, ETD chuyển tải trước ETD đầu bị loại', () => {
    const h = 'carrier,service,vessel,voyage,pol,etd,ts1_port,ts1_eta,ts1_etd,pod,eta,source';
    const late = parseScheduleRows(parseCsv(`${h}\nMAEU,AE1,A,1,VNCMT,2026-12-01,SGSIN,2027-02-01,2027-02-02,DEHAM,2027-01-05,x`), '2026-11-18');
    const early = parseScheduleRows(parseCsv(`${h}\nMAEU,AE1,A,1,VNCMT,2026-12-01,SGSIN,2026-11-20,2026-11-21,DEHAM,2027-01-05,x`), '2026-11-18');
    const bad = parseScheduleRows(parseCsv(`${h}\nMAEU,AE1,A,1,VNCMT,2026-02-31,,,,DEHAM,2027-01-05,x`), '2026-11-18');
    const ok = parseScheduleRows(parseCsv(`${h}\nMAEU,AE1,A,1,VNCMT,2026-12-01,SGSIN,2026-12-03,2026-12-06,DEHAM,2027-01-05,x`), '2026-11-18');
    expect(late.errors[0]).toContain('sau ETA');
    expect(early.errors[0]).toContain('trước ETD');
    expect(bad.errors[0]).toContain('không có thật');
    expect(ok.entries).toHaveLength(1);
  });
});

describe('PR-17 · kết quả gắn với ảnh chụp đầu vào', () => {
  afterEach(() => useAppStore.setState({ form: DEFAULT_FORM, plan: null, planKey: null, planForm: null }));
  it('đổi giá / HS / vai trò → dấu vân tay khác; đổi Incoterm (chỉ xếp hạng) → không đổi', () => {
    const f = { ...DEFAULT_FORM, hs: '610910010', goodsValue: 10000 };
    const k = inputFingerprint(f);
    expect(inputFingerprint({ ...f, goodsValue: 20000 })).not.toBe(k);
    expect(inputFingerprint({ ...f, hs: '090111' })).not.toBe(k);
    expect(inputFingerprint({ ...f, role: 'buyer' })).not.toBe(k);
    expect(inputFingerprint({ ...f, term: 'DDP' })).toBe(k);
  });
  it('tính xong rồi đổi form: plan vẫn gắn đầu vào cũ, lưu dùng ảnh chụp cũ (không trộn)', async () => {
    useDataStore.setState({ officialTariffs: false, curatedTariffs: true });
    useAppStore.setState({
      form: {
        ...DEFAULT_FORM, hs: '610910010', goodsValue: 10000,
        mine: { kind: 'country', country: 'VN', countryName: 'Việt Nam', label: 'Việt Nam', coord: [106, 16] },
        partner: { kind: 'country', country: 'JP', countryName: 'Nhật Bản', label: 'Nhật Bản', coord: [139, 36] },
      },
    });
    await runPlan();
    const st = useAppStore.getState();
    expect(st.plan).not.toBeNull();
    expect(st.plan!.options[0].duty.entry).toMatchObject({ hs: '610910010', dutyPct: 10.9 });
    st.setForm({ goodsValue: 20000, hs: '090111' });
    const after = useAppStore.getState();
    expect(after.planKey).not.toBe(inputFingerprint(after.form));
    expect(after.planForm!.goodsValue).toBe(10000);
    expect(after.planForm!.hs).toBe('610910010');
  });
});
