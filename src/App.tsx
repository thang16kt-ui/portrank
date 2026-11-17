import { lazy, Suspense, useEffect } from 'react';
import Header from './components/Header';
import ResultPanel from './components/ResultPanel';
import Sidebar from './components/Sidebar';
import { useAppStore, usePlayback, type WorkspaceView } from './store/useAppStore';

const MapPanel = lazy(() => import('./components/MapPanel'));
const PriceWatch = lazy(() => import('./pages/PriceWatch'));
const SavedQuotes = lazy(() => import('./pages/SavedQuotes'));

export default function App() {
  const page = useAppStore((s) => s.page);
  const view = useAppStore((s) => s.workspaceView);
  const setView = useAppStore((s) => s.setWorkspaceView);
  const computed = useAppStore((s) => s.computed);
  const toast = useAppStore((s) => s.toast);
  useEffect(() => {
    if (page !== 'plan' || view !== 'map') usePlayback.getState().setPlaying(false);
  }, [page, view]);
  const changeView = (next: WorkspaceView) => {
    usePlayback.getState().setPlaying(false);
    setView(next);
  };
  return (
    <div className="flex h-full flex-col">
      <Header />
      {page === 'plan' ? <>
        <nav aria-label="Các bước lập kế hoạch" className="flex shrink-0 gap-2 border-b border-slate-200 bg-white px-4 py-2 min-[900px]:justify-end">
          {([{ id: 'setup', label: '1. Lô hàng' }, { id: 'results', label: '2. Kết quả' }, { id: 'map', label: '3. Bản đồ' }] as const).map((item) => <button
            key={item.id} onClick={() => changeView(item.id)} aria-current={view === item.id ? 'step' : undefined}
            className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold min-[900px]:flex-none ${item.id === 'setup' ? 'min-[900px]:hidden' : ''} ${view === item.id ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >{item.label}</button>)}
        </nav>
        <div className="flex min-h-0 flex-1">
          <aside className={`min-h-0 w-full shrink-0 border-r border-slate-200 min-[900px]:block min-[900px]:w-[360px] ${view !== 'setup' ? 'hidden' : ''}`}><Sidebar /></aside>
          <main className={`relative min-h-0 min-w-0 flex-1 ${view === 'setup' ? 'max-[899px]:hidden' : ''}`}>
            <Suspense fallback={<div role="status" className="p-8 text-sm text-slate-500">Đang tải…</div>}>
              {view === 'map' ? <MapPanel /> : computed ? <ResultPanel /> : <div className="flex h-full items-center justify-center overflow-auto p-6 lg:p-12">
                <div className="max-w-lg">
                  <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">PortRank · Bản thử nghiệm 1.1</span>
                  <h2 className="mt-5 text-3xl font-bold leading-tight text-brand-900">Một lô hàng.<br />Nhiều phương án vận chuyển.</h2>
                  <p className="mt-4 text-base leading-relaxed text-slate-600">So sánh chi phí, thời gian và cảng thay thế trong một nơi. Bắt đầu bằng tuyến vận chuyển và thông tin lô hàng.</p>
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">{['Chi phí ước tính', 'Thời gian dự kiến', 'Cảng thay thế'].map((text) => <div key={text} className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700">{text}</div>)}</div>
                  <p className="mt-6 text-sm text-amber-800">Dữ liệu mô phỏng phục vụ tham khảo. Chưa phải báo giá hoặc lịch tàu thực tế.</p>
                  <button onClick={() => changeView('setup')} className="mt-5 rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white min-[900px]:hidden">Nhập thông tin lô hàng</button>
                </div>
              </div>}
            </Suspense>
          </main>
        </div>
      </> : <main className="min-h-0 flex-1"><Suspense fallback={<div className="p-6">Đang tải…</div>}>{page === 'prices' ? <PriceWatch /> : <SavedQuotes />}</Suspense></main>}
      {toast && <div role="status" className="pointer-events-none fixed bottom-5 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">{toast}</div>}
    </div>
  );
}
