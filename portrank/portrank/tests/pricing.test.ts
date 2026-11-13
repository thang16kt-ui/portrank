import { describe, expect, it } from 'vitest';
import { PRICING } from '../src/config/pricing';
import { PORT_BY_CODE as P } from '../src/data/ports';
import { base40, createCsvRateProvider, destThcZone, estimateQuote } from '../src/lib/pricing';
import { transitDays } from '../src/lib/transit';
import type { RouteResult, ShipmentInput } from '../src/types';

const route = (nm: number, passages: string[] = []): RouteResult => ({
  coords: [], cumNm: [], distanceNm: nm, engine: 'graph', warnings: [],
  passages: passages.map((id) => ({ id: id as never, name: id, kind: 'canal', coord: [0, 0], atNm: nm / 2 })),
});
const fcl = (p: Partial<ShipmentInput> = {}): ShipmentInput => ({ cargo: 'dry', mode: 'FCL', container: '40GP', quantity: 1, cbm: 0, weightKg: 0, woodPallet: false, ...p });

describe('pricing', () => {
  it('cước gốc 40′ = 550 + 0.27 × hải lý', () => {
    expect(base40(10000)).toBe(550 + 2700);
  });
  it('O/F 82% + BAF 18% của cước gốc; THC; chứng từ', () => {
    const q = estimateQuote({ pol: P.VNSGN, pod: P.JPTYO, route: route(2500), shipment: fcl() });
    const of = q.lines.find((l) => l.id === 'of')!.amount;
    const baf = q.lines.find((l) => l.id === 'baf')!.amount;
    expect(of + baf).toBeCloseTo(base40(2500), -1);
    expect(q.lines.find((l) => l.id === 'thc_o')!.amount).toBe(190);
    expect(q.lines.find((l) => l.id === 'thc_d')!.amount).toBe(180);
    expect(q.lines.find((l) => l.id === 'docs')!.amount).toBe(85);
  });
  it('THC đến theo khu vực: EU/Anh 260, Mỹ/Canada 420', () => {
    expect(destThcZone(P.DEHAM)).toBe('EU_UK');
    expect(destThcZone(P.GBFXT)).toBe('EU_UK');
    expect(destThcZone(P.USLAX)).toBe('US_CA');
    expect(destThcZone(P.CAVAN)).toBe('US_CA');
    expect(destThcZone(P.SGSIN)).toBe('OTHER');
  });
  it('phụ phí Suez +280/40′ và Mũi Hảo Vọng +160', () => {
    const a = estimateQuote({ pol: P.VNSGN, pod: P.DEHAM, route: route(9000), shipment: fcl() });
    const b = estimateQuote({ pol: P.VNSGN, pod: P.DEHAM, route: route(9000, ['SUEZ']), shipment: fcl() });
    const c = estimateQuote({ pol: P.VNSGN, pod: P.DEHAM, route: route(9000, ['CAPE_GOOD_HOPE']), shipment: fcl() });
    expect(b.total - a.total).toBe(280);
    expect(c.total - a.total).toBe(160);
  });
  it('hệ số container & loại hàng; DG +180/cont', () => {
    const r = route(5000);
    const g40 = estimateQuote({ pol: P.VNSGN, pod: P.SGSIN, route: r, shipment: fcl() });
    const g20 = estimateQuote({ pol: P.VNSGN, pod: P.SGSIN, route: r, shipment: fcl({ container: '20GP' }) });
    const dg = estimateQuote({ pol: P.VNSGN, pod: P.SGSIN, route: r, shipment: fcl({ cargo: 'dg', quantity: 2 }) });
    const of = (q: typeof g40) => q.lines.filter((l) => l.id === 'of' || l.id === 'baf').reduce((s, l) => s + l.amount, 0);
    expect(of(g20) / of(g40)).toBeCloseTo(0.62, 2);
    expect(of(dg) / of(g40)).toBeCloseTo(1.4 * 2, 2);
    expect(dg.lines.find((l) => l.id === 'cargo')!.amount).toBe(360);
  });
  it('khoảng giá ±12%', () => {
    const q = estimateQuote({ pol: P.VNSGN, pod: P.DEHAM, route: route(9000), shipment: fcl() });
    expect(q.low).toBe(Math.round(q.total * (1 - PRICING.rangePct)));
    expect(q.high).toBe(Math.round(q.total * (1 + PRICING.rangePct)));
  });
  it('LCL: giá/CBM = base/26 × 1.35, CFS 28/CBM, tối thiểu 1 CBM, W/M', () => {
    const r = route(4000);
    const q = estimateQuote({ pol: P.VNSGN, pod: P.SGSIN, route: r, shipment: fcl({ mode: 'LCL', cbm: 0.3, weightKg: 200 }) });
    const freight = q.lines.filter((l) => l.id === 'of' || l.id === 'baf').reduce((s, l) => s + l.amount, 0);
    expect(freight).toBeCloseTo((base40(4000) / 26) * 1.35, -1);
    expect(q.lines.find((l) => l.id === 'cfs_o')!.amount).toBe(28);
    const heavy = estimateQuote({ pol: P.VNSGN, pod: P.SGSIN, route: r, shipment: fcl({ mode: 'LCL', cbm: 2, weightKg: 5000 }) });
    expect(heavy.lines.find((l) => l.id === 'cfs_o')!.amount).toBe(140); // 5 W/M
  });
  it('thời gian: hải lý/(16×24) + 2 + 1/kênh; reefer 17 kn', () => {
    expect(transitDays(route(3840), 'dry')).toBeCloseTo(12, 6);
    expect(transitDays(route(3840, ['SUEZ']), 'dry')).toBeCloseTo(13, 6);
    expect(transitDays(route(4080), 'reefer')).toBeCloseTo(12, 6);
  });
  it('CSV RateProvider thay O/F + BAF', () => {
    const p = createCsvRateProvider('pol,pod,container,of,baf\nVNSGN,DEHAM,40GP,2000,300');
    const q = p.quote({ pol: P.VNSGN, pod: P.DEHAM, route: route(9000), shipment: fcl({ quantity: 2 }) }) as ReturnType<typeof estimateQuote>;
    expect(q.lines.find((l) => l.id === 'of')!.amount).toBe(4000);
    expect(q.provider).toBe('csv');
  });
});
