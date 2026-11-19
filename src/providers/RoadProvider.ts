import type { LngLat, Place } from '../types';

export interface TrafficSection {
  startIndex: number;
  endIndex: number;
  severity: 'normal' | 'slow' | 'jam' | 'severe' | 'closed';
  speedKmh: number | null;
  delaySeconds: number | null;
}

export interface DrivingRoute {
  id: string;
  description: string;
  distanceMeters: number;
  durationSeconds: number;
  staticDurationSeconds: number | null;
  /** Geometry from the route provider. Google geometry must only be shown on Google Maps. */
  path: LngLat[];
  warnings: string[];
  trafficSections?: TrafficSection[];
  trafficDelaySeconds?: number | null;
  /** Provider country sections covering the entire route, normalized to ISO alpha-2. */
  countryCodes?: string[];
}

export interface RoadDirections {
  provider: 'google' | 'osrm' | 'tomtom';
  profile: 'DRIVE';
  trafficAware: boolean;
  trafficMode?: 'live' | 'forecast';
  demo?: boolean;
  cached?: boolean;
  fetchedAt: string;
  departureTime: string;
  routes: DrivingRoute[];
}

export interface RoadProvider {
  lookup(q: { origin: Place; destination: Place; departureTime?: string; via?: Place; context?: 'inland' }): Promise<RoadDirections>;
}

export interface RoadConfig {
  configured: boolean;
  provider: 'google' | 'osrm' | 'tomtom';
  profile: 'DRIVE';
  trafficAware: boolean;
  demo?: boolean;
  browserKey: string;
  inlandProvider?: 'tomtom';
}

const NOT_CONFIGURED = 'Chưa bật dịch vụ đường bộ trên máy chủ. Bản chạy tĩnh cần chuyển sang Web Service để tính tuyến.';

async function request<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const response = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    // A static host may return index.html with HTTP 200 for an unknown /api path.
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(NOT_CONFIGURED);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || NOT_CONFIGURED);
    return body as T;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Quá thời gian chờ nguồn đường bộ. Thử tính lại.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const fetchRoadConfig = () => request<RoadConfig>('/api/road/config');

export const ServerRoadProvider: RoadProvider = {
  async lookup({ origin, destination, departureTime, via, context }) {
    if (origin.kind !== 'address' || destination.kind !== 'address')
      throw new Error('Đường bộ cần thành phố hoặc địa chỉ ở cả hai đầu. Hãy chọn địa điểm cụ thể thay cho tên quốc gia.');
    const q = new URLSearchParams({ origin: origin.coord.join(','), destination: destination.coord.join(',') });
    if (origin.country === destination.country && (!via || via.country === origin.country)) q.set('domesticCountry', origin.country);
    if (departureTime) q.set('departureTime', departureTime);
    if (context) q.set('context', context);
    if (via) {
      if (via.kind !== 'address') throw new Error('Điểm đi qua phải là thành phố hoặc địa chỉ cụ thể.');
      q.set('via', via.coord.join(','));
    }
    return request<RoadDirections>(`/api/road/routes?${q}`);
  },
};

export const roadSourceLabel = (directions?: Pick<RoadDirections, 'provider'>) =>
  directions?.provider === 'google' ? 'Google Maps' : directions?.provider === 'osrm' ? 'OpenStreetMap / OSRM' : directions?.provider === 'tomtom' ? 'TomTom Traffic' : 'Nguồn đường bộ';
export const roadTrafficLabel = (directions?: Pick<RoadDirections, 'trafficAware'>) =>
  directions?.trafficAware ? 'có xét giao thông' : 'chưa xét kẹt xe';
