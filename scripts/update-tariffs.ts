/**
 * Cập nhật biểu thuế cho các mặt hàng trong danh mục `src/data/tariff/products.csv`.
 *
 *   npm run tariffs:update            # tải tất cả nguồn tự động
 *   npm run tariffs:update -- US      # chỉ Mỹ
 *   npm run tariffs:update -- --check # chỉ kiểm tra danh mục, không ghi file
 *
 * Nguồn tự động (API chính thức, không cần key):
 *   - HS 2022 (6 số):  GitHub datasets/harmonized-system (UN Comtrade, PDDL)
 *   - Mỹ (US):         USITC HTS REST API – hts.usitc.gov/reststop
 *   - Anh (GB):        UK Trade Tariff API v2 – trade-tariff.service.gov.uk
 * Nước khác (EU, Việt Nam…) nhập tay trong `src/data/tariff/manual.csv`.
 *
 * Đi qua proxy: chạy với NODE_USE_ENV_PROXY=1 (Node ≥ 22.21) nếu mạng cần HTTPS_PROXY.
 * Lỗi tải một nguồn → giữ nguyên file cũ của nguồn đó và thoát với mã 1.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Product, TariffBook, TariffLine, TaxMeasure } from '../src/data/tariff/types';
import { digits, fmtCode, parseCsv, parseProductsCsv, parseRate } from '../src/lib/tariff';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'src/data/tariff');
const OUT = join(DATA, 'generated');
const UA = 'PortRank-tariff-updater/1.0';

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');
const only = args.filter((a) => /^[A-Z]{2}$/.test(a));
const want = (c: string) => !only.length || only.includes(c);

const products = parseProductsCsv(readFileSync(join(DATA, 'products.csv'), 'utf8'));
const today = new Date().toISOString();
const report: string[] = [];
let failed = false;

async function get(url: string, accept = 'application/json', tries = 4): Promise<string> {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: accept, 'User-Agent': UA }, signal: AbortSignal.timeout(45_000) });
      if (r.status === 404) throw Object.assign(new Error(`404 ${url}`), { notFound: true });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return await r.text();
    } catch (e) {
      if ((e as { notFound?: boolean }).notFound || i >= tries) throw e;
      await new Promise((res) => setTimeout(res, 1000 * 2 ** i));
    }
  }
}
const getJson = async <T>(url: string): Promise<T> => JSON.parse(await get(url)) as T;

function write(name: string, data: unknown) {
  if (CHECK_ONLY) return;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, name), JSON.stringify(data, null, 1) + '\n');
}

/* ───────────────────────── HS6 (GitHub) ───────────────────────── */

async function updateHs6() {
  const url = 'https://raw.githubusercontent.com/datasets/harmonized-system/main/data/harmonized-system.csv';
  const rows = parseCsv(await get(url, 'text/csv'));
  const all = new Map(rows.filter((r) => r.level === '6').map((r) => [r.hscode, r.description]));
  const items: Record<string, string> = {};
  for (const p of products) {
    const d = all.get(p.hs6);
    if (d) items[p.hs6] = d;
    else report.push(`✗ ${p.sku}: HS6 ${p.hs6} không có trong HS 2022 – kiểm tra lại mã (có thể đã đổi phiên bản HS).`);
  }
  write('hs6.json', { source: 'GitHub datasets/harmonized-system (UN Comtrade, HS 2022)', sourceUrl: 'https://github.com/datasets/harmonized-system', fetchedAt: today, items });
  report.push(`✓ HS6: ${Object.keys(items).length}/${products.length} mã hợp lệ theo HS 2022`);
}

/* ───────────────────────── Mỹ – USITC HTS ───────────────────────── */

interface HtsRow {
  htsno: string;
  indent: string;
  description: string;
  general: string;
  special: string;
  other: string;
}

/** Mã chương trình ưu đãi (cột Special) → nước xuất xứ & tên hiệp định */
const US_PROGRAMS: Record<string, { origins: string[]; agreement: string }> = {
  AU: { origins: ['AU'], agreement: 'US–Australia FTA' },
  BH: { origins: ['BH'], agreement: 'US–Bahrain FTA' },
  CL: { origins: ['CL'], agreement: 'US–Chile FTA' },
  CO: { origins: ['CO'], agreement: 'US–Colombia TPA' },
  IL: { origins: ['IL'], agreement: 'US–Israel FTA' },
  JO: { origins: ['JO'], agreement: 'US–Jordan FTA' },
  JP: { origins: ['JP'], agreement: 'US–Japan Trade Agreement' },
  KR: { origins: ['KR'], agreement: 'KORUS FTA' },
  MA: { origins: ['MA'], agreement: 'US–Morocco FTA' },
  OM: { origins: ['OM'], agreement: 'US–Oman FTA' },
  PA: { origins: ['PA'], agreement: 'US–Panama TPA' },
  PE: { origins: ['PE'], agreement: 'US–Peru TPA' },
  SG: { origins: ['SG'], agreement: 'US–Singapore FTA' },
  S: { origins: ['CA', 'MX'], agreement: 'USMCA' },
  'S+': { origins: ['CA', 'MX'], agreement: 'USMCA' },
  P: { origins: ['CR', 'DO', 'GT', 'HN', 'NI', 'SV'], agreement: 'CAFTA-DR' },
  'P+': { origins: ['CR', 'DO', 'GT', 'HN', 'NI', 'SV'], agreement: 'CAFTA-DR' },
};

/** "Free (AU,BH,…) 3.4% (JP)" → [{rate:'Free', codes:[AU,BH,…]}, {rate:'3.4%', codes:[JP]}] */
function parseSpecial(s: string) {
  const out: { rate: string; codes: string[] }[] = [];
  for (const m of s.matchAll(/([^()]+?)\s*\(([^)]*)\)/g)) out.push({ rate: m[1].trim(), codes: m[2].split(',').map((c) => c.trim()) });
  return out;
}

/** Tên nước trong mô tả chương 99 → ISO */
const COUNTRY_NAMES: [RegExp, string[]][] = [
  [/\bChina\b/, ['CN']], [/Hong Kong/, ['HK']], [/Viet ?nam/i, ['VN']], [/\bJapan\b/, ['JP']], [/South Korea|Republic of Korea/, ['KR']],
  [/Thailand/, ['TH']], [/Malaysia/, ['MY']], [/Indonesia/, ['ID']], [/Philippines/, ['PH']], [/Cambodia/, ['KH']], [/Burma|Myanmar/, ['MM']],
  [/\bLaos\b|Lao People/, ['LA']], [/Taiwan/, ['TW']], [/\bIndia\b/, ['IN']], [/Bangladesh/, ['BD']], [/Sri Lanka/, ['LK']], [/Pakistan/, ['PK']],
  [/Brazil/, ['BR']], [/Switzerland/, ['CH']], [/United Kingdom/, ['GB']], [/Canada/, ['CA']], [/Mexico/, ['MX']], [/Australia/, ['AU']],
  [/New Zealand/, ['NZ']], [/Singapore/, ['SG']], [/Turkey|Türkiye/, ['TR']], [/South Africa/, ['ZA']], [/Israel/, ['IL']], [/Norway/, ['NO']],
  [/Brunei/, ['BN']], [/Argentina/, ['AR']], [/Chile/, ['CL']], [/Colombia/, ['CO']], [/Peru\b/, ['PE']], [/Ecuador/, ['EC']], [/Egypt/, ['EG']],
  [/Nigeria/, ['NG']], [/Kenya/, ['KE']], [/Ghana/, ['GH']], [/Morocco/, ['MA']], [/Saudi Arabia/, ['SA']], [/United Arab Emirates/, ['AE']],
  [/European Union/, ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']],
];

async function updateUS() {
  const releases = await getJson<{ name: string; status: string }[]>('https://hts.usitc.gov/reststop/releaseList');
  const release = releases.find((r) => r.status === 'current')?.name ?? releases[0]?.name;
  const source = `USITC HTS ${release}`;
  const lines: TariffLine[] = [];

  for (const hs6 of [...new Set(products.map((p) => p.hs6))]) {
    // exportList trả cả các dòng tiêu đề trung gian không có mã (vd. "Other:") để dựng mô tả đầy đủ
    const dotted = `${hs6.slice(0, 4)}.${hs6.slice(4)}`;
    const rows = await getJson<HtsRow[]>(`https://hts.usitc.gov/reststop/exportList?from=${dotted}&to=${dotted}.99.99&format=JSON&styles=false`);
    const stack: string[] = [];
    let cur: TariffLine | undefined;
    for (const r of rows) {
      const lvl = +r.indent || 0;
      stack.length = lvl;
      stack[lvl] = r.description.replace(/\s*\(\d{3}\)$/, '').replace(/:$/, '');
      const desc = stack.filter(Boolean).join(' › ');
      const code = digits(r.htsno);
      if (r.general || r.special || r.other) {
        const m: TaxMeasure[] = [];
        if (r.general) m.push({ kind: 'mfn', label: 'Thuế NK MFN (cột 1 – General)', rate: r.general, ...parseRate(r.general), confidence: 'official', source });
        for (const g of parseSpecial(r.special)) {
          const progs = g.codes.map((c) => US_PROGRAMS[c]).filter(Boolean);
          for (const agreement of [...new Set(progs.map((p) => p.agreement))]) {
            const origins = [...new Set(progs.filter((p) => p.agreement === agreement).flatMap((p) => p.origins))];
            m.push({ kind: 'preferential', label: `Ưu đãi ${agreement}`, rate: g.rate, ...parseRate(g.rate), origins, agreement, proof: 'Chứng từ xuất xứ theo hiệp định; khai mã SPI trên tờ khai CBP', confidence: 'official', source });
          }
        }
        if (r.other) m.push({ kind: 'mfn', label: 'Thuế cột 2 (không hưởng MFN)', rate: r.other, ...parseRate(r.other), origins: ['CU', 'KP', 'RU', 'BY'], confidence: 'official', source });
        lines.push((cur = { code, description: desc, measures: m, children: [] }));
      } else if (cur && code.startsWith(cur.code) && code.length > cur.code.length) {
        cur.children!.push({ code, description: desc });
      }
    }
  }

  // Thuế bổ sung chương 99 theo xuất xứ – chỉ tham khảo (điều kiện ngày xếp hàng, danh mục loại trừ…)
  const originMeasures: TaxMeasure[] = [];
  for (const [from, to] of [['9903.01.00', '9903.02.99'], ['9903.88.00', '9903.88.99']]) {
    const rows = await getJson<HtsRow[]>(`https://hts.usitc.gov/reststop/exportList?from=${from}&to=${to}&format=JSON&styles=false`);
    for (const r of rows) {
      if (!/%/.test(r.general ?? '')) continue;
      const desc = (r.description ?? '').replace(/\s+/g, ' ').trim();
      const origins = /product of any country/i.test(desc) ? undefined : [...new Set(COUNTRY_NAMES.filter(([re]) => re.test(desc)).flatMap(([, iso]) => iso))];
      if (origins && !origins.length) continue;
      originMeasures.push({
        kind: 'additional',
        label: `HTS ${r.htsno} – thuế bổ sung chương 99`,
        rate: r.general,
        ...parseRate(r.general),
        ...(origins && { origins }),
        note: desc.length > 320 ? desc.slice(0, 317) + '…' : desc,
        confidence: 'reference',
        source,
      });
    }
  }

  const book: TariffBook = { country: 'US', source: 'USITC – Harmonized Tariff Schedule', sourceUrl: 'https://hts.usitc.gov/', release, fetchedAt: today, lines, originMeasures };
  write('US.json', book);
  checkCodes('US', lines);
  report.push(`✓ US: ${lines.length} dòng thuế, ${originMeasures.length} dòng chương 99 (${release})`);
}

/* ───────────────────────── Anh – UK Trade Tariff ───────────────────────── */

interface JsonApi {
  data: { id: string; type: string; attributes: Record<string, unknown>; relationships?: Record<string, { data: unknown }> };
  included: { id: string; type: string; attributes: Record<string, any>; relationships?: Record<string, { data: any }> }[];
}

const UK_AGREEMENTS: Record<string, string> = {
  VN: 'UKVFTA', JP: 'UK–Japan CEPA', KR: 'UK–Korea FTA', SG: 'UK–Singapore FTA', AU: 'UK–Australia FTA', NZ: 'UK–New Zealand FTA',
  CA: 'UK–Canada TCA', MX: 'UK–Mexico TCA', CH: 'UK–Switzerland TA', TR: 'UK–Türkiye FTA', IN: 'UK–India CETA', '1013': 'UK–EU TCA',
  '2051': 'CPTPP', '1060': 'DCTS – Standard', '1061': 'DCTS – Enhanced', '1062': 'DCTS – Comprehensive',
};
const UK_API = 'https://www.trade-tariff.service.gov.uk/api/v2';
const UK_ADDITIONAL = new Set(['551', '552', '553', '554', '555', '561', '562', '564', '565', '566', '570', '695', '696']);

function parseUkCommodity(j: JsonApi, source: string): TariffLine {
  const inc = new Map(j.included.map((i) => [`${i.type}:${i.id}`, i]));
  const rel = (o: { relationships?: Record<string, { data: any }> }, k: string) => o.relationships?.[k]?.data;
  const area = (id: string) => {
    const g = inc.get(`geographical_area:${id}`);
    const kids: string[] = (rel(g ?? {}, 'children_geographical_areas') ?? []).map((x: { id: string }) => x.id);
    return { desc: (g?.attributes.description as string) ?? id, iso: /^[A-Z]{2}$/.test(id) ? [id] : kids.filter((k) => /^[A-Z]{2}$/.test(k)) };
  };
  const measures: TaxMeasure[] = [];
  const notes: string[] = [];
  const codedVat: TaxMeasure[] = [];
  for (const m of j.included.filter((i) => i.type === 'measure' && i.attributes.import)) {
    const type = rel(m, 'measure_type')?.id as string;
    const mt = inc.get(`measure_type:${type}`)?.attributes ?? {};
    const rate = String(inc.get(`duty_expression:${rel(m, 'duty_expression')?.id}`)?.attributes.base ?? '').trim();
    const geoId = rel(m, 'geographical_area')?.id as string;
    const { desc, iso } = area(geoId);
    const excluded = (rel(m, 'excluded_countries') ?? []).map((x: { id: string }) => x.id).filter((x: string) => /^[A-Z]{2}$/.test(x));
    const addCode = inc.get(`additional_code:${rel(m, 'additional_code')?.id}`)?.attributes;
    const common = {
      rate,
      ...parseRate(rate),
      ...(geoId !== '1011' && geoId !== '1400' && { origins: iso }),
      ...(excluded.length && { excludedOrigins: excluded }),
      validFrom: String(m.attributes.effective_start_date ?? '').slice(0, 10) || undefined,
      validTo: m.attributes.effective_end_date ? String(m.attributes.effective_end_date).slice(0, 10) : null,
      confidence: 'official' as const,
      source,
    };
    if (type === '103') measures.push({ kind: 'mfn', label: geoId === '1011' ? 'Thuế NK MFN (Third country duty)' : `Thuế NK riêng cho ${desc}`, ...common });
    else if (type === '142') {
      const agreement = UK_AGREEMENTS[geoId] ?? desc;
      measures.push({ kind: 'preferential', label: `Ưu đãi ${agreement}`, agreement, proof: 'Chứng từ xuất xứ (statement on origin / EUR.1) theo hiệp định', ...common });
    } else if (type === '305') {
      if (addCode) {
        notes.push(`VAT ${rate} cho trường hợp "${addCode.description}" (${addCode.code}).`);
        codedVat.push({ kind: 'vat', label: `Import VAT (Anh) – ${addCode.description}`, ...common });
      } else measures.push({ kind: 'vat', label: 'Import VAT (Anh)', ...common });
    } else if (UK_ADDITIONAL.has(type) || mt.measure_type_series_id === 'D') {
      measures.push({
        kind: 'additional',
        label: String(mt.description ?? 'Thuế bổ sung'),
        ...common,
        ...(addCode && { confidence: 'reference' as const, note: `Theo mã bổ sung ${addCode.code} – ${addCode.description}` }),
      });
    } else if (mt.measure_type_series_id === 'Q') measures.push({ kind: 'excise', label: String(mt.description ?? 'Excise'), ...common });
  }
  const a = j.data.attributes as Record<string, string>;
  const vat = measures.find((x) => x.kind === 'vat');
  if (vat && notes.length) vat.note = notes.join(' ');
  // Dòng hàng chỉ có VAT kèm mã bổ sung (vd. thực phẩm: VATZ 0%) → dùng mức đó làm VAT của dòng
  if (!vat && codedVat.length) measures.push(...codedVat.slice(0, 1).map((m) => ({ ...m, note: notes.slice(1).join(' ') || undefined })));
  return { code: a.goods_nomenclature_item_id, description: (a.description_plain ?? a.description ?? '').trim(), measures };
}

async function updateGB() {
  const source = 'UK Trade Tariff API';
  const lines: TariffLine[] = [];
  for (const p of products) {
    let ids: string[];
    if (p.codes.GB) ids = [p.codes.GB.padEnd(10, '0')];
    else {
      const h = await getJson<JsonApi>(`${UK_API}/headings/${p.hs6.slice(0, 4)}`);
      ids = h.included.filter((i) => i.type === 'commodity' && i.attributes.leaf && String(i.attributes.goods_nomenclature_item_id).startsWith(p.hs6)).map((i) => String(i.attributes.goods_nomenclature_item_id));
      if (ids.length > 12) ids = ids.slice(0, 12);
    }
    for (const id of ids) {
      if (lines.some((l) => l.code === id)) continue;
      try {
        lines.push(parseUkCommodity(await getJson<JsonApi>(`${UK_API}/commodities/${id}`), source));
      } catch (e) {
        if ((e as { notFound?: boolean }).notFound) report.push(`✗ ${p.sku}: mã Anh ${fmtCode(id)} không tồn tại (không phải mã lá hoặc đã bị bỏ).`);
        else throw e;
      }
    }
  }
  write('GB.json', { country: 'GB', source: 'HMRC – UK Trade Tariff', sourceUrl: 'https://www.trade-tariff.service.gov.uk/', fetchedAt: today, lines } satisfies TariffBook);
  checkCodes('GB', lines);
  report.push(`✓ GB: ${lines.length} dòng thuế`);
}

/* ───────────────────────── Kiểm tra danh mục ───────────────────────── */

function checkCodes(country: string, lines: TariffLine[]) {
  for (const p of products as Product[]) {
    const code = p.codes[country];
    const under = lines.filter((l) => l.code.startsWith(p.hs6));
    if (!code) {
      const opts = under.flatMap((l) => (l.children?.length ? l.children : [l])).map((l) => `${fmtCode(l.code)} ${l.description}`);
      report.push(`! ${p.sku} (${country}): chưa có mã quốc gia. Gợi ý:\n      ${opts.slice(0, 8).join('\n      ') || '(không có dòng nào)'}`);
      continue;
    }
    if (!code.startsWith(p.hs6)) report.push(`✗ ${p.sku} (${country}): mã ${fmtCode(code)} không bắt đầu bằng HS6 ${p.hs6}.`);
    const ok = under.some((l) => l.code === code || code.startsWith(l.code) && (!l.children?.length || l.children.some((c) => c.code === code)));
    if (!ok) report.push(`✗ ${p.sku} (${country}): mã ${fmtCode(code)} không còn trong biểu thuế hiện hành – cần chọn lại.`);
  }
}

/* ───────────────────────── Chạy ───────────────────────── */

const jobs: [string, () => Promise<void>][] = [
  ['HS6', updateHs6],
  ['US', updateUS],
  ['GB', updateGB],
];
for (const [name, job] of jobs) {
  if (name !== 'HS6' && !want(name)) continue;
  try {
    await job();
  } catch (e) {
    failed = true;
    report.push(`✗ ${name}: lỗi tải dữ liệu – giữ nguyên file cũ. ${(e as Error).message}`);
  }
}
console.log(`Cập nhật biểu thuế ${today.slice(0, 10)} – ${products.length} mặt hàng${CHECK_ONLY ? ' (chỉ kiểm tra)' : ''}\n` + report.map((r) => '  ' + r).join('\n'));
if (failed) process.exit(1);
