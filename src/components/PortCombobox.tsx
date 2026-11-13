import { useEffect, useMemo, useRef, useState } from 'react';
import { REGION_NAMES, REGION_ORDER, getPort, searchPorts } from '../data/ports';
import type { Port } from '../types';

interface Props {
  label: string;
  value: string | null;
  onChange: (code: string) => void;
  accent: 'pol' | 'pod';
  active?: boolean;
  onFocusPick?: () => void;
  placeholder?: string;
  compact?: boolean;
}

export function flag(country: string) {
  if (!/^[A-Z]{2}$/.test(country)) return '';
  return String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export default function PortCombobox({ label, value, onChange, accent, active, onFocusPick, placeholder, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = getPort(value);

  const results = useMemo(() => searchPorts(q), [q]);
  const grouped = useMemo(() => {
    const g: { region: string; ports: Port[] }[] = [];
    for (const r of REGION_ORDER) {
      const ports = results.filter((p) => p.region === r);
      if (ports.length) g.push({ region: REGION_NAMES[r], ports });
    }
    return g;
  }, [results]);
  const flat = useMemo(() => grouped.flatMap((g) => g.ports), [grouped]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  useEffect(() => setHi(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${hi}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  const pick = (p: Port) => {
    onChange(p.code);
    setOpen(false);
    setQ('');
  };

  const color = accent === 'pol' ? 'border-pol' : 'border-pod';
  const dot = accent === 'pol' ? 'bg-pol' : 'bg-pod';

  return (
    <div ref={box} className="relative">
      {label && (
        <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
          {label}
        </label>
      )}
      <div
        className={`flex items-center gap-2 rounded-lg border bg-white px-2.5 ${compact ? 'py-1.5' : 'py-2'} transition ${active ? `${color} ring-2 ring-offset-0 ${accent === 'pol' ? 'ring-blue-200' : 'ring-orange-200'}` : 'border-slate-300'}`}
      >
        <span className="text-lg leading-none">{selected ? flag(selected.country) : '⚓'}</span>
        <input
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          placeholder={selected ? `${selected.name} · ${selected.code}` : (placeholder ?? 'Tìm theo tên, quốc gia, UN/LOCODE…')}
          value={open ? q : selected ? `${selected.name} · ${selected.code}` : ''}
          onFocus={() => {
            setOpen(true);
            setQ('');
            onFocusPick?.();
          }}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(flat.length - 1, h + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
            else if (e.key === 'Enter' && flat[hi]) { e.preventDefault(); pick(flat[hi]); (e.target as HTMLInputElement).blur(); }
            else if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur(); }
          }}
          aria-label={label || placeholder}
        />
        <span className="text-xs text-slate-400">{selected?.country}</span>
      </div>
      {open && (
        <div ref={listRef} className="scroll-thin absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
          {flat.length === 0 && <div className="px-3 py-2 text-sm text-slate-500">Không tìm thấy cảng phù hợp</div>}
          {grouped.map((g) => (
            <div key={g.region}>
              <div className="sticky top-0 bg-slate-50 px-3 py-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{g.region}</div>
              {g.ports.map((p) => {
                const idx = flat.indexOf(p);
                return (
                  <button
                    type="button"
                    key={p.code}
                    data-idx={idx}
                    onMouseEnter={() => setHi(idx)}
                    onClick={() => pick(p)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${idx === hi ? 'bg-brand-50' : ''} ${p.code === value ? 'font-semibold' : ''}`}
                  >
                    <span>{flag(p.country)}</span>
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-xs text-slate-400">{p.countryName}</span>
                    <span className="w-14 text-right font-mono text-[11px] text-slate-500">{p.code}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
