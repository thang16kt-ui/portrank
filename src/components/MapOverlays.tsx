import { useState } from 'react';
import { getPort } from '../data/ports';
import { useAppStore, usePlayback } from '../store/useAppStore';
import { STYLES, fitCoords, fitRoute, mapHandle } from './MapView';
import type { BaseMap } from '../store/useAppStore';
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
  const baseMap = useAppStore((s) => s.baseMap);
  const setBaseMap = useAppStore((s) => s.setBaseMap);
  const viewMode = useAppStore((s) => s.viewMode);
  const network = useAppStore((s) => s.network);
  const net = viewMode === 'network' && network.length ? network : null;
  const [legendOpen, setLegendOpen] = useState(false);
  const refit = () => {
    if (!mapHandle.map || !sim) return;
    if (net) fitCoords(mapHandle.map, net.flatMap((r) => r.route.coords));
    else fitRoute(mapHandle.map, sim.route);
  };

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
        <select
          value={baseMap}
          onChange={(e) => setBaseMap(e.target.value as BaseMap)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 shadow"
          title="Nền bản đồ"
        >
          {(Object.keys(STYLES) as BaseMap[]).map((k) => (
            <option key={k} value={k}>Nền: {STYLES[k].label}</option>
          ))}
        </select>
        {sim && (
          <div className="flex overflow-hidden rounded-lg border border-slate-300 shadow">
            <Btn
              active={follow}
              onClick={() => {
                const next = !follow;
                setFollow(next);
                if (!next && mapHandle.map) {
                  mapHandle.map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
                  refit();
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
                if (!follow) refit();
              }}
              title="Phát lại từ đầu"
            >
              ↺ Phát lại
            </Btn>
          </div>
        )}
      </div>

      {/* Chú giải (thu gọn được) */}
      {!legendOpen && (
        <button
          onClick={() => setLegendOpen(true)}
          className={`pointer-events-auto absolute left-3 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow ${sim ? 'bottom-[86px]' : 'bottom-3'}`}
        >
          ☰ Chú giải
        </button>
      )}
      {legendOpen && (
      <div className={`pointer-events-auto absolute left-3 rounded-lg ${sim ? 'bottom-[86px]' : 'bottom-3'} bg-white/95 px-3 py-2 text-[11px] text-slate-700 shadow backdrop-blur`} onClick={() => setLegendOpen(false)} title="Bấm để thu gọn">
        <div className="mb-1 font-semibold">Chú giải</div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-pol" /> Điểm đi (A)</div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-pod" /> Điểm đến (B)</div>
        {net ? (
          <>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-white bg-blue-400" /> Cảng lân cận A</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-white bg-orange-300" /> Cảng lân cận B</div>
            <div className="mt-1 mb-0.5 font-semibold">Tuyến (xếp hạng)</div>
            {net.slice(0, 8).map((r) => (
              <div key={r.key} className="flex max-w-[210px] items-center gap-2">
                <span className="h-1.5 w-5 shrink-0 rounded" style={{ background: r.hex }} />
                <span className="truncate">#{r.rank} {r.candidate.pol.name} → {r.candidate.pod.name}</span>
              </div>
            ))}
            {net.length > 8 && <div className="text-slate-500">+{net.length - 8} tuyến khác (xám)</div>}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-white bg-cyan-600" /> Cảng khác (click để chọn)</div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-slate-500" /> Eo biển / kênh đào</div>
            <div className="flex items-center gap-2"><span className="h-0.5 w-5 border-t-2 border-dashed border-slate-500" /> Toàn tuyến</div>
            <div className="flex items-center gap-2"><span className="h-1 w-5 rounded bg-amber-400" /> Hành trình tàu</div>
          </>
        )}
      </div>
      )}

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
