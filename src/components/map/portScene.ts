import type maplibregl from 'maplibre-gl';
import type { LngLat } from '../../types';

/**
 * Cảnh cảng 3D – Mức 1: bố cục thật lấy từ vector tiles OpenStreetMap (schema OpenMapTiles, qua OpenFreeMap).
 * File này "quét" lưới điểm quanh cảng trên bản đồ đã vẽ để biết ô nào là nước / cầu cảng / bãi / nhà,
 * rồi đặt cẩu bờ dọc mép bến, chồng container trong phạm vi bãi và tàu đậu dọc bến (HÌNH MINH HỌA).
 */

export interface Box {
  pos: LngLat;
  /** kích thước (m): dài theo trục `dir`, rộng, cao */
  len: number;
  wid: number;
  h: number;
  z: number;
  /** hướng trục dài: độ, ngược chiều kim đồng hồ từ hướng Đông */
  dir: number;
  color: [number, number, number];
}

export interface PortScene {
  code: string;
  boxes: Box[];
  /** bearing = hướng la bàn của cần cẩu (về phía mặt nước) */
  cranes: { pos: LngLat; bearing: number }[];
  ships: { pos: LngLat; bearing: number; length: number }[];
  stats: { cranes: number; craneSource: 'osm' | 'auto'; stacks: number; ships: number; waterCells: number; yardCells: number };
}

export const PORT_LAYERS = { water: 'p-water', pier: 'p-pier', landuse: 'p-landuse', building: 'p-building' };

const M_PER_DEG = 111320;
export function offsetM(p: LngLat, east: number, north: number): LngLat {
  return [p[0] + east / (M_PER_DEG * Math.cos((p[1] * Math.PI) / 180)), p[1] + north / M_PER_DEG];
}

type Cell = 'W' | 'P' | 'I' | 'B' | 'L' | '?';

export interface PortGrid {
  center: LngLat;
  step: number;
  nx: number;
  ny: number;
  cells: Cell[];
}

const STEP = 40;

/** Quét lưới 40 m quanh tâm cảng (trong phạm vi khung nhìn hiện tại, camera nhìn thẳng xuống) */
export function scanPort(map: maplibregl.Map, center: LngLat, halfX = 2200, halfY = 1500): PortGrid {
  const nx = Math.floor((2 * halfX) / STEP) + 1, ny = Math.floor((2 * halfY) / STEP) + 1;
  const cells: Cell[] = new Array(nx * ny).fill('?');
  const el = map.getContainer();
  const W = el.clientWidth, H = el.clientHeight;
  const layers = Object.values(PORT_LAYERS).filter((id) => map.getLayer(id));
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const ll = offsetM(center, -halfX + i * STEP, -halfY + j * STEP);
      const pt = map.project(ll as [number, number]);
      if (pt.x < 0 || pt.y < 0 || pt.x > W || pt.y > H) continue;
      const fs = map.queryRenderedFeatures(pt, { layers });
      let c: Cell = 'L';
      const has = (id: string) => fs.some((f) => f.layer.id === id);
      if (has(PORT_LAYERS.building)) c = 'B';
      else if (has(PORT_LAYERS.pier)) c = 'P';
      else if (has(PORT_LAYERS.water)) c = 'W';
      else if (has(PORT_LAYERS.landuse)) c = 'I';
      cells[j * nx + i] = c;
    }
  }
  return { center, step: STEP, nx, ny, cells };
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLORS: [number, number, number][] = [[220, 60, 50], [40, 110, 220], [245, 165, 30], [30, 160, 90], [150, 160, 175], [130, 70, 220], [20, 130, 150], [235, 235, 235]];

export interface SceneOptions {
  /** Số cẩu theo thông tin cảng (nếu người dùng đã nhập) */
  craneCount?: number;
  /** Vị trí cẩu lấy từ OpenStreetMap (man_made=crane) */
  osmCranes?: LngLat[];
}

/** Dựng cảnh từ lưới đã quét. Hàm thuần – có unit test. */
export function buildScene(code: string, g: PortGrid, opts: SceneOptions = {}): PortScene {
  const { nx, ny, cells, step, center } = g;
  const idx = (i: number, j: number) => j * nx + i;
  const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny;
  const cx = (nx - 1) / 2, cy = (ny - 1) / 2;
  const ll = (i: number, j: number, de = 0, dn = 0) => offsetM(center, (i - cx) * step + de, (j - cy) * step + dn);
  const rnd = mulberry([...code].reduce((s, c) => s * 31 + c.charCodeAt(0), 7));

  // 1) Vùng nước lớn (bỏ ao hồ nhỏ): gom thành phần liên thông
  const comp = new Int32Array(nx * ny).fill(-1);
  const sizes: number[] = [];
  for (let s = 0; s < cells.length; s++) {
    if (cells[s] !== 'W' || comp[s] >= 0) continue;
    const id = sizes.length;
    let n = 0;
    const stack = [s];
    comp[s] = id;
    while (stack.length) {
      const k = stack.pop()!;
      n++;
      const i = k % nx, j = (k / nx) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (inside(a, b) && cells[idx(a, b)] === 'W' && comp[idx(a, b)] < 0) { comp[idx(a, b)] = id; stack.push(idx(a, b)); }
      }
    }
    sizes.push(n);
  }
  const isWater = (i: number, j: number) => inside(i, j) && cells[idx(i, j)] === 'W' && sizes[comp[idx(i, j)]] >= 40;
  const waterCells = sizes.filter((n) => n >= 40).reduce((s, n) => s + n, 0);

  // 2) Bãi: ô công nghiệp / cầu cảng; nếu dữ liệu thiếu thì lấy cả đất thường sát mép nước
  const industrial = cells.filter((c) => c === 'I' || c === 'P').length;
  const yardType = (c: Cell) => c === 'I' || c === 'P' || (industrial < 30 && c === 'L');

  // 3) Ô mép bến: ô bãi có nước lớn kề bên; pháp tuyến = hướng trung bình tới các ô nước trong 5×5
  interface Quay { i: number; j: number; nxv: number; nyv: number; d: number }
  const quays: Quay[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!yardType(cells[idx(i, j)])) continue;
    let near = false;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (isWater(i + di, j + dj)) near = true;
    if (!near) continue;
    let sx = 0, sy = 0;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) if (isWater(i + di, j + dj)) { sx += di; sy += dj; }
    const l = Math.hypot(sx, sy);
    if (l < 1e-6) continue;
    quays.push({ i, j, nxv: sx / l, nyv: sy / l, d: Math.hypot(i - cx, j - cy) });
  }
  quays.sort((a, b) => a.d - b.d);

  // 4) Cẩu bờ
  const cranes: PortScene['cranes'] = [];
  const brg = (e: number, n: number) => ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360;
  let craneSource: 'osm' | 'auto' = 'auto';
  const chosen: Quay[] = [];
  if (opts.osmCranes && opts.osmCranes.length >= 3) {
    craneSource = 'osm';
    const mLon = M_PER_DEG * Math.cos((center[1] * Math.PI) / 180);
    for (const c of opts.osmCranes.slice(0, 60)) {
      const fi = (c[0] - center[0]) * mLon / step + cx, fj = (c[1] - center[1]) * M_PER_DEG / step + cy;
      let best: Quay | null = null, bd = 6;
      for (const q of quays) {
        const d = Math.hypot(q.i - fi, q.j - fj);
        if (d < bd) { bd = d; best = q; }
      }
      if (best) { cranes.push({ pos: c, bearing: brg(best.nxv, best.nyv) }); chosen.push(best); }
    }
  }
  if (!cranes.length) {
    craneSource = 'auto';
    const want = Math.max(2, Math.min(24, opts.craneCount ?? 10));
    const minGap = 110 / step;
    for (const q of quays) {
      if (chosen.length >= want) break;
      if (q.d * step > 1400) break;
      if (chosen.some((c) => Math.hypot(c.i - q.i, c.j - q.j) < minGap)) continue;
      chosen.push(q);
      cranes.push({ pos: ll(q.i, q.j, q.nxv * 6, q.nyv * 6), bearing: brg(q.nxv, q.nyv) });
    }
  }

  // 5) Tàu đậu dọc bến: cách mép bến ~55 m, cần nước dọc thân tàu
  const ships: PortScene['ships'] = [];
  for (const q of chosen) {
    if (ships.length >= 3) break;
    const off = 55 / step;
    const sx = q.i + q.nxv * off * 1.6, sy = q.j + q.nyv * off * 1.6;
    const tx = -q.nyv, ty = q.nxv; // dọc bến
    const L = 300;
    let ok = true;
    for (const t of [-0.45, -0.2, 0, 0.2, 0.45]) {
      if (!isWater(Math.round(sx + tx * (t * L) / step), Math.round(sy + ty * (t * L) / step))) ok = false;
    }
    if (!ok) continue;
    const pos = ll(q.i, q.j, q.nxv * 60, q.nyv * 60);
    if (ships.some((s) => Math.hypot((s.pos[0] - pos[0]) * 111000 * Math.cos((pos[1] * Math.PI) / 180), (s.pos[1] - pos[1]) * 111000) < 380)) continue;
    ships.push({ pos, bearing: brg(tx, ty), length: L });
  }

  // 6) Chồng container trong phạm vi bãi: BFS từ các ô mép bến để biết khoảng cách + hướng bến gần nhất
  const dist = new Int16Array(nx * ny).fill(-1);
  const src = new Int16Array(nx * ny).fill(-1);
  const queue: number[] = [];
  const seeds = chosen.length ? chosen : quays.slice(0, 20);
  seeds.forEach((q, k) => { dist[idx(q.i, q.j)] = 0; src[idx(q.i, q.j)] = k; queue.push(idx(q.i, q.j)); });
  for (let h = 0; h < queue.length; h++) {
    const k = queue[h];
    if (dist[k] >= 14) continue;
    const i = k % nx, j = (k / nx) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (!inside(a, b) || dist[idx(a, b)] >= 0 || !yardType(cells[idx(a, b)])) continue;
      dist[idx(a, b)] = dist[k] + 1;
      src[idx(a, b)] = src[k];
      queue.push(idx(a, b));
    }
  }
  const boxes: Box[] = [];
  let stacks = 0, yardCells = 0;
  for (const k of queue) {
    if (dist[k] < 2 || boxes.length > 7000) continue;
    const i = k % nx, j = (k / nx) | 0;
    // tránh ô sát nước (để lối đi dọc bến)
    let nearW = false;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (isWater(i + di, j + dj)) nearW = true;
    if (nearW || rnd() < 0.22) continue;
    yardCells++;
    const q = seeds[src[k]];
    const ang = (Math.atan2(q.nxv, -q.nyv) * 180) / Math.PI; // trục dài container song song mép bến (góc toán học của vectơ tiếp tuyến)
    const tr = (ang * Math.PI) / 180;
    const tE = Math.cos(tr), tN = Math.sin(tr), nE = -tN, nN = tE;
    for (const along of [-7, 7]) for (const across of [-12, -9, -6, 6, 9, 12]) {
      if (rnd() < 0.18) continue;
      const tiers = 1 + Math.floor(rnd() * 4);
      stacks++;
      const pos = ll(i, j, along * tE + across * nE, along * tN + across * nN);
      for (let t = 0; t < tiers; t++) boxes.push({ pos, len: 12.2, wid: 2.44, h: 2.55, z: t * 2.6, dir: ang, color: COLORS[Math.floor(rnd() * COLORS.length)] });
    }
  }
  return { code, boxes, cranes, ships, stats: { cranes: cranes.length, craneSource, stacks, ships: ships.length, waterCells, yardCells } };
}

/** Lấy vị trí cẩu (man_made=crane) từ Overpass API – có cache localStorage, lỗi/timeout thì trả về mảng rỗng */
export async function fetchOsmCranes(code: string, center: LngLat, radiusM = 2500): Promise<LngLat[]> {
  const key = `portrank.cranes.${code}`;
  try {
    const hit = localStorage.getItem(key);
    if (hit) return JSON.parse(hit);
  } catch { /* bỏ qua */ }
  const q = `[out:json][timeout:8];node["man_made"="crane"](around:${radiusM},${center[1]},${center[0]});out 80;`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`, { signal: ctrl.signal });
    if (!res.ok) return [];
    const json = (await res.json()) as { elements: { lat: number; lon: number }[] };
    const out = json.elements.filter((e) => isFinite(e.lat) && isFinite(e.lon)).map((e) => [e.lon, e.lat] as LngLat);
    try { localStorage.setItem(key, JSON.stringify(out)); } catch { /* bỏ qua */ }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
