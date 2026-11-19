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
});
