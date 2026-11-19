import { afterEach, describe, expect, it, vi } from 'vitest';
import { googleTrafficSections, handleRoad } from '../server/road.mjs';
import { journeyPosition, type JourneyLeg } from '../src/lib/journey';

afterEach(() => vi.unstubAllGlobals());

describe('Google traffic intervals', () => {
  it('keeps sea-mode inland geometry on TomTom when road mode selects Google', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ routes: [{
      summary: { lengthInMeters: 1500, travelTimeInSeconds: 240 },
      legs: [{ points: [{ longitude: 106.7, latitude: 10.77 }, { longitude: 106.71, latitude: 10.78 }] }],
    }] })));
    vi.stubGlobal('fetch', fetcher);
    const response = await handleRoad(new URL('https://local/api/road/routes?origin=106.7,10.77&destination=106.71,10.78&context=inland'),
      { ROAD_ROUTING_PROVIDER: 'google', GOOGLE_ROUTES_API_KEY: 'synthetic-google-key', TOMTOM_API_KEY: 'synthetic-inland-key' });
    expect(JSON.parse(response.body).provider).toBe('tomtom');
    expect((fetcher.mock.calls[0] as unknown as [URL])[0].origin).toBe('https://api.tomtom.com');
    expect(response.body).not.toContain('synthetic-inland-key');
  });
  it('aligns category boundaries with the returned polyline, including proto3 start zero', () => {
    expect(googleTrafficSections([
      { endPolylinePointIndex: 2, speed: 'NORMAL' },
      { startPolylinePointIndex: 2, endPolylinePointIndex: 4, speed: 'SLOW' },
      { startPolylinePointIndex: 4, endPolylinePointIndex: 5, speed: 'TRAFFIC_JAM' },
    ], 6)).toEqual([
      { startIndex: 0, endIndex: 2, severity: 'normal', speedKmh: null, delaySeconds: null },
      { startIndex: 2, endIndex: 4, severity: 'slow', speedKmh: null, delaySeconds: null },
      { startIndex: 4, endIndex: 5, severity: 'jam', speedKmh: null, delaySeconds: null },
    ]);
  });

  it('leaves missing, overlapping, unknown and invalid intervals unclassified', () => {
    expect(googleTrafficSections(undefined, 6)).toEqual([]);
    expect(googleTrafficSections([
      null,
      { endPolylinePointIndex: 2, speed: 'NORMAL' },
      { startPolylinePointIndex: 1, endPolylinePointIndex: 3, speed: 'SLOW' },
      { startPolylinePointIndex: 2, endPolylinePointIndex: 6, speed: 'TRAFFIC_JAM' },
      { startPolylinePointIndex: 2, endPolylinePointIndex: 4, speed: 'SPEED_UNSPECIFIED' },
      { startPolylinePointIndex: 2, endPolylinePointIndex: 4, speed: 'toString' },
      { startPolylinePointIndex: -1, endPolylinePointIndex: 4, speed: 'SLOW' },
      { startPolylinePointIndex: 2.5, endPolylinePointIndex: 4, speed: 'SLOW' },
    ], 6)).toHaveLength(1);
  });

  it('requests traffic categories for the chosen departure and never invents missing categories', async () => {
    const path = [[106.7, 10.77], [106.71, 10.78], [106.72, 10.79]];
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ routes: [{
      distanceMeters: 3000, duration: '900s', staticDuration: '800s',
      polyline: { geoJsonLinestring: { coordinates: path } },
      travelAdvisory: { speedReadingIntervals: [{ endPolylinePointIndex: 2, speed: 'TRAFFIC_JAM' }] },
    }] })));
    vi.stubGlobal('fetch', fetcher);
    const departure = new Date(Date.now() + 86400000).toISOString();
    const request = new URL(`https://local/api/road/routes?origin=106.7,10.77&destination=106.72,10.79&${new URLSearchParams({ departureTime: departure })}`);
    const response = await handleRoad(request, { GOOGLE_ROUTES_API_KEY: 'synthetic-server-key' });
    const data = JSON.parse(response.body);
    const options = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(options.body as string)).toMatchObject({ departureTime: departure, extraComputations: ['TRAFFIC_ON_POLYLINE'], routingPreference: 'TRAFFIC_AWARE_OPTIMAL' });
    expect((options.headers as Record<string, string>)['X-Goog-FieldMask']).toContain('routes.travelAdvisory.speedReadingIntervals');
    expect(data).toMatchObject({ trafficMode: 'forecast', departureTime: departure });
    expect(data.routes[0].trafficSections).toEqual([{ startIndex: 0, endIndex: 2, severity: 'jam', speedKmh: null, delaySeconds: null }]);
    expect(response.body).not.toContain('synthetic-server-key');
  });

  it('slows the visual marker in a congested section without modifying the provider total', () => {
    const leg: JourneyLeg = { id: 'road', label: 'test', vehicle: 'truck', path: [[0, 0], [1, 0], [2, 0]], durationSeconds: 100,
      road: { id: 'test', description: '', path: [[0, 0], [1, 0], [2, 0]], distanceMeters: 2000, durationSeconds: 100, staticDurationSeconds: null, warnings: [],
        trafficSections: [{ startIndex: 1, endIndex: 2, severity: 'jam', speedKmh: null, delaySeconds: null }] } };
    expect(journeyPosition(leg, 0.2).coord[0]).toBeCloseTo(1);
    expect(journeyPosition(leg, 0.5).coord[0]).toBeCloseTo(1.375);
    expect(leg.durationSeconds).toBe(100);
    expect(journeyPosition(leg, 1).coord[0]).toBeCloseTo(2);
  });
});
