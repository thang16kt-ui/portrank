import { useEffect, useRef, useState } from 'react';
import { useCurrent } from '../../lib/actions';
import { fmtDrivingDistance, fmtDuration } from '../../lib/format';
import { fetchRoadConfig, type RoadConfig } from '../../providers/RoadProvider';
import { useAppStore } from '../../store/useAppStore';

type LatLng = { lat: number; lng: number };
type MapInstance = { fitBounds(bounds: unknown, padding: number): void };
type MapOverlay = { setMap(map: MapInstance | null): void };
interface MapsLibrary {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Polyline: new (options: Record<string, unknown>) => MapOverlay;
  Marker: new (options: Record<string, unknown>) => MapOverlay;
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

export default function GoogleRoadMap() {
  const current = useCurrent();
  const plan = useAppStore((s) => s.plan);
  const error = useAppStore((s) => s.planError);
  const planning = useAppStore((s) => s.planning);
  const ref = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<RoadConfig | null>(null);
  const [mapError, setMapError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const option = current?.option.mode === 'road' ? current.option : null;
  const route = option?.drivingRoute;
  const mapsUrl = plan ? `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', origin: `${plan.seller.coord[1]},${plan.seller.coord[0]}`, destination: `${plan.buyer.coord[1]},${plan.buyer.coord[0]}`, travelmode: 'driving', avoid: 'ferries' })}` : '';

  useEffect(() => {
    let active = true;
    fetchRoadConfig().then((c) => { if (active) { setConfig(c); setMapError(''); } }, (e) => { if (active) setMapError((e as Error).message); });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    let active = true;
    const overlays: MapOverlay[] = [];
    if (!ref.current || !config?.configured || !config.browserKey) return;
    loadMaps(config.browserKey).then((maps) => {
      if (!active || !ref.current) return;
      const map = new maps.Map(ref.current, { center: { lat: 16, lng: 106 }, zoom: 5, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
      if (!route) return;
      const path = route.path.map(([lng, lat]) => ({ lat, lng }));
      overlays.push(new maps.Polyline({ map, path, strokeColor: '#2563eb', strokeOpacity: 0.95, strokeWeight: 5, geodesic: false }));
      overlays.push(new maps.Marker({ map, position: path[0], label: 'A', title: plan?.seller.label }));
      overlays.push(new maps.Marker({ map, position: path[path.length - 1], label: 'B', title: plan?.buyer.label }));
      const bounds = new maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 70);
    }).catch((e) => { if (active) setMapError((e as Error).message); });
    return () => { active = false; overlays.forEach((o) => o.setMap(null)); };
  }, [config, route, plan?.seller.label, plan?.buyer.label, attempt]);

  const message = error || mapError || (config && !config.configured ? 'Định tuyến Google Maps chưa được bật. Quản trị viên cần cấu hình dịch vụ trước khi tính đường bộ.'
    : config && !config.browserKey ? 'Chưa bật bản đồ Google. Nếu định tuyến đã được cấu hình, quãng đường và thời gian vẫn hiện ở bảng kết quả.' : '');
  return (
    <div className="relative h-full w-full bg-well">
      <div ref={ref} className="h-full w-full" aria-label="Bản đồ đường bộ Google Maps" />
      {message && <div className="absolute inset-0 flex items-center justify-center bg-well/95 p-6" role="status">
        <div className="max-w-md text-center text-[13px] text-mute">
          <div className="mb-2 text-lg font-semibold text-fg">Đường bộ · Google Maps</div>
          <p>{message}</p>
          <button className="btn mt-3" onClick={() => { setMapError(''); setAttempt((n) => n + 1); }}>Thử lại kết nối</button>
          {route && <a className="mt-3 block text-sky underline" href={mapsUrl} target="_blank" rel="noreferrer">Mở chỉ đường trên Google Maps</a>}
        </div>
      </div>}
      {!message && !route && <div className="absolute top-3 left-3 right-16 rounded-lg border border-line bg-panel/95 p-3 text-[12px] text-fg" role="status">
        {planning ? 'Đang tìm tuyến đường ô tô…' : 'Chọn thành phố hoặc địa chỉ ở hai đầu rồi bấm Tìm tuyến tối ưu.'}
      </div>}
      {route && <div className="absolute top-3 left-3 max-w-[calc(100%-80px)] rounded-lg border border-line bg-panel/95 px-3 py-2 text-[12px] text-fg shadow-lg">
        <div className="font-semibold">{fmtDrivingDistance(route.distanceMeters)} · {fmtDuration(route.durationSeconds)}</div>
        <div className="text-[10.5px] text-mute">Google Maps · ô tô · có xét giao thông</div>
      </div>}
    </div>
  );
}
