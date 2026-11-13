import { pairKey } from '../lib/network';
import { usd } from '../lib/results';
import { useAppStore, usePlayback } from '../store/useAppStore';
import { EstimateBanner } from './CostTable';

/** Bảng mạng tuyến – liên kết hai chiều với bản đồ (rê chuột / click) */
export default function NetworkTab() {
  const net = useAppStore((s) => s.network);
  const computed = useAppStore((s) => s.computed);
  const hoverKey = useAppStore((s) => s.hoverKey);
  const sim = useAppStore((s) => s.sim);
  const setHoverKey = useAppStore((s) => s.setHoverKey);
  const selectPair = useAppStore((s) => s.selectPair);
  const setTab = useAppStore((s) => s.setTab);
  const labelMode = useAppStore((s) => s.labelMode);
  const setLabelMode = useAppStore((s) => s.setLabelMode);
  if (!computed) return null;
  const selected = sim ? pairKey(sim.pol, sim.pod) : null;
  const fastest = Math.min(...net.map((r) => r.arrivalDays));
  const cheapest = Math.min(...net.map((r) => r.candidate.cost));
  const polSide = new Set(net.map((r) => r.candidate.pol.code)).size;
  const podSide = new Set(net.map((r) => r.candidate.pod.code)).size;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-slate-600">
          <b>{net.length}</b> tuyến = <b>{polSide}</b> cảng quanh điểm đi × <b>{podSide}</b> cảng quanh điểm đến (bán kính {computed.radiusKm} km). Rê chuột để làm nổi tuyến, click để xem chi tiết.
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-500">Nhãn trên đường:</span>
          {(['all', 'top5', 'none'] as const).map((m) => (
            <button key={m} onClick={() => setLabelMode(m)} className={`rounded-md border px-2 py-1 ${labelMode === m ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>
              {m === 'all' ? 'Tất cả' : m === 'top5' ? 'Top 5' : 'Ẩn'}
            </button>
          ))}
        </div>
      </div>
      {net.length <= 1 && <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Chỉ có 1 tuyến – tăng “Bán kính tìm cảng thay thế” ở thanh bên để thêm cảng quanh A và B.</div>}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Tuyến</th>
              <th className="px-2 py-2 text-right">Thời gian</th>
              <th className="px-2 py-2 text-right">Cước (ước tính)</th>
              <th className="px-2 py-2 text-right">Quãng đường</th>
              <th className="px-2 py-2 text-right">Tàu/tuần</th>
              <th className="px-2 py-2 text-right">Điểm</th>
            </tr>
          </thead>
          <tbody>
            {net.map((r) => {
              const c = r.candidate;
              return (
                <tr
                  key={r.key}
                  onMouseEnter={() => setHoverKey(r.key)}
                  onMouseLeave={() => setHoverKey(null)}
                  onClick={() => selectPair(c.pol.code, c.pod.code, c.route)}
                  className={`cursor-pointer border-t border-slate-100 ${hoverKey === r.key ? 'bg-slate-100' : selected === r.key ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                >
                  <td className="px-2 py-2">
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold text-white" style={{ background: r.hex }}>
                      {r.rank}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2 font-semibold">
                      <span className="inline-block h-1.5 w-6 rounded" style={{ background: r.hex }} />
                      {c.pol.name} → {c.pod.name}
                      {c.isCurrent && <span className="rounded bg-slate-200 px-1 text-[10px] font-normal">A → B</span>}
                      {selected === r.key && <span className="rounded bg-brand-600 px-1 text-[10px] font-normal text-white">đang xem</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-1 pl-8">
                      {c.tags.map((t) => (
                        <span key={t} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">{t}</span>
                      ))}
                      <span className="text-[11px] text-slate-400">{c.route.passages.filter((p) => ['SUEZ', 'PANAMA', 'CAPE_GOOD_HOPE'].includes(p.id)).map((p) => p.name).join(' · ')}</span>
                    </div>
                  </td>
                  <td className={`px-2 py-2 text-right ${r.arrivalDays === fastest ? 'font-bold text-sky-700' : ''}`}>{r.arrivalDays.toFixed(1)} ngày</td>
                  <td className={`px-2 py-2 text-right font-mono text-xs ${c.cost === cheapest ? 'font-bold text-emerald-700' : ''}`}>{usd(c.cost)}</td>
                  <td className="px-2 py-2 text-right text-xs">{Math.round(c.route.distanceNm).toLocaleString('vi-VN')} hải lý</td>
                  <td className="px-2 py-2 text-right">{c.frequency}</td>
                  <td className="px-2 py-2 text-right font-bold text-brand-700">{c.score.toFixed(0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          className="rounded-md bg-brand-600 px-3 py-1.5 font-semibold text-white hover:bg-brand-700"
          onClick={() => {
            usePlayback.getState().setProgress(0);
            usePlayback.getState().setPlaying(true);
          }}
        >
          ▶ Cho các tàu “đua” từ đầu
        </button>
        <button className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50" onClick={() => setTab('overview')}>
          Xem chi tiết tuyến đang chọn →
        </button>
        <span className="text-slate-500">Các tàu xuất phát cùng lúc; tuyến nhanh hơn cập bến trước (🏁 thứ tự về đích).</span>
      </div>
      <EstimateBanner compact />
    </div>
  );
}
