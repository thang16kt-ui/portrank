import { useState, useId, isValidElement, cloneElement, type ReactNode } from 'react';
import { CARGO_LABEL, CONTAINER_LABEL } from '../config/pricing';
import { PRIORITY_LABEL } from '../config/weights';
import { getPort } from '../data/ports';
import { findRoute } from '../lib/routing';
import { routeOptionsOf } from '../lib/results';
import { useAppStore, usePlayback } from '../store/useAppStore';
import type { CargoType, ContainerType, Priority } from '../types';
import PortCombobox from './PortCombobox';
import { validateShipment } from '../lib/validation';

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const id = useId();
  const control = isValidElement<{ id?: string }>(children) && (children.type === 'input' || children.type === 'select');
  return <div role={control ? undefined : 'group'} aria-labelledby={control ? undefined : id}>
    {control ? <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label> : <div id={id} className="mb-1.5 text-sm font-medium text-slate-700">{label}</div>}
    {control ? cloneElement(children, { id }) : children}
    {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
  </div>;
}

function Segmented<T extends string>({ value, options, onChange, cols }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; cols?: number }) {
  return (
    <div className="grid gap-1 rounded-lg bg-slate-100 p-1" style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0,1fr))` }}>
      {options.map((o) => (
        <button
          type="button"
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-md px-2 min-h-10 py-2 text-sm transition ${value === o.v ? 'bg-white font-semibold text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const input = 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-blue-100';

export default function Sidebar() {
  const form = useAppStore((s) => s.form);
  const setForm = useAppStore((s) => s.setForm);
  const setPort = useAppStore((s) => s.setPort);
  const swap = useAppStore((s) => s.swapPorts);
  const setPriority = useAppStore((s) => s.setPriority);
  const compute = useAppStore((s) => s.compute);
  const setView = useAppStore((s) => s.setWorkspaceView);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    const issue = validateShipment(form);
    if (issue) { setError(issue); return; }
    setError(null);
    try {
      const route = findRoute(getPort(form.pol)!, getPort(form.pod)!, routeOptionsOf(form));
      compute(route);
      usePlayback.getState().setProgress(0);
      usePlayback.getState().setPlaying(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h1 className="text-lg font-bold text-brand-900">Lập kế hoạch vận chuyển</h1>
        <p className="mt-1 text-sm text-slate-500">Chọn tuyến và lô hàng để bắt đầu.</p>
      </div>
      <div className="scroll-thin flex-1 space-y-6 overflow-y-auto p-5">
        <section className="space-y-3" aria-labelledby="route-heading">
          <h2 id="route-heading" className="section-heading"><span>01</span> Tuyến vận chuyển</h2>
          <PortCombobox label="Cảng đi" accent="pol" value={form.pol} onChange={(c) => setPort('pol', c)} />
          <div className="flex justify-end"><button type="button" onClick={swap} className="min-h-10 px-2 text-sm font-medium text-brand-600">⇅ Đảo chiều</button></div>
          <PortCombobox label="Cảng đến" accent="pod" value={form.pod} onChange={(c) => setPort('pod', c)} />
          <button onClick={() => setView('map')} className="min-h-10 text-sm text-brand-600 underline underline-offset-4">Chọn cảng trên bản đồ</button>
          <Field label="Ngày hàng sẵn sàng"><input type="date" className={input} value={form.readyDate} onChange={(e) => setForm({ readyDate: e.target.value })} /></Field>
        </section>
        <section className="space-y-3 border-t border-slate-100 pt-5" aria-labelledby="cargo-heading">
          <h2 id="cargo-heading" className="section-heading"><span>02</span> Thông tin lô hàng</h2>
          <Field label="Loại hàng"><select className={input} value={form.cargo} onChange={(e) => setForm({ cargo: e.target.value as CargoType })}>
            {(Object.keys(CARGO_LABEL) as CargoType[]).map((k) => <option key={k} value={k}>{CARGO_LABEL[k]}</option>)}
          </select></Field>
          <Segmented value={form.mode} onChange={(mode) => setForm({ mode })} options={[{ v: 'FCL', label: 'Nguyên container' }, { v: 'LCL', label: 'Hàng lẻ' }]} />
          {form.mode === 'FCL' ? <div className="grid grid-cols-[1fr_96px] gap-3">
            <Field label="Loại container"><select className={input} value={form.container} onChange={(e) => setForm({ container: e.target.value as ContainerType })}>
              {(Object.keys(CONTAINER_LABEL) as ContainerType[]).map((k) => <option key={k} value={k} disabled={form.cargo === 'reefer' && k !== '40RF'}>{CONTAINER_LABEL[k]}</option>)}
            </select></Field>
            <Field label="Số lượng"><input type="number" min={1} max={500} step={1} className={input} value={form.quantity} onChange={(e) => setForm({ quantity: +e.target.value })} /></Field>
          </div> : <div className="grid grid-cols-2 gap-3">
            <Field label="Thể tích (CBM)"><input type="number" min={0.1} step={0.1} className={input} value={form.cbm} onChange={(e) => setForm({ cbm: +e.target.value })} /></Field>
            <Field label="Trọng lượng (kg)"><input type="number" min={1} className={input} value={form.weightKg} onChange={(e) => setForm({ weightKg: +e.target.value })} /></Field>
          </div>}
        </section>
        <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Tùy chọn nâng cao</summary>
          <div className="mt-4 space-y-4">
            <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={form.woodPallet} onChange={(e) => setForm({ woodPallet: e.target.checked })} />Có pallet / bao bì gỗ</label>
            <Field label="Vai trò của bạn"><Segmented value={form.role} onChange={(role) => setForm({ role })} options={[{ v: 'seller', label: 'Người bán' }, { v: 'buyer', label: 'Người mua' }]} /></Field>
            <Field label="Bên đặt tàu"><Segmented value={form.booker} onChange={(booker) => setForm({ booker })} options={[{ v: 'me', label: 'Tôi đặt' }, { v: 'other', label: 'Đối tác đặt' }]} /></Field>
            <Field label="Ưu tiên so sánh"><Segmented value={form.priority} onChange={(p) => setPriority(p as Priority)} cols={2} options={(Object.keys(PRIORITY_LABEL) as Priority[]).map((k) => ({ v: k, label: PRIORITY_LABEL[k] }))} /></Field>
            <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={form.avoidRedSea} onChange={(e) => setForm({ avoidRedSea: e.target.checked })} />Tránh Biển Đỏ</label>
            <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={form.avoidPanama} onChange={(e) => setForm({ avoidPanama: e.target.checked })} />Tránh kênh Panama</label>
            <Field label={`Bán kính cảng thay thế: ${form.radiusKm} km`}><input type="range" min={0} max={800} step={50} className="w-full" value={form.radiusKm} onChange={(e) => setForm({ radiusKm: +e.target.value })} /></Field>
          </div>
        </details>
      </div>
      <div className="border-t border-slate-200 bg-white p-5">
        {error && <div role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <button type="button" onClick={run} className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700">Tính &amp; so sánh →</button>
        <p className="mt-2 text-center text-xs text-slate-500">Giá mô phỏng · Không phải báo giá thị trường</p>
      </div>
    </div>
  );
}
