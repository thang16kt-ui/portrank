import { useState } from 'react';
import type { Track } from '../lib/track';
import { PLAYBACK_SPEEDS, useAppStore, usePlayback, type Speed } from '../store/useAppStore';
import { useCurrent } from '../lib/actions';
import SimulationReadout from './SimulationReadout';

/** Thanh tiến trình: "Ngày X / Y · ước tính" (hoặc ngày thật theo lịch tàu), Tạm dừng/Phát, tốc độ */
export default function PlaybackBar({ track }: { track: Track }) {
  const progress = usePlayback((s) => s.progress);
  const playing = usePlayback((s) => s.playing);
  const speed = usePlayback((s) => s.speed);
  const { setProgress, setPlaying, setSpeed } = usePlayback.getState();
  const day = progress * track.total;
  const stop = track.stops.find((s) => day >= s.arrive && day <= s.depart);
  return (
    <div className="legacy-simulation rounded-xl border border-line bg-panel/95 px-3 py-2 shadow-lg backdrop-blur">
      <div className="flex items-center gap-3">
      <button
        className="btn h-8 w-8 !p-0 text-sm"
        aria-label={playing ? 'Tạm dừng hành trình' : 'Phát hành trình'}
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
            <span className="ml-1 font-normal text-mute"> · {track.estimated ? 'ước tính' : 'thời lượng theo lịch tàu'}</span>
            {stop && <span className="ml-2 font-normal text-pink-300">Đang dừng tại {stop.name}</span>}
          </span>
          <span className="shrink-0 text-[11px] text-mute">{Math.round(progress * 100)}%</span>
        </div>
        <input aria-label="Tiến độ hành trình" type="range" min={0} max={1000} value={Math.round(progress * 1000)} onChange={(e) => setProgress(+e.target.value / 1000)} className="mt-1 block h-1.5 w-full" />
      </div>
      <select aria-label="Tốc độ mô phỏng" className="field !w-auto shrink-0 !py-1 text-xs" value={speed} onChange={(e) => setSpeed(+e.target.value as Speed)}>
        {PLAYBACK_SPEEDS.map((s) => <option key={s} value={s}>×{s}</option>)}
      </select>
      </div>
    </div>
  );
}

/** Information stays separate from the compact playback controls in the world map too. */
export function SeaSimulationSummary({ track }: { track: Track }) {
  const [open, setOpen] = useState(false);
  const plan = useAppStore((s) => s.plan);
  const current = useCurrent();
  const progress = usePlayback((s) => s.progress);
  const playing = usePlayback((s) => s.playing);
  const day = progress * track.total;
  const stop = track.stops.find((s) => day >= s.arrive && day <= s.depart);
  return <section className="journey-summary pointer-events-auto !top-14" data-expanded={open} aria-label="Thông tin hành trình">
    <button className="btn !text-xs" aria-expanded={open} aria-controls="sea-simulation-details" onClick={() => setOpen((value) => !value)}>{open ? '✕ Ẩn thông tin' : 'ⓘ Thông tin hành trình'}</button>
    <div id="sea-simulation-details" hidden={!open}>
      <strong>🚢 Hành trình đường biển</strong>
      <SimulationReadout departureTime={plan?.input.roadDepartureTime ?? plan?.calculatedAt} elapsedSeconds={day * 86400} totalSeconds={track.total * 86400}
        legLabel={current?.option.title ?? 'Chặng biển'} estimated status={progress >= 1 ? 'Đã đến nơi' : !playing ? 'Tạm dừng mô phỏng' : stop ? `Đang dừng tại ${stop.name}` : 'Đang đi biển'}>
        <p>Giờ đến chỉ tính chặng biển; chưa gồm xe hai đầu, chờ chuyến và bốc dỡ.</p>
      </SimulationReadout>
    </div>
  </section>;
}
