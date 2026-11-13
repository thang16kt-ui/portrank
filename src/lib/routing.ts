/**
 * Tìm tuyến đường biển.
 *
 * Engine chính "searoute": dùng mạng lưới hàng hải (marnet – Eurostat/ORNL) đi kèm gói npm
 * `searoute-js`. Hàm `searoute()` gốc của gói bị lỗi với tuyến cắt kinh tuyến 180° (Á → Mỹ đi
 * vòng 20.000 hải lý) và không hỗ trợ "tránh vùng", nên ở đây ta dựng lại đồ thị từ chính dữ liệu
 * đó: nối các đỉnh ±180°, bỏ tuyến Bắc Cực, lọc cạnh trong vùng cần tránh rồi chạy Dijkstra.
 *
 * Engine dự phòng "graph": đồ thị ~150 nút eo biển/kênh đào trong `data/seaNodes.ts`.
 */
import marnet from 'searoute-js/data/marnet_densified.json';
import marnetPatch from '../data/marnetPatch.json';
import type { LngLat, PassageHit, Port, RouteOptions, RouteResult } from '../types';
import { AVOID_ZONES, EDGES, NODES, PANAMA_EDGES, PASSAGES, RED_SEA_EDGES } from '../data/seaNodes';
import { cumulativeNm, densify, haversineKm, inBox, normalizeLon } from './geo';
import { ROUTING_CONFIG } from '../config/routing';

interface Edge {
  to: number;
  w: number; // km
  id?: string;
}

interface Graph {
  name: 'searoute' | 'graph';
  coords: LngLat[];
  adj: Edge[][];
  /** số cạnh ảo tối đa nối cảng vào đồ thị */
  snapK: number;
  /** 1 = đỉnh thuộc thành phần liên thông lớn nhất (chỉ bám cảng vào các đỉnh này) */
  main?: Uint8Array;
}

/** Đánh dấu thành phần liên thông lớn nhất – tránh cảng bám vào mảnh mạng bị cô lập */
function largestComponent(adj: Edge[][]): Uint8Array {
  const comp = new Int32Array(adj.length).fill(-1);
  const sizes: number[] = [];
  for (let s = 0; s < adj.length; s++) {
    if (comp[s] >= 0 || !adj[s].length) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [s];
    comp[s] = id;
    while (stack.length) {
      const u = stack.pop()!;
      size++;
      for (const e of adj[u]) if (comp[e.to] < 0) { comp[e.to] = id; stack.push(e.to); }
    }
    sizes.push(size);
  }
  const best = sizes.indexOf(Math.max(...sizes));
  return Uint8Array.from(comp, (c) => (c === best ? 1 : 0));
}

/* ───────────────────────── Dựng đồ thị ───────────────────────── */

let marnetGraph: Graph | null = null;
let fallbackGraph: Graph | null = null;

type MarnetFC = { features: { geometry: { type: string; coordinates: number[][] } }[] };

function buildMarnetGraph(): Graph {
  const index = new Map<string, number>();
  const coords: LngLat[] = [];
  const adj: Edge[][] = [];
  // các cạnh cắt qua đất liền (tiền xử lý bằng scripts/build-marnet-mask.ts):
  // `fix` = nắn đi vòng qua điểm trung gian trên biển, `blocked` = bỏ hẳn
  const patch = marnetPatch as unknown as { move: Record<string, LngLat>; blocked: string[]; fix: Record<string, LngLat[]> };
  const blocked = new Set(patch.blocked);
  const addEdge = (ia: number, ib: number, a: LngLat, b: LngLat) => {
    if (ia === ib) return;
    const w = segmentKm(a, b);
    adj[ia].push({ to: ib, w });
    adj[ib].push({ to: ia, w });
  };
  const key = (c: number[]) => {
    const lon = c[0] <= -180 ? 180 : c[0]; // nối -180 với 180
    return `${lon.toFixed(4)},${c[1].toFixed(4)}`;
  };
  const vid = (c: number[]) => {
    const k = key(c);
    let id = index.get(k);
    if (id === undefined) {
      id = coords.length;
      index.set(k, id);
      coords.push(patch.move[k] ?? [c[0] <= -180 ? 180 : c[0], c[1]]);
      adj.push([]);
    }
    return id;
  };
  const { maxLat, minLat } = ROUTING_CONFIG;
  for (const f of (marnet as unknown as MarnetFC).features) {
    if (f.geometry.type !== 'LineString') continue;
    const cs = f.geometry.coordinates;
    for (let i = 1; i < cs.length; i++) {
      const a = cs[i - 1], b = cs[i];
      if (a[1] > maxLat || b[1] > maxLat || a[1] < minLat || b[1] < minLat) continue; // bỏ tuyến Bắc Cực/Nam Cực
      const ek = `${key(a)}|${key(b)}`;
      if (blocked.has(ek)) continue;
      const via = patch.fix[ek];
      const chain = [a, ...(via ?? []), b] as LngLat[];
      const ids = chain.map(vid);
      for (let k = 1; k < chain.length; k++) addEdge(ids[k - 1], ids[k], coords[ids[k - 1]], coords[ids[k]]);
    }
  }
  return { name: 'searoute', coords, adj, snapK: 1, main: largestComponent(adj) };
}

/** Độ dài đoạn theo hình dạng phẳng (chia nhỏ) – khớp với cách tuyến được vẽ */
function segmentKm(a: LngLat, b: LngLat): number {
  let dLon = b[0] - a[0];
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const span = Math.max(Math.abs(dLon), Math.abs(b[1] - a[1]));
  const n = Math.max(1, Math.ceil(span / 2));
  let s = 0;
  let prev = a;
  for (let k = 1; k <= n; k++) {
    const p: LngLat = [a[0] + (dLon * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
    s += haversineKm(prev, p);
    prev = p;
  }
  return s;
}

function buildFallbackGraph(): Graph {
  const idx = new Map(NODES.map((n, i) => [n.id, i]));
  const adj: Edge[][] = NODES.map(() => []);
  for (const [a, b] of EDGES) {
    const ia = idx.get(a), ib = idx.get(b);
    if (ia === undefined || ib === undefined) throw new Error(`Cạnh không hợp lệ ${a}-${b}`);
    const w = haversineKm(NODES[ia].coord, NODES[ib].coord);
    adj[ia].push({ to: ib, w, id: `${a}-${b}` });
    adj[ib].push({ to: ia, w, id: `${a}-${b}` });
  }
  return { name: 'graph', coords: NODES.map((n) => n.coord), adj, snapK: 2 };
}

export function getGraph(name: 'searoute' | 'graph'): Graph {
  if (name === 'searoute') return (marnetGraph ??= buildMarnetGraph());
  return (fallbackGraph ??= buildFallbackGraph());
}

/* ───────────────────────── Dijkstra ───────────────────────── */

class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    const k = this.k, v = this.v;
    k.push(key); v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const k = this.k, v = this.v;
    const top: [number, number] = [k[0], v[0]];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

export interface DijkstraInput {
  n: number;
  adj: Edge[][];
  sources: { node: number; cost: number }[];
  targets: Map<number, number>; // node -> chi phí thêm để tới đích
  blocked: (from: number, e: Edge) => boolean;
}

/** Dijkstra nhiều nguồn → nhiều đích, trả về [chuỗi đỉnh, tổng km] */
export function dijkstra({ n, adj, sources, targets, blocked }: DijkstraInput): { path: number[]; cost: number } | null {
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const heap = new MinHeap();
  for (const s of sources) {
    if (s.cost < dist[s.node]) {
      dist[s.node] = s.cost;
      heap.push(s.cost, s.node);
    }
  }
  let best = Infinity, bestNode = -1;
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > dist[u]) continue;
    if (d >= best) break;
    const extra = targets.get(u);
    if (extra !== undefined && d + extra < best) {
      best = d + extra;
      bestNode = u;
    }
    for (const e of adj[u]) {
      if (blocked(u, e)) continue;
      const nd = d + e.w;
      if (nd < dist[e.to]) {
        dist[e.to] = nd;
        prev[e.to] = u;
        heap.push(nd, e.to);
      }
    }
  }
  if (bestNode < 0) return null;
  const path: number[] = [];
  for (let u = bestNode; u >= 0; u = prev[u]) path.push(u);
  return { path: path.reverse(), cost: best };
}

/* ───────────────────────── API ───────────────────────── */

/** Điểm ra biển của cảng (cuối luồng) */
export function seaAccess(p: Port): LngLat {
  return p.approach?.length ? p.approach[p.approach.length - 1] : p.coord;
}

/** Toạ độ luồng từ bến ra biển (bao gồm bến) */
export function portLeg(p: Port): LngLat[] {
  return [p.coord, ...(p.approach ?? [])];
}

function nearestNodes(g: Graph, p: LngLat, k: number): { node: number; km: number }[] {
  const best: { node: number; km: number }[] = [];
  for (let i = 0; i < g.coords.length; i++) {
    if (!g.adj[i].length || (g.main && !g.main[i])) continue;
    const km = haversineKm(p, g.coords[i]);
    if (best.length < k || km < best[best.length - 1].km) {
      best.push({ node: i, km });
      best.sort((a, b) => a.km - b.km);
      if (best.length > k) best.pop();
    }
  }
  return best;
}

function makeBlocked(g: Graph, opts: RouteOptions) {
  const boxes = [...(opts.avoidRedSea ? AVOID_ZONES.redSea : []), ...(opts.avoidPanama ? AVOID_ZONES.panama : [])];
  const ids = new Set<string>([...(opts.avoidRedSea ? RED_SEA_EDGES : []), ...(opts.avoidPanama ? PANAMA_EDGES : [])]);
  if (!boxes.length) return () => false;
  if (g.name === 'graph') {
    return (_u: number, e: Edge) => {
      if (!e.id) return false;
      const [a, b] = e.id.split('-');
      return ids.has(e.id) || ids.has(`${b}-${a}`);
    };
  }
  const bad = new Uint8Array(g.coords.length);
  g.coords.forEach((c, i) => {
    if (boxes.some((bx) => inBox(c, bx))) bad[i] = 1;
  });
  return (u: number, e: Edge) => bad[u] === 1 || bad[e.to] === 1;
}

function routeOnGraph(g: Graph, pol: Port, pod: Port, opts: RouteOptions): { coords: LngLat[] } | null {
  const a = seaAccess(pol), b = seaAccess(pod);
  const blocked = makeBlocked(g, opts);
  const src = nearestNodes(g, a, g.snapK).map((s) => ({ node: s.node, cost: s.km }));
  const tgt = new Map(nearestNodes(g, b, g.snapK).map((t) => [t.node, t.km]));
  const res = dijkstra({ n: g.coords.length, adj: g.adj, sources: src, targets: tgt, blocked });
  if (!res) return null;
  const seaPart = res.path.map((i) => g.coords[i]);
  return { coords: [...portLeg(pol), ...seaPart, ...portLeg(pod).reverse()] };
}

function detectPassages(coords: LngLat[], cum: number[]): PassageHit[] {
  const hits: PassageHit[] = [];
  for (const p of PASSAGES) {
    let bestKm = Infinity, bestI = -1;
    // lấy mẫu thưa rồi tinh chỉnh
    for (let i = 0; i < coords.length; i += 3) {
      const c: LngLat = [normalizeLon(coords[i][0]), coords[i][1]];
      if (Math.abs(c[1] - p.coord[1]) > 8) continue;
      const km = haversineKm(c, p.coord);
      if (km < bestKm) { bestKm = km; bestI = i; }
    }
    if (bestI < 0 || bestKm > p.radiusKm + 60) continue;
    for (let i = Math.max(0, bestI - 3); i <= Math.min(coords.length - 1, bestI + 3); i++) {
      const km = haversineKm([normalizeLon(coords[i][0]), coords[i][1]], p.coord);
      if (km < bestKm) { bestKm = km; bestI = i; }
    }
    if (bestKm <= p.radiusKm) hits.push({ id: p.id, name: p.name, kind: p.kind, coord: p.coord, atNm: cum[bestI] });
  }
  return hits.sort((x, y) => x.atNm - y.atNm);
}

const cache = new Map<string, RouteResult>();

/**
 * Tính tuyến cảng → cảng. Thử engine được chọn, nếu lỗi/không có tuyến thì chuyển sang engine
 * còn lại; nếu không thể tránh vùng (vd. cảng nằm trong Biển Đỏ) thì bỏ tuỳ chọn tránh và cảnh báo.
 */
export function findRoute(pol: Port, pod: Port, opts: RouteOptions): RouteResult {
  const engine = opts.engine ?? ROUTING_CONFIG.defaultEngine;
  const key = `${pol.code}|${pod.code}|${+opts.avoidRedSea}|${+opts.avoidPanama}|${engine}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const warnings: string[] = [];
  const order: ('searoute' | 'graph')[] = engine === 'graph' ? ['graph', 'searoute'] : ['searoute', 'graph'];
  let raw: { coords: LngLat[] } | null = null;
  let used: 'searoute' | 'graph' = order[0];
  for (const name of order) {
    try {
      raw = routeOnGraph(getGraph(name), pol, pod, opts);
    } catch (err) {
      console.warn(`[routing] engine ${name} lỗi`, err);
      raw = null;
    }
    if (raw) { used = name; break; }
  }
  if (!raw && (opts.avoidRedSea || opts.avoidPanama)) {
    warnings.push('Không thể tránh vùng đã chọn với cặp cảng này – đã dùng tuyến thông thường.');
    raw = routeOnGraph(getGraph(order[0]), pol, pod, { ...opts, avoidRedSea: false, avoidPanama: false });
  }
  if (!raw) throw new Error(`Không tìm được tuyến ${pol.code} → ${pod.code}`);
  if (used !== order[0]) warnings.push(`Đã dùng engine dự phòng (${used === 'graph' ? 'đồ thị eo biển' : 'searoute'}).`);

  const coords = densify(raw.coords, ROUTING_CONFIG.densifyKm);
  const cumNm = cumulativeNm(coords);
  const result: RouteResult = {
    coords,
    cumNm,
    distanceNm: cumNm[cumNm.length - 1],
    passages: detectPassages(coords, cumNm),
    engine: used,
    warnings,
  };
  cache.set(key, result);
  return result;
}

export const hasPassage = (r: RouteResult, id: PassageHit['id']) => r.passages.some((p) => p.id === id);
