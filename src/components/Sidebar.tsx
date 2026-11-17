import { useState } from 'react';
import { INCOTERMS, termsForMode } from '../config/incoterms';
import { CARGO_LABEL, CONTAINER_LABEL } from '../config/pricing';
import { CRITERIA_LABEL, PRIORITY_LABEL, type Weights } from '../config/weights';
import { CARRIERS } from '../data/carriers';
import { COUNTRIES } from '../data/countries';
import { roadAvailability } from '../data/landBlocks';
import { runPlan } from '../lib/actions';
import { suggestIncoterm } from '../lib/incoterm';
import { useAppStore } from '../store/useAppStore';
import type { CargoType, ContainerType, Incoterm, Priority, TransportMode } from '../types';
import AddressInput from './AddressInput';

const SELLER_C = '#38bdf8', BUYER_C = '#fb923c';

function Block({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card px-3 py-2.5">
      <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-fg">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold/20 text-[11px] text-amber-200">{n}</span>
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-line">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} className={`flex-1 px-2 py-1.5 text-xs font-medium transition ${value === o.v ? 'bg-gold/20 text-amber-200' : 'bg-[#0a1120] text-mute hover:text-fg'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function Sidebar() {
  const f = useAppStore((s) => s.form);
  const setForm = useAppStore((s) => s.setForm);
  const setMode = useAppStore((s) => s.setMode);
  const setTerm = useAppStore((s) => s.setTerm);
  const setPriority = useAppStore((s) => s.setPriority);
  const weights = useAppStore((s) => s.weights);
  const setWeight = useAppStore((s) => s.setWeight);
  const planning = useAppStore((s) => s.planning);
  const plan = useAppStore((s) => s.plan);
  const notice = useAppStore((s) => s.notice);
  const planError = useAppStore((s) => s.planError);
  const [more, setMore] = useState(false);
  const [carrierOpen, setCarrierOpen] = useState(false);
  const [suggest, setSuggest] = useState(false);

  const sellerC = f.role === 'seller' ? f.mine?.country : f.partner?.country;
  const buyerC = f.role === 'seller' ? f.partner?.country : f.mine?.country;
  const road = roadAvailability(sellerC, buyerC);
  const terms = termsForMode(f.mode);
  const containerised = f.shipMode === 'LCL' || f.cargo !== 'oog';
  const seaOnlyWarn = f.mode === 'sea' && INCOTERMS[f.term].group === 'sea' && containerised;
  const sellerPlace = f.role === 'seller' ? f.mine : f.partner, buyerPlace = f.role === 'seller' ? f.partner : f.mine;
  const needAddr =
    (f.term === 'EXW' && sellerPlace?.kind === 'country') || (['DAP', 'DPU', 'DDP'].includes(f.term) && buyerPlace?.kind === 'country');

  const pickMode = (m: TransportMode) => {
    if (m === f.mode) return;
    setMode(m);
    if (plan) runPlan();
  };
  const pickTerm = (t: Incoterm) => setTerm(t);
  const toggleCarrier = (id: string) => setForm({ carriers: f.carriers.includes(id) ? f.carriers.filter((c) => c !== id) : [...f.carriers, id] });

  return (
    <div className="flex h-full flex-col">
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-2.5">
      <Block n={1} title="Tuyến">
        <div className="flex items-center gap-2">
          <label className="lbl !mb-0 shrink-0">Tôi là</label>
          <div className="flex-1"><Seg value={f.role} onChange={(role) => setForm({ role })} options={[{ v: 'buyer', label: 'Người mua (nhập)' }, { v: 'seller', label: 'Người bán (xuất)' }]} /></div>
        </div>
        <AddressInput label="Bên tôi" value={f.mine} onChange={(mine) => setForm({ mine })} color={f.role === 'seller' ? SELLER_C : BUYER_C} placeholder="VD: Bình Dương, Việt Nam – hoặc Việt Nam" />
        <AddressInput label="Bên đối tác" value={f.partner} onChange={(partner) => setForm({ partner })} color={f.role === 'seller' ? BUYER_C : SELLER_C} placeholder="VD: Munich, Đức – hoặc Đức" />
        <div className={f.mode === 'sea' ? '' : 'opacity-40'}>
          <label className="lbl">Hãng tàu {f.mode !== 'sea' && '(chỉ với Đường biển)'}</label>
          <button disabled={f.mode !== 'sea'} onClick={() => setCarrierOpen(!carrierOpen)} className="field flex items-center justify-between text-left">
            <span className="truncate">{f.carriers.length ? f.carriers.map((id) => CARRIERS.find((c) => c.id === id)?.name).join(', ') : 'Tất cả hãng'}</span>
            <span className="text-mute">{carrierOpen ? '▴' : '▾'}</span>
          </button>
          {carrierOpen && f.mode === 'sea' && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <button className={`btn !px-2 !py-0.5 !text-[11px] ${!f.carriers.length ? 'btn-on' : ''}`} onClick={() => setForm({ carriers: [] })}>Tất cả hãng</button>
              {CARRIERS.map((c) => (
                <button key={c.id} title={`${c.scac} · ${c.alliance} (${c.allianceAsOf}, chưa xác minh)`} className={`btn !px-2 !py-0.5 !text-[11px] ${f.carriers.includes(c.id) ? 'btn-on' : ''}`} onClick={() => toggleCarrier(c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </Block>

      <Block n={2} title="Hàng hóa">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="lbl">Loại hàng</label>
            <select className="field" value={f.cargo} onChange={(e) => setForm({ cargo: e.target.value as CargoType })}>
              {(Object.keys(CARGO_LABEL) as CargoType[]).map((k) => <option key={k} value={k}>{CARGO_LABEL[k]}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">Hình thức</label>
            <Seg value={f.shipMode} onChange={(shipMode) => setForm({ shipMode })} options={[{ v: 'FCL', label: 'FCL' }, { v: 'LCL', label: 'LCL' }]} />
          </div>
        </div>
        {f.shipMode === 'FCL' ? (
          <div className="grid grid-cols-[1fr_84px] gap-2">
            <div>
              <label className="lbl">Container</label>
              <select className="field" value={f.container} onChange={(e) => setForm({ container: e.target.value as ContainerType })}>
                {(Object.keys(CONTAINER_LABEL) as ContainerType[]).map((k) => <option key={k} value={k}>{CONTAINER_LABEL[k]}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Số lượng</label>
              <input type="number" min={1} max={200} className="field" value={f.quantity} onChange={(e) => setForm({ quantity: Math.max(1, +e.target.value || 1) })} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="lbl">Thể tích (CBM)</label>
              <input type="number" min={0.1} step={0.1} className="field" value={f.cbm} onChange={(e) => setForm({ cbm: Math.max(0.1, +e.target.value || 0.1) })} />
            </div>
            <div>
              <label className="lbl">Khối lượng (kg)</label>
              <input type="number" min={1} className="field" value={f.weightKg} onChange={(e) => setForm({ weightKg: Math.max(1, +e.target.value || 1) })} />
            </div>
          </div>
        )}
        <div className="grid grid-cols-[110px_1fr] gap-2">
          <div>
            <label className="lbl">Mã HS (≥ 6 số)</label>
            <input className="field" inputMode="numeric" placeholder="940360" value={f.hs} onChange={(e) => setForm({ hs: e.target.value.replace(/[^0-9.]/g, '').slice(0, 12) })} />
          </div>
          <div>
            <label className="lbl">Mô tả hàng</label>
            <input className="field" placeholder="VD: đồ gỗ nội thất" value={f.hsDesc} onChange={(e) => setForm({ hsDesc: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_92px] gap-2">
          <div>
            <label className="lbl">Giá trị hàng (USD)</label>
            <input type="number" min={0} step={100} className="field" placeholder="0" value={f.goodsValue || ''} onChange={(e) => setForm({ goodsValue: Math.max(0, +e.target.value || 0) })} />
          </div>
          <div>
            <label className="lbl">Giá báo theo</label>
            <select className="field" value={f.valueTerm} onChange={(e) => setForm({ valueTerm: e.target.value as Incoterm })}>
              {termsForMode('sea').map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </Block>

      <Block n={3} title="Điều kiện giao hàng">
        <div>
          <label className="lbl">Phương thức vận tải</label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => pickMode('sea')} className={`btn !py-2 !text-[13px] ${f.mode === 'sea' ? 'btn-on' : ''}`}>🚢 Đường biển</button>
            <button onClick={() => road.ok && pickMode('road')} disabled={!road.ok} title={road.reason} className={`btn !py-2 !text-[13px] ${f.mode === 'road' ? 'btn-on' : ''}`}>🚚 Đường bộ</button>
          </div>
          {!road.ok && f.mine && f.partner && <p className="mt-1 text-[10.5px] text-mute">Đường bộ không dùng được: {road.reason}.</p>}
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="lbl !mb-0">Điều kiện (Incoterms® 2020)</label>
            <button className="text-[11px] text-sky hover:underline" onClick={() => setSuggest(!suggest)}>✨ Gợi ý cho tôi</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {terms.map((t) => (
              <button key={t} onClick={() => pickTerm(t)} title={INCOTERMS[t].nameVi} className={`btn w-[50px] !gap-0.5 !px-0 !py-1.5 !text-[12.5px] !font-semibold ${f.term === t ? 'btn-on' : ''}`}>
                {t}{f.mode === 'sea' && INCOTERMS[t].group === 'sea' && <span className="text-[10px] opacity-70" title="Chỉ dùng cho đường biển và thủy nội địa">⚓</span>}
              </button>
            ))}
          </div>
          {suggest && (
            <div className="mt-2 rounded-lg border border-line bg-[#0a1120] p-2 text-[11.5px]">
              <div className="mb-1.5 text-mute">Ai sẽ book vận tải chặng chính?</div>
              <div className="flex gap-1.5">
                {[true, false].map((iBook) => {
                  const sg = suggestIncoterm(f.role, iBook, f.cargo, f.mode);
                  return (
                    <button key={String(iBook)} className="btn flex-1 !flex-col !items-start !whitespace-normal !text-left" onClick={() => { setTerm(sg.term); setSuggest(false); useAppStore.getState().showToast(`Gợi ý: ${sg.term} – ${INCOTERMS[sg.term].nameVi}`); }} title={sg.reason}>
                      <span className="text-mute">{iBook ? 'Tôi book' : 'Bên kia book'}</span>
                      <b className="text-amber-200">→ {sg.term}</b>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {notice && <p className="mt-1.5 rounded bg-sky/10 px-2 py-1 text-[11px] text-cyan-200">ℹ️ {notice}</p>}
          {seaOnlyWarn && <p className="mt-1.5 rounded bg-gold/10 px-2 py-1 text-[11px] text-amber-200">⚠️ ICC khuyến nghị dùng FCA / CPT / CIP cho hàng container.</p>}
          {needAddr && <p className="mt-1.5 rounded bg-gold/10 px-2 py-1 text-[11px] text-amber-200">⚠️ Nhập địa chỉ cụ thể để tính đủ chi phí nội địa cho điều kiện này.</p>}
        </div>
      </Block>

      <section className="card">
        <button className="flex w-full items-center justify-between px-3 py-2 text-[12.5px] font-medium text-mute hover:text-fg" onClick={() => setMore(!more)}>
          <span>Tùy chọn thêm</span>
          <span>{more ? '▴' : '▾'}</span>
        </button>
        {more && (
          <div className="space-y-2.5 border-t border-line p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="lbl">Ngày hàng sẵn sàng</label>
                <input type="date" className="field" value={f.readyDate} onChange={(e) => setForm({ readyDate: e.target.value })} />
              </div>
              <div>
                <label className="lbl">Xuất xứ hàng hóa</label>
                <select className="field" value={f.origin} onChange={(e) => setForm({ origin: e.target.value })}>
                  <option value="">= nước người bán</option>
                  {COUNTRIES.map((c) => <option key={c.iso2} value={c.iso2}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-fg">
              <input type="checkbox" checked={f.hasCo} onChange={(e) => setForm({ hasCo: e.target.checked })} /> Có C/O hợp lệ (áp thuế ưu đãi FTA nếu có trong biểu thuế)
            </label>
            <div>
              <label className="lbl">Ưu tiên</label>
              <Seg value={f.priority} onChange={(p) => setPriority(p as Priority)} options={(Object.keys(PRIORITY_LABEL) as Priority[]).map((v) => ({ v, label: PRIORITY_LABEL[v] }))} />
              <div className="mt-2 space-y-1">
                {(Object.keys(weights) as (keyof Weights)[]).map((k) => (
                  <div key={k} className="flex items-center gap-2 text-[11px] text-mute">
                    <span className="w-20 shrink-0">{CRITERIA_LABEL[k]}</span>
                    <input type="range" min={0} max={100} value={weights[k]} onChange={(e) => setWeight(k, +e.target.value)} className="h-1 flex-1" />
                    <span className="w-7 text-right text-fg">{weights[k]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="lbl">Bán kính tìm cảng (chỉ với nhánh Địa chỉ): {f.radiusKm} km</label>
              <input type="range" min={100} max={1000} step={50} value={f.radiusKm} onChange={(e) => setForm({ radiusKm: +e.target.value })} className="w-full" />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg">
              <label className="flex items-center gap-2"><input type="checkbox" checked={f.avoidRedSea} onChange={(e) => setForm({ avoidRedSea: e.target.checked })} /> Tránh Biển Đỏ</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={f.avoidPanama} onChange={(e) => setForm({ avoidPanama: e.target.checked })} /> Tránh kênh Panama</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={f.woodPallet} onChange={(e) => setForm({ woodPallet: e.target.checked })} /> Có pallet / bao bì gỗ</label>
            </div>
          </div>
        )}
      </section>

      {planError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200">{planError}</p>}
    </div>
    <div className="shrink-0 border-t border-line bg-panel p-2.5">
      <button
        onClick={() => runPlan()}
        disabled={!!planning}
        className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-3 text-sm font-bold text-slate-900 shadow-[0_0_24px_rgba(251,191,36,.35)] transition hover:brightness-110 disabled:opacity-60"
      >
        {planning ? `Đang tính… ${planning.total > 1 ? `${planning.done}/${planning.total}` : ''}` : '🔎 Tìm tuyến tối ưu'}
      </button>
    </div>
    </div>
  );
}
