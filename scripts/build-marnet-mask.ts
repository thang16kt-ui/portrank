/**
 * Tiền xử lý mạng marnet (searoute-js): tìm cạnh cắt qua đất liền (Natural Earth 1:50m).
 *  - Nếu tìm được 1–2 điểm trung gian trên biển để "đi vòng" → ghi vào `fix` (cạnh được thay thế).
 *  - Nếu không → ghi vào `blocked` (bỏ cạnh).
 * Kết quả: src/data/marnetPatch.json. Chạy: npx tsx scripts/build-marnet-mask.ts
 */
import { writeFileSync } from 'node:fs';
import marnet from 'searoute-js/data/marnet_densified.json';
import { haversineKm } from '../src/lib/geo';
import { onLand, EXEMPT } from './land';
import type { LngLat } from '../src/types';

const key = (c: number[]) => `${(c[0] <= -180 ? 180 : c[0]).toFixed(4)},${c[1].toFixed(4)}`;

const BUFFER_DEG = 0.018;

function crosses(a: LngLat, b: LngLat, buffer = 0): boolean {
  let dLon = b[0] - a[0];
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const km = haversineKm(a, b);
  const n = Math.max(2, Math.ceil(km / 1));
  const len = Math.hypot(dLon, b[1] - a[1]) || 1;
  // vùng đệm ~2 km hai bên tuyến
  const bx = (-(b[1] - a[1]) / len) * buffer, by = (dLon / len) * buffer;
  for (let k = 1; k < n; k++) {
    const p: LngLat = [a[0] + (dLon * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
    if (EXEMPT.some((e) => haversineKm(p, e.c) < e.km)) continue;
    if (onLand(p) || (buffer > 0 && (onLand([p[0] + bx, p[1] + by]) || onLand([p[0] - bx, p[1] - by])))) return true;
  }
  return false;
}

function findVia(a: LngLat, b: LngLat, buf: number, exhaustive: boolean): LngLat[] | null {
  const X = (p: LngLat, q: LngLat) => crosses(p, q, buf);
  let dLon = b[0] - a[0];
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const dLat = b[1] - a[1];
  const len = Math.hypot(dLon, dLat) || 1;
  const nx = -dLat / len, ny = dLon / len; // pháp tuyến
  const offsets = [0.03, 0.06, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7, 0.9, 1.2, 1.6, 2.0, 2.5, 3.0, 4.0];
  // 1 điểm trung gian
  for (const off of offsets) {
    for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      for (const sgn of [1, -1]) {
        const v: LngLat = [a[0] + dLon * t + nx * off * sgn, a[1] + dLat * t + ny * off * sgn];
        if (!onLand(v) && !X(a, v) && !X(v, b)) return [v];
      }
    }
  }
  // 2 điểm trung gian cùng phía
  for (const off of offsets) {
    for (const sgn of [1, -1]) {
      const v1: LngLat = [a[0] + dLon * 0.25 + nx * off * sgn, a[1] + dLat * 0.25 + ny * off * sgn];
      const v2: LngLat = [a[0] + dLon * 0.75 + nx * off * sgn, a[1] + dLat * 0.75 + ny * off * sgn];
      if (!onLand(v1) && !onLand(v2) && !X(a, v1) && !X(v1, v2) && !X(v2, b)) return [v1, v2];
    }
  }
  if (!exhaustive) return null;
  // 2 điểm trung gian khác phía / lệch nhau
  for (const o1 of offsets) for (const o2 of offsets) for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
    const v1: LngLat = [a[0] + dLon * 0.33 + nx * o1 * s1, a[1] + dLat * 0.33 + ny * o1 * s1];
    const v2: LngLat = [a[0] + dLon * 0.67 + nx * o2 * s2, a[1] + dLat * 0.67 + ny * o2 * s2];
    if (!onLand(v1) && !onLand(v2) && !X(a, v1) && !X(v1, v2) && !X(v2, b)) return [v1, v2];
  }
  return null;
}

/** Đỉnh nằm trên đất liền → dời ra điểm nước gần nhất */
const move: Record<string, LngLat> = {};
const isExempt = (p: LngLat) => EXEMPT.some((e) => haversineKm(p, e.c) < e.km);
function nearestWater(p: LngLat): LngLat | null {
  for (let r = 0.02; r <= 0.8; r += 0.02) {
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * Math.PI * 2;
      const q: LngLat = [p[0] + (r * Math.cos(ang)) / Math.cos((p[1] * Math.PI) / 180), p[1] + r * Math.sin(ang)];
      if (!onLand(q)) {
        // lùi thêm một chút ra biển
        const q2: LngLat = [p[0] + ((r + 0.03) * Math.cos(ang)) / Math.cos((p[1] * Math.PI) / 180), p[1] + (r + 0.03) * Math.sin(ang)];
        return onLand(q2) ? q : q2;
      }
    }
  }
  return null;
}
for (const f of (marnet as any).features) {
  for (const c of f.geometry.coordinates as LngLat[]) {
    const k = key(c);
    if (move[k] || isExempt(c) || !onLand(c)) continue;
    const w = nearestWater(c);
    if (w) move[k] = [+w[0].toFixed(4), +w[1].toFixed(4)];
  }
}
const at = (c: number[]): LngLat => move[key(c)] ?? (c as LngLat);

const blocked: string[] = [];
const fix: Record<string, LngLat[]> = {};
let total = 0;
for (const f of (marnet as any).features) {
  const cs = f.geometry.coordinates as number[][];
  for (let i = 1; i < cs.length; i++) {
    total++;
    const a = at(cs[i - 1]), b = at(cs[i]);
    if (!crosses(a, b)) continue;
    const k = `${key(cs[i - 1])}|${key(cs[i])}`;
    const endOnLand = (onLand(a) && !isExempt(a)) || (onLand(b) && !isExempt(b));
    // ưu tiên điểm nắn cách bờ ~2 km, nếu không được thì chấp nhận sát bờ
    let via = endOnLand ? null : findVia(a, b, BUFFER_DEG, false);
    if (!via && !endOnLand) via = findVia(a, b, 0, true);
    if (via) fix[k] = via.map((v) => [+v[0].toFixed(4), +v[1].toFixed(4)] as LngLat);
    else blocked.push(k);
  }
}
writeFileSync('src/data/marnetPatch.json', JSON.stringify({ move, blocked, fix }));
console.log(`${total} cạnh: ${Object.keys(move).length} đỉnh dời ra biển, ${Object.keys(fix).length} cạnh nắn lại, ${blocked.length} bị bỏ`);
