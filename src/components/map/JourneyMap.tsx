import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as LeafletMap, LayerGroup, Marker, LatLngTuple, TileLayer } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useCurrent, useSchedule } from '../../lib/actions';
import { fmtDrivingDistance, fmtDuration } from '../../lib/format';
import { unwrapLongitudes } from '../../lib/geo';
import { journeyPosition, journeyStage, TRAFFIC_COLORS, type JourneyLeg } from '../../lib/journey';
import { getTrack } from '../../lib/actions';
import { ServerRoadProvider, type RoadDirections } from '../../providers/RoadProvider';
import { PLAYBACK_SPEEDS, useAppStore, usePlayback, type Speed } from '../../store/useAppStore';
import type { Place, Port } from '../../types';
import { truckModelMarkup } from './truckModel';

type LegState = { origin?: RoadDirections; destination?: RoadDirections; error?: string; loading: boolean };
const REFRESH_MS = 120000;
const toPort = (p: Port): Place => ({ kind: 'address', coord: p.coord, label: p.name, country: p.country, countryName: p.countryName });
const latLngs = (leg: JourneyLeg): LatLngTuple[] => unwrapLongitudes(leg.path).map(([lng, lat]) => [lat, lng]);

export default function JourneyMap() {
  const holder = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [inland, setInland] = useState<LegState>({ loading: false });
  const [roadLive, setRoadLive] = useState<RoadDirections | null>(null);
  const [trafficOn, setTrafficOn] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [trafficReady, setTrafficReady] = useState(false);
  const [trafficError, setTrafficError] = useState('');
  const [trafficAt, setTrafficAt] = useState('');
  const [routeError, setRouteError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [mapError, setMapError] = useState('');
  const [followStages, setFollowStages] = useState(true);
  const plan = useAppStore((s) => s.plan);
  const planning = useAppStore((s) => s.planning);
  const planError = useAppStore((s) => s.planError);
  const current = useCurrent();
  const schedule = useSchedule();
  const option = current?.option;
  const road = option?.mode === 'road';
  const optionKey = option?.key;
  const route = roadLive?.routes.find((r) => r.id === option?.drivingRoute?.id) ?? option?.drivingRoute;
  const progress = usePlayback((s) => s.progress);
  const playing = usePlayback((s) => s.playing);
  const speed = usePlayback((s) => s.speed);
  const leaflet = useRef<typeof import('leaflet') | null>(null);
  const liveMap = useRef<LeafletMap | null>(null);
  const routeGroup = useRef<LayerGroup | null>(null);
  const marker = useRef<Marker | null>(null);
  const lastVehicle = useRef('');

  useEffect(() => {
    let alive = true;
    fetch('/api/traffic/config', { cache: 'no-store' }).then((r) => r.json()).then((c) => {
      if (alive) setTrafficReady(c.configured === true);
    }).catch(() => { if (alive) setTrafficReady(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!trafficReady) return;
    const timer = setInterval(() => { if (!document.hidden) setRefresh((n) => n + 1); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [trafficReady]);

  useEffect(() => {
    let alive = true;
    let instance: LeafletMap | undefined;
    let observer: ResizeObserver | undefined;
    import('leaflet').then((L) => {
      if (!alive || !holder.current) return;
      leaflet.current = L;
      instance = L.map(holder.current, { preferCanvas: true, zoomControl: false }).setView([16, 106], 5);
      liveMap.current = instance;
      L.control.zoom({ position: 'topright' }).addTo(instance);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
      }).on('tileerror', () => { if (alive) setMapError('Một số mảnh bản đồ nền chưa tải được.'); }).addTo(instance);
      observer = new ResizeObserver(() => instance?.invalidateSize());
      observer.observe(holder.current);
      setMap(instance);
    }).catch(() => { if (alive) setMapError('Không tải được bản đồ hành trình.'); });
    return () => { alive = false; liveMap.current = null; observer?.disconnect(); instance?.remove(); marker.current = null; lastVehicle.current = ''; };
  }, []);

  useEffect(() => {
    if (!map || map !== liveMap.current || !trafficReady || !trafficOn || !leaflet.current) return;
    const L = leaflet.current;
    let layer: TileLayer | null = L.tileLayer(`/api/traffic/tiles/{z}/{x}/{y}.png?v=${Math.floor(Date.now() / REFRESH_MS)}`, {
      minZoom: 7, maxZoom: 19, maxNativeZoom: 18, opacity: 0.85, updateWhenIdle: true,
      attribution: 'Traffic &copy; TomTom', zIndex: 250,
    }).on('tileload', () => { setTrafficError(''); setTrafficAt(new Date().toISOString()); })
      .on('tileerror', () => setTrafficError('Chưa tải được màu giao thông ở khung nhìn này.')).addTo(map);
    return () => { layer?.remove(); layer = null; };
  }, [map, trafficReady, trafficOn, refresh]);

  useEffect(() => {
    let alive = true;
    setRoadLive(null); setRouteError('');
    if (!plan || !option || road || !trafficReady) { setInland({ loading: false }); return; }
    const { seller, buyer } = plan;
    const pol = option.pol, pod = option.pod;
    if (!pol || !pod) return;
    setInland({ loading: true });
    const lookup = async (a: Place, b: Place) => ServerRoadProvider.lookup({ origin: a, destination: b });
    Promise.allSettled([
      seller.kind === 'address' ? lookup(seller, toPort(pol)) : Promise.resolve(undefined),
      buyer.kind === 'address' ? lookup(toPort(pod), buyer) : Promise.resolve(undefined),
    ]).then(([a, b]) => {
      if (!alive) return;
      // Do not let Google-only geometry enter this OSM map after a provider configuration change.
      const result = (r: PromiseSettledResult<RoadDirections | undefined>) => r.status === 'fulfilled' && r.value?.provider !== 'google' ? r.value : undefined;
      const errors = [a, b].flatMap((r) => r.status === 'rejected' ? [(r.reason as Error).message] : []);
      setInland({ origin: result(a), destination: result(b), loading: false, error: errors.join(' ') || undefined });
    });
    return () => { alive = false; };
  }, [plan, optionKey, road, trafficReady, refresh]);

  useEffect(() => {
    if (!road || !plan || option?.roadDirections?.provider !== 'tomtom' || !refresh || plan.input.roadDepartureTime) return;
    let alive = true;
    ServerRoadProvider.lookup({ origin: plan.seller, destination: plan.buyer, via: plan.input.roadVia }).then((r) => {
      if (alive && r.provider === 'tomtom') { setRoadLive(r); setRouteError(''); }
    }).catch((e: Error) => { if (alive) setRouteError(`Chưa cập nhật được tuyến: ${e.message}`); });
    return () => { alive = false; };
  }, [road, plan, optionKey, refresh, option?.roadDirections?.provider]);

  const legs = useMemo<JourneyLeg[]>(() => {
    if (!plan || !option) return [];
    if (road) return route && option.roadDirections?.provider !== 'google' ? [{ id: 'road', label: `${plan.seller.label} → ${plan.buyer.label}`, vehicle: 'truck', path: route.path,
      durationSeconds: route.durationSeconds, road: route, fetchedAt: roadLive?.fetchedAt ?? option.roadDirections?.fetchedAt,
      forecast: option.roadDirections?.trafficMode === 'forecast' }] : [];
    const out: JourneyLeg[] = [];
    const first = inland.origin?.routes[0], last = inland.destination?.routes[0];
    if (first) out.push({ id: 'origin', label: `Thành phố đi → ${option.pol?.name}`, vehicle: 'truck', path: first.path, durationSeconds: first.durationSeconds, road: first, fetchedAt: inland.origin?.fetchedAt });
    const sea = getTrack(option, schedule);
    if (sea) out.push({ id: 'sea', label: `${option.pol?.name} → ${option.pod?.name}`, vehicle: 'ship', path: sea.coords, durationSeconds: sea.total * 86400 });
    if (last) out.push({ id: 'destination', label: `${option.pod?.name} → thành phố đến`, vehicle: 'truck', path: last.path, durationSeconds: last.durationSeconds, road: last, fetchedAt: inland.destination?.fetchedAt });
    return out;
  }, [plan, option, road, route, roadLive, inland, schedule]);

  const missingLeg = !road && !!plan && ((plan.seller.kind === 'address' && !inland.origin) || (plan.buyer.kind === 'address' && !inland.destination));
  const animationReady = !!legs.length && !missingLeg && !inland.loading;
  const stage = journeyStage(legs, progress);
  const lastFit = useRef('');
  const stageLeg = stage?.leg;

  useEffect(() => {
    if (!map || map !== liveMap.current || !stageLeg || !animationReady || !followStages || !leaflet.current) return;
    map.fitBounds(leaflet.current.latLngBounds(latLngs(stageLeg)), { paddingTopLeft: [35, summaryOpen ? 150 : 55], paddingBottomRight: [35, 145], maxZoom: 14, animate: false });
  }, [map, stageLeg, animationReady, followStages, summaryOpen]);

  useEffect(() => {
    if (!map || map !== liveMap.current || !leaflet.current) return;
    const L = leaflet.current;
    routeGroup.current?.remove();
    const group = L.layerGroup().addTo(map); routeGroup.current = group;
    const all: LatLngTuple[] = [];
    legs.forEach((leg) => {
      const path = latLngs(leg); all.push(...path);
      L.polyline(path, { color: '#fff', weight: 7, opacity: 0.75 }).addTo(group);
      L.polyline(path, { color: leg.vehicle === 'ship' ? '#06b6d4' : '#2563eb', weight: 4, opacity: 0.8, dashArray: leg.vehicle === 'ship' ? '8 5' : undefined, smoothFactor: 0 }).addTo(group);
      for (const section of leg.road?.trafficSections ?? []) {
        L.polyline(path.slice(section.startIndex, section.endIndex + 1), { color: TRAFFIC_COLORS[section.severity], weight: 6, smoothFactor: 0 }).addTo(group);
      }
      [path[0], path.at(-1)!].forEach((p, i) => {
        const label = document.createElement('span'); label.textContent = `${i ? 'Đến' : 'Đi'} · ${leg.label}`;
        L.circleMarker(p, { radius: 6, weight: 2, color: '#fff', fillColor: leg.vehicle === 'ship' ? '#0891b2' : '#2563eb', fillOpacity: 1 }).bindTooltip(label).addTo(group);
      });
    });
    const signature = `${plan?.seller.coord.join(',')}:${plan?.buyer.coord.join(',')}:${optionKey}:${legs.map((l) => l.id).join(',')}`;
    if (all.length && (!animationReady || !followStages) && (lastFit.current !== signature || !followStages)) {
      map.fitBounds(L.latLngBounds(all), { paddingTopLeft: [40, 145], paddingBottomRight: [40, 110], maxZoom: 14 });
      lastFit.current = signature;
    }
    return () => { group.remove(); };
  }, [map, legs, plan, optionKey, animationReady, followStages]);

  useEffect(() => { usePlayback.getState().setProgress(0); usePlayback.getState().setPlaying(true); }, [plan, optionKey]);
  useEffect(() => {
    if (!animationReady) return;
    let frame = 0, previous = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const state = usePlayback.getState(), elapsed = previous ? Math.min(100, now - previous) : 0; previous = now;
      if (!state.playing || document.hidden) return;
      const p = Math.min(1, state.progress + elapsed / (road ? 28000 : 60000) * state.speed);
      state.setProgress(p); if (p === 1) state.setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animationReady, road]);

  useEffect(() => {
    if (!map || map !== liveMap.current || !stage || !animationReady || !leaflet.current) { marker.current?.remove(); marker.current = null; lastVehicle.current = ''; return; }
    const L = leaflet.current, at = journeyPosition(stage.leg, stage.progress);
    if (!marker.current || lastVehicle.current !== stage.leg.vehicle) {
      marker.current?.remove();
      marker.current = L.marker([at.coord[1], at.coord[0]], { interactive: false, zIndexOffset: 1000,
        icon: L.divIcon({ className: stage.leg.vehicle === 'truck' ? 'journey-truck-3d' : 'journey-vehicle', html: stage.leg.vehicle === 'truck' ? truckModelMarkup() : '<span aria-hidden="true">🚢</span>', iconSize: [70, 70], iconAnchor: [35, 35] }) }).addTo(map);
      lastVehicle.current = stage.leg.vehicle;
    } else marker.current.setLatLng([at.coord[1], at.coord[0]]);
    const heading = marker.current.getElement()?.querySelector<HTMLElement>('.truck-heading');
    if (heading) heading.style.transform = `rotateX(48deg) rotateZ(${at.bearing}deg)`;
  }, [map, stage, animationReady]);

  const fetchedAt = legs.filter((l) => l.vehicle === 'truck').map((l) => l.fetchedAt).filter(Boolean).sort().at(-1);
  const source = option?.roadDirections?.provider === 'osrm' ? 'OSRM' : 'TomTom';
  return <div className="relative isolate h-full w-full bg-well">
    <div ref={holder} className="h-full w-full" aria-label="Bản đồ hành trình xe tải và tàu biển" />
    <section className="journey-summary" aria-label="Thông tin hành trình">
      <button className="btn !text-xs" aria-expanded={summaryOpen} aria-controls="journey-summary-details" onClick={() => setSummaryOpen((open) => !open)}>{summaryOpen ? '✕ Ẩn thông tin' : 'ⓘ Thông tin hành trình'}</button>
      <div id="journey-summary-details" hidden={!summaryOpen}>
      <div className="flex items-center justify-between gap-2"><strong>{road ? '🚚 Hành trình đường bộ' : '🚚 Thành phố · 🚢 Cảng · 🚚 Thành phố'}</strong>
        {trafficReady && <button className="btn !text-xs" aria-pressed={trafficOn} onClick={() => setTrafficOn((on) => !on)}>{trafficOn ? 'Ẩn giao thông' : 'Hiện giao thông'}</button>}</div>
      {road && route && <p className="mt-1 font-semibold">{fmtDrivingDistance(route.distanceMeters)} · {fmtDuration(route.durationSeconds)} · {source}</p>}
      {road && roadLive && <p className="mt-1 text-xs">ETA trên bản đồ vừa cập nhật. Bấm Tìm tuyến tối ưu để tính lại báo giá theo tuyến mới nhất.</p>}
      {!option && <p className="mt-1">{planning ? 'Đang tìm tuyến…' : planError || 'Chọn hai thành phố rồi bấm Tìm tuyến tối ưu.'}</p>}
      {inland.loading && <p className="mt-1" role="status">Đang lấy tuyến đường bộ hai đầu cảng…</p>}
      {(inland.error || routeError || mapError || trafficError) && <p className="mt-1 text-amber-600" role="status">{inland.error || routeError || trafficError || mapError}</p>}
      {missingLeg && !inland.loading && <p className="mt-1 text-amber-600">Chưa đủ tuyến đường bộ để phát trọn hành trình xe–tàu–xe.</p>}
      {!road && plan && option && ((option.pol && option.pol.country !== plan.seller.country) || (option.pod && option.pod.country !== plan.buyer.country)) && <p className="mt-1 text-xs font-semibold text-amber-700">Có chặng xe qua biên giới do chọn cảng nước khác. Cần xác nhận cửa khẩu, quyền quá cảnh và chi phí thủ tục.</p>}
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs"><span>🟢 Thông thoáng</span><span>🟠 Chậm</span><span>🔴 Kẹt xe</span><span>🔵 Tuyến đã chọn</span></div>
      <p className="mt-1 text-xs opacity-75">{trafficReady ? 'Giao thông TomTom hiện tại · cập nhật mỗi 2 phút khi mở trang.' : 'Chưa bật dữ liệu giao thông trên máy chủ.'} {fetchedAt && `Tuyến lấy lúc ${new Date(fetchedAt).toLocaleTimeString('vi-VN')}.`}</p>
      {trafficOn && trafficReady && !trafficError && <p className="text-xs opacity-75">Phóng to mức thành phố để xem màu giao thông.{trafficAt && ` Lớp màu tải lúc ${new Date(trafficAt).toLocaleTimeString('vi-VN')}.`}</p>}
      {legs.some((l) => l.forecast) && <p className="text-xs font-semibold">ETA theo giờ tương lai là dự báo. Lớp màu nền thể hiện giao thông hiện tại.</p>}
      </div>
    </section>
    {!!legs.length && <section className="journey-controls" aria-label="Điều khiển mô phỏng hành trình">
      <div className="mb-2 flex flex-wrap gap-2">{legs.map((leg, index) => <button key={leg.id} className={`journey-stage ${stage?.index === index ? 'journey-stage-active' : ''}`}
        onClick={() => { const weight = (l: JourneyLeg) => l.vehicle === 'ship' ? 2.5 : 1; const sum = legs.reduce((n, l) => n + weight(l), 0); usePlayback.getState().setProgress((legs.slice(0, index).reduce((n, l) => n + weight(l), 0) + 0.001) / sum); }}>
        {leg.vehicle === 'truck' ? '🚚' : '🚢'} {leg.label} · {fmtDuration(leg.durationSeconds)}{leg.vehicle === 'ship' && ' (ước tính)'}</button>)}</div>
      <div className="flex items-center gap-3"><button className="btn" disabled={!animationReady} aria-label={playing ? 'Tạm dừng hành trình' : 'Phát hành trình'} onClick={() => { const p = usePlayback.getState(); if (p.progress >= 1) p.setProgress(0); p.setPlaying(!p.playing); }}>{playing ? '⏸' : '▶'}</button>
        <input aria-label="Tiến độ hành trình" type="range" min="0" max="1000" value={Math.round(progress * 1000)} disabled={!animationReady} onChange={(e) => usePlayback.getState().setProgress(+e.target.value / 1000)} className="min-w-0 flex-1" />
        <button className="btn !text-xs" aria-pressed={followStages} onClick={() => setFollowStages((v) => !v)}>{followStages ? 'Theo chặng' : 'Toàn cảnh'}</button>
        <select aria-label="Tốc độ mô phỏng" className="field !w-auto !py-1" value={speed} onChange={(e) => usePlayback.getState().setSpeed(+e.target.value as Speed)}>{PLAYBACK_SPEEDS.map((s) => <option key={s} value={s}>×{s}</option>)}</select>
      </div>
      <p className="mt-1 text-xs opacity-75">Mô phỏng tăng tốc · dữ liệu giao thông thực. Tuyến ô tô chưa xác nhận hạn chế xe tải; màu trống là chưa có thông tin.</p>
    </section>}
  </div>;
}
