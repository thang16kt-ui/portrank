import { stripAccents } from '../data/countries';

/** Đọc CSV (hỗ trợ dấu ngoặc kép, dấu phân cách , hoặc ;) */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const firstLine = t.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell.trim()); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((x) => x !== '')) rows.push(row);
      row = []; cell = '';
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows.map((r) => r.map((v) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

const key = (s: string) => stripAccents(s).replace(/[^a-z0-9]/g, '');

/**
 * Ánh xạ dòng tiêu đề sang tên trường chuẩn theo bảng bí danh (không phân biệt hoa thường, dấu, khoảng trắng).
 * Trả về các bản ghi {field: value}.
 */
export function rowsToRecords<F extends string>(rows: string[][], aliases: Record<F, string[]>): Partial<Record<F, string>>[] {
  if (rows.length < 2) return [];
  const header = rows[0].map(key);
  const idx = {} as Record<F, number>;
  (Object.keys(aliases) as F[]).forEach((f) => {
    idx[f] = header.findIndex((h) => [f, ...aliases[f]].some((a) => key(a) === h));
  });
  return rows.slice(1).map((r) => {
    const rec: Partial<Record<F, string>> = {};
    (Object.keys(aliases) as F[]).forEach((f) => {
      if (idx[f] >= 0 && r[idx[f]] != null && r[idx[f]] !== '') rec[f] = r[idx[f]];
    });
    return rec;
  });
}

/** Ngày có tồn tại trên lịch không (kiểm năm nhuận, số ngày mỗi tháng) */
export function isRealDate(y: number, m: number, d: number): boolean {
  if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1)) return false;
  const dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= dim;
}

/**
 * Đọc ngày: YYYY-MM-DD (có thể kèm giờ/múi giờ "2026-03-01T10:00+07:00"), DD/MM/YYYY, DD-MM-YYYY, Date của Excel.
 * `invalid` = có giá trị nhưng không phải ngày có thật (2026-02-31, 2026-99-99) → phải báo lỗi, không được coi như để trống.
 */
export function parseDate(v: unknown): { iso: string; invalid: boolean; time?: string } {
  if (v instanceof Date) return isNaN(+v) ? { iso: '', invalid: true } : { iso: v.toISOString().slice(0, 10), invalid: false };
  const s = String(v ?? '').trim();
  if (!s) return { iso: '', invalid: false };
  let y: number, mo: number, d: number, time: string | undefined;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?))?$/);
  if (m) [y, mo, d, time] = [+m[1], +m[2], +m[3], m[4]];
  else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [y, mo, d] = [+m[3], +m[2], +m[1]];
  else return { iso: '', invalid: true };
  if (!isRealDate(y, mo, d)) return { iso: '', invalid: true };
  return { iso: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, invalid: false, ...(time && { time }) };
}

/** Chuẩn hoá ngày về YYYY-MM-DD; '' nếu trống HOẶC không hợp lệ (dùng parseDate để phân biệt) */
export function toIsoDate(v: unknown): string {
  return parseDate(v).iso;
}

/**
 * Số theo định dạng địa phương (bảng giá cước): "1.234,5" → 1234.5 ; "1,234.5" → 1234.5 ; "2.150" → 2150 (dấu chấm phân cách nghìn).
 * KHÔNG dùng cho cột thuế suất – xem toDecimal. Trường hợp mơ hồ ("2.150") xem numberAmbiguity để cảnh báo.
 */
export const toNumber = (v: unknown): number => {
  const s = String(v ?? '').replace(/[^0-9.,-]/g, '');
  if (!s) return NaN;
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) return parseFloat(s.replace(/\./g, ''));
  if (/^-?\d{1,3}(,\d{3})+$/.test(s)) return parseFloat(s.replace(/,/g, ''));
  const norm = s.includes(',') && s.includes('.') ? (s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')) : s.replace(',', '.');
  return parseFloat(norm);
};

/** "2.150" / "1,234": có thể là số nghìn hoặc số thập phân → trả về lời giải thích cách đã hiểu, để báo cho người nhập */
export function numberAmbiguity(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (/^-?\d{1,3}([.,])\d{3}$/.test(s)) return `"${s}" được hiểu là ${toNumber(s)} (dấu ${s.includes('.') ? 'chấm' : 'phẩy'} phân cách hàng nghìn)`;
  return null;
}

/**
 * Số thập phân nghiêm ngặt cho cột thuế suất / tỷ lệ (schema A/B/C): dấu chấm thập phân, không có phân cách nghìn.
 * "0.125" → 0.125 ; "1.234" → 1.234 ; "7,5" → 7.5 (chấp nhận dấu phẩy thập phân khi không có dấu chấm) ; "" → NaN ; "1.234,5" → NaN (mơ hồ)
 */
export function toDecimal(v: unknown): number {
  const s = String(v ?? '').trim().replace(/\s*%$/, '');
  if (!s) return NaN;
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  if (/^-?\d+,\d+$/.test(s)) return parseFloat(s.replace(',', '.'));
  return NaN;
}

/** Đọc file CSV hoặc Excel (.xlsx) thành mảng dòng */
export async function readTableFile(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser');
    const rows = (await readSheet(file)) as unknown[][];
    return rows.map((r) => r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c == null ? '' : String(c))));
  }
  return parseCsv(await file.text());
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: mime }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const todayIso = () => new Date().toISOString().slice(0, 10);
export const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86400000);
export const fmtDateVi = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '—');
