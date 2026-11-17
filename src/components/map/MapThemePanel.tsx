import { useEffect, useMemo, useRef, useState } from 'react';
import { COLOR_FIELDS, MAP_THEMES, resolveTheme, type MapTheme } from '../../config/mapThemes';
import { useDataStore } from '../../store/useDataStore';

/** Hình thu nhỏ của một chủ đề: biển, đất, viền bờ, tuyến hạng 1 và 2–3 */
function Swatch({ t }: { t: MapTheme }) {
  const C = t.colors;
  return (
    <svg viewBox="0 0 96 54" className="block h-auto w-full rounded-md" aria-hidden>
      <rect width="96" height="54" fill={C.sea} />
      <path d="M-2 40 C10 30 18 34 26 24 C34 14 46 18 50 8 L50 -2 L-2 -2 Z" fill={C.land} stroke={C.coast} strokeWidth="1" />
      <path d="M58 56 C62 44 74 46 80 38 C86 30 98 32 98 32 L98 56 Z" fill={C.land} stroke={C.coast} strokeWidth="1" />
      <path d="M-2 40 C10 30 18 34 26 24 C34 14 46 18 50 8" fill="none" stroke={C.coastGlow} strokeWidth="4" opacity={t.glow * 0.8} />
      <path d="M22 26 Q50 10 76 42" fill="none" stroke={C.rank23} strokeWidth="1.4" opacity=".9" />
      <path d="M22 26 Q46 2 76 42" fill="none" stroke={C.rank1} strokeWidth="2.4" />
      <circle cx="22" cy="26" r="2.6" fill={C.seller} />
      <circle cx="76" cy="42" r="2.6" fill={C.buyer} />
    </svg>
  );
}

/** Nút 🎨 + bảng chỉnh màu bản đồ: chủ đề có sẵn và màu từng phần (lưu trên trình duyệt) */
export default function MapThemePanel() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const setting = useDataStore((s) => s.mapTheme);
  const { setMapThemeBase, setMapColor, setMapGlow, resetMapTheme } = useDataStore.getState();
  const theme = useMemo(() => resolveTheme(setting), [setting]);
  const customised = Object.keys(setting.overrides).length > 0 || setting.glow != null;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="pointer-events-auto absolute top-3 right-[52px] z-30">
      <button className={`btn !px-2.5 ${open ? 'btn-on' : ''}`} onClick={() => setOpen(!open)} title="Chỉnh màu bản đồ" aria-expanded={open}>
        🎨 <span className="max-[899px]:hidden">Màu bản đồ</span>
      </button>
      {open && (
        <div className="absolute top-10 right-0 flex max-h-[min(560px,calc(100vh-160px))] w-[300px] flex-col rounded-xl border border-line bg-panel/97 shadow-2xl backdrop-blur" role="dialog" aria-label="Chỉnh màu bản đồ">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-[13px] font-semibold text-fg">Màu bản đồ</span>
            <button className="btn !px-2 !py-0.5" onClick={() => setOpen(false)} aria-label="Đóng">✕</button>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <section>
              <div className="mb-1.5 text-[10.5px] font-bold tracking-wide text-mute uppercase">Chủ đề có sẵn</div>
              <div className="grid grid-cols-3 gap-1.5">
                {MAP_THEMES.map((t) => {
                  const on = setting.base === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setMapThemeBase(t.id)}
                      className={`rounded-lg border p-1 text-left transition ${on ? 'border-gold ring-1 ring-gold/60' : 'border-line hover:border-[#35507c]'}`}
                      title={t.name}
                    >
                      <Swatch t={t} />
                      <div className={`mt-0.5 truncate text-[10.5px] ${on ? 'font-semibold text-amber-200' : 'text-mute'}`}>{t.name}</div>
                    </button>
                  );
                })}
              </div>
            </section>
            <section>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10.5px] font-bold tracking-wide text-mute uppercase">Tùy chỉnh từng màu</span>
                {customised && <span className="chip chip-sky">đã chỉnh</span>}
              </div>
              <div className="space-y-1">
                {COLOR_FIELDS.map((f) => {
                  const v = theme.colors[f.key];
                  const changed = setting.overrides[f.key] != null;
                  return (
                    <label key={f.key} className="flex items-center gap-2 text-[12px] text-fg">
                      <input
                        type="color"
                        value={v}
                        onChange={(e) => setMapColor(f.key, e.target.value)}
                        className="h-6 w-8 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0"
                        aria-label={f.label}
                      />
                      <span className="flex-1">{f.label}</span>
                      <code className="text-[10px] text-mute">{v}</code>
                      <button
                        className={`w-4 text-[11px] ${changed ? 'text-sky hover:text-white' : 'invisible'}`}
                        title="Về màu của chủ đề"
                        onClick={(e) => {
                          e.preventDefault();
                          setMapColor(f.key, null);
                        }}
                      >
                        ↺
                      </button>
                    </label>
                  );
                })}
              </div>
              <div className="mt-2">
                <div className="flex items-center justify-between text-[12px] text-fg">
                  <span>Độ phát sáng viền bờ</span>
                  <span className="text-[10.5px] text-mute">{Math.round(theme.glow * 100)}%</span>
                </div>
                <input type="range" min={0} max={100} value={Math.round(theme.glow * 100)} onChange={(e) => setMapGlow(+e.target.value / 100)} className="w-full" aria-label="Độ phát sáng viền bờ" />
              </div>
            </section>
            <div className="flex gap-2">
              <button className="btn flex-1" onClick={resetMapTheme} disabled={setting.base === MAP_THEMES[0].id && !customised}>Khôi phục mặc định</button>
            </div>
            <p className="text-[10.5px] leading-snug text-mute">Màu được lưu trên trình duyệt này. Chỉ đổi màu phần bản đồ; nhãn tự chuyển chữ sáng / tối theo màu biển.</p>
          </div>
        </div>
      )}
    </div>
  );
}
