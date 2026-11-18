import { useEffect, useState } from 'react';
import { useDataStore } from './store/useDataStore';
import AllIncotermsModal from './components/AllIncotermsModal';
import DetailDrawer from './components/DetailDrawer';
import Header from './components/Header';
import IncotermExplainer from './components/IncotermExplainer';
import PortCard from './components/PortCard';
import ResultPanel from './components/ResultPanel';
import Sidebar from './components/Sidebar';
import MapView from './components/map/MapView';
import MapBoundary from './components/map/MapBoundary';
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
  const [collapsed, setCollapsed] = useState(false);
  const hidePanel = collapsed || !!portView;
  return (
    <div className="flex min-h-0 flex-1 max-[899px]:block max-[899px]:overflow-y-auto">
      {/* Bảng nhập dọc 380px – dưới 900px thành bottom sheet */}
      <aside
        className={`w-[380px] shrink-0 border-r border-line bg-ink max-[899px]:fixed max-[899px]:inset-x-0 max-[899px]:bottom-0 max-[899px]:z-50 max-[899px]:max-h-[82vh] max-[899px]:w-auto max-[899px]:rounded-t-2xl max-[899px]:border-t max-[899px]:border-r-0 max-[899px]:shadow-[0_-12px_40px_rgba(0,0,0,.6)] max-[899px]:transition-transform ${sheetOpen ? '' : 'max-[899px]:translate-y-full'}`}
      >
        <div className="hidden items-center justify-between border-b border-line px-3 py-2 max-[899px]:flex">
          <span className="text-[13px] font-semibold text-fg">Nhập thông tin</span>
          <button className="btn !px-2 !py-0.5" onClick={() => set({ sheetOpen: false })}>✕</button>
        </div>
        <div className="h-full max-[899px]:h-auto max-[899px]:max-h-[calc(82vh-40px)] max-[899px]:overflow-y-auto">
          <Sidebar />
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col max-[899px]:block">
        <div className="relative min-h-0 flex-1 max-[899px]:h-[52vh]">
          <MapBoundary>
            <MapView />
          </MapBoundary>
          <div className="pointer-events-none absolute inset-0">
            <IncotermExplainer />
            <PortCard />
            <div className="pointer-events-auto"><DetailDrawer /></div>
          </div>
        </div>
        {!portView && (
          <button
            className="hidden h-4 w-full shrink-0 items-center justify-center border-t border-line bg-panel text-[9px] leading-none text-mute hover:text-fg min-[900px]:flex"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Mở bảng kết quả' : 'Thu gọn bảng kết quả'}
          >
            {collapsed ? '▲ Bảng kết quả' : '▼'}
          </button>
        )}
        <div className={`shrink-0 bg-ink min-[900px]:h-[43%] min-[900px]:max-h-[430px] min-[900px]:min-h-[300px] ${hidePanel ? 'min-[900px]:hidden' : ''} max-[899px]:pb-16`}>
          <ResultPanel />
        </div>
      </main>
      {!sheetOpen && (
        <button className="fixed right-3 bottom-3 z-40 hidden rounded-full btn-primary px-4 py-2.5 text-[13px] font-bold shadow-xl max-[899px]:block" onClick={() => set({ sheetOpen: true })}>
          ✎ Nhập thông tin
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
  return <div className="toast-pop fixed top-14 left-1/2 z-[70] -translate-x-1/2 rounded-full border border-line bg-panel px-4 py-2 text-xs text-fg shadow-lg">{toast}</div>;
}
