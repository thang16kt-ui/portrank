import type { ReactNode } from 'react';
import { deviceTimeZone, formatSimulationTime, simulationTimes } from '../lib/simulation';
import { usePlanStale } from '../lib/actions';

export default function SimulationReadout({ departureTime, elapsedSeconds, totalSeconds, legLabel, status, estimated = false, forecast = false, children }: {
  departureTime?: string; elapsedSeconds: number; totalSeconds: number; legLabel: string; status: string; estimated?: boolean; forecast?: boolean; children?: ReactNode;
}) {
  const times = simulationTimes(departureTime, elapsedSeconds, totalSeconds);
  const stale = usePlanStale();
  return (<section className="simulation-panel" aria-label="Thời gian mô phỏng hành trình">
    {stale && <p className="simulation-stale" role="status">Đầu vào đã đổi. Bấm Tìm tuyến tối ưu để cập nhật mô phỏng.</p>}
    <div className="simulation-readout">
    <div className="simulation-clock"><span>Giờ mô phỏng</span><strong>{formatSimulationTime(times.current)}</strong></div>
    <div className="simulation-arrival"><span>Dự kiến đến{estimated ? ' (ước tính)' : ''}</span><strong>{formatSimulationTime(times.arrival)}{forecast && <span className="simulation-forecast" title="Giờ đến dự báo theo giờ khởi hành; màu bản đồ thể hiện giao thông hiện tại.">Dự báo</span>}</strong></div>
    <div className="simulation-leg"><span>Chặng hiện tại</span><strong title={legLabel}>{legLabel}</strong></div>
    <div className="simulation-status"><span>Trạng thái</span><strong>{status.replace(' · chưa xác nhận dự báo từng đoạn', '')}</strong></div>
    </div>
    <div className="simulation-meta"><small>Múi giờ {deviceTimeZone()}</small>
      {children && <details><summary>Chi tiết thời gian</summary><div className="simulation-notes">{children}</div></details>}
    </div>
  </section>);
}
