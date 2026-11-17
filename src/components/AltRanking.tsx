import { useMemo } from 'react';
import { CRITERIA_LABEL, PRIORITY_LABEL, type Weights } from '../config/weights';
import { rankAlternatives } from '../lib/ranking';
import { routeOptionsOf, shipmentOf, usd } from '../lib/results';
import { useAppStore, usePlayback, type FormState } from '../store/useAppStore';
import { getPort } from '../data/ports';

export function useAlternatives(form: FormState | null) {
  const weights = useAppStore((s) => s.weights);
  return useMemo(() => {
    if (!form) return [];
    const pol = getPort(form.pol), pod = getPort(form.pod);
    if (!pol || !pod) return [];
    return rankAlternatives({ pol, pod, radiusKm: form.radiusKm, shipment: shipmentOf(form), options: routeOptionsOf(form), weights });
  }, [form, weights]);
}

const TAG_CLS: Record<string, string> = {
  'Rẻ nhất': 'bg-emerald-100 text-emerald-800',
  'Nhanh nhất': 'bg-sky-100 text-sky-800',
  'Ổn định nhất': 'bg-violet-100 text-violet-800',
};

export default function AltRanking() {
  const form = useAppStore((s) => s.computed);
  const weights = useAppStore((s) => s.weights);
  const custom = useAppStore((s) => s.weightsCustom);
  const setWeight = useAppStore((s) => s.setWeight);
  const setPriority = useAppStore((s) => s.setPriority);
  const sim = useAppStore((s) => s.sim);
  const showRoute = useAppStore((s) => s.showRoute);
  const list = useAlternatives(form);
  if (!form) return null;
  const top = list.slice(0, 5);
  const current = list.find((c) => c.isCurrent);
  const totalW = Object.values(weights).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500">
        {list.length} cặp cảng trong bán kính <b>{form.radiusKm} km</b> quanh {getPort(form.pol)?.name} × {getPort(form.pod)?.name}. Điểm 0–100 (tốt nhất = 100). Độ ổn định giá dựa trên <b>dữ liệu giá 12 tháng mô phỏng</b> (seed cố định).
      </div>
      <details className="rounded-lg border border-slate-200 bg-slate-50 p-2" open={custom}>
        <summary className="cursor-pointer text-xs font-semibold text-slate-600">
          Trọng số: {custom ? 'tùy chỉnh' : PRIORITY_LABEL[form.priority]} ({(Object.keys(weights) as (keyof Weights)[]).map((k) => `${CRITERIA_LABEL[k]} ${Math.round((weights[k] / (totalW || 1)) * 100)}%`).join(' · ')})
        </summary>
        <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {(Object.keys(weights) as (keyof Weights)[]).map((k) => (
            <label key={k} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0">{CRITERIA_LABEL[k]}</span>
              <input type="range" min={0} max={100} value={weights[k]} onChange={(e) => setWeight(k, +e.target.value)} className="flex-1" />
              <span className="w-8 text-right font-mono">{weights[k]}</span>
            </label>
          ))}
        </div>
        {custom && (
          <button className="mt-1 text-xs text-brand-600 underline" onClick={() => setPriority(form.priority)}>
            Khôi phục theo "Ưu tiên"
          </button>
        )}
      </details>

      {list.length <= 1 && <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">Không có cảng thay thế trong bán kính này – hãy tăng bán kính ở thanh bên.</div>}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Cặp cảng</th>
              <th className="px-2 py-2 text-right">Điểm</th>
              <th className="px-2 py-2 text-right">Cước (ước tính)</th>
              <th className="px-2 py-2 text-right">So với tuyến gốc</th>
              <th className="px-2 py-2 text-right">Ngày</th>
              <th className="px-2 py-2 text-right" title="Hệ số biến thiên giá 12 tháng (mô phỏng)">CV giá</th>
              <th className="px-2 py-2 text-right">Tàu/tuần</th>
              <th className="px-2 py-2 text-right">Rủi ro</th>
            </tr>
          </thead>
          <tbody>
            {top.map((c, i) => {
              const active = sim?.pol === c.pol.code && sim?.pod === c.pod.code;
              return (
                <tr
                  key={c.pol.code + c.pod.code}
                  onClick={() => {
                    showRoute(c.pol.code, c.pod.code, c.route);
                    usePlayback.getState().setProgress(0);
                    usePlayback.getState().setPlaying(false);
                    useAppStore.getState().setTab('overview');
                  }}
                  className={`cursor-pointer border-t border-slate-100 hover:bg-brand-50 ${active ? 'bg-brand-50' : ''}`}
                  title="Chọn để xem chi tiết phương án"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
                >
                  <td className="px-2 py-2 font-bold text-slate-400">{i + 1}</td>
                  <td className="px-2 py-2">
                    <div className="font-semibold">
                      {c.pol.name} → {c.pod.name}
                      {c.isCurrent && <span className="ml-1 rounded bg-slate-200 px-1 text-[10px] font-normal">đang chọn</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <span key={t} className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${TAG_CLS[t]}`}>{t}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <div className="font-bold text-brand-700">{c.score.toFixed(0)}</div>
                    <div className="ml-auto h-1.5 w-14 overflow-hidden rounded bg-slate-200">
                      <div className="h-full bg-brand-500" style={{ width: `${c.score}%` }} />
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-xs">{usd(c.cost)}</td>
                  <td className="px-2 py-2 text-right text-xs">{current ? <><div>{c.cost <= current.cost ? 'Giảm ' : 'Tăng '}{usd(Math.abs(c.cost - current.cost))}</div><div className="text-slate-500">{c.days <= current.days ? 'Nhanh hơn ' : 'Lâu hơn '}{Math.abs(c.days - current.days).toFixed(1)} ngày</div></> : '—'}</td>
                  <td className="px-2 py-2 text-right">{c.days.toFixed(1)}</td>
                  <td className="px-2 py-2 text-right">{(c.cv * 100).toFixed(1)}%</td>
                  <td className="px-2 py-2 text-right">{c.frequency}</td>
                  <td className="px-2 py-2 text-right">{(c.risk * 100).toFixed(0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400">Score = Σ trọng số × điểm chuẩn hóa (chi phí: 100×(Cmax−C)/(Cmax−Cmin)). Tần suất tàu & rủi ro là dữ liệu mô phỏng.</p>
    </div>
  );
}
