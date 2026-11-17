import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleApi } from '../server/api.mjs';
import { computeDuty } from '../src/lib/duty';
import {
  TARIFF_SNAPSHOT, UkTariffSource, UsHtsSource, chapter99For, clearTariffCache, parseChapter99, parseUkCommodity, usEntry, type HtsRow,
} from '../src/lib/tariffSources';
import { matchTariff, type TariffEntry } from '../src/providers/TariffProvider';
import ukCommodity from './fixtures/uk-commodity-9403609000.json';

const row = (htsno: string, general: string, description: string, special = ''): HtsRow => ({ htsno, general, special, other: '', description, indent: '1' });

describe('Chương 99 của Mỹ theo xuất xứ', () => {
  const rows = [
    row('9903.01.25', 'The duty provided in the applicable subheading + 10%', 'Articles the product of any country, except for products described in headings…'),
    row('9903.02.69', 'The duty provided in the applicable subheading + 20%', 'Except for goods loaded…, articles the product of Vietnam, as provided for in…'),
    row('9903.02.74', 'The duty provided in the applicable subheading', 'Articles the product of the European Union, as provided for in…'),
    row('9903.88.15', 'The duty provided in the applicable subheading + 7.5%', 'Articles the product of China, as provided for in U.S. note 20(r)…'),
    row('9403.60.80', '15%', 'Other'),
  ];
  const items = parseChapter99(rows);
  it('chỉ lấy dòng 9903 có thuế % và nhận diện xuất xứ', () => {
    expect(items.map((i) => i.code)).toEqual(['9903.01.25', '9903.02.69', '9903.88.15']);
    expect(items[0].origins).toBeNull();
    expect(items[1]).toMatchObject({ origins: ['VN'], pct: 20 });
    expect(items[2].origins).toEqual(['CN']);
  });
  it('lọc theo xuất xứ: dòng "mọi xuất xứ" + dòng của nước đó', () => {
    expect(chapter99For(items, 'VN').map((i) => i.code)).toEqual(['9903.01.25', '9903.02.69']);
    expect(chapter99For(items, 'JP').map((i) => i.code)).toEqual(['9903.01.25']);
  });
});

describe('Phí MPF/HMF và ưu đãi', () => {
  it('Mỹ: MPF + HMF trên trị giá; xuất xứ USMCA hưởng ưu đãi được miễn MPF', () => {
    const r = row('6109.10.00', '16.5%', 'Of cotton', 'Free (AU,BH,CL,CO,IL,JO,KR,MA,OM,P,PA,PE,S,SG)');
    expect(usEntry(r, 'VN', true).entry).toMatchObject({ rateType: 'MFN', dutyPct: 16.5, feePct: 0.4714 });
    expect(usEntry(r, 'MX', true).entry).toMatchObject({ rateType: 'FTA', dutyPct: 0, feePct: 0.125 });
  });
  it('phí tính trên trị giá hải quan, không vào trị giá tính VAT', () => {
    const e: TariffEntry = { id: 'x', importCountry: 'DE', hs: '610910', origin: '*', rateType: 'MFN', fta: '', dutyPct: 10, vatPct: 20, otherPct: 0, feePct: 1, source: 's', effectiveDate: '', updatedAt: '2026-11-17', verified: true };
    const d = computeDuty('DE', 1000, 900, e);
    expect(d.fees).toBeCloseTo(10);
    expect(d.vat).toBeCloseTo((1000 + 100) * 0.2);
    expect(d.total).toBeCloseTo(100 + 10 + 220);
  });
  it('Anh: cùng thuế suất → ưu tiên hiệp định song phương (UKVFTA) thay vì CPTPP', () => {
    expect(parseUkCommodity(ukCommodity as never, 'VN').pref?.areaId).toBe('VN');
  });
});

describe('bản chụp dữ liệu (npm run tariffs:update)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearTariffCache();
  });
  it('mỗi mức thuế có nguồn, ngày cập nhật và id theo nguồn', () => {
    expect(TARIFF_SNAPSHOT.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const e of TARIFF_SNAPSHOT.entries) {
      expect(e.source, e.id).toBeTruthy();
      expect(e.updatedAt, e.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.id).toMatch(/^(us|uk|manual)-/);
      if (e.id.startsWith('manual-')) expect(e.verified).toBe(false);
    }
  });
  it('mọi mã Mỹ/Anh trong danh mục hàng đều tra ra thuế MFN trong bản chụp', () => {
    const lines = readFileSync('src/data/tariffProducts.csv', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
    const head = lines[0].split(',');
    for (const l of lines.slice(1)) {
      const r = Object.fromEntries(l.split(',').map((v, i) => [head[i], v]));
      for (const c of ['US', 'GB', 'EU'])
        if (r[c]) expect(matchTariff(TARIFF_SNAPSHOT.entries, { importCountry: c === 'EU' ? 'DE' : c, hs: r[c], origin: 'VN', preferFta: false }), `${r.sku} ${c}`).not.toBeNull();
    }
  });
  it('API không phản hồi → dùng bản chụp, ghi rõ ngày; Mỹ kèm Chương 99 theo xuất xứ', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const us = await UsHtsSource.lookup({ importCountry: 'US', hs: '6109100012', origin: 'VN', preferFta: true });
    expect(us.snapshot).toBe(TARIFF_SNAPSHOT.generatedAt);
    expect(us.entry).toMatchObject({ hs: '61091000', rateType: 'MFN' });
    expect(us.additional?.every((a) => !a.origins || a.origins.includes('VN'))).toBe(true);
    expect(us.notes[0]).toContain('bản chụp');
    const uk = await UkTariffSource.lookup({ importCountry: 'GB', hs: '6109100010', origin: 'VN', preferFta: true });
    expect(uk.entry).toMatchObject({ rateType: 'FTA', dutyPct: 0 });
  });
  it('mã không có trong bản chụp → báo lỗi, không đoán thuế', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const r = await UsHtsSource.lookup({ importCountry: 'US', hs: '850440', origin: 'VN', preferFta: false });
    expect(r.entry).toBeNull();
    expect(r.error).toContain('US HTS');
  });
});

describe('server/api.mjs – /api/hts/exportList', () => {
  it('kiểm tra tham số', async () => {
    expect((await handleApi('GET', '/api/hts/exportList?from=abc&to=9403'))?.status).toBe(400);
    expect((await handleApi('GET', '/api/hts/exportList?from=9403.60'))?.status).toBe(400);
  });
  it('chuyển tiếp tới reststop/exportList dạng JSON', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => [] }) as unknown as Response);
    vi.stubGlobal('fetch', f);
    const r = await handleApi('GET', '/api/hts/exportList?from=1234.56&to=1234.56.99.99');
    expect(r?.status).toBe(200);
    expect(String((f.mock.calls[0] as unknown[])[0])).toBe('https://hts.usitc.gov/reststop/exportList?from=1234.56&to=1234.56.99.99&format=JSON&styles=false');
    vi.unstubAllGlobals();
  });
});
