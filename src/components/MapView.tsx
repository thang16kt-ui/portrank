import { MapboxOverlay } from '@deck.gl/mapbox';
import maplibregl from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { ANIMATION_CONFIG } from '../config/routing';
import { PORT_BY_CODE, getPort } from '../data/ports';
import { bbox, positionAt } from '../lib/geo';
import { dayAt } from '../lib/transit';
import { useAppStore, usePlayback } from '../store/useAppStore';
import type { PassageHit, RouteResult } from '../types';
import { buildLayers } from './DeckLayers';
import { flag } from './PortCombobox';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/** Map dùng chung (để component khác điều khiển camera) */
export const mapHandle: { map: maplibregl.Map | null } = { map: null };

export function animationSeconds(nm: number) {
  const { minSec, maxSec, nmForMax } = ANIMATION_CONFIG;
  return Math.min(maxSec, Math.max(minSec, minSec + ((maxSec - minSec) * nm) / nmForMax));
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
  });

  /* ───────── Khởi tạo bản đồ ───────── */
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: [105, 14],
      zoom: 1.6,
      attributionControl: { compact: true },
      maxPitch: 75,
    });
    mapHandle.map = map;
    if (import.meta.env.DEV) (window as unknown as { __map: maplibregl.Map }).__map = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'nautical' }), 'bottom-right');

    const overlay = new MapboxOverlay({
      interleaved: true,
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

  /* ───────── Bắt đầu mô phỏng mới: bay camera bao trọn tuyến ───────── */
  useEffect(() => {
    const map = mapHandle.map;
    if (!map || !ready || !sim) return;
    st.current.runStart = performance.now();
    st.current.lastNm = 0;
    st.current.dirty = true;
    fitRoute(map, sim.route);
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
      if (route && pb.playing) {
        const dur = animationSeconds(route.distanceNm);
        const next = pb.progress + (dt * pb.speed) / dur;
        if (next >= 1) {
          pb.setProgress(1);
          pb.setPlaying(false);
        } else pb.setProgress(next);
      }
      const sinceRun = now - s.runStart;
      const animating = (route && pb.playing) || sinceRun < 1600;
      if (!animating && !s.dirty) return;
      s.dirty = false;

      const progress = usePlayback.getState().progress;
      const curNm = route ? progress * route.distanceNm : 0;

      syncPins(map, app, route, curNm, s);

      // popup khi đi qua eo biển / kênh đào
      if (route && app.computed) {
        if (curNm < s.lastNm - 1) s.lastNm = curNm; // tua lại
        for (const p of route.passages) {
          if (p.atNm > s.lastNm && p.atNm <= curNm && pb.playing) showPassagePopup(map, route, p, dayAt(route, p.atNm, app.computed.cargo), s);
        }
        s.lastNm = curNm;
      }

      // camera theo dõi tàu
      if (route && app.follow) {
        const at = positionAt(route.coords, route.cumNm, curNm);
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
  const [a, b, c, d] = bbox(route.coords);
  const w = map.getContainer().clientWidth;
  const pad = Math.min(120, Math.max(40, w * 0.08));
  const isGlobe = useAppStore.getState().mapMode === 'globe';
  const cam = map.cameraForBounds(
    [
      [a, b],
      [c, d],
    ],
    { padding: { top: pad, bottom: pad + 40, left: pad, right: pad } },
  );
  const center: [number, number] = [((a + c) / 2 + 540) % 360 - 180, (b + d) / 2];
  // globe: xoay để tuyến nằm giữa
  // globe ở zoom thấp hiển thị lớn hơn mercator → lùi thêm
  const zoom = Math.min(5, Math.max(isGlobe ? 0.9 : 0.4, (cam?.zoom ?? 2) - (isGlobe ? 0.9 : 0.1)));
  map.flyTo({ center, zoom, pitch: 0, bearing: 0, duration: 1800, essential: true });
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

function syncPins(map: maplibregl.Map, app: ReturnType<typeof useAppStore.getState>, route: RouteResult | null, curNm: number, s: PinState) {
  const polCode = app.sim?.pol ?? app.form.pol;
  const podCode = app.sim?.pod ?? app.form.pod;
  const key = `${polCode}|${podCode}|${app.sim?.runId ?? 0}`;
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
