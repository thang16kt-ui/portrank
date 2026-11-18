import type { LngLat, Place } from '../types';

export interface DrivingRoute {
  id: string;
  description: string;
  distanceMeters: number;
  durationSeconds: number;
  staticDurationSeconds: number | null;
  /** Google geometry: display only on a Google Map, never on the MapLibre sea map. */
  path: LngLat[];
  warnings: string[];
}

export interface RoadDirections {
  provider: 'google';
  profile: 'DRIVE';
  trafficAware: true;
  fetchedAt: string;
  departureTime: string;
  routes: DrivingRoute[];
}

export interface RoadProvider {
  lookup(q: { origin: Place; destination: Place; departureTime?: string }): Promise<RoadDirections>;
}

export interface RoadConfig {
  configured: boolean;
  provider: 'google';
  profile: 'DRIVE';
  trafficAware: boolean;
  browserKey: string;
}

const NOT_CONFIGURED = 'Chưa bật định tuyến Google Maps trên máy chủ. Bản chạy tĩnh cần chuyển sang Web Service và cấu hình Google Routes.';

async function request<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const response = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    // A static host may return index.html with HTTP 200 for an unknown /api path.
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(NOT_CONFIGURED);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || NOT_CONFIGURED);
    return body as T;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Quá thời gian chờ Google Maps. Thử tính lại.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const fetchRoadConfig = () => request<RoadConfig>('/api/road/config');

export const GoogleRoadProvider: RoadProvider = {
  async lookup({ origin, destination, departureTime }) {
    if (origin.kind !== 'address' || destination.kind !== 'address')
      throw new Error('Đường bộ cần thành phố hoặc địa chỉ ở cả hai đầu. Hãy chọn địa điểm cụ thể thay cho tên quốc gia.');
    const q = new URLSearchParams({ origin: origin.coord.join(','), destination: destination.coord.join(',') });
    if (departureTime) q.set('departureTime', departureTime);
    return request<RoadDirections>(`/api/road/routes?${q}`);
  },
};
