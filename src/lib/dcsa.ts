import { findCarrier } from '../data/carriers';
import type { ScheduleEntry, Transshipment } from '../providers/ScheduleProvider';
import { todayIso } from './csv';

/**
 * Kiểu dữ liệu theo đặc tả DCSA Commercial Schedules 1.0.0 (GET /v1/point-to-point-routes).
 * Chỉ khai báo các trường PortRank dùng. Nguồn: https://api.swaggerhub.com/apis/dcsaorg/DCSA_CS/1.0.0
 */
export interface DcsaLocation {
  locationName?: string;
  UNLocationCode?: string;
  facility?: { facilityCode?: string; facilityCodeListProvider?: string };
}
export interface DcsaPlace {
  facilityTypeCode?: string;
  location?: DcsaLocation;
  dateTime?: string;
}
export interface DcsaServicePartner {
  carrierCode?: string;
  carrierServiceName?: string;
  carrierServiceCode?: string;
  carrierExportVoyageNumber?: string;
  carrierImportVoyageNumber?: string;
}
export interface DcsaTransport {
  modeOfTransport?: string;
  servicePartners?: DcsaServicePartner[];
  universalServiceReference?: string;
  universalExportVoyageReference?: string;
  vessel?: { name?: string; vesselIMONumber?: string };
  barge?: { name?: string };
}
export interface DcsaLeg {
  sequenceNumber?: number;
  transport?: DcsaTransport;
  departure: DcsaPlace;
  arrival: DcsaPlace;
}
export interface DcsaPointToPoint {
  placeOfReceipt: DcsaPlace;
  placeOfDelivery: DcsaPlace;
  receiptTypeAtOrigin?: string;
  deliveryTypeAtDestination?: string;
  cutOffTimes?: { cutOffDateTimeCode: string; cutOffDateTime: string }[];
  solutionNumber?: number;
  transitTime?: number;
  legs: DcsaLeg[];
}

/** Lấy ngày (giờ địa phương của cảng) từ ISO date-time có offset */
const day = (dt?: string) => (dt && /^\d{4}-\d{2}-\d{2}/.test(dt) ? dt.slice(0, 10) : '');
const code = (p?: DcsaPlace) => p?.location?.UNLocationCode ?? '';

/** Chuyển một PointToPoint (DCSA) thành lộ trình của PortRank. Trả về null nếu thiếu ngày đi/đến. */
export function dcsaToSchedule(p: DcsaPointToPoint, carrierId: string, index = 0, fetchedAt = todayIso()): ScheduleEntry | null {
  const legs = [...(p.legs ?? [])].sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0));
  const vesselLegs = legs.filter((l) => l.transport?.modeOfTransport === 'VESSEL');
  const sea = vesselLegs.length ? vesselLegs : legs;
  if (!sea.length) return null;
  const first = sea[0], last = sea[sea.length - 1];
  const etd = day(first.departure.dateTime), eta = day(last.arrival.dateTime);
  if (!etd || !eta) return null;
  const sp = first.transport?.servicePartners?.[0];
  const ts: Transshipment[] = [];
  for (let i = 0; i < sea.length - 1; i++) {
    const port = code(sea[i].arrival) || code(sea[i + 1].departure);
    if (!port) continue;
    ts.push({ port, eta: day(sea[i].arrival.dateTime), etd: day(sea[i + 1].departure.dateTime), vessel: sea[i + 1].transport?.vessel?.name ?? '' });
  }
  const cut = (c: string) => day(p.cutOffTimes?.find((x) => x.cutOffDateTimeCode === c)?.cutOffDateTime);
  const name = findCarrier(carrierId)?.name ?? carrierId;
  return {
    id: `dcsa-${carrierId}-${p.solutionNumber ?? index}-${etd}-${first.transport?.vessel?.vesselIMONumber ?? first.transport?.vessel?.name ?? ''}`,
    carrier: findCarrier(carrierId)?.id ?? carrierId,
    service: sp?.carrierServiceName ?? sp?.carrierServiceCode ?? first.transport?.universalServiceReference ?? '',
    vessel: first.transport?.vessel?.name ?? first.transport?.barge?.name ?? '',
    voyage: sp?.carrierExportVoyageNumber ?? first.transport?.universalExportVoyageReference ?? '',
    pol: code(first.departure) || code(p.placeOfReceipt),
    pod: code(last.arrival) || code(p.placeOfDelivery),
    etd,
    eta,
    cutoffCy: cut('FCO'),
    cutoffDoc: cut('DCO'),
    cutoffVgm: cut('VCO'),
    transshipments: ts,
    freeDays: null,
    source: `API hãng tàu (DCSA) · ${name}`,
    fetchedAt,
  };
}

export interface ApiConfig {
  server: boolean;
  hts: boolean;
  dcsa: { id: string; configured: boolean }[];
}

let configPromise: Promise<ApiConfig | null> | null = null;
/** Hỏi máy chủ PortRank tính năng nào đang bật. Trang tĩnh (không có máy chủ) → null. */
export function fetchApiConfig(): Promise<ApiConfig | null> {
  configPromise ??= fetch('/api/config', { headers: { Accept: 'application/json' } })
    .then(async (r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? ((await r.json()) as ApiConfig) : null))
    .catch(() => null);
  return configPromise;
}

export interface DcsaFetchResult {
  fetchedAt: string;
  entries: ScheduleEntry[];
  errors: { carrier: string; error: string }[];
}

/** Gọi /api/schedules (máy chủ PortRank giữ key hãng tàu) rồi chuyển sang lộ trình PortRank */
export async function fetchDcsaSchedules(q: { pol: string; pod: string; from: string; to?: string; carriers?: string[] }): Promise<DcsaFetchResult> {
  const params = new URLSearchParams({ pol: q.pol, pod: q.pod, from: q.from });
  if (q.to) params.set('to', q.to);
  if (q.carriers?.length) params.set('carrier', q.carriers.join(','));
  const res = await fetch(`/api/schedules?${params}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Máy chủ trả về HTTP ${res.status}`);
  const body = (await res.json()) as { fetchedAt: string; results: { carrier: string; routes: DcsaPointToPoint[]; error?: string }[] };
  const fetchedAt = body.fetchedAt.slice(0, 10);
  const entries: ScheduleEntry[] = [];
  const errors: DcsaFetchResult['errors'] = [];
  for (const r of body.results) {
    if (r.error) errors.push({ carrier: r.carrier, error: r.error });
    r.routes.forEach((p, i) => {
      const e = dcsaToSchedule(p, r.carrier, i, fetchedAt);
      if (e) entries.push(e);
    });
  }
  return { fetchedAt, entries, errors };
}
