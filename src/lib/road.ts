import { BORDER_GATES, type BorderGate } from '../data/borderGates';
import type { LngLat } from '../types';
import { densify, haversineKm, unwrapLongitudes } from './geo';
import { PRICING } from '../config/pricing';

export interface RoadRoute {
  gates: BorderGate[];
  /** Quãng đường bộ ước tính (Haversine × 1,3 qua các cửa khẩu) */
  km: number;
  path: LngLat[];
  /** true = chưa có dữ liệu cửa khẩu, vẽ tuyến thẳng */
  straight: boolean;
}

const F = PRICING.inland.roadFactor;

function build(o: LngLat, d: LngLat, gates: BorderGate[], straight: boolean): RoadRoute {
  const pts = [o, ...gates.map((g) => g.coord), d];
  let km = 0;
  for (let i = 1; i < pts.length; i++) km += haversineKm(pts[i - 1], pts[i]) * F;
  return { gates, km, path: unwrapLongitudes(densify(pts, 15)), straight };
}

/**
 * Các phương án tuyến đường bộ giữa hai điểm ở hai nước: đi qua chuỗi cửa khẩu (tìm đường ngắn nhất trên
 * đồ thị cửa khẩu, mỗi cửa khẩu đầu tiên cho một phương án). Chưa có dữ liệu → một tuyến thẳng.
 */
export function roadRoutes(o: LngLat, oc: string, d: LngLat, dc: string, gates: BorderGate[] = BORDER_GATES, maxOptions = 4): RoadRoute[] {
  if (oc === dc) return [build(o, d, [], false)];
  const other = (g: BorderGate, c: string) => (g.a === c ? g.b : g.a);
  const out: RoadRoute[] = [];
  for (const first of gates.filter((g) => g.a === oc || g.b === oc)) {
    // Dijkstra trên trạng thái (cửa khẩu vừa qua, nước đang đứng)
    type S = { gate: BorderGate; country: string; km: number; seq: BorderGate[] };
    const start: S = { gate: first, country: other(first, oc), km: haversineKm(o, first.coord), seq: [first] };
    const open: S[] = [start];
    const seen = new Map<string, number>();
    let best: S | null = null, bestKm = Infinity;
    while (open.length) {
      open.sort((a, b) => a.km - b.km);
      const s = open.shift()!;
      const key = `${s.gate.id}|${s.country}`;
      if ((seen.get(key) ?? Infinity) <= s.km) continue;
      seen.set(key, s.km);
      if (s.country === dc) {
        const total = s.km + haversineKm(s.gate.coord, d);
        if (total < bestKm) { bestKm = total; best = s; }
        continue;
      }
      if (s.seq.length >= 5) continue;
      for (const g of gates) {
        if (s.seq.includes(g) || (g.a !== s.country && g.b !== s.country)) continue;
        const next = other(g, s.country);
        if (next === oc) continue;
        open.push({ gate: g, country: next, km: s.km + haversineKm(s.gate.coord, g.coord), seq: [...s.seq, g] });
      }
    }
    if (best) out.push(build(o, d, best.seq, false));
  }
  if (!out.length) return [build(o, d, [], true)];
  out.sort((a, b) => a.km - b.km);
  const cut = out[0].km * 1.4;
  return out.filter((r) => r.km <= cut).slice(0, maxOptions);
}
