/** Opt-in OSRM demo adapter for this non-commercial prototype. No API key is required. */
const BASE = 'https://router.project-osrm.org/route/v1/driving/';
const APP_URL = 'https://portrank-road-google-maps.onrender.com/';
const cache = new Map();
let busy = false;
let lastStart = -Infinity;
const TTL = 5 * 60 * 1000;

const json = (status, body, headers = {}) => ({
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  body: JSON.stringify(body),
});

function validPath(path) {
  return Array.isArray(path) && path.length >= 2 && path.every((p) => Array.isArray(p) && p.length >= 2 &&
    Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90);
}

export async function handleOsrm(origin, destination) {
  const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const now = Date.now();
  const hit = cache.get(coordinates);
  if (hit && hit.expiresAt > now) return json(200, { ...hit.body, departureTime: new Date(now).toISOString(), cached: true });
  if (hit) cache.delete(coordinates);
  // The public demo allows at most one request per second. Never fan out port-pair queries here.
  if (busy || now - lastStart < 1100) return json(429, { error: 'Nguồn OSRM đang bận. Vui lòng thử lại sau 2 giây.' }, { 'Retry-After': '2' });
  busy = true;
  lastStart = now;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const query = new URLSearchParams({ overview: 'full', geometries: 'geojson', alternatives: 'true', steps: 'true', generate_hints: 'false' });
    const res = await fetch(`${BASE}${coordinates}?${query}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'User-Agent': `PortRank-Prototype/1.0 (+${APP_URL})`, Referer: APP_URL },
    });
    const data = await res.json();
    if (data.code === 'NoRoute' || data.code === 'NoSegment') return json(404, { error: 'Không tìm được đường ô tô giữa hai điểm này. Hãy chọn địa chỉ khác hoặc phương thức khác.' });
    if (!res.ok) return json(502, { error: `OSRM trả về HTTP ${res.status}. Thử lại sau.` });
    if (data.code !== 'Ok' || !Array.isArray(data.routes)) return json(502, { error: 'Nguồn OSRM trả dữ liệu không hợp lệ. Thử lại sau.' });
    if (!Array.isArray(data.waypoints) || data.waypoints.length !== 2 || data.waypoints.some((w) => !Number.isFinite(w.distance) || w.distance < 0))
      return json(502, { error: 'OSRM chưa xác định được điểm đầu/cuối trên đường ô tô.' });
    if (data.waypoints.some((w) => w.distance > 5000)) return json(422, { error: 'Điểm chọn cách đường ô tô hơn 5 km. Hãy chọn địa chỉ hoặc ghim gần đường hơn.' });
    let mixedMode = false;
    const routes = data.routes.slice(0, 3).flatMap((r, i) => {
      if (!Number.isFinite(r.distance) || r.distance < 0 || !Number.isFinite(r.duration) || r.duration < 0 || !validPath(r.geometry?.coordinates)) return [];
      if (!Array.isArray(r.legs) || !r.legs.length || r.legs.some((l) => !Array.isArray(l.steps) || !l.steps.length)) return [];
      // This hosted profile cannot exclude ferries in the request. Inspect actual transport modes instead.
      if (r.legs.some((l) => l.steps.some((s) => s.mode !== 'driving'))) { mixedMode = true; return []; }
      const names = r.legs.map((l) => typeof l.summary === 'string' ? l.summary : '').filter(Boolean);
      return [{
        id: `osrm-road-${i}`, description: names.join(' → ').slice(0, 180) || `Tuyến ô tô ${i + 1}`,
        distanceMeters: r.distance, durationSeconds: r.duration, staticDurationSeconds: r.duration,
        path: r.geometry.coordinates.map((p) => [p[0], p[1]]), warnings: [],
      }];
    });
    if (!routes.length) return mixedMode
      ? json(422, { error: 'Các tuyến tìm được có chặng phà/tàu. Bản thử hiện chỉ tính tuyến ô tô liền mạch.' })
      : json(502, { error: 'OSRM chưa trả đủ khoảng cách, thời gian và hình học tuyến hợp lệ.' });
    const body = {
      provider: 'osrm', profile: 'DRIVE', trafficAware: false, demo: true, cached: false,
      fetchedAt: new Date().toISOString(), departureTime: new Date(now).toISOString(), routes,
    };
    if (cache.size >= 8) cache.delete(cache.keys().next().value);
    cache.set(coordinates, { expiresAt: Date.now() + TTL, body });
    return json(200, body);
  } catch (e) {
    return json(502, { error: e.name === 'AbortError' ? 'OSRM quá thời gian chờ. Vui lòng thử lại.' : 'Không kết nối được nguồn đường bộ OSRM. Vui lòng thử lại sau.' });
  } finally {
    clearTimeout(timer);
    busy = false;
  }
}
