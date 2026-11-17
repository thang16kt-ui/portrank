import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CONTAINER_LABEL } from '../config/pricing';
import { getPort } from '../data/ports';
import { coefficientOfVariation, rankAlternatives, simulatePriceHistory } from '../lib/ranking';
import { routeOptionsOf, shipmentOf, usd } from '../lib/results';
import { estimateQuote } from '../lib/pricing';
import { findRoute } from '../lib/routing';
import { useAppStore } from '../store/useAppStore';
import PortCombobox from '../components/PortCombobox';
import { EstimateBanner } from '../components/CostTable';

const COLORS = ['#2563eb', '#f97316', '#16a34a', '#9333ea', '#0891b2', '#dc2626'];

export default function PriceWatch() {
  const form = useAppStore((s) => s.computed ?? s.form);
  const weights = useAppStore((s) => s.weights);
  const [pol, setPol] = useState(form.pol);
  const [pod, setPod] = useState(form.pod);

  const series = useMemo(() => {
    const a = getPort(pol), b = getPort(pod);
    if (!a || !b || a.code === b.code) return [];
    const f = { ...form, pol: a.code, pod: b.code };
    const alts = rankAlternatives({ pol: a, pod: b, radiusKm: f.radiusKm, shipment: shipmentOf(f), options: routeOptionsOf(f), weights }).slice(0, 5);
    if (!alts.some((c) => c.isCurrent)) {
      const route = findRoute(a, b, routeOptionsOf(f));
      const q = estimateQuote({ pol: a, pod: b, route, shipment: shipmentOf(f) });
      const history = simulatePriceHistory(a.code, b.code, q.total, route);
      alts.unshift({ pol: a, pod: b, history, cv: coefficientOfVariation(history.map((h) => h.price)), cost: q.total } as never);
    }
    return alts.map((c) => ({ key: `${c.pol.code}→${c.pod.code}`, label: `${c.pol.name} → ${c.pod.name}`, history: c.history, cv: c.cv, cost: c.cost }));
  }, [pol, pod, form, weights]);

  const data = useMemo(() => {
    if (!series.length) return [];
    return series[0].history.map((h, i) => Object.fromEntries([['month', h.month], ...series.map((s) => [s.key, s.history[i].price])]));
  }, [series]);

  return (
    <div className="scroll-thin h-full overflow-y-auto bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h1 className="text-xl font-bold">Giá cước mô phỏng</h1>
          <p className="text-sm text-slate-500">
            Diễn biến 12 tháng cho cặp cảng và các cặp thay thế lân cận ({form.mode === 'FCL' ? `${form.quantity} × ${CONTAINER_LABEL[form.container]}` : `LCL ${form.cbm} CBM`}).
          </p>
        </div>
        <div className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs text-violet-900">
          📊 <b>DỮ LIỆU MÔ PHỎNG</b> – chuỗi giá sinh ngẫu nhiên có seed cố định theo cặp cảng, chỉ để minh họa cách tính độ ổn định giá (CV). Không thể dùng biểu đồ này để xác định giá thị trường hoặc dự báo giá thực tế.
        </div>
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
          <PortCombobox label="Cảng đi" accent="pol" value={pol} onChange={setPol} />
          <PortCombobox label="Cảng đến" accent="pod" value={pod} onChange={setPod} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} width={56} />
                <Tooltip formatter={(v) => usd(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {series.map((s, i) => (
                  <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={COLORS[i % COLORS.length]} strokeWidth={i === 0 ? 3 : 1.8} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Cặp cảng</th>
                <th className="px-3 py-2 text-right">Giá hiện tại (ước tính)</th>
                <th className="px-3 py-2 text-right">Thấp nhất 12T</th>
                <th className="px-3 py-2 text-right">Cao nhất 12T</th>
                <th className="px-3 py-2 text-right">CV (biến động)</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s, i) => (
                <tr key={s.key} className="border-t border-slate-100">
                  <td className="px-3 py-2"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{s.label}</td>
                  <td className="px-3 py-2 text-right font-mono">{usd(s.history[s.history.length - 1].price)}</td>
                  <td className="px-3 py-2 text-right font-mono">{usd(Math.min(...s.history.map((h) => h.price)))}</td>
                  <td className="px-3 py-2 text-right font-mono">{usd(Math.max(...s.history.map((h) => h.price)))}</td>
                  <td className="px-3 py-2 text-right">{(s.cv * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <EstimateBanner compact />
      </div>
    </div>
  );
}
