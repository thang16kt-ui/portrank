import { describe, expect, it } from 'vitest';
import { PORT_BY_CODE as P } from '../src/data/ports';
import { findRoute, hasPassage, dijkstra } from '../src/lib/routing';
import { bearing, densify, haversineKm, unwrapLongitudes } from '../src/lib/geo';

const opts = { avoidRedSea: false, avoidPanama: false };

describe('geo', () => {
  it('haversine ~ khoảng cách đã biết', () => {
    // Singapore – Hồng Kông ≈ 2.580 km
    expect(haversineKm([103.82, 1.35], [114.17, 22.32])).toBeGreaterThan(2500);
    expect(haversineKm([103.82, 1.35], [114.17, 22.32])).toBeLessThan(2650);
  });
  it('bearing: đi về phía Đông = 90°', () => {
    expect(bearing([0, 0], [10, 0])).toBeCloseTo(90, 5);
    expect(bearing([0, 0], [0, 10])).toBeCloseTo(0, 5);
  });
  it('unwrap kinh độ qua 180°', () => {
    const u = unwrapLongitudes([[170, 0], [179, 0], [-179, 0], [-170, 0]]);
    expect(u.map((c) => c[0])).toEqual([170, 179, 181, 190]);
  });
  it('densify ~20 km/điểm', () => {
    const d = densify([[100, 0], [110, 0]], 20);
    const step = haversineKm(d[0], d[1]);
    expect(step).toBeLessThanOrEqual(20.5);
    expect(d.length).toBeGreaterThan(50);
  });
});

describe('dijkstra', () => {
  it('tìm đường ngắn nhất trên đồ thị nhỏ', () => {
    // 0 -1- 1 -1- 2 ; 0 -5- 2
    const adj = [[{ to: 1, w: 1 }, { to: 2, w: 5 }], [{ to: 0, w: 1 }, { to: 2, w: 1 }], [{ to: 1, w: 1 }, { to: 0, w: 5 }]];
    const r = dijkstra({ n: 3, adj, sources: [{ node: 0, cost: 0 }], targets: new Map([[2, 0]]), blocked: () => false });
    expect(r?.path).toEqual([0, 1, 2]);
    expect(r?.cost).toBe(2);
  });
});

describe('findRoute (searoute)', () => {
  it('Cát Lái → Hamburg đi qua Suez, ~9.000–10.500 hải lý', () => {
    const r = findRoute(P.VNSGN, P.DEHAM, opts);
    expect(r.engine).toBe('searoute');
    expect(r.distanceNm).toBeGreaterThan(9000);
    expect(r.distanceNm).toBeLessThan(10500);
    expect(hasPassage(r, 'SUEZ')).toBe(true);
    expect(hasPassage(r, 'MALACCA')).toBe(true);
  });
  it('Tránh Biển Đỏ → vòng Mũi Hảo Vọng, dài hơn', () => {
    const a = findRoute(P.VNSGN, P.DEHAM, opts);
    const b = findRoute(P.VNSGN, P.DEHAM, { avoidRedSea: true, avoidPanama: false });
    expect(hasPassage(b, 'SUEZ')).toBe(false);
    expect(hasPassage(b, 'CAPE_GOOD_HOPE')).toBe(true);
    expect(b.distanceNm).toBeGreaterThan(a.distanceNm + 2000);
  });
  it('Hải Phòng → Los Angeles đi thẳng Thái Bình Dương (qua 180°), không vòng thế giới', () => {
    const r = findRoute(P.VNHPH, P.USLAX, opts);
    expect(r.distanceNm).toBeGreaterThan(6500);
    expect(r.distanceNm).toBeLessThan(8000);
    // kinh độ liên tục: không có bước nhảy > 180°
    for (let i = 1; i < r.coords.length; i++) expect(Math.abs(r.coords[i][0] - r.coords[i - 1][0])).toBeLessThan(5);
  });
  it('Tránh Panama: Cái Mép → New York không qua Panama', () => {
    const r = findRoute(P.VNCMT, P.USNYC, { avoidRedSea: true, avoidPanama: true });
    expect(hasPassage(r, 'PANAMA')).toBe(false);
    expect(hasPassage(r, 'SUEZ')).toBe(false);
  });
  it('đủ 6 cặp kiểm thử, tính trong < 1 giây', () => {
    const pairs = [['VNSGN', 'DEHAM'], ['VNHPH', 'USLAX'], ['VNCMT', 'USNYC'], ['SGSIN', 'BRSSZ'], ['CNSHA', 'NGLOS'], ['VNSGN', 'AUMEL']];
    for (const [a, b] of pairs) {
      const t = performance.now();
      const r = findRoute(P[a], P[b], { avoidRedSea: false, avoidPanama: false, engine: 'searoute' });
      expect(performance.now() - t).toBeLessThan(1000);
      expect(r.coords.length).toBeGreaterThan(100);
      expect(r.cumNm[r.cumNm.length - 1]).toBeCloseTo(r.distanceNm, 6);
    }
  });
});

describe('findRoute (đồ thị dự phòng)', () => {
  it('bỏ cạnh BAB-RED / RED-SUEZ khi tránh Biển Đỏ', () => {
    const a = findRoute(P.VNSGN, P.DEHAM, { ...opts, engine: 'graph' });
    const b = findRoute(P.VNSGN, P.DEHAM, { avoidRedSea: true, avoidPanama: false, engine: 'graph' });
    expect(a.engine).toBe('graph');
    expect(hasPassage(a, 'SUEZ')).toBe(true);
    expect(hasPassage(b, 'SUEZ')).toBe(false);
    expect(hasPassage(b, 'CAPE_GOOD_HOPE')).toBe(true);
  });
});
