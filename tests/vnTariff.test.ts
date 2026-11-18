import { afterEach, describe, expect, it, vi } from 'vitest';
import { OFFICIAL_SOURCES, VnTariffSource, clearTariffCache, type WitsBulkFile } from '../src/lib/tariffSources';
import { parseVnTariffTable, vnPreferences, vnRate, type VnTariffFile } from '../src/lib/vnTariff';

// Bảng MẪU (số liệu giả lập để kiểm thử) có tiêu đề 2 tầng như file biểu thuế XNK: ô gộp "Thuế suất ưu đãi đặc biệt" ở tầng trên
const rows: string[][] = [
  ['BIỂU THUẾ XUẤT KHẨU, NHẬP KHẨU'],
  ['', '', 'Thuế suất (%)', '', '', '', 'Thuế suất ưu đãi đặc biệt (%)', '', '', '', ''],
  ['Mã hàng', 'Mô tả hàng hoá', 'Thuế NK thông thường', 'Thuế NK ưu đãi', 'VAT', 'TTĐB', 'ACFTA', 'ATIGA', 'VKFTA', 'EVFTA', 'CPTPP'],
  ['6109', 'Áo phông, áo ba lỗ…'],
  ['6109.10.10', 'Áo lót nam', '30', '20', '10', '', '0', '0', '0', '5', '*'],
  ['6109.10.20', 'Áo phông khác', '30', '20', '10', '', '0', '0', '3,5', '*', '2'],
  ['2203.00.10', 'Bia đen', '52,5', '35', '10', '65', '15', '5', '*', '25', '20'],
];

describe('đọc biểu thuế Việt Nam (Excel/CSV)', () => {
  const { data, problems } = parseVnTariffTable(rows, 'mau.xlsx', '2026-11-18');
  it('nhận dòng tiêu đề 2 tầng, cột MFN (không lấy "thông thường"), VAT, TTĐB và các cột FTA', () => {
    expect(problems).toEqual([]);
    expect(data.ftas).toEqual(['ACFTA', 'ATIGA', 'VKFTA', 'CPTPP', 'EVFTA']);
    expect(Object.keys(data.codes).sort()).toEqual(['22030010', '61091010', '61091020']); // bỏ dòng nhóm 4 số
    expect(data.codes['61091020'].slice(0, 4)).toEqual(['Áo phông khác', 20, 10, null]);
    expect(data.codes['22030010'][3]).toBe(65);
  });
  it('thuế suất: dấu phẩy thập phân, "*" = không được hưởng', () => {
    expect(vnRate('3,5')).toBe(3.5);
    expect(vnRate('*')).toBeNull();
    expect(vnRate('')).toBeNull();
  });
  it('ưu đãi theo xuất xứ: Hàn Quốc → VKFTA; Đức → EVFTA; Nhật → CPTPP; "*" bị loại', () => {
    expect(vnPreferences(data, '61091020', 'KR')).toEqual([{ key: 'VKFTA', label: 'VKFTA (Việt Nam–Hàn Quốc)', pct: 3.5 }]);
    expect(vnPreferences(data, '61091010', 'DE')[0]).toMatchObject({ key: 'EVFTA', pct: 5 });
    expect(vnPreferences(data, '61091010', 'JP')).toEqual([]);
    expect(vnPreferences(data, '61091020', 'JP')[0]).toMatchObject({ key: 'CPTPP', pct: 2 });
  });
  it('thiếu dòng tiêu đề → báo lỗi', () => {
    expect(parseVnTariffTable([['a', 'b']]).problems[0]).toContain('Mã hàng');
  });
});

describe('nguồn "Biểu thuế Việt Nam" trong app', () => {
  const file: VnTariffFile = parseVnTariffTable(rows, 'mau.xlsx', '2026-11-18').data;
  const res = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;
  afterEach(() => {
    vi.unstubAllGlobals();
    clearTariffCache();
  });
  it('dùng cho nước nhập = Việt Nam, trước WITS', () => {
    expect(OFFICIAL_SOURCES.find((s) => s.supports('VN'))?.id).toBe('vn');
  });
  it('mã 8 số + xuất xứ Trung Quốc + có C/O → ACFTA; TTĐB vào thuế khác', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(200, file)));
    const r = await VnTariffSource.lookup({ importCountry: 'VN', hs: '22030010', origin: 'CN', preferFta: true });
    expect(r.entry).toMatchObject({ dutyPct: 15, rateType: 'FTA', fta: 'ACFTA (ASEAN–Trung Quốc)', vatPct: 10, otherPct: 65, verified: true });
    clearTariffCache();
    const mfn = await VnTariffSource.lookup({ importCountry: 'VN', hs: '22030010', origin: 'US', preferFta: true });
    expect(mfn.entry).toMatchObject({ dutyPct: 35, rateType: 'MFN' });
  });
  it('mã 6 số có nhiều dòng 8 số → danh sách để chọn', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(200, file)));
    const r = await VnTariffSource.lookup({ importCountry: 'VN', hs: '610910', origin: 'KR', preferFta: true });
    expect(r.choices?.map((c) => c.code)).toEqual(['61091010', '61091020']);
  });
  it('chưa nạp file → dùng WITS, ghi rõ', async () => {
    const wits: WitsBulkFile = { reporter: '704', year: 2023, nomen: 'H6', fetchedAt: '', rates: { '610910': 20 } };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('/data/vn/tariff.json') ? res(404, {}) : url.endsWith('/data/wits/VN.json') ? res(200, wits) : res(404, {}))));
    const r = await VnTariffSource.lookup({ importCountry: 'VN', hs: '610910', origin: 'US', preferFta: false });
    expect(r.provider).toBe('wits');
    expect(r.entry?.dutyPct).toBe(20);
    expect(r.notes[0]).toContain('Chưa nạp biểu thuế Việt Nam');
  });
});
