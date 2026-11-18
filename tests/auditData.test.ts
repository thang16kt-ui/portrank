import { describe, expect, it } from 'vitest';
import { CURATED_CHARGES, CURATED_MEASURES, CURATED_TARIFFS, CURATED_TARIFF_ISSUES, curatedTariffProvider } from '../src/data/curated';
import { computeDuty, staleness } from '../src/lib/duty';
import { chargesFor, computeMeasures, parseChargeRows, parseMeasureRows } from '../src/lib/otherCharges';
import { parseCsv } from '../src/lib/csv';
import { resolveTariff, type TariffEntry, type TariffQuery } from '../src/providers/TariffProvider';

const T = (p: Partial<TariffEntry>): TariffEntry => ({
  id: p.id ?? Math.random().toString(36), importCountry: 'JP', hs: '640411000', origin: '*', rateType: 'MFN', fta: '', dutyPct: 8, vatPct: 10, otherPct: 0, source: 'fixture', effectiveDate: '', updatedAt: '2026-11-18', verified: false, ...p,
});
const q = (p: Partial<TariffQuery>): TariffQuery => ({ importCountry: 'JP', hs: '640411000', origin: 'VN', preferFta: false, date: '2026-11-18', ...p });
const shuffle = <X,>(xs: X[]) => [...xs].reverse();

describe('Dữ liệu A/B/C (file 2) nạp đúng, không sửa số', () => {
  it('A: 105 dòng, 22 verified=1, không lỗi; mã quốc gia giữ số 0 đầu', () => {
    expect(CURATED_TARIFFS).toHaveLength(105);
    expect(CURATED_TARIFFS.filter((e) => e.verified)).toHaveLength(22);
    expect(CURATED_TARIFFS.filter((e) => e.verified).every((e) => e.importCountry === 'MX')).toBe(true);
    expect(CURATED_TARIFF_ISSUES).toEqual([]);
    expect(CURATED_TARIFFS.find((e) => e.importCountry === 'KR' && e.hs.startsWith('0901'))!.hs).toBe('0901110000');
    expect(CURATED_TARIFFS.find((e) => e.importCountry === 'CA' && e.hs.startsWith('0901'))!.hs).toBe('09011100');
  });
  it('B chỉ có tiêu đề → không tạo dòng thuế 0; kết quả ghi "chưa kiểm tra"', () => {
    expect(CURATED_MEASURES).toEqual([]);
    const r = curatedTariffProvider.resolve!(q({ importCountry: 'CA', hs: '61091000' }));
    const d = computeDuty('CA', 10000, 10000, r.entry, true, undefined, { measures: CURATED_MEASURES, charges: CURATED_CHARGES });
    expect(d.missing.join(' ')).toContain('phòng vệ thương mại');
    expect(d.completeness).toBe('partial');
  });
  it('C: 18 khoản, VAT theo sản phẩm, các khoản thay thế nhau có nhóm', () => {
    expect(CURATED_CHARGES).toHaveLength(18);
    expect(CURATED_CHARGES.filter((c) => c.kind === 'vat').map((c) => `${c.country}:${c.pct}`)).toEqual(['CA:0', 'MX:0', 'JP:8', 'KR:0', 'AU:0']);
    expect(CURATED_CHARGES.filter((c) => c.group === 'AU-IPC')).toHaveLength(4);
  });
});

describe('PR-03 · mã quốc gia không bị rút về HS6, không phụ thuộc thứ tự', () => {
  it('Nhật 610910010 = 10.9, 610910020 = 7.4 (không FTA)', () => {
    expect(curatedTariffProvider.resolve!(q({ hs: '610910010' })).entry).toMatchObject({ hs: '610910010', dutyPct: 10.9 });
    expect(curatedTariffProvider.resolve!(q({ hs: '610910020' })).entry).toMatchObject({ hs: '610910020', dutyPct: 7.4 });
  });
  it('mã cha 610910 (hai mã con khác mức) → danh sách để chọn, không tự chốt', () => {
    const r = curatedTariffProvider.resolve!(q({ hs: '610910' }));
    expect(r.entry).toBeNull();
    expect(r.choices!.map((c) => [c.code, c.dutyPct])).toEqual([['610910010', 10.9], ['610910020', 7.4]]);
  });
  it('đảo thứ tự dòng không đổi kết quả', () => {
    const rows = [T({ id: 'a', hs: '610910010', dutyPct: 10.9 }), T({ id: 'b', hs: '610910020', dutyPct: 7.4 })];
    for (const hs of ['610910', '610910010', '610910020'])
      expect(JSON.stringify(resolveTariff(rows, q({ hs })))).toBe(JSON.stringify(resolveTariff(shuffle(rows), q({ hs }))));
  });
  it('các mã con cùng mọi mức (Mexico cà phê) → tính theo mã cha đã nhập, không gán mã địa lý', () => {
    const r = curatedTariffProvider.resolve!(q({ importCountry: 'MX', hs: '090111' }));
    expect(r.entry).toMatchObject({ hs: '090111', dutyPct: 20 });
  });
  it('WITS (HS6, nhiều dòng quốc gia) → mức ước tính, không coi là đủ', () => {
    const e = T({ hs: '610910', dutyPct: 9.15, estimate: 'trung bình HS6' });
    expect(computeDuty('JP', 1000, 1000, e, true, undefined, { measuresChecked: true }).completeness).toBe('partial');
  });
});

describe('PR-04 · VAT/GST theo sản phẩm', () => {
  it('Canada cà phê hạt thực phẩm: dòng A ghi GST 0; mức tiêu chuẩn tạm tính được thay bằng quy tắc bảng C', () => {
    expect(curatedTariffProvider.resolve!(q({ importCountry: 'CA', hs: '09011100' })).entry!.vatPct).toBe(0);
    const wits = T({ importCountry: 'CA', hs: '090111', dutyPct: 0, vatPct: 5, vatProvisional: true });
    const d = computeDuty('CA', 1000, 1000, wits, true, undefined, { charges: chargesFor(CURATED_CHARGES, 'CA', '090111', '2026-11-18'), measuresChecked: true });
    expect(d.vatPct).toBe(0);
    expect(d.conditions.join(' ')).toContain('mục đích sử dụng');
    expect(d.completeness).toBe('complete');
  });
  it('chỉ biết mức tiêu chuẩn → partial (tạm tính), không coi là đã xác minh', () => {
    const d = computeDuty('CA', 1000, 1000, T({ importCountry: 'CA', hs: '610910', vatPct: 5, vatProvisional: true }), true, undefined, { measuresChecked: true });
    expect(d.vat).toBe(Math.round((1000 + 80) * 5) / 100);
    expect(d.completeness).toBe('partial');
    expect(d.missing.join(' ')).toContain('tiêu chuẩn');
  });
  it('Nhật cà phê 8% (mức giảm), áo thun 10% (mức chuẩn) theo bảng A', () => {
    expect(curatedTariffProvider.resolve!(q({ hs: '090111000' })).entry!.vatPct).toBe(8);
    expect(curatedTariffProvider.resolve!(q({ hs: '610910010' })).entry!.vatPct).toBe(10);
  });
});

describe('PR-05 · chọn FTA không phụ thuộc thứ tự CSV', () => {
  const rows = [T({ id: 'mfn' }), T({ id: 'c', origin: 'VN', rateType: 'FTA', fta: 'CPTPP', dutyPct: 1.4 }), T({ id: 'v', origin: 'VN', rateType: 'FTA', fta: 'VJEPA', dutyPct: 0 })];
  it('đảo thứ tự → cùng kết quả; chưa chọn hiệp định → mức thấp nhất kèm điều kiện', () => {
    const a = resolveTariff(rows, q({ preferFta: true })), b = resolveTariff(shuffle(rows), q({ preferFta: true }));
    expect(a.entry!.fta).toBe('VJEPA');
    expect(b.entry!.fta).toBe('VJEPA');
    expect(a.conditions[0]).toContain('Chưa chọn hiệp định');
  });
  it('chọn hiệp định cụ thể → đúng mức của hiệp định đó', () => {
    expect(resolveTariff(rows, q({ preferFta: true, fta: 'cptpp' })).entry!.dutyPct).toBe(1.4);
  });
  it('không có C/O → MFN, và nêu mức ưu đãi có thể xin', () => {
    const r = resolveTariff(rows, q({ preferFta: false }));
    expect(r.entry!.rateType).toBe('MFN');
    expect(r.notes.join(' ')).toContain('VJEPA 0%');
  });
  it('dữ liệu thật: Nhật giày 640411000, VN: 4 hiệp định, chọn CPTPP → 1.4', () => {
    const r = curatedTariffProvider.resolve!(q({ preferFta: true }));
    expect(r.alternatives.map((e) => e.fta || 'MFN').sort()).toEqual(['AJCEP', 'CPTPP', 'MFN', 'RCEP', 'VJEPA']);
    expect(curatedTariffProvider.resolve!(q({ preferFta: true, fta: 'CPTPP' })).entry!.dutyPct).toBe(1.4);
  });
});

describe('PR-06 · ngày hiệu lực tham gia chọn mức', () => {
  const rows = [T({ id: 'future', dutyPct: 3, effectiveDate: '2030-01-01' }), T({ id: 'cur', dutyPct: 8, effectiveDate: '2026-01-01' })];
  it('mức tương lai đứng trước vẫn không được dùng trước ngày hiệu lực', () => {
    expect(resolveTariff(rows, q({ date: '2026-11-18' })).entry!.id).toBe('cur');
    expect(resolveTariff(shuffle(rows), q({ date: '2026-11-18' })).entry!.id).toBe('cur');
  });
  it('trước / đúng / sau ngày chuyển mức', () => {
    expect(resolveTariff(rows, q({ date: '2029-12-31' })).entry!.id).toBe('cur');
    expect(resolveTariff(rows, q({ date: '2030-01-01' })).entry!.id).toBe('future');
    expect(resolveTariff(rows, q({ date: '2031-06-01' })).entry!.id).toBe('future');
  });
  it('dòng hết hiệu lực không được dùng để chốt', () => {
    const r = resolveTariff([T({ id: 'old', expiryDate: '2025-12-31' })], q({}));
    expect(r.entry).toBeNull();
    expect(r.notes[0]).toContain('hết hiệu lực');
  });
});

describe('PR-07 · tuổi dữ liệu theo năm biểu thuế, không theo ngày tải', () => {
  it('biểu 2019 tải lại hôm nay vẫn cảnh báo', () => {
    const e = T({ dataYear: 2019, updatedAt: '2026-11-18', fetchedAt: '2026-11-18' });
    expect(staleness(e, '2026-11-18').stale).toBe(true);
    expect(computeDuty('JP', 1, 1, e, true, undefined, { date: '2026-11-18' }).staleReason).toContain('2019');
  });
  it('biểu hiện hành đã xác minh: không cảnh báo', () => {
    expect(staleness(T({ updatedAt: '2026-11-18', verified: true }), '2026-11-18').stale).toBe(false);
  });
});

describe('PR-20 · bảng B (phòng vệ) và C (thuế/phí khác)', () => {
  const B = parseMeasureRows(parseCsv(`import_country,hs,origin,measure,company,rate_pct,specific,case_id,source,effective_date,expiry_date,updated_at
XX,640411,VN,AD,*,20,,AD-1,fixture,2025-01-01,2030-12-31,2026-11-18
XX,640411,VN,AD,ACME Co,5,,AD-1,fixture,2025-01-01,2030-12-31,2026-11-18
XX,640411,VN,SG,*,,1 USD/pr.,SG-1,fixture,2024-01-01,2025-12-31,2026-11-18
XX,61091010,VN,AD,*,10,,AD-2,fixture,2025-01-01,,2026-11-18
XX,640411,VN,CVD,*,,,CVD-1,fixture,2025-01-01,,2026-11-18`));
  it('dòng không có mức bị từ chối (không coi là 0)', () => {
    expect(B.measures).toHaveLength(4);
    expect(B.errors[0]).toContain('không được coi là 0');
  });
  it('mức chung khi chưa biết công ty; mức riêng khi có; biện pháp hết hạn bị bỏ', () => {
    const base = { country: 'XX', hs: '640411', origin: 'VN', date: '2026-11-18', customsValue: 1000 };
    const g = computeMeasures(B.measures, base);
    expect(g.lines.map((l) => [l.label, l.amount])).toEqual([['AD AD-1', 200]]);
    expect(g.notes.join(' ')).toContain('ACME Co');
    expect(g.notes.join(' ')).toContain('hết hạn');
    expect(computeMeasures(B.measures, { ...base, company: 'acme' }).lines[0].amount).toBe(50);
    expect(computeMeasures(B.measures, { ...base, origin: 'CN' }).lines).toEqual([]);
  });
  it('biện pháp chỉ ở mã con → cần mã chi tiết; thuế bổ sung có chịu VAT', () => {
    expect(computeMeasures(B.measures, { country: 'XX', hs: '610910', origin: 'VN', date: '2026-11-18', customsValue: 1000 }).missing[0]).toContain('61091010');
    const d = computeDuty('XX', 1000, 1000, T({ importCountry: 'XX', hs: '640411', dutyPct: 0, vatPct: 10 }), true, undefined, { measures: B.measures, origin: 'VN', date: '2026-11-18' });
    expect(d.additional).toBe(200);
    expect(d.vat).toBe(120);
  });
  it('Hàn Quốc nội thất: thuế tiêu thụ 20% phần vượt ngưỡng mỗi món + giáo dục 30% + nông thôn 10%, vào cơ sở VAT', () => {
    const e = curatedTariffProvider.resolve!(q({ importCountry: 'KR', hs: '9403501000' })).entry!;
    const charges = chargesFor(CURATED_CHARGES, 'KR', '9403501000', '2026-11-18');
    const none = computeDuty('KR', 20000, 20000, e, true, { units: 0, netKg: 0, liters: 0 }, { charges, measuresChecked: true });
    expect(none.completeness).toBe('needs-input');
    expect(none.needInputs[0]).toContain('Số lượng món');
    // 2 món × 10000 USD; ngưỡng 5.000.000 KRW × tỷ giá
    const d = computeDuty('KR', 20000, 20000, e, true, { units: 2, netKg: 0, liters: 0 }, { charges, measuresChecked: true });
    const th = 5_000_000 * 0.000748;
    const ict = Math.round(2 * (10000 - th) * 0.2 * 100) / 100;
    expect(d.otherLines.map((l) => l.amount)).toEqual([ict, Math.round(ict * 0.3 * 100) / 100, Math.round(ict * 0.1 * 100) / 100]);
    expect(d.vatBase).toBeCloseTo(20000 + d.other, 2);
  });
  it('Mexico: DTA 0.8% có mức tối thiểu, ưu đãi hiệp định → DTA cố định (không cộng cả hai); phí prevalidación chưa rõ VAT', () => {
    const charges = chargesFor(CURATED_CHARGES, 'MX', '61091003', '2026-11-18');
    const mfn = computeDuty('MX', 100, 100, T({ importCountry: 'MX', hs: '61091003', dutyPct: 35, vatPct: 16 }), true, undefined, { charges, measuresChecked: true });
    const min = Math.round(461.61 * 0.054161 * 100) / 100;
    expect(mfn.otherLines.map((l) => l.label)).toEqual(['DTA thông thường', 'Prevalidacion electronica']);
    expect(mfn.otherLines[0].amount).toBe(min);
    expect(mfn.missing.join(' ')).toContain('Prevalidacion');
    const fta = computeDuty('MX', 100, 100, T({ importCountry: 'MX', hs: '61091003', rateType: 'FTA', fta: 'CPTPP', origin: 'VN', dutyPct: 15, vatPct: 16 }), true, undefined, { charges, measuresChecked: true });
    expect(fta.otherLines.map((l) => l.label)[0]).toContain('DTA cố định');
    expect(fta.assumptions.join(' ')).toContain('hiệp định');
  });
  it('Úc: phí khai điện tử theo khung trị giá (không cộng khai giấy), phí sinh học theo đường biển; khoản dịch vụ phát sinh không cộng', () => {
    const charges = chargesFor(CURATED_CHARGES, 'AU', '61091000', '2026-11-18');
    const d = computeDuty('AU', 5000, 5000, T({ importCountry: 'AU', hs: '61091000', dutyPct: 5, vatPct: 10 }), true, undefined, { charges, mode: 'sea', measuresChecked: true });
    expect(d.otherLines.map((l) => l.label)).toEqual(['Import Processing Charge khai điện tử mức 1', 'Biosecurity Full Import Declaration charge đường biển']);
    expect(d.contingent[0]).toContain('sinh học');
    const big = computeDuty('AU', 20000, 20000, T({ importCountry: 'AU', hs: '61091000', dutyPct: 5, vatPct: 10 }), true, undefined, { charges, mode: 'sea', measuresChecked: true });
    expect(big.otherLines[0].label).toBe('Import Processing Charge khai điện tử mức 2');
    expect(d.vatBase).toBe(5000 + 250); // vat_base = 0 → không cộng phí vào GST
  });
  it('bộ đọc C báo lỗi số âm / ngày không có thật', () => {
    const r = parseChargeRows(parseCsv(`import_country,hs_prefix,tax_name,rate_pct,specific,basis,vat_base,min_max,source,effective_date,updated_at
XX,,Phí âm,-1,,customs,0,,s,,2026-11-18
XX,,Phí ngày sai,1,,customs,0,,s,2026-02-31,2026-11-18`));
    expect(r.rules).toEqual([]);
    expect(r.errors).toHaveLength(2);
  });
});
