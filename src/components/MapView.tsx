import { MapboxOverlay } from '@deck.gl/mapbox';
import maplibregl from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { ANIMATION_CONFIG } from '../config/routing';
import { PORT_BY_CODE, getPort } from '../data/ports';
import { bbox, positionAt } from '../lib/geo';
import { dayAt, transitDays } from '../lib/transit';
import { finishOrder, maxArrival, pairKey, positionAtDay, type NetworkRoute } from '../lib/network';
import { useAppStore, usePlayback, type BaseMap } from '../store/useAppStore';
import type { PassageHit, RouteResult } from '../types';
import { buildLayers } from './DeckLayers';
import { flag } from './PortCombobox';

/** Nền bản đồ (OpenFreeMap, không cần API key). 'clean' = tối giản, giúp các đường tuyến nổi bật */
export const STYLES: Record<BaseMap, { url: string; label: string }> = {
  clean: { url: 'https://tiles.openfreemap.org/styles/positron', label: 'Sáng tối giản' },
  detail: { url: 'https://tiles.openfreemap.org/styles/liberty', label: 'Chi tiết' },
  dark: { url: 'https://tiles.openfreemap.org/styles/dark', label: 'Tối' },
};

/** Map dùng chung (để component khác điều khiển camera) */
export const mapHandle: { map: maplibregl.Map | null } = { map: null };

/** Thời lượng hoạt ảnh ở tốc độ x1 cho hành trình `days` ngày */
export function animationSeconds(days: number) {
  const { minSec, maxSec, secPerDay } = ANIMATION_CONFIG;
  return Math.min(maxSec, Math.max(minSec, days * secPerDay));
}

export default function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const mapMode = useAppStore((s) => s.mapMode);
  const sim = useAppStore((s) => s.sim);

  // refs dùng trong vòng lặp hoạt ảnh (tránh re-render React mỗi khung hình)
  const st = useRef({
    overlay: null as MapboxOverlay | null,
    runStart: 0,
    lastNm: 0,
    zoom: 1.6,
    hoverPort: null as string | null,
    shipModelOk: true,
    dirty: true,
    followBearing: 0,
    popup: null as maplibregl.Popup | null,
    popupTimer: 0 as unknown as ReturnType<typeof setTimeout>,
    pins: { key: '', pol: null as maplibregl.Marker | null, pod: null as maplibregl.Marker | null },
    passMarkers: new Map<string, maplibregl.Marker>(),
    passKey: '',
    netMarkers: [] as maplibregl.Marker[],
    netKey: '',
    pendingFit: false,
    styleUrl: STYLES[useAppStore.getState().baseMap].url,
  });

  /* ───────── Khởi tạo bản đồ ───────── */
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: st.current.styleUrl,
      center: [105, 14],
      zoom: 1.6,
      attributionControl: { compact: true },
      maxPitch: 75,
    });
    mapHandle.map = map;
    if (import.meta.env.DEV) Object.assign(window, { __map: map, __store: useAppStore, __pb: usePlayback, __st: st.current });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'nautical' }), 'bottom-right');

    const overlay = new MapboxOverlay({
      interleaved: true,
      pickingRadius: 8,
      layers: [],
      getTooltip: ({ object, layer }) => {
        if (!object || !layer) return null;
        if (layer.id === 'ports') {
          const p = object as (typeof PORT_BY_CODE)[string];
          const target = useAppStore.getState().pickTarget === 'pol' ? 'điểm đi' : 'điểm đến';
          return { html: `<b>${flag(p.country)} ${p.name}</b><br/><span style="opacity:.75">${p.code} · ${p.countryName}</span><br/><span style="font-size:11px;opacity:.7">Click để chọn làm ${target}</span>`, style: tooltipStyle };
        }
        if (layer.id.startsWith('passages')) {
          const p = object as PassageHit;
          const s = useAppStore.getState();
          const day = s.sim ? dayAt(s.sim.route, p.atNm, s.computed?.cargo ?? 'dry') : 0;
          return { html: `<b>${p.name}</b><br/>Ngày thứ ${day.toFixed(1)} · ${Math.round(p.atNm).toLocaleString('vi-VN')} hải lý`, style: tooltipStyle };
        }
        return null;
      },
    });
    st.current.overlay = overlay;

    map.on('style.load', () => {
      try {
        map.setProjection({ type: useAppStore.getState().mapMode });
      } catch (e) {
        console.warn('setProjection', e);
      }
      localizeLabels(map);
      addPortLabels(map);
      st.current.dirty = true;
      map.setSky?.({ 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] } as any);
    });
    map.on('load', () => {
      addPortLabels(map);
      map.addControl(overlay as unknown as maplibregl.IControl);
      setReady(true);
    });
    map.on('error', (e) => {
      const msg = (e as { error?: Error }).error?.message ?? '';
      if (/style|Failed to fetch/i.test(msg) && !map.isStyleLoaded()) setMapError('Không tải được bản đồ nền OpenFreeMap (kiểm tra kết nối mạng).');
    });
    map.on('moveend', () => declutter(map));
    map.on('zoom', () => {
      const z = map.getZoom();
      if ((z >= 3.2) !== (st.current.zoom >= 3.2) || (z > 12) !== (st.current.zoom > 12)) st.current.dirty = true;
      st.current.zoom = z;
    });
    // người dùng kéo bản đồ → tắt chế độ theo dõi tàu
    map.on('dragstart', () => useAppStore.getState().follow && useAppStore.getState().setFollow(false));

    fetch('/models/ship.glb', { method: 'HEAD' })
      .then((r) => {
        st.current.shipModelOk = r.ok;
        st.current.dirty = true;
      })
      .catch(() => (st.current.shipModelOk = false));

    return () => {
      map.remove();
      mapHandle.map = null;
    };
  }, []);

  /* ───────── 2D / 3D ───────── */
  useEffect(() => {
    const map = mapHandle.map;
    if (!map || !ready) return;
    map.setProjection({ type: mapMode });
    if (mapMode === 'mercator' && map.getZoom() < 1.2) map.setZoom(1.2);
    st.current.dirty = true;
  }, [mapMode, ready]);

  /* ───────── Đổi nền bản đồ ───────── */
  const baseMap = useAppStore((s) => s.baseMap);
  useEffect(() => {
    const map = mapHandle.map;
    const url = STYLES[baseMap].url;
    if (!map || !ready || url === st.current.styleUrl) return;
    st.current.styleUrl = url;
    map.setStyle(url);
  }, [baseMap, ready]);

  /* ───────── Bắt đầu mô phỏng mới: bay camera bao trọn tuyến (chờ mạng tuyến sẵn sàng) ───────── */
  useEffect(() => {
    if (!ready || !sim) return;
    st.current.runStart = performance.now();
    st.current.lastNm = 0;
    st.current.dirty = true;
    st.current.pendingFit = true;
  }, [sim?.runId, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ───────── Vòng lặp hoạt ảnh ───────── */
  useEffect(() => {
    if (!ready) return;
    const map = mapHandle.map!;
    let raf = 0;
    let last = performance.now();
    const unsubs = [
      useAppStore.subscribe(() => (st.current.dirty = true)),
      usePlayback.subscribe(() => (st.current.dirty = true)),
    ];

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const app = useAppStore.getState();
      const pb = usePlayback.getState();
      const route = app.sim?.route ?? null;
      const s = st.current;
      const cargo = app.computed?.cargo ?? 'dry';
      const net: NetworkRoute[] | null = app.viewMode === 'network' && app.network.length && app.computed ? app.network : null;
      const totalDays = net ? maxArrival(net) : route ? transitDays(route, cargo) : 0;

      // chờ ~0,4 s cho panel kết quả mở xong (bản đồ đổi kích thước) rồi mới căn khung hình
      if (s.pendingFit && now - s.runStart > 400 && (net || (route && app.viewMode === 'single'))) {
        s.pendingFit = false;
        fitCoords(map, net ? net.flatMap((r) => r.route.coords) : route!.coords);
      }

      if ((route || net) && pb.playing) {
        const next = pb.progress + (dt * pb.speed) / animationSeconds(totalDays);
        if (next >= 1) {
          pb.setProgress(1);
          pb.setPlaying(false);
        } else pb.setProgress(next);
      }
      const sinceRun = now - s.runStart;
      const animating = ((route || net) && pb.playing) || sinceRun < 1600;
      if (!animating && !s.dirty) return;
      s.dirty = false;

      const progress = usePlayback.getState().progress;
      const curDay = progress * totalDays;
      const curNm = route ? progress * route.distanceNm : 0;
      const selectedKey = app.sim ? pairKey(app.sim.pol, app.sim.pod) : null;

      syncPins(map, app, net ? null : route, curNm, s, net ? { pol: app.computed!.pol, pod: app.computed!.pod } : null);
      syncNetworkLabels(map, net, curDay, app.labelMode, app.hoverKey, selectedKey, app.computed?.pol ?? null, app.computed?.pod ?? null, s);

      // popup khi đi qua eo biển / kênh đào (chế độ một tuyến)
      if (!net && route && app.computed) {
        if (curNm < s.lastNm - 1) s.lastNm = curNm; // tua lại
        for (const p of route.passages) {
          if (p.atNm > s.lastNm && p.atNm <= curNm && pb.playing) showPassagePopup(map, route, p, dayAt(route, p.atNm, cargo), s);
        }
        s.lastNm = curNm;
      }

      // camera theo dõi tàu (mạng tuyến: theo tuyến đang chọn)
      const followRoute = net ? net.find((r) => r.key === selectedKey) ?? net[0] : null;
      if ((route || followRoute) && app.follow) {
        const at = followRoute ? positionAtDayRoute(followRoute, curDay) : positionAt(route!.coords, route!.cumNm, curNm);
        let db = at.bearing - s.followBearing;
        if (db > 180) db -= 360;
        if (db < -180) db += 360;
        s.followBearing = (s.followBearing + db * Math.min(1, dt * 2) + 360) % 360;
        map.jumpTo({ center: at.pos as [number, number], zoom: Math.max(3.6, Math.min(map.getZoom(), 5)), pitch: 55, bearing: s.followBearing });
      }

      s.overlay?.setProps({
        layers: buildLayers({
          polCode: app.sim?.pol ?? app.form.pol,
          podCode: app.sim?.pod ?? app.form.pod,
          pickTarget: app.pickTarget,
          route,
          routeKey: app.sim ? `${app.sim.pol}-${app.sim.pod}-${app.sim.runId}` : 'none',
          progress,
          zoom: s.zoom,
          ship3d: true,
          shipModelOk: s.shipModelOk,
          hoverPort: s.hoverPort,
          network: net ?? undefined,
          curDay,
          maxDays: totalDays,
          hoverKey: app.hoverKey,
          selectedKey,
          onRouteHover: (key) => {
            if (key !== useAppStore.getState().hoverKey) {
              useAppStore.getState().setHoverKey(key);
              map.getCanvas().style.cursor = key ? 'pointer' : '';
            }
          },
          onRouteClick: (r) => useAppStore.getState().selectPair(r.candidate.pol.code, r.candidate.pod.code, r.route),
          onPortClick: (code) => {
            const a = useAppStore.getState();
            a.setPort(a.pickTarget, code);
            const p = getPort(code);
            a.showToast(`Đã chọn ${p?.name} làm ${a.pickTarget === 'pol' ? 'cảng đi' : 'cảng đến'}`);
          },
          onPortHover: (code) => {
            if (code !== s.hoverPort) {
              s.hoverPort = code;
              s.dirty = true;
              map.getCanvas().style.cursor = code ? 'pointer' : '';
            }
          },
        }),
      });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      unsubs.forEach((u) => u());
    };
  }, [ready]);

  return (
    <div className="absolute inset-0 bg-[#0b1d33]">
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      {!ready && !mapError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-blue-100">Đang tải bản đồ…</div>
      )}
      {mapError && <div className="absolute inset-x-4 top-16 rounded-lg bg-red-600/90 p-3 text-sm text-white">{mapError}</div>}
    </div>
  );
}

const tooltipStyle = {
  background: 'rgba(15,23,42,.92)',
  color: '#fff',
  borderRadius: '8px',
  padding: '6px 10px',
  fontSize: '12px',
  fontFamily: 'Be Vietnam Pro, sans-serif',
  lineHeight: '1.45',
};

export function fitRoute(map: maplibregl.Map, route: RouteResult) {
  fitCoords(map, route.coords);
}

export function fitCoords(map: maplibregl.Map, coords: RouteResult['coords']) {
  // panel kết quả vừa mở có thể làm khung bản đồ đổi kích thước → cập nhật trước khi căn
  map.resize();
  const [a, b, c, d] = bbox(coords);
  const el = map.getContainer();
  const W = el.clientWidth, H = el.clientHeight;
  const isGlobe = useAppStore.getState().mapMode === 'globe';
  // phần màn hình bị che: thanh công cụ trên, thanh tiến trình dưới
  const pad = { top: 70, bottom: 110, left: 30, right: 60 };
  const availW = Math.max(120, W - pad.left - pad.right), availH = Math.max(120, H - pad.top - pad.bottom);
  const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360));
  const yb = mercY(b), yd = mercY(d);
  const spanLon = Math.max(0.5, c - a), spanY = Math.max(0.01, yd - yb);
  let zoom = Math.log2(Math.min((availW * 360) / (spanLon * 512), (availH * 2 * Math.PI) / (spanY * 512)));
  // dời tâm xuống để vùng tuyến nằm giữa phần màn hình không bị che
  const pxPerRad = (512 * 2 ** zoom) / (2 * Math.PI);
  const yCenter = (yb + yd) / 2 - (pad.bottom - pad.top) / 2 / pxPerRad;
  const lat = (Math.atan(Math.sinh(yCenter)) * 180) / Math.PI;
  const lon = ((((a + c) / 2 + (pad.right - pad.left) / 2 / pxPerRad * (180 / Math.PI)) + 540) % 360) - 180;
  zoom = isGlobe ? Math.min(5, Math.max(1.2, zoom - 0.15)) : Math.min(6, Math.max(0.4, zoom));
  map.flyTo({ center: isGlobe ? [((a + c) / 2 + 540) % 360 - 180, (b + d) / 2] : [lon, lat], zoom, pitch: 0, bearing: 0, duration: 1600, essential: true });
}

function showPassagePopup(map: maplibregl.Map, route: RouteResult, p: PassageHit, day: number, s: { popup: maplibregl.Popup | null; popupTimer: ReturnType<typeof setTimeout> }) {
  const pos = positionAt(route.coords, route.cumNm, p.atNm).pos;
  s.popup?.remove();
  clearTimeout(s.popupTimer);
  const icon = p.kind === 'canal' ? '🛳️' : p.kind === 'cape' ? '🌊' : '⚓';
  s.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 22, className: 'passage-popup' })
    .setLngLat(pos as [number, number])
    .setHTML(`<div style="font-family:Be Vietnam Pro,sans-serif;font-size:12px"><b>${icon} ${p.name}</b><br/>Ngày thứ ${day.toFixed(1)} · ${Math.round(p.atNm).toLocaleString('vi-VN')} hải lý</div>`)
    .addTo(map);
  s.popupTimer = setTimeout(() => s.popup?.remove(), 2600);
}

/** Ưu tiên tên tiếng Việt / Latin cho nhãn bản đồ nền */
function localizeLabels(map: maplibregl.Map) {
  const style = map.getStyle();
  for (const layer of style?.layers ?? []) {
    if (layer.type !== 'symbol') continue;
    const tf = map.getLayoutProperty(layer.id, 'text-field');
    if (!tf) continue;
    const s = JSON.stringify(tf);
    if (!s.includes('name')) continue;
    try {
      map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:vi'], ['get', 'name:latin'], ['get', 'name_en'], ['get', 'name']]);
    } catch {
      /* bỏ qua */
    }
  }
}

/* ───────────── Ghim POL/POD & eo biển (marker HTML – hiển thị tốt cả globe lẫn 2D) ───────────── */

type PinState = {
  pins: { key: string; pol: maplibregl.Marker | null; pod: maplibregl.Marker | null };
  passMarkers: Map<string, maplibregl.Marker>;
  passKey: string;
};

function pinEl(kind: 'pol' | 'pod', name: string, code: string, animate: boolean, delayMs: number) {
  const el = document.createElement('div');
  el.className = `pr-pin pr-pin-${kind}${animate ? ' pr-drop' : ''}`;
  el.style.animationDelay = `${delayMs}ms`;
  el.innerHTML = `<svg width="34" height="45" viewBox="0 0 64 84" aria-hidden="true"><path d="M32 80C32 80 8 50 8 30a24 24 0 1 1 48 0c0 20-24 50-24 50z" fill="${kind === 'pol' ? '#2563eb' : '#f97316'}" stroke="#fff" stroke-width="5"/><circle cx="32" cy="30" r="10" fill="#fff"/></svg><div class="pr-pin-label"><b>${name}</b><span>${code} · ${kind === 'pol' ? 'Cảng đi' : 'Cảng đến'}</span></div>`;
  return el;
}

function syncPins(map: maplibregl.Map, app: ReturnType<typeof useAppStore.getState>, route: RouteResult | null, curNm: number, s: PinState, fixed: { pol: string | null; pod: string | null } | null) {
  const polCode = fixed ? fixed.pol : app.sim?.pol ?? app.form.pol;
  const podCode = fixed ? fixed.pod : app.sim?.pod ?? app.form.pod;
  const key = `${polCode}|${podCode}|${app.sim?.runId ?? 0}|${fixed ? 'net' : 'one'}`;
  if (key !== s.pins.key) {
    const animate = !!app.sim && s.pins.key.split('|')[2] !== String(app.sim.runId);
    s.pins.key = key;
    s.pins.pol?.remove();
    s.pins.pod?.remove();
    s.pins.pol = s.pins.pod = null;
    const pol = getPort(polCode), pod = getPort(podCode);
    const routeOk = route && app.sim && app.sim.pol === polCode && app.sim.pod === podCode;
    if (pol) s.pins.pol = new maplibregl.Marker({ element: pinEl('pol', pol.name, pol.code, animate, 0), anchor: 'bottom', opacityWhenCovered: '0' }).setLngLat((routeOk ? route!.coords[0] : pol.coord) as [number, number]).addTo(map);
    if (pod) s.pins.pod = new maplibregl.Marker({ element: pinEl('pod', pod.name, pod.code, animate, 250), anchor: 'bottom', opacityWhenCovered: '0' }).setLngLat((routeOk ? route!.coords[route!.coords.length - 1] : pod.coord) as [number, number]).addTo(map);
  }
  // ghim xám tại eo biển/kênh đào đã đi qua
  const passed = route ? route.passages.filter((p) => p.atNm <= curNm + 1) : [];
  const pkey = `${key}|${passed.map((p) => p.id).join(',')}`;
  if (pkey === s.passKey) return;
  s.passKey = pkey;
  const want = new Set(passed.map((p) => p.id));
  for (const [id, m] of s.passMarkers) if (!want.has(id as never)) { m.remove(); s.passMarkers.delete(id); }
  for (const p of passed) {
    if (s.passMarkers.has(p.id)) continue;
    const el = document.createElement('div');
    el.className = 'pr-pass pr-drop-small';
    const cargo = app.computed?.cargo ?? 'dry';
    const day = route ? dayAt(route, p.atNm, cargo) : 0;
    el.title = `${p.name} · ngày ${day.toFixed(1)}`;
    el.innerHTML = `<svg width="18" height="24" viewBox="0 0 40 52" aria-hidden="true"><path d="M20 50C20 50 4 31 4 19a16 16 0 1 1 32 0c0 12-16 31-16 31z" fill="#64748b" stroke="#fff" stroke-width="4"/><circle cx="20" cy="19" r="6" fill="#fff"/></svg><div class="pr-pass-tip">${p.name}<br/><span>Ngày ${day.toFixed(1)} · ${Math.round(p.atNm).toLocaleString('vi-VN')} hải lý</span></div>`;
    const pos = positionAt(route!.coords, route!.cumNm, p.atNm).pos;
    s.passMarkers.set(p.id, new maplibregl.Marker({ element: el, anchor: 'bottom', opacityWhenCovered: '0' }).setLngLat(pos as [number, number]).addTo(map));
  }
}

/** Nhãn tên cảng (lớp symbol của MapLibre, hiện khi zoom ≥ 3.2) */
function addPortLabels(map: maplibregl.Map) {
  if (map.getSource('pr-ports')) return;
  map.addSource('pr-ports', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: Object.values(PORT_BY_CODE).map((p) => ({ type: 'Feature', properties: { name: p.name, code: p.code }, geometry: { type: 'Point', coordinates: p.coord } })),
    },
  });
  map.addLayer({
    id: 'pr-port-labels',
    type: 'symbol',
    source: 'pr-ports',
    minzoom: 3.2,
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true },
    paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
  });
}

/* ───────────── V2: nhãn trên đường (thời gian / chi phí) + nhãn cảng lân cận ───────────── */

function positionAtDayRoute(r: NetworkRoute, day: number) {
  return positionAtDay(r, day);
}

type NetState = { netMarkers: maplibregl.Marker[]; netKey: string };

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function syncNetworkLabels(
  map: maplibregl.Map,
  net: NetworkRoute[] | null,
  curDay: number,
  mode: 'all' | 'top5' | 'none',
  hoverKey: string | null,
  selectedKey: string | null,
  mainPol: string | null,
  mainPod: string | null,
  s: NetState,
) {
  const order = net ? finishOrder(net) : new Map<string, number>();
  const arrived = net ? net.filter((r) => r.arrivalDays <= curDay + 1e-6).map((r) => r.key) : [];
  const key = net ? `${net.map((r) => r.key).join(',')}|${mode}|${hoverKey}|${selectedKey}|${arrived.join(',')}` : '';
  if (key === s.netKey) return;
  s.netKey = key;
  s.netMarkers.forEach((m) => m.remove());
  s.netMarkers = [];
  if (!net) return;
  const opts = { opacityWhenCovered: '0' } as const;

  // nhãn cảng lân cận (cảng thay thế quanh A và B)
  const seen = new Set<string>([mainPol ?? '', mainPod ?? '']);
  for (const r of net) {
    for (const [p, side] of [[r.candidate.pol, 'pol'], [r.candidate.pod, 'pod']] as const) {
      if (seen.has(p.code)) continue;
      seen.add(p.code);
      const el = document.createElement('div');
      el.className = `nr-port nr-port-${side}`;
      el.innerHTML = `<i></i><span>${p.name}</span>`;
      s.netMarkers.push(new maplibregl.Marker({ element: el, anchor: 'left', ...opts }).setLngLat(p.coord).addTo(map));
    }
  }

  if (mode === 'none') return;
  const shown = mode === 'top5' ? net.slice(0, 5) : net;
  for (const r of shown) {
    const c = r.candidate;
    const el = document.createElement('div');
    const done = arrived.includes(r.key);
    el.className = `nr-pill${hoverKey && hoverKey !== r.key ? ' nr-dim' : ''}${hoverKey === r.key || selectedKey === r.key ? ' nr-hl' : ''}`;
    el.style.setProperty('--c', r.hex);
    el.innerHTML = `<span class="nr-rank">${r.rank}</span><span class="nr-body"><span class="nr-title">${c.pol.name} → ${c.pod.name}</span><span class="nr-main">${r.arrivalDays.toFixed(1)} ngày · ${money(c.cost)}</span><span class="nr-sub">${Math.round(c.route.distanceNm).toLocaleString('vi-VN')} hải lý</span></span>${done ? `<span class="nr-flag">🏁${order.get(r.key)}</span>` : ''}`;
    el.title = 'Click để xem chi tiết tuyến này';
    el.addEventListener('mouseenter', () => useAppStore.getState().setHoverKey(r.key));
    el.addEventListener('mouseleave', () => useAppStore.getState().setHoverKey(null));
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      useAppStore.getState().selectPair(c.pol.code, c.pod.code, c.route);
    });
    el.dataset.prio = String(hoverKey === r.key || selectedKey === r.key ? 0 : r.rank);
    // so le trên / dưới đường để nhãn các tuyến chạy chung ít đè nhau
    const up = r.rank % 2 === 1;
    el.dataset.up = up ? '1' : '0';
    s.netMarkers.push(new maplibregl.Marker({ element: el, anchor: up ? 'bottom' : 'top', offset: [0, up ? -6 : 6], ...opts }).setLngLat(r.labelPos as [number, number]).addTo(map));
  }
  requestAnimationFrame(() => declutter(map));
}

/** Ẩn nhãn tuyến bị chồng lên nhau – giữ nhãn ưu tiên cao (đang chọn/rê chuột, rồi theo hạng) */
export function declutter(map: maplibregl.Map) {
  const pills = Array.from(map.getContainer().querySelectorAll<HTMLElement>('.nr-pill'));
  pills.sort((a, b) => Number(a.dataset.prio) - Number(b.dataset.prio));
  const placed: DOMRect[] = [];
  const overlaps = (r: DOMRect) => placed.some((p) => r.left < p.right + 4 && r.right > p.left - 4 && r.top < p.bottom + 3 && r.bottom > p.top - 3);
  for (const el of pills) {
    el.style.visibility = 'visible';
    el.style.marginTop = '0px';
    let r = el.getBoundingClientRect();
    if (overlaps(r)) {
      // thử lật sang phía bên kia của đường
      const up = Number(el.dataset.up) === 1;
      el.style.marginTop = `${up ? r.height + 12 : -(r.height + 12)}px`;
      r = el.getBoundingClientRect();
    }
    if (overlaps(r)) el.style.visibility = 'hidden';
    else placed.push(r);
  }
}
