import { describe, expect, it } from 'vitest';
import { roadAvailability } from '../src/data/landBlocks';
import { searchCountries } from '../src/data/countries';
import { searchCities } from '../src/data/cities';
import { candidatePorts } from '../src/lib/candidates';
import { buildPlan, type PlanInput } from '../src/lib/plan';
import { roadRoutes } from '../src/lib/road';
import { createTableRateProvider } from '../src/providers/RateProvider';
import { createUserTariffProvider } from '../src/providers/TariffProvider';
import { photonToPlace } from '../src/providers/GeocodingProvider';
import type { Place } from '../src/types';

const deps = { rates: createTableRateProvider([]), tariffs: createUserTariffProvider([]) };
const VN: Place = { kind: 'country', label: 'Việt Nam', country: 'VN', countryName: 'Việt Nam', coord: [106, 16] };
const DE: Place = { kind: 'country', label: 'Đức', country: 'DE', countryName: 'Đức', coord: [10, 51] };
const BD: Place = { kind: 'address', label: 'Bình Dương, Việt Nam', country: 'VN', countryName: 'Việt Nam', coord: [106.67, 11.17] };
const MU: Place = { kind: 'address', label: 'Munich, Đức', country: 'DE', countryName: 'Đức', coord: [11.58, 48.14] };
const BKK: Place = { kind: 'address', label: 'Bangkok, Thái Lan', country: 'TH', countryName: 'Thái Lan', coord: [100.5, 13.76] };
const LA: Place = { kind: 'country', label: 'Lào', country: 'LA', countryName: 'Lào', coord: [103, 18] };
const input = (mine: Place, partner: Place, p: Partial<PlanInput> = {}): PlanInput => ({
  role: 'seller', mine, partner, mode: 'sea',
  shipment: { cargo: 'dry', mode: 'FCL', container: '40HC', quantity: 1, cbm: 0, weightKg: 0, woodPallet: false },
  goodsValue: 50000, valueTerm: 'FOB', hs: '940360', origin: '', hasCo: false, readyDate: '2026-11-20', radiusKm: 400,
  avoidRedSea: false, avoidPanama: false, carriers: [], ...p,
});
const inlandItems = [1, 2, 9, 10];

describe('nhập liệu hai nhánh', () => {
  it('tìm quốc gia không dấu / tiếng Anh; tìm thành phố', () => {
    expect(searchCountries('viet nam')[0].iso2).toBe('VN');
    expect(searchCountries('Đức')[0].iso2).toBe('DE');
    expect(searchCountries('germany')[0].iso2).toBe('DE');
    expect(searchCities('binh duong')[0].country).toBe('VN');
    expect(searchCities('Munich')[0].country).toBe('DE');
  });
  it('Photon: cấp quốc gia → nhánh A, thành phố/địa chỉ → nhánh B', () => {
    const c = photonToPlace({ geometry: { coordinates: [10, 51] }, properties: { type: 'country', name: 'Germany', countrycode: 'DE' } })!;
    expect(c.kind).toBe('country');
    const a = photonToPlace({ geometry: { coordinates: [11.5, 48.1] }, properties: { type: 'city', name: 'Munich', state: 'Bavaria', countrycode: 'DE' } })!;
    expect(a.kind).toBe('address');
    expect(a.label).toBe('Munich, Bavaria, Đức');
  });
});

describe('cảng ứng viên', () => {
  it('nhánh A: mọi cảng của nước đó', () => {
    const c = candidatePorts(VN, 400).ports;
    expect(c.every((p) => p.country === 'VN')).toBe(true);
    expect(c.length).toBeGreaterThanOrEqual(4);
  });
  it('nước không giáp biển → cảng gần nhất của nước láng giềng + ghi chú', () => {
    const c = candidatePorts(LA, 400);
    expect(c.ports.length).toBe(3);
    expect(c.ports.every((p) => p.country !== 'LA')).toBe(true);
    expect(c.notes[0]).toContain('không có cảng');
  });
  it('nhánh B: trong bán kính R, không có thì 3 cảng gần nhất (kể cả nước láng giềng)', () => {
    expect(candidatePorts(BD, 400).ports.map((p) => p.code)).toEqual(expect.arrayContaining(['VNSGN', 'VNCMT']));
    const mu = candidatePorts(MU, 400);
    expect(mu.ports).toHaveLength(3);
    expect(mu.ports.some((p) => p.country !== 'DE')).toBe(true);
    expect(mu.notes[0]).toContain('3 cảng gần nhất');
  });
});

describe('buildPlan – tiêu chí hoàn thành', () => {
  it('Nhánh A "Việt Nam" → "Đức": mọi cặp cảng VN × DE, cảng đến cảng, không có khoản nội địa', async () => {
    const plan = await buildPlan(input(VN, DE), deps);
    expect(plan.scopeTitle).toBe('Chi phí cảng đến cảng');
    expect(plan.options.length).toBe(plan.originPorts.length * plan.destPorts.length);
    for (const o of plan.options) {
      expect(o.pol!.country).toBe('VN');
      expect(o.pod!.country).toBe('DE');
      for (const n of inlandItems) expect(o.items[n - 1].amount).toBeNull();
    }
  });
  it('Nhánh B "Bình Dương" → "Munich": ≥ 4 phương án, có nội địa hai đầu', async () => {
    const plan = await buildPlan(input(BD, MU), deps);
    expect(plan.scopeTitle).toBe('Chi phí cửa đến cửa');
    expect(plan.options.length).toBeGreaterThanOrEqual(4);
    for (const o of plan.options) for (const n of inlandItems) expect(o.items[n - 1].amount).toBeGreaterThan(0);
    expect(plan.options[0].days.inlandO).toBeGreaterThan(0);
    expect(plan.options[0].days.inlandD).toBeGreaterThan(0);
  });
  it('Hỗn hợp "Bình Dương" → "Đức": chỉ cộng nội địa ở đầu Việt Nam', async () => {
    const plan = await buildPlan(input(BD, DE), deps);
    expect(plan.scopeTitle).toContain('kho đến cảng');
    for (const o of plan.options) {
      expect(o.items[1].amount).toBeGreaterThan(0);
      expect(o.items[8].amount).toBeNull();
    }
  });
  it('mọi khoản ước tính trừ khi có giá thật; giá thật ghi đè cước biển', async () => {
    const rates = createTableRateProvider([{ id: '1', pol: 'VNCMT', pod: 'DEHAM', container: '40HC', freight: 1000, surcharges: 200, validFrom: '2026-11-01', validTo: '2026-12-31', carrier: '', source: 'FWD' }]);
    const plan = await buildPlan(input(VN, DE), { ...deps, rates });
    const hit = plan.options.find((o) => o.key === 'VNCMT>DEHAM')!;
    expect(hit.items[4].amount).toBe(1200);
    expect(hit.items[4].estimated).toBe(false);
    expect(hit.items[4].badge).toContain('Giá thật · FWD');
    expect(plan.options.filter((o) => o.key !== 'VNCMT>DEHAM').every((o) => o.items[4].estimated && !o.rate)).toBe(true);
  });
  it('thời gian = nội địa + chờ tàu + biển + làm hàng + nội địa', async () => {
    const plan = await buildPlan(input(BD, MU), deps);
    const d = plan.options[0].days;
    expect(d.total).toBeCloseTo(d.inlandO + d.wait + d.main + d.handling + d.inlandD, 6);
  });
  it('thuế: không có biểu thuế → "Chưa có dữ liệu"; có biểu thuế → tính kèm nguồn', async () => {
    const a = await buildPlan(input(VN, DE), deps);
    expect(a.options[0].duty.status).toBe('no-data');
    const tariffs = createUserTariffProvider([{ id: 't', importCountry: 'EU', hs: '9403', origin: '*', rateType: 'MFN', fta: '', dutyPct: 2.7, vatPct: 19, otherPct: 0, source: 'TARIC', effectiveDate: '', updatedAt: '2026-11-01', verified: true }]);
    const b = await buildPlan(input(VN, DE), { ...deps, tariffs });
    const o = b.options[0];
    expect(o.duty.status).toBe('ok');
    expect(o.duty.entry!.source).toBe('TARIC');
    expect(o.duty.customsValue).toBeCloseTo(o.value.cif, 2);
    // khoản 8 = thông quan + thuế + VAT, khớp đến cent với tổng thuế
    expect(o.items[7].amount).toBeCloseTo(120 + o.duty.duty + o.duty.vat, 2);
    expect(o.items[7].amount).toBeCloseTo(120 + o.duty.total, 2);
  });
});

describe('đường bộ', () => {
  it('chỉ dùng được khi cùng khối lục địa', () => {
    expect(roadAvailability('VN', 'TH').ok).toBe(true);
    expect(roadAvailability('VN', 'DE').ok).toBe(true);
    expect(roadAvailability('VN', 'JP').ok).toBe(false);
    expect(roadAvailability('VN', 'US').ok).toBe(false);
    expect(roadAvailability('VN', 'KR').ok).toBe(false);
  });
  it('Việt Nam → Thái Lan đi qua cửa khẩu (Campuchia hoặc Lào)', () => {
    const r = roadRoutes(BD.coord, 'VN', BKK.coord, 'TH');
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].gates.length).toBeGreaterThanOrEqual(2);
    expect(r[0].straight).toBe(false);
  });
  it('thiếu dữ liệu cửa khẩu → một tuyến thẳng', () => {
    const r = roadRoutes([0, 0], 'XX', [1, 1], 'YY');
    expect(r).toHaveLength(1);
    expect(r[0].straight).toBe(true);
  });
  it('phương án đường bộ: nhãn khoản 4/5/7 khác, thời gian = km/500 + 1 ngày/cửa khẩu', async () => {
    const plan = await buildPlan(input(BD, BKK, { mode: 'road' }), deps);
    expect(plan.input.mode).toBe('road');
    const o = plan.options[0];
    expect(o.mode).toBe('road');
    expect(o.items[4].lines[0].label).toContain('Cước xe');
    expect(o.days.total).toBeCloseTo(o.roadKm! / 500 + o.gates!.length, 6);
  });
  it('chọn đường bộ khi không nối được → tự về đường biển', async () => {
    const plan = await buildPlan(input(BD, MU, { mode: 'road', mine: { ...BD }, partner: { kind: 'address', label: 'Tokyo', country: 'JP', countryName: 'Nhật Bản', coord: [139.69, 35.68] } }), deps);
    expect(plan.input.mode).toBe('sea');
  });
});
