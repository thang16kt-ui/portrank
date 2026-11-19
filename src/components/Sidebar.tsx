import { useState } from 'react';
import { useRoadConfig } from '../hooks/useRoadConfig';
import { INCOTERMS, termsForMode } from '../config/incoterms';
import { CARGO_LABEL, CONTAINER_LABEL } from '../config/pricing';
import { CRITERIA_LABEL, PRIORITY_LABEL, type Weights } from '../config/weights';
import { CARRIERS } from '../data/carriers';
import { COUNTRIES, ftasBetween } from '../data/countries';
import { SIMULATED_CRITERIA } from '../lib/ranking';
import { useDataStore } from '../store/useDataStore';
import { roadAvailability } from '../data/landBlocks';
import { runPlan } from '../lib/actions';
import { suggestIncoterm } from '../lib/incoterm';
import { useAppStore } from '../store/useAppStore';
import type { CargoType, ContainerType, Incoterm, Priority, TransportMode } from '../types';
import AddressInput from './AddressInput';
import Icon from './Icon';
import HsInput from './HsInput';
import { deviceTimeZone, minimumDeparture } from '../lib/simulation';

const SELLER_C = '#38bdf8', BUYER_C = '#fb923c';

function Block({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card px-4 pt-3.5 pb-4">
      <h2 className="mb-3 flex items-center gap-2.5 text-[15px] font-semibold text-fg">
        <span className="step-num">{n}</span>
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>
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
  const [showVia, setShowVia] = useState(false);
  const { config: roadConfig } = useRoadConfig(f.mode === 'road');

  const sellerC = f.role === 'seller' ? f.mine?.country : f.partner?.country;
  const buyerC = f.role === 'seller' ? f.partner?.country : f.mine?.country;
  const road = roadAvailability(sellerC, buyerC);
  const terms = termsForMode(f.mode);
  const simulated = useDataStore((s) => s.simulatedMetrics);
  const setSimulated = useDataStore((s) => s.setSimulatedMetrics);
  const originC = f.origin || sellerC;
  const ftaChoices = originC && buyerC ? ftasBetween(originC, buyerC) : [];
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
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <Block n={1} title="Tuyến">
        <div>
          <span className="lbl">Tôi là</span>
          <div><Seg value={f.role} onChange={(role) => setForm({ role })} options={[{ v: 'buyer', label: 'Người mua (nhập)' }, { v: 'seller', label: 'Người bán (xuất)' }]} /></div>
        </div>
        <AddressInput label="Bên tôi" value={f.mine} onChange={(mine) => setForm({ mine })} color={f.role === 'seller' ? SELLER_C : BUYER_C} placeholder="VD: Bình Dương, Việt Nam – hoặc Việt Nam" />
        <AddressInput label="Bên đối tác" value={f.partner} onChange={(partner) => setForm({ partner })} color={f.role === 'seller' ? BUYER_C : SELLER_C} placeholder="VD: Munich, Đức – hoặc Đức" />
        <div>
          <label className="lbl" htmlFor="road-departure">Ngày, giờ khởi hành</label>
          <div className="flex items-center gap-2">
            <input id="road-departure" className="field min-w-0" type="datetime-local" min={minimumDeparture()} value={f.roadDepartureTime ?? ''} onChange={(e) => setForm({ roadDepartureTime: e.target.value })} />
            <button className="btn shrink-0" onClick={() => setForm({ roadDepartureTime: '' })}>Đi ngay</button>
          </div>
          <p className="hint mt-1.5">{f.roadDepartureTime ? 'Giờ đã chọn' : 'Để trống = đi ngay'} · múi giờ {deviceTimeZone()}. Bấm Tìm tuyến tối ưu để áp dụng.</p>
        </div>
        {f.mode === 'road' && (
          <div>
            <p className="hint">{roadConfig?.provider === 'tomtom' ? 'TomTom có xét giao thông. Giờ tương lai là dự báo; giờ đi theo múi giờ thiết bị.' : roadConfig?.provider === 'google' ? 'Google Maps có xét giao thông, giờ đi theo múi giờ thiết bị.' : roadConfig?.provider === 'osrm' ? 'OpenStreetMap / OSRM · bản thử. Thời gian chưa xét kẹt xe và không dự báo theo giờ đi.' : 'Đang kiểm tra nguồn đường bộ.'} Chọn thành phố/địa chỉ ở hai đầu. Tuyến ô tô chưa xét hạn chế xe tải/container.</p>
            {(roadConfig?.provider === 'osrm' || roadConfig?.provider === 'tomtom' || f.roadVia) && <div className="mt-2 space-y-1">
              <button className="text-[12.5px] font-medium text-sky underline-offset-2 hover:underline" onClick={() => { if (showVia || f.roadVia) { setShowVia(false); setForm({ roadVia: null }); } else setShowVia(true); }}>{showVia || f.roadVia ? 'Bỏ điểm đi qua' : 'Thêm điểm đi qua (tuỳ chọn)'}</button>
              {(showVia || f.roadVia) && <AddressInput label="Đi qua" value={f.roadVia ?? null} onChange={(roadVia) => setForm({ roadVia })} color="#a78bfa" placeholder="VD: Đà Nẵng, Việt Nam" />}
            </div>}
          </div>
        )}
        <div className={f.mode === 'sea' ? '' : 'opacity-40'}>
          <label className="lbl">Hãng tàu {f.mode !== 'sea' && '(chỉ với Đường biển)'}</label>
          <button disabled={f.mode !== 'sea'} onClick={() => setCarrierOpen(!carrierOpen)} className="field flex items-center justify-between text-left">
            <span className="truncate">{f.carriers.length ? f.carriers.map((id) => CARRIERS.find((c) => c.id === id)?.name).join(', ') : 'Tất cả hãng'}</span>
            <Icon name={carrierOpen ? 'chevronUp' : 'chevronDown'} className="text-mute" />
          </button>
          {carrierOpen && f.mode === 'sea' && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button className={`btn !min-h-[30px] !px-2.5 !py-1 !text-[12px] ${!f.carriers.length ? 'btn-on' : ''}`} onClick={() => setForm({ carriers: [] })}>Tất cả hãng</button>
              {CARRIERS.map((c) => (
                <button key={c.id} title={`${c.scac} · ${c.alliance} (${c.allianceAsOf}, chưa xác minh)`} className={`btn !min-h-[30px] !px-2.5 !py-1 !text-[12px] ${f.carriers.includes(c.id) ? 'btn-on' : ''}`} onClick={() => toggleCarrier(c.id)}>
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
        <div className="grid grid-cols-[140px_1fr] gap-2">
          <div>
            <label className="lbl">Mã HS (chuẩn HS6)</label>
            <HsInput value={f.hs} onChange={(hs) => setForm({ hs })} onPickDesc={(d) => !f.hsDesc && setForm({ hsDesc: d })} />
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
        <div>
          <label className="lbl" title="Dùng cho thuế tuyệt đối / theo lượng, vd 90¢/đôi, 2.50 EUR/100 kg, 1.20 EUR/hl">Số lượng tính thuế theo lượng <span className="font-normal text-mute">(nếu có)</span></label>
          <div className="grid grid-cols-3 gap-2">
            <input type="number" min={0} className="field" placeholder="Chiếc/đôi" title="Số lượng sản phẩm (chiếc, đôi, cái)" value={f.dutyUnits || ''} onChange={(e) => setForm({ dutyUnits: Math.max(0, +e.target.value || 0) })} />
            <input type="number" min={0} className="field" placeholder="KL tịnh kg" title="Khối lượng TỊNH (kg) theo luật thuế. Để trống = chưa biết: thuế theo kg sẽ báo “cần nhập”, không lấy khối lượng cả bì hay giá trị mặc định" value={f.netKg || ''} onChange={(e) => setForm({ netKg: Math.max(0, +e.target.value || 0) })} />
            <input type="number" min={0} className="field" placeholder="Lít" title="Thể tích (lít) – đồ uống, hoá chất lỏng" value={f.dutyLiters || ''} onChange={(e) => setForm({ dutyLiters: Math.max(0, +e.target.value || 0) })} />
          </div>
        </div>
        <div className="rounded-xl border border-line bg-panel2 p-3">
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-snug font-medium text-fg">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={f.hasCo} onChange={(e) => setForm({ hasCo: e.target.checked })} /> Có C/O / chứng từ xuất xứ (xét thuế ưu đãi FTA)
          </label>
          {f.hasCo && (
            <div className="mt-2.5">
              <label className="lbl">Hiệp định áp dụng <span className="font-normal text-mute">(mỗi C/O chỉ dùng cho hiệp định của nó)</span></label>
              <input className="field" list="fta-list" placeholder="Chưa chọn = mức thấp nhất, có điều kiện" value={f.fta} onChange={(e) => setForm({ fta: e.target.value })} />
              <datalist id="fta-list">{ftaChoices.map((x) => <option key={x} value={x} />)}</datalist>
            </div>
          )}
          {!f.hasCo && <div className="hint mt-1.5 pl-[26px]">Đang tính thuế MFN; mức ưu đãi (nếu có) hiện ở tab Thuế nhập khẩu.</div>}
        </div>
      </Block>

      <Block n={3} title="Điều kiện giao hàng">
        <div>
          <label className="lbl">Phương thức vận tải</label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => pickMode('sea')} aria-pressed={f.mode === 'sea'} className={`btn !min-h-[42px] !text-[14px] ${f.mode === 'sea' ? 'btn-on' : ''}`}><Icon name="ship" size={18} /> Đường biển</button>
            <button onClick={() => road.ok && pickMode('road')} disabled={!road.ok} title={road.reason} aria-pressed={f.mode === 'road'} className={`btn !min-h-[42px] !text-[14px] ${f.mode === 'road' ? 'btn-on' : ''}`}><Icon name="truck" size={18} /> Đường bộ</button>
          </div>
          {!road.ok && f.mine && f.partner && <p className="hint mt-1.5">Đường bộ không dùng được: {road.reason}.</p>}
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="lbl !mb-0">Điều kiện (Incoterms® 2020)</label>
            <button className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12.5px] font-medium text-sky hover:bg-sky/10" aria-expanded={suggest} onClick={() => setSuggest(!suggest)}><Icon name="sparkles" size={14} /> Gợi ý cho tôi</button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {terms.map((t) => (
              <button key={t} onClick={() => pickTerm(t)} title={INCOTERMS[t].nameVi} aria-pressed={f.term === t} className={`btn !min-h-[36px] !gap-1 !px-0 !text-[13px] !font-semibold ${f.term === t ? 'btn-on' : ''}`}>
                {t}{f.mode === 'sea' && INCOTERMS[t].group === 'sea' && <span className="opacity-60" title="Chỉ dùng cho đường biển và thủy nội địa"><Icon name="anchor" size={12} /></span>}
              </button>
            ))}
          </div>
          {suggest && (
            <div className="mt-2 rounded-xl border border-line bg-panel2 p-3 text-[13px]">
              <div className="mb-2 font-medium text-fg">Ai sẽ book vận tải chặng chính?</div>
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
          {notice && <p className="hint-info mt-2"><Icon name="info" size={15} /><span>{notice}</span></p>}
          {seaOnlyWarn && <p className="hint-warn mt-2"><Icon name="alert" size={15} /><span>ICC khuyến nghị dùng FCA / CPT / CIP cho hàng container.</span></p>}
          {needAddr && <p className="hint-warn mt-2"><Icon name="alert" size={15} /><span>Nhập địa chỉ cụ thể để tính đủ chi phí nội địa cho điều kiện này.</span></p>}
        </div>
      </Block>

      <section className="card">
        <button className="flex min-h-[44px] w-full items-center justify-between rounded-[14px] px-4 py-2.5 text-[14px] font-semibold text-fg hover:bg-panel2" aria-expanded={more} onClick={() => setMore(!more)}>
          <span>Tùy chọn thêm <span className="ml-1 text-[12.5px] font-normal text-mute">ngày, xuất xứ, ưu tiên…</span></span>
          <Icon name={more ? 'chevronUp' : 'chevronDown'} className="text-mute" />
        </button>
        {more && (
          <div className="space-y-3.5 border-t border-line px-4 pt-3.5 pb-4">
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
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="lbl" title="Ngày dùng để chọn mức thuế có hiệu lực và sàn/trần phí theo năm tài chính">Ngày khai hải quan dự kiến</label>
                <input type="date" className="field" value={f.customsDate} onChange={(e) => setForm({ customsDate: e.target.value })} />
              </div>
              <div>
                <label className="lbl" title="Dùng khi thuế chống bán phá giá có mức riêng theo công ty">Nhà sản xuất / xuất khẩu</label>
                <input className="field" placeholder="(nếu biết)" value={f.company} onChange={(e) => setForm({ company: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="lbl">Ưu tiên</label>
              <Seg value={f.priority} onChange={(p) => setPriority(p as Priority)} options={(Object.keys(PRIORITY_LABEL) as Priority[]).map((v) => ({ v, label: PRIORITY_LABEL[v] }))} />
              <div className="mt-2.5 space-y-1.5">
                {(Object.keys(weights) as (keyof Weights)[]).map((k) => (
                  <div key={k} className={`flex items-center gap-2.5 text-[12.5px] text-label ${!simulated && SIMULATED_CRITERIA.includes(k) ? 'opacity-50' : ''}`} title={!simulated && SIMULATED_CRITERIA.includes(k) ? 'Chưa có dữ liệu thật – tiêu chí này không được tính điểm' : undefined}>
                    <span className="w-24 shrink-0">{CRITERIA_LABEL[k]}{!simulated && SIMULATED_CRITERIA.includes(k) ? ' *' : ''}</span>
                    <input type="range" min={0} max={100} value={weights[k]} onChange={(e) => setWeight(k, +e.target.value)} className="h-1 flex-1" />
                    <span className="num w-8 text-right font-semibold text-fg">{weights[k]}</span>
                  </div>
                ))}
                <label className="flex cursor-pointer items-start gap-2 pt-1.5 text-[12px] leading-snug text-mute">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={simulated} onChange={(e) => setSimulated(e.target.checked)} /> Chế độ demo: cho dữ liệu MÔ PHỎNG (ổn định giá, tần suất tàu *) tham gia xếp hạng
                </label>
              </div>
            </div>
            <div>
              <label className="lbl">Bán kính tìm cảng (chỉ với nhánh Địa chỉ): {f.radiusKm} km</label>
              <input type="range" min={100} max={1000} step={50} value={f.radiusKm} onChange={(e) => setForm({ radiusKm: +e.target.value })} className="w-full" />
            </div>
            <div className="flex flex-col gap-2 text-[13px] text-fg">
              <label className="flex cursor-pointer items-center gap-2.5"><input type="checkbox" className="h-4 w-4" checked={f.avoidRedSea} onChange={(e) => setForm({ avoidRedSea: e.target.checked })} /> Tránh Biển Đỏ</label>
              <label className="flex cursor-pointer items-center gap-2.5"><input type="checkbox" className="h-4 w-4" checked={f.avoidPanama} onChange={(e) => setForm({ avoidPanama: e.target.checked })} /> Tránh kênh Panama</label>
              <label className="flex cursor-pointer items-center gap-2.5"><input type="checkbox" className="h-4 w-4" checked={f.woodPallet} onChange={(e) => setForm({ woodPallet: e.target.checked })} /> Có pallet / bao bì gỗ</label>
            </div>
          </div>
        )}
      </section>

      {planError && <p className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-200" role="alert"><Icon name="alert" size={16} className="mt-0.5" /><span>{planError}</span></p>}
    </div>
    <div className="shrink-0 border-t border-line bg-panel p-3">
      <button
        onClick={() => runPlan()}
        disabled={!!planning}
        aria-busy={!!planning}
        className="btn-primary flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[15px] font-semibold disabled:opacity-70"
      >
        {planning ? <><Icon name="loader" size={18} className="animate-spin" /> Đang tính… {planning.total > 1 ? `${planning.done}/${planning.total}` : ''}</> : <><Icon name="search" size={18} strokeWidth={2.4} /> Tìm tuyến tối ưu</>}
      </button>
    </div>
    </div>
  );
}
