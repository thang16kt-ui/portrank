import { lazy, Suspense } from 'react';
import Header from './components/Header';
import MapOverlays from './components/MapOverlays';
import MapView from './components/MapView';
import ResultPanel from './components/ResultPanel';
import Sidebar from './components/Sidebar';
import { useAppStore } from './store/useAppStore';

const PriceWatch = lazy(() => import('./pages/PriceWatch'));
const SavedQuotes = lazy(() => import('./pages/SavedQuotes'));

export default function App() {
  const page = useAppStore((s) => s.page);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  return (
    <div className="flex h-full flex-col">
      <Header />
      <div className="relative flex min-h-0 flex-1">
        {/* Sidebar: cột trái ≥900px, bottom sheet <900px */}
        <aside
          className={`z-30 flex flex-col bg-white transition-transform duration-300 max-[899px]:fixed max-[899px]:inset-x-0 max-[899px]:bottom-0 max-[899px]:h-[78vh] max-[899px]:rounded-t-2xl max-[899px]:shadow-[0_-10px_30px_rgba(0,0,0,.25)] min-[900px]:w-[380px] min-[900px]:shrink-0 min-[900px]:border-r min-[900px]:border-slate-200 ${
            page !== 'plan' ? 'hidden' : ''
          } ${sidebarOpen ? '' : 'max-[899px]:translate-y-[calc(100%-0px)]'}`}
        >
          <button className="flex w-full items-center justify-center gap-2 py-2 text-xs font-semibold text-slate-600 min-[900px]:hidden" onClick={() => setSidebarOpen(false)}>
            <span className="h-1 w-10 rounded bg-slate-300" /> Thu gọn
          </button>
          <div className="min-h-0 flex-1">
            <Sidebar />
          </div>
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className={`relative min-h-0 flex-1 ${page !== 'plan' ? 'hidden' : ''}`}>
            <MapView />
            <div className="pointer-events-none absolute inset-0 z-10">
              <MapOverlays />
            </div>
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="absolute bottom-[132px] left-1/2 z-20 -translate-x-1/2 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-lg min-[900px]:hidden"
              >
                ⚙️ Thiết lập lô hàng
              </button>
            )}
          </div>
          {page === 'plan' && <ResultPanel />}
          {page !== 'plan' && (
            <Suspense fallback={<div className="p-6 text-sm text-slate-500">Đang tải…</div>}>
              {page === 'prices' ? <PriceWatch /> : <SavedQuotes />}
            </Suspense>
          )}
        </main>
      </div>
    </div>
  );
}
