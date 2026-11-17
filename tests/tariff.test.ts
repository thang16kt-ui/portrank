import { describe, expect, it } from 'vitest';
import { HS6_DESC, PRODUCTS, TARIFF_BOOKS } from '../src/data/tariff';
import type { TariffBook } from '../src/data/tariff/types';
import { DEFAULT_FORM } from '../src/store/useAppStore';
import { computePlan } from '../src/lib/results';
import { booksFor, codeFor, computeTaxes, fmtCode, parseCsv, parseManualCsv, parseRate, resolveLines } from '../src/lib/tariff';

const TODAY = '2026-11-17';

const US: TariffBook = {
  country: 'US',
  source: 'test',
  sourceUrl: 'https://hts.usitc.gov/',
  fetchedAt: '2026-11-10T00:00:00Z',
  lines: [
    {
      code: '61091000',
      description: 'Of cotton',
      measures: [
        { kind: 'mfn', label: 'MFN', rate: '16.5%', pct: 16.5, confidence: 'official', source: 't' },
        // Hiệp định đa phương cùng mức 0% → phải ưu tiên hiệp định song phương (KORUS)
        { kind: 'preferential', label: 'Multi', rate: 'Free', pct: 0, origins: ['JP', 'KR', 'CN'], agreement: 'Multi FTA', confidence: 'official', source: 't' },
        { kind: 'preferential', label: 'KORUS', rate: 'Free', pct: 0, origins: ['KR'], agreement: 'KORUS FTA', confidence: 'official', source: 't' },
        { kind: 'preferential', label: 'Old FTA', rate: 'Free', pct: 0, origins: ['SG'], validTo: '2020-01-01', confidence: 'official', source: 't' },
      ],
    },
    { code: '64041175', description: 'Textile uppers', measures: [{ kind: 'mfn', label: 'MFN', rate: '12.5%', pct: 12.5, confidence: 'official', source: 't' }] },
    { code: '64041179', description: 'Other', measures: [{ kind: 'mfn', label: 'MFN', rate: '90¢/pr. + 37.5%', pct: 37.5, specific: true, confidence: 'official', source: 't' }] },
    { code: '09011100', description: 'Coffee', measures: [{ kind: 'mfn', label: 'MFN', rate: 'Free', pct: 0, confidence: 'official', source: 't' }] },
  ],
  originMeasures: [{ kind: 'additional', label: 'HTS 9903.02.69', rate: 'The duty provided in the applicable subheading + 20%', pct: 20, origins: ['VN'], confidence: 'reference', source: 't' }],
};

const EU = parseManualCsv(`country,code,description,kind,label,rate,origins,agreement,proof,validFrom,validTo,reviewedAt,source,note
EU,61091000,"T-shirts, cotton",mfn,MFN,12%,,,,,,2026-11-01,TARIC,
EU,61091000,"T-shirts, cotton",preferential,EVFTA,,VN,EVFTA,REX,,,2026-11-01,TARIC,
EU,6109,"Chương 61.09 – thuế chống bán phá giá giả định",additional,AD test,5%,CN,,,,,2026-11-01,test,`);

const base = { goodsValue: 10_000, freight: 2_000, date: '2026-12-20', today: TODAY };

describe('parseRate / parseCsv / fmtCode', () => {
  it('tách thuế suất', () => {
    expect(parseRate('16.5%')).toEqual({ pct: 16.5, specific: false });
    expect(parseRate('Free')).toEqual({ pct: 0, specific: false });
    expect(parseRate('12.00 %')).toEqual({ pct: 12, specific: false });
    expect(parseRate('90¢/pr. + 37.5%')).toEqual({ pct: 37.5, specific: true });
    expect(parseRate('2.2¢/kg')).toEqual({ pct: null, specific: true });
    expect(parseRate('The duty provided in the applicable subheading + 20%')).toEqual({ pct: 20, specific: false });
    expect(parseRate('')).toEqual({ pct: null, specific: false });
  });
  it('CSV có dấu ngoặc kép, dấu phẩy và dòng chú thích', () => {
    const rows = parseCsv('# chú thích, bỏ qua\na,b\n"x, y","say ""hi"""\n');
    expect(rows).toEqual([{ a: 'x, y', b: 'say "hi"' }]);
  });
  it('định dạng mã', () => {
    expect(fmtCode('6109100012')).toBe('6109.10.00.12');
    expect(fmtCode('61091000')).toBe('6109.10.00');
    expect(fmtCode('610910')).toBe('6109.10');
  });
});

describe('tra mã & biểu thuế', () => {
  it('EU áp dụng cho nước thành viên, không cho Anh', () => {
    expect(booksFor('DE', EU)).toHaveLength(1);
    expect(booksFor('GB', EU)).toHaveLength(0);
  });
  it('mã 10 số khớp dòng thuế 8 số; HS6 nhiều dòng → danh sách để chọn; 1 dòng → dùng luôn', () => {
    expect(resolveLines([US], '6109100012').lines.map((l) => l.line.code)).toEqual(['61091000']);
    expect(resolveLines([US], '640411').candidates).toHaveLength(2);
    expect(resolveLines([US], '090111').lines.map((l) => l.line.code)).toEqual(['09011100']);
  });
  it('tiền tố trong manual.csv áp dụng cho mọi dòng con', () => {
    expect(resolveLines(EU, '61091000').lines.map((l) => l.line.code)).toEqual(['6109', '61091000']);
  });
});

describe('computeTaxes', () => {
  it('Mỹ: tính trên FOB, MFN + MPF/HMF, không VAT; thuế chương 99 chỉ để tham khảo', () => {
    const t = computeTaxes({ ...base, dest: 'US', origin: 'VN', code: '6109100012' }, [US]);
    expect(t.basis).toBe('FOB');
    expect(t.customsValue).toBe(10_000);
    expect(t.mfn?.pct).toBe(16.5);
    expect(t.chosen).toBeUndefined();
    expect(t.vatTotal).toBe(0);
    expect(t.rows.map((r) => r.label)).toEqual(['MFN', 'Merchandise Processing Fee (MPF)', 'Harbor Maintenance Fee (HMF)']);
    expect(t.total).toBeCloseTo(1650 + 34.64 + 12.5, 2);
    expect(t.references).toHaveLength(1);
    expect(t.warnings.some((w) => w.includes('Section 232'))).toBe(true);
  });
  it('Mỹ: xuất xứ Hàn Quốc hưởng KORUS 0%; ưu đãi đã hết hạn thì không áp dụng', () => {
    const kr = computeTaxes({ ...base, dest: 'US', origin: 'KR', code: '61091000' }, [US]);
    expect(kr.chosen?.agreement).toBe('KORUS FTA');
    expect(kr.saving).toBeCloseTo(1650);
    expect(kr.references).toHaveLength(0);
    const sg = computeTaxes({ ...base, dest: 'US', origin: 'SG', code: '61091000' }, [US]);
    expect(sg.chosen).toBeUndefined();
  });
  it('EU (Đức): CIF, MFN 12%, EVFTA chưa có thuế suất → cảnh báo; VAT 19% trên CIF + thuế', () => {
    const t = computeTaxes({ ...base, dest: 'DE', origin: 'VN', code: '61091000' }, EU);
    expect(t.basis).toBe('CIF');
    expect(t.cif).toBeCloseTo(12_036);
    const duty = 12_036 * 0.12;
    expect(t.dutyTotal).toBeCloseTo(duty);
    expect(t.vatTotal).toBeCloseTo((12_036 + duty) * 0.19);
    expect(t.preferences.map((p) => p.agreement)).toEqual(['EVFTA']);
    expect(t.warnings.some((w) => w.includes('EVFTA'))).toBe(true);
  });
  it('thuế bổ sung theo xuất xứ được cộng vào tổng và vào trị giá tính VAT', () => {
    const t = computeTaxes({ ...base, dest: 'FR', origin: 'CN', code: '61091000' }, EU);
    expect(t.rows.find((r) => r.kind === 'additional')?.amount).toBeCloseTo(12_036 * 0.05);
    expect(t.vatTotal).toBeCloseTo(12_036 * 1.17 * 0.2);
  });
  it('cảnh báo khi dữ liệu cũ / chưa đối chiếu / không có biểu thuế', () => {
    const old = computeTaxes({ ...base, today: '2027-06-01', dest: 'US', origin: 'VN', code: '61091000' }, [US]);
    expect(old.sources[0].stale).toBe(true);
    expect(old.warnings.some((w) => w.includes('tariffs:update'))).toBe(true);
    const unreviewed = parseManualCsv('country,code,kind,label,rate\nEU,61091000,mfn,MFN,12%');
    expect(unreviewed[0].fetchedAt).toBe('');
    expect(computeTaxes({ ...base, dest: 'NL', origin: 'VN', code: '61091000' }, unreviewed).warnings.some((w) => w.includes('chưa được đối chiếu'))).toBe(true);
    expect(computeTaxes({ ...base, dest: 'JP', origin: 'VN', code: '61091000' }, [US]).warnings[0]).toContain('Chưa có biểu thuế');
  });
});

describe('dữ liệu thật trong repo', () => {
  it('mỗi mặt hàng có HS6 hợp lệ (HS 2022) và mã quốc gia bắt đầu bằng HS6', () => {
    expect(PRODUCTS.length).toBeGreaterThan(0);
    for (const p of PRODUCTS) {
      expect(HS6_DESC[p.hs6], p.sku).toBeTruthy();
      for (const code of Object.values(p.codes)) expect(code.startsWith(p.hs6), `${p.sku} ${code}`).toBe(true);
    }
  });
  it('mã Mỹ/Anh của danh mục đều tra ra thuế MFN trong dữ liệu đã tải', () => {
    for (const country of ['US', 'GB'])
      for (const p of PRODUCTS.filter((x) => x.codes[country])) {
        const t = computeTaxes({ ...base, dest: country, origin: 'VN', code: codeFor(p, country) }, TARIFF_BOOKS);
        expect(t.mfn, `${p.sku} @ ${country}`).toBeDefined();
      }
  });
  it('kế hoạch mặc định (Cát Lái → Hamburg) có kết quả thuế', () => {
    const plan = computePlan(DEFAULT_FORM)!;
    expect(plan.tax?.input.dest).toBe('DE');
    expect(plan.tax?.mfn).toBeDefined();
    expect(plan.tax?.rows.some((r) => r.kind === 'vat')).toBe(true);
  });
});
