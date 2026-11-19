import { fmtDateVi } from '../lib/csv';
import type { Track } from '../lib/track';
import { PLAYBACK_SPEEDS, usePlayback, type Speed } from '../store/useAppStore';

function addIso(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

/** Thanh tiến trình: "Ngày X / Y · ước tính" (hoặc ngày thật theo lịch tàu), Tạm dừng/Phát, tốc độ */
export default function PlaybackBar({ track }: { track: Track }) {
  const progress = usePlayback((s) => s.progress);
  const playing = usePlayback((s) => s.playing);
  const speed = usePlayback((s) => s.speed);
  const { setProgress, setPlaying, setSpeed } = usePlayback.getState();
  const day = progress * track.total;
  const stop = track.stops.find((s) => day >= s.arrive && day <= s.depart);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-panel/95 px-3 py-2 shadow-lg backdrop-blur">
      <button
        className="btn h-8 w-8 !p-0 text-sm"
        title={playing ? 'Tạm dừng' : 'Phát'}
        onClick={() => {
          if (!playing && progress >= 1) setProgress(0);
          setPlaying(!playing);
        }}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="truncate font-semibold text-fg">
            {track.vehicle === 'truck' ? '🚚' : '🚢'} Ngày {day.toFixed(1)} / {track.total.toFixed(1)}
            {track.startDate ? <span className="ml-1 font-normal text-emerald-300"> · {fmtDateVi(addIso(track.startDate, day))} (lịch tàu)</span> : <span className="ml-1 font-normal text-mute"> · ước tính</span>}
            {stop && <span className="ml-2 font-normal text-pink-300">Đang dừng tại {stop.name}</span>}
          </span>
          <span className="shrink-0 text-[11px] text-mute">{Math.round(progress * 100)}%</span>
        </div>
        <input type="range" min={0} max={1000} value={Math.round(progress * 1000)} onChange={(e) => setProgress(+e.target.value / 1000)} className="mt-1 block h-1.5 w-full" />
      </div>
      <select aria-label="Tốc độ mô phỏng" className="field !w-auto shrink-0 !py-1 text-xs" value={speed} onChange={(e) => setSpeed(+e.target.value as Speed)}>
        {PLAYBACK_SPEEDS.map((s) => <option key={s} value={s}>×{s}</option>)}
      </select>
    </div>
  );
}
