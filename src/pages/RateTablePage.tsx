import { useState } from 'react';
import { CONTAINER_LABEL } from '../config/pricing';
import { CARRIERS, findCarrier } from '../data/carriers';
import { PORT_BY_CODE } from '../data/ports';
import { runPlan } from '../lib/actions';
import { downloadText, fmtDateVi, toCsv, todayIso } from '../lib/csv';
import { usd } from '../lib/format';
import { RATE_CSV_HEADER, parseRateRows, type RateEntry } from '../providers/RateProvider';
import { useAppStore } from '../store/useAppStore';
import { useDataStore } from '../store/useDataStore';
import type { ContainerType } from '../types';
import { ErrorList, WarningList, Field, ImportButton, PageShell, PortSelect } from './shared';

const blank = (): Omit<RateEntry, 'id'> => ({ pol: 'VNCMT', pod: 'DEHAM', container: '40HC', freight: 0, surcharges: 0, validFrom: todayIso(), validTo: '', carrier: '', source: '' });

/** "Bảng giá của tôi": import báo giá của forwarder (CSV/Excel) hoặc nhập tay – giá thật ghi đè ước tính */
export default function RateTablePage() {
  const rates = useDataStore((s) => s.rates);
  const { addRates, removeRate, clearRates } = useDataStore.getState();
  const showToast = useAppStore((s) => s.showToast);
  const [draft, setDraft] = useState(blank());
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const today = todayIso();
  const refresh = () => useAppStore.getState().plan && runPlan({ keepSelection: true });

  const onRows = (rows: string[][]) => {
    const { entries, errors, warnings } = parseRateRows(rows);
    setErrors(errors);
    setWarnings(warnings);
    if (entries.length) { addRates(entries); refresh(); }
    showToast(`Đã nhập ${entries.length} dòng giá${errors.length ? `, bỏ qua ${errors.length} dòng` : ''}`);
  };
  const add = () => {
    if (!(draft.freight > 0)) return showToast('Nhập cước (USD/cont)');
    if (draft.pol === draft.pod) return showToast('Cảng đi và cảng đến phải khác nhau');
    addRates([{ ...draft, id: Math.random().toString(36).slice(2, 10) }]);
    refresh();
    showToast('Đã thêm giá');
  };

  return (
    <PageShell
      title="Bảng giá của tôi"
      intro={<>Nhập báo giá thật của forwarder / hãng tàu. Khi một cặp cảng có giá còn hiệu lực (theo ngày hàng sẵn sàng), PortRank <b className="text-fg">dùng giá thật thay cho công thức ước tính</b> và gắn nhãn “Giá thật · nguồn · hết hạn”. Dữ liệu lưu trên trình duyệt của bạn.</>}
      actions={
        <>
          <ImportButton onRows={onRows} />
          <button className="btn" onClick={() => downloadText('portrank-bang-gia-mau.csv', toCsv([RATE_CSV_HEADER, ['VNCMT', 'DEHAM', '40HC', '', '', today, '', '', '']]))}>⬇ File mẫu</button>
          {rates.length > 0 && <button className="btn" onClick={() => downloadText('portrank-bang-gia.csv', toCsv([RATE_CSV_HEADER, ...rates.map((r) => [r.pol, r.pod, r.container === '*' ? '' : r.container, r.freight, r.surcharges, r.validFrom, r.validTo, findCarrier(r.carrier)?.scac ?? '', r.source])]))}>⬇ Xuất CSV</button>}
          {rates.length > 0 && <button className="btn" onClick={() => { if (confirm('Xoá toàn bộ bảng giá?')) { clearRates(); refresh(); } }}>🗑 Xoá hết</button>}
        </>
      }
    >
      <ErrorList errors={errors} />
      <WarningList items={warnings} />
      <section className="card p-3">
        <h2 className="mb-2 text-[13px] font-semibold text-fg">Nhập tay một dòng giá</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Field label="Cảng đi (POL)"><PortSelect value={draft.pol} onChange={(pol) => setDraft({ ...draft, pol })} /></Field>
          <Field label="Cảng đến (POD)"><PortSelect value={draft.pod} onChange={(pod) => setDraft({ ...draft, pod })} /></Field>
          <Field label="Loại cont">
            <select className="field" value={draft.container} onChange={(e) => setDraft({ ...draft, container: e.target.value as ContainerType | '*' })}>
              <option value="*">Mọi loại</option>
              {(Object.keys(CONTAINER_LABEL) as ContainerType[]).map((k) => <option key={k} value={k}>{CONTAINER_LABEL[k]}</option>)}
            </select>
          </Field>
          <Field label="Cước (USD/cont)"><input type="number" min={0} className="field" value={draft.freight || ''} onChange={(e) => setDraft({ ...draft, freight: +e.target.value || 0 })} /></Field>
          <Field label="Phụ phí (USD/cont)"><input type="number" min={0} className="field" value={draft.surcharges || ''} onChange={(e) => setDraft({ ...draft, surcharges: +e.target.value || 0 })} /></Field>
          <Field label="Hiệu lực từ"><input type="date" className="field" value={draft.validFrom} onChange={(e) => setDraft({ ...draft, validFrom: e.target.value })} /></Field>
          <Field label="Hiệu lực đến"><input type="date" className="field" value={draft.validTo} onChange={(e) => setDraft({ ...draft, validTo: e.target.value })} /></Field>
          <Field label="Hãng tàu">
            <select className="field" value={draft.carrier} onChange={(e) => setDraft({ ...draft, carrier: e.target.value })}>
              <option value="">Không rõ / mọi hãng</option>
              {CARRIERS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Nguồn (forwarder, số báo giá)"><input className="field" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} placeholder="VD: FWD ABC – QT-1125" /></Field>
          <div className="flex items-end"><button className="btn btn-on w-full !py-2" onClick={add}>＋ Thêm</button></div>
        </div>
        <p className="mt-2 text-[10.5px] text-mute">Cột của file CSV/Excel: <code>{RATE_CSV_HEADER.join(', ')}</code> (cũng nhận tiêu đề tiếng Việt: cảng đi, cảng đến, loại cont, cước, phụ phí, hiệu lực từ, hiệu lực đến, hãng tàu, nguồn).</p>
      </section>
      <section className="card overflow-x-auto p-1">
        <table className="tbl">
          <thead><tr><th>Tuyến</th><th>Cont</th><th className="!text-right">Cước</th><th className="!text-right">Phụ phí</th><th>Hiệu lực</th><th>Hãng</th><th>Nguồn</th><th /></tr></thead>
          <tbody>
            {rates.length === 0 && <tr><td colSpan={8} className="!py-6 text-center text-mute">Chưa có dòng giá nào – mọi phương án đang dùng <span className="chip chip-est">Ước tính</span>.</td></tr>}
            {rates.map((r) => {
              const expired = !!r.validTo && r.validTo < today;
              return (
                <tr key={r.id} className={expired ? 'opacity-50' : ''}>
                  <td className="text-fg">{PORT_BY_CODE[r.pol]?.name ?? r.pol} → {PORT_BY_CODE[r.pod]?.name ?? r.pod}<div className="text-[10px] text-mute">{r.pol} → {r.pod}</div></td>
                  <td>{r.container === '*' ? 'Mọi loại' : CONTAINER_LABEL[r.container]}</td>
                  <td className="text-right text-fg">{usd(r.freight)}</td>
                  <td className="text-right">{usd(r.surcharges)}</td>
                  <td>{fmtDateVi(r.validFrom)} – {fmtDateVi(r.validTo)} {expired && <span className="chip chip-bad">Hết hạn</span>}</td>
                  <td>{findCarrier(r.carrier)?.name ?? '—'}</td>
                  <td className="max-w-[200px] truncate" title={r.source}>{r.source || '—'}</td>
                  <td className="text-right"><button className="text-mute hover:text-red-300" onClick={() => { removeRate(r.id); refresh(); }}>Xoá</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <p className="text-[11px] text-mute">Nguồn giá được thiết kế dạng <code>RateProvider</code> (xem <code>src/providers/RateProvider.ts</code>) để sau này nối API Freightos, Xeneta hoặc API hãng tàu.</p>
    </PageShell>
  );
}
