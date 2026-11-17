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

/** Chuẩn hoá ngày về YYYY-MM-DD (nhận YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, Date của Excel) */
export function toIsoDate(v: unknown): string {
  if (v instanceof Date && !isNaN(+v)) return v.toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

export const toNumber = (v: unknown): number => {
  const s = String(v ?? '').replace(/[^0-9.,-]/g, '');
  if (!s) return NaN;
  // "1.234,5" → 1234.5 ; "1,234.5" → 1234.5
  // "2.150" / "1.234.567" (dấu chấm phân cách hàng nghìn) → số nguyên
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) return parseFloat(s.replace(/\./g, ''));
  if (/^-?\d{1,3}(,\d{3})+$/.test(s)) return parseFloat(s.replace(/,/g, ''));
  const norm = s.includes(',') && s.includes('.') ? (s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')) : s.replace(',', '.');
  return parseFloat(norm);
};

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
