import type { LngLat } from '../types';

export const EARTH_RADIUS_KM = 6371.0088;
export const KM_PER_NM = 1.852;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Khoảng cách great-circle (km) */
export function haversineKm(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * D2R;
  const dLon = (b[0] - a[0]) * D2R;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

export const haversineNm = (a: LngLat, b: LngLat) => haversineKm(a, b) / KM_PER_NM;

/** Hướng (bearing) từ a → b, độ, 0 = Bắc, theo chiều kim đồng hồ */
export function bearing(a: LngLat, b: LngLat): number {
  const φ1 = a[1] * D2R;
  const φ2 = b[1] * D2R;
  const Δλ = (b[0] - a[0]) * D2R;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * R2D + 360) % 360;
}

/** Nội suy great-circle giữa a và b, t ∈ [0,1] */
export function interpolateGC(a: LngLat, b: LngLat, t: number): LngLat {
  const φ1 = a[1] * D2R, λ1 = a[0] * D2R, φ2 = b[1] * D2R, λ2 = b[0] * D2R;
  const d = haversineKm(a, b) / EARTH_RADIUS_KM;
  if (d < 1e-9) return [a[0], a[1]];
  const A = Math.sin((1 - t) * d) / Math.sin(d);
  const B = Math.sin(t * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return [Math.atan2(y, x) * R2D, Math.atan2(z, Math.sqrt(x * x + y * y)) * R2D];
}

/**
 * Làm dày tuyến theo great-circle (~stepKm/điểm).
 * Đoạn dài hơn `planarAboveDeg` độ được chia tuyến tính trước (giữ đúng hình dạng mạng lưới
 * vốn vẽ trên mặt phẳng kinh-vĩ độ, tránh great-circle "cắt góc" qua đất liền).
 */
export function densify(coords: LngLat[], stepKm = 20, planarAboveDeg = 2): LngLat[] {
  if (coords.length < 2) return coords.slice();
  // bước 1: chia tuyến tính các đoạn dài (theo kinh độ đã unwrap)
  const src = unwrapLongitudes(coords);
  const pre: LngLat[] = [src[0]];
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1], b = src[i];
    const span = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    const n = span > planarAboveDeg ? Math.ceil(span / planarAboveDeg) : 1;
    for (let k = 1; k <= n; k++) pre.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  // bước 2: great-circle ~stepKm
  const out: LngLat[] = [pre[0]];
  for (let i = 1; i < pre.length; i++) {
    const a = pre[i - 1], b = pre[i];
    const d = haversineKm(a, b);
    const n = Math.max(1, Math.ceil(d / stepKm));
    for (let k = 1; k <= n; k++) out.push(k === n ? b : interpolateGC(a, b, k / n));
  }
  return unwrapLongitudes(out);
}

/**
 * "Unwrap" kinh độ để tuyến liên tục khi đi qua kinh tuyến 180°
 * (ví dụ 179 → 181 thay vì 179 → -179), tránh bị vẽ ngang cả bản đồ.
 */
export function unwrapLongitudes(coords: LngLat[]): LngLat[] {
  if (!coords.length) return [];
  const out: LngLat[] = [[coords[0][0], coords[0][1]]];
  for (let i = 1; i < coords.length; i++) {
    let lon = coords[i][0];
    const prev = out[i - 1][0];
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    out.push([lon, coords[i][1]]);
  }
  return out;
}

export const normalizeLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** Hải lý cộng dồn tại mỗi điểm */
export function cumulativeNm(coords: LngLat[]): number[] {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversineNm(coords[i - 1], coords[i]));
  return cum;
}

/** Tìm vị trí + hướng tại quãng đường `nm` dọc tuyến (tìm nhị phân) */
export function positionAt(coords: LngLat[], cum: number[], nm: number): { pos: LngLat; bearing: number; index: number } {
  const total = cum[cum.length - 1];
  const d = Math.max(0, Math.min(total, nm));
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const a = coords[lo], b = coords[Math.min(hi, coords.length - 1)];
  const seg = cum[hi] - cum[lo];
  const t = seg > 0 ? (d - cum[lo]) / seg : 0;
  const pos: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  // hướng mũi tàu: nhìn xa hơn vài điểm cho mượt
  const j = Math.min(coords.length - 1, hi + 2);
  const i0 = Math.max(0, lo - 1);
  return { pos, bearing: bearing(coords[i0], coords[j]), index: lo };
}

/** Khung bao [minLon, minLat, maxLon, maxLat] (kinh độ đã unwrap) */
export function bbox(coords: LngLat[]): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of coords) {
    if (x < a) a = x;
    if (y < b) b = y;
    if (x > c) c = x;
    if (y > d) d = y;
  }
  return [a, b, c, d];
}

export function inBox(p: LngLat, box: [number, number, number, number]): boolean {
  const lon = normalizeLon(p[0]);
  return lon >= box[0] && lon <= box[2] && p[1] >= box[1] && p[1] <= box[3];
}
