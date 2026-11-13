import { describe, expect, it } from 'vitest';
import { PORT_BY_CODE as P } from '../src/data/ports';
import { findRoute } from '../src/lib/routing';
import { evaluateRules } from '../src/lib/rules';
import type { ShipmentInput } from '../src/types';

const sh = (p: Partial<ShipmentInput> = {}): ShipmentInput => ({ cargo: 'dry', mode: 'FCL', container: '40HC', quantity: 1, cbm: 0, weightKg: 0, woodPallet: true, ...p });
const ids = (pol: string, pod: string, s = sh(), avoidRedSea = false) =>
  new Set(evaluateRules({ pol: P[pol], pod: P[pod], route: findRoute(P[pol], P[pod], { avoidRedSea, avoidPanama: false }), shipment: s, avoidRedSea }).map((i) => i.ruleId));

describe('rule engine', () => {
  it('VN → EU: ENS, EVFTA, VGM, ISPM15, cảnh báo Biển Đỏ', () => {
    const r = ids('VNSGN', 'DEHAM');
    for (const k of ['base-docs', 'vgm', 'ispm15', 'eu-ens', 'vn-eu-co', 'red-sea']) expect(r.has(k)).toBe(true);
  });
  it('Tránh Biển Đỏ → cảnh báo tuyến vòng Mũi Hảo Vọng', () => {
    const r = ids('VNSGN', 'DEHAM', sh(), true);
    expect(r.has('cape')).toBe(true);
    expect(r.has('red-sea')).toBe(false);
  });
  it('Mỹ: ISF; Canada: eManifest; Kenya PVoC; Nigeria SONCAP; Úc kiểm dịch', () => {
    expect(ids('VNHPH', 'USLAX').has('us-isf')).toBe(true);
    expect(ids('VNHPH', 'CAVAN').has('ca-emanifest')).toBe(true);
    expect(ids('CNSHA', 'KEMBA').has('ke-pvoc')).toBe(true);
    expect(ids('CNSHA', 'NGLOS').has('ng-soncap')).toBe(true);
    expect(ids('VNSGN', 'AUMEL').has('au-bio')).toBe(true);
  });
  it('LCL không cần VGM; reefer/DG/OOG có checklist riêng', () => {
    expect(ids('VNSGN', 'SGSIN', sh({ mode: 'LCL' })).has('vgm')).toBe(false);
    expect(ids('VNSGN', 'SGSIN', sh({ cargo: 'reefer' })).has('reefer')).toBe(true);
    expect(ids('VNSGN', 'SGSIN', sh({ cargo: 'dg' })).has('dg')).toBe(true);
    expect(ids('VNSGN', 'SGSIN', sh({ cargo: 'oog' })).has('oog')).toBe(true);
    expect(ids('VNSGN', 'SGSIN').has('vn-asean-co')).toBe(true);
  });
});
