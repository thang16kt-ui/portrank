import type { DrivingRoute } from '../providers/RoadProvider';
import type { LngLat } from '../types';
import { bearing, cumulativeNm, unwrapLongitudes } from './geo';
import { trackPosition, type Track } from './track';

export interface JourneyLeg {
  id: 'origin' | 'sea' | 'destination' | 'road';
  label: string;
  vehicle: 'truck' | 'ship';
  path: LngLat[];
  durationSeconds: number;
  road?: DrivingRoute;
  fetchedAt?: string;
  forecast?: boolean;
  track?: Track;
}

export const TRAFFIC_COLORS = { normal: '#16a34a', slow: '#f59e0b', jam: '#ef4444', severe: '#991b1b', closed: '#4b5563' } as const;
const motionCache = new WeakMap<JourneyLeg, { path: LngLat[]; weights: number[] }>();

/** Weight visual progress by segment length and reported speed, preserving the provider's total ETA. */
export function journeyPosition(leg: JourneyLeg, progress: number) {
  if (leg.track) {
    const position = trackPosition(leg.track, Math.max(0, Math.min(1, progress)) * leg.track.total);
    return { coord: position.pos, bearing: position.bearing, segmentIndex: position.index };
  }
  let motion = motionCache.get(leg);
  if (!motion) {
    const path = unwrapLongitudes(leg.path), cumulative = cumulativeNm(path);
    const baseline = Math.max(1, cumulative.at(-1)! * 1.852 / Math.max(1, leg.durationSeconds) * 3600);
    const weights = [0];
    for (let i = 1; i < path.length; i++) {
      const sections = leg.road?.trafficSections?.filter((s) => i > s.startIndex && i <= s.endIndex) ?? [];
      // Categorical traffic has no numeric speed. These weights only pace the visual
      // marker; they do not change the provider ETA or claim a measured km/h value.
      const speed = Math.min(baseline, ...sections.map((s) => Math.max(1, s.speedKmh ?? baseline / (s.severity === 'slow' ? 2 : s.severity === 'jam' || s.severity === 'severe' ? 4 : 1))));
      weights.push(weights.at(-1)! + (cumulative[i] - cumulative[i - 1]) / speed);
    }
    motion = { path, weights }; motionCache.set(leg, motion);
  }
  const { path, weights } = motion;
  const target = Math.max(0, Math.min(1, progress)) * weights.at(-1)!;
  let lo = 0, hi = path.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (weights[mid] <= target) lo = mid; else hi = mid; }
  const factor = weights[hi] > weights[lo] ? (target - weights[lo]) / (weights[hi] - weights[lo]) : 0;
  const a = path[lo], b = path[hi];
  return { coord: [a[0] + (b[0] - a[0]) * factor, a[1] + (b[1] - a[1]) * factor] as LngLat, bearing: bearing(a, b), segmentIndex: lo };
}

/** Progress, leg switching and the clock all use the same provider durations. */
export function journeyStage(legs: JourneyLeg[], progress: number) {
  const weights = legs.map((l) => Number.isFinite(l.durationSeconds) ? Math.max(0, l.durationSeconds) : 0);
  const total = weights.reduce((a, b) => a + b, 0);
  const target = Math.max(0, Math.min(1, progress)) * total;
  let start = 0;
  for (let i = 0; i < legs.length; i++) {
    if ((weights[i] > 0 && target < start + weights[i] - 1e-7) || i === legs.length - 1)
      return { leg: legs[i], index: i, progress: weights[i] ? Math.max(0, Math.min(1, (target - start) / weights[i])) : 1,
        elapsedSeconds: target, totalSeconds: total, legStartSeconds: start };
    start += weights[i];
  }
  return null;
}

export function journeyLegProgress(legs: JourneyLeg[], index: number) {
  const total = legs.reduce((n, l) => n + Math.max(0, l.durationSeconds), 0);
  return total > 0 ? legs.slice(0, index).reduce((n, l) => n + Math.max(0, l.durationSeconds), 0) / total : 0;
}

export function journeyStatus(leg: JourneyLeg, legProgress: number, playing: boolean, complete: boolean) {
  if (complete) return 'Đã đến nơi';
  if (!playing) return 'Tạm dừng mô phỏng';
  if (leg.vehicle === 'ship') {
    const day = legProgress * (leg.track?.total ?? 0);
    const stop = leg.track?.stops.find((s) => day >= s.arrive && day < s.depart);
    return stop ? `Đang dừng tại ${stop.name}` : 'Đang đi biển';
  }
  // A future departure alone does not establish a forecast for each road interval.
  if (leg.forecast) return 'Đang chạy · chưa xác nhận dự báo từng đoạn';
  const at = journeyPosition(leg, legProgress);
  const section = leg.road?.trafficSections?.find((s) => at.segmentIndex >= s.startIndex && at.segmentIndex < s.endIndex);
  if (section?.severity === 'closed') return 'Có thông tin đường đóng · cần kiểm tra tuyến';
  if (section?.severity === 'jam' || section?.severity === 'severe') return 'Giao thông ùn tắc';
  if (section?.severity === 'slow') return 'Giao thông chậm';
  return section?.severity === 'normal' ? 'Đang chạy' : 'Đang chạy · chưa có dữ liệu giao thông đoạn này';
}
