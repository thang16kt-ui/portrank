import { useAppStore, type Page } from '../store/useAppStore';
import { useDataStore } from '../store/useDataStore';

const NAV: { page: Page; label: string }[] = [
  { page: 'plan', label: 'Lập kế hoạch' },
  { page: 'rates', label: 'Bảng giá của tôi' },
  { page: 'tariffs', label: 'Biểu thuế' },
  { page: 'schedules', label: 'Lịch tàu' },
  { page: 'ports', label: 'Danh mục cảng' },
  { page: 'saved', label: 'Đã lưu' },
];

export default function Header() {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const nSaved = useAppStore((s) => s.saved.length);
  const nRates = useDataStore((s) => s.rates.length);
  const nTariffs = useDataStore((s) => s.tariffs.length);
  const nSched = useDataStore((s) => s.schedules.length);
  const count: Partial<Record<Page, number>> = { rates: nRates, tariffs: nTariffs, schedules: nSched, saved: nSaved };
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      <div className="flex shrink-0 items-center gap-2">
        <svg width="24" height="24" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#0b1322" stroke="#22d3ee" strokeWidth="1.5" /><path d="M6 20c5-9 15-9 20 0" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" /><circle cx="6" cy="20" r="2.4" fill="#38bdf8" /><circle cx="26" cy="20" r="2.4" fill="#fb923c" /></svg>
        <span className="text-[15px] font-bold tracking-tight text-fg">Port<span className="text-amber-300">Rank</span></span>
        <span className="hidden text-[11px] text-mute lg:inline">Tối ưu chi phí vận chuyển cửa đến cửa</span>
      </div>
      <nav className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
        {NAV.map((n) => (
          <button key={n.page} onClick={() => setPage(n.page)} className={`rounded-md px-2.5 py-1.5 text-[12.5px] font-medium whitespace-nowrap transition ${page === n.page ? 'bg-gold/15 text-amber-200' : 'text-mute hover:bg-white/5 hover:text-fg'}`}>
            {n.label}
            {count[n.page] ? <span className="ml-1 rounded-full bg-white/10 px-1.5 text-[10px]">{count[n.page]}</span> : null}
          </button>
        ))}
      </nav>
      <span className="chip chip-est hidden shrink-0 md:inline-flex" title="Mọi con số giá là ước tính trừ khi bạn đã nhập bảng giá thật">Giá: ước tính</span>
    </header>
  );
}
