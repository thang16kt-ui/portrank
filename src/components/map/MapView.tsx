import { MapboxOverlay } from '@deck.gl/mapbox';
import maplibregl from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ANIMATION_CONFIG } from '../../config/routing';
import { PORTS, PORT_BY_CODE } from '../../data/ports';
import { getTrack, useCurrent, useRanked, useSchedule } from '../../lib/actions';
import { arcPath, bendForIndex } from '../../lib/arc';
import { fmtDateVi } from '../../lib/csv';
import { fmtDays, usd, usdK } from '../../lib/format';
import { bbox } from '../../lib/geo';
import type { Plan, PlanOption } from '../../lib/plan';
import type { RankedOption } from '../../lib/ranking';
import { trackPosition, type Track } from '../../lib/track';
import { loadWorld } from '../../lib/world';
import { useAppStore, usePlayback } from '../../store/useAppStore';
import { useDataStore } from '../../store/useDataStore';
import type { LngLat, Place } from '../../types';
import { aggregateCredits, buildLayers, preflightGoogleTiles, resetGoogleLayer, type GoogleTilesCtx } from './mapLayers';
import { buildScene, fetchOsmCranes, scanPort, type PortGrid, type PortScene } from './portScene';
import PlaybackBar, { SeaSimulationSummary } from '../PlaybackBar';
import MapThemePanel from './MapThemePanel';
import { labelVars, mix, resolveTheme, type MapTheme } from '../../config/mapThemes';

export const mapHandle: { map: maplibregl.Map | null } = { map: null };

const SEA = '#070B14';
/** Nền bản đồ vector chi tiết (như V1) – OpenFreeMap, không cần key */
const LIBERTY_URL = 'https://tiles.openfreemap.org/styles/liberty';
const EMPTY_STYLE: maplibregl.StyleSpecification = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': SEA } }] };
const styleFor = (t: MapTheme) => (t.basemap === 'liberty' ? LIBERTY_URL : EMPTY_STYLE);
/** Lớp nền tự vẽ – ẩn khi dùng nền Liberty (Liberty đã có đất, biển, biên giới) */
const OWN_BASE_LAYERS = ['land-fill', 'borders', 'coast-glow', 'coast'];

/** Đổi nhãn địa danh của nền Liberty sang tiếng Việt (giống V1) */
function localizeLabels(map: maplibregl.Map) {
  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.type !== 'symbol') continue;
    const tf = map.getLayoutProperty(layer.id, 'text-field');
    if (!tf || !JSON.stringify(tf).includes('name')) continue;
    try {
      map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:vi'], ['get', 'name:latin'], ['get', 'name_en'], ['get', 'name']]);
    } catch {
      /* bỏ qua */
    }
  }
}

const WORLD_LAYERS = ['land-fill', 'borders', 'coast-glow', 'coast', 'hlA-fill', 'hlA-glow', 'hlA-line', 'hlB-fill', 'hlB-glow', 'hlB-line', 'ports-glow', 'ports-dot'];
const PORT_VIEW_LAYERS = ['p-landuse', 'p-water', 'p-water-glow', 'p-water-edge', 'p-pier', 'p-pier-line', 'p-road', 'p-rail', 'p-building'];

const tooltipStyle = {
  background: 'var(--color-panel)', color: 'var(--color-fg)', border: '1px solid var(--color-line)', borderRadius: '8px', padding: '6px 10px', boxShadow: '0 4px 16px rgba(0,0,0,.18)',
  fontSize: '12px', fontFamily: 'Be Vietnam Pro, sans-serif', lineHeight: '1.45',
};

function addBaseLayers(map: maplibregl.Map) {
  if (map.getSource('world')) return;
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  // với nền Liberty: chèn lớp của PortRank dưới lớp chữ đầu tiên để tên địa danh vẫn nổi
  const firstSymbol = map.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
  const add = (l: maplibregl.AddLayerObject) => map.addLayer(l, l.id.startsWith('ports') ? undefined : firstSymbol);
  map.addSource('world', { type: 'geojson', data: empty });
  map.addSource('landmass', { type: 'geojson', data: empty });
  map.addSource('country-lines', { type: 'geojson', data: empty });
  map.addSource('ports', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: PORTS.map((p) => ({ type: 'Feature', properties: { code: p.code, name: p.name }, geometry: { type: 'Point', coordinates: p.coord } })) },
  });
  add({ id: 'land-fill', type: 'fill', source: 'world', paint: { 'fill-color': '#0c1a2c' } });
  add({ id: 'borders', type: 'line', source: 'country-lines', paint: { 'line-color': '#1f3a5c', 'line-width': 0.5, 'line-opacity': 0.7 } });
  // Viền bờ biển phát sáng: 1 lớp dày mờ + 1 lớp mảnh sáng
  add({ id: 'coast-glow', type: 'line', source: 'landmass', paint: { 'line-color': '#22d3ee', 'line-width': 5, 'line-blur': 5, 'line-opacity': 0.4 } });
  add({ id: 'coast', type: 'line', source: 'landmass', paint: { 'line-color': '#7fe3f5', 'line-width': 0.7, 'line-opacity': 0.9 } });
  for (const [k, c] of [['hlA', '#38bdf8'], ['hlB', '#fb923c']] as const) {
    const filter: maplibregl.FilterSpecification = ['==', ['get', 'iso2'], '__'];
    add({ id: `${k}-fill`, type: 'fill', source: 'world', filter, paint: { 'fill-color': c, 'fill-opacity': 0.1 } });
    add({ id: `${k}-glow`, type: 'line', source: 'country-lines', filter, paint: { 'line-color': c, 'line-width': 7, 'line-blur': 6, 'line-opacity': 0.75 } });
    add({ id: `${k}-line`, type: 'line', source: 'country-lines', filter, paint: { 'line-color': c, 'line-width': 1.4 } });
  }
  add({ id: 'ports-glow', type: 'circle', source: 'ports', paint: { 'circle-radius': 5, 'circle-color': '#22d3ee', 'circle-blur': 1, 'circle-opacity': 0.5 } });
  add({ id: 'ports-dot', type: 'circle', source: 'ports', paint: { 'circle-radius': 2, 'circle-color': '#a5f3fc' } });

  // ── Lớp cảng 3D (Mức 1): vector tiles OpenStreetMap theo schema OpenMapTiles – chỉ nạp khi bật ──
  map.addSource('omt', { type: 'vector', url: 'https://tiles.openfreemap.org/planet' });
  const hide = { visibility: 'none' as const };
  const cls = (...c: string[]): maplibregl.ExpressionSpecification => ['in', ['get', 'class'], ['literal', c]];
  add({ id: 'p-landuse', type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: cls('industrial', 'commercial', 'railway'), layout: hide, paint: { 'fill-color': '#15294a' } });
  add({ id: 'p-water', type: 'fill', source: 'omt', 'source-layer': 'water', layout: hide, paint: { 'fill-color': '#050b16' } });
  add({ id: 'p-water-glow', type: 'line', source: 'omt', 'source-layer': 'water', layout: hide, paint: { 'line-color': '#22d3ee', 'line-width': 5, 'line-blur': 5, 'line-opacity': 0.35 } });
  add({ id: 'p-water-edge', type: 'line', source: 'omt', 'source-layer': 'water', layout: hide, paint: { 'line-color': '#7fe3f5', 'line-width': 0.8, 'line-opacity': 0.8 } });
  add({ id: 'p-pier', type: 'fill', source: 'omt', 'source-layer': 'transportation', filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'class'], 'pier']], layout: hide, paint: { 'fill-color': '#27466f' } });
  add({ id: 'p-pier-line', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'class'], 'pier']], layout: hide, paint: { 'line-color': '#27466f', 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 12, 1, 16, 14] } });
  add({ id: 'p-road', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['all', ['==', ['geometry-type'], 'LineString'], cls('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service')], layout: hide, paint: { 'line-color': '#34527c', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 16, 3] } });
  add({ id: 'p-rail', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['all', ['==', ['geometry-type'], 'LineString'], cls('rail')], layout: hide, paint: { 'line-color': '#b98a3c', 'line-width': 1.2, 'line-dasharray': [3, 2] } });
  add({
    id: 'p-building', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', layout: hide, minzoom: 12,
    paint: { 'fill-extrusion-color': '#2b4a78', 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.9 },
  });
}

/** Áp chủ đề màu lên các lớp nền MapLibre */
function applyTheme(map: maplibregl.Map, t: MapTheme, portView: boolean) {
  const C = t.colors;
  const paint = (id: string, prop: string, v: unknown) => map.getLayer(id) && map.setPaintProperty(id, prop as never, v as never);
  const liberty = t.basemap === 'liberty';
  for (const id of OWN_BASE_LAYERS) map.getLayer(id) && map.setLayoutProperty(id, 'visibility', liberty || portView ? 'none' : 'visible');
  if (liberty) {
    // chỉ đổi màu lớp của Liberty khi người dùng đã tự chỉnh màu đó (giữ nguyên màu gốc của bản đồ chi tiết)
    const custom = new Set(t.custom ?? []);
    for (const l of map.getStyle()?.layers ?? []) {
      const sl = (l as { 'source-layer'?: string })['source-layer'];
      if (custom.has('sea') && l.type === 'fill' && sl === 'water') paint(l.id, 'fill-color', C.sea);
      if (custom.has('land') && l.type === 'background') paint(l.id, 'background-color', C.land);
      if (custom.has('border') && l.type === 'line' && sl === 'boundary') paint(l.id, 'line-color', C.border);
    }
  }
  paint('ports-dot', 'circle-radius', t.light ? 3.5 : 2);
  paint('ports-dot', 'circle-stroke-color', '#ffffff');
  paint('ports-dot', 'circle-stroke-width', t.light ? 1.2 : 0);
  paint('bg', 'background-color', portView ? C.land : C.sea);
  paint('land-fill', 'fill-color', C.land);
  paint('borders', 'line-color', C.border);
  paint('borders', 'line-opacity', t.light ? 0.9 : 0.7);
  paint('coast-glow', 'line-color', C.coastGlow);
  paint('coast-glow', 'line-opacity', t.glow);
  paint('coast', 'line-color', C.coast);
  for (const [k, c] of [['hlA', C.seller], ['hlB', C.buyer]] as const) {
    paint(`${k}-fill`, 'fill-color', c);
    paint(`${k}-glow`, 'line-color', c);
    paint(`${k}-line`, 'line-color', c);
  }
  paint('ports-glow', 'circle-color', C.coastGlow);
  paint('ports-glow', 'circle-opacity', t.light ? 0 : 0.5);
  paint('ports-dot', 'circle-color', C.ports);
  // cảnh cảng 3D (OpenStreetMap)
  paint('p-water', 'fill-color', t.light ? C.sea : mix(C.sea, '#000000', 0.25));
  paint('p-water-glow', 'line-color', C.coastGlow);
  paint('p-water-glow', 'line-opacity', t.glow * 0.9);
  paint('p-water-edge', 'line-color', C.coast);
  paint('p-landuse', 'fill-color', mix(C.land, C.coast, 0.12));
  paint('p-pier', 'fill-color', mix(C.land, t.light ? '#000000' : '#ffffff', 0.15));
  paint('p-pier-line', 'line-color', mix(C.land, t.light ? '#000000' : '#ffffff', 0.15));
  paint('p-road', 'line-color', mix(C.land, t.light ? '#000000' : '#ffffff', 0.22));
  paint('p-building', 'fill-extrusion-color', mix(C.land, C.coast, 0.3));
}

/** Căn khung nhìn theo tập toạ độ (kinh độ đã liên tục – không bị cắt ở 180°) */
export function fitCoords(map: maplibregl.Map, coords: LngLat[], opts: { globe?: boolean; bottom?: number; maxZoom?: number } = {}) {
  if (!coords.length) return;
  map.resize();
  const [a, b, c, d] = bbox(coords);
  const el = map.getContainer();
  const W = el.clientWidth, H = el.clientHeight;
  const pad = { top: 100, bottom: opts.bottom ?? 60, left: 70, right: 100 };
  const availW = Math.max(120, W - pad.left - pad.right), availH = Math.max(120, H - pad.top - pad.bottom);
  const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360));
  const yb = mercY(b), yd = mercY(d);
  const spanLon = Math.max(0.5, c - a), spanY = Math.max(0.01, yd - yb);
  let zoom = Math.log2(Math.min((availW * 360) / (spanLon * 512), (availH * 2 * Math.PI) / (spanY * 512)));
  const pxPerRad = (512 * 2 ** zoom) / (2 * Math.PI);
  const yCenter = (yb + yd) / 2 - (pad.bottom - pad.top) / 2 / pxPerRad;
  const lat = (Math.atan(Math.sinh(yCenter)) * 180) / Math.PI;
  const lon = ((((a + c) / 2 + ((pad.right - pad.left) / 2 / pxPerRad) * (180 / Math.PI)) + 540) % 360) - 180;
  zoom = opts.globe ? Math.min(5, Math.max(1.2, zoom - 0.15)) : Math.min(opts.maxZoom ?? 6.5, Math.max(0.4, zoom));
  map.flyTo({ center: opts.globe ? [(((a + c) / 2 + 540) % 360) - 180, (b + d) / 2] : [lon, lat], zoom, pitch: 0, bearing: 0, duration: 1400, essential: true });
}

/** Dời kinh độ của p về gần ref (±360°) để các điểm liên tục */
const near = (p: LngLat, ref: LngLat): LngLat => {
  let x = p[0];
  while (x - ref[0] > 180) x -= 360;
  while (x - ref[0] < -180) x += 360;
  return [x, p[1]];
};

function planCoords(plan: Plan, ranked: RankedOption[]): LngLat[] {
  const out: LngLat[] = [];
  ranked.forEach((r, i) => {
    const o = r.option;
    if (o.mode === 'road' && o.roadPath) out.push(...o.roadPath);
    else if (o.pol && o.pod) out.push(...arcPath(o.pol.coord, o.pod.coord, bendForIndex(i), 16));
  });
  const ref = out[0] ?? plan.seller.coord;
  if (plan.seller.kind === 'address') out.push(near(plan.seller.coord, ref));
  const last = out[out.length - 1] ?? ref;
  if (plan.buyer.kind === 'address') out.push(near(plan.buyer.coord, last));
  return out;
}

const shortLabel = (p: Place) => p.label.split(',')[0];

interface Latest {
  plan: Plan | null;
  ranked: RankedOption[];
  current: PlanOption | null;
  selectedKey: string | null;
  hoverKey: string | null;
  track: Track | null;
  showSeaRoute: boolean;
  view3d: boolean;
  portView: string | null;
  follow: boolean;
  scene: PortScene | null;
  google: GoogleTilesCtx | null;
  theme: MapTheme;
}

/** Key Map Tiles API (build-time). Không có key → ẩn nút "Ảnh thực". */
const GOOGLE_KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined)?.trim() || '';

export default function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [worldReady, setWorldReady] = useState(false);
  /** Tăng mỗi lần style bản đồ được nạp lại → các effect gắn lớp/filter chạy lại */
  const [styleRev, setStyleRev] = useState(0);
  const [mapError, setMapError] = useState<string | null>(null);
  /** Mất WebGL context → ném lỗi cho MapBoundary để thay vùng bản đồ bằng thông báo (không làm trắng app) */
  const [crash, setCrash] = useState<string | null>(null);
  if (crash) throw new Error(crash);
  const [scene, setScene] = useState<PortScene | null>(null);
  const [sceneBusy, setSceneBusy] = useState(false);
  const [photoreal, setPhotoreal] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const rootJson = useRef('');
  const [credits, setCredits] = useState('');
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const tileCredits = useRef(new Map<string, string>());
  const google = useMemo<GoogleTilesCtx | null>(() => {
    if (!photoreal || !GOOGLE_KEY) return null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let loaded = 0;
    const flush = () => {
      timer = null;
      setCredits(aggregateCredits(tileCredits.current.values()));
    };
    const schedule = () => (timer ??= setTimeout(flush, 400));
    return {
      key: GOOGLE_KEY,
      rootJson: rootJson.current,
      onTileLoad: (id, c) => {
        loaded++;
        tileCredits.current.set(id, c);
        schedule();
      },
      onTileUnload: (id) => {
        tileCredits.current.delete(id);
        schedule();
      },
      onError: (msg) => {
        // lỗi ngay từ đầu (key sai, chưa bật Map Tiles API / billing…) → quay về Mức 1
        if (loaded === 0) {
          setPhotoreal(false);
          setPhotoMsg(`Không tải được ảnh thực Google 3D (${msg.slice(0, 120)}). Kiểm tra key, Map Tiles API và billing – đã quay về bố cục OpenStreetMap.`);
        }
      },
    };
  }, [photoreal]);
  const plan = useAppStore((s) => s.plan);
  const planRun = useAppStore((s) => s.planRun);
  const planning = useAppStore((s) => s.planning);
  const selectedKey = useAppStore((s) => s.selectedKey);
  const hoverKey = useAppStore((s) => s.hoverKey);
  const showSeaRoute = useAppStore((s) => s.showSeaRoute);
  const view3d = useAppStore((s) => s.view3d);
  const follow = useAppStore((s) => s.follow);
  const portView = useAppStore((s) => s.portView);
  const mine = useAppStore((s) => s.form.mine);
  const partner = useAppStore((s) => s.form.partner);
  const role = useAppStore((s) => s.form.role);
  const toast = useAppStore((s) => s.toast);
  const set = useAppStore((s) => s.set);
  const themeSetting = useDataStore((s) => s.mapTheme);
  const theme = useMemo(() => resolveTheme(themeSetting), [themeSetting]);
  const ranked = useRanked();
  const cur = useCurrent();
  const schedule = useSchedule();
  const current = cur?.option ?? null;
  const track = useMemo(() => (current && selectedKey ? getTrack(current, schedule) : null), [current, selectedKey, schedule]);

  const st = useRef({
    overlay: null as MapboxOverlay | null,
    markers: [] as maplibregl.Marker[],
    coMarkers: [] as maplibregl.Marker[],
    truck: null as maplibregl.Marker | null,
    shipModelOk: false,
    followBearing: 0,
    liberty: false,
    prevCam: null as null | { center: maplibregl.LngLatLike; zoom: number },
    grid: null as PortGrid | null,
    lastT: 0,
  });
  const latest = useRef<Latest>({ plan, ranked, current, selectedKey, hoverKey, track, showSeaRoute, view3d, portView, follow, scene, google, theme });
  latest.current = { plan, ranked, current, selectedKey, hoverKey, track, showSeaRoute, view3d, portView, follow, scene, google, theme };

  /* ───────── Khởi tạo bản đồ: style rỗng (chỉ nền màu), không dùng tile server cho bản đồ chính ───────── */
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: styleFor(resolveTheme(useDataStore.getState().mapTheme)),
      center: [70, 22],
      zoom: 1.4,
      maxPitch: 75,
      attributionControl: { compact: true, customAttribution: 'Bản đồ: Natural Earth · Cảng 3D: © OpenStreetMap, OpenFreeMap' },
    });
    mapHandle.map = map;
    if (import.meta.env.DEV) Object.assign(window, { __map: map, __app: useAppStore, __pb: usePlayback, __data: useDataStore });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    const overlay = new MapboxOverlay({
      interleaved: true,
      pickingRadius: 8,
      layers: [],
      getTooltip: ({ object, layer }) => {
        if (!object || !layer || layer.id !== 'arc-core') return null;
        const r = latest.current.ranked.find((x) => x.option.key === (object as { key: string }).key);
        if (!r) return null;
        const o = r.option;
        return {
          html: `<b>#${r.rank} · ${o.title}</b><br/>Tổng: <b>${usd(o.total)}</b> · Bạn trả: ${usd(r.youPay)}<br/>${fmtDays(o.days.total)}${r.tags.length ? ` · ${r.tags.join(', ')}` : ''}<br/><span style="opacity:.65;font-size:11px">Click để chọn phương án</span>`,
          style: tooltipStyle,
        };
      },
    });
    st.current.overlay = overlay;

    const fillWorld = () =>
      loadWorld()
        .then((w) => {
          (map.getSource('world') as maplibregl.GeoJSONSource | undefined)?.setData(w.countries as GeoJSON.FeatureCollection);
          (map.getSource('landmass') as maplibregl.GeoJSONSource | undefined)?.setData(w.coastLines as GeoJSON.FeatureCollection);
          (map.getSource('country-lines') as maplibregl.GeoJSONSource | undefined)?.setData(w.countryLines as GeoJSON.FeatureCollection);
          setWorldReady(true);
        })
        .catch(() => setMapError('Không nạp được dữ liệu bản đồ thế giới.'));
    // chạy mỗi lần nạp style (lần đầu và khi đổi giữa nền tự vẽ ↔ nền chi tiết): thêm lại lớp của PortRank
    map.on('style.load', () => {
      st.current.liberty = !!map.getSource('openmaptiles');
      if (st.current.liberty) localizeLabels(map);
      addBaseLayers(map);
      fillWorld();
      setStyleRev((r) => r + 1);
    });
    map.on('load', () => {
      map.addControl(overlay as unknown as maplibregl.IControl);
      setReady(true);
    });
    map.getCanvas().addEventListener('webglcontextlost', () => setCrash('Mất WebGL context của bản đồ'), { once: true });
    map.on('error', (e) => {
      const msg = (e as { error?: Error }).error?.message ?? '';
      if (/style|Failed to fetch/i.test(msg) && !map.isStyleLoaded()) setMapError('Không tải được bản đồ nền chi tiết OpenFreeMap (kiểm tra kết nối mạng) – chọn chủ đề khác trong 🎨 Màu bản đồ.');
    });
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, className: 'port-tip' });
    map.on('mouseenter', 'ports-dot', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features?.[0];
      if (f) popup.setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]).setHTML(`<div style="color:#0f172a;font-size:12px"><b>${f.properties.name}</b> · ${f.properties.code}</div>`).addTo(map);
    });
    map.on('mouseleave', 'ports-dot', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    });
    map.on('click', 'ports-dot', (e) => {
      const code = e.features?.[0]?.properties.code;
      if (code) useAppStore.getState().set({ portCard: code });
    });
    map.on('moveend', () => declutter(map));
    map.on('dragstart', () => useAppStore.getState().follow && useAppStore.getState().set({ follow: false }));

    fetch('/models/ship.glb', { method: 'HEAD' }).then((r) => (st.current.shipModelOk = r.ok)).catch(() => (st.current.shipModelOk = false));

    /* ───────── Vòng lặp hoạt ảnh ───────── */
    let raf = 0;
    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      const s = st.current, L = latest.current;
      const dt = Math.min(0.3, (ts - (s.lastT || ts)) / 1000);
      s.lastT = ts;
      const pb = usePlayback.getState();
      const active = !!(L.track && L.selectedKey);
      if (active && pb.playing) {
        const A = ANIMATION_CONFIG;
        const dur = Math.max(A.minSec, Math.min(A.maxSec, L.track!.total * A.secPerDay)) / pb.speed;
        const p = pb.progress + dt / dur;
        if (p >= 1) { pb.setProgress(1); pb.setPlaying(false); } else pb.setProgress(p);
      }
      const day = L.track ? usePlayback.getState().progress * L.track.total : 0;
      if (!s.overlay) return;
      s.overlay.setProps({
        layers: buildLayers({
          plan: L.plan, ranked: L.ranked, current: L.current, selectedKey: L.selectedKey, hoverKey: L.hoverKey,
          now: ts / 1000, track: L.track, day, showSeaRoute: L.showSeaRoute, view3d: L.view3d, portView: !!L.portView,
          shipModelOk: s.shipModelOk, scene: L.scene, google: L.portView ? L.google : null, theme: L.theme,
          onHover: (k) => useAppStore.getState().hoverKey !== k && useAppStore.getState().set({ hoverKey: k }),
          onClick: (k) => useAppStore.getState().select(k),
        }),
      });
      // Xe tải (đường bộ) – ghim HTML
      if (active && L.track!.vehicle === 'truck' && !L.portView && !L.view3d) {
        const at = trackPosition(L.track!, day);
        if (!s.truck) {
          const el = document.createElement('div');
          el.className = 'pr-truck';
          el.textContent = '🚚';
          s.truck = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(at.pos as [number, number]).addTo(map);
        } else s.truck.setLngLat(at.pos as [number, number]);
      } else if (s.truck) { s.truck.remove(); s.truck = null; }
      // Camera bám theo phương tiện
      if (active && L.follow && L.view3d && !L.portView) {
        const at = trackPosition(L.track!, day);
        let db = at.bearing - s.followBearing;
        db = ((db + 540) % 360) - 180;
        s.followBearing = (s.followBearing + db * Math.min(1, dt * 2) + 360) % 360;
        map.jumpTo({ center: at.pos as [number, number], zoom: Math.max(3.6, Math.min(map.getZoom(), 5)), pitch: 55, bearing: s.followBearing });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      map.remove();
      mapHandle.map = null;
    };
  }, []);

  /* ───────── Tô sáng viền quốc gia (nhánh A) + ghim công ty có pulse (nhánh B) ───────── */
  useEffect(() => {
    const map = mapHandle.map;
    if (!map || !ready) return;
    const s = st.current;
    s.coMarkers.forEach((m) => m.remove());
    s.coMarkers = [];
    const sides = [
      { p: role === 'seller' ? mine : partner, k: 'hlA', c: theme.colors.seller, tag: `Bên bán${role === 'seller' ? ' · bạn' : ' · đối tác'}` },
      { p: role === 'seller' ? partner : mine, k: 'hlB', c: theme.colors.buyer, tag: `Bên mua${role === 'buyer' ? ' · bạn' : ' · đối tác'}` },
    ];
    for (const { p, k, c, tag } of sides) {
      const filter: maplibregl.FilterSpecification = ['==', ['get', 'iso2'], p && p.kind === 'country' ? p.country : '__'];
      for (const suf of ['fill', 'glow', 'line']) map.setFilter(`${k}-${suf}`, filter);
      if (p && p.kind === 'address' && !portView) {
        const el = document.createElement('div');
        el.innerHTML = `<div style="position:relative"><div class="pr-co" style="--c:${c}"></div><div class="pr-co-label" style="--c:${c}">${shortLabel(p)}<small>${tag}</small></div></div>`;
        s.coMarkers.push(new maplibregl.Marker({ element: el, anchor: 'center', opacityWhenCovered: '0' }).setLngLat(p.coord as [number, number]).addTo(map));
      }
    }
  }, [ready, mine, partner, role, portView, theme, styleRev]);

  /* ───────── Khi chọn điểm (chưa tính): đưa bản đồ về vùng đó ───────── */
  useEffect(() => {
    const map = mapHandle.map;
    if (!map || !worldReady || plan) return;
    let cancelled = false;
    (async () => {
      const w = await loadWorld();
      if (cancelled) return;
      const pts: LngLat[] = [];
      for (const p of [mine, partner]) {
        if (!p) continue;
        const bb = p.kind === 'country' ? w.bbox.get(p.country) : null;
        if (bb) pts.push([bb[0], bb[1]], [bb[2], bb[3]]);
        else pts.push([p.coord[0] - 4, p.coord[1] - 3], [p.coord[0] + 4, p.coord[1] + 3]);
      }
      if (pts.length) fitCoords(map, pts.map((p) => near(p, pts[0])), { maxZoom: 5 });
    })();
    return () => { cancelled = true; };
  }, [worldReady, mine, partner, plan]);

  /* ───────── Sau khi tính xong / đổi lựa chọn: căn khung nhìn ───────── */
  useEffect(() => {
    const map = mapHandle.map;
    if (!map || !ready || !plan || portView) return;
    const t = setTimeout(() => {
      if (selectedKey && track && (current?.mode === 'road' || showSeaRoute || view3d)) fitCoords(map, track.coords, { globe: view3d, bottom: 110 });
      else fitCoords(map, planCoords(plan, ranked), { globe: view3d });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, planRun, selectedKey, track, showSeaRoute, view3d, portView]);

  /* ───────── 2D ↔ quả địa cầu ───────── */
  useEffect(() => {
    const map = mapHandle.map;
    if (!map || !ready) return;
    try {
      map.setProjection({ type: view3d && !portView ? 'globe' : 'mercator' });
    } catch (e) {
      console.warn('setProjection', e);
    }
  }, [ready, view3d, portView, styleRev]);

  /* ───────── Ghim cảng + nhãn, eo biển/kênh đào, cảng chuyển tải, cửa khẩu ───────── */
  useEffect(() => {
    const map = mapHandle.map;
    if (!map || !ready) return;
    const s = st.current;
    s.markers.forEach((m) => m.remove());
    s.markers = [];
    if (!plan || portView) return;
    const add = (el: HTMLElement, pos: LngLat, anchor: maplibregl.PositionAnchor = 'center') =>
      s.markers.push(new maplibregl.Marker({ element: el, anchor, opacityWhenCovered: '0' }).setLngLat(pos as [number, number]).addTo(map));
    // Cảng: chấm sáng + tên + UN/LOCODE + tổng chi phí của phương án tốt nhất qua cảng đó
    const best = new Map<string, RankedOption>();
    const side = new Map<string, 'o' | 'd'>();
    for (const r of ranked) {
      for (const [p, sd] of [[r.option.pol, 'o'], [r.option.pod, 'd']] as const) {
        if (p && !best.has(p.code)) { best.set(p.code, r); side.set(p.code, sd); }
      }
    }
    const selOpt = selectedKey ? current : null;
    for (const [code, r] of best) {
      const p = PORT_BY_CODE[code];
      const inSel = selOpt && (selOpt.pol?.code === code || selOpt.pod?.code === code);
      const el = document.createElement('div');
      el.dataset.rank = String(r.rank);
      el.dataset.key = r.option.key;
      const c = r.rank === 1 ? theme.colors.rank1 : r.rank <= 3 ? theme.colors.rank23 : theme.colors.rankOther;
      el.innerHTML = `<div style="position:relative"><div class="pr-port${inSel ? ' sel' : ''}${selOpt && !inSel ? ' dim' : ''}" style="--c:${c}"></div>` +
        `<div class="pr-port-label${side.get(code) === 'o' ? ' left' : ''}"${selOpt && !inSel ? ' style="opacity:.4"' : ''}><b>${p.name}</b><span>${p.code} · <em>${usdK(r.option.total)}</em> · #${r.rank}</span></div></div>`;
      el.onclick = (ev) => { ev.stopPropagation(); useAppStore.getState().set({ portCard: code }); };
      el.onmouseenter = () => useAppStore.getState().set({ hoverKey: r.option.key });
      el.onmouseleave = () => useAppStore.getState().set({ hoverKey: null });
      add(el, p.coord);
    }
    // Tuyến đã chọn: eo biển / kênh đào, cảng chuyển tải, cửa khẩu
    if (selectedKey && current && track) {
      if (current.mode === 'sea' && current.route && track.estimated && (showSeaRoute || view3d)) {
        for (const ps of current.route.passages) {
          if (ps.kind === 'line') continue;
          const el = document.createElement('div');
          el.innerHTML = `<div class="pr-pass"><div class="pr-pass-tip">${ps.name}</div></div>`;
          add(el, ps.coord);
        }
      }
      for (const sp of track.stops) {
        const el = document.createElement('div');
        const dates = track.startDate
          ? `Đến ${fmtDateVi(addIso(track.startDate, sp.arrive))} · đi ${fmtDateVi(addIso(track.startDate, sp.depart))}`
          : `Ngày ${sp.arrive.toFixed(1)} → ${sp.depart.toFixed(1)}`;
        el.innerHTML = `<div style="position:relative"><div class="pr-stop"></div><div class="pr-tag" style="position:absolute;top:16px;left:50%;transform:translateX(-50%)">${track.vehicle === 'ship' ? 'Chuyển tải · ' : ''}${sp.name}<span>${dates}</span></div></div>`;
        add(el, sp.coord);
      }
    }
    requestAnimationFrame(() => declutter(map));
  }, [ready, plan, ranked, selectedKey, current, track, showSeaRoute, view3d, portView, theme]);

  /* ───────── Chế độ "Cảng 3D" ───────── */
  useEffect(() => {
    const map = mapHandle.map;
    if (!map || !ready) return;
    const s = st.current;
    const vis = (ids: string[], on: boolean) => ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'));
    if (!portView) {
      vis(PORT_VIEW_LAYERS, false);
      vis(WORLD_LAYERS, true);
      applyTheme(map, latest.current.theme, false);
      setScene(null);
      if (s.prevCam) {
        map.flyTo({ ...s.prevCam, pitch: 0, bearing: 0, duration: 1600 });
        s.prevCam = null;
      }
      return;
    }
    const port = PORT_BY_CODE[portView];
    if (!port) return;
    let cancelled = false;
    if (!s.prevCam) s.prevCam = { center: map.getCenter(), zoom: map.getZoom() };
    vis(WORLD_LAYERS, false);
    vis(PORT_VIEW_LAYERS, true);
    applyTheme(map, latest.current.theme, true);
    setScene(null);
    setSceneBusy(true);
    map.flyTo({ center: port.coord as [number, number], zoom: 14, pitch: 0, bearing: 0, duration: 2200, essential: true });
    const craneField = useDataStore.getState().portInfo[portView]?.cranes?.value;
    const craneCount = craneField ? parseInt(craneField, 10) || undefined : undefined;
    const build = (osm?: LngLat[]) => {
      if (cancelled || !s.grid) return null;
      const sc = buildScene(portView, s.grid, { craneCount, osmCranes: osm });
      setScene(sc);
      return sc;
    };
    const scan = () => {
      if (cancelled) return;
      s.grid = scanPort(map, port.coord);
      const sc = build();
      setSceneBusy(false);
      // Đưa camera về giữa cụm cẩu, nhìn từ phía mặt nước vào bến
      let center = port.coord, bearing = -18;
      if (sc && sc.cranes.length) {
        const n = sc.cranes.length;
        center = [sc.cranes.reduce((a, c) => a + c.pos[0], 0) / n, sc.cranes.reduce((a, c) => a + c.pos[1], 0) / n];
        const sx = sc.cranes.reduce((a, c) => a + Math.sin((c.bearing * Math.PI) / 180), 0), sy = sc.cranes.reduce((a, c) => a + Math.cos((c.bearing * Math.PI) / 180), 0);
        if (Math.hypot(sx, sy) > n * 0.3) bearing = (((Math.atan2(sx, sy) * 180) / Math.PI + 180 + 25 + 540) % 360) - 180;
      }
      map.easeTo({ center: center as [number, number], zoom: 15.2, pitch: 58, bearing, duration: 1800 });
      fetchOsmCranes(portView, port.coord).then((cr) => cr.length >= 3 && build(cr));
    };
    let done = false;
    const once = () => { if (!done) { done = true; scan(); } };
    const onMoveEnd = () => {
      if (map.areTilesLoaded()) setTimeout(once, 150);
      else map.once('idle', once);
    };
    map.once('moveend', onMoveEnd);
    const fallback = setTimeout(once, 9000);
    return () => {
      cancelled = true;
      clearTimeout(fallback);
      map.off('moveend', onMoveEnd);
    };
  }, [ready, portView]);

  /* ───────── Chủ đề màu bản đồ ───────── */
  useEffect(() => {
    const map = mapHandle.map;
    if (!map || !ready) return;
    // đổi giữa nền tự vẽ và nền chi tiết → nạp lại style (style.load sẽ thêm lại lớp và chạy lại effect này)
    if ((theme.basemap === 'liberty') !== st.current.liberty) {
      map.setStyle(styleFor(theme), { diff: false });
      return;
    }
    applyTheme(map, theme, !!portView);
    // nhãn HTML cần đo lại kích thước khi đổi kiểu chữ/nền
    requestAnimationFrame(() => declutter(map));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, theme, styleRev]);

  /* ───────── Mức 2: ảnh thực Google – ẩn lớp OSM khi bật; tắt khi rời chế độ cảng ───────── */
  useEffect(() => {
    const map = mapHandle.map;
    if (!map || !ready) return;
    const on = !!portView && photoreal;
    PORT_VIEW_LAYERS.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', portView && !on ? 'visible' : 'none'));
    if (!on) {
      tileCredits.current.clear();
      setCredits('');
      resetGoogleLayer();
    }
  }, [ready, portView, photoreal, styleRev]);
  useEffect(() => {
    if (!portView) {
      setPhotoreal(false);
      setPhotoMsg(null);
    }
  }, [portView]);

  const sel = selectedKey && current ? current : null;
  const portName = portView ? PORT_BY_CODE[portView]?.name : null;

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: theme.colors.sea, ...(labelVars(theme) as React.CSSProperties) }}>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      <div className="pointer-events-none absolute inset-0">
        {/* Nút điều khiển */}
        <div className="pointer-events-auto absolute top-3 left-3 flex flex-wrap gap-2 pr-[170px] max-[899px]:pr-[100px]">
          {portView ? (
            <>
              <button className="btn btn-on" onClick={() => set({ portView: null })}>← Thoát cảng 3D</button>
              <span className="btn cursor-default">⚓ {portName}{sceneBusy ? ' · đang dựng…' : ''}</span>
              {GOOGLE_KEY && (
                <button
                  className={`btn ${photoreal ? 'btn-on' : ''}`}
                  disabled={photoBusy}
                  title="Google Photorealistic 3D Tiles – tính phí theo lượt dùng, chỉ nạp khi bấm"
                  onClick={async () => {
                    setPhotoMsg(null);
                    if (photoreal) return setPhotoreal(false);
                    setPhotoBusy(true);
                    const r = await preflightGoogleTiles(GOOGLE_KEY);
                    setPhotoBusy(false);
                    if (!r.ok) return setPhotoMsg(`Không tải được ảnh thực Google 3D (${r.error}). Kiểm tra key, Map Tiles API và billing – vẫn dùng bố cục OpenStreetMap.`);
                    rootJson.current = r.rootJson;
                    resetGoogleLayer();
                    setPhotoreal(true);
                  }}
                >
                  📷 {photoBusy ? 'Đang kiểm tra…' : photoreal ? 'Tắt ảnh thực' : 'Ảnh thực'}
                </button>
              )}
            </>
          ) : (
            <>
              {sel && (
                <>
                  <button className={`btn ${view3d ? 'btn-on' : ''}`} onClick={() => set({ view3d: !view3d, follow: false })} title="Chuyển sang quả địa cầu 3D">🌐 {view3d ? 'Về 2D' : 'Xem 3D'}</button>
                  {sel.mode === 'sea' && !view3d && (
                    <button className={`btn ${showSeaRoute ? 'btn-on' : ''}`} onClick={() => set({ showSeaRoute: !showSeaRoute })}>🧭 Đường biển thật</button>
                  )}
                  {view3d && (
                    <button className={`btn ${follow ? 'btn-on' : ''}`} onClick={() => { set({ follow: !follow }); if (!follow) { usePlayback.getState().progress >= 1 && usePlayback.getState().setProgress(0); usePlayback.getState().setPlaying(true); } else mapHandle.map && fitCoords(mapHandle.map, track?.coords ?? [], { globe: true, bottom: 110 }); }}>🎯 Camera bám theo</button>
                  )}
                  <button className="btn" onClick={() => { useAppStore.getState().select(null); set({ view3d: false }); }}>✕ Bỏ chọn</button>
                </>
              )}
              {!sel && plan && <span className="btn cursor-default text-mute max-[899px]:hidden">Rê chuột lên một đường để xem · click để chọn phương án</span>}
            </>
          )}
        </div>

        <MapThemePanel />

        {planning && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 rounded-full border border-line bg-panel/95 px-4 py-1.5 text-xs text-fg shadow-lg">
            ⏳ Đang tính tuyến… {planning.total > 1 ? `${planning.done}/${planning.total}` : ''}
          </div>
        )}

        {portView && photoreal && (
          <>
            {/* Ghi công bắt buộc của Google: logo + bản quyền của các tile đang hiển thị, một dòng ở cuối khung, không bị che */}
            <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent px-3 pt-6 pb-1.5 text-[10.5px] text-white">
              <span className="shrink-0 text-[15px] leading-none font-medium tracking-tight" style={{ fontFamily: 'Arial, sans-serif' }}>
                <span style={{ color: '#4285F4' }}>G</span><span style={{ color: '#EA4335' }}>o</span><span style={{ color: '#FBBC05' }}>o</span><span style={{ color: '#4285F4' }}>g</span><span style={{ color: '#34A853' }}>l</span><span style={{ color: '#EA4335' }}>e</span>
              </span>
              <span className="min-w-0 truncate text-right" title={credits}>{credits || 'Đang tải ảnh thực…'}</span>
            </div>
            <div className="absolute top-14 left-3 max-w-[360px] rounded-lg border border-line bg-panel/90 px-3 py-2 text-[11px] leading-snug text-mute">
              Ảnh thực: Google Photorealistic 3D Tiles. Nếu chỉ thấy hình mờ, khu vực này chưa có ảnh 3D chi tiết – bấm <b className="text-fg">Tắt ảnh thực</b> để quay về bố cục OpenStreetMap.
            </div>
          </>
        )}
        {portView && photoMsg && <div className="absolute top-14 left-3 max-w-[380px] rounded-lg border border-amber-400/40 bg-panel/95 px-3 py-2 text-[11px] text-amber-200">{photoMsg}</div>}
        {portView && !photoreal && (
          <div className="absolute right-3 bottom-3 max-w-[340px] rounded-lg border border-line bg-panel/90 px-3 py-2 text-[11px] leading-snug text-mute">
            Bố cục cảng theo dữ liệu bản đồ (OpenStreetMap); <b className="text-fg">container, cẩu và tàu là hình minh họa</b>.
            {scene && (
              <div className="mt-1 text-[10.5px]">
                {scene.stats.cranes} cẩu ({scene.stats.craneSource === 'osm' ? 'vị trí theo OSM man_made=crane' : 'tự rải dọc mép bến'}) · {scene.stats.stacks} chồng container · {scene.stats.ships} tàu
                {scene.stats.waterCells === 0 && ' · chưa nhận được dữ liệu vùng nước (kiểm tra kết nối mạng)'}
              </div>
            )}
          </div>
        )}

        {/* Chú giải */}
        {plan && !portView && !sel && (
          <div className="absolute bottom-3 left-3 rounded-lg border border-line bg-panel/90 px-3 py-2 text-[11px] text-mute max-[899px]:hidden">
            <div className="flex items-center gap-2"><span className="h-1 w-6 rounded" style={{ background: theme.colors.rank1, boxShadow: `0 0 6px ${theme.colors.rank1}` }} /> Hạng 1</div>
            <div className="flex items-center gap-2"><span className="h-0.5 w-6 rounded" style={{ background: theme.colors.rank23 }} /> Hạng 2–3</div>
            <div className="flex items-center gap-2"><span className="h-px w-6" style={{ background: theme.colors.rankOther }} /> Hạng 4 trở đi</div>
            <div className="flex items-center gap-2"><span className="w-6 border-t border-dashed" style={{ borderColor: theme.colors.inland }} /> Nội địa (kho ↔ cảng)</div>
            <div className="mt-1 max-w-[210px] text-[10px] leading-tight">Đường cong chỉ thể hiện kết nối; quãng đường và thời gian tính theo đường biển thật.</div>
          </div>
        )}

        {sel && track && !portView && <SeaSimulationSummary track={track} />}
        {sel && track && !portView && (
          <div className="pointer-events-auto absolute right-3 bottom-8 left-3">
            <PlaybackBar track={track} />
          </div>
        )}

        {mapError && <div className="absolute top-24 left-1/2 -translate-x-1/2 rounded-lg bg-red-900/80 px-3 py-1.5 text-xs text-red-100">{mapError}</div>}
        {toast && <div className="toast-pop absolute top-14 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-panel px-4 py-2 text-xs text-fg shadow-lg">{toast}</div>}
      </div>
    </div>
  );
}

function addIso(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

/** Ẩn nhãn cảng bị chồng lên nhau (ưu tiên hạng cao) */
export function declutter(map: maplibregl.Map) {
  const els = [...map.getContainer().querySelectorAll<HTMLElement>('[data-rank]')];
  els.sort((a, b) => +a.dataset.rank! - +b.dataset.rank!);
  const kept: DOMRect[] = [];
  for (const el of els) {
    const label = el.querySelector<HTMLElement>('.pr-port-label');
    if (!label) continue;
    label.style.visibility = 'visible';
    const r = label.getBoundingClientRect();
    const hit = kept.some((k) => !(r.right < k.left - 2 || r.left > k.right + 2 || r.bottom < k.top - 1 || r.top > k.bottom + 1));
    if (hit) label.style.visibility = 'hidden';
    else kept.push(r);
  }
}
