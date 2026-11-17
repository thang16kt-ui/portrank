import { PASSAGE_RISK, type Weights } from '../config/weights';
import type { Incoterm, Port, Role, RouteResult } from '../types';
import { splitItems, type SplitOptions } from './incoterm';
import type { PlanOption } from './plan';

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

export type CostBasis = 'mine' | 'total';

export interface RankedOption {
  option: PlanOption;
  rank: number;
  /** Chi phí dùng để xếp hạng (phần người dùng trả theo Incoterm, hoặc tổng) */
  cost: number;
  youPay: number;
  otherPays: number;
  scores: Record<keyof Weights, number>;
  score: number;
  tags: string[];
}

/**
 * Xếp hạng các phương án. Chuẩn hoá mỗi tiêu chí về 0–100 rồi tính điểm theo trọng số.
 * Chi phí xếp hạng = phần NGƯỜI DÙNG phải trả theo Incoterm đang chọn (hoặc tổng nếu basis = 'total').
 */
export function rankOptions(options: PlanOption[], term: Incoterm, role: Role, weights: Weights, basis: CostBasis = 'mine', split: SplitOptions = {}): RankedOption[] {
  if (!options.length) return [];
  const parts = options.map((o) => splitItems(o.items, term, role, split));
  let costs = options.map((o, i) => (basis === 'mine' ? parts[i].you : o.total));
  // Phần người dùng trả gần như giống nhau ở mọi phương án (vd. người bán + FOB) → dùng tổng chi phí để phân biệt
  const meanTotal = options.reduce((s, o) => s + o.total, 0) / options.length;
  if (basis === 'mine' && Math.max(...costs) - Math.min(...costs) < 0.005 * meanTotal) costs = options.map((o) => o.total);
  const nCost = normalize(costs);
  const nStab = normalize(options.map((o) => o.cv));
  const nTime = normalize(options.map((o) => o.days.total));
  const nFreq = normalize(options.map((o) => o.frequency), false);
  const nRisk = normalize(options.map((o) => o.risk));
  const out: RankedOption[] = options.map((option, i) => {
    const scores = { cost: nCost[i], stability: nStab[i], time: nTime[i], frequency: nFreq[i], risk: nRisk[i] };
    return { option, rank: 0, cost: costs[i], youPay: parts[i].you, otherPays: parts[i].other, scores, score: weightedScore(scores, weights), tags: [] };
  });
  if (out.length > 1) {
    const tag = (pick: (c: RankedOption) => number, label: string) => out.reduce((m, c) => (pick(c) < pick(m) ? c : m)).tags.push(label);
    tag((c) => c.cost, 'Rẻ nhất');
    tag((c) => c.option.days.total, 'Nhanh nhất');
    tag((c) => c.option.cv, 'Ổn định nhất');
  }
  out.sort((a, b) => b.score - a.score || a.cost - b.cost);
  out.forEach((r, i) => (r.rank = i + 1));
  return out;
}
