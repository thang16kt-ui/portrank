import { deviceTimeZone, formatSimulationTime, simulationTimes } from '../lib/simulation';
import { usePlanStale } from '../lib/actions';

export default function SimulationReadout({ departureTime, elapsedSeconds, totalSeconds, legLabel, status, estimated = false }: {
  departureTime?: string; elapsedSeconds: number; totalSeconds: number; legLabel: string; status: string; estimated?: boolean;
}) {
  const times = simulationTimes(departureTime, elapsedSeconds, totalSeconds);
  const stale = usePlanStale();
  return <div className="simulation-readout" aria-label="Thời gian mô phỏng hành trình">
    {stale && <p className="simulation-stale" role="status">Đầu vào đã đổi. Bấm Tìm tuyến tối ưu để cập nhật mô phỏng.</p>}
    <div className="simulation-clock"><span>Giờ mô phỏng</span><strong>{formatSimulationTime(times.current)}</strong></div>
    <div><span>Dự kiến đến{estimated ? ' (ước tính)' : ''}</span><strong>{formatSimulationTime(times.arrival)}</strong></div>
    <div className="simulation-leg"><span>Chặng đang di chuyển</span><strong>{legLabel}</strong></div>
    <div><span>Trạng thái</span><strong>{status}</strong></div>
    <small>Múi giờ hiển thị: {deviceTimeZone()}</small>
  </div>;
}
