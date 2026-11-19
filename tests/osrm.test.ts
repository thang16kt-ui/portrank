import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPlan, type PlanInput } from '../src/lib/plan';
import { roadTrack } from '../src/lib/track';
import { quoteText } from '../src/components/ResultPanel';
import { rankOptions } from '../src/lib/ranking';
import { WEIGHT_PRESETS } from '../src/config/weights';
import { createTableRateProvider } from '../src/providers/RateProvider';
import { createUserTariffProvider } from '../src/providers/TariffProvider';
import type { RoadDirections } from '../src/providers/RoadProvider';
import type { Place } from '../src/types';

// Synthetic protocol fixtures, never presented as measurements of a real trip.
const path = [[106.7, 10.77], [107, 12], [108.2, 16.05], [105.84, 21.03]];
const route = (mode = 'driving', distance = 1500123, duration = 73234) => ({
  distance, duration, geometry: { type: 'LineString', coordinates: path },
  legs: [{ summary: 'Test route', steps: [{ mode }] }],
});
const fixture = (routes = [route()]) => ({ code: 'Ok', waypoints: [{ distance: 4 }, { distance: 2 }], routes });
const env = { ROAD_ROUTING_PROVIDER: 'osrm-demo', GOOGLE_ROUTES_API_KEY: 'do-not-send', GOOGLE_MAPS_BROWSER_KEY: 'do-not-send-browser' };
const url = '/api/road/routes?origin=106.7,10.77&destination=105.84,21.03';
let api: typeof import('../server/api.mjs').handleApi;
const bodyOf = async (target = url) => {
  const response = (await api('GET', target, env))!;
  return { ...response, data: JSON.parse(response.body) };
};
const stub = (body: unknown = fixture(), status = 200) => {
  const f = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', f);
  return f;
};
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-19T02:00:00Z'));
  api = (await import('../server/api.mjs')).handleApi;
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('OSRM demo server boundary', () => {
  it('opts in without a key and keeps all Google keys out of public config and upstream requests', async () => {
    const f = stub();
    const config = await bodyOf('/api/road/config');
    expect(config.data).toEqual({ configured: true, provider: 'osrm', profile: 'DRIVE', trafficAware: false, demo: true, browserKey: '' });
    expect(config.body).not.toContain('do-not-send');
    expect(f).not.toHaveBeenCalled();
    const result = await bodyOf();
    expect(result.status).toBe(200);
    const [target, options] = f.mock.calls[0] as unknown as [string, RequestInit];
    const requestUrl = new URL(target);
    expect(requestUrl.origin + requestUrl.pathname).toBe('https://router.project-osrm.org/route/v1/driving/106.7,10.77;105.84,21.03');
    expect(Object.fromEntries(requestUrl.searchParams)).toEqual({ overview: 'full', geometries: 'geojson', alternatives: 'true', steps: 'true', generate_hints: 'false' });
    expect(JSON.stringify(options.headers)).toContain('PortRank-Prototype');
    expect(JSON.stringify(options.headers)).toContain('https://portrank-road-google-maps.onrender.com/');
    expect(JSON.stringify(options)).not.toContain('do-not-send');
    expect(result.headers['Cache-Control']).toBe('no-store');
  });
  it('preserves distance, duration and geometry for each alternative without claiming traffic', async () => {
    stub(fixture([route(), route('driving', 1600000, 80000)]));
    const result = await bodyOf(`${url}&departureTime=2030-01-01T09:00:00Z`);
    expect(result.data).toMatchObject({ provider: 'osrm', trafficAware: false, demo: true, cached: false });
    expect(result.data.routes).toHaveLength(2);
    expect(result.data.routes[0]).toMatchObject({ distanceMeters: 1500123, durationSeconds: 73234, path });
    expect(result.data.routes[1]).toMatchObject({ distanceMeters: 1600000, durationSeconds: 80000, path });
    // OSRM cannot predict travel at the selected future time.
    expect(result.data.departureTime).toBe('2026-11-19T02:00:00.000Z');
  });
  it('rejects invalid input before contacting the fixed upstream', async () => {
    const f = stub();
    expect((await bodyOf('/api/road/routes?origin=181,10&destination=105,21')).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
  it('validates an optional waypoint and requests both driving legs in the chosen order', async () => {
    const data = fixture();
    data.waypoints.push({ distance: 3 });
    data.routes[0].legs.push({ summary: 'Second leg', steps: [{ mode: 'driving' }] });
    const f = stub(data);
    expect((await bodyOf(`${url}&via=181,10`)).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
    const result = await bodyOf(`${url}&via=108.2,16.05`);
    expect(result.status).toBe(200);
    expect((f.mock.calls[0] as unknown as [string])[0]).toContain('/106.7,10.77;108.2,16.05;105.84,21.03?');
    expect(result.data.routes[0].description).toBe('Test route → Second leg');
  });
  it('does not return the direct cached route for a request with a waypoint', async () => {
    const f = stub();
    await bodyOf();
    await vi.advanceTimersByTimeAsync(1100);
    const data = fixture();
    data.waypoints.push({ distance: 0 });
    data.routes[0].legs.push({ summary: 'Via', steps: [{ mode: 'driving' }] });
    f.mockImplementation(async () => new Response(JSON.stringify(data)));
    expect((await bodyOf(`${url}&via=108.2,16.05`)).data.cached).toBe(false);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('filters ferry/train alternatives and keeps a continuous driving route', async () => {
    stub(fixture([route('ferry'), route('driving'), route('train')]));
    const result = await bodyOf();
    expect(result.status).toBe(200);
    expect(result.data.routes).toHaveLength(1);
    expect(result.data.routes[0].id).toBe('osrm-road-1');
  });
  it('rejects a journey containing a ferry inside a mixed driving leg', async () => {
    const mixed = route();
    mixed.legs[0].steps.push({ mode: 'ferry' });
    stub(fixture([mixed]));
    const result = await bodyOf();
    expect(result.status).toBe(422);
    expect(result.data.error).toContain('phà/tàu');
    expect(result.data.routes).toBeUndefined();
  });
  it.each([['NoRoute', 200], ['NoSegment', 400]] as const)('returns 404 for %s without inventing a straight route', async (code, status) => {
    stub({ code }, status);
    const result = await bodyOf();
    expect(result.status).toBe(404);
    expect(result.data.routes).toBeUndefined();
  });
  it('rejects a snapped point over 5 km away instead of silently moving the address', async () => {
    stub({ ...fixture(), waypoints: [{ distance: 5001 }, { distance: 2 }] });
    expect((await bodyOf()).status).toBe(422);
  });
  it.each(['duration', 'geometry', 'steps', 'waypoints'])('rejects malformed %s data', async (field) => {
    const data = fixture();
    if (field === 'duration') data.routes[0].duration = -1;
    if (field === 'geometry') data.routes[0].geometry.coordinates = [[181, 91], [105, 21]];
    if (field === 'steps') data.routes[0].legs[0].steps = [];
    if (field === 'waypoints') data.waypoints = [];
    stub(data);
    expect((await bodyOf()).status).toBe(502);
  });
  it('reuses a 5-minute server cache, keeps the acquisition time, and expires it', async () => {
    const f = stub();
    const first = await bodyOf();
    await vi.advanceTimersByTimeAsync(2000);
    const cached = await bodyOf();
    expect(cached.data.cached).toBe(true);
    expect(cached.data.fetchedAt).toBe(first.data.fetchedAt);
    expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(300000);
    const fresh = await bodyOf();
    expect(fresh.data.cached).toBe(false);
    expect(fresh.data.fetchedAt).not.toBe(first.data.fetchedAt);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('does not reuse the forward journey for the reverse direction', async () => {
    const f = stub();
    await bodyOf();
    await vi.advanceTimersByTimeAsync(1100);
    expect((await bodyOf('/api/road/routes?origin=105.84,21.03&destination=106.7,10.77')).data.cached).toBe(false);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('limits all cache misses to one request per 1.1 seconds', async () => {
    const f = stub({ code: 'NoRoute' });
    await bodyOf();
    const denied = await bodyOf();
    expect(denied.status).toBe(429);
    expect(denied.headers['Retry-After']).toBe('2');
    await vi.advanceTimersByTimeAsync(1100);
    expect((await bodyOf()).status).toBe(404);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('permits only one in-flight request and releases the gate afterwards', async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => { resolve = r; })));
    const pending = bodyOf();
    await vi.advanceTimersByTimeAsync(1200);
    expect((await bodyOf()).status).toBe(429);
    resolve(new Response(JSON.stringify(fixture())));
    expect((await pending).status).toBe(200);
    stub({ code: 'NoRoute' });
    expect((await bodyOf('/api/road/routes?origin=105,20&destination=106,21')).status).toBe(404);
  });
  it('times out cleanly, hides upstream secrets, and releases the request gate', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('secret upstream detail', 'AbortError')));
    })));
    const pending = bodyOf();
    await vi.advanceTimersByTimeAsync(20001);
    const result = await pending;
    expect(result.status).toBe(502);
    expect(result.body).not.toContain('secret upstream detail');
    stub();
    expect((await bodyOf()).status).toBe(200);
  });
});

it('uses OSRM distance/time/path coherently in the plan, animation and copied quote', async () => {
  stub();
  const directions = (await bodyOf()).data as RoadDirections;
  const origin: Place = { kind: 'address', label: 'Test A', country: 'VN', countryName: 'Việt Nam', coord: [106.7, 10.77] };
  const input: PlanInput = { role: 'seller', mine: origin, partner: { ...origin, label: 'Test B', coord: [105.84, 21.03] }, mode: 'road', shipment: { cargo: 'dry', mode: 'FCL', container: '40HC', quantity: 1, cbm: 0, weightKg: 1500, woodPallet: false }, goodsValue: 0, valueTerm: 'EXW', hs: '', origin: '', hasCo: false, readyDate: '2026-11-19', radiusKm: 400, avoidRedSea: false, avoidPanama: false, carriers: [] };
  const plan = await buildPlan(input, { road: { lookup: async () => directions }, rates: createTableRateProvider([]), tariffs: createUserTariffProvider([]) });
  const option = plan.options[0];
  expect(option.roadKm).toBe(1500.123);
  expect(option.roadPath).toEqual(path);
  expect(option.days.total * 86400).toBeCloseTo(73234);
  expect(roadTrack(option)!.total).toBeCloseTo(option.days.total);
  expect(option.items[1].amount).toBe(0);
  expect(option.items[8].amount).toBe(0);
  const ranked = rankOptions(plan.options, 'FCA', 'seller', WEIGHT_PRESETS.balanced);
  const quote = quoteText(plan, ranked[0], 'FCA');
  expect(quote).toContain('OpenStreetMap / OSRM');
  expect(quote).toContain('chưa xét kẹt xe');
  expect(quote).toContain('Không dự báo theo giờ đi');
  expect(quote).not.toContain('Google Maps');
});
