import { useMemo } from 'react';
import { PASSAGES } from '../data/seaNodes';
import { PORTS } from '../data/ports';
import { haversineKm, normalizeLon, positionAt } from '../lib/geo';
import { dayAt, transitDays } from '../lib/transit';
import { useAppStore, usePlayback } from '../store/useAppStore';

function fmtCoord([lon, lat]: [number, number]) {
  const L = normalizeLon(lon);
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'B' : 'N'} ${Math.abs(L).toFixed(2)}°${L >= 0 ? 'Đ' : 'T'}`;
}

/** Mô tả vị trí: gần cảng / eo biển nào */
function describe(pos: [number, number]): string {
  const p: [number, number] = [normalizeLon(pos[0]), pos[1]];
  let best = '', bestKm = Infinity;
  for (const x of PASSAGES) {
    const km = haversineKm(p, x.coord);
    if (km < bestKm) { bestKm = km; best = x.name; }
  }
  for (const x of PORTS) {
    const km = haversineKm(p, x.coord);
    if (km < bestKm) { bestKm = km; best = `cảng ${x.name}`; }
  }
  return bestKm < 400 ? `gần ${best}` : `cách ${best} ~${Math.round(bestKm / 1.852).toLocaleString('vi-VN')} hải lý`;
}

export default function PlaybackBar() {
  const sim = useAppStore((s) => s.sim);
  const cargo = useAppStore((s) => s.computed?.cargo ?? 'dry');
  const progress = usePlayback((s) => s.progress);
  const playing = usePlayback((s) => s.playing);
  const speed = usePlayback((s) => s.speed);
  const { setProgress, setPlaying, setSpeed } = usePlayback.getState();

  const total = useMemo(() => (sim ? transitDays(sim.route, cargo) : 0), [sim, cargo]);
  if (!sim) return null;
  const nm = progress * sim.route.distanceNm;
  const at = positionAt(sim.route.coords, sim.route.cumNm, nm);
  const day = progress >= 1 ? total : dayAt(sim.route, nm, cargo);

  return (
    <div className="pointer-events-auto rounded-xl bg-slate-900/85 px-3 py-2 text-white shadow-xl backdrop-blur">
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (progress >= 1) setProgress(0);
            setPlaying(!playing);
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400 text-slate-900 hover:bg-amber-300"
          title={playing ? 'Tạm dừng' : 'Phát'}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          onChange={(e) => {
            setPlaying(false);
            setProgress(+e.target.value / 1000);
          }}
          className="min-w-0 flex-1"
          aria-label="Tiến trình hành trình"
        />
        <div className="flex shrink-0 overflow-hidden rounded-md border border-white/20 text-[11px]">
          {([1, 2, 5] as const).map((s) => (
            <button key={s} onClick={() => setSpeed(s)} className={`px-2 py-1 ${speed === s ? 'bg-white/25 font-bold' : 'hover:bg-white/10'}`}>
              x{s}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-200">
        <span>
          Ngày thứ <b className="text-amber-300">{day.toFixed(1)}</b> / {total.toFixed(1)} ngày
        </span>
        <span>
          Đã đi <b>{Math.round(nm).toLocaleString('vi-VN')}</b> / {Math.round(sim.route.distanceNm).toLocaleString('vi-VN')} hải lý
        </span>
        <span className="truncate">📍 {fmtCoord(at.pos)} · {describe(at.pos)}</span>
      </div>
    </div>
  );
}
