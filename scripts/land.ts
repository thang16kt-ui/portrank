import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { normalizeLon } from '../src/lib/geo';
import type { LngLat } from '../src/types';

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/land-50m.json'), 'utf8'));
const land = feature(topo, topo.objects.land) as any;
const polys: number[][][][] = [];
for (const f of land.features ?? [land]) {
  const g = f.geometry;
  if (g.type === 'Polygon') polys.push(g.coordinates);
  else for (const p of g.coordinates) polys.push(p);
}
// Đa giác cắt kinh tuyến 180° (Fiji, Chukotka, Nam Cực…): dời kinh độ âm +360 để ray-casting đúng
const wraps = polys.map((p) => p[0].some((c, i) => i > 0 && Math.abs(c[0] - p[0][i - 1][0]) > 180));
polys.forEach((p, k) => {
  if (!wraps[k]) return;
  for (const ring of p) {
    for (let i = 1; i < ring.length; i++) {
      while (ring[i][0] - ring[i - 1][0] > 180) ring[i][0] -= 360;
      while (ring[i][0] - ring[i - 1][0] < -180) ring[i][0] += 360;
    }
  }
});
const boxes = polys.map((p) => {
  let a = 400, b = 90, c = -400, d = -90;
  for (const [x, y] of p[0]) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  return [a, b, c, d];
});
function inRing(pt: LngLat, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function onLand(pt: LngLat) {
  const p0: LngLat = [normalizeLon(pt[0]), pt[1]];
  for (let k = 0; k < polys.length; k++) {
    const b = boxes[k];
    for (const shift of wraps[k] ? [0, 360, -360] : [0]) {
      const p: LngLat = [p0[0] + shift, p0[1]];
      if (p[0] < b[0] || p[0] > b[2] || p[1] < b[1] || p[1] > b[3]) continue;
      if (inRing(p, polys[k][0]) && !polys[k].slice(1).some((h) => inRing(p, h))) return true;
    }
  }
  return false;
}
/** Kênh đào & eo hẹp thật mà dữ liệu 1:50m không thể hiện được */
export const EXEMPT: { c: LngLat; km: number; name: string }[] = [
  { c: [32.45, 30.6], km: 110, name: 'Suez' },
  { c: [-79.7, 9.15], km: 50, name: 'Panama' },
  { c: [9.6, 54.15], km: 60, name: 'Kiel' },
  { c: [29.05, 41.1], km: 25, name: 'Bosphorus' },
  { c: [26.45, 40.25], km: 35, name: 'Dardanelles' },
];
