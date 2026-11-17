import { findCarrier } from '../data/carriers';
import { rowsToRecords, toIsoDate, toNumber } from '../lib/csv';
import { resolvePortCode } from './RateProvider';

export interface Transshipment {
  port: string; // UN/LOCODE
  eta: string;
  etd: string;
  /** Tàu nối */
  vessel: string;
}

/** Một lộ trình (routing) cụ thể của hãng tàu – do người dùng nhập hoặc do API trả về. KHÔNG tự sinh. */
export interface ScheduleEntry {
  id: string;
  carrier: string; // id hãng (data/carriers.ts)
  service: string;
  vessel: string;
  voyage: string;
  pol: string;
  pod: string;
  etd: string;
  eta: string;
  cutoffCy: string;
  cutoffDoc: string;
  cutoffVgm: string;
  transshipments: Transshipment[];
  /** Số ngày miễn lưu cont / lưu bãi tại cảng đến */
  freeDays: number | null;
  source: string;
  /** Thời điểm lấy / nhập dữ liệu (YYYY-MM-DD) */
  fetchedAt: string;
}

export interface ScheduleQuery {
  pol: string;
  pod: string;
  /** Chỉ lấy chuyến có ETD từ ngày này */
  date: string;
  carrier?: string;
}

export interface ScheduleProvider {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  getRoutings(q: ScheduleQuery): Promise<ScheduleEntry[]>;
}

export function createUserScheduleProvider(entries: ScheduleEntry[]): ScheduleProvider {
  return {
    id: 'user',
    label: 'Lịch tàu tôi nhập',
    enabled: true,
    async getRoutings(q) {
      return entries
        .filter((e) => e.pol === q.pol && e.pod === q.pod && (!q.carrier || e.carrier === q.carrier) && (!q.date || e.etd >= q.date))
        .sort((a, b) => a.etd.localeCompare(b.etd));
    },
  };
}

/**
 * Adapter theo chuẩn DCSA Commercial Schedules 1.0 (GET /v1/point-to-point-routes).
 * Trình duyệt không gọi thẳng API hãng tàu (CORS, lộ key) → gọi máy chủ PortRank `/api/schedules` (server/api.mjs),
 * máy chủ giữ key của từng hãng trong biến môi trường. Chuyển đổi dữ liệu: src/lib/dcsa.ts.
 */
export const DcsaScheduleProvider: ScheduleProvider = {
  id: 'dcsa',
  label: 'API hãng tàu (chuẩn DCSA)',
  enabled: true,
  async getRoutings(q) {
    const { fetchDcsaSchedules } = await import('../lib/dcsa');
    const r = await fetchDcsaSchedules({ pol: q.pol, pod: q.pod, from: q.date, carriers: q.carrier ? [q.carrier] : [] });
    return r.entries;
  },
};

export const SCHEDULE_STALE_DAYS = 7;

export const SCHEDULE_CSV_HEADER = [
  'carrier', 'service', 'vessel', 'voyage', 'pol', 'etd', 'cutoff_cy', 'cutoff_doc', 'cutoff_vgm',
  'ts1_port', 'ts1_eta', 'ts1_etd', 'ts1_vessel', 'ts2_port', 'ts2_eta', 'ts2_etd', 'ts2_vessel',
  'pod', 'eta', 'free_days', 'source',
];

export function parseScheduleRows(rows: string[][], today: string): { entries: ScheduleEntry[]; errors: string[] } {
  const recs = rowsToRecords(rows, {
    carrier: ['hang tau', 'scac', 'line'], service: ['dich vu'], vessel: ['tau', 'ten tau'], voyage: ['chuyen', 'so chuyen'],
    pol: ['cang di'], etd: [], cutoffCy: ['cutoff_cy', 'cy cutoff', 'cut off cy'], cutoffDoc: ['cutoff_doc', 'si cutoff', 'doc cutoff'], cutoffVgm: ['cutoff_vgm', 'vgm cutoff'],
    ts1Port: ['ts1_port', 'cang chuyen tai', 'cang chuyen tai 1'], ts1Eta: ['ts1_eta'], ts1Etd: ['ts1_etd'], ts1Vessel: ['ts1_vessel', 'tau noi', 'tau noi 1'],
    ts2Port: ['ts2_port', 'cang chuyen tai 2'], ts2Eta: ['ts2_eta'], ts2Etd: ['ts2_etd'], ts2Vessel: ['ts2_vessel', 'tau noi 2'],
    pod: ['cang den'], eta: [], freeDays: ['free_days', 'free time', 'mien luu'], source: ['nguon'],
  });
  const entries: ScheduleEntry[] = [], errors: string[] = [];
  recs.forEach((r, i) => {
    const line = i + 2;
    const carrier = findCarrier(r.carrier);
    const pol = resolvePortCode(r.pol), pod = resolvePortCode(r.pod);
    const etd = toIsoDate(r.etd), eta = toIsoDate(r.eta);
    if (!carrier) return errors.push(`Dòng ${line}: không nhận ra hãng tàu "${r.carrier ?? ''}"`);
    if (!pol || !pod) return errors.push(`Dòng ${line}: không nhận ra cảng`);
    if (!etd || !eta) return errors.push(`Dòng ${line}: thiếu ETD hoặc ETA`);
    if (eta < etd) return errors.push(`Dòng ${line}: ETA trước ETD`);
    const ts: Transshipment[] = [];
    for (const [port, a, d, v] of [[r.ts1Port, r.ts1Eta, r.ts1Etd, r.ts1Vessel], [r.ts2Port, r.ts2Eta, r.ts2Etd, r.ts2Vessel]]) {
      if (!port) continue;
      const code = resolvePortCode(port);
      if (!code) { errors.push(`Dòng ${line}: không nhận ra cảng chuyển tải "${port}"`); return; }
      ts.push({ port: code, eta: toIsoDate(a), etd: toIsoDate(d), vessel: v ?? '' });
    }
    const free = toNumber(r.freeDays);
    entries.push({
      id: `${Date.now().toString(36)}-${i}`, carrier: carrier.id, service: r.service ?? '', vessel: r.vessel ?? '', voyage: r.voyage ?? '',
      pol, pod, etd, eta, cutoffCy: toIsoDate(r.cutoffCy), cutoffDoc: toIsoDate(r.cutoffDoc), cutoffVgm: toIsoDate(r.cutoffVgm),
      transshipments: ts, freeDays: isFinite(free) ? free : null, source: r.source ?? 'Nhập tay', fetchedAt: today,
    });
  });
  return { entries, errors };
}
