import { PASSAGE_RISK, type Weights } from '../config/weights';
import { PORTS } from '../data/ports';
import type { Port, RouteOptions, RouteResult, ShipmentInput } from '../types';
import { haversineKm } from './geo';
import { estimateQuote } from './pricing';
import { findRoute } from './routing';
import { transitDays } from './transit';

/* ───────────── PRNG có seed cố định → dữ liệu giá mô phỏng tái lập được ───────────── */

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PricePoint {
  month: string; // 'MM/YYYY'
  price: number;
}

/**
 * DỮ LIỆU MÔ PHỎNG: 12 tháng giá cước cho cặp cảng, seed = mã cặp cảng.
 * Độ biến động phụ thuộc tuyến (qua Biển Đỏ biến động mạnh hơn) và mức ùn tắc cảng.
 */
export function simulatePriceHistory(polCode: string, podCode: string, basePrice: number, route?: RouteResult, endDate = new Date()): PricePoint[] {
  const rnd = mulberry32(hashString(`${polCode}-${podCode}`));
  const risky = route?.passages.some((p) => p.id === 'BAB_EL_MANDEB') ? 1.6 : 1;
  const vol = (0.05 + rnd() * 0.12) * risky;
  const trend = (rnd() - 0.5) * 0.02;
  const out: PricePoint[] = [];
  let level = 1 + (rnd() - 0.5) * 0.2;
  for (let i = 11; i >= 0; i--) {
    const d = new Date(endDate.getFullYear(), endDate.getMonth() - i, 1);
    const shock = rnd() < 0.08 ? (rnd() - 0.3) * 0.5 * risky : 0;
    level = Math.max(0.5, level * (1 + trend + (rnd() - 0.5) * 2 * vol + shock));
    level = level + (1 - level) * 0.25; // hồi quy về trung bình
    out.push({ month: `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`, price: Math.round(basePrice * level) });
  }
  return out;
}

/** Hệ số biến thiên CV = độ lệch chuẩn / trung bình */
export function coefficientOfVariation(xs: number[]): number {
  if (!xs.length) return 0;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  if (mean === 0) return 0;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
  return sd / mean;
}

/** Chuẩn hóa 0–100, "tốt nhất" = 100. lowerIsBetter: chi phí, thời gian, CV, rủi ro */
export function normalize(values: number[], lowerIsBetter = true): number[] {
  const min = Math.min(...values), max = Math.max(...values);
  if (!isFinite(min) || max - min < 1e-9) return values.map(() => 100);
  return values.map((v) => (lowerIsBetter ? (100 * (max - v)) / (max - min) : (100 * (v - min)) / (max - min)));
}

export function weightedScore(scores: Record<keyof Weights, number>, w: Weights): number {
  const total = w.cost + w.stability + w.time + w.frequency + w.risk || 1;
  return (scores.cost * w.cost + scores.stability * w.stability + scores.time * w.time + scores.frequency * w.frequency + scores.risk * w.risk) / total;
}

export function portsWithin(center: Port, radiusKm: number): Port[] {
  return PORTS.filter((p) => p.code === center.code || haversineKm(p.coord, center.coord) <= radiusKm);
}

export interface AltCandidate {
  pol: Port;
  pod: Port;
  route: RouteResult;
  cost: number;
  days: number;
  cv: number;
  frequency: number; // chuyến/tuần (mô phỏng)
  risk: number; // 0..1
  history: PricePoint[];
  scores: Record<keyof Weights, number>;
  score: number;
  tags: string[];
  isCurrent: boolean;
}

export interface RankingInput {
  pol: Port;
  pod: Port;
  radiusKm: number;
  shipment: ShipmentInput;
  options: RouteOptions;
  weights: Weights;
  /** Giới hạn số cặp tính toán */
  maxPairs?: number;
}

/** Tần suất tàu (mô phỏng): dịch vụ chung ≈ min của hai đầu, giảm dần theo khoảng cách khu vực */
export function pairFrequency(pol: Port, pod: Port): number {
  const base = Math.min(pol.weeklyServices, pod.weeklyServices);
  const factor = pol.region === pod.region ? 0.35 : 0.18;
  return Math.max(1, Math.round(base * factor));
}

export function routeRisk(route: RouteResult, pol: Port, pod: Port): number {
  const passage = route.passages.reduce((s, p) => s + (PASSAGE_RISK[p.id] ?? 0), 0);
  return Math.min(1, passage + (pol.congestion + pod.congestion) * 0.25);
}

export function rankAlternatives(input: RankingInput): AltCandidate[] {
  const { pol, pod, radiusKm, shipment, options, weights } = input;
  const pols = portsWithin(pol, radiusKm);
  const pods = portsWithin(pod, radiusKm);
  const pairs: [Port, Port][] = [];
  for (const a of pols) for (const b of pods) if (a.code !== b.code) pairs.push([a, b]);
  // ưu tiên cặp gần cặp gốc nhất nếu quá nhiều
  pairs.sort((x, y) => haversineKm(x[0].coord, pol.coord) + haversineKm(x[1].coord, pod.coord) - (haversineKm(y[0].coord, pol.coord) + haversineKm(y[1].coord, pod.coord)));
  const limited = pairs.slice(0, input.maxPairs ?? 40);

  const raw = limited.map(([a, b]) => {
    const route = findRoute(a, b, options);
    const quote = estimateQuote({ pol: a, pod: b, route, shipment });
    const history = simulatePriceHistory(a.code, b.code, quote.total, route);
    return {
      pol: a,
      pod: b,
      route,
      cost: quote.total,
      days: transitDays(route, shipment.cargo),
      cv: coefficientOfVariation(history.map((h) => h.price)),
      frequency: pairFrequency(a, b),
      risk: routeRisk(route, a, b),
      history,
      isCurrent: a.code === pol.code && b.code === pod.code,
    };
  });
  const nCost = normalize(raw.map((r) => r.cost));
  const nStab = normalize(raw.map((r) => r.cv));
  const nTime = normalize(raw.map((r) => r.days));
  const nFreq = normalize(raw.map((r) => r.frequency), false);
  const nRisk = normalize(raw.map((r) => r.risk));
  const out: AltCandidate[] = raw.map((r, i) => {
    const scores = { cost: nCost[i], stability: nStab[i], time: nTime[i], frequency: nFreq[i], risk: nRisk[i] };
    return { ...r, scores, score: weightedScore(scores, weights), tags: [] };
  });
  if (out.length) {
    const tag = (arr: AltCandidate[], pick: (c: AltCandidate) => number, label: string) => {
      const best = arr.reduce((m, c) => (pick(c) < pick(m) ? c : m));
      best.tags.push(label);
    };
    tag(out, (c) => c.cost, 'Rẻ nhất');
    tag(out, (c) => c.days, 'Nhanh nhất');
    tag(out, (c) => c.cv, 'Ổn định nhất');
  }
  return out.sort((a, b) => b.score - a.score);
}
