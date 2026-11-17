import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { numericToIso2 } from '../data/countries';
import type { LngLat } from '../types';

export interface WorldData {
  /** Đa giác các nước (world-atlas countries-50m), thuộc tính: iso2, name */
  countries: FeatureCollection<Polygon | MultiPolygon, { iso2: string; name: string }>;
  /** Khối đất liền gộp (để vẽ đường bờ biển phát sáng) */
  land: FeatureCollection;
  centroid: Map<string, LngLat>;
  bbox: Map<string, [number, number, number, number]>;
}

let cache: Promise<WorldData> | null = null;

function ringArea(r: number[][]) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return Math.abs(a / 2);
}
function ringCentroid(r: number[][]): LngLat {
  let x = 0, y = 0, a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    x += (r[j][0] + r[i][0]) * f;
    y += (r[j][1] + r[i][1]) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) return [r[0][0], r[0][1]];
  return [x / (3 * a), y / (3 * a)];
}

/** Nạp bản đồ thế giới (chia chunk riêng, ~250 KB gzip) và tính tâm + khung của từng nước theo đa giác lớn nhất */
export function loadWorld(): Promise<WorldData> {
  if (cache) return cache;
  cache = (async () => {
    const [{ feature }, topo] = await Promise.all([import('topojson-client'), import('world-atlas/countries-50m.json')]);
    const t = (topo as any).default ?? topo;
    const fc = feature(t, t.objects.countries) as unknown as FeatureCollection<Polygon | MultiPolygon, { name: string }>;
    const centroid = new Map<string, LngLat>();
    const bbox = new Map<string, [number, number, number, number]>();
    const features: Feature<Polygon | MultiPolygon, { iso2: string; name: string }>[] = [];
    for (const f of fc.features) {
      const iso2 = numericToIso2(f.id as string) ?? '';
      features.push({ ...f, properties: { iso2, name: f.properties.name } });
      if (!iso2) continue;
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      let best = polys[0], bestA = -1;
      for (const p of polys) {
        const a = ringArea(p[0]);
        if (a > bestA) { bestA = a; best = p; }
      }
      centroid.set(iso2, ringCentroid(best[0]));
      let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
      for (const [x, y] of best[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      bbox.set(iso2, [x0, y0, x1, y1]);
    }
    const landF = feature(t, t.objects.land) as any;
    const land: FeatureCollection = landF.type === 'FeatureCollection' ? landF : { type: 'FeatureCollection', features: [landF] };
    return { countries: { type: 'FeatureCollection', features }, land, centroid, bbox };
  })();
  return cache;
}
