import type { LngLat } from '../types';

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-82, Math.min(82, lat)) * Math.PI) / 360));
const invMercY = (y: number) => (Math.atan(Math.sinh(y)) * 180) / Math.PI;

/**
 * Đường cong (Bézier bậc 2 trong không gian Mercator) nối a → b để thể hiện "kết nối" giữa hai cảng.
 * Kinh độ của b được dời ±360° để đi theo hướng ngắn nhất → không bị vẽ ngang bản đồ khi cắt kinh tuyến 180°.
 * `bend` = độ cong (tỉ lệ so với chiều dài); đường cong luôn võng về phía Bắc.
 */
export function arcPath(a: LngLat, b: LngLat, bend = 0.18, n = 48): LngLat[] {
  let bx = b[0];
  while (bx - a[0] > 180) bx -= 360;
  while (bx - a[0] < -180) bx += 360;
  const R = 180 / Math.PI;
  const ax = a[0], ay = mercY(a[1]) * R, by = mercY(b[1]) * R;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  // pháp tuyến hướng về phía Bắc
  let nx = -dy / len, ny = dx / len;
  if (ny < 0) { nx = -nx; ny = -ny; }
  const cx = (ax + bx) / 2 + nx * len * bend;
  const cy = Math.min((ay + by) / 2 + ny * len * bend, mercY(80) * R);
  const out: LngLat[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), u = 1 - t;
    out.push([u * u * ax + 2 * u * t * cx + t * t * bx, invMercY((u * u * ay + 2 * u * t * cy + t * t * by) / R)]);
  }
  return out;
}

/** Độ cong theo thứ hạng: các đường gần nhau có độ cong khác nhau để không đè lên nhau */
export const bendForIndex = (i: number) => 0.14 + 0.035 * (i % 6);
