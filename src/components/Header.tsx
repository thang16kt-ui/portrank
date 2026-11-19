import { useAppStore, type Page } from '../store/useAppStore';
import { useDataStore } from '../store/useDataStore';
import Icon from './Icon';

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
  const ui = useDataStore((s) => s.uiTheme);
  const setUi = useDataStore((s) => s.setUiTheme);
  const count: Partial<Record<Page, number>> = { rates: nRates, tariffs: nTariffs, schedules: nSched, saved: nSaved };
  return (
    <header className="app-header flex h-14 shrink-0 items-center gap-4 border-b border-line bg-panel px-4 max-[899px]:gap-2 max-[899px]:px-3">
      <div className="flex shrink-0 items-center gap-2.5">
        <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" style={{ fill: 'var(--color-panel2)' }} stroke="#22d3ee" strokeWidth="1.5" /><path d="M6 20c5-9 15-9 20 0" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" /><circle cx="6" cy="20" r="2.4" fill="#38bdf8" /><circle cx="26" cy="20" r="2.4" fill="#fb923c" /></svg>
        <span className="text-[17px] font-bold tracking-tight text-fg max-[479px]:hidden">Port<span className="text-amber-300">Rank</span></span>
        <span className="hidden border-l border-line pl-2.5 text-[12px] leading-tight text-mute xl:inline">Tối ưu chi phí vận chuyển<br />cửa đến cửa</span>
      </div>
      <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto" aria-label="Trang chính">
        {NAV.map((n) => (
          <button key={n.page} onClick={() => setPage(n.page)} aria-current={page === n.page ? 'page' : undefined} className="nav-item">
            {n.label}
            {count[n.page] ? <span className="nav-count num">{count[n.page]}</span> : null}
          </button>
        ))}
      </nav>
      <span className="hidden shrink-0 md:inline-flex"><span className="chip chip-est" title="Mọi con số giá là ước tính trừ khi bạn đã nhập bảng giá thật">Giá: ước tính</span></span>
      <button
        className="btn shrink-0 !px-2.5"
        onClick={() => setUi(ui === 'light' ? 'dark' : 'light')}
        title={ui === 'light' ? 'Chuyển giao diện sang nền tối' : 'Chuyển giao diện sang nền trắng'}
        aria-label={ui === 'light' ? 'Giao diện tối' : 'Giao diện sáng'}
      >
        <Icon name={ui === 'light' ? 'moon' : 'sun'} size={15} /> <span className="max-[899px]:hidden">{ui === 'light' ? 'Nền tối' : 'Nền trắng'}</span>
      </button>
    </header>
  );
}
