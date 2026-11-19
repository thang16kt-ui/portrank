import type { LngLat } from '../types';
import { COUNTRIES } from '../data/countries';
import { haversineKm } from './geo';
import { loadWorld } from './world';

type Ring = number[][];
type Polygon = Ring[];
type CountryShape = { code: string; polygons: { rings: Polygon; box: number[] }[] };
let shapes: Promise<CountryShape[]> | null = null;

function insideRing([x, y]: LngLat, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// The 1:50m generalized boundary is only a screening tool. Ignore points within 5 km of it.
function farFromBoundary([x, y]: LngLat, rings: Polygon) {
  const sx = 111.32 * Math.cos(y * Math.PI / 180), sy = 111.32;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j][0] - x) * sx, ay = (ring[j][1] - y) * sy;
    const bx = (ring[i][0] - x) * sx, by = (ring[i][1] - y) * sy;
    const dx = bx - ax, dy = by - ay, norm = dx * dx + dy * dy;
    const t = norm ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / norm)) : 0;
    if (Math.hypot(ax + t * dx, ay + t * dy) < 5) return false;
  }
  return true;
}

async function countryShapes() {
  if (!shapes) shapes = loadWorld().then((world) => world.countries.features.filter((f) => f.properties.iso2).map((f) => ({
    code: f.properties.iso2,
    polygons: (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map((rings) => {
      const box = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [x, y] of rings[0]) { box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); }
      return { rings, box };
    }),
  })));
  return shapes;
}

/** Flag intermediate countries from OSRM geometry; never claim this proves legal transit rights. */
export async function roadTransitCountries(path: LngLat[], endpointCountries: string[]): Promise<string[]> {
  const candidates = (await countryShapes()).filter((c) => !endpointCountries.includes(c.code));
  const found = new Set<string>();
  let sinceSample = Infinity;
  for (let i = 0; i < path.length; i++) {
    if (i) sinceSample += haversineKm(path[i - 1], path[i]);
    if (sinceSample < 5 && i !== path.length - 1) continue;
    sinceSample = 0;
    const [lng, lat] = path[i];
    for (const c of candidates) {
      if (found.has(c.code)) continue;
      for (const { rings, box: [x0, y0, x1, y1] } of c.polygons) {
        const x = lng < x0 ? lng + 360 : lng > x1 ? lng - 360 : lng;
        const point: LngLat = [x, lat];
        if (x < x0 || x > x1 || lat < y0 || lat > y1) continue;
        if (insideRing(point, rings[0]) && !rings.slice(1).some((r) => insideRing(point, r)) && farFromBoundary(point, rings)) {
          found.add(c.code); break;
        }
      }
    }
  }
  return [...found];
}

export const transitCountryNames = (codes: string[]) => codes.map((c) => COUNTRIES.find((x) => x.iso2 === c)?.name ?? c).join(', ');
