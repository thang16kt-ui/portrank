import { useRef } from 'react';
import { PORTS } from '../data/ports';
import { readTableFile } from '../lib/csv';
import { useAppStore } from '../store/useAppStore';

export function PageShell({ title, intro, actions, children }: { title: string; intro: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] space-y-3 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-fg">{title}</h1>
            <p className="max-w-[760px] text-[12px] leading-relaxed text-mute">{intro}</p>
          </div>
          <div className="flex flex-wrap gap-2">{actions}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Nút chọn file CSV / Excel → trả về mảng dòng */
export function ImportButton({ label = '⬆ Import CSV / Excel', onRows }: { label?: string; onRows: (rows: string[][]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept=".csv,.txt,.xlsx"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            onRows(await readTableFile(f));
          } catch (err) {
            useAppStore.getState().showToast(`Không đọc được file: ${(err as Error).message}`);
          }
        }}
      />
      <button className="btn" onClick={() => ref.current?.click()}>{label}</button>
    </>
  );
}

export function PortSelect({ value, onChange, allowEmpty }: { value: string; onChange: (v: string) => void; allowEmpty?: boolean }) {
  return (
    <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty && <option value="">—</option>}
      {PORTS.map((p) => (
        <option key={p.code} value={p.code}>{p.code} · {p.name}</option>
      ))}
    </select>
  );
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="lbl">{label}</label>
      {children}
    </div>
  );
}

export function ErrorList({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-2.5 text-[11.5px] text-red-200">
      <b>{errors.length} dòng bị bỏ qua:</b>
      <ul className="mt-1 list-disc pl-4">{errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}{errors.length > 8 && <li>…</li>}</ul>
    </div>
  );
}
