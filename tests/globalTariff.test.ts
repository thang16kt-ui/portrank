import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleApi } from '../server/api.mjs';
import { otherTaxesFor } from '../src/data/otherTaxes';
import { standardVat, VAT_DATA } from '../src/data/vatRates';
import { describeHs, fmtHsCode, hs6Of, indexHs, searchHs, type HsCatalog } from '../src/lib/hs';
import { OFFICIAL_SOURCES, WitsTariffSource, clearTariffCache, parseWits, witsReporter } from '../src/lib/tariffSources';
import witsEu from './fixtures/wits-918-000-610910-2023.json';
import witsJp from './fixtures/wits-392-000-610910-2023.json';

const idx = indexHs(JSON.parse(readFileSync('public/data/hs6.json', 'utf8')) as HsCatalog);

describe('chuẩn HS6 (HS 2022 – datasets/harmonized-system)', () => {
  it('danh mục đủ HS6 và có mô tả chương / nhóm', () => {
    expect(idx.hs6.length).toBeGreaterThan(5000);
    expect(idx.catalog.version).toBe('HS 2022');
  });
  it('mã quốc gia 8–10 số → HS6 chuẩn + phần mở rộng quốc gia', () => {
    expect(hs6Of('6109.10.00.12')).toBe('610910');
    const i = describeHs(idx, '6109100012');
    expect(i).toMatchObject({ valid: true, hs6: '610910', national: '0012' });
    expect(i.subheading).toMatch(/cotton/i);
    expect(i.heading).toMatch(/T-shirts/i);
  });
  it('mã không có trong HS 2022 hoặc chưa đủ 6 số → báo lỗi', () => {
    expect(describeHs(idx, '610999').valid).toBe(false);
    expect(describeHs(idx, '610999').problem).toContain('6109');
    expect(describeHs(idx, '6109').problem).toContain('6 số');
  });
  it('gợi ý theo số và theo từ khoá', () => {
    expect(searchHs(idx, '6109').map((h) => h.code)).toEqual(['610910', '610990']);
    expect(searchHs(idx, 'coffee roasted').map((h) => h.code)).toContain('090121');
    expect(fmtHsCode('6109100012')).toBe('6109.10.00.12');
  });
});

describe('WITS / UNCTAD TRAINS', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearTariffCache();
  });
  it('đọc SDMX-JSON: thuế trung bình HS6, khoảng min–max, danh mục HS', () => {
    expect(parseWits(witsEu)).toMatchObject({ pct: 12, min: 12, max: 12, tariffType: 'MFN', nomen: 'H6' });
    expect(parseWits(witsJp)).toMatchObject({ pct: 9.15, min: 7.4, max: 10.9, lines: 2 });
    expect(parseWits({})).toBeNull();
  });
  it('nước EU → biểu thuế chung EU (918); nước khác → mã ISO số', () => {
    expect(witsReporter('DE')).toBe('918');
    expect(witsReporter('JP')).toBe('392');
    expect(witsReporter('VN')).toBe('704');
  });
  it('mọi nước (trừ Anh, Mỹ có nguồn riêng) đều có nguồn tự động', () => {
    expect(OFFICIAL_SOURCES.find((s) => s.supports('GB'))?.id).toBe('uk');
    expect(OFFICIAL_SOURCES.find((s) => s.supports('US'))?.id).toBe('us');
    for (const c of ['DE', 'VN', 'JP', 'KR', 'IN', 'BR', 'AU', 'CA', 'MX', 'TH', 'AE']) expect(OFFICIAL_SOURCES.find((s) => s.supports(c))?.id, c).toBe('wits');
  });
  it('lookup: thử năm gần nhất → lùi dần khi 404; qua /api/wits; VAT tiêu chuẩn của nước nhập', async () => {
    const f = vi.fn(async (url: string) =>
      url.includes('/year/2023/') && url.includes('/partner/000/')
        ? ({ ok: true, status: 200, json: async () => witsEu } as Response)
        : ({ ok: false, status: 404, json: async () => ({}) } as Response),
    );
    vi.stubGlobal('fetch', f);
    const r = await WitsTariffSource.lookup({ importCountry: 'DE', hs: '6109100010', origin: 'VN', preferFta: true });
    const urls = f.mock.calls.map((c) => String(c[0]));
    expect(urls.every((u) => u.startsWith('/api/wits/reporter/918/'))).toBe(true);
    expect(urls.some((u) => u.includes('/partner/704/'))).toBe(true);
    expect(r.entry).toMatchObject({ importCountry: 'DE', hs: '610910', dutyPct: 12, rateType: 'MFN', vatPct: 19, effectiveDate: '2023-01-01', verified: false });
    expect(r.entry?.id.startsWith('wits-')).toBe(true);
    expect(r.notes.join(' ')).toContain('năm 2023');
    expect(r.notes.join(' ')).toContain('không có thuế ưu đãi riêng');
  });
  it('HS6 nhiều dòng quốc gia → ghi rõ khoảng thuế', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('/year/2023/') && url.includes('/partner/000/') ? ({ ok: true, status: 200, json: async () => witsJp } as Response) : ({ ok: false, status: 404, json: async () => ({}) } as Response))));
    const r = await WitsTariffSource.lookup({ importCountry: 'JP', hs: '610910', origin: 'VN', preferFta: false });
    expect(r.entry?.dutyPct).toBe(9.15);
    expect(r.notes.join(' ')).toContain('từ 7.4% đến 10.9%');
  });
  it('không có số liệu 6 năm gần nhất → báo lỗi, không đoán thuế', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response));
    const r = await WitsTariffSource.lookup({ importCountry: 'KE', hs: '610910', origin: 'VN', preferFta: false });
    expect(r.entry).toBeNull();
    expect(r.error).toContain('chưa có thuế MFN');
  });
});

describe('VAT/GST tiêu chuẩn & các thuế khác', () => {
  it('VAT tiêu chuẩn theo nước (gói sales-tax)', () => {
    expect(Object.keys(VAT_DATA.rates).length).toBeGreaterThan(100);
    expect(standardVat('DE')?.pct).toBe(19);
    expect(standardVat('US')?.type).toBe('none');
  });
  it('thuế khác theo nước nhập + chương HS', () => {
    const names = (c: string, hs: string) => otherTaxesFor(c, hs).map((t) => t.name);
    expect(names('VN', '22030010').some((n) => n.includes('TTĐB'))).toBe(true);
    expect(names('VN', '610910').some((n) => n.includes('TTĐB'))).toBe(false);
    expect(names('DE', '720851').some((n) => n.includes('CBAM'))).toBe(true);
    expect(names('US', '940350').some((n) => n.includes('Section 232'))).toBe(true);
    expect(names('AE', '240220').some((n) => n.includes('GCC'))).toBe(true);
    for (const c of ['VN', 'JP', 'KE']) expect(names(c, '610910').some((n) => n.includes('chống bán phá giá'))).toBe(true);
  });
});

describe('server/api.mjs – /api/wits', () => {
  it('chỉ nhận đúng dạng đường dẫn TRAINS', async () => {
    expect((await handleApi('GET', '/api/wits/reporter/9x8/partner/000/product/610910/year/2023/datatype/reported'))?.status).toBe(400);
    expect((await handleApi('GET', '/api/wits/reporter/918/x'))?.status).toBe(400);
    expect(await handleApi('GET', '/api/wits/../../etc')).toBeNull(); // bị chuẩn hoá ra ngoài /api → không xử lý
  });
  it('chuyển tiếp tới WITS, giữ nguyên 404 (năm chưa có số liệu)', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response);
    vi.stubGlobal('fetch', f);
    const r = await handleApi('GET', '/api/wits/reporter/111/partner/000/product/123456/year/2099/datatype/reported');
    expect(r?.status).toBe(404);
    expect(String((f.mock.calls[0] as unknown[])[0])).toBe('https://wits.worldbank.org/API/V1/SDMX/V21/datasource/TRN/reporter/111/partner/000/product/123456/year/2099/datatype/reported?format=JSON');
    vi.unstubAllGlobals();
  });
});
