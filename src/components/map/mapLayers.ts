import type { Layer } from '@deck.gl/core';
import { PathStyleExtension } from '@deck.gl/extensions';
import { Tile3DLayer, TripsLayer } from '@deck.gl/geo-layers';
import { Tiles3DLoader } from '@loaders.gl/3d-tiles';
import { IconLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { ScenegraphLayer, SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { CubeGeometry } from '@luma.gl/engine';
import { arcPath, bendForIndex } from '../../lib/arc';
import type { Plan, PlanOption } from '../../lib/plan';
import type { RankedOption } from '../../lib/ranking';
import { trackPosition, type Track } from '../../lib/track';
import type { LngLat } from '../../types';
import type { Box, PortScene } from './portScene';

const svg = (s: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;

/** Icon tàu 2D (nhìn từ trên, mũi hướng lên = Bắc) */
export const SHIP_ICON = svg(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="120" viewBox="0 0 40 120">
  <path d="M20 2 C30 18 34 30 34 44 L34 108 Q34 116 26 116 L14 116 Q6 116 6 108 L6 44 C6 30 10 18 20 2z" fill="#16304f" stroke="#fde68a" stroke-width="3"/>
  <rect x="11" y="34" width="8" height="12" fill="#ef4444"/><rect x="21" y="34" width="8" height="12" fill="#3b82f6"/>
  <rect x="11" y="48" width="8" height="12" fill="#f59e0b"/><rect x="21" y="48" width="8" height="12" fill="#22c55e"/>
  <rect x="11" y="62" width="8" height="12" fill="#3b82f6"/><rect x="21" y="62" width="8" height="12" fill="#ef4444"/>
  <rect x="11" y="76" width="8" height="12" fill="#22c55e"/><rect x="21" y="76" width="8" height="12" fill="#f59e0b"/>
  <rect x="9" y="94" width="22" height="14" rx="2" fill="#f8fafc"/></svg>`);

export type RGB = [number, number, number];
export const GOLD: RGB = [251, 191, 36];
export const SKY: RGB = [56, 214, 238];
export const DIMC: RGB = [96, 134, 176];
export const ROAD: RGB = [163, 230, 53];
export const INLAND: RGB = [196, 181, 253];

/** Màu theo hạng: 1 = vàng cam, 2–3 = xanh lơ, còn lại rất mờ */
export const rankColor = (rank: number): RGB => (rank === 1 ? GOLD : rank <= 3 ? SKY : DIMC);

interface ArcDatum {
  key: string;
  rank: number;
  path: LngLat[];
  timestamps: number[];
  road: boolean;
}

/* Dữ liệu ổn định giữa các khung hình (deck.gl tính lại thuộc tính nếu mảng data đổi) */
const arcCache = new WeakMap<RankedOption[], ArcDatum[]>();
function arcData(ranked: RankedOption[]): ArcDatum[] {
  let d = arcCache.get(ranked);
  if (d) return d;
  d = ranked
    .map((r, i): ArcDatum | null => {
      const o = r.option;
      const path = o.mode === 'road' ? o.roadPath ?? null : o.pol && o.pod ? arcPath(o.pol.coord, o.pod.coord, bendForIndex(i)) : null;
      if (!path) return null;
      return { key: o.key, rank: r.rank, path, timestamps: path.map((_, k) => k / (path.length - 1)), road: o.mode === 'road' };
    })
    .filter((x): x is ArcDatum => !!x)
    .reverse(); // hạng 1 vẽ sau cùng (nằm trên)
  arcCache.set(ranked, d);
  return d;
}

const DASH = [new PathStyleExtension({ dash: true })];
const trackCache = new WeakMap<Track, { path: LngLat[]; timestamps: number[] }[]>();
const trackData = (t: Track) => {
  let d = trackCache.get(t);
  if (!d) trackCache.set(t, (d = [{ path: t.coords, timestamps: t.times }]));
  return d;
};

export interface LayerCtx {
  plan: Plan | null;
  ranked: RankedOption[];
  current: PlanOption | null;
  selectedKey: string | null;
  hoverKey: string | null;
  /** giây – cho hạt sáng chạy dọc đường */
  now: number;
  track: Track | null;
  day: number;
  showSeaRoute: boolean;
  view3d: boolean;
  portView: boolean;
  shipModelOk: boolean;
  scene: PortScene | null;
  /** Ảnh thực Google Photorealistic 3D Tiles (Mức 2) – chỉ khi người dùng bật và có key */
  google?: GoogleTilesCtx | null;
  onHover: (key: string | null) => void;
  onClick: (key: string) => void;
}

const cube = new CubeGeometry();

export function buildLayers(c: LayerCtx): Layer[] {
  const layers: Layer[] = [];
  if (c.portView) {
    if (c.google) layers.push(googleLayer(c.google));
    else if (c.scene) layers.push(...sceneLayers(c.scene));
    return layers;
  }
  const sel = c.selectedKey;
  const arcs = arcData(c.ranked);
  const focus = sel ?? c.hoverKey;
  const alphaOf = (d: ArcDatum, base: number) => {
    if (sel) return d.key === sel ? base : d.key === c.hoverKey ? base * 0.8 : base * 0.18;
    if (c.hoverKey) return d.key === c.hoverKey ? Math.max(base, 230) : base * 0.55;
    return base;
  };
  const colorOf = (d: ArcDatum): RGB => (d.road ? (d.rank === 1 ? ROAD : d.rank <= 3 ? [132, 204, 22] : [90, 120, 60]) : rankColor(d.rank));
  const widthOf = (d: ArcDatum) => (d.key === focus ? 4 : d.rank === 1 ? 3.2 : d.rank <= 3 ? 1.8 : 1);
  const trig = [sel, c.hoverKey];
  // Chế độ 3D: chỉ vẽ tuyến đã chọn
  const showArcs = !c.view3d && arcs.length > 0;

  if (showArcs) {
    layers.push(
      new PathLayer<ArcDatum>({
        id: 'arc-glow',
        data: arcs,
        getPath: (d) => d.path,
        getColor: (d) => [...colorOf(d), alphaOf(d, d.rank === 1 ? 70 : d.rank <= 3 ? 38 : 0)] as [number, number, number, number],
        getWidth: (d) => (d.rank === 1 ? 14 : 8),
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
        updateTriggers: { getColor: trig },
        parameters: { depthCompare: 'always' },
      }),
      new PathLayer<ArcDatum>({
        id: 'arc-core',
        data: arcs,
        getPath: (d) => d.path,
        getColor: (d) => [...colorOf(d), alphaOf(d, d.rank === 1 ? 255 : d.rank <= 3 ? 200 : 70)] as [number, number, number, number],
        getWidth: widthOf,
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
        pickable: true,
        onHover: (info) => c.onHover(info.object ? (info.object as ArcDatum).key : null),
        onClick: (info) => info.object && c.onClick((info.object as ArcDatum).key),
        updateTriggers: { getColor: trig, getWidth: trig },
        parameters: { depthCompare: 'always' },
      }),
    );
    // Hạt sáng chạy liên tục trên đường hạng 1 (và đường đang chọn)
    const lit = arcs.filter((d) => (sel ? d.key === sel : d.rank === 1));
    if (lit.length && !(sel && c.showSeaRoute && c.current?.mode === 'sea')) {
      const period = 4;
      for (const phase of [0, 0.5]) {
        layers.push(
          new TripsLayer<ArcDatum>({
            id: `arc-spark-${phase}`,
            data: lit,
            getPath: (d) => d.path,
            getTimestamps: (d) => d.timestamps,
            getColor: [255, 244, 200],
            widthMinPixels: 3.5,
            capRounded: true,
            jointRounded: true,
            fadeTrail: true,
            trailLength: 0.16,
            currentTime: ((c.now / period + phase) % 1) * 1.16,
            parameters: { depthCompare: 'always' },
          }),
        );
      }
    }
  }

  // Đoạn nội địa (kho → cảng đi, cảng đến → kho): đường đứt mảnh
  if (c.plan && c.current && c.current.mode === 'sea') {
    const legs: { path: LngLat[] }[] = [];
    const o = c.current;
    if (c.plan.seller.kind === 'address' && o.pol) legs.push({ path: [c.plan.seller.coord, o.pol.coord] });
    if (c.plan.buyer.kind === 'address' && o.pod) legs.push({ path: [o.pod.coord, c.plan.buyer.coord] });
    if (legs.length) {
      layers.push(
        new PathLayer<{ path: LngLat[] }>({
          id: `inland-${o.key}`,
          data: legs,
          getPath: (d: { path: LngLat[] }) => d.path,
          getColor: [...INLAND, 230],
          getWidth: 2,
          widthUnits: 'pixels',
          extensions: DASH,
          getDashArray: [4, 3],
          dashJustified: true,
          parameters: { depthCompare: 'always' },
        } as any),
      );
    }
  }

  // Tuyến đã chọn: đường biển thật / đường bộ + phương tiện chạy dọc tuyến
  const t = c.track;
  if (sel && t && c.current && (c.current.mode === 'road' || c.showSeaRoute || c.view3d)) {
    const col = c.current.mode === 'road' ? ROAD : GOLD;
    layers.push(
      new PathLayer({
        id: 'route-full',
        data: trackData(t),
        getPath: (d: { path: LngLat[] }) => d.path,
        getColor: [226, 232, 240, 150],
        getWidth: 1.6,
        widthUnits: 'pixels',
        extensions: DASH,
        getDashArray: [5, 4],
        parameters: { depthCompare: 'always' },
      } as any),
      new TripsLayer({
        id: 'route-trail',
        data: trackData(t),
        getPath: (d: { path: LngLat[] }) => d.path,
        getTimestamps: (d: { timestamps: number[] }) => d.timestamps,
        getColor: col,
        widthMinPixels: 4,
        capRounded: true,
        jointRounded: true,
        fadeTrail: true,
        trailLength: Math.max(1.5, t.total * 0.25),
        currentTime: c.day,
        parameters: { depthCompare: 'always' },
      }),
    );
    const at = trackPosition(t, c.day);
    const veh = [{ pos: at.pos, bearing: at.bearing }];
    layers.push(
      new ScatterplotLayer({
        id: 'veh-halo',
        data: veh,
        getPosition: (d: (typeof veh)[0]) => d.pos,
        getRadius: 16 + 3 * Math.sin(c.now * 3),
        radiusUnits: 'pixels',
        getFillColor: [...col, 45],
        getLineColor: [...col, 170],
        stroked: true,
        lineWidthMinPixels: 1.5,
        updateTriggers: { getPosition: [c.day], getRadius: [Math.round(c.now * 20)] },
        parameters: { depthCompare: 'always' },
      }),
    );
    if (t.vehicle === 'ship') {
      if (c.view3d && c.shipModelOk) {
        layers.push(
          new ScenegraphLayer({
            id: 'ship-3d',
            data: veh,
            scenegraph: '/models/ship.glb',
            getPosition: (d: (typeof veh)[0]) => [d.pos[0], d.pos[1], 0],
            getOrientation: (d: (typeof veh)[0]) => [0, 90 - d.bearing, 0],
            sizeScale: 380,
            sizeMinPixels: 84,
            sizeMaxPixels: 400,
            _lighting: 'pbr',
            updateTriggers: { getPosition: [c.day], getOrientation: [c.day] },
            parameters: { depthCompare: 'always' },
          } as any),
        );
      } else {
        layers.push(
          new IconLayer({
            id: 'ship-2d',
            data: veh,
            getPosition: (d: (typeof veh)[0]) => d.pos,
            getIcon: () => ({ url: SHIP_ICON, width: 40, height: 120, anchorY: 60 }),
            getAngle: (d: (typeof veh)[0]) => -d.bearing,
            getSize: 40,
            billboard: false,
            updateTriggers: { getPosition: [c.day], getAngle: [c.day] },
            parameters: { depthCompare: 'always' },
          }),
        );
      }
    }
  }
  return layers;
}

export interface GoogleTilesCtx {
  key: string;
  /** Nội dung root.json đã tải khi kiểm tra – dùng lại để không gọi root (tính phí) hai lần */
  rootJson: string;
  onTileLoad: (id: string, copyright: string) => void;
  onTileUnload: (id: string) => void;
  onError: (msg: string) => void;
}

/** URL gốc theo tài liệu Map Tiles API; key gửi qua header X-GOOG-API-KEY (cách deck.gl hướng dẫn) */
export const GOOGLE_3D_ROOT = 'https://tile.googleapis.com/v1/3dtiles/root.json';

/** Gọi root tileset một lần để kiểm tra key / Map Tiles API / billing trước khi bật lớp ảnh thực */
export async function preflightGoogleTiles(key: string): Promise<{ ok: true; rootJson: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(GOOGLE_3D_ROOT, { headers: { 'X-GOOG-API-KEY': key } });
    const text = await res.text();
    if (res.ok) return { ok: true, rootJson: text };
    let msg = `HTTP ${res.status}`;
    try {
      msg += ` – ${JSON.parse(text).error?.message ?? ''}`;
    } catch {
      /* không phải JSON */
    }
    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

let googleLayerCache: { key: string; layer: Layer } | null = null;
/** Giữ nguyên một instance layer (không tạo lại mỗi khung hình → không yêu cầu lại root tileset) */
function googleLayer(g: GoogleTilesCtx): Layer {
  if (googleLayerCache?.key === g.key) return googleLayerCache.layer;
  const fetchTile = (url: string, init?: RequestInit) => {
    if (url.split('?')[0] === GOOGLE_3D_ROOT) return Promise.resolve(new Response(g.rootJson, { status: 200, headers: { 'Content-Type': 'application/json' } }));
    return fetch(url, { ...init, headers: { ...(init?.headers ?? {}), 'X-GOOG-API-KEY': g.key } });
  };
  const layer = new Tile3DLayer({
    id: 'google-3d-tiles',
    data: GOOGLE_3D_ROOT,
    loader: Tiles3DLoader,
    loadOptions: { fetch: fetchTile },
    onTileLoad: (tile: any) => g.onTileLoad(String(tile.id), String(tile.content?.gltf?.asset?.copyright ?? '')),
    onTileUnload: (tile: any) => g.onTileUnload(String(tile.id)),
    onTileError: (_tile: any, _url: string, msg: string) => g.onError(msg || 'tile error'),
    onError: (err: Error) => {
      g.onError(err?.message ?? String(err));
      return true;
    },
  } as any);
  googleLayerCache = { key: g.key, layer };
  return layer;
}
export const resetGoogleLayer = () => (googleLayerCache = null);

/** Gộp ghi công của các tile đang hiển thị: tách theo ";", sắp xếp theo số lần xuất hiện (theo chính sách Map Tiles API) */
export function aggregateCredits(perTile: Iterable<string>): string {
  const count = new Map<string, number>();
  for (const c of perTile) for (const part of c.split(';').map((x) => x.trim()).filter(Boolean)) count.set(part, (count.get(part) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k).join('; ');
}

/** Cảnh cảng 3D: chồng container (khối hộp), cẩu bờ và tàu đậu (mô hình .glb) – hình minh họa */
function sceneLayers(scene: PortScene): Layer[] {
  return [
    new SimpleMeshLayer<Box>({
      id: `scene-boxes-${scene.code}`,
      data: scene.boxes,
      mesh: cube,
      getPosition: (b) => [b.pos[0], b.pos[1], 0],
      // CubeGeometry là khối -1..1 → scale = nửa kích thước; dịch lên theo trục z
      getScale: (b) => [b.len / 2, b.wid / 2, b.h / 2],
      getTranslation: (b) => [0, 0, b.z + b.h / 2],
      getOrientation: (b) => [0, b.dir, 0],
      getColor: (b) => b.color,
      material: { ambient: 0.5, diffuse: 0.6, shininess: 20 },
    }),
    new ScenegraphLayer({
      id: `scene-cranes-${scene.code}`,
      data: scene.cranes,
      scenegraph: '/models/crane.glb',
      getPosition: (d: PortScene['cranes'][0]) => [d.pos[0], d.pos[1], 0],
      getOrientation: (d: PortScene['cranes'][0]) => [0, 90 - d.bearing, 0],
      sizeScale: 1,
      _lighting: 'pbr',
    } as any),
    new ScenegraphLayer({
      id: `scene-ships-${scene.code}`,
      data: scene.ships,
      scenegraph: '/models/ship.glb',
      getPosition: (d: PortScene['ships'][0]) => [d.pos[0], d.pos[1], 0],
      getOrientation: (d: PortScene['ships'][0]) => [0, 90 - d.bearing, 0],
      getScale: (d: PortScene['ships'][0]) => [d.length, d.length, d.length],
      sizeScale: 1,
      _lighting: 'pbr',
    } as any),
  ];
}
