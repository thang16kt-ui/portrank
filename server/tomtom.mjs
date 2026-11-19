/** TomTom credentials stay on the server. Only validated coordinates/tiles reach fixed upstreams. */
import countries from 'i18n-iso-countries';
const cache = new Map();
const pending = new Map();
const starts = [];
let active = 0;
export const TRAFFIC_REFRESH_SECONDS = 120;
const json = (status, data) => ({ status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(data) });
const finite = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const coord = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;

export const trafficConfig = (env = process.env) => ({ configured: !!env.TOMTOM_API_KEY?.trim(), provider: 'tomtom', refreshSeconds: TRAFFIC_REFRESH_SECONDS });

async function cachedRequest(id, key, work) {
  // Key is part of the internal cache scope; a removed/changed credential cannot reuse an old response.
  const scope = `${key}:${id}`, now = Date.now();
  const hit = cache.get(scope);
  if (hit && now - hit.at < TRAFFIC_REFRESH_SECONDS * 1000) return hit.value;
  if (pending.has(scope)) return pending.get(scope);
  while (starts.length && starts[0] <= now - 60000) starts.shift();
  if (starts.length >= 150 || active >= 8) return json(429, { error: 'Nguồn giao thông đang bận. Thử lại sau.' });
  starts.push(now); active++;
  const promise = (async () => {
    try {
      const result = await work();
      if (result.status === 200) {
        if (cache.size >= 160) cache.delete(cache.keys().next().value);
        cache.set(scope, { at: Date.now(), value: result });
      }
      return result;
    } finally { active--; pending.delete(scope); }
  })();
  pending.set(scope, promise);
  return promise;
}

async function upstream(url, accept = 'application/json') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try { return await fetch(url, { headers: { Accept: accept }, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

function upstreamError(status) {
  const message = status === 401 || status === 403 ? 'API key TomTom chưa có quyền cho dịch vụ này.'
    : status === 429 ? 'Đã hết hạn mức TomTom hoặc có quá nhiều yêu cầu. Dữ liệu giao thông tạm ngừng.'
    : 'TomTom chưa trả được dữ liệu cho khu vực này. Thử lại sau.';
  return json(status === 429 ? 429 : 502, { error: message });
}

/** Reject a route snapped to a different city/island. Ports may be pinned a short distance offshore. */
function distanceMeters(a, b) {
  const rad = Math.PI / 180, dlat = (a[1] - b[1]) * rad, dlng = (a[0] - b[0]) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dlng / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function normalizeTomTomRoute(route, index = 0) {
  const summary = route.summary;
  if (!summary || !finite(summary.lengthInMeters) || !finite(summary.travelTimeInSeconds) || !Array.isArray(route.legs)) return null;
  const path = route.legs.flatMap((leg) => Array.isArray(leg.points) ? leg.points.map((p) => [p.longitude, p.latitude]) : []);
  if (path.length < 2 || path.length > 120000 || !path.every(coord)) return null;
  const trafficSections = (Array.isArray(route.sections) ? route.sections : []).flatMap((s) => {
    if (s.sectionType !== 'TRAFFIC' || !Number.isInteger(s.startPointIndex) || !Number.isInteger(s.endPointIndex)
      || s.startPointIndex < 0 || s.endPointIndex <= s.startPointIndex || s.endPointIndex >= path.length) return [];
    const severity = s.simpleCategory === 'ROAD_CLOSURE' ? 'closed' : s.magnitudeOfDelay >= 3 ? 'severe'
      : s.simpleCategory === 'JAM' || s.magnitudeOfDelay === 2 ? 'jam' : 'slow';
    return [{ startIndex: s.startPointIndex, endIndex: s.endPointIndex, severity,
      speedKmh: finite(s.effectiveSpeedInKmh) ? s.effectiveSpeedInKmh : null,
      delaySeconds: finite(s.delayInSeconds) ? s.delayInSeconds : null }];
  });
  const countrySections = (Array.isArray(route.sections) ? route.sections : []).filter((s) => s.sectionType === 'COUNTRY');
  const countryCodes = [];
  let covered = -1;
  let completeCountries = countrySections.length > 0;
  for (const s of countrySections) {
    const code = typeof s.countryCode === 'string' ? countries.alpha3ToAlpha2(s.countryCode) : undefined;
    if (!code || !Number.isInteger(s.startPointIndex) || !Number.isInteger(s.endPointIndex)
      || s.startPointIndex < 0 || s.startPointIndex > covered + 1 || s.endPointIndex < s.startPointIndex || s.endPointIndex >= path.length) {
      completeCountries = false; break;
    }
    covered = Math.max(covered, s.endPointIndex);
    if (!countryCodes.includes(code)) countryCodes.push(code);
  }
  return { id: `tomtom-road-${index}`, description: index ? `Phương án ${index + 1} · TomTom` : 'Tuyến chính · TomTom',
    distanceMeters: summary.lengthInMeters, durationSeconds: summary.travelTimeInSeconds,
    staticDurationSeconds: finite(summary.noTrafficTravelTimeInSeconds) ? summary.noTrafficTravelTimeInSeconds : null,
    trafficDelaySeconds: finite(summary.trafficDelayInSeconds) ? summary.trafficDelayInSeconds : null,
    trafficSections, path, warnings: [],
    ...(completeCountries && covered === path.length - 1 ? { countryCodes } : {}) };
}

export async function handleTomTomRoad(url, env, origin, destination, via) {
  const key = env.TOMTOM_API_KEY?.trim();
  if (!key) return json(503, { error: 'Chưa cấu hình API key TomTom trên máy chủ.' });
  const departure = url.searchParams.get('departureTime');
  const domesticCountry = url.searchParams.get('domesticCountry');
  if (domesticCountry !== null && (!/^[A-Z]{2}$/.test(domesticCountry) || !countries.alpha2ToAlpha3(domesticCountry)))
    return json(400, { error: 'Quốc gia của tuyến nội địa không hợp lệ.' });
  const timestamp = departure ? Date.parse(departure) : Date.now();
  if (departure && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(departure) || !Number.isFinite(timestamp) || timestamp < Date.now()))
    return json(400, { error: 'Giờ khởi hành phải ở hiện tại hoặc tương lai, có múi giờ.' });
  if (domesticCountry && url.searchParams.get('includeTransit') === 'true') {
    // Supplement the original alternatives with a border-avoiding search, rather than replacing them.
    // Each search uses the same validated points, waypoint, departure and scoped cache/rate limits.
    const domesticUrl = new URL(url); domesticUrl.searchParams.delete('includeTransit');
    const unrestrictedUrl = new URL(domesticUrl); unrestrictedUrl.searchParams.delete('domesticCountry');
    const [local, original] = await Promise.all([
      handleTomTomRoad(domesticUrl, env, origin, destination, via),
      handleTomTomRoad(unrestrictedUrl, env, origin, destination, via),
    ]);
    if (local.status !== 200 && original.status !== 200) return original;
    const localData = local.status === 200 ? JSON.parse(local.body) : null;
    const originalData = original.status === 200 ? JSON.parse(original.body) : null;
    const seen = new Set();
    const routes = [
      ...(localData?.routes ?? []).map((r) => ({ ...r, id: `domestic:${r.id}` })),
      ...(originalData?.routes ?? []),
    ].filter((r) => {
      const key = JSON.stringify(r.path);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    const routingNotice = !localData ? 'Chưa lấy được phương án nội địa bổ sung. Vẫn giữ các tuyến đã tìm được để so sánh.'
      : !originalData ? 'Chưa lấy được các phương án thông thường bổ sung. Vẫn giữ tuyến nội địa đã tìm được.' : undefined;
    const base = localData ?? originalData;
    const fetchedAt = new Date(Math.min(...[localData, originalData].filter(Boolean).map((d) => Date.parse(d.fetchedAt)))).toISOString();
    return json(200, { ...base, fetchedAt, routes, ...(routingNotice ? { routingNotice } : {}) });
  }
  const points = [origin, ...(via ? [via] : []), destination];
  const locations = points.map((p) => `${p.latitude},${p.longitude}`).join(':');
  const target = new URL(`https://api.tomtom.com/routing/1/calculateRoute/${locations}/json`);
  target.search = new URLSearchParams({ key, traffic: 'true', travelMode: 'car', routeType: 'fastest',
    routeRepresentation: 'polyline', computeTravelTimeFor: 'all', sectionType: 'traffic',
    avoid: 'ferries', maxAlternatives: via ? '0' : '2', departAt: departure || 'now' }).toString();
  target.searchParams.append('sectionType', 'country');
  if (domesticCountry) target.searchParams.append('avoid', 'borderCrossings');
  return cachedRequest(`route:${locations}:${departure || 'now'}:${domesticCountry || 'international'}`, key, async () => {
    try {
      const response = await upstream(target);
      if (!response.ok) return upstreamError(response.status);
      const data = await response.json();
      const routes = (Array.isArray(data.routes) ? data.routes : []).slice(0, 3).map(normalizeTomTomRoute).filter(Boolean)
        .filter((r) => distanceMeters(r.path[0], [origin.longitude, origin.latitude]) <= 5000
          && distanceMeters(r.path.at(-1), [destination.longitude, destination.latitude]) <= 5000)
        .filter((r) => !domesticCountry || !r.countryCodes || r.countryCodes.every((c) => c === domesticCountry));
      if (!routes.length) return json(404, { error: domesticCountry ? 'Chưa tìm được tuyến đường bộ nằm trong quốc gia đã chọn. Không tự thay bằng tuyến quá cảnh nước khác.' : 'TomTom không trả được tuyến đường bộ hợp lệ cho hai điểm này.' });
      return json(200, { provider: 'tomtom', profile: 'DRIVE', trafficAware: true,
        trafficMode: departure ? 'forecast' : 'live', fetchedAt: new Date().toISOString(),
        departureTime: new Date(timestamp).toISOString(), routes });
    } catch { return json(502, { error: 'Không kết nối được TomTom. Thử lại sau.' }); }
  });
}

export async function handleTraffic(url, env = process.env) {
  if (url.pathname === '/api/traffic/config') return json(200, trafficConfig(env));
  const tile = url.pathname.match(/^\/api\/traffic\/tiles\/(\d+)\/(\d+)\/(\d+)\.png$/);
  if (!tile) return json(404, { error: 'Không có API giao thông này.' });
  const [z, x, y] = tile.slice(1).map(Number);
  if (z < 7 || z > 18 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return json(400, { error: 'Mảnh bản đồ không hợp lệ.' });
  const key = env.TOMTOM_API_KEY?.trim();
  if (!key) return json(503, { error: 'Chưa bật dữ liệu giao thông TomTom.' });
  return cachedRequest(`tile:${z}/${x}/${y}`, key, async () => {
    try {
      const target = new URL(`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/${z}/${x}/${y}.png`);
      // relative0 has a fixed stroke style; TomTom rejects its thickness parameter.
      target.search = new URLSearchParams({ key, tileSize: '256' }).toString();
      const response = await upstream(target, 'image/png');
      if (!response.ok) return upstreamError(response.status);
      if (!response.headers.get('content-type')?.includes('image/png')) return json(502, { error: 'TomTom chưa trả được lớp màu giao thông.' });
      const body = Buffer.from(await response.arrayBuffer());
      if (!body.length || body.length > 1024 * 1024) return json(502, { error: 'Mảnh giao thông không hợp lệ.' });
      return { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=60', 'X-Traffic-Provider': 'TomTom' }, body };
    } catch { return json(502, { error: 'Không tải được màu giao thông TomTom.' }); }
  });
}
