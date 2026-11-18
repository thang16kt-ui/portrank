/**
 * Nạp biểu thuế nhập khẩu Việt Nam (mã 8 số) từ file Excel / CSV chính thức → public/data/vn/tariff.json
 *
 *   npm run tariffs:vn -- "Bieu thue XNK 2026.xlsx"            # sheet đầu tiên
 *   npm run tariffs:vn -- bieuthue.xlsx --sheet "Biểu thuế NK"   # chọn sheet
 *   npm run tariffs:vn -- bieuthue.csv
 *
 * File cần có dòng tiêu đề với cột "Mã hàng"/"Mã HS", cột thuế NK ưu đãi (MFN) và các cột thuế ưu đãi đặc biệt theo FTA
 * (ACFTA, ATIGA, AJCEP, VJEPA, AKFTA, VKFTA, AANZFTA, AIFTA, AHKFTA, VCFTA, VN-EAEU, CPTPP, EVFTA, UKVFTA, RCEP, VIFTA…);
 * cột VAT, TTĐB, BVMT nếu có. Ô "*" = không được hưởng ưu đãi.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSheet } from 'read-excel-file/node';
import { parseCsv } from '../src/lib/csv';
import { VN_FTA, parseVnTariffTable } from '../src/lib/vnTariff';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--sheet');
const sheet = args.includes('--sheet') ? args[args.indexOf('--sheet') + 1] : undefined;
if (!file) {
  console.error('Cách dùng: npm run tariffs:vn -- <file .xlsx | .csv> [--sheet "Tên sheet"]');
  process.exit(2);
}

const rows: string[][] = /\.xlsx$/i.test(file)
  ? ((sheet ? await readSheet(file, sheet) : await readSheet(file)) as unknown[][]).map((r) => r.map((c) => (c == null ? '' : String(c))))
  : parseCsv(readFileSync(file, 'utf8'));

const { data, problems } = parseVnTariffTable(rows, basename(file));
const n = Object.keys(data.codes).length;
console.log(`Đọc ${rows.length} dòng → ${n} mã 8 số. Cột FTA nhận được: ${data.ftas.map((k) => VN_FTA[k].label).join(', ') || '(không có)'}`);
for (const p of problems) console.log(`  ! ${p}`);
const withMfn = Object.values(data.codes).filter((r) => r[1] != null).length;
console.log(`  ${withMfn}/${n} dòng có thuế NK ưu đãi (MFN); ${Object.values(data.codes).filter((r) => r[2] != null).length} dòng có VAT.`);
if (n < 100 || withMfn < n / 2) {
  console.error('Dữ liệu không đủ để dùng (quá ít mã hoặc thiếu cột MFN) – không ghi file. Kiểm tra lại sheet / dòng tiêu đề.');
  process.exit(1);
}
mkdirSync(join(ROOT, 'public/data/vn'), { recursive: true });
writeFileSync(join(ROOT, 'public/data/vn/tariff.json'), JSON.stringify(data) + '\n');
console.log('✓ Đã ghi public/data/vn/tariff.json – app dùng cho hàng nhập vào Việt Nam (ưu tiên hơn WITS).');
