import { describe, expect, it } from 'vitest';
import { PORT_BY_CODE as P } from '../src/data/ports';
import { arcPath } from '../src/lib/arc';
import { findRoute } from '../src/lib/routing';
import { scheduleTrack, seaTrack, trackPosition } from '../src/lib/track';
import { parseScheduleRows } from '../src/providers/ScheduleProvider';
import { parseCsv } from '../src/lib/csv';
import { buildScene, type PortGrid } from '../src/components/map/portScene';

const opts = { avoidRedSea: false, avoidPanama: false };

describe('đường cong nối hai cảng', () => {
  it('không vẽ ngang bản đồ khi qua kinh tuyến 180°', () => {
    const p = arcPath(P.CNSHA.coord, P.USLAX.coord);
    for (let i = 1; i < p.length; i++) expect(Math.abs(p[i][0] - p[i - 1][0])).toBeLessThan(20);
    expect(p[p.length - 1][0]).toBeCloseTo(P.USLAX.coord[0] + 360, 6);
  });
  it('bắt đầu/kết thúc đúng tại hai cảng', () => {
    const p = arcPath(P.VNCMT.coord, P.DEHAM.coord);
    expect(p[0][0]).toBeCloseTo(P.VNCMT.coord[0], 6);
    expect(p[0][1]).toBeCloseTo(P.VNCMT.coord[1], 6);
    expect(p[p.length - 1][0]).toBeCloseTo(P.DEHAM.coord[0], 6);
    expect(p[p.length - 1][1]).toBeCloseTo(P.DEHAM.coord[1], 6);
  });
});

describe('lộ trình hãng tàu', () => {
  const csv = 'carrier,service,vessel,voyage,pol,etd,cutoff_cy,ts1_port,ts1_eta,ts1_etd,pod,eta,free_days,source\nMAEU,AE1,TAU A,001W,VNCMT,2026-12-01,2026-11-29,SGSIN,2026-12-03,2026-12-06,DEHAM,2027-01-05,14,Nhập tay\nXXXX,AE1,,,VNCMT,2026-12-01,,,,,DEHAM,2027-01-05,,';
  const { entries, errors } = parseScheduleRows(parseCsv(csv), '2026-11-17');
  it('đọc CSV, bỏ dòng hãng không rõ', () => {
    expect(entries).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(entries[0]).toMatchObject({ carrier: 'MAERSK', pol: 'VNCMT', pod: 'DEHAM', etd: '2026-12-01', eta: '2027-01-05', freeDays: 14 });
    expect(entries[0].transshipments).toEqual([{ port: 'SGSIN', eta: '2026-12-03', etd: '2026-12-06', vessel: '' }]);
  });
  it('vẽ đúng chặng qua cảng chuyển tải, dùng ngày thật, tàu dừng tại cảng chuyển tải', () => {
    const t = scheduleTrack(entries[0], opts)!;
    expect(t.estimated).toBe(false);
    expect(t.total).toBe(35);
    expect(t.stops).toHaveLength(1);
    expect(t.stops[0]).toMatchObject({ code: 'SGSIN', arrive: 2, depart: 5 });
    const a = trackPosition(t, 3), b = trackPosition(t, 4.5);
    expect(a.pos[0]).toBeCloseTo(b.pos[0], 6);
    expect(a.pos[1]).toBeCloseTo(b.pos[1], 6);
    for (let i = 1; i < t.times.length; i++) expect(t.times[i]).toBeGreaterThanOrEqual(t.times[i - 1]);
  });
  it('tuyến ước tính: ngày = hải lý / (16 × 24) + 1 ngày mỗi kênh đào', () => {
    const r = findRoute(P.VNCMT, P.DEHAM, opts);
    const t = seaTrack(r, 'dry');
    const canals = r.passages.filter((p) => ['SUEZ', 'PANAMA', 'KIEL'].includes(p.id)).length;
    expect(t.total).toBeCloseTo(r.distanceNm / 384 + canals, 6);
    expect(t.estimated).toBe(true);
  });
});

describe('cảnh cảng 3D', () => {
  // lưới 30×20: nửa dưới (j < 8) là nước, phía trên là bãi công nghiệp
  const nx = 30, ny = 20;
  const cells = Array.from({ length: nx * ny }, (_, k) => (Math.floor(k / nx) < 8 ? 'W' : 'I')) as PortGrid['cells'];
  const grid: PortGrid = { center: [106.8, 10.7], step: 40, nx, ny, cells };
  it('cẩu dọc mép bến hướng ra nước, container trong bãi, có tàu đậu', () => {
    const s = buildScene('TEST', grid, { craneCount: 6 });
    expect(s.cranes).toHaveLength(6);
    for (const c of s.cranes) expect(Math.abs(((c.bearing - 180 + 540) % 360) - 180)).toBeLessThan(30);
    expect(s.stats.stacks).toBeGreaterThan(50);
    // mép nước nằm giữa hàng 7 và 8 = 80 m phía nam tâm → container phải nằm trên bờ
    expect(s.boxes.every((b) => (b.pos[1] - 10.7) * 111320 > -80)).toBe(true);
    expect(s.ships.length).toBeGreaterThan(0);
  });
  it('không có nước → không có cẩu, không bịa', () => {
    const dry: PortGrid = { ...grid, cells: grid.cells.map(() => 'I') as PortGrid['cells'] };
    const s = buildScene('DRY', dry);
    expect(s.cranes).toHaveLength(0);
    expect(s.ships).toHaveLength(0);
  });
});
