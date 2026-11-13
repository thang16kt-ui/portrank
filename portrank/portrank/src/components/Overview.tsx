import { CARGO_LABEL, CONTAINER_LABEL } from '../config/pricing';
import { VESSEL_CONFIG } from '../config/routing';
import { INCOTERMS } from '../lib/incoterm';
import { fmtNm, usd, type PlanResult } from '../lib/results';
import { dayAt, fmtDate, vesselSpeed } from '../lib/transit';
import type { Incoterm } from '../types';
import { flag } from './PortCombobox';

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] font-semibold text-slate-500 uppercase">{label}</div>
      <div className={`text-lg font-bold ${tone ?? 'text-slate-900'}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export default function Overview({ plan, incoterm }: { plan: PlanResult; incoterm: Incoterm }) {
  const { route, quote, baseline } = plan;
  const cargo = plan.shipment.cargo;
  const warnings = plan.checklist.filter((c) => c.severity === 'warning');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-blue-100 px-2.5 py-1 font-semibold text-blue-800">{flag(plan.pol.country)} {plan.pol.name} <span className="font-mono text-xs">{plan.pol.code}</span></span>
        <span className="text-slate-400">→</span>
        <span className="rounded-full bg-orange-100 px-2.5 py-1 font-semibold text-orange-800">{flag(plan.pod.country)} {plan.pod.name} <span className="font-mono text-xs">{plan.pod.code}</span></span>
        <span className="text-xs text-slate-500">
          · {CARGO_LABEL[cargo]} · {plan.shipment.mode === 'FCL' ? `${plan.shipment.quantity} × ${CONTAINER_LABEL[plan.shipment.container]}` : `LCL ${plan.shipment.cbm} CBM / ${plan.shipment.weightKg} kg`}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Cước ước tính" value={usd(quote.total)} sub={`±12%: ${usd(quote.low)} – ${usd(quote.high)} (mô hình)`} tone="text-brand-700" />
        <Stat label="Thời gian vận chuyển" value={`${plan.days.toFixed(1)} ngày`} sub={`${vesselSpeed(cargo)} hải lý/giờ + ${VESSEL_CONFIG.portDays} ngày làm hàng`} />
        <Stat label="Quãng đường" value={fmtNm(route.distanceNm)} sub={`${Math.round(route.distanceNm * 1.852).toLocaleString('vi-VN')} km · engine: ${route.engine === 'searoute' ? 'searoute-js' : 'đồ thị dự phòng'}`} />
        <Stat label="Lịch dự kiến" value={<span className="text-base">{fmtDate(plan.etd)} → {fmtDate(plan.eta)}</span>} sub={`ETD (sau ${VESSEL_CONFIG.cutoffDays} ngày chờ tàu) → ETA`} />
      </div>

      {baseline && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <b>So với tuyến thông thường</b> ({fmtNm(baseline.route.distanceNm)}, {baseline.days.toFixed(1)} ngày, {usd(baseline.total)}):{' '}
          <b>
            {plan.days - baseline.days >= 0 ? '+' : ''}
            {(plan.days - baseline.days).toFixed(1)} ngày
          </b>
          ,{' '}
          <b>
            {quote.total - baseline.total >= 0 ? '+' : ''}
            {usd(quote.total - baseline.total)}
          </b>
          , {route.distanceNm - baseline.route.distanceNm >= 0 ? '+' : ''}
          {fmtNm(route.distanceNm - baseline.route.distanceNm)}.
        </div>
      )}
      {route.warnings.map((w) => (
        <div key={w} className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">ℹ️ {w}</div>
      ))}

      <div>
        <div className="mb-1 text-xs font-semibold text-slate-600">Hành trình đi qua</div>
        <ol className="relative ml-2 border-l-2 border-dashed border-slate-300 pl-4 text-sm">
          <li className="mb-1.5"><span className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full bg-pol" /> <b>{plan.pol.name}</b> <span className="text-xs text-slate-500">· ngày 0</span></li>
          {route.passages.map((p) => (
            <li key={p.id} className="mb-1.5">
              <span className="absolute -left-[6px] mt-1 h-2.5 w-2.5 rounded-full bg-slate-500" /> {p.name}{' '}
              <span className="text-xs text-slate-500">
                · ngày {dayAt(route, p.atNm, cargo).toFixed(1)} · {Math.round(p.atNm).toLocaleString('vi-VN')} hải lý
              </span>
            </li>
          ))}
          <li><span className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full bg-pod" /> <b>{plan.pod.name}</b> <span className="text-xs text-slate-500">· ngày {plan.days.toFixed(1)}</span></li>
        </ol>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <div className="text-[11px] font-semibold text-emerald-700 uppercase">Incoterm gợi ý</div>
          <div className="font-bold text-emerald-900">{plan.suggestion.placeLabel}</div>
          {incoterm !== plan.suggestion.primary && <div className="text-xs text-emerald-800">Đang xem: {incoterm} – {INCOTERMS[incoterm].name}</div>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <div className="text-[11px] font-semibold text-slate-500 uppercase">Điều kiện & chứng từ</div>
          <div>
            <b>{plan.checklist.filter((c) => c.severity === 'required').length}</b> mục bắt buộc · <b>{plan.checklist.filter((c) => c.severity === 'recommended').length}</b> nên có
            {warnings.length > 0 && <span className="text-amber-700"> · {warnings.length} cảnh báo tuyến</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
