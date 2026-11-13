import { useMemo, useState } from 'react';
import type { RuleCategory } from '../config/rules';
import type { PlanResult } from '../lib/results';
import { fmtDate } from '../lib/transit';

const SEV = {
  required: { label: 'Bắt buộc', cls: 'bg-red-100 text-red-700' },
  recommended: { label: 'Nên có', cls: 'bg-blue-100 text-blue-700' },
  warning: { label: 'Cảnh báo', cls: 'bg-amber-100 text-amber-800' },
} as const;

const CAT_ORDER: RuleCategory[] = ['Cảnh báo tuyến', 'Hải quan & khai báo', 'Chứng từ', 'Xuất xứ (C/O)', 'Yêu cầu kỹ thuật'];

export default function Conditions({ plan }: { plan: PlanResult }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => CAT_ORDER.map((c) => ({ cat: c, items: plan.checklist.filter((i) => i.category === c) })).filter((g) => g.items.length), [plan]);
  const n = plan.checklist.length, k = plan.checklist.filter((i) => done[i.title]).length;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {plan.pol.countryName} → {plan.pod.countryName} · {n} mục
        </span>
        <span>
          Đã chuẩn bị {k}/{n}
        </span>
      </div>
      {groups.map((g) => (
        <div key={g.cat}>
          <div className="mb-1 text-xs font-bold tracking-wide text-slate-500 uppercase">{g.cat}</div>
          <ul className="space-y-1.5">
            {g.items.map((it) => (
              <li key={it.ruleId + it.title} className={`flex gap-2 rounded-lg border p-2 ${it.severity === 'warning' ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>
                {it.severity !== 'warning' ? (
                  <input type="checkbox" className="mt-1" checked={!!done[it.title]} onChange={(e) => setDone({ ...done, [it.title]: e.target.checked })} />
                ) : (
                  <span>⚠️</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <span className={done[it.title] ? 'text-slate-400 line-through' : ''}>{it.title}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${SEV[it.severity].cls}`}>{SEV[it.severity].label}</span>
                  </div>
                  <div className="text-xs text-slate-600">{it.detail}</div>
                  {it.deadlineHoursBeforeLoading && (
                    <div className="mt-0.5 text-[11px] text-red-600">
                      ⏰ Hạn: ≥{it.deadlineHoursBeforeLoading}h trước khi xếp hàng (dự kiến tàu chạy {fmtDate(plan.etd)})
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-[11px] text-slate-400">Rule engine dạng dữ liệu tại <code>src/config/rules.ts</code>. Mang tính tham khảo – luôn xác nhận với hải quan, hãng tàu và forwarder.</p>
    </div>
  );
}
