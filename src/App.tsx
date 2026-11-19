import { useEffect, useState } from 'react';
import { useDataStore } from './store/useDataStore';
import AllIncotermsModal from './components/AllIncotermsModal';
import DetailDrawer from './components/DetailDrawer';
import Header from './components/Header';
import Icon from './components/Icon';
import IncotermExplainer from './components/IncotermExplainer';
import PortCard from './components/PortCard';
import ResultPanel from './components/ResultPanel';
import Sidebar from './components/Sidebar';
import MapBoundary from './components/map/MapBoundary';
import RoadMap from './components/map/RoadMap';
import JourneyMap from './components/map/JourneyMap';
import PortCatalogPage from './pages/PortCatalogPage';
import RateTablePage from './pages/RateTablePage';
import SavedPage from './pages/SavedPage';
import SchedulePage from './pages/SchedulePage';
import TariffTablePage from './pages/TariffTablePage';
import { useAppStore } from './store/useAppStore';

function Planner() {
  const sheetOpen = useAppStore((s) => s.sheetOpen);
  const set = useAppStore((s) => s.set);
  const portView = useAppStore((s) => s.portView);
  // Keep an existing Google road result on a Google map while a new sea request is still loading.
  const mode = useAppStore((s) => s.plan?.input.mode === 'road' ? 'road' : s.form.mode);
  const [collapsed, setCollapsed] = useState(false);
  const hidePanel = collapsed || !!portView;
  return (
    <div className="flex min-h-0 flex-1 max-[899px]:block max-[899px]:overflow-y-auto">
      {/* Bảng nhập dọc 380px – dưới 900px thành bottom sheet */}
      <aside
        className={`w-[368px] shrink-0 border-r border-line bg-ink max-[899px]:fixed max-[899px]:inset-x-0 max-[899px]:bottom-0 max-[899px]:z-50 max-[899px]:max-h-[82vh] max-[899px]:w-auto max-[899px]:rounded-t-2xl max-[899px]:border-t max-[899px]:border-r-0 max-[899px]:shadow-[0_-12px_40px_rgba(0,0,0,.6)] max-[899px]:transition-transform ${sheetOpen ? '' : 'max-[899px]:translate-y-full'}`}
      >
        <div className="hidden items-center justify-between border-b border-line px-4 py-2.5 max-[899px]:flex">
          <span className="text-[15px] font-semibold text-fg">Nhập thông tin</span>
          <button className="btn !min-h-[36px] !px-2" aria-label="Đóng bảng nhập" onClick={() => set({ sheetOpen: false })}><Icon name="x" size={18} /></button>
        </div>
        <div className="h-full max-[899px]:h-auto max-[899px]:max-h-[calc(82vh-40px)] max-[899px]:overflow-y-auto">
          <Sidebar />
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col max-[899px]:block">
        <div className="relative min-h-0 flex-1 max-[899px]:h-[52vh]">
          {/* Một bản đồ duy nhất: hành trình xe – tàu – xe (đường bộ dùng cùng bản đồ, hoặc Google khi nguồn là Google) */}
          {mode === 'road' ? <RoadMap /> : <MapBoundary key="journey" webgl={false}><JourneyMap /></MapBoundary>}
          <div className="pointer-events-none absolute inset-0">
            <IncotermExplainer />
            <PortCard />
            <div className="pointer-events-auto"><DetailDrawer /></div>
          </div>
        </div>
        {!portView && (
          <button
            className="hidden h-7 w-full shrink-0 items-center justify-center gap-1.5 border-t border-line bg-panel text-[12px] font-medium text-mute transition-colors hover:bg-panel2 hover:text-fg min-[900px]:flex"
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            title={collapsed ? 'Mở bảng kết quả' : 'Thu gọn bảng kết quả'}
          >
            <Icon name={collapsed ? 'chevronUp' : 'chevronDown'} size={15} />
            {collapsed ? 'Hiện bảng kết quả' : 'Thu gọn kết quả'}
          </button>
        )}
        <div className={`shrink-0 bg-ink min-[900px]:h-[44%] min-[900px]:max-h-[460px] min-[900px]:min-h-[310px] ${hidePanel ? 'min-[900px]:hidden' : ''} max-[899px]:pb-16`}>
          <ResultPanel />
        </div>
      </main>
      {!sheetOpen && (
        <button className="btn-primary fixed right-4 bottom-4 z-40 hidden min-h-[48px] rounded-full px-5 py-3 text-[14px] font-semibold shadow-xl max-[899px]:inline-flex items-center gap-2" onClick={() => set({ sheetOpen: true })}>
          <Icon name="edit" size={17} /> Nhập thông tin
        </button>
      )}
    </div>
  );
}

export default function App() {
  const page = useAppStore((s) => s.page);
  const ui = useDataStore((s) => s.uiTheme);
  useEffect(() => {
    document.documentElement.dataset.ui = ui;
  }, [ui]);
  return (
    <div className="flex h-full flex-col">
      <Header />
      {page === 'plan' && <Planner />}
      {page !== 'plan' && (
        <div className="min-h-0 flex-1">
          {page === 'rates' && <RateTablePage />}
          {page === 'tariffs' && <TariffTablePage />}
          {page === 'schedules' && <SchedulePage />}
          {page === 'ports' && <PortCatalogPage />}
          {page === 'saved' && <SavedPage />}
        </div>
      )}
      <AllIncotermsModal />
      <PageToast />
    </div>
  );
}

/** Toast cho các trang không có bản đồ */
function PageToast() {
  const toast = useAppStore((s) => s.toast);
  const page = useAppStore((s) => s.page);
  if (!toast || page === 'plan') return null;
  return <div role="status" className="toast-pop fixed top-16 left-1/2 z-[70] -translate-x-1/2 rounded-full border border-line bg-panel px-4 py-2 text-[13px] font-medium text-fg shadow-lg">{toast}</div>;
}
