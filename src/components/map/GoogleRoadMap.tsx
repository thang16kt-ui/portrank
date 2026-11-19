import { useEffect, useMemo, useRef, useState } from 'react';
import { useCurrent } from '../../lib/actions';
import { fmtDrivingDistance, fmtDuration } from '../../lib/format';
import { fetchRoadConfig, type RoadConfig } from '../../providers/RoadProvider';
import { PLAYBACK_SPEEDS, useAppStore, usePlayback, type Speed } from '../../store/useAppStore';
import { journeyPosition, journeyStatus, TRAFFIC_COLORS, type JourneyLeg } from '../../lib/journey';
import { formatSimulationTime } from '../../lib/simulation';
import SimulationReadout from '../SimulationReadout';
import { truckModelMarkup } from './truckModel';

type LatLng = { lat: number; lng: number };
type MapInstance = { fitBounds(bounds: unknown, padding: number): void };
type MapOverlay = { setMap(map: MapInstance | null): void };
type TruckOverlay = MapOverlay & { update(position: LatLng, heading: number): void };
type OverlayBase = MapOverlay & {
  getPanes(): { overlayLayer: HTMLElement } | null;
  getProjection(): { fromLatLngToDivPixel(point: unknown): { x: number; y: number } | null } | undefined;
};
interface MapsLibrary {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Polyline: new (options: Record<string, unknown>) => MapOverlay;
  Marker: new (options: Record<string, unknown>) => MapOverlay;
  OverlayView: new () => OverlayBase;
  LatLng: new (lat: number, lng: number) => unknown;
  LatLngBounds: new () => { extend(point: LatLng): void };
}
type MapsWindow = Window & { google?: { maps: MapsLibrary }; __portrankRoadMapsReady?: () => void };
let mapsPromise: Promise<MapsLibrary> | null = null;

/** A separate Google map is required when displaying Routes API geometry. */
function loadMaps(key: string): Promise<MapsLibrary> {
  const w = window as MapsWindow;
  if (w.google?.maps) return Promise.resolve(w.google.maps);
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise<MapsLibrary>((resolve, reject) => {
    const script = document.createElement('script');
    const cleanup = () => { clearTimeout(timer); delete w.__portrankRoadMapsReady; };
    const fail = () => { cleanup(); script.remove(); reject(new Error('Không tải được bản đồ Google. Bạn vẫn xem được quãng đường và thời gian trong bảng kết quả.')); };
    const timer = setTimeout(fail, 20000);
    w.__portrankRoadMapsReady = () => {
      const maps = w.google?.maps;
      cleanup();
      if (maps) resolve(maps); else fail();
    };
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, callback: '__portrankRoadMapsReady', loading: 'async', v: 'weekly', language: 'vi' })}`;
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch((e) => { mapsPromise = null; throw e; });
  return mapsPromise;
}

function makeTruck(maps: MapsLibrary): TruckOverlay {
  return new class extends maps.OverlayView {
    node = document.createElement('div');
    position: LatLng = { lat: 0, lng: 0 };
    constructor() {
      super();
      this.node.className = 'journey-truck-3d';
      Object.assign(this.node.style, { position: 'absolute', width: '70px', height: '70px', pointerEvents: 'none', zIndex: '10' });
      this.node.innerHTML = truckModelMarkup();
    }
    onAdd() { this.getPanes()?.overlayLayer.appendChild(this.node); }
    onRemove() { this.node.remove(); }
    draw() {
      const p = this.getProjection()?.fromLatLngToDivPixel(new maps.LatLng(this.position.lat, this.position.lng));
      if (p) { this.node.style.left = `${p.x - 35}px`; this.node.style.top = `${p.y - 35}px`; }
    }
    update(position: LatLng, heading: number) {
      this.position = position;
      const truck = this.node.querySelector<HTMLElement>('.truck-heading');
      if (truck) truck.style.transform = `rotateX(48deg) rotateZ(${heading}deg)`;
      this.draw();
    }
  }();
}

export default function GoogleRoadMap() {
  const current = useCurrent();
  const plan = useAppStore((s) => s.plan);
  const error = useAppStore((s) => s.planError);
  const planning = useAppStore((s) => s.planning);
  const progress = usePlayback((s) => s.progress);
  const playing = usePlayback((s) => s.playing);
  const speed = usePlayback((s) => s.speed);
  const ref = useRef<HTMLDivElement>(null);
  const truck = useRef<TruckOverlay | null>(null);
  const [config, setConfig] = useState<RoadConfig | null>(null);
  const [mapState, setMapState] = useState<{ map: MapInstance; maps: MapsLibrary } | null>(null);
  const [mapError, setMapError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [summaryOpen, setSummaryOpen] = useState(false);
  // Google geometry and traffic must only appear on the Google map.
  const option = current?.option.mode === 'road' && current.option.roadDirections?.provider === 'google' ? current.option : null;
  const route = option?.drivingRoute;
  const directions = option?.roadDirections;
  const leg = useMemo<JourneyLeg | null>(() => route ? {
    id: 'road', label: `${plan?.seller.label} → ${plan?.buyer.label}`, vehicle: 'truck', path: route.path,
    durationSeconds: route.durationSeconds, road: route, forecast: directions?.trafficMode === 'forecast',
  } : null, [route, plan?.seller.label, plan?.buyer.label, directions?.trafficMode]);
  const position = useMemo(() => leg ? journeyPosition(leg, progress) : null, [leg, progress]);
  const departure = Date.parse(directions?.departureTime ?? '');
  const status = leg ? journeyStatus(leg, progress, playing, progress >= 1) : 'Chưa có hành trình';
  const mapsUrl = plan ? `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', origin: `${plan.seller.coord[1]},${plan.seller.coord[0]}`, destination: `${plan.buyer.coord[1]},${plan.buyer.coord[0]}`, travelmode: 'driving', avoid: 'ferries' })}` : '';

  useEffect(() => {
    let active = true;
    fetchRoadConfig().then((c) => { if (active) { setConfig(c); setMapError(''); } }, (e) => { if (active) setMapError((e as Error).message); });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    let active = true;
    if (!ref.current || !config?.configured || !config.browserKey) return;
    loadMaps(config.browserKey).then((maps) => {
      if (!active || !ref.current) return;
      const map = new maps.Map(ref.current, { center: { lat: 16, lng: 106 }, zoom: 5,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
      setMapState({ map, maps });
    }).catch((e) => { if (active) setMapError((e as Error).message); });
    return () => { active = false; setMapState(null); };
  }, [config?.configured, config?.browserKey, attempt]);

  useEffect(() => {
    if (!mapState || !route) return;
    const { map, maps } = mapState;
    const path = route.path.map(([lng, lat]) => ({ lat, lng }));
    const overlays: MapOverlay[] = [new maps.Polyline({ map, path, strokeColor: '#64748b', strokeOpacity: 0.9, strokeWeight: 5, geodesic: false })];
    for (const s of route.trafficSections ?? []) {
      overlays.push(new maps.Polyline({ map, path: path.slice(s.startIndex, s.endIndex + 1),
        strokeColor: TRAFFIC_COLORS[s.severity], strokeOpacity: 1, strokeWeight: 6, geodesic: false }));
    }
    overlays.push(new maps.Marker({ map, position: path[0], label: 'A', title: plan?.seller.label }));
    overlays.push(new maps.Marker({ map, position: path.at(-1), label: 'B', title: plan?.buyer.label }));
    const vehicle = makeTruck(maps); vehicle.update(path[0], 0); vehicle.setMap(map); truck.current = vehicle;
    const bounds = new maps.LatLngBounds(); path.forEach((p) => bounds.extend(p)); map.fitBounds(bounds, 90);
    return () => { overlays.forEach((o) => o.setMap(null)); vehicle.setMap(null); if (truck.current === vehicle) truck.current = null; };
  }, [mapState, route, plan?.seller.label, plan?.buyer.label]);

  useEffect(() => {
    if (position && truck.current) truck.current.update({ lat: position.coord[1], lng: position.coord[0] }, position.bearing);
  }, [position, mapState, route]);

  useEffect(() => { usePlayback.getState().setProgress(0); usePlayback.getState().setPlaying(true); }, [route]);
  useEffect(() => {
    if (!route) return;
    let frame = 0, previous = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const elapsed = previous ? Math.min(100, now - previous) : 0; previous = now;
      const state = usePlayback.getState();
      if (!state.playing || document.hidden) return;
      const next = Math.min(1, state.progress + elapsed / 28000 * state.speed);
      state.setProgress(next); if (next === 1) state.setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [route]);

  const message = error || mapError || (config && !config.configured ? 'Chưa cấu hình GOOGLE_ROUTES_API_KEY trên máy chủ.'
    : config && !config.browserKey ? 'Chưa cấu hình GOOGLE_MAPS_BROWSER_KEY để hiển thị tuyến và màu giao thông trên Google Maps.' : '');
  return <div className="relative isolate h-full w-full bg-well">
    <div ref={ref} className="h-full w-full" aria-label="Bản đồ đường bộ Google Maps" />
    {message && <div className="absolute inset-0 flex items-center justify-center bg-well/95 p-6" role="status">
      <div className="max-w-md text-center text-[13px] text-mute"><p>{message}</p>
        <button className="btn mt-3" onClick={() => { setMapError(''); setAttempt((n) => n + 1); }}>Thử lại kết nối</button>
        {route && <a className="mt-3 block text-sky underline" href={mapsUrl} target="_blank" rel="noreferrer">Mở chỉ đường trên Google Maps</a>}
      </div>
    </div>}
    {!message && !route && <div className="journey-summary" role="status">{planning ? 'Đang tìm tuyến…' : 'Chọn hai địa chỉ, ngày giờ khởi hành rồi bấm Tìm tuyến tối ưu.'}</div>}
    {route && <>
      <section className="journey-summary" aria-label="Thông tin hành trình">
        <button className="btn !text-xs" aria-expanded={summaryOpen} aria-controls="google-journey-details" onClick={() => setSummaryOpen((v) => !v)}>{summaryOpen ? '✕ Ẩn thông tin' : 'ⓘ Thông tin hành trình'}</button>
        <div id="google-journey-details" hidden={!summaryOpen}>
          <p>{fmtDrivingDistance(route.distanceMeters)} · {fmtDuration(route.durationSeconds)}</p>
          <p className="text-xs">Xanh: thông thoáng · Vàng: chậm · Đỏ: đông · Xám: chưa có dữ liệu.</p>
          <p className="text-xs">Google Routes · giờ đi {formatSimulationTime(departure)} · {directions?.trafficMode === 'forecast' ? 'yêu cầu theo giờ khởi hành đã chọn' : 'yêu cầu đi ngay'}.</p>
          <p className="text-xs">Màu giao thông do Google cung cấp trên tuyến này; không tự tạo khi thiếu dữ liệu.</p>
        </div>
      </section>
      <section className="journey-controls" aria-label="Điều khiển mô phỏng hành trình">
        <SimulationReadout departureTime={directions?.departureTime} elapsedSeconds={progress * route.durationSeconds} totalSeconds={route.durationSeconds}
          legLabel={leg?.label ?? '—'} status={status} />
        <div className="flex items-center gap-3">
          <button className="btn" aria-label={playing ? 'Tạm dừng hành trình' : 'Phát hành trình'} onClick={() => {
            const state = usePlayback.getState(); if (state.progress >= 1) state.setProgress(0); state.setPlaying(!state.playing);
          }}>{playing ? '⏸' : '▶'}</button>
          <input aria-label="Tiến độ hành trình" type="range" min="0" max="1000" value={Math.round(progress * 1000)} onChange={(e) => usePlayback.getState().setProgress(+e.target.value / 1000)} className="min-w-0 flex-1" />
          <select aria-label="Tốc độ mô phỏng" className="field !w-auto !py-1" value={speed} onChange={(e) => usePlayback.getState().setSpeed(+e.target.value as Speed)}>{PLAYBACK_SPEEDS.map((s) => <option key={s} value={s}>×{s}</option>)}</select>
        </div>
        <p className="mt-1 text-xs opacity-75">Tốc độ xem không thay đổi giờ đến. Chuyển động minh họa; chưa xác nhận hạn chế xe tải.</p>
        {leg?.forecast && <p className="text-xs opacity-75">ETA theo giờ tương lai; chưa xác nhận màu giao thông là dự báo tại từng thời điểm xe đi qua.</p>}
      </section>
    </>}
  </div>;
}
