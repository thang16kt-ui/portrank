import { getPort } from '../data/ports';
import { useAppStore, usePlayback } from '../store/useAppStore';
import { fitRoute, mapHandle } from './MapView';
import PlaybackBar from './PlaybackBar';
import PortCombobox from './PortCombobox';

function Btn({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition ${active ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
    >
      {children}
    </button>
  );
}

export default function MapOverlays() {
  const mapMode = useAppStore((s) => s.mapMode);
  const setMapMode = useAppStore((s) => s.setMapMode);
  const follow = useAppStore((s) => s.follow);
  const setFollow = useAppStore((s) => s.setFollow);
  const sim = useAppStore((s) => s.sim);
  const pickTarget = useAppStore((s) => s.pickTarget);
  const setPort = useAppStore((s) => s.setPort);
  const toast = useAppStore((s) => s.toast);

  const flyToPort = (code: string) => {
    const p = getPort(code);
    if (!p) return;
    setPort(pickTarget, code);
    mapHandle.map?.flyTo({ center: p.coord, zoom: 8, duration: 1500 });
  };

  return (
    <>
      {/* Ô tìm cảng nổi */}
      <div className="pointer-events-auto absolute top-3 left-3 w-[min(320px,calc(100%-24px))] md:w-72">
        <PortCombobox label="" compact accent={pickTarget} value={null} onChange={flyToPort} placeholder={`🔍 Tìm cảng → đặt làm ${pickTarget === 'pol' ? 'điểm đi' : 'điểm đến'}`} />
      </div>

      {/* Nút điều khiển */}
      <div className="pointer-events-auto absolute top-16 left-3 flex flex-wrap gap-2 md:top-3 md:left-auto md:right-14">
        <div className="flex overflow-hidden rounded-lg border border-slate-300 shadow">
          <Btn active={mapMode === 'globe'} onClick={() => setMapMode('globe')} title="Quả địa cầu 3D">🌐 3D Globe</Btn>
          <Btn active={mapMode === 'mercator'} onClick={() => setMapMode('mercator')} title="Bản đồ phẳng 2D">🗺️ 2D</Btn>
        </div>
        {sim && (
          <div className="flex overflow-hidden rounded-lg border border-slate-300 shadow">
            <Btn
              active={follow}
              onClick={() => {
                const next = !follow;
                setFollow(next);
                if (!next && mapHandle.map) {
                  mapHandle.map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
                  fitRoute(mapHandle.map, sim.route);
                }
                if (next && !usePlayback.getState().playing && usePlayback.getState().progress >= 1) usePlayback.getState().setProgress(0);
                if (next) usePlayback.getState().setPlaying(true);
              }}
              title="Camera bám theo tàu"
            >
              🎯 Theo dõi tàu
            </Btn>
            <Btn
              onClick={() => {
                usePlayback.getState().setProgress(0);
                usePlayback.getState().setPlaying(true);
                if (!follow && mapHandle.map) fitRoute(mapHandle.map, sim.route);
              }}
              title="Phát lại từ đầu"
            >
              ↺ Phát lại
            </Btn>
          </div>
        )}
      </div>

      {/* Chú giải */}
      <div className={`pointer-events-auto absolute left-3 hidden rounded-lg ${sim ? 'bottom-[86px]' : 'bottom-3'} bg-white/90 px-3 py-2 text-[11px] text-slate-700 shadow backdrop-blur lg:block`}>
        <div className="mb-1 font-semibold">Chú giải</div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-pol" /> Cảng đi</div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-pod" /> Cảng đến</div>
        <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-white bg-cyan-600" /> Cảng khác (click để chọn)</div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-slate-500" /> Eo biển / kênh đào</div>
        <div className="flex items-center gap-2"><span className="h-0.5 w-5 border-t-2 border-dashed border-slate-500" /> Toàn tuyến</div>
        <div className="flex items-center gap-2"><span className="h-1 w-5 rounded bg-amber-400" /> Hành trình tàu</div>
      </div>

      {/* Thanh tiến trình */}
      {sim && (
        <div className="absolute right-3 bottom-3 left-3 md:right-28">
          <PlaybackBar />
        </div>
      )}

      {toast && (
        <div className="toast-pop pointer-events-none absolute top-28 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900/90 px-4 py-2 text-xs text-white shadow-lg md:top-16">{toast}</div>
      )}
    </>
  );
}
