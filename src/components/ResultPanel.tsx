import { useMemo } from 'react';
import { CARGO_LABEL, CONTAINER_LABEL } from '../config/pricing';
import { INCOTERMS, PARTY_LABEL, payerOf } from '../lib/incoterm';
import { computePlan, fmtNm, usd, type PlanResult } from '../lib/results';
import { fmtDate } from '../lib/transit';
import { useAppStore, usePlayback, type ResultTab } from '../store/useAppStore';
import type { Incoterm } from '../types';
import AltRanking from './AltRanking';
import Conditions from './Conditions';
import CostTable from './CostTable';
import IncotermTab from './IncotermBar';
import Overview from './Overview';

const TABS: { id: ResultTab; label: string }[] = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'cost', label: 'Chi phí' },
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
    '',
    'Chứng từ bắt buộc: ' + plan.checklist.filter((c) => c.severity === 'required').map((c) => c.title).join('; '),
  ];
  return lines.join('\n');
}

export default function ResultPanel() {
  const plan = usePlan();
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const setOpen = useAppStore((s) => s.setPanelOpen);
  const selected = useAppStore((s) => s.incoterm);
  const saveQuote = useAppStore((s) => s.saveQuote);
  const showToast = useAppStore((s) => s.showToast);
  const computed = useAppStore((s) => s.computed);
  const form = useAppStore((s) => s.form);
  const setView = useAppStore((s) => s.setWorkspaceView);
  const stale = computed && JSON.stringify(form) !== JSON.stringify(computed);

  if (!plan || !computed) return null;
  const incoterm: Incoterm = selected ?? plan.suggestion.primary;

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
    showToast('Đã lưu phương án trên trình duyệt này');
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <div className="shrink-0 border-b border-slate-200 bg-white p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Kết quả lập kế hoạch</p><h2 className="mt-1 text-xl font-bold text-brand-900">{plan.pol.name} → {plan.pod.name}</h2></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { usePlayback.getState().setProgress(0); usePlayback.getState().setPlaying(true); setView('map'); }} className="min-h-11 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white">▶ Xem mô phỏng</button>
            <button onClick={save} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm">Lưu phương án</button>
            <button onClick={copy} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm">Sao chép</button>
          </div>
        </div>
        {stale && <div role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Thông tin lô hàng đã thay đổi. Kết quả dưới đây thuộc lần tính trước. <button onClick={() => setView('setup')} className="font-semibold underline">Mở lô hàng để tính lại</button>.</div>}
      </div>
      <nav aria-label="Chi tiết kết quả" className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2">
        {TABS.map((t) => <button key={t.id} onClick={() => { setTab(t.id); setOpen(true); }} aria-current={tab === t.id ? 'page' : undefined} className={`min-h-11 rounded-lg px-3 text-sm whitespace-nowrap ${tab === t.id ? 'bg-brand-50 font-semibold text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}>{t.label}</button>)}
      </nav>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        {tab === 'overview' && <Overview plan={plan} incoterm={incoterm} />}
        {tab === 'cost' && <CostTable plan={plan} incoterm={incoterm} />}
        {tab === 'rules' && <Conditions plan={plan} />}
        {tab === 'incoterm' && <IncotermTab plan={plan} incoterm={incoterm} />}
        {tab === 'alts' && <AltRanking />}
      </div>
    </div>
  );
}
