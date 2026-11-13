/**
 * V2 – "Mạng tuyến đa cảng": từ mọi cảng quanh A tới mọi cảng quanh B (và ngược lại),
 * vẽ đồng thời tất cả tuyến, mỗi tuyến một màu, có nhãn thời gian / chi phí ngay trên đường.
 * File này chỉ chứa logic thuần (không phụ thuộc UI).
 */
import type { CargoType, LngLat, RouteResult } from '../types';
import { positionAt } from './geo';
import type { AltCandidate } from './ranking';
import { dayAt, transitDays } from './transit';

export interface NetworkRoute {
  key: string;
  rank: number; // 1 = tốt nhất theo điểm tổng hợp
  candidate: AltCandidate;
  route: RouteResult;
  color: [number, number, number];
  hex: string;
  /** Độ lệch song song (pixel) để các tuyến chạy chung không chồng lên nhau – kiểu bản đồ metro */
  offsetPx: number;
  width: number;
  /** Ngày (kể từ lúc rời bến) tại mỗi điểm của route.coords – dùng cho hoạt ảnh "đua" */
  times: number[];
  /** Tổng ngày tới cảng đến */
  arrivalDays: number;
  /** Vị trí đặt nhãn trên đường (tỉ lệ quãng đường 0..1) */
  labelAt: number;
  labelPos: LngLat;
}

/** Bảng màu phân biệt rõ, tránh trùng xanh dương/cam của ghim cảng đi/đến */
export const NETWORK_COLORS: string[] = ['#10b981', '#8b5cf6', '#ef4444', '#0ea5e9', '#eab308', '#ec4899', '#14b8a6', '#a16207'];
export const NETWORK_OTHER = '#94a3b8';

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const pairKey = (pol: string, pod: string) => `${pol}>${pod}`;

/**
 * Dựng mạng tuyến từ danh sách cặp cảng đã xếp hạng (giảm dần theo điểm).
 * - Màu theo thứ hạng (8 màu đầu), còn lại màu xám.
 * - Offset song song: các tuyến xếp đối xứng quanh đường tâm, tuyến hạng 1 nằm giữa.
 * - Nhãn: rải đều các vị trí dọc tuyến để nhãn của các tuyến chạy chung không đè nhau.
 */
export function buildNetwork(ranked: AltCandidate[], cargo: CargoType): NetworkRoute[] {
  const n = ranked.length;
  return ranked.map((c, i) => {
    const hex = i < NETWORK_COLORS.length ? NETWORK_COLORS[i] : NETWORK_OTHER;
    const times = c.route.cumNm.map((nm) => dayAt(c.route, nm, cargo));
    const arrivalDays = transitDays(c.route, cargo);
    // 0, +1, -1, +2, -2 … (×4 px); chỉ 8 tuyến có màu được tách làn, tuyến xám nằm dưới đường tâm
    const slot = i >= NETWORK_COLORS.length ? 0 : i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2);
    // 5 nhãn đầu rải đều 18–82% quãng đường; các nhãn sau chen vào khoảng giữa
    const top = Math.min(n, 5);
    const labelAt = n <= 1 ? 0.5 : i < top ? 0.18 + (0.64 * i) / Math.max(1, top - 1) : 0.18 + (0.64 * ((i - top + 0.5) / (n - top)));
    const labelPos = positionAt(c.route.coords, c.route.cumNm, labelAt * c.route.distanceNm).pos;
    return {
      key: pairKey(c.pol.code, c.pod.code),
      rank: i + 1,
      candidate: c,
      route: c.route,
      color: hexToRgb(hex),
      hex,
      offsetPx: slot * 4,
      width: i === 0 ? 5 : i < 3 ? 4 : i < NETWORK_COLORS.length ? 3 : 2,
      times,
      arrivalDays,
      labelAt,
      labelPos,
    };
  });
}

/** Vị trí + hướng của tàu sau `day` ngày (tìm nhị phân trên mảng times) */
export function positionAtDay(nr: Pick<NetworkRoute, 'route' | 'times'>, day: number) {
  const { times, route } = nr;
  if (day <= times[0]) return { ...positionAt(route.coords, route.cumNm, 0), arrived: false };
  if (day >= times[times.length - 1]) return { ...positionAt(route.coords, route.cumNm, route.distanceNm), arrived: true };
  let lo = 0, hi = times.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= day) lo = mid;
    else hi = mid;
  }
  const t = times[hi] > times[lo] ? (day - times[lo]) / (times[hi] - times[lo]) : 0;
  const nm = route.cumNm[lo] + (route.cumNm[hi] - route.cumNm[lo]) * t;
  return { ...positionAt(route.coords, route.cumNm, nm), arrived: false };
}

/** Thứ tự về đích (1 = sớm nhất) theo số ngày */
export function finishOrder(routes: NetworkRoute[]): Map<string, number> {
  const sorted = [...routes].sort((a, b) => a.arrivalDays - b.arrivalDays);
  return new Map(sorted.map((r, i) => [r.key, i + 1]));
}

export const maxArrival = (routes: NetworkRoute[]) => Math.max(0, ...routes.map((r) => r.arrivalDays));
