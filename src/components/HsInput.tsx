import { useEffect, useMemo, useState } from 'react';
import { describeHs, fmtHsCode, loadHsIndex, searchHs, type HsIndex } from '../lib/hs';

/**
 * Ô nhập mã HS theo chuẩn HS6: gợi ý theo số hoặc từ khoá (tiếng Anh), kiểm tra mã có trong HS 2022,
 * hiện mô tả chương / nhóm / phân nhóm. Mã quốc gia 8–10 số vẫn nhập được (6 số đầu phải là HS6 hợp lệ).
 */
export default function HsInput({ value, onChange, onPickDesc }: { value: string; onChange: (hs: string) => void; onPickDesc?: (desc: string) => void }) {
  const [idx, setIdx] = useState<HsIndex | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    loadHsIndex().then(setIdx, () => setErr(true));
  }, []);

  const hits = useMemo(() => (idx && open ? searchHs(idx, q || value, 8) : []), [idx, open, q, value]);
  const info = useMemo(() => (idx && value ? describeHs(idx, value) : null), [idx, value]);

  const pick = (code: string, desc: string) => {
    onChange(code);
    onPickDesc?.(desc);
    setQ('');
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        className={`field ${info && !info.valid && info.input.length >= 6 ? '!border-amber-400/70' : ''}`}
        placeholder="6109.10 hoặc t-shirts"
        value={open && q ? q : value}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          const v = e.target.value;
          setActive(0);
          // gõ số → cập nhật mã luôn; gõ chữ → chỉ tìm kiếm
          if (/^[\d.\s]*$/.test(v)) {
            onChange(v.replace(/[^0-9.]/g, '').slice(0, 13));
            setQ('');
          } else setQ(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === 'Enter' && open && hits[active]) { e.preventDefault(); pick(hits[active].code, hits[active].desc); }
          else if (e.key === 'Escape') setOpen(false);
        }}
        aria-label="Mã HS"
      />
      {open && hits.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-72 w-[min(340px,80vw)] overflow-y-auto rounded-lg border border-line bg-panel py-1 shadow-xl">
          {hits.map((h, i) => (
            <button
              key={h.code}
              onMouseDown={(e) => { e.preventDefault(); pick(h.code, h.desc); }}
              onMouseEnter={() => setActive(i)}
              className={`block w-full px-2.5 py-1.5 text-left text-[11.5px] ${i === active ? 'bg-sky/15' : 'hover:bg-white/5'}`}
            >
              <span className="font-mono font-semibold text-amber-200">{fmtHsCode(h.code)}</span> <span className="text-fg">{h.desc}</span>
              {h.heading && <div className="truncate text-[10.5px] text-mute">{h.heading}</div>}
            </button>
          ))}
        </div>
      )}
      {err && <div className="mt-1 text-[10.5px] text-mute">Không tải được danh mục HS – vẫn nhập mã được.</div>}
      {info?.problem && <div className="mt-1 text-[10.5px] text-amber-200">⚠ {info.problem}</div>}
      {info?.valid && (
        <div className="mt-1 text-[10.5px] leading-snug text-mute" title={`${info.chapter ?? ''} › ${info.heading ?? ''}`}>
          ✓ HS6 <b className="font-mono text-fg">{fmtHsCode(info.hs6)}</b>
          {info.national && <> + mã quốc gia <b className="font-mono text-fg">{info.national}</b></>} · {info.subheading}
        </div>
      )}
    </div>
  );
}
