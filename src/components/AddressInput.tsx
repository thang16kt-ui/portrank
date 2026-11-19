import { useEffect, useRef, useState } from 'react';
import { flag } from '../lib/format';
import { mergePlaces, resolveCountryCoord, searchOffline, searchOnline, switchBranch } from '../lib/geocoding';
import type { Place } from '../types';
import Icon from './Icon';

interface Props {
  label: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  placeholder?: string;
  color: string;
}

/**
 * Một ô nhập duy nhất: gõ tên QUỐC GIA hoặc ĐỊA CHỈ / THÀNH PHỐ. Gợi ý tách 2 nhóm.
 * Chọn quốc gia → nhánh A (cảng đến cảng); chọn địa điểm → nhánh B (có tính nội địa). Bấm chip để đổi nhánh.
 */
export default function AddressInput({ label, value, onChange, placeholder, color }: Props) {
  const [text, setText] = useState(value?.label ?? '');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => setText(value?.label ?? ''), [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Gợi ý: dữ liệu có sẵn hiện ngay; Photon (OpenStreetMap) bổ sung sau 400 ms
  useEffect(() => {
    if (!open) return;
    const q = text.trim();
    if (q.length < 2 || q === value?.label) { setItems([]); return; }
    const id = ++seq.current;
    let local: Place[] = [];
    searchOffline(q).then((r) => {
      if (id !== seq.current) return;
      local = r;
      setItems(r);
      setActive(0);
    });
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      const online = await searchOnline(q, ctrl.signal);
      if (id !== seq.current) return;
      setBusy(false);
      setItems(mergePlaces(local, online));
    }, 400);
    return () => { clearTimeout(timer); ctrl.abort(); setBusy(false); };
  }, [text, open, value]);

  const pick = async (p: Place) => {
    setOpen(false);
    onChange(await resolveCountryCoord(p));
  };
  const countries = items.filter((i) => i.kind === 'country');
  const places = items.filter((i) => i.kind === 'address');
  const flat = [...countries, ...places];

  return (
    <div ref={box} className="relative">
      <div className="mb-[5px] flex items-center justify-between gap-2">
        <label className="lbl !mb-0">{label}</label>
        {value && (
          <button
            className={`chip cursor-pointer ${value.kind === 'country' ? 'chip-sky' : 'chip-real'}`}
            title="Bấm để đổi nhánh"
            onClick={async () => onChange(await switchBranch(value))}
          >
            <Icon name={value.kind === 'country' ? 'globe' : 'pin'} size={12} />{value.kind === 'country' ? 'Quốc gia · cảng đến cảng' : 'Địa chỉ · có tính nội địa'} <Icon name="swap" size={12} className="opacity-60" />
          </button>
        )}
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 h-2.5 w-2.5 -translate-y-1/2 rounded-full ring-2 ring-white/70" style={{ background: color }} aria-hidden="true" />
        <input
          aria-label={label}
          className={`field !pl-8 ${value ? '!pr-9' : ''}`}
          value={text}
          placeholder={placeholder ?? 'Quốc gia hoặc địa chỉ / thành phố'}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onFocus={(e) => { e.target.select(); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            else if (e.key === 'Enter' && flat[active]) { e.preventDefault(); pick(flat[active]); }
            else if (e.key === 'Escape') setOpen(false);
          }}
        />
        {value && (
          <button className="absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-mute hover:bg-panel2 hover:text-fg" title="Xoá" aria-label={`Xoá ${label}`} onClick={() => { onChange(null); setText(''); }}><Icon name="x" size={15} /></button>
        )}
      </div>
      {open && (flat.length > 0 || busy) && (
        <div className="absolute z-40 mt-1.5 max-h-72 w-full overflow-auto rounded-xl border border-line bg-panel py-1.5 shadow-[0_12px_32px_rgba(15,23,42,.16)]">
          {countries.length > 0 && <div className="px-3 pt-1 pb-0.5 text-[11px] font-semibold tracking-wide text-mute uppercase">Quốc gia</div>}
          {countries.map((p, i) => (
            <Row key={`c${p.country}`} p={p} on={active === i} onPick={pick} />
          ))}
          {places.length > 0 && <div className="px-3 pt-2 pb-0.5 text-[11px] font-semibold tracking-wide text-mute uppercase">Địa điểm</div>}
          {places.map((p, i) => (
            <Row key={`a${p.label}${i}`} p={p} on={active === countries.length + i} onPick={pick} />
          ))}
          {busy && <div className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-mute"><Icon name="loader" size={13} className="animate-spin" />Đang tìm thêm trên OpenStreetMap…</div>}
        </div>
      )}
    </div>
  );
}

function Row({ p, on, onPick }: { p: Place; on: boolean; onPick: (p: Place) => void }) {
  return (
    <button onMouseDown={(e) => { e.preventDefault(); onPick(p); }} className={`flex min-h-[38px] w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] ${on ? 'bg-sky/10 text-fg font-medium' : 'text-fg hover:bg-panel2'}`}>
      <span>{flag(p.country)}</span>
      <span className="min-w-0 flex-1 truncate">{p.label}</span>
      {p.source === 'photon' && <span className="text-[10px] text-mute">OSM</span>}
    </button>
  );
}
