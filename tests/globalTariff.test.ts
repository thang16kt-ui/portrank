import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleApi } from '../server/api.mjs';
import { otherTaxesFor } from '../src/data/otherTaxes';
import { standardVat, VAT_DATA } from '../src/data/vatRates';
import { describeHs, fmtHsCode, hs6Of, indexHs, searchHs, type HsCatalog } from '../src/lib/hs';
import { OFFICIAL_SOURCES, TaricSource, UsHtsSource, WitsTariffSource, clearTariffCache, convertToHs2022, parseTaricDetails, parseWits, parseWitsAll, splitDuty, usEntry, witsReporter, type HtsRow, type WitsBulkFile } from '../src/lib/tariffSources';
import { computeDuty } from '../src/lib/duty';
import witsAll from './fixtures/wits-918-000-all-2023-sample.json';
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
    for (const c of ['DE', 'FR', 'NL']) expect(OFFICIAL_SOURCES.find((s) => s.supports(c))?.id, c).toBe('taric');
    for (const c of ['VN', 'JP', 'KR', 'IN', 'BR', 'AU', 'CA', 'MX', 'TH', 'AE']) expect(OFFICIAL_SOURCES.find((s) => s.supports(c))?.id, c).toBe('wits');
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
    expect(urls[0]).toBe('/data/wits/EU.json'); // thử file tải sẵn trước (ở đây: 404 → gọi trực tiếp)
    expect(urls.slice(1).every((u) => u.startsWith('/api/wits/reporter/918/'))).toBe(true);
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

describe('WITS tải sẵn (public/data/wits – trang tĩnh không gọi được WITS qua rewrite)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearTariffCache();
  });
  const res = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body }) as Response;
  it('đọc product=all: mã sản phẩm nằm ở vị trí khác keyPosition khai báo', () => {
    const { nomen, rates } = parseWitsAll(witsAll);
    expect(nomen).toBe('H6');
    expect(rates).toEqual({ '090111': 0, '220300': 0, '610910': 12, '640411': 16.9 });
  });
  it('nước có file tải sẵn → không gọi /api/wits để lấy MFN; WITS bị chặn (403) → vẫn có thuế', async () => {
    const file: WitsBulkFile = { reporter: '918', year: 2023, nomen: 'H6', fetchedAt: '2026-11-17', rates: { '610910': 12, '640411': [16.9, 16.9, 17, 2] } };
    const f = vi.fn(async (url: string) => (url === '/data/wits/EU.json' ? res(200, file) : res(403, {})));
    vi.stubGlobal('fetch', f);
    const r = await WitsTariffSource.lookup({ importCountry: 'FR', hs: '640411', origin: 'VN', preferFta: true });
    expect(r.entry).toMatchObject({ importCountry: 'FR', dutyPct: 16.9, effectiveDate: '2023-01-01', vatPct: standardVat('FR')?.pct });
    expect(r.notes.join(' ')).toContain('từ 16.9% đến 17%');
    // xuất xứ VN: không gọi WITS trực tiếp, dùng dữ liệu ưu đãi tải sẵn (file này không có → ghi rõ)
    expect(r.notes.join(' ')).toContain('không có biểu thuế ưu đãi cho hàng xuất xứ Việt Nam');
    expect(f.mock.calls.filter((c) => String(c[0]).startsWith('/api/wits'))).toHaveLength(0);
    // xuất xứ khác: gọi trực tiếp, bị chặn (403) → ghi chưa kiểm tra được
    clearTariffCache();
    const cn = await WitsTariffSource.lookup({ importCountry: 'FR', hs: '640411', origin: 'CN', preferFta: true });
    expect(cn.entry?.dutyPct).toBe(16.9);
    expect(cn.notes.join(' ')).toContain('Chưa kiểm tra được thuế ưu đãi');
  });
  it('mã HS6 không có trong biểu thuế tải sẵn → báo lỗi, không đoán', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(200, { reporter: '918', year: 2023, nomen: 'H6', fetchedAt: '', rates: { '610910': 12 } })));
    const r = await WitsTariffSource.lookup({ importCountry: 'DE', hs: '999999', origin: 'VN', preferFta: false });
    expect(r.entry).toBeNull();
    expect(r.error).toContain('không có mã HS6 999999');
  });
  it('dữ liệu tải sẵn: chỉ mục có EU, Việt Nam và các nước nhập khẩu chính; mọi file khoá theo HS 2022', () => {
    const idx = JSON.parse(readFileSync('public/data/wits/index.json', 'utf8')) as { countries: Record<string, { year: number; nomen: string; count: number }> };
    for (const c of ['EU', 'VN', 'CN', 'JP', 'KR', 'IN', 'AU', 'CA', 'MX', 'BR', 'TH', 'ID']) expect(idx.countries[c], c).toBeDefined();
    const br = JSON.parse(readFileSync('public/data/wits/BR.json', 'utf8')) as WitsBulkFile;
    expect(br.converted).toBe('H5');
    expect(br.rates['610910']).toBeDefined();
  });
  it('quy đổi sang HS 2022: một mã mới từ nhiều mã cũ → trung bình + khoảng', () => {
    const { rates, conv } = convertToHs2022({ '111111': 10, '222222': 20, '333333': 5 }, { '111111': ['111111'], '999999': ['222222', '333333'], '888888': ['777777'] });
    expect(rates).toEqual({ '111111': 10, '999999': [12.5, 5, 20, 2] });
    expect(conv).toEqual({ '999999': ['222222', '333333'] });
  });
  it('xuất xứ Việt Nam: dùng thuế ưu đãi tải sẵn (ASEAN) khi có C/O; không có C/O → MFN kèm ghi chú', async () => {
    const file: WitsBulkFile = { reporter: '764', year: 2023, nomen: 'H6', fetchedAt: '', rates: { '610910': 30, '090111': 0 }, prefVN: { partner: 'N52', year: 2021, rates: { '610910': 0 } } };
    vi.stubGlobal('fetch', vi.fn(async () => res(200, file)));
    const co = await WitsTariffSource.lookup({ importCountry: 'TH', hs: '610910', origin: 'VN', preferFta: true });
    expect(co.entry).toMatchObject({ rateType: 'FTA', dutyPct: 0, fta: 'TRAINS – ASEAN', effectiveDate: '2021-01-01' });
    clearTariffCache();
    const noCo = await WitsTariffSource.lookup({ importCountry: 'TH', hs: '610910', origin: 'VN', preferFta: false });
    expect(noCo.entry).toMatchObject({ rateType: 'MFN', dutyPct: 30 });
    expect(noCo.notes.join(' ')).toContain('tích “Có C/O”');
    clearTariffCache();
    const zero = await WitsTariffSource.lookup({ importCountry: 'TH', hs: '090111', origin: 'VN', preferFta: true });
    expect(zero.entry?.rateType).toBe('MFN');
    expect(zero.notes.join(' ')).toContain('không thấp hơn MFN');
  });
  it('mã quy đổi từ HS 2017 → ghi mã gốc', async () => {
    const file: WitsBulkFile = { reporter: '076', year: 2023, nomen: 'H5', converted: 'H5', conv: { '850760': ['850780'] }, fetchedAt: '', rates: { '850760': 18 } };
    vi.stubGlobal('fetch', vi.fn(async () => res(200, file)));
    const r = await WitsTariffSource.lookup({ importCountry: 'BR', hs: '850760', origin: 'CN', preferFta: false });
    expect(r.entry?.dutyPct).toBe(18);
    expect(r.notes.join(' ')).toContain('quy đổi từ mã 850780');
  });
});

describe('EU TARIC (nguồn chính thức cho 27 nước EU)', () => {
  const fx = (f: string) => readFileSync(`tests/fixtures/${f}`, 'utf8');
  const res = (status: number, body: string) => ({ ok: status < 300, status, text: async () => body, json: async () => JSON.parse(body) }) as Response;
  afterEach(() => {
    vi.unstubAllGlobals();
    clearTariffCache();
  });
  it('tách thuế phức hợp: phần % và phần tuyệt đối', () => {
    expect(splitDuty('8.00 % + 2.50 EUR / 100 kg')).toEqual({ pct: 8, specific: '2.50 EUR / 100 kg' });
    expect(splitDuty('90¢/pr. + 37.5%')).toEqual({ pct: 37.5, specific: '90¢/pr.' });
    expect(splitDuty('Free')).toEqual({ pct: 0, specific: null });
    expect(splitDuty('3.00 EUR')).toEqual({ pct: null, specific: '3.00 EUR' });
  });
  it('đọc trang chi tiết: vùng áp dụng, loại biện pháp, thuế suất, hiệu lực, mã bổ sung, nhập/xuất', () => {
    const m = parseTaricDetails(fx('taric-6109100010-VN-details.html'));
    expect(m.find((x) => x.type === 'Third country duty')).toMatchObject({ areaCode: '1011', duty: '12.00 %', start: '1997-01-01', import: true });
    expect(m.find((x) => x.type === 'Tariff preference')).toMatchObject({ areaCode: 'VN', area: 'Viet Nam', duty: '0 %', start: '2025-01-01' });
    const ad = parseTaricDetails(fx('taric-8712003000-CN-details.html'));
    expect(ad.find((x) => x.addCode === 'B999')).toMatchObject({ type: 'Definitive anti-dumping duty', duty: '48.50 %', areaCode: 'CN' });
    expect(ad.filter((x) => !x.import).length).toBeGreaterThan(0);
  });
  const stub = (page: string, details: string) =>
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.startsWith('/api/taric/measures.jsp') ? res(200, fx(page)) : url.startsWith('/api/taric/measures_details.jsp') ? res(200, fx(details)) : res(404, '{}'))));
  it('áo thun xuất xứ VN vào Đức: MFN 12%; có C/O → EVFTA 0%; VAT Đức; thuế hàng giá trị thấp chỉ ghi chú', async () => {
    stub('taric-6109100010-VN-page.html', 'taric-6109100010-VN-details.html');
    const noCo = await TaricSource.lookup({ importCountry: 'DE', hs: '6109100010', origin: 'VN', preferFta: false });
    expect(noCo.entry).toMatchObject({ importCountry: 'DE', dutyPct: 12, rateType: 'MFN', vatPct: 19, verified: true });
    expect(noCo.entry?.id.startsWith('taric-')).toBe(true);
    expect(noCo.notes.join(' ')).toContain('EVFTA');
    expect(noCo.notes.join(' ')).toContain('bưu kiện thương mại điện tử giá trị thấp');
    const co = await TaricSource.lookup({ importCountry: 'DE', hs: '6109100010', origin: 'VN', preferFta: true });
    expect(co.entry).toMatchObject({ dutyPct: 0, rateType: 'FTA', fta: 'EU – EVFTA', effectiveDate: '2025-01-01' });
  });
  it('xe đạp xuất xứ Trung Quốc: MFN 14% + chống bán phá giá 48,5% (mức "Other"), có chịu VAT', async () => {
    stub('taric-8712003000-CN-page.html', 'taric-8712003000-CN-details.html');
    const r = await TaricSource.lookup({ importCountry: 'NL', hs: '8712003000', origin: 'CN', preferFta: false });
    expect(r.entry).toMatchObject({ dutyPct: 14, additionalPct: 48.5, additionalLabel: 'Definitive anti-dumping duty' });
    expect(r.notes.join(' ')).toContain('công ty có mức riêng');
    expect(r.notes.join(' ')).toContain('Import control of fluorinated greenhouse gases');
    const d = computeDuty('NL', 1000, 900, r.entry);
    expect(d.duty).toBeCloseTo(140);
    expect(d.additional).toBeCloseTo(485);
    expect(d.vat).toBeCloseTo((1000 + 140 + 485) * 0.21);
  });
  it('TARIC không phản hồi → dùng WITS (biểu thuế chung EU tải sẵn), ghi rõ', async () => {
    const file: WitsBulkFile = { reporter: '918', year: 2023, nomen: 'H6', fetchedAt: '', rates: { '610910': 12 } };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('/data/wits/EU.json') ? res(200, JSON.stringify(file)) : res(502, 'bad gateway'))));
    const r = await TaricSource.lookup({ importCountry: 'FR', hs: '610910', origin: 'VN', preferFta: false });
    expect(r.provider).toBe('wits');
    expect(r.entry?.dutyPct).toBe(12);
    expect(r.notes[0]).toContain('Không gọi được TARIC');
  });
});

describe('thuế phức hợp Mỹ', () => {
  it('"90¢/pr. + 37.5%" → tính 37,5%, hiển thị phần tuyệt đối', () => {
    const row: HtsRow = { htsno: '6404.11.79', description: 'Other', indent: '6', general: '90¢/pr. + 37.5%', special: 'Free (AU,BH,CL,CO,IL,JO,KR,MA,OM,P,PA,PE,S,SG)', other: '' };
    const { entry, notes } = usEntry(row, 'VN', false);
    expect(entry).toMatchObject({ dutyPct: 37.5, specificDuty: '90¢/pr.' });
    expect(notes[0]).toContain('phần 90¢/pr. chưa tính');
    expect(usEntry(row, 'KR', true).entry).toMatchObject({ dutyPct: 0, rateType: 'FTA' });
    expect(usEntry(row, 'KR', true).entry?.specificDuty).toBeUndefined();
    void UsHtsSource;
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

describe('server/api.mjs – /api/taric', () => {
  it('chỉ chuyển tiếp 2 trang TARIC, mã hàng 6–10 số', async () => {
    expect((await handleApi('GET', '/api/taric/other.jsp?Taric=610910'))?.status).toBe(404);
    expect((await handleApi('GET', '/api/taric/measures.jsp?Taric=61'))?.status).toBe(400);
    const f = vi.fn(async () => ({ ok: true, status: 200, text: async () => '<html>ok</html>' }) as unknown as Response);
    vi.stubGlobal('fetch', f);
    const r = await handleApi('GET', '/api/taric/measures.jsp?Lang=en&Taric=610910&Area=VN');
    expect(r).toMatchObject({ status: 200, body: '<html>ok</html>' });
    expect(String((f.mock.calls[0] as unknown[])[0])).toBe('https://ec.europa.eu/taxation_customs/dds2/taric/measures.jsp?Lang=en&Taric=610910&Area=VN');
    vi.unstubAllGlobals();
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
