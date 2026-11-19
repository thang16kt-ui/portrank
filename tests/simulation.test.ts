import { afterEach, describe, expect, it, vi } from 'vitest';
import { departureIso, formatSimulationTime, minimumDeparture, simulationTimes } from '../src/lib/simulation';
import { journeyLegProgress, journeyStage, journeyStatus, type JourneyLeg } from '../src/lib/journey';
import { loadInlandJourney } from '../src/lib/journeyRouting';
import { inputFingerprint, planInputOf, runPlan } from '../src/lib/actions';
import { DEFAULT_FORM, useAppStore, usePlayback } from '../src/store/useAppStore';
import type { RoadDirections, RoadProvider } from '../src/providers/RoadProvider';
import type { Place } from '../src/types';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('departure selection and calendar clock', () => {
  it('converts device-local input to an API timestamp and rejects past or impossible dates', () => {
    const value = '2030-10-11T15:00';
    expect(departureIso(value, 0)).toBe(new Date(value).toISOString());
    expect(departureIso('', 0)).toBeUndefined();
    expect(() => departureIso(value, new Date('2031-01-01').getTime())).toThrow('đã qua');
    expect(() => departureIso('2030-02-30T15:00', 0)).toThrow('không hợp lệ');
    expect(() => departureIso('tomorrow', 0)).toThrow('không hợp lệ');
    expect(minimumDeparture(new Date('2030-10-11T15:00:20').getTime())).toBe('2030-10-11T15:01');
  });

  it('rolls the clock and ETA across midnight, month and year boundaries in the displayed zone', () => {
    const start = '2030-12-31T16:30:00Z'; // 23:30 in Vietnam
    const halfway = simulationTimes(start, 3600, 7200);
    expect(formatSimulationTime(halfway.current, 'Asia/Ho_Chi_Minh')).toBe('01/01/2031 · 00:30');
    expect(formatSimulationTime(halfway.arrival, 'Asia/Ho_Chi_Minh')).toBe('01/01/2031 · 01:30');
    expect(simulationTimes(start, -10, 7200).current).toBe(Date.parse(start));
    expect(simulationTimes(start, 10000, 7200).current).toBe(halfway.arrival);
    expect(formatSimulationTime(simulationTimes(undefined, 0, NaN).arrival)).toBe('—');
  });

  it('uses the same arrival regardless of playback speed or pause, including a week-long journey', () => {
    const start = '2030-10-11T08:00:00Z', total = 7 * 86400;
    const eta = simulationTimes(start, 0, total).arrival;
    for (const speed of [0.05, 0.1, 1, 5] as const) {
      usePlayback.getState().setSpeed(speed);
      usePlayback.getState().setPlaying(false);
      expect(simulationTimes(start, total / 2, total).arrival).toBe(eta);
    }
    expect(eta).toBe(Date.parse('2030-10-18T08:00:00Z'));
    usePlayback.getState().setSpeed(0.1);
  });

  it('retains departure and invalidates stale results for both road and sea inputs', () => {
    const place: Place = { kind: 'address', country: 'VN', countryName: 'Việt Nam', label: 'test', coord: [106, 10] };
    for (const mode of ['road', 'sea'] as const) {
      const form = { ...DEFAULT_FORM, mine: place, partner: place, mode, roadDepartureTime: '2099-10-11T15:00' };
      expect(planInputOf(form)?.roadDepartureTime).toBe(new Date(form.roadDepartureTime).toISOString());
      expect(inputFingerprint(form)).not.toBe(inputFingerprint({ ...form, roadDepartureTime: '2099-10-11T16:00' }));
      expect(planInputOf({ ...form, roadDepartureTime: '' })?.roadDepartureTime).toBeUndefined();
    }
  });

  it('shows an actionable error for past input before calling providers', async () => {
    const original = useAppStore.getState();
    const place: Place = { kind: 'address', country: 'VN', countryName: 'Việt Nam', label: 'test', coord: [106, 10] };
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    useAppStore.setState({ form: { ...DEFAULT_FORM, mine: place, partner: place, roadDepartureTime: '2000-01-01T12:00' } });
    try {
      await runPlan();
      expect(useAppStore.getState().planError).toContain('đã qua');
      expect(fetcher).not.toHaveBeenCalled();
    } finally { useAppStore.setState(original); }
  });
});

describe('one timeline for truck–ship–truck', () => {
  const leg = (id: JourneyLeg['id'], durationSeconds: number): JourneyLeg => ({
    id, vehicle: id === 'sea' ? 'ship' : 'truck', label: id, path: [[106, 10], [107, 11]], durationSeconds,
  });
  const legs = [leg('origin', 3600), leg('sea', 86400), leg('destination', 7200)];
  it('switches legs and seeks at their actual start times', () => {
    const total = 97200;
    expect(journeyStage(legs, 0)?.leg.id).toBe('origin');
    expect(journeyStage(legs, journeyLegProgress(legs, 1))).toMatchObject({ index: 1, progress: 0, elapsedSeconds: 3600, totalSeconds: total });
    expect(journeyStage(legs, journeyLegProgress(legs, 2))).toMatchObject({ index: 2, progress: 0, elapsedSeconds: 90000 });
    expect(journeyStage(legs, 0.5)?.elapsedSeconds).toBe(total / 2);
    expect(journeyStage(legs, 1)).toMatchObject({ index: 2, progress: 1, elapsedSeconds: total });
    expect(journeyStage([], 0)).toBeNull();
    expect(journeyStage([leg('origin', 0), leg('sea', 10)], 0)?.index).toBe(1);
    expect(journeyStage([leg('origin', 0)], 0)?.totalSeconds).toBe(0);
  });

  it('distinguishes pause, arrival, sea movement and unknown future traffic', () => {
    const truck = { ...legs[0], forecast: true };
    expect(journeyStatus(truck, 0.5, true, false)).toContain('chưa xác nhận');
    expect(journeyStatus(truck, 0.5, false, false)).toBe('Tạm dừng mô phỏng');
    expect(journeyStatus(truck, 1, false, true)).toBe('Đã đến nơi');
    expect(journeyStatus(legs[1], 0.5, true, false)).toBe('Đang đi biển');
    expect(journeyStatus(legs[0], 0.5, true, false)).toContain('chưa có dữ liệu');
  });
});

describe('sequential inland routing', () => {
  const place = (label: string): Place => ({ kind: 'address', label, country: 'VN', countryName: 'Việt Nam', coord: [106, 10] });
  const start = '2099-10-11T08:00:00Z';
  const directions = (durationSeconds: number, departureTime = start): RoadDirections => ({
    provider: 'tomtom', profile: 'DRIVE', trafficAware: true, trafficMode: 'forecast', fetchedAt: start, departureTime,
    routes: [{ id: 'truck', description: '', durationSeconds, distanceMeters: 1000, staticDurationSeconds: null, path: [[106, 10], [107, 11]], warnings: [] }],
  });
  const input = { seller: place('seller'), buyer: place('buyer'), pol: place('pol'), pod: place('pod'), seaSeconds: 86400, departureTime: start };
  it('requests the last truck at the end of the first truck and sea legs, in sequence', async () => {
    const lookup = vi.fn<RoadProvider['lookup']>().mockResolvedValueOnce(directions(3600)).mockResolvedValueOnce(directions(1800));
    const result = await loadInlandJourney(input, lookup);
    expect(lookup.mock.calls[0][0]).toMatchObject({ origin: input.seller, destination: input.pol, departureTime: start, context: 'inland' });
    expect(lookup.mock.calls[1][0]).toMatchObject({ origin: input.pod, destination: input.buyer, departureTime: '2099-10-12T09:00:00.000Z', context: 'inland' });
    expect(result.departureTime).toBe(start);
  });
  it('freezes depart-now at the provider timestamp rather than when playback rerenders', async () => {
    const lookup = vi.fn<RoadProvider['lookup']>().mockResolvedValueOnce(directions(3600)).mockResolvedValueOnce(directions(1800));
    const result = await loadInlandJourney({ ...input, departureTime: undefined }, lookup);
    expect(lookup.mock.calls[0][0].departureTime).toBeUndefined();
    expect(result.departureTime).toBe(start);
    expect(lookup.mock.calls[1][0].departureTime).toBe('2099-10-12T09:00:00.000Z');
  });
  it('does not guess a last-leg departure when the first leg fails or has no route', async () => {
    const lookup = vi.fn<RoadProvider['lookup']>().mockRejectedValueOnce(new Error('Unavailable'));
    await expect(loadInlandJourney(input, lookup)).rejects.toThrow('Unavailable');
    expect(lookup).toHaveBeenCalledTimes(1);
    lookup.mockReset().mockResolvedValue({ ...directions(3600), routes: [] });
    await expect(loadInlandJourney(input, lookup)).rejects.toThrow('đến cảng đi');
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});
