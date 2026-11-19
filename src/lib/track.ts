import { PRICING } from '../config/pricing';
import { PORT_BY_CODE } from '../data/ports';
import type { ScheduleEntry } from '../providers/ScheduleProvider';
import type { CargoType, LngLat, RouteResult } from '../types';
import { bearing, cumulativeNm, unwrapLongitudes } from './geo';
import type { PlanOption } from './plan';
import { findRoute } from './routing';
import { CANAL_IDS, seaDaysAt } from './transit';

export interface TrackStop {
  name: string;
  code?: string;
  coord: LngLat;
  arrive: number;
  depart: number;
  note?: string;
}

/** Quỹ đạo dùng cho hoạt ảnh: toạ độ + thời điểm (ngày kể từ lúc khởi hành) tại mỗi điểm */
export interface Track {
  coords: LngLat[];
  times: number[];
  total: number;
  vehicle: 'ship' | 'truck';
  /** true = thời gian ước tính theo quãng đường; false = ngày thật theo lịch tàu */
  estimated: boolean;
  stops: TrackStop[];
  /** Ngày khởi hành thật (nếu có lịch) */
  startDate?: string;
}

/** Tuyến biển ước tính: ngày = hải lý / (tốc độ × 24) + 1 ngày mỗi kênh đào đã qua */
export function seaTrack(route: RouteResult, cargo: CargoType): Track {
  const canals = route.passages.filter((p) => (CANAL_IDS as readonly string[]).includes(p.id));
  const times = route.cumNm.map((nm) => seaDaysAt(nm, cargo) + canals.filter((c) => c.atNm <= nm).length);
  return { coords: route.coords, times, total: times[times.length - 1], vehicle: 'ship', estimated: true, stops: [] };
}

/** Route-provider driving time; legacy fixtures retain the old model when no API route exists. */
export function roadTrack(o: PlanOption): Track | null {
  if (!o.roadPath || !o.roadKm) return null;
  const path = o.roadPath;
  const cum = cumulativeNm(path);
  const totalNm = cum[cum.length - 1] || 1;
  const driveDays = o.drivingRoute ? o.drivingRoute.durationSeconds / 86400 : o.roadKm / PRICING.road.kmPerDay;
  const coords: LngLat[] = [], times: number[] = [], stops: TrackStop[] = [];
  // vị trí (chỉ số) của từng cửa khẩu trên path = điểm gần nhất
  const gateIdx = (o.gates ?? []).map((g) => {
    let best = 0, bd = Infinity;
    path.forEach((p, i) => {
      const d = (p[0] - g.coord[0]) ** 2 + (p[1] - g.coord[1]) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  });
  let dwell = 0;
  path.forEach((p, i) => {
    const t = (cum[i] / totalNm) * driveDays + dwell;
    coords.push(p); times.push(t);
    const gi = gateIdx.indexOf(i);
    if (gi >= 0) {
      const d = PRICING.road.borderDays;
      stops.push({ name: o.gates![gi].name, coord: p, arrive: t, depart: t + d, note: 'Làm thủ tục cửa khẩu' });
      dwell += d;
      coords.push(p); times.push(t + d);
    }
  });
  return { coords, times, total: times[times.length - 1], vehicle: 'truck', estimated: true, stops };
}

const dayDiff = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);

/**
 * Tuyến theo lộ trình hãng tàu: vẽ đúng các chặng POL → cảng chuyển tải → POD, dùng NGÀY THẬT của lịch.
 * Tàu dừng tại cảng chuyển tải từ ngày đến tới ngày đi. Trả về null nếu không dựng được chặng nào.
 */
export function scheduleTrack(e: ScheduleEntry, opts: { avoidRedSea: boolean; avoidPanama: boolean }): Track | null {
  const codes = [e.pol, ...e.transshipments.map((t) => t.port), e.pod];
  const ports = codes.map((c) => PORT_BY_CODE[c]);
  if (ports.some((p) => !p)) return null;
  const total = dayDiff(e.etd, e.eta);
  // thời điểm đến / đi tại mỗi nút
  const arrive: number[] = [0], depart: number[] = [0];
  e.transshipments.forEach((t) => {
    arrive.push(t.eta ? dayDiff(e.etd, t.eta) : NaN);
    depart.push(t.etd ? dayDiff(e.etd, t.etd) : NaN);
  });
  arrive.push(total); depart.push(total);
  const legs = ports.slice(1).map((p, i) => findRoute(ports[i], p, opts));
  // nút thiếu ngày → nội suy theo quãng đường
  const cumDist = [0];
  legs.forEach((l) => cumDist.push(cumDist[cumDist.length - 1] + l.distanceNm));
  for (let i = 1; i < ports.length - 1; i++) {
    if (!isFinite(arrive[i])) arrive[i] = (cumDist[i] / cumDist[cumDist.length - 1]) * total;
    if (!isFinite(depart[i])) depart[i] = Math.min(total, arrive[i] + 2);
    if (depart[i] < arrive[i]) depart[i] = arrive[i];
  }
  const coords: LngLat[] = [], times: number[] = [], stops: TrackStop[] = [];
  legs.forEach((leg, i) => {
    const t0 = depart[i], t1 = Math.max(t0, arrive[i + 1]);
    leg.coords.forEach((c, k) => {
      coords.push(c);
      times.push(t0 + (leg.cumNm[k] / (leg.distanceNm || 1)) * (t1 - t0));
    });
    if (i < legs.length - 1) {
      const ts = e.transshipments[i];
      stops.push({ name: ports[i + 1].name, code: ports[i + 1].code, coord: ports[i + 1].coord, arrive: arrive[i + 1], depart: depart[i + 1], note: ts.vessel ? `Tàu nối: ${ts.vessel}` : undefined });
    }
  });
  // times phải không giảm
  for (let i = 1; i < times.length; i++) if (times[i] < times[i - 1]) times[i] = times[i - 1];
  return { coords: unwrapLongitudes(coords), times, total: Math.max(total, times[times.length - 1]), vehicle: 'ship', estimated: false, stops, startDate: e.etd };
}

/** Vị trí + hướng tại thời điểm `day` (tìm nhị phân) */
export function trackPosition(t: Track, day: number): { pos: LngLat; bearing: number; index: number } {
  const { times, coords } = t;
  const n = times.length;
  if (n === 1 || day <= times[0]) return { pos: coords[0], bearing: n > 1 ? bearing(coords[0], coords[1]) : 0, index: 0 };
  if (day >= times[n - 1]) return { pos: coords[n - 1], bearing: bearing(coords[n - 2], coords[n - 1]), index: n - 1 };
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= day) lo = mid;
    else hi = mid;
  }
  const f = times[hi] > times[lo] ? (day - times[lo]) / (times[hi] - times[lo]) : 0;
  const a = coords[lo], b = coords[hi];
  // hướng: lấy đoạn có độ dài khác 0 gần nhất phía trước
  let j = hi;
  while (j < n - 1 && coords[j][0] === a[0] && coords[j][1] === a[1]) j++;
  const same = b[0] === a[0] && b[1] === a[1];
  const brg = same ? (lo > 0 ? bearing(coords[lo - 1], a) : bearing(a, coords[j])) : bearing(a, b);
  return { pos: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], bearing: brg, index: lo };
}

/** Quỹ đạo của phương án đang chọn (ưu tiên lộ trình hãng tàu nếu có) */
export function trackOf(o: PlanOption, cargo: CargoType, schedule: ScheduleEntry | null, opts: { avoidRedSea: boolean; avoidPanama: boolean }): Track | null {
  if (o.mode === 'road') return roadTrack(o);
  if (!o.route) return null;
  if (schedule) {
    try {
      const t = scheduleTrack(schedule, opts);
      if (t) return t;
    } catch {
      /* rơi về ước tính */
    }
  }
  return seaTrack(o.route, cargo);
}
