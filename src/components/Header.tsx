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
  const ui = useDataStore((s) => s.uiTheme);
  const setUi = useDataStore((s) => s.setUiTheme);
  const count: Partial<Record<Page, number>> = { rates: nRates, tariffs: nTariffs, schedules: nSched, saved: nSaved };
  return (
    <header className="app-header flex h-13 shrink-0 items-stretch gap-4 border-b border-line bg-panel px-4 max-sm:gap-2 max-sm:px-2.5">
      <div className="flex shrink-0 items-center gap-2.5">
        {/* biểu tượng: container trên boong, đường đi cửa → cửa */}
        <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="7" fill="#e35d0b" /><path d="M5 20h22l-3.2 5H8.2z" fill="#fff" /><rect x="9" y="13" width="6" height="6" fill="#12313f" /><rect x="16" y="13" width="6" height="6" fill="#ffd9c2" /><rect x="12.5" y="7" width="6" height="6" fill="#ffd9c2" /></svg>
        <span className="font-display text-[20px] leading-none font-bold tracking-tight text-fg max-[479px]:sr-only">PortRank</span>
        <span className="hidden max-w-[150px] text-[11.5px] leading-tight text-mute xl:inline">Tối ưu chi phí vận chuyển cửa đến cửa</span>
      </div>
      <nav className="flex min-w-0 flex-1 items-stretch overflow-x-auto" aria-label="Trang">
        {NAV.map((n) => (
          <button key={n.page} onClick={() => setPage(n.page)} aria-current={page === n.page ? 'page' : undefined} className="nav-tab">
            {n.label}
            {count[n.page] ? <span className="nav-count">{count[n.page]}</span> : null}
          </button>
        ))}
      </nav>
      <span className="chip chip-est shrink-0 self-center max-md:!hidden" title="Mọi con số giá là ước tính trừ khi bạn đã nhập bảng giá thật">Giá: ước tính</span>
      <button
        className="btn shrink-0 self-center !px-2.5"
        onClick={() => setUi(ui === 'light' ? 'dark' : 'light')}
        title={ui === 'light' ? 'Chuyển giao diện sang nền tối' : 'Chuyển giao diện sang nền trắng'}
        aria-label={ui === 'light' ? 'Giao diện tối' : 'Giao diện sáng'}
      >
        {ui === 'light' ? '🌙' : '☀️'} <span className="max-[899px]:hidden">{ui === 'light' ? 'Nền tối' : 'Nền trắng'}</span>
      </button>
    </header>
  );
}
