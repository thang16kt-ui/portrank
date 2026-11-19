/** Road routing providers stay behind the PortRank server. Google keys never reach OSRM. */
import { handleOsrm } from './osrm.mjs';
const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const FIELD_MASK = 'routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.geoJsonLinestring,routes.description,routes.warnings';
const requestStarts = [];
let activeRequests = 0;

const json = (status, body) => ({
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

function point(text) {
  if (!text || !/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(text)) return null;
  const [lng, lat] = text.split(',').map(Number);
  return Math.abs(lng) <= 180 && Math.abs(lat) <= 90 ? { latitude: lat, longitude: lng } : null;
}

function seconds(value) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?s$/.test(value)) return null;
  const n = Number(value.slice(0, -1));
  return Number.isFinite(n) ? n : null;
}

export function roadConfig(env = process.env) {
  if (env.ROAD_ROUTING_PROVIDER === 'osrm-demo') return {
    configured: true, provider: 'osrm', profile: 'DRIVE', trafficAware: false, demo: true, browserKey: '',
  };
  return {
    configured: !!env.GOOGLE_ROUTES_API_KEY?.trim(),
    provider: 'google',
    profile: 'DRIVE',
    trafficAware: true,
    // This is a separate, public browser key restricted to Maps JavaScript API + allowed referrers.
    browserKey: env.GOOGLE_MAPS_BROWSER_KEY?.trim() || '',
  };
}

/** Validated coordinates only; the client cannot choose an upstream URL or a billable API method. */
export async function handleRoad(url, env = process.env) {
  if (url.pathname === '/api/road/config') return json(200, roadConfig(env));
  const origin = point(url.searchParams.get('origin'));
  const destination = point(url.searchParams.get('destination'));
  if (!origin || !destination) return json(400, { error: 'Điểm đi và điểm đến phải có tọa độ hợp lệ (kinh độ,vĩ độ).' });
  if (env.ROAD_ROUTING_PROVIDER === 'osrm-demo') return handleOsrm(origin, destination);
  const departure = url.searchParams.get('departureTime');
  const at = departure ? Date.parse(departure) : Date.now();
  if (departure && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(departure) || !Number.isFinite(at) || at < Date.now()))
    return json(400, { error: 'Giờ khởi hành phải là thời điểm hiện tại hoặc tương lai, có múi giờ.' });
  const key = env.GOOGLE_ROUTES_API_KEY?.trim();
  if (!key) return json(503, { error: 'Chưa bật định tuyến Google Maps. Cần chạy máy chủ PortRank và cấu hình GOOGLE_ROUTES_API_KEY.' });
  const now = Date.now();
  while (requestStarts.length && requestStarts[0] < now - 60000) requestStarts.shift();
  // Bound billable calls per running instance. Google Cloud quotas provide the project-wide limit.
  if (requestStarts.length >= 30 || activeRequests >= 4) return json(429, { error: 'Có nhiều yêu cầu định tuyến. Vui lòng thử lại sau.' });
  requestStarts.push(now);
  activeRequests++;

  const departureTime = new Date(at).toISOString();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELD_MASK },
      body: JSON.stringify({
        origin: { location: { latLng: origin } }, destination: { location: { latLng: destination } },
        travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE_OPTIMAL', ...(departure ? { departureTime } : {}),
        computeAlternativeRoutes: true, polylineEncoding: 'GEO_JSON_LINESTRING', polylineQuality: 'HIGH_QUALITY',
        routeModifiers: { avoidFerries: true }, languageCode: 'vi', units: 'METRIC',
      }),
    });
    if (!res.ok) {
      // Do not forward upstream error bodies: they may contain credentials or request details.
      const reason = res.status === 401 || res.status === 403 ? 'Kiểm tra API key, Routes API và tài khoản thanh toán Google Cloud.'
        : res.status === 429 ? 'Đã đạt giới hạn truy vấn. Thử lại sau hoặc kiểm tra quota Google Cloud.'
        : 'Không lấy được tuyến đường. Thử lại sau.';
      return json(502, { error: `Google Routes trả về HTTP ${res.status}. ${reason}` });
    }
    const body = await res.json();
    const routes = (Array.isArray(body.routes) ? body.routes : []).slice(0, 3).flatMap((r, i) => {
      const durationSeconds = seconds(r.duration), staticDurationSeconds = seconds(r.staticDuration);
      const path = r.polyline?.geoJsonLinestring?.coordinates;
      if (!Number.isFinite(r.distanceMeters) || r.distanceMeters < 0 || durationSeconds === null ||
        !Array.isArray(path) || path.length < 2 || path.some((p) => !Array.isArray(p) || p.length < 2 ||
          !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) return [];
      return [{
        id: `google-road-${i}`, description: typeof r.description === 'string' ? r.description : '',
        distanceMeters: r.distanceMeters, durationSeconds, staticDurationSeconds,
        path: path.map((p) => [p[0], p[1]]), warnings: Array.isArray(r.warnings) ? r.warnings.filter((s) => typeof s === 'string') : [],
      }];
    });
    if (!routes.length) return json(404, { error: 'Google Maps không trả về tuyến ô tô cho hai điểm này. Kiểm tra địa chỉ hoặc chọn phương thức khác.' });
    return json(200, { provider: 'google', profile: 'DRIVE', trafficAware: true, fetchedAt: new Date().toISOString(), departureTime, routes });
  } catch (e) {
    return json(502, { error: e.name === 'AbortError' ? 'Google Routes quá thời gian chờ. Thử lại.' : 'Không kết nối được Google Routes. Thử lại sau.' });
  } finally {
    clearTimeout(timer);
    activeRequests--;
  }
}
