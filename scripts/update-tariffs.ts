/**
 * Tạo bản chụp biểu thuế từ NGUỒN CHÍNH THỨC cho danh mục hàng `src/data/tariffProducts.csv`
 * → `src/data/tariffSnapshot.json`. App dùng bản chụp khi API trực tuyến không phản hồi,
 * và để nạp vào trang Biểu thuế.
 *
 *   npm run tariffs:update            # tải tất cả
 *   npm run tariffs:check             # chỉ kiểm tra danh mục, không ghi file
 *
 * Nguồn: HS 2022 – GitHub datasets/harmonized-system · Mỹ – USITC HTS REST (exportList) · Anh – UK Trade Tariff API v2.
 * Ngoài ra ghi: public/data/hs6.json (danh mục HS 2022 chuẩn 2/4/6 số cho ô nhập mã HS) và
 * src/data/vatRates.json (VAT/GST tiêu chuẩn ~130 nước – gói npm sales-tax, MIT, valeriansaliou/node-sales-tax).
 * EU / Việt Nam: không có API công khai → `src/data/tariffManual.csv` (cùng mẫu CSV của trang Biểu thuế, chưa xác minh).
 * Dùng chính các hàm phân tích của app (src/lib/tariffSources.ts) để bản chụp khớp với kết quả tra trực tuyến.
 * Mạng cần proxy: NODE_USE_ENV_PROXY=1 npm run tariffs:update
 * Một nguồn lỗi → giữ dữ liệu cũ của nguồn đó trong bản chụp và thoát với mã 1.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNTRIES } from '../src/data/countries';
import { parseCsv } from '../src/lib/csv';
import {
  CH99_RANGES, TARIFF_SNAPSHOT, US_SPECIAL, htsLeaves, parseChapter99, parseUkCommodity, parseUkHeadingLeaves, ukEntry, usEntry,
  type Chapter99Item, type HtsRow, type TariffSnapshot,
} from '../src/lib/tariffSources';
import { parseTariffRows, type TariffEntry } from '../src/providers/TariffProvider';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'src/data');
const CHECK_ONLY = process.argv.includes('--check');
const today = new Date().toISOString().slice(0, 10);
const report: string[] = [];
let failed = false;

const digits = (s: string) => s.replace(/\D/g, '');
const fmt = (d: string) => (d.length <= 4 ? d : [d.slice(0, 4), ...(d.slice(4).match(/.{1,2}/g) ?? [])].join('.'));
/** Bỏ dòng chú thích (#) trước khi phân tích – parseCsv đoán dấu phân cách theo dòng đầu */
const readCsv = (f: string) => parseCsv(readFileSync(join(DATA, f), 'utf8').split(/\r?\n/).filter((l) => !l.trim().startsWith('#')).join('\n'));

interface Product { sku: string; name: string; hs6: string; codes: Record<string, string> }
const [head, ...rows] = readCsv('tariffProducts.csv');
const products: Product[] = rows
  .map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
  .filter((r) => r.sku && digits(r.hs6).length === 6)
  .map((r) => ({
    sku: r.sku, name: r.name, hs6: digits(r.hs6),
    codes: Object.fromEntries(Object.entries(r).filter(([k, v]) => /^[A-Z]{2}$/.test(k) && digits(v)).map(([k, v]) => [k, digits(v)])),
  }));

async function get<T>(url: string, accept = 'application/json', tries = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: accept, 'User-Agent': 'PortRank-tariff-updater/2.0' }, signal: AbortSignal.timeout(45_000) });
      if (r.status === 404) throw Object.assign(new Error(`404 ${url}`), { status: 404 });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return (accept.includes('json') ? await r.json() : await r.text()) as T;
    } catch (e) {
      if ((e as { status?: number }).status === 404 || i >= tries) throw e;
      await new Promise((res) => setTimeout(res, 1000 * 2 ** i));
    }
  }
}

/* ───────────── HS 2022 (GitHub) ───────────── */
const HS_URL = 'https://raw.githubusercontent.com/datasets/harmonized-system/main/data/harmonized-system.csv';
async function checkHs6() {
  const csv = await get<string>(HS_URL, 'text/csv');
  // cột: section, hscode, description, parent, level
  const rows = parseCsv(csv).slice(1).filter((r) => ['2', '4', '6'].includes(r[4]) && /^\d+$/.test(r[1]));
  const hs6 = new Set(rows.filter((r) => r[4] === '6').map((r) => r[1]));
  const bad = products.filter((p) => !hs6.has(p.hs6));
  for (const p of bad) report.push(`✗ ${p.sku}: HS6 ${fmt(p.hs6)} không có trong HS 2022 (datasets/harmonized-system).`);
  report.push(`✓ HS 2022: ${products.length - bad.length}/${products.length} mã HS6 trong danh mục hàng hợp lệ; ${hs6.size} mã HS6 trong danh mục chuẩn`);
  if (hs6.size < 5000) throw new Error(`Danh mục HS chỉ có ${hs6.size} mã HS6 – nghi dữ liệu lỗi, không ghi`);
  if (!CHECK_ONLY) {
    mkdirSync(join(ROOT, 'public/data'), { recursive: true });
    const catalog = { version: 'HS 2022', source: 'GitHub datasets/harmonized-system (UN Comtrade, ODC-PDDL)', sourceUrl: 'https://github.com/datasets/harmonized-system', fetchedAt: today, items: rows.map((r) => [r[1], r[2]]) };
    writeFileSync(join(ROOT, 'public/data/hs6.json'), JSON.stringify(catalog) + '\n');
  }
}

/* ───────────── VAT/GST tiêu chuẩn (npm sales-tax) ───────────── */
const VAT_URL = 'https://raw.githubusercontent.com/valeriansaliou/node-sales-tax/master/res/sales_tax_rates.json';
async function updateVat() {
  const raw = await get<Record<string, { type: string; rate: number; states?: Record<string, unknown> }>>(VAT_URL);
  const rates: Record<string, { pct: number; type: string; regional?: boolean }> = {};
  for (const [cc, r] of Object.entries(raw)) {
    if (!/^[A-Z]{2}$/.test(cc) || typeof r?.rate !== 'number') continue;
    rates[cc] = { pct: Math.round(r.rate * 10000) / 100, type: r.type, ...(r.states && { regional: true }) };
  }
  if (Object.keys(rates).length < 100) throw new Error(`Chỉ có ${Object.keys(rates).length} nước – nghi dữ liệu lỗi, không ghi`);
  if (!CHECK_ONLY)
    writeFileSync(join(DATA, 'vatRates.json'), JSON.stringify({ source: 'npm sales-tax (MIT) – valeriansaliou/node-sales-tax', sourceUrl: 'https://github.com/valeriansaliou/node-sales-tax', fetchedAt: today, rates }, null, 0) + '\n');
  report.push(`✓ VAT/GST: ${Object.keys(rates).length} nước`);
}

/* ───────────── Mỹ – USITC HTS ───────────── */
const HTS = 'https://hts.usitc.gov/reststop';
const exportList = (from: string, to: string) => get<HtsRow[]>(`${HTS}/exportList?from=${from}&to=${to}&format=JSON&styles=false`);

async function updateUS(): Promise<{ entries: TariffEntry[]; chapter99: Chapter99Item[]; release: string }> {
  const releases = await get<{ name: string; status: string }[]>(`${HTS}/releaseList`);
  const release = releases.find((r) => r.status === 'current')?.name ?? '';
  const entries: TariffEntry[] = [];
  for (const p of products) {
    const d = fmt(p.hs6);
    const leaves = htsLeaves(await exportList(d, `${d}.99.99`), p.hs6);
    const codes = new Set(leaves.map((l) => digits(l.htsno)));
    const want = p.codes.US;
    if (!want) report.push(`! ${p.sku} (US): chưa có mã. Các dòng thuế: ${leaves.map((l) => `${l.htsno} ${l.path} [${l.general}]`).join(' | ')}`);
    else if (![...codes].some((c) => want.startsWith(c))) report.push(`✗ ${p.sku} (US): mã ${fmt(want)} không còn trong HTS – cần chọn lại.`);
    for (const leaf of leaves) {
      const mfn = usEntry(leaf, '*', false).entry;
      if (!mfn) {
        report.push(`! ${p.sku} (US ${leaf.htsno}): thuế phức hợp "${leaf.general}" – không đưa vào bản chụp.`);
        continue;
      }
      entries.push({ ...mfn, updatedAt: today });
      for (const origin of Object.keys(US_SPECIAL)) {
        const fta = usEntry(leaf, origin, true).entry;
        if (fta?.rateType === 'FTA' && fta.dutyPct < mfn.dutyPct) entries.push({ ...fta, updatedAt: today });
      }
    }
  }
  const chapter99 = parseChapter99((await Promise.all(CH99_RANGES.map(([a, b]) => exportList(a, b)))).flat());
  report.push(`✓ US: ${entries.length} mức thuế, ${chapter99.length} dòng Chương 99 (${release})`);
  return { entries, chapter99, release };
}

/* ───────────── Anh – UK Trade Tariff ───────────── */
const UK = 'https://www.trade-tariff.service.gov.uk/api/v2';
const ORIGINS = COUNTRIES.map((c) => c.iso2).filter((c) => c !== 'GB');

async function updateGB(): Promise<TariffEntry[]> {
  const entries: TariffEntry[] = [];
  for (const p of products) {
    const leaves = parseUkHeadingLeaves(await get(`${UK}/headings/${p.hs6.slice(0, 4)}`)).filter((l) => l.code.startsWith(p.hs6));
    const want = p.codes.GB;
    if (!want) report.push(`! ${p.sku} (GB): chưa có mã. Gợi ý: ${leaves.map((l) => `${fmt(l.code)} ${l.description}`).join(' | ')}`);
    else if (!leaves.some((l) => l.code === want.padEnd(10, '0'))) report.push(`✗ ${p.sku} (GB): mã ${fmt(want)} không phải mã lá hiện hành – cần chọn lại.`);
    const codes = want ? [want.padEnd(10, '0')] : leaves.slice(0, 12).map((l) => l.code);
    for (const code of codes) {
      let doc;
      try {
        doc = await get<Parameters<typeof parseUkCommodity>[0]>(`${UK}/commodities/${code}`);
      } catch (e) {
        if ((e as { status?: number }).status === 404) continue;
        throw e;
      }
      const mfn = ukEntry(code, '*', false, parseUkCommodity(doc, '*')).entry;
      if (!mfn) {
        report.push(`! ${p.sku} (GB ${fmt(code)}): không có thuế MFN dạng % – không đưa vào bản chụp.`);
        continue;
      }
      entries.push({ ...mfn, id: `uk-${code}-*`, updatedAt: today });
      for (const origin of ORIGINS) {
        const fta = ukEntry(code, origin, true, parseUkCommodity(doc, origin)).entry;
        if (fta?.rateType === 'FTA' && fta.dutyPct < mfn.dutyPct) entries.push({ ...fta, updatedAt: today });
      }
    }
  }
  report.push(`✓ GB: ${entries.length} mức thuế`);
  return entries;
}

/* ───────────── Chạy ───────────── */
const prev = TARIFF_SNAPSHOT;
const keep = (prefix: string) => prev.entries.filter((e) => e.id.startsWith(prefix));
const sources: TariffSnapshot['sources'] = [];

const run = async <T>(name: string, job: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await job();
  } catch (e) {
    failed = true;
    report.push(`✗ ${name}: lỗi tải – giữ dữ liệu cũ. ${(e as Error).message}`);
    return fallback;
  }
};

await run('HS 2022', checkHs6, undefined);
await run('VAT/GST', updateVat, undefined);
const us = await run('US', updateUS, { entries: keep('us-'), chapter99: prev.chapter99, release: prev.sources.find((s) => s.id === 'us-hts')?.release ?? '' });
const gb = await run('GB', updateGB, keep('uk-'));
const manual = parseTariffRows(readCsv('tariffManual.csv'));
for (const e of manual.errors) report.push(`✗ tariffManual.csv: ${e}`);
const eu = manual.entries.map((e, i) => ({ ...e, id: `manual-${e.importCountry}-${e.hs}-${e.origin}-${i}` }));
report.push(`✓ Nhập tay (EU…): ${eu.length} mức thuế, chưa xác minh`);

sources.push(
  { id: 'us-hts', label: 'USITC – Harmonized Tariff Schedule', url: 'https://hts.usitc.gov/', release: us.release },
  { id: 'uk-tariff', label: 'HMRC – UK Trade Tariff', url: 'https://www.trade-tariff.service.gov.uk/' },
  { id: 'manual', label: 'Nhập tay – src/data/tariffManual.csv', url: '' },
);
const snapshot: TariffSnapshot = { generatedAt: today, sources, entries: [...us.entries, ...gb, ...eu], chapter99: us.chapter99, report };
if (!CHECK_ONLY) writeFileSync(join(DATA, 'tariffSnapshot.json'), JSON.stringify(snapshot) + '\n');
console.log(`Bản chụp biểu thuế ${today} – ${products.length} mặt hàng${CHECK_ONLY ? ' (chỉ kiểm tra)' : ''}\n` + report.map((r) => '  ' + r).join('\n'));
if (failed) process.exit(1);
