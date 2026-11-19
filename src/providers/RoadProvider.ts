import type { LngLat, Place } from '../types';

export interface DrivingRoute {
  id: string;
  description: string;
  distanceMeters: number;
  durationSeconds: number;
  staticDurationSeconds: number | null;
  /** Geometry from the route provider. Google geometry must only be shown on Google Maps. */
  path: LngLat[];
  warnings: string[];
}

export interface RoadDirections {
  provider: 'google' | 'osrm';
  profile: 'DRIVE';
  trafficAware: boolean;
  demo?: boolean;
  cached?: boolean;
  fetchedAt: string;
  departureTime: string;
  routes: DrivingRoute[];
}

export interface RoadProvider {
  lookup(q: { origin: Place; destination: Place; departureTime?: string }): Promise<RoadDirections>;
}

export interface RoadConfig {
  configured: boolean;
  provider: 'google' | 'osrm';
  profile: 'DRIVE';
  trafficAware: boolean;
  demo?: boolean;
  browserKey: string;
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
  async lookup({ origin, destination, departureTime }) {
    if (origin.kind !== 'address' || destination.kind !== 'address')
      throw new Error('Đường bộ cần thành phố hoặc địa chỉ ở cả hai đầu. Hãy chọn địa điểm cụ thể thay cho tên quốc gia.');
    const q = new URLSearchParams({ origin: origin.coord.join(','), destination: destination.coord.join(',') });
    if (departureTime) q.set('departureTime', departureTime);
    return request<RoadDirections>(`/api/road/routes?${q}`);
  },
};

export const roadSourceLabel = (directions?: Pick<RoadDirections, 'provider'>) =>
  directions?.provider === 'google' ? 'Google Maps' : directions?.provider === 'osrm' ? 'OpenStreetMap / OSRM' : 'Nguồn đường bộ';
export const roadTrafficLabel = (directions?: Pick<RoadDirections, 'trafficAware'>) =>
  directions?.trafficAware ? 'có xét giao thông' : 'chưa xét kẹt xe';
