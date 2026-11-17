import { INCOTERMS, termsForMode } from '../config/incoterms';
import { useAppStore } from '../store/useAppStore';
import type { Incoterm } from '../types';
import IncotermDiagram, { IncotermLegend } from './IncotermDiagram';

/** Trang "Tất cả Incoterm": lưới sơ đồ thu nhỏ theo phương thức đang chọn, chia 2 nhóm như chuẩn ICC */
export default function AllIncotermsModal() {
  const open = useAppStore((s) => s.allTermsOpen);
  const mode = useAppStore((s) => s.form.mode);
  const term = useAppStore((s) => s.form.term);
  const set = useAppStore((s) => s.set);
  const setTerm = useAppStore((s) => s.setTerm);
  if (!open) return null;
  const terms = termsForMode(mode);
  const groups: { title: string; list: Incoterm[] }[] = [
    { title: 'Mọi phương thức vận tải (7)', list: terms.filter((t) => INCOTERMS[t].group === 'any') },
    { title: 'Đường biển và thủy nội địa (4)', list: terms.filter((t) => INCOTERMS[t].group === 'sea') },
  ].filter((g) => g.list.length);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3" onClick={() => set({ allTermsOpen: false })}>
      <div className="flex max-h-full w-full max-w-[1180px] flex-col rounded-2xl border border-line bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div>
            <h2 className="text-[15px] font-semibold text-fg">So sánh các điều kiện · {mode === 'sea' ? 'Đường biển' : 'Đường bộ'}</h2>
            <IncotermLegend />
          </div>
          <button className="btn" onClick={() => set({ allTermsOpen: false })}>✕ Đóng</button>
        </div>
        <div className="space-y-4 overflow-y-auto p-4">
          {groups.map((g) => (
            <section key={g.title}>
              <h3 className="mb-2 text-[11px] font-bold tracking-wide text-mute uppercase">{g.title}</h3>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {g.list.map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTerm(t, { silent: true }); set({ allTermsOpen: false }); }}
                    className={`rounded-xl border p-2.5 text-left transition hover:border-sky ${t === term ? 'border-gold bg-gold/5' : 'border-line bg-[#0a1120]'}`}
                  >
                    <div className="mb-1 flex items-baseline gap-2">
                      <span className="text-base font-bold text-amber-300">{t}</span>
                      <span className="truncate text-[11.5px] text-fg">{INCOTERMS[t].nameVi}</span>
                    </div>
                    <IncotermDiagram term={t} mode={mode} compact />
                    <p className="mt-1 text-[10.5px] leading-snug text-mute">{INCOTERMS[t].summary}</p>
                  </button>
                ))}
              </div>
            </section>
          ))}
          <p className="text-[10px] text-mute">Theo Incoterms® 2020 của ICC. “Incoterms” là nhãn hiệu của Phòng Thương mại Quốc tế (ICC). Sơ đồ do PortRank tự thiết kế.</p>
        </div>
      </div>
    </div>
  );
}
