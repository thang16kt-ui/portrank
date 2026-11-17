import type { ReactNode } from 'react';
import { getProduct } from '../data/tariff';
import type { Confidence, TaxKind } from '../data/tariff/types';
import { usd, type PlanResult } from '../lib/results';
import { fmtCode } from '../lib/tariff';
import { useAppStore } from '../store/useAppStore';
import type { Incoterm } from '../types';

const KIND: Record<TaxKind, { label: string; cls: string }> = {
  mfn: { label: 'Thuế nhập khẩu', cls: 'bg-slate-100 text-slate-700' },
  preferential: { label: 'Thuế NK ưu đãi FTA', cls: 'bg-emerald-100 text-emerald-800' },
  additional: { label: 'Thuế bổ sung', cls: 'bg-red-100 text-red-700' },
  vat: { label: 'VAT / GST', cls: 'bg-blue-100 text-blue-800' },
  excise: { label: 'Thuế TTĐB', cls: 'bg-purple-100 text-purple-800' },
  other: { label: 'Phí khác', cls: 'bg-slate-100 text-slate-600' },
};

const CONF: Record<Confidence, { label: string; cls: string; title: string }> = {
  official: { label: 'Tự động', cls: 'text-emerald-700', title: 'Tải tự động từ nguồn chính thức' },
  manual: { label: 'Nhập tay', cls: 'text-amber-700', title: 'Nhập tay – cần đối chiếu định kỳ' },
  reference: { label: 'Cần xác minh', cls: 'text-red-700', title: 'Chỉ tham khảo, không cộng vào tổng' },
};

const n = (x: number) => Math.round(x).toLocaleString('en-US');
const day = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

export default function TaxTab({ plan, incoterm }: { plan: PlanResult; incoterm: Incoterm }) {
  const form = useAppStore((s) => s.computed);
  const setTab = useAppStore((s) => s.setTab);
  const t = plan.tax;
  if (!t) {
    return (
      <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-600">
        Chọn <b>mặt hàng</b> hoặc nhập <b>mã HS</b> ở thanh bên trái (mục <i>Hàng hoá &amp; thuế nhập khẩu</i>) rồi bấm <b>Tính &amp; mô phỏng</b> để xem các loại thuế áp dụng tại {plan.pod.countryName}.
      </div>
    );
  }
  const product = getProduct(form?.productSku);
  const payer = incoterm === 'DDP' ? 'Người bán (DDP)' : 'Người mua (nhà nhập khẩu)';
  const origin = t.input.origin;

  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="font-semibold">
          {product?.name ?? 'Mã nhập tay'} · nhập vào {plan.pod.countryName}
        </div>
        <div className="text-xs text-slate-500">
          Mã: <code className="font-semibold text-slate-700">{fmtCode(t.code)}</code>
          {t.line && t.line.code !== t.code && <> (dòng thuế {fmtCode(t.line.code)})</>}
          {t.line && <> – {t.line.description}</>} · Xuất xứ: <b>{origin}</b>
        </div>
        <div className="text-xs text-slate-500">
          Trị giá tính thuế ({t.basis}): <b className="text-slate-700">{usd(t.customsValue)}</b>
          {t.basis === 'CIF' ? <> = FOB {n(t.input.goodsValue)} + cước & phí đến cảng {n(t.input.freight)} + bảo hiểm ước tính</> : <> = trị giá FOB (nước này không cộng cước biển)</>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Tổng thuế & phí NK" value={usd(t.total)} strong />
        <Stat label="Thuế NK + bổ sung + phí" value={usd(t.dutyTotal)} />
        <Stat label="VAT / GST nhập khẩu" value={usd(t.vatTotal)} sub="thường được khấu trừ" />
        <Stat label="Tiết kiệm nhờ FTA" value={t.saving > 0 ? usd(t.saving) : '—'} sub={t.chosen?.agreement} />
      </div>
      <div className="text-xs text-slate-500">
        Bên nộp theo {incoterm}: <b className="text-slate-700">{payer}</b>
      </div>

      {t.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Loại thuế</th>
                <th className="px-3 py-2 text-left font-semibold">Thuế suất</th>
                <th className="px-3 py-2 text-right font-semibold">Trị giá tính (USD)</th>
                <th className="px-3 py-2 text-right font-semibold">Số tiền (USD)</th>
                <th className="px-3 py-2 text-left font-semibold">Dữ liệu</th>
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-1.5">
                    <span className={`mr-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${KIND[r.kind].cls}`}>{KIND[r.kind].label}</span>
                    {r.label}
                    {r.proof && <div className="text-[11px] text-emerald-700">Cần: {r.proof}</div>}
                    {r.note && <div className="text-[11px] text-slate-400">{r.note}</div>}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap">{r.rate}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{n(r.base)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{r.amount === null ? '—' : n(r.amount)}</td>
                  <td className={`px-3 py-1.5 text-[11px] whitespace-nowrap ${CONF[r.confidence].cls}`} title={`${CONF[r.confidence].title} · ${r.source}`}>
                    {CONF[r.confidence].label}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td className="px-3 py-2" colSpan={3}>Tổng (không gồm mục cần xác minh)</td>
                <td className="px-3 py-2 text-right font-mono">{n(t.total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {t.preferences.length > 0 && (
        <Section title={`Ưu đãi FTA cho hàng xuất xứ ${origin}`}>
          <ul className="space-y-1">
            {t.preferences.map((p, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <b>{p.agreement ?? p.label}</b>
                <span className="font-mono">{p.rate || 'chưa có thuế suất'}</span>
                {p === t.chosen && <span className="rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-800">đang áp dụng</span>}
                {p.proof && <span className="text-slate-500">· {p.proof}</span>}
              </li>
            ))}
          </ul>
          <button className="mt-1 text-[11px] text-brand-700 underline" onClick={() => setTab('rules')}>
            Xem chứng từ C/O trong tab Điều kiện →
          </button>
        </Section>
      )}

      {t.candidates.length > 0 && (
        <Section title="Chọn mã chi tiết">
          <ul className="space-y-0.5 text-xs">
            {t.candidates.slice(0, 12).map((c) => (
              <li key={c.code}>
                <code className="font-semibold">{fmtCode(c.code)}</code> {c.description}{' '}
                <span className="font-mono text-slate-500">{c.measures.find((m) => m.kind === 'mfn' && !m.origins)?.rate}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {t.references.length > 0 && (
        <Section title={`Cần xác minh – thuế bổ sung theo xuất xứ ${origin} (${t.references.length})`}>
          <ul className="space-y-1.5">
            {t.references.map((m, i) => (
              <li key={i} className="text-xs">
                <details>
                  <summary className="cursor-pointer">
                    <b>{m.label}</b> <span className="font-mono text-red-700">{m.rate}</span>
                  </summary>
                  <div className="mt-0.5 text-slate-500">{m.note}</div>
                </details>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {t.warnings.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50/70 p-2 text-xs text-amber-900">
          {t.warnings.map((w, i) => (
            <li key={i}>⚠️ {w}</li>
          ))}
        </ul>
      )}

      <div className="space-y-0.5 text-[11px] text-slate-500">
        {t.sources.map((s) => (
          <div key={s.country + s.source}>
            Nguồn {s.country}:{' '}
            {s.sourceUrl ? (
              <a className="underline" href={s.sourceUrl} target="_blank" rel="noreferrer">{s.source}</a>
            ) : (
              s.source
            )}
            {s.release && <> · {s.release}</>}
            {s.fetchedAt ? (
              <>
                {' '}· {s.manual ? 'đối chiếu' : 'cập nhật'}: {day(s.fetchedAt)}
                {s.stale && <span className="ml-1 font-semibold text-amber-700">(cũ)</span>}
              </>
            ) : (
              <span className="ml-1 font-semibold text-amber-700">· chưa đối chiếu</span>
            )}
          </div>
        ))}
        <div>
          Cập nhật tự động: <code>npm run tariffs:update</code> (Mỹ, Anh). Nhập tay: <code>src/data/tariff/manual.csv</code>. Danh mục hàng: <code>src/data/tariff/products.csv</code>. Mang tính tham khảo – xác nhận với hải quan / đại lý khai thuê trước khi khai báo.
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={strong ? 'text-lg font-bold text-brand-700' : 'font-semibold'}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <div className="mb-1 text-xs font-bold tracking-wide text-slate-500 uppercase">{title}</div>
      {children}
    </div>
  );
}
