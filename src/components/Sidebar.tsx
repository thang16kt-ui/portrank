import { useState, type ReactNode } from 'react';
import { CARGO_LABEL, CONTAINER_LABEL } from '../config/pricing';
import { PRIORITY_LABEL } from '../config/weights';
import { VN_QUICK, getPort } from '../data/ports';
import { findRoute } from '../lib/routing';
import { routeOptionsOf } from '../lib/results';
import { useAppStore, usePlayback } from '../store/useAppStore';
import type { CargoType, ContainerType, Priority } from '../types';
import PortCombobox from './PortCombobox';

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-slate-600">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, cols }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; cols?: number }) {
  return (
    <div className="grid gap-1 rounded-lg bg-slate-100 p-1" style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0,1fr))` }}>
      {options.map((o) => (
        <button
          type="button"
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-md px-2 py-1.5 text-xs transition ${value === o.v ? 'bg-white font-semibold text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
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
  const pickTarget = useAppStore((s) => s.pickTarget);
  const setPickTarget = useAppStore((s) => s.setPickTarget);
  const setPriority = useAppStore((s) => s.setPriority);
  const compute = useAppStore((s) => s.compute);
  const showToast = useAppStore((s) => s.showToast);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    const pol = getPort(form.pol), pod = getPort(form.pod);
    if (!pol || !pod) return setError('Vui lòng chọn cảng đi và cảng đến.');
    if (pol.code === pod.code) return setError('Cảng đi và cảng đến phải khác nhau.');
    setError(null);
    try {
      const t = performance.now();
      const route = findRoute(pol, pod, routeOptionsOf(form));
      compute(route);
      usePlayback.getState().setProgress(0);
      usePlayback.getState().setPlaying(true);
      if (window.innerWidth < 900) setSidebarOpen(false);
      route.warnings.forEach((w) => showToast(w));
      console.info(`[PortRank] tuyến ${pol.code}→${pod.code}: ${Math.round(route.distanceNm)} hải lý, ${(performance.now() - t).toFixed(0)} ms (${route.engine})`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4">
        <Field label="Loại hàng">
          <select className={input} value={form.cargo} onChange={(e) => setForm({ cargo: e.target.value as CargoType })}>
            {(Object.keys(CARGO_LABEL) as CargoType[]).map((k) => (
              <option key={k} value={k}>{CARGO_LABEL[k]}</option>
            ))}
          </select>
        </Field>

        <Field label="Hình thức">
          <Segmented value={form.mode} onChange={(mode) => setForm({ mode })} options={[{ v: 'FCL', label: 'FCL – nguyên container' }, { v: 'LCL', label: 'LCL – hàng lẻ' }]} />
        </Field>

        {form.mode === 'FCL' ? (
          <div className="grid grid-cols-[1fr_88px] gap-2">
            <Field label="Loại container">
              <select className={input} value={form.container} onChange={(e) => setForm({ container: e.target.value as ContainerType })}>
                {(Object.keys(CONTAINER_LABEL) as ContainerType[]).map((k) => (
                  <option key={k} value={k} disabled={form.cargo === 'reefer' ? k !== '40RF' : false}>{CONTAINER_LABEL[k]}</option>
                ))}
              </select>
            </Field>
            <Field label="Số lượng">
              <input type="number" min={1} max={500} className={input} value={form.quantity} onChange={(e) => setForm({ quantity: Math.max(1, +e.target.value || 1) })} />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Số khối (CBM)">
              <input type="number" min={0.1} step={0.1} className={input} value={form.cbm} onChange={(e) => setForm({ cbm: Math.max(0, +e.target.value || 0) })} />
            </Field>
            <Field label="Trọng lượng (kg)">
              <input type="number" min={1} step={10} className={input} value={form.weightKg} onChange={(e) => setForm({ weightKg: Math.max(0, +e.target.value || 0) })} />
            </Field>
          </div>
        )}
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={form.woodPallet} onChange={(e) => setForm({ woodPallet: e.target.checked })} />
          Có dùng pallet / bao bì gỗ
        </label>

        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <PortCombobox label="Cảng đi (POL)" accent="pol" value={form.pol} onChange={(c) => setPort('pol', c)} active={pickTarget === 'pol'} onFocusPick={() => setPickTarget('pol')} />
          <QuickVN onPick={(c) => setPort('pol', c)} />
          <div className="flex justify-center">
            <button type="button" onClick={swap} title="Đảo chiều đi/đến" className="rounded-full border border-slate-300 bg-white px-3 py-0.5 text-sm hover:bg-slate-100">⇅ Đảo chiều</button>
          </div>
          <PortCombobox label="Cảng đến (POD)" accent="pod" value={form.pod} onChange={(c) => setPort('pod', c)} active={pickTarget === 'pod'} onFocusPick={() => setPickTarget('pod')} />
          <QuickVN onPick={(c) => setPort('pod', c)} />
          <div className="pt-1">
            <div className="mb-1 text-[11px] font-semibold text-slate-500">Hoặc chọn trên bản đồ – đang chọn:</div>
            <Segmented value={pickTarget} onChange={setPickTarget} options={[{ v: 'pol', label: '● Điểm đi' }, { v: 'pod', label: '● Điểm đến' }]} />
          </div>
        </div>

        <Field label="Ngày hàng sẵn sàng">
          <input type="date" className={input} value={form.readyDate} onChange={(e) => setForm({ readyDate: e.target.value })} />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Bạn là">
            <Segmented value={form.role} onChange={(role) => setForm({ role })} cols={1} options={[{ v: 'seller', label: 'Người bán (XK)' }, { v: 'buyer', label: 'Người mua (NK)' }]} />
          </Field>
          <Field label="Ai book tàu">
            <Segmented value={form.booker} onChange={(booker) => setForm({ booker })} cols={1} options={[{ v: 'me', label: 'Tôi tự book' }, { v: 'other', label: 'Bên kia book' }]} />
          </Field>
        </div>

        <Field label="Ưu tiên">
          <Segmented value={form.priority} onChange={(p) => setPriority(p as Priority)} cols={2} options={(Object.keys(PRIORITY_LABEL) as Priority[]).map((k) => ({ v: k, label: PRIORITY_LABEL[k] }))} />
        </Field>

        <Field label="Tùy chọn tuyến">
          <div className="space-y-1.5 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.avoidRedSea} onChange={(e) => setForm({ avoidRedSea: e.target.checked })} />
              Tránh Biển Đỏ <span className="text-xs text-slate-400">(đi vòng Mũi Hảo Vọng)</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.avoidPanama} onChange={(e) => setForm({ avoidPanama: e.target.checked })} />
              Tránh kênh Panama
            </label>
          </div>
        </Field>

        <Field label={`Bán kính tìm cảng thay thế: ${form.radiusKm} km`}>
          <input type="range" min={0} max={800} step={50} className="w-full" value={form.radiusKm} onChange={(e) => setForm({ radiusKm: +e.target.value })} />
        </Field>

        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer select-none">Nâng cao</summary>
          <div className="mt-2">
            <Field label="Engine tìm tuyến">
              <Segmented value={form.engine} onChange={(engine) => setForm({ engine })} options={[{ v: 'searoute', label: 'searoute-js (marnet)' }, { v: 'graph', label: 'Đồ thị dự phòng' }]} />
            </Field>
          </div>
        </details>
      </div>

      <div className="border-t border-slate-200 bg-white p-4">
        {error && <div className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <button type="button" onClick={run} className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-md shadow-blue-900/20 transition hover:bg-brand-700 active:scale-[.99]">
          🚢 Tính &amp; mô phỏng hành trình
        </button>
      </div>
    </div>
  );
}

function QuickVN({ onPick }: { onPick: (code: string) => void }) {
  return (
    <div className="flex items-center gap-1 text-[11px]">
      <span className="text-slate-500">🇻🇳 VN ·</span>
      {VN_QUICK.map((q) => (
        <button type="button" key={q.code} onClick={() => onPick(q.code)} className="rounded border border-slate-200 bg-white px-2 py-0.5 hover:border-brand-500 hover:text-brand-700">
          {q.label}
        </button>
      ))}
    </div>
  );
}
