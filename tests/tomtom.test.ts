import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { journeyPosition, journeyStage, type JourneyLeg } from '../src/lib/journey';
import type { DrivingRoute } from '../src/providers/RoadProvider';

// Synthetic protocol fixture; not a measurement or advertised route.
const path = [[106.7, 10.77], [106.71, 10.77], [106.72, 10.77]];
const fixture = () => ({ routes: [{ summary: { lengthInMeters: 2200, travelTimeInSeconds: 600, noTrafficTravelTimeInSeconds: 200, trafficDelayInSeconds: 400 },
  legs: [{ points: path.map(([longitude, latitude]) => ({ longitude, latitude })) }],
  sections: [{ sectionType: 'TRAFFIC', startPointIndex: 1, endPointIndex: 2, simpleCategory: 'JAM', magnitudeOfDelay: 3, effectiveSpeedInKmh: 3, delayInSeconds: 400 }] }] });
const env = { ROAD_ROUTING_PROVIDER: 'tomtom', TOMTOM_API_KEY: 'synthetic-secret-do-not-expose', GOOGLE_ROUTES_API_KEY: 'unrelated-google-secret' };
const url = '/api/road/routes?origin=106.7,10.77&destination=106.72,10.77';
let api: typeof import('../server/api.mjs').handleApi;
const call = async (target = url, settings = env) => { const r = (await api('GET', target, settings))!; return { ...r, data: JSON.parse(r.body) }; };
const mock = (data: unknown = fixture(), status = 200) => { const f = vi.fn(async (_input: string | URL) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })); vi.stubGlobal('fetch', f); return f; };
beforeEach(async () => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-19T07:00:00Z')); api = (await import('../server/api.mjs')).handleApi; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('TomTom server integration', () => {
  it('keeps the secret out of configuration, errors and response metadata', async () => {
    const f = mock();
    const config = await call('/api/road/config');
    expect(config.data).toMatchObject({ provider: 'tomtom', configured: true, trafficAware: true, browserKey: '' });
    expect(config.body).not.toContain(env.TOMTOM_API_KEY);
    expect((await call('/api/traffic/config')).body).not.toContain(env.TOMTOM_API_KEY);
    expect((await call(url, { ...env, TOMTOM_API_KEY: '' })).status).toBe(503);
    expect(f).not.toHaveBeenCalled();
  });
  it('gets distance, ETA, route geometry and congested point intervals in one authenticated server request', async () => {
    const f = mock(); const result = await call();
    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({ provider: 'tomtom', trafficAware: true, trafficMode: 'live' });
    expect(result.data.routes[0]).toMatchObject({ path, distanceMeters: 2200, durationSeconds: 600, trafficDelaySeconds: 400,
      trafficSections: [{ startIndex: 1, endIndex: 2, severity: 'severe', speedKmh: 3 }] });
    const request = new URL(String(f.mock.calls[0][0]));
    expect(request.origin).toBe('https://api.tomtom.com');
    expect(request.pathname).toContain('/10.77,106.7:10.77,106.72/json');
    expect(request.searchParams.get('traffic')).toBe('true');
    expect(request.searchParams.get('sectionType')).toBe('traffic');
    expect(request.searchParams.get('key')).toBe(env.TOMTOM_API_KEY);
    expect(result.body).not.toContain(env.TOMTOM_API_KEY);
    expect(String(f.mock.calls[0])).not.toContain(env.GOOGLE_ROUTES_API_KEY);
  });
  it('caches live traffic for two minutes while preserving its original fetchedAt', async () => {
    const f = mock(); const first = await call();
    vi.advanceTimersByTime(60000); const cached = await call();
    expect(cached.data.fetchedAt).toBe(first.data.fetchedAt); expect(f).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(61000); const fresh = await call();
    expect(f).toHaveBeenCalledTimes(2); expect(fresh.data.fetchedAt).not.toBe(first.data.fetchedAt);
  });
  it('rejects invalid points, invalid dates and past forecasts without using quota', async () => {
    const f = mock();
    expect((await call('/api/road/routes?origin=181,10&destination=106,11')).status).toBe(400);
    expect((await call(url + '&departureTime=yesterday')).status).toBe(400);
    expect((await call(url + '&departureTime=2020-01-01T00:00:00Z')).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
  it('separates future predictions from live data and supports a waypoint', async () => {
    const f = mock(); const result = await call(url + '&via=106.71,10.77&departureTime=2027-01-01T00:00:00Z');
    expect(result.data.trafficMode).toBe('forecast');
    const request = new URL(String(f.mock.calls[0][0]));
    expect(request.pathname).toContain('10.77,106.7:10.77,106.71:10.77,106.72');
    expect(request.searchParams.get('departAt')).toBe('2027-01-01T00:00:00Z');
  });
  it('requests border avoidance and keeps only provider-confirmed domestic routes', async () => {
    const data = fixture();
    const domestic = { ...data.routes[0], sections: [
      ...data.routes[0].sections,
      { sectionType: 'COUNTRY', startPointIndex: 0, endPointIndex: 2, countryCode: 'VNM' },
    ] };
    const foreign = { ...domestic, sections: [
      { sectionType: 'COUNTRY', startPointIndex: 0, endPointIndex: 1, countryCode: 'VNM' },
      { sectionType: 'COUNTRY', startPointIndex: 1, endPointIndex: 2, countryCode: 'LAO' },
    ] };
    const f = mock({ routes: [foreign, domestic] });
    const result = await call(url + '&domesticCountry=VN');
    expect(result.status).toBe(200);
    expect(result.data.routes).toHaveLength(1);
    expect(result.data.routes[0].countryCodes).toEqual(['VN']);
    expect(result.data.routes[0].trafficSections).toHaveLength(1);
    const request = new URL(String(f.mock.calls[0][0]));
    expect(request.searchParams.getAll('avoid')).toEqual(['ferries', 'borderCrossings']);
    expect(request.searchParams.getAll('sectionType')).toEqual(['traffic', 'country']);
  });
  it('does not label incomplete country metadata as proof of a domestic route', async () => {
    const data = fixture();
    const partial = { ...data.routes[0], sections: [{ sectionType: 'COUNTRY', startPointIndex: 0, endPointIndex: 1, countryCode: 'VNM' }] };
    mock({ routes: [partial] });
    expect((await call(url + '&domesticCountry=VN')).data.routes[0].countryCodes).toBeUndefined();
  });
  it('separates domestic and unrestricted cache entries without blocking cross-border requests', async () => {
    const f = mock();
    await call();
    await call(url + '&domesticCountry=VN');
    expect(f).toHaveBeenCalledTimes(2);
    expect(new URL(String(f.mock.calls[0][0])).searchParams.getAll('avoid')).toEqual(['ferries']);
    expect(new URL(String(f.mock.calls[1][0])).searchParams.getAll('avoid')).toContain('borderCrossings');
    await call(url + '&domesticCountry=VN');
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('rejects invalid country filters and never substitutes an explicitly foreign route for a domestic request', async () => {
    const data = fixture();
    const f = mock({ routes: [{ ...data.routes[0], sections: [{ sectionType: 'COUNTRY', startPointIndex: 0, endPointIndex: 2, countryCode: 'LAO' }] }] });
    expect((await call(url + '&domesticCountry=bad')).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
    const result = await call(url + '&domesticCountry=VN');
    expect(result.status).toBe(404);
    expect(result.data.error).toContain('Không tự thay');
  });
  it('does not turn missing, malformed or distant routes into a usable road', async () => {
    mock({ routes: [] }); expect((await call()).status).toBe(404);
    const broken = fixture(); broken.routes[0].legs[0].points[0].latitude = NaN;
    mock(broken); expect((await call()).status).toBe(404);
    const far = fixture(); far.routes[0].legs[0].points[0].latitude = 20;
    mock(far); expect((await call()).status).toBe(404);
  });
  it('sanitizes provider failures and reports quota exhaustion honestly', async () => {
    mock({ error: env.TOMTOM_API_KEY }, 403); const blocked = await call();
    expect(blocked.status).toBe(502); expect(blocked.body).not.toContain(env.TOMTOM_API_KEY);
    mock({ error: env.TOMTOM_API_KEY }, 429); expect((await call()).status).toBe(429);
  });
  it('validates tile coordinates and proxies PNG bytes without returning a key', async () => {
    const f = mock();
    expect((await call('/api/traffic/tiles/7/128/1.png')).status).toBe(400);
    expect((await call('/api/traffic/tiles/0/0/0.png')).status).toBe(400); expect(f).not.toHaveBeenCalled();
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const tiles = vi.fn(async (_input: string | URL) => new Response(png, { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', tiles);
    const r = (await api('GET', '/api/traffic/tiles/10/815/480.png', env))!;
    expect(r.status).toBe(200); expect(r.headers['Content-Type']).toBe('image/png');
    expect(r.headers['X-Traffic-Provider']).toBe('TomTom'); expect(Buffer.isBuffer(r.body)).toBe(true);
    // Regression from the live API check: relative0 rejects thickness with HTTP 400.
    expect(new URL(String(tiles.mock.calls[0][0])).searchParams.has('thickness')).toBe(false);
  });
});

describe('truck–ship–truck playback', () => {
  const road: DrivingRoute = { id: 'test', description: '', distanceMeters: 2200, durationSeconds: 200,
    staticDurationSeconds: 100, path: [[0, 0], [1, 0], [2, 0]], warnings: [],
    trafficSections: [{ startIndex: 1, endIndex: 2, severity: 'jam', speedKmh: 3, delaySeconds: 100 }] };
  const origin: JourneyLeg = { id: 'origin', vehicle: 'truck', label: 'City to port', path: road.path, durationSeconds: 200, road };
  const sea: JourneyLeg = { id: 'sea', vehicle: 'ship', label: 'Port to port', path: [[2, 0], [5, 0]], durationSeconds: 10000 };
  const destination: JourneyLeg = { id: 'destination', vehicle: 'truck', label: 'Port to city', path: [[5, 0], [6, 0]], durationSeconds: 100 };
  it('changes vehicle in order and reaches the correct endpoint of every leg', () => {
    const legs = [origin, sea, destination];
    expect(journeyStage(legs, 0)?.leg.vehicle).toBe('truck');
    expect(journeyStage(legs, 0.5)?.leg.vehicle).toBe('ship');
    expect(journeyStage(legs, 1 - 50 / 10300)?.leg.id).toBe('destination');
    for (const l of legs) { expect(journeyPosition(l, 0).coord).toEqual(l.path[0]); expect(journeyPosition(l, 1).coord).toEqual(l.path.at(-1)); }
    expect(journeyStage([], 0)).toBeNull();
  });
  it('spends more of the road playback inside a reported slow segment', () => {
    expect(journeyPosition(origin, 0.25).coord[0]).toBeGreaterThan(1);
    expect(journeyPosition(origin, 0.75).coord[0]).toBeLessThan(2);
  });
});
