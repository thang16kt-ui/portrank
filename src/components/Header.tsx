import { useAppStore, type Page } from '../store/useAppStore';

const NAV: { id: Page; label: string }[] = [
  { id: 'plan', label: 'Lập kế hoạch' },
  { id: 'prices', label: 'Giá mô phỏng' },
  { id: 'saved', label: 'Đã lưu' },
];

export default function Header() {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const savedCount = useAppStore((s) => s.saved.length);
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 py-3 border-b border-slate-200 bg-brand-900 px-4 text-white">
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
          <circle cx="16" cy="16" r="15" fill="#1d6fd1" />
          <path d="M6 19h20l-3.5 6h-13z" fill="#fff" />
          <rect x="9" y="13" width="4" height="5" fill="#f59e0b" />
          <rect x="14" y="13" width="4" height="5" fill="#ef4444" />
          <rect x="19" y="13" width="4" height="5" fill="#22c55e" />
          <rect x="14" y="8" width="4" height="4.5" fill="#f59e0b" />
        </svg>
        <div className="leading-tight">
          <div className="text-[17px] font-bold tracking-tight">PortRank <span className="ml-1 text-xs font-medium text-blue-200">1.1</span></div>
          <div className="hidden text-[10px] text-blue-200 sm:block">Global Freight Planner</div>
        </div>
      </div>
      <nav aria-label="Điều hướng chính" className="flex w-full gap-1 sm:ml-2 sm:w-auto">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => setPage(n.id)}
            className={`min-h-11 flex-1 rounded-lg px-3 py-2 text-sm sm:flex-none whitespace-nowrap transition ${page === n.id ? 'bg-white/15 font-semibold' : 'text-blue-100 hover:bg-white/10'}`}
          >
            {n.label}
            {n.id === 'saved' && savedCount > 0 && <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-brand-900">{savedCount}</span>}
          </button>
        ))}
      </nav>
      <div className="ml-auto hidden items-center gap-2 text-[11px] text-amber-200 md:flex">
        <span className="rounded border border-amber-300/40 px-2 py-0.5">Giá = mô hình ước tính / dữ liệu mô phỏng</span>
      </div>
    </header>
  );
}
