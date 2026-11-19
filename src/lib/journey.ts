import type { DrivingRoute } from '../providers/RoadProvider';
import type { LngLat } from '../types';
import { bearing, cumulativeNm, unwrapLongitudes } from './geo';

export interface JourneyLeg {
  id: 'origin' | 'sea' | 'destination' | 'road';
  label: string;
  vehicle: 'truck' | 'ship';
  path: LngLat[];
  durationSeconds: number;
  road?: DrivingRoute;
  fetchedAt?: string;
  forecast?: boolean;
}

export const TRAFFIC_COLORS = { slow: '#f59e0b', jam: '#ef4444', severe: '#991b1b', closed: '#4b5563' } as const;
const motionCache = new WeakMap<JourneyLeg, { path: LngLat[]; weights: number[] }>();

/** Weight visual progress by segment length and reported speed, preserving the provider's total ETA. */
export function journeyPosition(leg: JourneyLeg, progress: number) {
  let motion = motionCache.get(leg);
  if (!motion) {
    const path = unwrapLongitudes(leg.path), cumulative = cumulativeNm(path);
    const baseline = Math.max(1, cumulative.at(-1)! * 1.852 / Math.max(1, leg.durationSeconds) * 3600);
    const weights = [0];
    for (let i = 1; i < path.length; i++) {
      const sections = leg.road?.trafficSections?.filter((s) => i > s.startIndex && i <= s.endIndex) ?? [];
      const speed = Math.min(baseline, ...sections.map((s) => Math.max(1, s.speedKmh ?? baseline)));
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
  return { coord: [a[0] + (b[0] - a[0]) * factor, a[1] + (b[1] - a[1]) * factor] as LngLat, bearing: bearing(a, b) };
}

/** Give each inland leg enough screen time; this is playback time, not a clock predicting arrival. */
export function journeyStage(legs: JourneyLeg[], progress: number) {
  const weights = legs.map((l) => l.vehicle === 'ship' ? 2.5 : 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const target = Math.max(0, Math.min(1, progress)) * total;
  let start = 0;
  for (let i = 0; i < legs.length; i++) {
    if (target <= start + weights[i] || i === legs.length - 1)
      return { leg: legs[i], index: i, progress: Math.min(1, (target - start) / weights[i]) };
    start += weights[i];
  }
  return null;
}
