import { findCarrier } from '../data/carriers';
import { PORTS } from '../data/ports';
import { stripAccents } from '../data/countries';
import { numberAmbiguity, parseDate, rowsToRecords, toNumber } from '../lib/csv';
import type { ContainerType } from '../types';

/** Một dòng báo giá thật của forwarder / hãng tàu (USD / container) */
export interface RateEntry {
  id: string;
  pol: string; // UN/LOCODE
  pod: string;
  container: ContainerType | '*';
  freight: number;
  surcharges: number;
  validFrom: string; // YYYY-MM-DD
  validTo: string;
  /** id hãng tàu (xem data/carriers.ts) hoặc '' = không rõ / mọi hãng */
  carrier: string;
  source: string;
}

export interface RateQuery {
  pol: string;
  pod: string;
  container: ContainerType;
  /** Ngày cần giá (YYYY-MM-DD) */
  date: string;
  /** Lọc theo hãng; rỗng = tất cả */
  carriers: string[];
}

export interface RateHit {
  entry: RateEntry;
  perContainer: number;
  /** "Giá thật · [nguồn] · hết hạn [ngày]" */
  label: string;
}

/**
 * Nguồn giá. Bản hiện tại: bảng giá người dùng nhập (trang "Bảng giá của tôi").
 * Sau này có thể viết provider gọi API (Freightos, Xeneta, API hãng tàu) theo cùng interface.
 */
export interface RateProvider {
  readonly id: string;
  readonly label: string;
  /** true = giá thật (không gắn nhãn "Ước tính") */
  readonly isLive: boolean;
  find(q: RateQuery): RateHit | null;
}

const fmt = (iso: string) => iso.split('-').reverse().join('/');

export function createTableRateProvider(entries: RateEntry[]): RateProvider {
  return {
    id: 'my-rates',
    label: 'Bảng giá của tôi',
    isLive: true,
    find(q) {
      const hits = entries.filter(
        (e) =>
          e.pol === q.pol && e.pod === q.pod && (e.container === '*' || e.container === q.container) &&
          (!e.validFrom || e.validFrom <= q.date) && (!e.validTo || e.validTo >= q.date) &&
          (!q.carriers.length || !e.carrier || q.carriers.includes(e.carrier)),
      );
      if (!hits.length) return null;
      const entry = hits.reduce((m, e) => (e.freight + e.surcharges < m.freight + m.surcharges ? e : m));
      const carrier = findCarrier(entry.carrier)?.name;
      return {
        entry,
        perContainer: entry.freight + entry.surcharges,
        label: `Giá thật · ${[entry.source || 'Bảng giá của tôi', carrier].filter(Boolean).join(' · ')}${entry.validTo ? ` · hết hạn ${fmt(entry.validTo)}` : ''}`,
      };
    },
  };
}

/** Tìm mã cảng từ LOCODE hoặc tên */
export function resolvePortCode(text: string | undefined): string | null {
  if (!text) return null;
  const t = text.trim().toUpperCase().replace(/\s+/g, '');
  const byCode = PORTS.find((p) => p.code === t);
  if (byCode) return byCode.code;
  const s = stripAccents(text.trim());
  const byName = PORTS.find((p) => stripAccents(p.name).startsWith(s) || (p.aliases ?? []).includes(s));
  return byName?.code ?? null;
}

const CONT: Record<string, ContainerType> = { '20': '20GP', '20GP': '20GP', '20DC': '20GP', '40': '40GP', '40GP': '40GP', '40DC': '40GP', '40HC': '40HC', '40HQ': '40HC', '40RF': '40RF', '40RH': '40RF' };

export const RATE_CSV_HEADER = ['pol', 'pod', 'container', 'freight_usd', 'surcharges_usd', 'valid_from', 'valid_to', 'carrier', 'source'];

/** Đọc bảng báo giá (CSV/Excel đã chuyển thành mảng dòng). Trả về các dòng hợp lệ và danh sách lỗi. */
/** Giá trị cột container được chấp nhận là "mọi loại" – phải ghi rõ, không suy từ mã lạ */
const CONT_ANY = new Set(['*', 'ALL', 'ANY', 'MOI', 'TATCA']);

export function parseRateRows(rows: string[][]): { entries: RateEntry[]; errors: string[]; warnings: string[] } {
  const recs = rowsToRecords(rows, {
    pol: ['cang di', 'port of loading', 'origin'],
    pod: ['cang den', 'port of discharge', 'destination'],
    container: ['loai cont', 'cont', 'container type', 'equipment'],
    freight: ['freight_usd', 'cuoc', 'cuoc bien', 'ocean freight', 'of', 'ocean_freight_usd'],
    surcharges: ['surcharges_usd', 'phu phi', 'surcharge', 'baf', 'baf_usd'],
    validFrom: ['valid_from', 'hieu luc tu', 'tu ngay', 'from'],
    validTo: ['valid_to', 'hieu luc den', 'den ngay', 'het han', 'to', 'expiry'],
    carrier: ['hang tau', 'line', 'scac'],
    source: ['nguon', 'forwarder'],
  });
  const entries: RateEntry[] = [], errors: string[] = [], warnings: string[] = [];
  recs.forEach((r, i) => {
    const line = i + 2;
    const pol = resolvePortCode(r.pol), pod = resolvePortCode(r.pod);
    const freight = toNumber(r.freight);
    if (!pol || !pod) return errors.push(`Dòng ${line}, cột ${!pol ? 'pol' : 'pod'}: không nhận ra cảng "${!pol ? r.pol ?? '' : r.pod ?? ''}"`);
    if (!isFinite(freight)) return errors.push(`Dòng ${line}, cột freight_usd: thiếu cước`);
    if (freight < 0) return errors.push(`Dòng ${line}, cột freight_usd: cước âm (${freight}) không hợp lệ`);
    // container: trống hoặc "*" / "ALL" = mọi loại (khai chủ động); mã lạ (vd. 40TYPO) → lỗi, KHÔNG đổi thành mọi loại
    const raw = (r.container ?? '').trim();
    const c = stripAccents(raw).toUpperCase().replace(/[^0-9A-Z*]/g, '');
    let container: ContainerType | '*';
    if (!c || CONT_ANY.has(c)) {
      container = '*';
      if (!c) warnings.push(`Dòng ${line}: cột container trống – áp cho MỌI loại container`);
    } else if (CONT[c]) container = CONT[c];
    else return errors.push(`Dòng ${line}, cột container: không nhận ra loại "${raw}" (dùng 20GP, 40GP, 40HC, 40RF hoặc * cho mọi loại)`);
    const sur = toNumber(r.surcharges);
    if (isFinite(sur) && sur < 0) return errors.push(`Dòng ${line}, cột surcharges_usd: phụ phí âm (${sur}) không hợp lệ`);
    const from = parseDate(r.validFrom), to = parseDate(r.validTo);
    if (from.invalid) return errors.push(`Dòng ${line}, cột valid_from: ngày không có thật "${r.validFrom}"`);
    if (to.invalid) return errors.push(`Dòng ${line}, cột valid_to: ngày không có thật "${r.validTo}"`);
    if (from.iso && to.iso && to.iso < from.iso) return errors.push(`Dòng ${line}: valid_to ${to.iso} trước valid_from ${from.iso}`);
    for (const [k, v] of [['freight_usd', r.freight], ['surcharges_usd', r.surcharges]] as const) {
      const amb = numberAmbiguity(v);
      if (amb) warnings.push(`Dòng ${line}, cột ${k}: ${amb} – kiểm tra lại nếu là số thập phân`);
    }
    entries.push({
      id: `${Date.now().toString(36)}-${i}`,
      pol, pod,
      container,
      freight,
      surcharges: isFinite(sur) ? sur : 0,
      validFrom: from.iso,
      validTo: to.iso,
      carrier: findCarrier(r.carrier)?.id ?? '',
      source: r.source ?? '',
    });
  });
  return { entries, errors, warnings };
}
