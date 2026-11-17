import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { dcsaCarriers, handleApi } from '../server/api.mjs';
import { aggregateCredits } from '../src/components/map/mapLayers';
import { dcsaToSchedule, type DcsaPointToPoint } from '../src/lib/dcsa';
import { scheduleTrack } from '../src/lib/track';
import {
  htsLeaves, parsePercent, parseUkCommodity, parseUkHeadingLeaves, UkTariffSource, UsHtsSource, usEntry, usSpecialRate, type HtsRow,
} from '../src/lib/tariffSources';
import ukCommodity from './fixtures/uk-commodity-9403609000.json';
import ukHeading from './fixtures/uk-heading-9403.json';
import usHts from './fixtures/us-hts-9403.60.json';

/* Dữ liệu fixtures là phản hồi THẬT của UK Trade Tariff API và USITC HTS REST (lấy ngày 17/11/2026). */

describe('parsePercent', () => {
  it('chỉ nhận thuế dạng %', () => {
    expect(parsePercent('0.00 %')).toBe(0);
    expect(parsePercent('Free')).toBe(0);
    expect(parsePercent('4.4%')).toBe(4.4);
    expect(parsePercent('6.50 % + 33.40 GBP / 100 kg')).toBeNull();
    expect(parsePercent('4.4¢/kg')).toBeNull();
    expect(parsePercent(null)).toBeNull();
  });
});

describe('UK Trade Tariff', () => {
  it('heading 9403: các mã 10 số dưới 940360 kèm mô tả có cấp cha', () => {
    const leaves = parseUkHeadingLeaves(ukHeading as never).filter((l) => l.code.startsWith('940360'));
    expect(leaves.map((l) => l.code)).toEqual(['9403601000', '9403603000', '9403609000']);
    expect(leaves[2].description).toContain('Other wooden furniture');
  });
  it('commodity 9403609000: MFN, VAT 20%, ưu đãi theo xuất xứ', () => {
    const vn = parseUkCommodity(ukCommodity as never, 'VN');
    expect(vn.code).toBe('9403609000');
    expect(vn.mfn?.pct).toBe(0);
    expect(vn.mfn?.areaId).toBe('1011');
    expect(vn.vat?.pct).toBe(20);
    expect(vn.pref).toBeTruthy();
    // Một nước không có hiệp định với Anh trong dữ liệu → không có ưu đãi
    expect(parseUkCommodity(ukCommodity as never, 'IQ').pref).toBeUndefined();
  });

  describe('lookup qua fetch (giả lập bằng fixtures)', () => {
    afterEach(() => vi.unstubAllGlobals());
    const stub = () =>
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        const body = url.endsWith('/headings/9403') ? ukHeading : url.endsWith('/commodities/9403609000') ? ukCommodity : null;
        return { ok: !!body, status: body ? 200 : 404, json: async () => body } as Response;
      }));
    it('mã 6 số có nhiều dòng thuế → trả danh sách để chọn', async () => {
      stub();
      const r = await UkTariffSource.lookup({ importCountry: 'GB', hs: '940360', origin: 'VN', preferFta: true });
      expect(r.entry).toBeNull();
      expect(r.choices?.map((c) => c.code)).toEqual(['9403601000', '9403603000', '9403609000']);
    });
    it('mã 10 số → mức thuế kèm nguồn chính thức, ngày lấy, VAT', async () => {
      stub();
      const r = await UkTariffSource.lookup({ importCountry: 'GB', hs: '9403609000', origin: 'VN', preferFta: false });
      expect(r.error).toBeUndefined();
      expect(r.entry).toMatchObject({ importCountry: 'GB', hs: '9403609000', dutyPct: 0, vatPct: 20, verified: true, rateType: 'MFN' });
      expect(r.entry!.source).toBe('https://www.trade-tariff.service.gov.uk/commodities/9403609000');
      expect(r.entry!.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
    it('mã không tồn tại → báo lỗi, không đoán thuế', async () => {
      stub();
      const r = await UkTariffSource.lookup({ importCountry: 'GB', hs: '9403608000', origin: 'VN', preferFta: false });
      expect(r.entry).toBeNull();
      expect(r.error).toContain('không có trong biểu thuế Anh');
    });
  });
});

describe('US HTS', () => {
  const rows = usHts as HtsRow[];
  it('lấy các dòng có thuế suất khớp mã HS', () => {
    const l = htsLeaves(rows, '940360');
    expect(l.length).toBeGreaterThanOrEqual(2);
    expect(l.every((x) => x.general != null && x.general !== '')).toBe(true);
    expect(htsLeaves(rows, '94036040').map((x) => x.htsno)).toEqual(['9403.60.40.00']);
  });
  it('cột Special: chỉ áp cho xuất xứ có FTA với Mỹ', () => {
    expect(usSpecialRate('Free (A,AU,BH,CL,CO,D,E,IL,JO,KR,MA,OM,P,PA,PE,S,SG)', 'AU')).toBe(0);
    expect(usSpecialRate('Free (A,AU,BH,CL)', 'VN')).toBeNull();
    expect(usSpecialRate('2% (KR) 1.5% (AU)', 'AU')).toBe(1.5);
  });
  it('mức thuế MFN kèm cảnh báo thuế bổ sung Chương 99 và không có VAT', () => {
    const row = htsLeaves(rows, '94036040')[0];
    const { entry, notes } = usEntry(row, 'VN', true);
    expect(entry).toMatchObject({ importCountry: 'US', dutyPct: 0, vatPct: 0, rateType: 'MFN', verified: true });
    expect(notes.join(' ')).toContain('Chương 99');
    expect(notes.join(' ')).toContain('không có VAT');
  });
  it('lookup gọi qua trung gian /api/hts, không gọi thẳng hts.usitc.gov', async () => {
    const f = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => usHts }) as Response);
    vi.stubGlobal('fetch', f);
    const r = await UsHtsSource.lookup({ importCountry: 'US', hs: '94036040', origin: 'VN', preferFta: false });
    expect(String(f.mock.calls[0][0])).toMatch(/^\/api\/hts\/search\?keyword=9403\.60$/);
    expect(r.entry?.hs).toBe('9403604000');
    vi.unstubAllGlobals();
  });
});

/* ───────────── DCSA Commercial Schedules 1.0 ───────────── */

const sample: DcsaPointToPoint = {
  placeOfReceipt: { facilityTypeCode: 'POTE', location: { UNLocationCode: 'VNCMT' }, dateTime: '2026-12-01T10:00:00+07:00' },
  placeOfDelivery: { facilityTypeCode: 'POTE', location: { UNLocationCode: 'DEHAM' }, dateTime: '2027-01-05T08:00:00+01:00' },
  receiptTypeAtOrigin: 'CY',
  deliveryTypeAtDestination: 'CY',
  cutOffTimes: [
    { cutOffDateTimeCode: 'DCO', cutOffDateTime: '2026-11-28T12:00:00+07:00' },
    { cutOffDateTimeCode: 'VCO', cutOffDateTime: '2026-11-29T12:00:00+07:00' },
    { cutOffDateTimeCode: 'FCO', cutOffDateTime: '2026-11-30T12:00:00+07:00' },
  ],
  solutionNumber: 1,
  transitTime: 35,
  legs: [
    {
      sequenceNumber: 2,
      transport: { modeOfTransport: 'VESSEL', servicePartners: [{ carrierCode: 'MSK', carrierServiceName: 'AE1 Shogun', carrierExportVoyageNumber: '450W' }], vessel: { name: 'TAU LON', vesselIMONumber: '9778791' } },
      departure: { facilityTypeCode: 'POTE', location: { UNLocationCode: 'SGSIN' }, dateTime: '2026-12-06T18:00:00+08:00' },
      arrival: { facilityTypeCode: 'POTE', location: { UNLocationCode: 'DEHAM' }, dateTime: '2027-01-05T08:00:00+01:00' },
    },
    {
      sequenceNumber: 1,
      transport: { modeOfTransport: 'VESSEL', servicePartners: [{ carrierServiceCode: 'FEEDER1', carrierExportVoyageNumber: '012S' }], vessel: { name: 'FEEDER A', vesselIMONumber: '9000001' } },
      departure: { facilityTypeCode: 'POTE', location: { UNLocationCode: 'VNCMT' }, dateTime: '2026-12-01T10:00:00+07:00' },
      arrival: { facilityTypeCode: 'POTE', location: { UNLocationCode: 'SGSIN' }, dateTime: '2026-12-03T06:00:00+08:00' },
    },
    {
      sequenceNumber: 3,
      transport: { modeOfTransport: 'TRUCK' },
      departure: { facilityTypeCode: 'POTE', location: { UNLocationCode: 'DEHAM' }, dateTime: '2027-01-06T08:00:00+01:00' },
      arrival: { facilityTypeCode: 'CLOC', location: { UNLocationCode: 'DEMUC' }, dateTime: '2027-01-07T08:00:00+01:00' },
    },
  ],
};

describe('DCSA → lộ trình PortRank', () => {
  it('chặng tàu theo sequenceNumber, cảng chuyển tải, cut-off DCO/VCO/FCO', () => {
    const e = dcsaToSchedule(sample, 'MAERSK', 0, '2026-11-17')!;
    expect(e).toMatchObject({
      carrier: 'MAERSK', service: 'FEEDER1', vessel: 'FEEDER A', voyage: '012S', pol: 'VNCMT', pod: 'DEHAM',
      etd: '2026-12-01', eta: '2027-01-05', cutoffDoc: '2026-11-28', cutoffVgm: '2026-11-29', cutoffCy: '2026-11-30', fetchedAt: '2026-11-17',
    });
    expect(e.transshipments).toEqual([{ port: 'SGSIN', eta: '2026-12-03', etd: '2026-12-06', vessel: 'TAU LON' }]);
    expect(e.source).toContain('DCSA');
  });
  it('vẽ được chặng thật trên bản đồ, tàu dừng ở Singapore', () => {
    const t = scheduleTrack(dcsaToSchedule(sample, 'MAERSK')!, { avoidRedSea: false, avoidPanama: false })!;
    expect(t.estimated).toBe(false);
    expect(t.stops[0]).toMatchObject({ code: 'SGSIN', arrive: 2, depart: 5 });
  });
  it('thiếu ngày → bỏ qua, không tự điền', () => {
    const bad = { ...sample, legs: sample.legs.map((l) => ({ ...l, departure: { ...l.departure, dateTime: undefined } })) };
    expect(dcsaToSchedule(bad, 'MAERSK')).toBeNull();
  });
});

/* ───────────── Máy chủ trung gian /api ───────────── */

describe('server/api.mjs', () => {
  let base = '';
  const seen: { url: string; headers: IncomingMessage['headers'] }[] = [];
  const mock = createServer((req, res) => {
    seen.push({ url: req.url ?? '', headers: req.headers });
    if (req.headers['consumer-key'] !== 'secret-123') {
      res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ message: 'bad key secret-123?' }));
      return;
    }
    const u = new URL(req.url ?? '/', 'http://x');
    if (u.searchParams.get('cursor') === 'PAGE2') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify([{ ...sample, solutionNumber: 2 }]));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Next-Page-Cursor': 'PAGE2' }).end(JSON.stringify([sample]));
  });
  beforeAll(async () => {
    await new Promise<void>((r) => mock.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
  });
  afterAll(() => mock.close());
  const env = () => ({ DCSA_CARRIERS: 'MAERSK,CMACGM', DCSA_MAERSK_URL: `${base}/`, DCSA_MAERSK_HEADERS: '{"Consumer-Key":"secret-123"}', DCSA_CMACGM_URL: base, DCSA_CMACGM_KEY: 'wrong', DCSA_CMACGM_KEY_HEADER: 'KeyId' });

  it('cấu hình hãng từ biến môi trường', () => {
    const c = dcsaCarriers(env());
    expect(c.map((x) => [x.id, x.ok])).toEqual([['MAERSK', true], ['CMACGM', true]]);
    expect(c[1].headers).toEqual({ KeyId: 'wrong' });
    expect(dcsaCarriers({ DCSA_CARRIERS: 'ZIM' })[0].ok).toBe(false);
  });
  it('/api/config không lộ key', async () => {
    const r = (await handleApi('GET', '/api/config', env()))!;
    expect(r.status).toBe(200);
    expect(r.body).not.toContain('secret-123');
    expect(JSON.parse(r.body)).toEqual({ server: true, hts: true, dcsa: [{ id: 'MAERSK', configured: true }, { id: 'CMACGM', configured: true }] });
  });
  it('/api/schedules: gọi GET /v1/point-to-point-routes đúng tham số, gửi key, theo Next-Page-Cursor', async () => {
    seen.length = 0;
    const r = (await handleApi('GET', '/api/schedules?pol=VNCMT&pod=DEHAM&from=2026-11-20&carrier=MAERSK', env()))!;
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.results[0].carrier).toBe('MAERSK');
    expect(body.results[0].routes).toHaveLength(2);
    expect(seen[0].url).toBe('/v1/point-to-point-routes?placeOfReceipt=VNCMT&placeOfDelivery=DEHAM&limit=50&departureStartDate=2026-11-20');
    expect(seen[0].headers['api-version']).toBe('1');
    // trang sau chỉ gửi cursor (theo đặc tả DCSA)
    expect(seen[1].url).toBe('/v1/point-to-point-routes?cursor=PAGE2');
  });
  it('hãng từ chối key → báo lỗi riêng hãng đó, không chuyển tiếp nội dung lỗi', async () => {
    const r = (await handleApi('GET', '/api/schedules?pol=VNCMT&pod=DEHAM&from=2026-11-20', env()))!;
    const body = JSON.parse(r.body);
    const cma = body.results.find((x: { carrier: string }) => x.carrier === 'CMACGM');
    expect(cma.routes).toEqual([]);
    expect(cma.error).toContain('401');
    expect(r.body).not.toContain('secret-123');
    expect(body.results.find((x: { carrier: string }) => x.carrier === 'MAERSK').routes.length).toBe(2);
  });
  it('kiểm tra đầu vào', async () => {
    expect((await handleApi('GET', '/api/schedules?pol=VN&pod=DEHAM', env()))!.status).toBe(400);
    expect((await handleApi('GET', '/api/schedules?pol=VNCMT&pod=DEHAM&from=20-11-2026', env()))!.status).toBe(400);
    expect((await handleApi('GET', '/api/hts/search?keyword=abc;rm', env()))!.status).toBe(400);
    expect((await handleApi('POST', '/api/config', env()))!.status).toBe(405);
    expect(await handleApi('GET', '/index.html', env())).toBeNull();
  });
});

describe('ghi công Google 3D Tiles', () => {
  it('tách theo ";", gộp và sắp theo số lần xuất hiện', () => {
    expect(aggregateCredits(['Google; Airbus', 'Google', 'Landsat / Copernicus; Airbus', 'Google', ''])).toBe('Google; Airbus; Landsat / Copernicus');
  });
});
