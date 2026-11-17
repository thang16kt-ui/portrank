import { getPort } from '../data/ports';
import { useAppStore, usePlayback } from '../store/useAppStore';
import { fitRoute, mapHandle } from '../lib/mapControls';
import PlaybackBar from './PlaybackBar';

export default function MapOverlays() {
  const mapMode = useAppStore((s) => s.mapMode);
  const setMapMode = useAppStore((s) => s.setMapMode);
  const follow = useAppStore((s) => s.follow);
  const setFollow = useAppStore((s) => s.setFollow);
  const sim = useAppStore((s) => s.sim);
  const pickTarget = useAppStore((s) => s.pickTarget);
  const setTarget = useAppStore((s) => s.setPickTarget);
  const form = useAppStore((s) => s.form);
  const setView = useAppStore((s) => s.setWorkspaceView);
  return <>
    <div className="pointer-events-auto absolute top-3 right-14 left-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-brand-900">{sim ? `${getPort(sim.pol)?.name} → ${getPort(sim.pod)?.name}` : 'Khám phá tuyến vận chuyển'}</div>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {(['mercator', 'globe'] as const).map((mode) => <button key={mode} onClick={() => setMapMode(mode)} aria-pressed={mapMode === mode} className={`min-h-10 rounded-md px-3 text-sm ${mapMode === mode ? 'bg-white font-semibold text-brand-700 shadow-sm' : 'text-slate-600'}`}>{mode === 'globe' ? '3D' : '2D'}</button>)}
        </div>
      </div>
      <details className="mt-2 text-sm text-slate-600">
        <summary className="cursor-pointer py-1">Chọn cảng trên bản đồ</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={() => setTarget('pol')} aria-pressed={pickTarget === 'pol'} className={`min-h-10 rounded-lg border px-3 ${pickTarget === 'pol' ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}>Cảng đi: {getPort(form.pol)?.name ?? 'Chưa chọn'}</button>
          <button onClick={() => setTarget('pod')} aria-pressed={pickTarget === 'pod'} className={`min-h-10 rounded-lg border px-3 ${pickTarget === 'pod' ? 'border-orange-400 bg-orange-50' : 'border-slate-200'}`}>Cảng đến: {getPort(form.pod)?.name ?? 'Chưa chọn'}</button>
          <button onClick={() => setView('setup')} className="min-h-10 px-2 font-semibold text-brand-700 underline">Về lô hàng để tính</button>
        </div>
        <p className="mt-2 text-xs">Chạm một cảng để đặt làm {pickTarget === 'pol' ? 'cảng đi' : 'cảng đến'}. Tuyến hiển thị chỉ đổi sau khi tính lại.</p>
      </details>
    </div>
    {sim && <div className="pointer-events-auto absolute right-3 bottom-3 left-3">
      <div className="mb-2 flex justify-end gap-2">
        <button onClick={() => setFollow(!follow)} aria-pressed={follow} className="min-h-10 rounded-lg bg-white px-3 text-sm shadow">{follow ? 'Dừng bám tàu' : 'Theo dõi tàu'}</button>
        <button onClick={() => { usePlayback.getState().setProgress(0); usePlayback.getState().setPlaying(true); if (mapHandle.map) fitRoute(mapHandle.map, sim.route); }} className="min-h-10 rounded-lg bg-white px-3 text-sm shadow">Phát lại</button>
      </div>
      <PlaybackBar />
    </div>}
  </>;
}
