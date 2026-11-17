import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { INCOTERMS, termsForMode } from '../config/incoterms';
import { useCurrent } from '../lib/actions';
import { namedPlace } from '../lib/incoterm';
import { useAppStore } from '../store/useAppStore';
import { useDataStore } from '../store/useDataStore';
import type { Incoterm, TransportMode } from '../types';
import { placeNamesOf } from './IncotermCard';
import IncotermDiagram, { cargoAt, EXPLAINER_SECONDS, IncotermLegend } from './IncotermDiagram';

/** Dòng chú thích theo từng mốc của hoạt ảnh (12–18 giây) */
function caption(term: Incoterm, mode: TransportMode, t: number): string {
  const d = INCOTERMS[term];
  const pos = cargoAt(t);
  const who = (p: 'seller' | 'buyer') => (p === 'seller' ? 'người bán' : 'người mua');
  if (t < 0.6) return 'Hàng sẵn sàng tại kho người bán…';
  if (pos < 100) {
    if (pos >= d.riskAt && pos < d.riskAt + 16) return '🚩 Từ đây rủi ro thuộc về người mua';
    if (pos < d.costAt) return `Người bán đang trả chi phí (${mode === 'sea' ? 'kho → cảng → tàu' : 'kho → bãi → cửa khẩu'})…`;
    return 'Từ đây người mua trả chi phí vận chuyển';
  }
  if (t < 8.5) return d.costAt !== d.riskAt ? 'Điểm chuyển rủi ro KHÁC điểm người bán hết trả cước' : 'Chi phí và rủi ro chuyển giao tại cùng một điểm';
  if (t < 9.5) return `Thông quan xuất khẩu: ${who(d.exportClearance)} làm`;
  if (t < 10.5) return d.insurance.by === 'seller' ? `Bảo hiểm: người bán mua – ${d.insurance.level}` : 'Bảo hiểm: không bắt buộc – bên chịu rủi ro tự quyết định';
  if (t < 11.5) return `Thông quan nhập khẩu + thuế: ${who(d.importClearance)} nộp`;
  return 'Điểm cần nhớ';
}

/**
 * Thẻ hoạt ảnh giải thích Incoterm (SVG + Framer Motion, không dùng video). Cảnh nền chính là IncotermDiagram
 * của điều kiện đang chọn; toàn bộ nội dung sinh từ config/incoterms.ts nên 11 điều kiện dùng chung một bộ hình.
 */
export default function IncotermExplainer() {
  const open = useAppStore((s) => s.explainerOpen);
  const term = useAppStore((s) => s.form.term);
  const mode = useAppStore((s) => s.form.mode);
  const plan = useAppStore((s) => s.plan);
  const set = useAppStore((s) => s.set);
  const autoplay = useDataStore((s) => s.explainerAutoplay);
  const setAutoplay = useDataStore((s) => s.setExplainerAutoplay);
  const cur = useCurrent();
  const reduced = useReducedMotion();
  const [t, setT] = useState(0);
  const [paused, setPaused] = useState(false);
  const last = useRef(0);

  // Mỗi lần mở / đổi điều kiện → phát lại từ đầu
  useEffect(() => {
    setT(0);
    setPaused(false);
  }, [term, mode, open]);

  useEffect(() => {
    if (!open || paused || reduced) return;
    let raf = 0;
    last.current = 0;
    const tick = (ts: number) => {
      const dt = last.current ? Math.min(0.5, (ts - last.current) / 1000) : 0;
      last.current = ts;
      setT((x) => Math.min(EXPLAINER_SECONDS, x + dt));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, paused, reduced, term, mode]);

  const def = INCOTERMS[term];
  const names = placeNamesOf(plan, cur?.option ?? null);
  const dMode = cur?.option.mode ?? mode;
  const valid = termsForMode(dMode).includes(term);
  const time = reduced ? EXPLAINER_SECONDS : t;
  const done = time >= EXPLAINER_SECONDS;
  const showPoints = reduced || time >= 11.5;

  return (
    <AnimatePresence>
      {open && valid && (
        <motion.div
          key="explainer"
          initial={{ opacity: 0, x: -28, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -28, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          className="pointer-events-auto absolute top-14 left-3 z-20 w-[min(430px,calc(100%-24px))] rounded-xl border border-line bg-panel/97 p-3 shadow-2xl backdrop-blur"
          role="dialog"
          aria-label={`Giải thích điều kiện ${term}`}
        >
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-lg leading-none font-bold text-amber-300">{term}</span>
                <span className="truncate text-[12px] font-semibold text-fg">{names ? namedPlace(term, names) : ''}</span>
              </div>
              <div className="text-[11px] text-mute">{def.nameVi}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {!reduced && (
                <>
                  <button className="btn !px-2 !py-0.5 !text-[11px]" onClick={() => (done ? (setT(0), setPaused(false)) : setPaused(!paused))}>{done ? '↺ Phát lại' : paused ? '▶ Phát' : '⏸ Tạm dừng'}</button>
                  {!done && <button className="btn !px-2 !py-0.5 !text-[11px]" onClick={() => { setT(0); setPaused(false); }} title="Phát lại từ đầu">↺</button>}
                </>
              )}
              <button className="btn !px-2 !py-0.5 !text-[11px]" aria-label="Đóng" onClick={() => set({ explainerOpen: false })}>✕</button>
            </div>
          </div>
          <div className="rounded-lg border border-line bg-well px-2 pt-2 pb-1">
            <IncotermDiagram term={term} mode={dMode} t={reduced ? undefined : time} compact />
            <IncotermLegend />
          </div>
          <div className="mt-1.5 min-h-[20px] text-[12px] font-medium text-cyan-100">{caption(term, dMode, time)}</div>
          <AnimatePresence>
            {showPoints && (
              <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-1 space-y-1">
                {def.keyPoints.map((p, i) =>
                  reduced || time >= 11.5 + i ? (
                    <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }} className="flex gap-1.5 text-[11.5px] leading-snug text-fg">
                      <span className="text-amber-300">•</span> {p}
                    </motion.li>
                  ) : null,
                )}
              </motion.ul>
            )}
          </AnimatePresence>
          {!reduced && <div className="mt-2 h-0.5 overflow-hidden rounded bg-line"><div className="h-full bg-sky" style={{ width: `${(time / EXPLAINER_SECONDS) * 100}%` }} /></div>}
          <label className="mt-2 flex items-center gap-1.5 text-[11px] text-mute">
            <input type="checkbox" checked={!autoplay} onChange={(e) => setAutoplay(!e.target.checked)} /> Không tự phát nữa
            <span className="ml-auto text-[9.5px] opacity-70">Theo Incoterms® 2020 của ICC</span>
          </label>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
