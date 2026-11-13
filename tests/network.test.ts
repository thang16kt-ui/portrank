import { describe, expect, it } from 'vitest';
import { WEIGHT_PRESETS } from '../src/config/weights';
import { PORT_BY_CODE as P } from '../src/data/ports';
import { NETWORK_COLORS, NETWORK_OTHER, buildNetwork, finishOrder, maxArrival, positionAtDay } from '../src/lib/network';
import { rankAlternatives } from '../src/lib/ranking';
import type { ShipmentInput } from '../src/types';

const shipment: ShipmentInput = { cargo: 'dry', mode: 'FCL', container: '40HC', quantity: 1, cbm: 0, weightKg: 0, woodPallet: false };
const alts = rankAlternatives({ pol: P.VNSGN, pod: P.DEHAM, radiusKm: 500, shipment, options: { avoidRedSea: false, avoidPanama: false }, weights: WEIGHT_PRESETS.balanced });
const net = buildNetwork(alts, 'dry');

describe('mạng tuyến đa cảng (V2)', () => {
  it('mọi cặp cảng quanh A × quanh B, giữ thứ tự xếp hạng', () => {
    const pols = new Set(alts.map((a) => a.pol.code)), pods = new Set(alts.map((a) => a.pod.code));
    expect(net.length).toBe(alts.length);
    expect(net.length).toBe(pols.size * pods.size);
    expect(pols.has('VNCMT') && pods.has('DEBRV')).toBe(true);
    net.forEach((r, i) => expect(r.rank).toBe(i + 1));
  });
  it('8 tuyến đầu có màu riêng, còn lại màu xám; tuyến hạng 1 nằm giữa (offset 0)', () => {
    expect(net.slice(0, 8).map((r) => r.hex)).toEqual(NETWORK_COLORS.slice(0, Math.min(8, net.length)));
    net.slice(8).forEach((r) => expect(r.hex).toBe(NETWORK_OTHER));
    expect(net[0].offsetPx).toBe(0);
    const offs = net.slice(0, 8).map((r) => r.offsetPx);
    expect(new Set(offs).size).toBe(offs.length); // không trùng làn
  });
  it('thời gian tăng dần theo quãng đường, khớp số ngày tới cảng', () => {
    for (const r of net) {
      for (let i = 1; i < r.times.length; i++) expect(r.times[i]).toBeGreaterThanOrEqual(r.times[i - 1]);
      expect(r.arrivalDays).toBeGreaterThan(r.times[r.times.length - 1]);
    }
  });
  it('vị trí tàu theo ngày; về đích theo thứ tự số ngày', () => {
    const r = net[0];
    expect(positionAtDay(r, 0).arrived).toBe(false);
    expect(positionAtDay(r, 999).arrived).toBe(true);
    const mid = positionAtDay(r, r.times[Math.floor(r.times.length / 2)]);
    expect(mid.pos[0]).toBeGreaterThan(Math.min(...r.route.coords.map((c) => c[0])) - 1e-6);
    const order = finishOrder(net);
    const fastest = [...net].sort((a, b) => a.arrivalDays - b.arrivalDays)[0];
    expect(order.get(fastest.key)).toBe(1);
    expect(maxArrival(net)).toBe(Math.max(...net.map((x) => x.arrivalDays)));
  });
  it('nhãn đặt trong khoảng 18–82% quãng đường', () => {
    net.forEach((r) => {
      expect(r.labelAt).toBeGreaterThanOrEqual(0.18 - 1e-9);
      expect(r.labelAt).toBeLessThanOrEqual(0.82 + 1e-9);
    });
  });
});
