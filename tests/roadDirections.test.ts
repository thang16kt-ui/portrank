import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleApi } from '../server/api.mjs';
import { roadAvailability } from '../src/data/landBlocks';
import { GoogleRoadProvider } from '../src/providers/RoadProvider';
import { createTableRateProvider } from '../src/providers/RateProvider';
import { createUserTariffProvider } from '../src/providers/TariffProvider';
import { buildPlan, type PlanInput } from '../src/lib/plan';
import { fmtDrivingDistance, fmtDuration } from '../src/lib/format';
import { DEFAULT_FORM, useAppStore } from '../src/store/useAppStore';
import { inputFingerprint, runPlan } from '../src/lib/actions';
import type { Place } from '../src/types';

// Synthetic protocol fixture; these numbers are not advertised as a real journey or benchmark.
const origin: Place = { kind: 'address', label: 'Hồ Chí Minh', country: 'VN', countryName: 'Việt Nam', coord: [106.7, 10.77] };
const destination: Place = { ...origin, label: 'Hà Nội', coord: [105.84, 21.03] };
const path = [origin.coord, [107, 12], [106, 17], destination.coord];
const route = { distanceMeters: 1500123, duration: '73234s', staticDuration: '70000s', polyline: { geoJsonLinestring: { type: 'LineString', coordinates: path } }, description: 'Đường kiểm thử', warnings: [] };
const url = `/api/road/routes?origin=${origin.coord.join(',')}&destination=${destination.coord.join(',')}`;
const env = { GOOGLE_ROUTES_API_KEY: 'server-test-secret', GOOGLE_MAPS_BROWSER_KEY: 'public-browser-test' };
const bodyOf = async (path: string, settings = env) => {
  const response = (await handleApi('GET', path, settings))!;
  return { ...response, data: JSON.parse(response.body) };
};
const stub = (body: unknown, status = 200) => {
  const f = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', f);
  return f;
};
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Google Routes server boundary', () => {
  it('does not call a billable API without a key and never exposes the Routes key in configuration', async () => {
    const f = stub({});
    expect((await bodyOf(url, { GOOGLE_ROUTES_API_KEY: '', GOOGLE_MAPS_BROWSER_KEY: '' })).status).toBe(503);
    const config = await bodyOf('/api/road/config');
    expect(config.data).toMatchObject({ configured: true, browserKey: env.GOOGLE_MAPS_BROWSER_KEY });
    expect(config.body).not.toContain(env.GOOGLE_ROUTES_API_KEY);
    expect((await bodyOf('/api/config')).body).not.toContain(env.GOOGLE_ROUTES_API_KEY);
    expect(f).not.toHaveBeenCalled();
  });
  it('rejects invalid coordinates and past departure times before querying Google', async () => {
    const f = stub({});
    for (const point of ['181,10', '106,91', 'NaN,10', '106,', 'https://example.com'])
      expect((await bodyOf(`/api/road/routes?origin=${point}&destination=105,21`)).status).toBe(400);
    expect((await bodyOf(`${url}&departureTime=2000-01-01T00:00:00Z`)).status).toBe(400);
    expect((await bodyOf(`${url}&departureTime=tomorrow`)).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
  it('requests traffic-aware distances, time and the same geometry in one call, with explicit lat/lng conversion', async () => {
    const f = stub({ routes: [route, { ...route, distanceMeters: 1600000, duration: '75000s' }] });
    const departureTime = new Date(Date.now() + 3600000).toISOString();
    const result = await bodyOf(`${url}&${new URLSearchParams({ departureTime })}`);
    expect(result.status).toBe(200);
    expect(result.headers['Cache-Control']).toBe('no-store');
    const [target, request] = (f.mock.calls[0] as unknown as [string, RequestInit]);
    expect(target).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(JSON.parse(request.body as string)).toMatchObject({
      origin: { location: { latLng: { latitude: 10.77, longitude: 106.7 } } },
      destination: { location: { latLng: { latitude: 21.03, longitude: 105.84 } } },
      departureTime, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
      routeModifiers: { avoidFerries: true }, polylineEncoding: 'GEO_JSON_LINESTRING', computeAlternativeRoutes: true,
    });
    expect(result.data.routes[0]).toMatchObject({ distanceMeters: 1500123, durationSeconds: 73234, staticDurationSeconds: 70000, path });
    expect(result.data.routes[1]).toMatchObject({ distanceMeters: 1600000, durationSeconds: 75000 });
    expect(result.body).not.toContain(env.GOOGLE_ROUTES_API_KEY);
  });
  it('lets Google choose the current departure time instead of sending an already-past server timestamp', async () => {
    const f = stub({ routes: [route] });
    await bodyOf(url);
    const request = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(request.body as string)).not.toHaveProperty('departureTime');
  });
  it('returns no-route, malformed data and upstream errors without a guessed distance or leaking upstream secrets', async () => {
    stub({ routes: [] });
    expect((await bodyOf(url)).status).toBe(404);
    stub({ routes: [{ ...route, duration: 'invalid' }] });
    expect((await bodyOf(url)).status).toBe(404);
    stub({ error: { message: env.GOOGLE_ROUTES_API_KEY } }, 403);
    const denied = await bodyOf(url);
    expect(denied.status).toBe(502);
    expect(denied.body).not.toContain(env.GOOGLE_ROUTES_API_KEY);
    expect(denied.data).not.toHaveProperty('routes');
  });
  it('handles a network timeout without reverting to a straight line', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('timeout', 'AbortError'); }));
    const result = await bodyOf(url);
    expect(result.status).toBe(502);
    expect(result.data.error).toContain('quá thời gian chờ');
    expect(result.data).not.toHaveProperty('routes');
  });
  it('caps concurrent billable requests and releases slots after completion', async () => {
    vi.resetModules();
    const { handleApi: freshApi } = await import('../server/api.mjs');
    const releases: (() => void)[] = [];
    const f = vi.fn(() => new Promise<Response>((resolve) => releases.push(() => resolve(new Response(JSON.stringify({ routes: [route] }))))));
    vi.stubGlobal('fetch', f);
    const pending = Array.from({ length: 4 }, () => freshApi('GET', url, env));
    expect((await freshApi('GET', url, env))!.status).toBe(429);
    expect(f).toHaveBeenCalledTimes(4);
    releases.forEach((resolve) => resolve());
    expect((await Promise.all(pending)).every((r) => r!.status === 200)).toBe(true);
    stub({ routes: [route] });
    expect((await freshApi('GET', url, env))!.status).toBe(200);
  });
});

describe('road plan and client', () => {
  const input: PlanInput = { role: 'seller', mine: origin, partner: destination, mode: 'road', shipment: { cargo: 'dry', mode: 'FCL', container: '40HC', quantity: 1, cbm: 0, weightKg: 1500, woodPallet: false }, goodsValue: 0, valueTerm: 'EXW', hs: '', origin: '', hasCo: false, readyDate: '2026-11-18', radiusKm: 400, avoidRedSea: false, avoidPanama: false, carriers: [] };
  const deps = { rates: createTableRateProvider([]), tariffs: createUserTariffProvider([]) };
  it('keeps each alternate route distance/time together, uses hours and leaves Google geometry out of MapLibre', async () => {
    const { data } = await (async () => { stub({ routes: [route, { ...route, distanceMeters: 1600000, duration: '75000s' }] }); return bodyOf(url); })();
    const plan = await buildPlan(input, { ...deps, road: { lookup: async () => data } });
    expect(plan.options).toHaveLength(2);
    for (const [i, option] of plan.options.entries()) {
      expect(option.roadKm).toBe(data.routes[i].distanceMeters / 1000);
      expect(option.days.main * 86400).toBeCloseTo(data.routes[i].durationSeconds);
      expect(option.drivingRoute!.path).toEqual(path);
      expect(option.roadPath).toBeUndefined();
      expect(option.items[1].amount).toBe(0);
      expect(option.items[8].amount).toBe(0);
    }
    expect(fmtDuration(73234)).toBe('20 giờ 21 phút');
    expect(fmtDuration(1200)).toBe('20 phút');
    expect(fmtDuration(0)).toBe('0 phút');
    expect(fmtDrivingDistance(120)).toBe('120 m');
    expect(plan.notes.join(' ')).toContain('chưa xác nhận');
  });
  it('supports domestic road requests in Australia, Japan and Korea', () => {
    for (const country of ['AU', 'JP', 'KR']) expect(roadAvailability(country, country).ok).toBe(true);
    expect(roadAvailability('VN', 'JP').ok).toBe(false);
    expect(roadAvailability('VN', 'KR').ok).toBe(false);
  });
  it('requires a concrete place, and does not turn a country centroid into a road distance', async () => {
    const lookup = vi.fn();
    await expect(buildPlan({ ...input, mine: { ...origin, kind: 'country' } }, { ...deps, road: { lookup } })).rejects.toThrow('thành phố hoặc địa chỉ');
    expect(lookup).not.toHaveBeenCalled();
  });
  it('detects HTML from static hosting and does not fall back to the old Haversine model', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>app</html>', { headers: { 'Content-Type': 'text/html' } })));
    await expect(GoogleRoadProvider.lookup({ origin, destination })).rejects.toThrow('Bản chạy tĩnh');
    await expect(buildPlan(input, deps)).rejects.toThrow('Bản chạy tĩnh');
  });
  it('marks changed departure times as stale and removes old results when a new request fails', async () => {
    const form = { ...DEFAULT_FORM, mode: 'road' as const, mine: origin, partner: destination };
    expect(inputFingerprint(form)).not.toBe(inputFingerprint({ ...form, roadDepartureTime: '2026-12-01T09:30' }));
    const previous = useAppStore.getState();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Google không trả tuyến' }), { status: 404, headers: { 'Content-Type': 'application/json' } })));
    try {
      useAppStore.setState({ form, plan: { input } as never, planKey: 'old', selectedKey: 'old' });
      await runPlan();
      expect(useAppStore.getState().plan).toBeNull();
      expect(useAppStore.getState().planError).toContain('Google không trả tuyến');
      expect(useAppStore.getState().selectedKey).toBeNull();
      expect(log).toHaveBeenCalled();
    } finally { useAppStore.setState(previous); }
  });
});
