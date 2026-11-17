import { useMemo, useState } from 'react';
import { stripAccents } from '../data/countries';
import { PORTS, PORT_BY_CODE } from '../data/ports';
import { daysSince, downloadText, fmtDateVi, rowsToRecords, toCsv, toIsoDate, todayIso } from '../lib/csv';
import { flag } from '../lib/format';
import { PORT_FIELDS, PORT_STALE_DAYS, builtinPortInfo, portInfoOf } from '../lib/portInfo';
import { useAppStore } from '../store/useAppStore';
import { useDataStore } from '../store/useDataStore';
import type { Sourced } from '../types';
import { ImportButton, PageShell } from './shared';

const CSV_HEADER = ['code', 'field', 'value', 'source', 'updated_at', 'verified'];

/** Trang "Danh mục cảng": sửa từng trường (kèm nguồn + ngày), import/export CSV, lọc trường chưa xác minh / quá 180 ngày */
export default function PortCatalogPage() {
  const portInfo = useDataStore((s) => s.portInfo);
  const { setPortField, setPortInfoBulk } = useDataStore.getState();
  const showToast = useAppStore((s) => s.showToast);
  const initial = useAppStore((s) => s.portCard);
  const [code, setCode] = useState(initial && PORT_BY_CODE[initial] ? initial : 'VNSGN');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'unverified' | 'stale' | 'missing'>('all');
  const [edit, setEdit] = useState<{ key: string; v: Sourced<string> } | null>(null);
  const port = PORT_BY_CODE[code];
  const info = portInfoOf(port, portInfo[code]);
  const builtin = builtinPortInfo(port);
  const list = useMemo(() => {
    const s = stripAccents(q);
    return PORTS.filter((p) => !s || stripAccents(`${p.name} ${p.code} ${p.countryName}`).includes(s));
  }, [q]);
  const countUser = (c: string) => Object.keys(portInfo[c] ?? {}).length;
  const rows = PORT_FIELDS.filter((f) => {
    const v = info[f.key];
    if (filter === 'missing') return !v;
    if (filter === 'unverified') return v && !v.verified;
    if (filter === 'stale') return v && daysSince(v.updatedAt) > PORT_STALE_DAYS;
    return true;
  });
  const exportCsv = () => {
    const out: (string | number)[][] = [CSV_HEADER];
    for (const [c, fields] of Object.entries(portInfo)) for (const [k, v] of Object.entries(fields)) out.push([c, k, v.value, v.source, v.updatedAt, v.verified ? 1 : 0]);
    if (out.length === 1) out.push(['VNSGN', 'teu', '', '', todayIso(), 0]);
    downloadText('portrank-danh-muc-cang.csv', toCsv(out));
  };
  const importCsv = (rowsIn: string[][]) => {
    const recs = rowsToRecords(rowsIn, { code: ['locode', 'ma cang'], field: ['truong'], value: ['gia tri'], source: ['nguon'], updatedAt: ['updated_at', 'ngay cap nhat'], verified: ['da xac minh'] });
    const ok: { code: string; field: string; v: Sourced<string> }[] = [];
    let bad = 0;
    for (const r of recs) {
      const c = (r.code ?? '').toUpperCase();
      const date = toIsoDate(r.updatedAt);
      if (!PORT_BY_CODE[c] || !PORT_FIELDS.some((f) => f.key === r.field) || !r.value || !r.source || !date) { bad++; continue; }
      ok.push({ code: c, field: r.field!, v: { value: r.value, source: r.source, updatedAt: date, verified: /^(1|true|yes|x|co|có)/i.test(r.verified ?? '') } });
    }
    setPortInfoBulk(ok);
    showToast(`Đã nhập ${ok.length} trường${bad ? `, bỏ qua ${bad} dòng (thiếu giá trị / nguồn / ngày hoặc sai mã)` : ''}`);
  };
  return (
    <PageShell
      title="Danh mục cảng"
      intro={<>Thông tin cảng dùng cho thẻ cảng và chế độ cảng 3D. Bộ dữ liệu đi kèm chỉ có nhận diện cơ bản; năng lực, terminal, hãng tàu, THC, free time… lấy từ World Port Index (NGA), danh mục UN/LOCODE, trang của cảng vụ / đơn vị khai thác và do bạn cập nhật. Mỗi trường phải có <b className="text-fg">nguồn</b> và <b className="text-fg">ngày cập nhật</b>; trường trống hiển thị “Chưa có dữ liệu”.</>}
      actions={
        <>
          <ImportButton onRows={importCsv} />
          <button className="btn" onClick={exportCsv}>⬇ Xuất CSV</button>
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-[280px_1fr]">
        <section className="card flex max-h-[70vh] flex-col p-2">
          <input className="field mb-2" placeholder="🔍 Tìm cảng, mã, quốc gia" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {list.map((p) => (
              <button key={p.code} onClick={() => { setCode(p.code); setEdit(null); }} className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] ${p.code === code ? 'bg-gold/15 text-amber-100' : 'text-fg hover:bg-white/5'}`}>
                <span>{flag(p.country)}</span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="text-[10px] text-mute">{p.code}{countUser(p.code) ? ` · ${countUser(p.code)}✎` : ''}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="card p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[14px] font-semibold text-fg">{flag(port.country)} {port.name} <span className="text-[11px] font-normal text-mute">{port.code}</span></h2>
            <div className="flex overflow-hidden rounded-md border border-line text-[11px]">
              {([['all', 'Tất cả'], ['missing', 'Chưa có dữ liệu'], ['unverified', 'Chưa xác minh'], ['stale', `Quá ${PORT_STALE_DAYS} ngày`]] as const).map(([k, l]) => (
                <button key={k} className={`px-2 py-1 ${filter === k ? 'bg-gold/20 text-amber-200' : 'text-mute hover:text-fg'}`} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>
          </div>
          <table className="tbl">
            <thead><tr><th>Nhóm</th><th>Trường</th><th>Giá trị</th><th>Nguồn · cập nhật</th><th /></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="!py-5 text-center text-mute">Không có trường nào khớp bộ lọc.</td></tr>}
              {rows.map((f) => {
                const v = info[f.key];
                const isUser = !!portInfo[code]?.[f.key];
                const editing = edit?.key === f.key;
                return (
                  <tr key={f.key}>
                    <td className="text-mute">{f.group}</td>
                    <td className="text-fg">{f.label}</td>
                    {editing ? (
                      <td colSpan={3}>
                        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-[1.2fr_1.4fr_130px_auto]">
                          <input className="field" autoFocus placeholder={f.hint ?? 'Giá trị'} value={edit.v.value} onChange={(e) => setEdit({ key: f.key, v: { ...edit.v, value: e.target.value } })} />
                          <input className="field" placeholder="Nguồn (bắt buộc)" value={edit.v.source} onChange={(e) => setEdit({ key: f.key, v: { ...edit.v, source: e.target.value } })} />
                          <input type="date" className="field" value={edit.v.updatedAt} onChange={(e) => setEdit({ key: f.key, v: { ...edit.v, updatedAt: e.target.value } })} />
                          <label className="flex items-center gap-1 text-[11px] text-fg"><input type="checkbox" checked={edit.v.verified} onChange={(e) => setEdit({ key: f.key, v: { ...edit.v, verified: e.target.checked } })} /> Đã xác minh</label>
                        </div>
                        <div className="mt-1.5 flex gap-1.5">
                          <button className="btn btn-on" onClick={() => {
                            if (!edit.v.value.trim() || !edit.v.source.trim() || !edit.v.updatedAt) return showToast('Cần đủ giá trị, nguồn và ngày cập nhật');
                            setPortField(code, f.key, edit.v);
                            setEdit(null);
                          }}>Lưu</button>
                          <button className="btn" onClick={() => setEdit(null)}>Huỷ</button>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td>{v ? <span className="text-fg">{v.value}</span> : <span className="text-mute/70 italic">Chưa có dữ liệu</span>}</td>
                        <td className="text-[11px]">
                          {v && (
                            <>
                              {v.source} · {fmtDateVi(v.updatedAt)}{' '}
                              <span className={`chip ${v.verified ? 'chip-real' : 'chip-warn'}`}>{v.verified ? 'Đã xác minh' : 'Chưa xác minh'}</span>
                              {daysSince(v.updatedAt) > PORT_STALE_DAYS && <span className="chip chip-warn ml-1">quá {PORT_STALE_DAYS} ngày</span>}
                            </>
                          )}
                        </td>
                        <td className="text-right whitespace-nowrap">
                          <button className="text-sky hover:underline" onClick={() => setEdit({ key: f.key, v: v ? { ...v, updatedAt: todayIso() } : { value: '', source: '', updatedAt: todayIso(), verified: false } })}>{v ? 'Sửa' : 'Nhập'}</button>
                          {isUser && <button className="ml-2 text-mute hover:text-red-300" title={builtin[f.key] ? 'Trở về giá trị có sẵn' : 'Xoá'} onClick={() => setPortField(code, f.key, null)}>Xoá</button>}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[10.5px] text-mute">Số liệu thay đổi theo ngày (ùn tắc, lịch tàu) được thiết kế dạng <code>PortLiveProvider</code> để nối API sau; bản này chỉ cho nhập tay. Số cẩu bờ bạn nhập ở đây được dùng khi dựng cảnh cảng 3D.</p>
        </section>
      </div>
    </PageShell>
  );
}
