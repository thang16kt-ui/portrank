import { useMemo, useRef, useState } from 'react';
import { CARGO_LABEL, CONTAINER_LABEL } from '../config/pricing';
import { INCOTERMS, PARTY_LABEL, payerOf } from '../lib/incoterm';
import { computePlan, fmtNm, usd, type PlanResult } from '../lib/results';
import { fmtCode } from '../lib/tariff';
import { fmtDate } from '../lib/transit';
import { useAppStore, type ResultTab } from '../store/useAppStore';
import type { Incoterm } from '../types';
import AltRanking from './AltRanking';
import Conditions from './Conditions';
import CostTable from './CostTable';
import IncotermTab from './IncotermBar';
import Overview from './Overview';
import TaxTab from './TaxTab';

const TABS: { id: ResultTab; label: string }[] = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'cost', label: 'Chi phí' },
  { id: 'tax', label: 'Thuế NK' },
  { id: 'rules', label: 'Điều kiện' },
  { id: 'incoterm', label: 'Incoterm' },
  { id: 'alts', label: 'Cảng thay thế' },
];

export function usePlan(): PlanResult | null {
  const computed = useAppStore((s) => s.computed);
  const sim = useAppStore((s) => s.sim);
  return useMemo(() => (computed && sim ? computePlan(computed, sim.pol, sim.pod, sim.route) : null), [computed, sim]);
}

export function quoteText(plan: PlanResult, incoterm: Incoterm): string {
  const s = plan.shipment;
  const lines = [
    `BÁO GIÁ ƯỚC TÍNH – PortRank (mô hình ước tính, không phải giá thị trường)`,
    `Tuyến: ${plan.pol.name} (${plan.pol.code}) → ${plan.pod.name} (${plan.pod.code})`,
    `Hàng: ${CARGO_LABEL[s.cargo]} · ${s.mode === 'FCL' ? `${s.quantity} x ${CONTAINER_LABEL[s.container]}` : `LCL ${s.cbm} CBM / ${s.weightKg} kg`}`,
    `Quãng đường: ${fmtNm(plan.route.distanceNm)} · Thời gian: ~${plan.days.toFixed(1)} ngày`,
    `ETD ${fmtDate(plan.etd)} → ETA ${fmtDate(plan.eta)}`,
    `Đi qua: ${plan.route.passages.map((p) => p.name).join(', ') || '—'}`,
    `Incoterm: ${incoterm} – ${INCOTERMS[incoterm].name} (gợi ý: ${plan.suggestion.placeLabel})`,
    '',
    'Chi tiết (USD, ước tính):',
    ...plan.quote.lines.map((l) => `- ${l.label}: ${Math.round(l.amount).toLocaleString('en-US')} [${PARTY_LABEL[payerOf(incoterm, l.segment)]}]`),
    `TỔNG: ${usd(plan.quote.total)} (khoảng ${usd(plan.quote.low)} – ${usd(plan.quote.high)})`,
    ...(plan.tax
      ? [
          '',
          `Thuế nhập khẩu tại ${plan.pod.countryName} (mã ${fmtCode(plan.tax.code)}, xuất xứ ${plan.tax.input.origin}, trị giá ${plan.tax.basis} ${usd(plan.tax.customsValue)}):`,
          ...plan.tax.rows.map((r) => `- ${r.label} ${r.rate}: ${r.amount === null ? 'chưa tính' : usd(r.amount)}`),
          `Tổng thuế & phí NK: ${usd(plan.tax.total)}${plan.tax.references.length ? ` (+ ${plan.tax.references.length} thuế bổ sung cần xác minh)` : ''}`,
        ]
      : []),
    '',
    'Chứng từ bắt buộc: ' + plan.checklist.filter((c) => c.severity === 'required').map((c) => c.title).join('; '),
  ];
  return lines.join('\n');
}

export default function ResultPanel() {
  const plan = usePlan();
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const open = useAppStore((s) => s.panelOpen);
  const setOpen = useAppStore((s) => s.setPanelOpen);
  const selected = useAppStore((s) => s.incoterm);
  const saveQuote = useAppStore((s) => s.saveQuote);
  const showToast = useAppStore((s) => s.showToast);
  const computed = useAppStore((s) => s.computed);
  const [height, setHeight] = useState(() => Math.round(window.innerHeight * 0.36));
  const drag = useRef<{ y: number; h: number } | null>(null);

  if (!plan || !computed) return null;
  const incoterm: Incoterm = selected ?? plan.suggestion.primary;

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, h: open ? height : 44 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const h = drag.current.h + (drag.current.y - e.clientY);
    if (h < 90) setOpen(false);
    else {
      setOpen(true);
      setHeight(Math.min(window.innerHeight * 0.85, Math.max(160, h)));
    }
  };
  const onPointerUp = () => (drag.current = null);

  const copy = async () => {
    const text = quoteText(plan, incoterm);
    try {
      await navigator.clipboard.writeText(text);
      showToast('Đã copy báo giá vào clipboard');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast('Đã copy báo giá');
    }
  };
  const save = () => {
    saveQuote({
      form: { ...computed, pol: plan.pol.code, pod: plan.pod.code },
      incoterm,
      summary: `${plan.pol.name} → ${plan.pod.name}`,
      total: plan.quote.total,
      low: plan.quote.low,
      high: plan.quote.high,
      days: plan.days,
      distanceNm: plan.route.distanceNm,
    });
    showToast('Đã lưu báo giá (localStorage)');
  };

  return (
    <div className="relative z-20 flex shrink-0 flex-col border-t border-slate-200 bg-white shadow-[0_-8px_24px_-12px_rgba(15,23,42,.35)]" style={{ height: open ? height : 44 }}>
      <div
        className="flex h-[44px] shrink-0 cursor-row-resize touch-none items-center gap-2 border-b border-slate-100 px-2 select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="absolute top-1 left-1/2 h-1 w-10 -translate-x-1/2 rounded bg-slate-300" />
        <div className="scroll-thin flex min-w-0 flex-1 gap-1 overflow-x-auto" onPointerDown={(e) => e.stopPropagation()}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm whitespace-nowrap ${tab === t.id && open ? 'bg-brand-600 font-semibold text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 gap-1" onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={copy} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" title="Copy báo giá dạng text">📋<span className="hidden sm:inline"> Copy báo giá</span></button>
          <button onClick={save} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" title="Lưu báo giá">💾<span className="hidden sm:inline"> Lưu</span></button>
          <button onClick={() => setOpen(!open)} className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100" title={open ? 'Thu gọn' : 'Mở rộng'}>{open ? '▾' : '▴'}</button>
        </div>
      </div>
      {open && (
        <div className="scroll-thin flex-1 overflow-y-auto p-3 md:p-4">
          {tab === 'overview' && <Overview plan={plan} incoterm={incoterm} />}
          {tab === 'cost' && <CostTable plan={plan} incoterm={incoterm} />}
          {tab === 'tax' && <TaxTab plan={plan} incoterm={incoterm} />}
          {tab === 'rules' && <Conditions plan={plan} />}
          {tab === 'incoterm' && <IncotermTab plan={plan} incoterm={incoterm} />}
          {tab === 'alts' && <AltRanking />}
        </div>
      )}
    </div>
  );
}
