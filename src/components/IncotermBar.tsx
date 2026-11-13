import { INCOTERMS, SEGMENTS } from '../lib/incoterm';
import type { PlanResult } from '../lib/results';
import { useAppStore } from '../store/useAppStore';
import type { Incoterm } from '../types';

const ORDER: Incoterm[] = ['EXW', 'FCA', 'FOB', 'CPT', 'CIP', 'CFR', 'CIF', 'DAP', 'DPU', 'DDP'];

export function ResponsibilityBar({ incoterm }: { incoterm: Incoterm }) {
  const spec = INCOTERMS[incoterm];
  const riskPct = (spec.riskAt / 5) * 100;
  return (
    <div>
      <div className="relative pt-7">
        {/* điểm chuyển rủi ro */}
        <div className="absolute top-0 z-10 -translate-x-1/2 text-center" style={{ left: `${Math.min(97, Math.max(3, riskPct))}%` }}>
          <div className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-white">⚑ Chuyển rủi ro</div>
          <div className="mx-auto h-12 w-0.5 bg-red-600" />
        </div>
        <div className="grid grid-cols-5 overflow-hidden rounded-lg border border-slate-200">
          {SEGMENTS.map((seg, i) => {
            const payer = spec.payer[i];
            return (
              <div key={seg} className={`px-1 py-2.5 text-center ${payer === 'seller' ? 'bg-blue-600 text-white' : 'bg-orange-400 text-slate-900'} ${i ? 'border-l border-white/40' : ''}`}>
                <div className="text-[18px] leading-none">{['🏭', '🏗️', '🚢', '🏗️', '🏬'][i]}</div>
                <div className="mt-1 text-[10px] leading-tight font-semibold sm:text-[11px]">{seg}</div>
                <div className="text-[10px] opacity-90">{payer === 'seller' ? 'Bán trả' : 'Mua trả'}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-600">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-blue-600" /> Người bán trả phí</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-orange-400" /> Người mua trả phí</span>
        <span className="flex items-center gap-1"><span className="h-3 w-1 bg-red-600" /> Điểm chuyển rủi ro: {spec.riskLabel}</span>
      </div>
    </div>
  );
}

export default function IncotermTab({ plan, incoterm }: { plan: PlanResult; incoterm: Incoterm }) {
  const setIncoterm = useAppStore((s) => s.setIncoterm);
  const { suggestion } = plan;
  const spec = INCOTERMS[incoterm];
  const place = spec.place === 'pol' ? plan.pol.name : spec.place === 'pod' ? plan.pod.name : spec.place === 'seller' ? 'kho người bán' : 'kho người mua';
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <div className="text-xs font-semibold text-emerald-700">Gợi ý Incoterms® 2020</div>
        <div className="text-xl font-bold text-emerald-900">{suggestion.placeLabel}</div>
        <p className="mt-1 text-sm text-emerald-900">{suggestion.reason}</p>
        <div className="mt-2 text-xs text-emerald-800">Phương án khác: {suggestion.alternatives.join(' · ')}</div>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-semibold text-slate-600">Xem theo điều kiện (cột "Bên chịu" ở tab Chi phí cũng đổi theo):</div>
        <div className="flex flex-wrap gap-1">
          {ORDER.map((c) => (
            <button
              key={c}
              onClick={() => setIncoterm(c === suggestion.primary ? null : c)}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${c === incoterm ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white hover:border-brand-500'} ${c === suggestion.primary && c !== incoterm ? 'ring-2 ring-emerald-300' : ''}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="mb-1 font-semibold">
          {spec.code} {place} <span className="font-normal text-slate-500">– {spec.name}</span>
          {spec.seaOnly && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">chỉ đường biển</span>}
        </div>
        <p className="mb-3 text-xs text-slate-600">{spec.note}</p>
        <ResponsibilityBar incoterm={incoterm} />
      </div>
      {plan.shipment.cargo !== 'oog' && ['FOB', 'CFR', 'CIF'].includes(incoterm) && (
        <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          ℹ️ Với hàng container, ICC khuyến nghị dùng FCA/CPT/CIP thay cho FOB/CFR/CIF vì người bán thực tế giao container tại bãi (CY) trước khi hàng lên tàu.
        </div>
      )}
    </div>
  );
}
