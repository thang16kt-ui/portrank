import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { numericToIso2 } from '../data/countries';
import type { LngLat } from '../types';

export interface WorldData {
  /** Đa giác các nước (world-atlas countries-50m), thuộc tính: iso2, name */
  countries: FeatureCollection<Polygon | MultiPolygon, { iso2: string; name: string }>;
  /** Khối đất liền gộp (để vẽ đường bờ biển phát sáng) */
  land: FeatureCollection;
  /** Đường bờ biển dạng line, đã cắt tại kinh tuyến 180° (không vẽ vệt ngang qua bản đồ) */
  coastLines: FeatureCollection;
  /** Viền từng nước dạng line (thuộc tính iso2), đã cắt tại kinh tuyến 180° */
  countryLines: FeatureCollection;
  centroid: Map<string, LngLat>;
  bbox: Map<string, [number, number, number, number]>;
}

let cache: Promise<WorldData> | null = null;

/**
 * Chuyển các vòng đa giác thành đường, cắt ở chỗ hai điểm liền nhau lệch kinh độ > 180°
 * (đa giác vượt kinh tuyến 180° như Fiji, Nga) – nếu không MapLibre nối thẳng hai điểm thành vệt ngang cả bản đồ.
 */
export function ringsToLines(rings: number[][][]): number[][][] {
  const out: number[][][] = [];
  for (const ring of rings) {
    let cur: number[][] = [];
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      if (cur.length && Math.abs(p[0] - cur[cur.length - 1][0]) > 180) {
        if (cur.length > 1) out.push(cur);
        cur = [];
      }
      cur.push(p);
    }
    if (cur.length > 1) out.push(cur);
  }
  return out;
}

/**
 * Vòng đa giác vượt kinh tuyến 180° (Fiji, Nga…): dời kinh độ âm +360° cho liền mạch để lớp tô (fill)
 * không tạo dải mỏng chạy ngang cả bản đồ. MapLibre vẫn hiển thị đúng nhờ các bản sao thế giới.
 */
export function unwrapRing(ring: number[][]): number[][] {
  let jump = false;
  for (let i = 1; i < ring.length; i++) if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) jump = true;
  return jump ? ring.map(([x, y]) => [x < 0 ? x + 360 : x, y]) : ring;
}
function unwrapGeometry<G extends Polygon | MultiPolygon>(g: G): G {
  if (g.type === 'Polygon') return { ...g, coordinates: g.coordinates.map(unwrapRing) };
  return { ...g, coordinates: (g as MultiPolygon).coordinates.map((poly) => poly.map(unwrapRing)) } as G;
}

const polygonRings = (g: Polygon | MultiPolygon): number[][][] => (g.type === 'Polygon' ? g.coordinates : g.coordinates.flat());

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
      features.push({ ...f, geometry: f.geometry ? unwrapGeometry(f.geometry) : f.geometry, properties: { iso2, name: f.properties.name } });
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
    const coastLines: FeatureCollection = {
      type: 'FeatureCollection',
      features: land.features
        .filter((f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
        .map((f) => ({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: ringsToLines(polygonRings(f.geometry as Polygon | MultiPolygon)) } })),
    };
    const countryLines: FeatureCollection = {
      type: 'FeatureCollection',
      features: features.map((f) => ({ type: 'Feature', properties: f.properties, geometry: { type: 'MultiLineString', coordinates: ringsToLines(polygonRings(f.geometry)) } })),
    };
    return { countries: { type: 'FeatureCollection', features }, land, coastLines, countryLines, centroid, bbox };
  })();
  return cache;
}
