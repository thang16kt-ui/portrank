import { CARGO_LABEL, CONTAINER_LABEL } from '../config/pricing';
import { getPort } from '../data/ports';
import { findRoute } from '../lib/routing';
import { fmtNm, routeOptionsOf, usd } from '../lib/results';
import { useAppStore, usePlayback } from '../store/useAppStore';

export default function SavedQuotes() {
  const saved = useAppStore((s) => s.saved);
  const del = useAppStore((s) => s.deleteQuote);
  const load = useAppStore((s) => s.loadQuote);
  const compute = useAppStore((s) => s.compute);

  return (
    <div className="scroll-thin h-full overflow-y-auto bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <h1 className="text-xl font-bold">Báo giá đã lưu</h1>
          <p className="text-sm text-slate-500">Lưu trên trình duyệt này, chưa đồng bộ sang thiết bị khác. Giá là mô hình ước tính tại thời điểm lưu.</p>
        </div>
        {saved.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Chưa có báo giá nào. Ở tab “Lập kế hoạch”, bấm <b>💾 Lưu</b> trên panel kết quả.
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {saved.map((q) => (
            <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{q.summary}</div>
                  <div className="text-xs text-slate-500">
                    {getPort(q.form.pol)?.code} → {getPort(q.form.pod)?.code} · {new Date(q.createdAt).toLocaleString('vi-VN')}
                  </div>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">{q.incoterm}</span>
              </div>
              <div className="mt-2 text-2xl font-bold text-brand-700">
                {usd(q.total)} <span className="text-xs font-medium text-amber-600">ước tính</span>
              </div>
              <div className="text-xs text-slate-500">
                {usd(q.low)} – {usd(q.high)} · {q.days.toFixed(1)} ngày · {fmtNm(q.distanceNm)}
              </div>
              <div className="mt-1 text-xs text-slate-600">
                {CARGO_LABEL[q.form.cargo]} · {q.form.mode === 'FCL' ? `${q.form.quantity} × ${CONTAINER_LABEL[q.form.container]}` : `LCL ${q.form.cbm} CBM`}
                {q.form.avoidRedSea && ' · tránh Biển Đỏ'}
                {q.form.avoidPanama && ' · tránh Panama'}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                  onClick={() => {
                    load(q);
                    const pol = getPort(q.form.pol)!, pod = getPort(q.form.pod)!;
                    compute(findRoute(pol, pod, routeOptionsOf(q.form)));
                    useAppStore.getState().setIncoterm(q.incoterm);
                    usePlayback.getState().setProgress(0);
                    usePlayback.getState().setPlaying(false);
                  }}
                >
                  Mở phương án
                </button>
                <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-red-50 hover:text-red-700" onClick={() => del(q.id)}>
                  Xóa
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
