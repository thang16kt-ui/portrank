import { INCOTERMS, PARTY_LABEL, SEGMENTS, payerOf, splitCosts } from '../lib/incoterm';
import { usd, type PlanResult } from '../lib/results';
import type { Incoterm } from '../types';

export function EstimateBanner({ compact }: { compact?: boolean }) {
  return (
    <div className={`rounded-lg border border-amber-300 bg-amber-50 text-amber-900 ${compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-2 text-xs'}`}>
      ⚠️ <b>MÔ HÌNH ƯỚC TÍNH</b> – không phải giá thị trường. Dùng để tham khảo và so sánh tương đối; cần xác nhận với đơn vị vận chuyển trước khi đặt tàu.
    </div>
  );
}

export default function CostTable({ plan, incoterm }: { plan: PlanResult; incoterm: Incoterm }) {
  const { quote } = plan;
  const split = splitCosts(incoterm, quote.lines);
  return (
    <div className="space-y-3">
      <EstimateBanner />
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <div className="text-xs text-slate-500">Tổng ước tính (đến cảng đến)</div>
          <div className="text-2xl font-bold text-brand-700">{usd(quote.total)} <span className="text-xs font-medium text-amber-600">ước tính</span></div>
          <div className="text-xs text-slate-500">Khoảng giá ±12%: {usd(quote.low)} – {usd(quote.high)}</div>
        </div>
        <div className="text-xs">
          <div>Người bán chịu: <b>{usd(split.seller)}</b></div>
          <div>Người mua chịu: <b>{usd(split.buyer)}</b></div>
          <div className="text-slate-500">theo {incoterm} – {INCOTERMS[incoterm].name}</div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Khoản phí</th>
              <th className="px-3 py-2 text-left font-semibold">Chặng</th>
              <th className="px-3 py-2 text-right font-semibold">USD (ước tính)</th>
              <th className="px-3 py-2 text-left font-semibold">Bên chịu ({incoterm})</th>
            </tr>
          </thead>
          <tbody>
            {quote.lines.map((l) => {
              const payer = payerOf(incoterm, l.segment);
              return (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="px-3 py-1.5">
                    {l.label}
                    {l.note && <div className="text-[11px] text-slate-400">{l.note}</div>}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-slate-500">{SEGMENTS[l.segment]}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{Math.round(l.amount).toLocaleString('en-US')}</td>
                  <td className="px-3 py-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${payer === 'seller' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>{PARTY_LABEL[payer]}</span>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
              <td className="px-3 py-2" colSpan={2}>Tổng cộng</td>
              <td className="px-3 py-2 text-right font-mono">{Math.round(quote.total).toLocaleString('en-US')}</td>
              <td className="px-3 py-2 text-[11px] font-normal text-slate-500">{quote.basis}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        Chưa gồm: vận tải nội địa, thông quan, thuế nhập khẩu, bảo hiểm hàng hóa, phí lưu container (DEM/DET), phụ phí mùa cao điểm (PSS) và phí rủi ro chiến tranh. Nguồn giá: mô hình ước tính PortRank, chưa kết nối bảng giá của hãng tàu.
      </p>
    </div>
  );
}
