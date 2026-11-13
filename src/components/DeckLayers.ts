import { PathStyleExtension } from '@deck.gl/extensions';
import { TripsLayer } from '@deck.gl/geo-layers';
import { IconLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { ScenegraphLayer, SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { CubeGeometry } from '@luma.gl/engine';
import type { Layer } from '@deck.gl/core';
import { ANIMATION_CONFIG } from '../config/routing';
import { PORTS } from '../data/ports';
import { bearing, positionAt } from '../lib/geo';
import type { LngLat, Port, RouteResult } from '../types';

const svg = (s: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;

/** Icon tàu 2D (nhìn từ trên, mũi hướng lên = Bắc) */
export const SHIP_ICON = svg(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="120" viewBox="0 0 40 120">
  <path d="M20 2 C30 18 34 30 34 44 L34 108 Q34 116 26 116 L14 116 Q6 116 6 108 L6 44 C6 30 10 18 20 2z" fill="#1e3a5f" stroke="#fff" stroke-width="3"/>
  <rect x="11" y="34" width="8" height="12" fill="#ef4444"/><rect x="21" y="34" width="8" height="12" fill="#3b82f6"/>
  <rect x="11" y="48" width="8" height="12" fill="#f59e0b"/><rect x="21" y="48" width="8" height="12" fill="#22c55e"/>
  <rect x="11" y="62" width="8" height="12" fill="#3b82f6"/><rect x="21" y="62" width="8" height="12" fill="#ef4444"/>
  <rect x="11" y="76" width="8" height="12" fill="#22c55e"/><rect x="21" y="76" width="8" height="12" fill="#f59e0b"/>
  <rect x="9" y="94" width="22" height="14" rx="2" fill="#f8fafc"/></svg>`);

export interface LayerContext {
  polCode: string | null;
  podCode: string | null;
  pickTarget: 'pol' | 'pod';
  route: RouteResult | null;
  routeKey: string;
  /** 0..1 */
  progress: number;
  zoom: number;
  ship3d: boolean;
  shipModelOk: boolean;
  hoverPort: string | null;
  onPortClick: (code: string) => void;
  onPortHover: (code: string | null) => void;
}

export function buildLayers(ctx: LayerContext): Layer[] {
  const layers: Layer[] = [];
  const { route, progress } = ctx;
  const total = route?.distanceNm ?? 0;
  const currentNm = progress * total;

  // 1) Tất cả cảng
  layers.push(
    new ScatterplotLayer<typeof PORTS[number]>({
      id: 'ports',
      data: PORTS,
      getPosition: (p) => p.coord,
      getRadius: (p) => (p.code === ctx.hoverPort ? 7 : 4.5),
      radiusUnits: 'pixels',
      getFillColor: (p) => (p.code === ctx.polCode ? [37, 99, 235] : p.code === ctx.podCode ? [249, 115, 22] : p.code === ctx.hoverPort ? [14, 116, 144] : [8, 145, 178, 220]),
      getLineColor: [255, 255, 255],
      lineWidthMinPixels: 1.5,
      stroked: true,
      pickable: true,
      onClick: (info) => info.object && ctx.onPortClick(info.object.code),
      onHover: (info) => ctx.onPortHover(info.object?.code ?? null),
      updateTriggers: { getFillColor: [ctx.polCode, ctx.podCode, ctx.hoverPort], getRadius: [ctx.hoverPort] },
      parameters: { depthCompare: 'always' },
    }),
  );
  // 2) Tuyến
  if (route) {
    const data = [{ path: route.coords, timestamps: route.cumNm }];
    layers.push(
      new PathLayer({
        id: `route-full-${ctx.routeKey}`,
        data,
        getPath: (d: (typeof data)[0]) => d.path,
        getColor: [255, 255, 255, 200],
        getWidth: 2.2,
        widthUnits: 'pixels',
        getDashArray: [6, 5],
        dashJustified: true,
        extensions: [new PathStyleExtension({ dash: true })],
        parameters: { depthCompare: 'always' },
      } as any),
      new PathLayer({
        id: `route-shadow-${ctx.routeKey}`,
        data,
        getPath: (d: (typeof data)[0]) => d.path,
        getColor: [15, 76, 129, 110],
        getWidth: 5,
        widthUnits: 'pixels',
        parameters: { depthCompare: 'always' },
      }),
      new TripsLayer({
        id: `route-trip-${ctx.routeKey}`,
        data,
        getPath: (d: (typeof data)[0]) => d.path,
        getTimestamps: (d: (typeof data)[0]) => d.timestamps,
        getColor: [253, 186, 54],
        widthMinPixels: 4.5,
        capRounded: true,
        jointRounded: true,
        fadeTrail: true,
        trailLength: total * ANIMATION_CONFIG.trailRatio,
        currentTime: currentNm,
        parameters: { depthCompare: 'always' },
      }),
      // phần đã đi qua (mờ)
      new PathLayer({
        id: `route-done-${ctx.routeKey}`,
        data: [{ path: route.coords.slice(0, positionAt(route.coords, route.cumNm, currentNm).index + 2) }],
        getPath: (d: { path: LngLat[] }) => d.path,
        getColor: [253, 186, 54, 90],
        getWidth: 2.5,
        widthUnits: 'pixels',
        parameters: { depthCompare: 'always' },
        updateTriggers: { getPath: [Math.round(currentNm)] },
      }),
    );

    // 4) Tàu
    const at = positionAt(route.coords, route.cumNm, currentNm);
    const ship = [{ pos: at.pos, bearing: at.bearing }];
    if (ctx.ship3d && ctx.shipModelOk) {
      layers.push(
        new ScenegraphLayer({
          id: 'ship-3d',
          data: ship,
          scenegraph: '/models/ship.glb',
          getPosition: (d: (typeof ship)[0]) => [d.pos[0], d.pos[1], 0],
          getOrientation: (d: (typeof ship)[0]) => [0, 90 - d.bearing, 0],
          sizeScale: 380,
          sizeMinPixels: 84,
          sizeMaxPixels: 400,
          _lighting: 'pbr',
          updateTriggers: { getPosition: [currentNm], getOrientation: [currentNm] },
          parameters: { depthCompare: 'always' },
        } as any),
      );
    } else {
      layers.push(
        new IconLayer({
          id: 'ship-2d',
          data: ship,
          getPosition: (d: (typeof ship)[0]) => d.pos,
          getIcon: () => ({ url: SHIP_ICON, width: 40, height: 120, anchorY: 60 }),
          getAngle: (d: (typeof ship)[0]) => -d.bearing,
          getSize: 44,
          billboard: false,
          updateTriggers: { getPosition: [currentNm], getAngle: [currentNm] },
          parameters: { depthCompare: 'always' },
        }),
      );
    }
    // vòng sáng quanh tàu
    layers.push(
      new ScatterplotLayer({
        id: 'ship-halo',
        data: ship,
        getPosition: (d: (typeof ship)[0]) => d.pos,
        getRadius: 18 + 4 * Math.sin(performance.now() / 300),
        radiusUnits: 'pixels',
        getFillColor: [253, 186, 54, 50],
        getLineColor: [253, 186, 54, 160],
        stroked: true,
        lineWidthMinPixels: 1.5,
        updateTriggers: { getPosition: [currentNm], getRadius: [Math.round(performance.now() / 50)] },
        parameters: { depthCompare: 'always' },
      }),
    );
  }

  const pol = PORTS.find((p) => p.code === ctx.polCode);
  const pod = PORTS.find((p) => p.code === ctx.podCode);

  // 6) Mô hình 3D cảnh cảng (zoom > 12)
  if (ctx.zoom > 12) {
    const scenes = [pol, pod].filter(Boolean) as Port[];
    layers.push(...portScene(scenes));
  }
  return layers;
}

/* ───────────── Cảnh cảng 3D đơn giản: cẩu STS + bãi container ───────────── */

interface Box {
  pos: LngLat;
  /** kích thước (m): dài theo trục `dir`, rộng, cao */
  len: number;
  wid: number;
  h: number;
  /** cao độ đáy (m) */
  z: number;
  /** hướng trục dài, độ, ngược chiều kim đồng hồ từ hướng Đông */
  dir: number;
  color: [number, number, number];
}

const M_PER_DEG = 111320;
function offset(p: LngLat, east: number, north: number): LngLat {
  return [p[0] + east / (M_PER_DEG * Math.cos((p[1] * Math.PI) / 180)), p[1] + north / M_PER_DEG];
}

const sceneCache = new Map<string, Box[]>();
function sceneBoxes(port: Port): Box[] {
  const hit = sceneCache.get(port.code);
  if (hit) return hit;
  const sea = port.approach?.[0] ?? [port.coord[0], port.coord[1] - 0.01];
  const toSea = bearing(port.coord, sea); // hướng la bàn ra mặt nước
  const uAng = 90 - toSea; // trục u: vuông góc cầu cảng, hướng ra biển (góc toán học)
  const vAng = uAng - 90; // trục v: dọc cầu cảng
  const ur = (uAng * Math.PI) / 180, vr = (vAng * Math.PI) / 180;
  const at = (u: number, v: number) => offset(port.coord, u * Math.cos(ur) + v * Math.cos(vr), u * Math.sin(ur) + v * Math.sin(vr));
  const boxes: Box[] = [];
  const colors: [number, number, number][] = [[220, 38, 38], [37, 99, 235], [245, 158, 11], [22, 163, 74], [148, 163, 184], [124, 58, 237], [14, 116, 144]];
  let seed = [...port.code].reduce((s, c) => s + c.charCodeAt(0), 0);
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  // mặt cầu cảng
  boxes.push({ pos: at(-40, 0), len: 640, wid: 90, h: 2, z: 0, dir: vAng, color: [110, 113, 120] });
  // 5 cẩu bờ STS
  for (let i = -2; i <= 2; i++) {
    const v = i * 110;
    for (const du of [-22, 6]) for (const dv of [-9, 9]) boxes.push({ pos: at(du, v + dv), len: 2.4, wid: 2.4, h: 46, z: 2, dir: uAng, color: [234, 88, 12] });
    boxes.push({ pos: at(-8, v - 9), len: 34, wid: 2, h: 2.5, z: 44, dir: uAng, color: [234, 88, 12] });
    boxes.push({ pos: at(-8, v + 9), len: 34, wid: 2, h: 2.5, z: 44, dir: uAng, color: [234, 88, 12] });
    boxes.push({ pos: at(30, v), len: 70, wid: 3, h: 3, z: 50, dir: uAng, color: [234, 88, 12] }); // cần vươn ra biển
    boxes.push({ pos: at(-16, v), len: 16, wid: 20, h: 6, z: 46.5, dir: uAng, color: [250, 204, 21] }); // buồng máy
  }
  // bãi container: các block 6 hàng × 10 bay, container 40′ (12.2 × 2.44 × 2.6 m)
  for (let block = 0; block < 4; block++) {
    for (let side = -1; side <= 1; side += 2) {
      for (let row = 0; row < 6; row++) {
        for (let bay = 0; bay < 10; bay++) {
          if (rnd() < 0.12) continue;
          const tiers = 1 + Math.floor(rnd() * 4);
          const u = -110 - block * 40 - row * 2.9;
          const v = side * (20 + bay * 13.2);
          for (let t = 0; t < tiers; t++) boxes.push({ pos: at(u, v), len: 12.2, wid: 2.44, h: 2.55, z: t * 2.6, dir: vAng, color: colors[Math.floor(rnd() * colors.length)] });
        }
      }
    }
  }
  sceneCache.set(port.code, boxes);
  return boxes;
}

const cube = new CubeGeometry();

function portScene(ports: Port[]): Layer[] {
  const data = ports.flatMap(sceneBoxes);
  return [
    new SimpleMeshLayer<Box>({
      id: 'port-scene',
      data,
      mesh: cube,
      getPosition: (b) => [b.pos[0], b.pos[1], 0],
      // CubeGeometry là khối -1..1 → scale = nửa kích thước; dịch lên theo trục z
      getScale: (b) => [b.len / 2, b.wid / 2, b.h / 2],
      getTranslation: (b) => [0, 0, b.z + b.h / 2],
      getOrientation: (b) => [0, b.dir, 0],
      getColor: (b) => b.color,
      material: { ambient: 0.45, diffuse: 0.6, shininess: 20 },
    }),
  ];
}
