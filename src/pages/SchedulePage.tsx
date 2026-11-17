import { useState } from 'react';
import { CARRIERS, findCarrier } from '../data/carriers';
import { PORT_BY_CODE } from '../data/ports';
import { daysSince, downloadText, fmtDateVi, toCsv, todayIso } from '../lib/csv';
import { SCHEDULE_CSV_HEADER, SCHEDULE_STALE_DAYS, parseScheduleRows, type ScheduleEntry } from '../providers/ScheduleProvider';
import { useAppStore } from '../store/useAppStore';
import { useDataStore } from '../store/useDataStore';
import { ErrorList, Field, ImportButton, PageShell, PortSelect } from './shared';

const plus = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

/** File mẫu: 2 dòng VÍ DỤ được đánh dấu rõ là không phải lịch thật – để thử luồng nhập lịch */
function sampleCsv() {
  const S = 'FILE MAU - KHONG PHAI LICH THAT';
  return toCsv([
    SCHEDULE_CSV_HEADER,
    ['MAEU', 'MAU-VI-DU-1', 'TAU MAU 01', '001W', 'VNCMT', plus(7), plus(5), plus(4), plus(4), 'SGSIN', plus(10), plus(13), 'TAU MAU 02', '', '', '', '', 'DEHAM', plus(40), 14, S],
    ['CMDU', 'MAU-VI-DU-2', 'TAU MAU 03', '002W', 'VNCMT', plus(9), plus(7), plus(6), plus(6), '', '', '', '', '', '', '', '', 'DEHAM', plus(38), 10, S],
  ]);
}

const blank = (): ScheduleEntry => ({
  id: '', carrier: 'MAERSK', service: '', vessel: '', voyage: '', pol: 'VNCMT', pod: 'DEHAM', etd: '', eta: '', cutoffCy: '', cutoffDoc: '', cutoffVgm: '',
  transshipments: [], freeDays: null, source: 'Nhập tay', fetchedAt: todayIso(),
});

/** Trang "Lịch tàu": nhập tay hoặc import CSV. PortRank KHÔNG tự sinh lịch tàu. */
export default function SchedulePage() {
  const schedules = useDataStore((s) => s.schedules);
  const { addSchedules, removeSchedule, clearSchedules } = useDataStore.getState();
  const showToast = useAppStore((s) => s.showToast);
  const [d, setD] = useState<ScheduleEntry>(blank);
  const [ts, setTs] = useState({ port: '', eta: '', etd: '', vessel: '' });
  const [errors, setErrors] = useState<string[]>([]);
  const add = () => {
    if (!d.etd || !d.eta) return showToast('Nhập ETD và ETA');
    if (d.eta < d.etd) return showToast('ETA phải sau ETD');
    if (d.pol === d.pod) return showToast('Cảng đi và cảng đến phải khác nhau');
    addSchedules([{ ...d, id: Math.random().toString(36).slice(2, 10), transshipments: ts.port ? [ts] : [], fetchedAt: todayIso() }]);
    setD(blank());
    setTs({ port: '', eta: '', etd: '', vessel: '' });
    showToast('Đã thêm lộ trình');
  };
  return (
    <PageShell
      title="Lịch tàu"
      intro={<>Nhập lộ trình (routing) cụ thể của hãng tàu: dịch vụ, tàu, chuyến, cut-off, ETD, cảng chuyển tải, ETA. Khi chọn một tuyến có lịch, kết quả hiện dòng thời gian theo ngày thật và bản đồ vẽ đúng các chặng. <b className="text-fg">PortRank không tự sinh lịch tàu</b>; hãng chưa có dữ liệu sẽ ghi “Chưa có lịch tàu”.</>}
      actions={
        <>
          <ImportButton label="⬆ Import CSV" onRows={(rows) => { const r = parseScheduleRows(rows, todayIso()); setErrors(r.errors); if (r.entries.length) addSchedules(r.entries); showToast(`Đã nhập ${r.entries.length} lộ trình`); }} />
          <button className="btn" onClick={() => downloadText('portrank-lich-tau-mau.csv', sampleCsv())}>⬇ File mẫu CSV</button>
          {schedules.length > 0 && <button className="btn" onClick={() => confirm('Xoá toàn bộ lịch tàu?') && clearSchedules()}>🗑 Xoá hết</button>}
        </>
      }
    >
      <ErrorList errors={errors} />
      <section className="card p-3">
        <h2 className="mb-2 text-[13px] font-semibold text-fg">Nhập tay một lộ trình</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <Field label="Hãng tàu">
            <select className="field" value={d.carrier} onChange={(e) => setD({ ...d, carrier: e.target.value })}>{CARRIERS.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.scac})</option>)}</select>
          </Field>
          <Field label="Dịch vụ"><input className="field" value={d.service} onChange={(e) => setD({ ...d, service: e.target.value })} /></Field>
          <Field label="Tên tàu"><input className="field" value={d.vessel} onChange={(e) => setD({ ...d, vessel: e.target.value })} /></Field>
          <Field label="Số chuyến"><input className="field" value={d.voyage} onChange={(e) => setD({ ...d, voyage: e.target.value })} /></Field>
          <Field label="Cảng đi"><PortSelect value={d.pol} onChange={(pol) => setD({ ...d, pol })} /></Field>
          <Field label="Cảng đến"><PortSelect value={d.pod} onChange={(pod) => setD({ ...d, pod })} /></Field>
          <Field label="Cut-off CY"><input type="date" className="field" value={d.cutoffCy} onChange={(e) => setD({ ...d, cutoffCy: e.target.value })} /></Field>
          <Field label="Cut-off chứng từ"><input type="date" className="field" value={d.cutoffDoc} onChange={(e) => setD({ ...d, cutoffDoc: e.target.value })} /></Field>
          <Field label="Cut-off VGM"><input type="date" className="field" value={d.cutoffVgm} onChange={(e) => setD({ ...d, cutoffVgm: e.target.value })} /></Field>
          <Field label="ETD cảng đi"><input type="date" className="field" value={d.etd} onChange={(e) => setD({ ...d, etd: e.target.value })} /></Field>
          <Field label="ETA cảng đến"><input type="date" className="field" value={d.eta} onChange={(e) => setD({ ...d, eta: e.target.value })} /></Field>
          <Field label="Miễn lưu (ngày)"><input type="number" min={0} className="field" value={d.freeDays ?? ''} onChange={(e) => setD({ ...d, freeDays: e.target.value === '' ? null : +e.target.value })} /></Field>
          <Field label="Cảng chuyển tải"><PortSelect allowEmpty value={ts.port} onChange={(port) => setTs({ ...ts, port })} /></Field>
          <Field label="Đến cảng chuyển tải"><input type="date" className="field" disabled={!ts.port} value={ts.eta} onChange={(e) => setTs({ ...ts, eta: e.target.value })} /></Field>
          <Field label="Rời cảng chuyển tải"><input type="date" className="field" disabled={!ts.port} value={ts.etd} onChange={(e) => setTs({ ...ts, etd: e.target.value })} /></Field>
          <Field label="Tàu nối"><input className="field" disabled={!ts.port} value={ts.vessel} onChange={(e) => setTs({ ...ts, vessel: e.target.value })} /></Field>
          <Field label="Nguồn"><input className="field" value={d.source} onChange={(e) => setD({ ...d, source: e.target.value })} /></Field>
          <div className="flex items-end"><button className="btn btn-on w-full !py-2" onClick={add}>＋ Thêm</button></div>
        </div>
        <p className="mt-2 text-[10.5px] text-mute">Cột CSV: <code>{SCHEDULE_CSV_HEADER.join(', ')}</code>. File mẫu có 2 dòng ví dụ (không phải lịch thật) để bạn thử luồng nhập.</p>
      </section>
      <section className="card overflow-x-auto p-1">
        <table className="tbl">
          <thead><tr><th>Hãng · dịch vụ</th><th>Tàu / chuyến</th><th>Tuyến</th><th>Cut-off CY</th><th>ETD</th><th>Chuyển tải</th><th>ETA</th><th>Nguồn · ngày lấy</th><th /></tr></thead>
          <tbody>
            {schedules.length === 0 && <tr><td colSpan={9} className="!py-6 text-center text-mute">Chưa có lịch tàu nào.</td></tr>}
            {schedules.map((e) => (
              <tr key={e.id}>
                <td className="text-fg">{findCarrier(e.carrier)?.name} <span className="text-mute">· {e.service || '—'}</span></td>
                <td>{e.vessel || '—'} {e.voyage}</td>
                <td>{PORT_BY_CODE[e.pol]?.name ?? e.pol} → {PORT_BY_CODE[e.pod]?.name ?? e.pod}</td>
                <td>{fmtDateVi(e.cutoffCy)}</td>
                <td className="text-fg">{fmtDateVi(e.etd)}</td>
                <td>{e.transshipments.length ? e.transshipments.map((t) => `${PORT_BY_CODE[t.port]?.name ?? t.port} (${fmtDateVi(t.eta)}→${fmtDateVi(t.etd)})`).join(', ') : 'Đi thẳng'}</td>
                <td className="text-fg">{fmtDateVi(e.eta)}</td>
                <td>{e.source} · {fmtDateVi(e.fetchedAt)} {daysSince(e.fetchedAt) > SCHEDULE_STALE_DAYS && <span className="chip chip-warn">quá {SCHEDULE_STALE_DAYS} ngày</span>}</td>
                <td className="text-right"><button className="text-mute hover:text-red-300" onClick={() => removeSchedule(e.id)}>Xoá</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card p-3 text-[11.5px] text-mute">
        <h2 className="mb-1 text-[13px] font-semibold text-fg">Nguồn lịch tàu</h2>
        <ol className="list-decimal space-y-0.5 pl-4">
          <li><b className="text-fg">Lịch do bạn nhập</b> (trang này) – đang dùng.</li>
          <li>API theo chuẩn <b className="text-fg">DCSA Commercial Schedules</b> – <span className="chip chip-est">chưa bật</span> cần key riêng của từng hãng và một proxy phía server (<code>/api/schedules</code>) vì trình duyệt không gọi thẳng được API hãng tàu.</li>
          <li>Nền tảng tổng hợp lịch tàu trả phí – chưa hỗ trợ.</li>
        </ol>
        <p className="mt-1.5">Liên minh hãng tàu (hiển thị khi rê chuột vào tên hãng) là thông tin tham khảo năm {CARRIERS[0].allianceAsOf}, chưa xác minh.</p>
      </section>
    </PageShell>
  );
}
