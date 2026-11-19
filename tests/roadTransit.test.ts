import { describe, expect, it, vi } from 'vitest';
import { roadTransitCountries } from '../src/lib/roadCountries';
import { buildPlan, type PlanInput } from '../src/lib/plan';
import { inputFingerprint, planInputOf } from '../src/lib/actions';
import { quoteText } from '../src/components/ResultPanel';
import { rankOptions } from '../src/lib/ranking';
import { WEIGHT_PRESETS } from '../src/config/weights';
import { DEFAULT_FORM } from '../src/store/useAppStore';
import { createTableRateProvider } from '../src/providers/RateProvider';
import { createUserTariffProvider } from '../src/providers/TariffProvider';
import type { RoadDirections } from '../src/providers/RoadProvider';
import type { LngLat, Place } from '../src/types';
import { ServerRoadProvider } from '../src/providers/RoadProvider';

const a: Place = { kind: 'address', label: 'Test A', country: 'VN', countryName: 'Việt Nam', coord: [106.7, 10.77] };
const b: Place = { ...a, label: 'Test B', coord: [105.84, 21.03] };
const via: Place = { ...a, label: 'Test via', coord: [108.2, 16.05] };
// Deliberately synthetic geometry through the interiors of Cambodia and Laos.
const transitPath: LngLat[] = [a.coord, [105, 12], [106, 16], b.coord];

describe('OSRM transit screening', () => {
  it('detects Cambodia and Laos even with two Vietnamese endpoints', async () => {
    expect((await roadTransitCountries(transitPath, ['VN', 'VN'])).sort()).toEqual(['KH', 'LA']);
  });
  it('does not invent a foreign crossing for a route inside southern Vietnam', async () => {
    expect(await roadTransitCountries([[106.7, 10.77], [106.35, 10.4], [105.78, 10.03]], ['VN'])).toEqual([]);
  });
  it('treats destination countries as endpoints rather than extra transit countries', async () => {
    expect(await roadTransitCountries([[105, 12], [106, 16]], ['KH', 'LA'])).toEqual([]);
  });
  it('marks transit fees as unknown and the total incomplete instead of charging zero domestic clearance', async () => {
    const input = planInputOf({ ...DEFAULT_FORM, role: 'seller', mode: 'road', mine: a, partner: b }) as PlanInput;
    const directions: RoadDirections = { provider: 'osrm', profile: 'DRIVE', trafficAware: false, fetchedAt: '2026-11-19T01:00:00Z', departureTime: '2026-11-19T01:00:00Z', routes: [{ id: 'transit-test', description: 'Synthetic transit route', distanceMeters: 1500000, durationSeconds: 70000, staticDurationSeconds: 70000, path: transitPath, warnings: [] }] };
    const plan = await buildPlan(input, { road: { lookup: async () => directions }, rates: createTableRateProvider([]), tariffs: createUserTariffProvider([]) });
    const o = plan.options[0];
    expect(o.roadTransitCountries?.sort()).toEqual(['KH', 'LA']);
    expect(o.completeness).toBe('partial');
    for (const n of [3, 4, 7]) expect(o.items[n - 1].amount).toBeNull();
    expect(o.missing.join(' ')).toContain('quá cảnh');
    const quote = quoteText(plan, rankOptions(plan.options, 'FCA', 'seller', WEIGHT_PRESETS.balanced)[0], 'FCA');
    expect(quote).toContain('CHƯA tính phí quá cảnh');
    expect(quote).toContain('Tuyến có dấu hiệu đi qua');
    expect(quote).toContain('CHƯA ĐỦ');
  });
  it('includes the waypoint in stale-result detection and passes it to the route provider', async () => {
    const form = { ...DEFAULT_FORM, mode: 'road' as const, mine: a, partner: b };
    expect(inputFingerprint(form)).not.toBe(inputFingerprint({ ...form, roadVia: via }));
    expect(planInputOf({ ...form, roadVia: via })?.roadVia).toEqual(via);
    expect(planInputOf({ ...form, mode: 'sea', roadVia: via })?.roadVia).toBeUndefined();
    const lookup = vi.fn(async (_query: unknown) => { throw new Error('test-stop'); });
    await expect(buildPlan(planInputOf({ ...form, roadVia: via })!, { road: { lookup }, rates: createTableRateProvider([]), tariffs: createUserTariffProvider([]) })).rejects.toThrow('test-stop');
    expect(lookup.mock.calls[0][0]).toMatchObject({ via });
  });
  it.each(['VN', 'TH', 'AU'])('keeps both domestic and transit alternatives with their own distance/time for %s', async (country) => {
    const input = planInputOf({ ...DEFAULT_FORM, role: 'seller', mode: 'road', mine: { ...a, country }, partner: { ...b, country } })!;
    const base = { description: 'Synthetic', staticDurationSeconds: 70000, warnings: [] };
    const directions: RoadDirections = { provider: 'tomtom', profile: 'DRIVE', trafficAware: true, fetchedAt: '', departureTime: '', routes: [
      { ...base, id: 'foreign', distanceMeters: 1300000, durationSeconds: 60000, path: transitPath, countryCodes: [country, 'LA', 'KH'] },
      { ...base, id: 'domestic', distanceMeters: 1650000, durationSeconds: 85000, path: [a.coord, b.coord], countryCodes: [country] },
    ] };
    const plan = await buildPlan(input, { road: { lookup: async () => directions }, rates: createTableRateProvider([]), tariffs: createUserTariffProvider([]) });
    expect(plan.options).toHaveLength(2);
    const local = plan.options.find((o) => o.key === 'road:domestic')!;
    const foreign = plan.options.find((o) => o.key === 'road:foreign')!;
    expect(local.title).toContain('Nội địa');
    expect(local.roadKm).toBe(1650);
    expect(local.days.total * 86400).toBeCloseTo(85000);
    expect(local.roadTransitCountries).toEqual([]);
    expect(foreign.title).toContain('Quá cảnh');
    expect(foreign.roadKm).toBe(1300);
    expect(foreign.days.total * 86400).toBeCloseTo(60000);
    expect(foreign.completeness).toBe('partial');
    expect(rankOptions(plan.options, 'FCA', 'seller', WEIGHT_PRESETS.balanced)[0].option.key).toBe(local.key);
  });
  it.each(['tomtom', 'osrm', 'google'] as const)('preserves transit alternatives with a notice when %s returns no domestic route', async (provider) => {
    const input = planInputOf({ ...DEFAULT_FORM, mode: 'road', mine: a, partner: b })!;
    const directions: RoadDirections = { provider, profile: 'DRIVE', trafficAware: false, fetchedAt: '', departureTime: '', routes: [
      { id: 'foreign', description: '', distanceMeters: 1300000, durationSeconds: 60000, staticDurationSeconds: null, path: transitPath, warnings: [] },
    ] };
    const plan = await buildPlan(input, { road: { lookup: async () => directions }, rates: createTableRateProvider([]), tariffs: createUserTariffProvider([]) });
    expect(plan.options).toHaveLength(1);
    expect(plan.options[0].title).toContain('Quá cảnh');
    expect(plan.notes.join(' ')).toContain('chưa trả được phương án nội địa');
  });
  it('requests border avoidance for domestic endpoints and domestic waypoints, including inland legs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
    try {
      await ServerRoadProvider.lookup({ origin: a, destination: b, via, context: 'inland' });
      const query = new URL(String(fetchMock.mock.calls[0][0]), 'https://test.invalid').searchParams;
      expect(query.get('domesticCountry')).toBe('VN');
      expect(query.has('includeTransit')).toBe(false);
    } finally { fetchMock.mockRestore(); }
  });
  it.each(['VN', 'TH', 'AU'])('supplements the normal alternatives with domestic routing for every same-country pair (%s)', async (country) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
    try {
      await ServerRoadProvider.lookup({ origin: { ...a, country }, destination: { ...b, country } });
      const query = new URL(String(fetchMock.mock.calls[0][0]), 'https://test.invalid').searchParams;
      expect(query.get('domesticCountry')).toBe(country);
      expect(query.get('includeTransit')).toBe('true');
    } finally { fetchMock.mockRestore(); }
  });
  it('does not impose domestic routing on international endpoints or an explicitly foreign waypoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
    try {
      await ServerRoadProvider.lookup({ origin: a, destination: { ...b, country: 'LA' } });
      await ServerRoadProvider.lookup({ origin: a, destination: b, via: { ...via, country: 'LA' } });
      for (const [request] of fetchMock.mock.calls) expect(new URL(String(request), 'https://test.invalid').searchParams.has('domesticCountry')).toBe(false);
    } finally { fetchMock.mockRestore(); }
  });
});
