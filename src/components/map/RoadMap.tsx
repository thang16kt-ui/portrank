import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, LatLngTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useRoadConfig } from '../../hooks/useRoadConfig';
import { useCurrent } from '../../lib/actions';
import { fmtDrivingDistance, fmtDuration } from '../../lib/format';
import { unwrapLongitudes } from '../../lib/geo';
import { transitCountryNames } from '../../lib/roadCountries';
import { useAppStore } from '../../store/useAppStore';
import GoogleRoadMap from './GoogleRoadMap';
import JourneyMap from './JourneyMap';
import MapBoundary from './MapBoundary';

function OsrmRoadMap() {
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [mapError, setMapError] = useState('');
  const [tileError, setTileError] = useState(false);
  const current = useCurrent();
  const plan = useAppStore((s) => s.plan);
  const error = useAppStore((s) => s.planError);
  const planning = useAppStore((s) => s.planning);
  // Only OSRM geometry may enter this map. Google routes use their own Google map.
  const option = current?.option.roadDirections?.provider === 'osrm' ? current.option : null;
  const route = option?.drivingRoute;

  useEffect(() => {
    let active = true;
    let instance: LeafletMap | undefined;
    let observer: ResizeObserver | undefined;
    import('leaflet').then((L) => {
      if (!active || !ref.current) return;
      instance = L.map(ref.current, { preferCanvas: true, zoomControl: false }).setView([16, 106], 5);
      L.control.zoom({ position: 'bottomleft' }).addTo(instance);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> · <a href="https://project-osrm.org/" target="_blank" rel="noopener">OSRM</a>',
      }).on('tileerror', () => { if (active) setTileError(true); }).addTo(instance);
      observer = new ResizeObserver(() => instance?.invalidateSize());
      observer.observe(ref.current);
      setMap(instance);
    }).catch(() => { if (active) setMapError('Không tải được bản đồ. Km và thời gian vẫn hiển thị ở bảng kết quả.'); });
    return () => { active = false; observer?.disconnect(); instance?.remove(); };
  }, []);

  useEffect(() => {
    if (!map) return;
    let active = true;
    let remove = () => {};
    import('leaflet').then((L) => {
      if (!active) return;
      const group = L.layerGroup().addTo(map);
      remove = () => { group.remove(); };
      if (!route) return;
      const path: LatLngTuple[] = unwrapLongitudes(route.path).map(([lng, lat]) => [lat, lng]);
      L.polyline(path, { color: '#2563eb', weight: 5, opacity: 0.95, smoothFactor: 0 }).addTo(group);
      const endpoints = [path[0], path[path.length - 1]];
      endpoints.forEach((point, i) => {
        const label = document.createElement('span');
        label.textContent = `${i === 0 ? 'A' : 'B'} · ${i === 0 ? plan?.seller.label : plan?.buyer.label}`;
        L.circleMarker(point, { radius: 8, color: '#fff', weight: 2, fillColor: i === 0 ? '#0284c7' : '#ea580c', fillOpacity: 1 })
          .bindTooltip(label, { direction: 'top' }).addTo(group);
      });
      const via = plan?.input.roadVia;
      if (via) {
        const target: LatLngTuple = [via.coord[1], via.coord[0]];
        const nearest = path.reduce((best, p) => (p[0] - target[0]) ** 2 + (p[1] - target[1]) ** 2 < (best[0] - target[0]) ** 2 + (best[1] - target[1]) ** 2 ? p : best, path[0]);
        const label = document.createElement('span');
        label.textContent = `Đi qua · ${via.label}`;
        L.circleMarker(nearest, { radius: 7, color: '#fff', weight: 2, fillColor: '#7c3aed', fillOpacity: 1 }).bindTooltip(label).addTo(group);
      }
      map.fitBounds(L.latLngBounds(path), { paddingTopLeft: [35, 95], paddingBottomRight: [35, 40], maxZoom: 15 });
    });
    return () => { active = false; remove(); };
  }, [map, route, plan?.seller.label, plan?.buyer.label, plan?.input.roadVia]);

  return <div className="relative isolate z-0 h-full w-full bg-well">
    <div ref={ref} className="h-full w-full" aria-label="Bản đồ đường bộ OpenStreetMap / OSRM" />
    <div className="pointer-events-none absolute left-3 right-3 top-3 z-[500] max-w-md rounded-lg border border-line bg-panel/95 px-3 py-2 text-[12px] text-fg shadow-lg" role="status">
      {route && <div className="font-semibold">{fmtDrivingDistance(route.distanceMeters)} · {fmtDuration(route.durationSeconds)}</div>}
      <div className="font-medium">OpenStreetMap / OSRM · bản thử</div>
      {route && plan?.input.roadVia && <div className="text-[10.5px]">Qua {plan.input.roadVia.label}</div>}
      <div className="text-[10.5px] text-mute">Ô tô · chưa xét kẹt xe, nghỉ và cửa khẩu</div>
      {!!option?.roadTransitCountries?.length && <p className="mt-1 font-semibold text-amber-500">Có thể quá cảnh: {transitCountryNames(option.roadTransitCountries)} · chưa tính đủ phí</p>}
      {!route && <p className="mt-1">{planning ? 'Đang tìm tuyến theo đường ô tô…' : error || 'Chọn thành phố/địa chỉ ở hai đầu rồi bấm Tìm tuyến tối ưu.'}</p>}
      {(mapError || tileError) && <p className="mt-1 text-amber-200">{mapError || 'Chưa tải được một số ô bản đồ nền. Tuyến và số liệu vẫn giữ nguyên.'}</p>}
    </div>
  </div>;
}

export default function RoadMap() {
  const current = useCurrent();
  const { config, error, retry } = useRoadConfig();
  const provider = current?.option.roadDirections?.provider ?? config?.provider;
  if (provider === 'google') return <GoogleRoadMap />;
  if (provider === 'tomtom') return <MapBoundary webgl={false}><JourneyMap /></MapBoundary>;
  if (provider === 'osrm') return <OsrmRoadMap />;
  return <div className="flex h-full items-center justify-center bg-well p-6 text-center text-[13px] text-mute" role="status">
    <div>{error || 'Đang kết nối nguồn đường bộ…'}{error && <button className="btn mx-auto mt-3 block" onClick={retry}>Thử lại kết nối</button>}</div>
  </div>;
}
