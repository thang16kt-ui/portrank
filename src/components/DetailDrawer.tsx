import { Fragment, useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COST_ITEMS, GROUP_C } from '../config/incoterms';
import type { RuleCategory } from '../config/rules';
import { CARRIERS, findCarrier } from '../data/carriers';
import { countryName, ftasBetween } from '../data/countries';
import { tariffLookupLink } from '../data/customsBasis';
import { otherTaxesFor } from '../data/otherTaxes';
import { VAT_DATA, standardVat, vatLabel } from '../data/vatRates';
import { fmtHsCode, hs6Of } from '../lib/hs';
import { autoSourceOf } from '../lib/tariffSources';
import { PORT_BY_CODE } from '../data/ports';
import { loadApiSchedules, runPlan, useCurrent } from '../lib/actions';
import { fetchApiConfig, type ApiConfig } from '../lib/dcsa';
import { daysSince, fmtDateVi } from '../lib/csv';
import { fmtDays, usd } from '../lib/format';
import { sellerShare } from '../lib/incoterm';
import type { Plan } from '../lib/plan';
import type { RankedOption } from '../lib/ranking';
import { evaluateRules } from '../lib/rules';
import { createTableRateProvider } from '../providers/RateProvider';
import { SCHEDULE_STALE_DAYS, type ScheduleEntry } from '../providers/ScheduleProvider';
import { useAppStore, type DetailTab } from '../store/useAppStore';
import { useDataStore } from '../store/useDataStore';
import { BUYER_COLOR, SELLER_COLOR } from './IncotermDiagram';

const TABS: { tab: DetailTab; label: string }[] = [
  { tab: 'cost', label: 'Bảng chi phí' },
  { tab: 'duty', label: 'Thuế nhập khẩu' },
  { tab: 'rules', label: 'Điều kiện, chứng từ' },
  { tab: 'history', label: 'Biến động giá' },
  { tab: 'schedule', label: 'Hãng tàu & lộ trình' },
];

/* ───────────── Bảng chi phí 10 khoản ───────────── */
function CostTable({ plan, r }: { plan: Plan; r: RankedOption }) {
  const term = useAppStore((s) => s.form.term);
  const destBySeller = useAppStore((s) => s.destChargesBySeller);
  const set = useAppStore((s) => s.set);
  const [open, setOpen] = useState<number | null>(5);
  const o = r.option, role = plan.input.role;
  return (
    <div>
      <p className="mb-2 text-[11px] text-mute">
        {plan.scopeTitle} · <b className="text-fg">{o.title}</b> · điều kiện <b className="text-amber-200">{term}</b>. Bấm một dòng để xem cách tính.
      </p>
      <table className="tbl">
        <thead><tr><th>#</th><th>Khoản</th><th className="!text-right">USD</th><th>Ai trả</th></tr></thead>
        <tbody>
          {COST_ITEMS.map((c) => {
            const it = o.items[c.n - 1];
            const sh = sellerShare(term, c.n, { destChargesBySeller: destBySeller });
            const mine = role === 'seller' ? sh : 1 - sh;
            return (
              <Fragment key={c.n}>
                <tr className="cursor-pointer hover:bg-white/5" onClick={() => setOpen(open === c.n ? null : c.n)}>
                  <td className="text-mute">{c.n}</td>
                  <td>
                    <span className={mine > 0 ? 'font-semibold text-fg' : 'text-fg'}>{c.label[o.mode]}</span>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {it.amount == null ? <span className="chip chip-warn">Chưa tính · nhập địa chỉ để tính</span> : it.badge ? <span className="chip chip-real">{it.badge}</span> : it.estimated ? <span className="chip chip-est">Ước tính</span> : <span className="chip chip-real">Theo biểu thuế bạn nhập</span>}
                    </div>
                  </td>
                  <td className="text-right font-semibold whitespace-nowrap">{it.amount == null ? '—' : usd(it.amount)}</td>
                  <td>
                    <span className="chip" style={{ background: sh === 1 ? SELLER_COLOR : sh === 0 ? BUYER_COLOR : '#64748b', color: sh === 1 ? '#1c1917' : '#fff' }}>
                      {sh === 1 ? 'Người bán' : sh === 0 ? 'Người mua' : `Chia ${Math.round(sh * 100)}/${Math.round((1 - sh) * 100)}`}
                    </span>
                    {mine > 0 && <span className="ml-1 text-[10px] text-amber-200">bạn</span>}
                  </td>
                </tr>
                {open === c.n && (it.lines.length > 0 || it.note) && (
                  <tr>
                    <td />
                    <td colSpan={3} className="!pt-0 text-[11px] text-mute">
                      {it.lines.map((l, i) => (
                        <div key={i} className="flex justify-between gap-3"><span>{l.label}{l.note && <span className="opacity-70"> · {l.note}</span>}</span><span className="text-fg">{usd(l.amount)}</span></div>
                      ))}
                      {it.note && <div className="italic opacity-80">{it.note}</div>}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr><td /><td className="font-semibold text-fg">Tổng 10 khoản</td><td className="text-right font-bold text-fg">{usd(o.total)}</td><td className="text-[10.5px] text-mute">≈ {usd(o.low)} – {usd(o.high)}</td></tr>
          <tr><td /><td className="font-semibold text-amber-200">Bạn trả ({role === 'seller' ? 'người bán' : 'người mua'})</td><td className="text-right font-bold text-amber-200">{usd(r.youPay)}</td><td /></tr>
          <tr><td /><td className="text-mute">Bên kia trả</td><td className="text-right text-mute">{usd(r.otherPays)}</td><td /></tr>
        </tfoot>
      </table>
      {GROUP_C.includes(term) && (
        <label className="mt-2 flex items-center gap-2 text-[11.5px] text-fg">
          <input type="checkbox" checked={destBySeller} onChange={(e) => set({ destChargesBySeller: e.target.checked })} />
          Nhóm C: người bán trả phí cảng đến (khoản 7) theo hợp đồng vận tải
        </label>
      )}
      {plan.input.goodsValue > 0 && (
        <p className="mt-2 text-[11px] text-mute">
          Giá hàng {usd(plan.input.goodsValue)} báo theo {plan.input.valueTerm} → quy đổi: tại xưởng ≈ {usd(o.value.exw)} · FOB ≈ {usd(o.value.fob)} · CIF ≈ {usd(o.value.cif)}.
        </p>
      )}
      <p className="mt-2 text-[10.5px] text-mute">Mọi con số gắn nhãn “Ước tính” lấy từ mô hình trong <code>src/config/pricing.ts</code> (±12%), không phải giá thị trường.</p>
    </div>
  );
}

/* ───────────── Thuế nhập khẩu & VAT ───────────── */
function DutyPanel({ plan, r }: { plan: Plan; r: RankedOption }) {
  const set = useAppStore((s) => s.set);
  const d = r.option.duty;
  const imp = plan.buyer.country, exp = (plan.input.origin || plan.seller.country).toUpperCase();
  const link = tariffLookupLink(imp);
  const ftas = ftasBetween(exp, imp);
  const e = d.entry;
  return (
    <div className="space-y-2.5 text-[12px]">
      <div className="rounded-lg border border-line bg-well p-2.5">
        <div className="text-mute">Nước nhập khẩu: <b className="text-fg">{countryName(imp)}</b> · xuất xứ: <b className="text-fg">{countryName(exp)}</b> · HS: <b className="text-fg">{plan.input.hs || '—'}</b></div>
        <div className="mt-1 text-mute">
          Trị giá tính thuế theo <b className="text-fg">{d.basis.basis}</b>{' '}
          <span className={`chip ${d.basis.verified ? 'chip-real' : 'chip-warn'}`}>{d.basis.verified ? 'Đã xác minh' : 'Chưa xác minh'}</span>{' '}
          · nguồn: <a href={d.basis.source} target="_blank" rel="noreferrer">{d.basis.sourceLabel}</a>
          {d.basis.note && <div className="text-[11px] opacity-80">{d.basis.note}</div>}
        </div>
      </div>
      <OfficialTariffBox plan={plan} />
      {d.status === 'ok' && e ? (
        <div className="rounded-lg border border-line bg-well p-2.5">
          <table className="tbl">
            <tbody>
              <tr><td>Trị giá tính thuế ({d.basis.basis})</td><td className="text-right">{usd(d.customsValue)}</td></tr>
              <tr><td>Thuế nhập khẩu {e.dutyPct}% <span className="chip chip-sky">{e.rateType === 'FTA' ? `Ưu đãi ${e.fta || 'FTA'}` : 'MFN'}</span></td><td className="text-right">{usd(d.duty)}</td></tr>
              {d.other > 0 && <tr><td>Thuế khác {e.otherPct}%</td><td className="text-right">{usd(d.other)}</td></tr>}
              {d.fees > 0 && <tr><td>{e.feeLabel || 'Phí theo trị giá'} {e.feePct}% <span className="text-[10.5px] text-mute">(không chịu VAT)</span></td><td className="text-right">{usd(d.fees)}</td></tr>}
              <tr><td>VAT/GST {d.vatMissing ? <span className="chip chip-warn">chưa nhập</span> : `${e.vatPct}%`}</td><td className="text-right">{d.vatMissing ? '—' : usd(d.vat)}</td></tr>
              <tr><td className="font-semibold text-fg">Tổng thuế</td><td className="text-right font-bold text-amber-200">{usd(d.total)}</td></tr>
            </tbody>
          </table>
          <div className="mt-2 space-y-0.5 text-[11px] text-mute">
            <div>Nguồn: {/^https?:/.test(e.source) ? <a href={e.source} target="_blank" rel="noreferrer">{e.source}</a> : <b className="text-fg">{e.source}</b>}</div>
            <div>Hiệu lực từ: {fmtDateVi(e.effectiveDate)} · {isAuto(e) ? 'lấy ngày' : 'cập nhật'}: <b className="text-fg">{fmtDateVi(e.updatedAt)}</b> {isAuto(e) ? (e.id.startsWith('wits-') ? <span className="chip chip-warn">WITS/TRAINS · số liệu năm {e.effectiveDate.slice(0, 4)} · trung bình HS6</span> : <span className="chip chip-real">Nguồn chính thức · lấy tự động</span>) : <span className={`chip ${e.verified ? 'chip-real' : 'chip-warn'}`}>{e.verified ? 'Đã xác minh' : 'Chưa xác minh'}</span>}</div>
            {isAuto(e) && (
              <button className="btn mt-1" onClick={() => { useDataStore.getState().upsertTariff({ ...e, id: Math.random().toString(36).slice(2, 10), verified: false }); useAppStore.getState().showToast('Đã lưu vào Biểu thuế của bạn (đánh dấu chưa xác minh để bạn kiểm tra)'); }}>
                💾 Lưu vào biểu thuế của tôi
              </button>
            )}
            {d.stale && <div className="rounded bg-gold/10 px-2 py-1 text-amber-200">⚠️ Mức thuế này cập nhật cách đây {daysSince(e.updatedAt)} ngày (quá 90 ngày) – hãy kiểm tra lại.</div>}
            {e.rateType === 'FTA' && <div>Thuế ưu đãi chỉ áp dụng khi có C/O hợp lệ.</div>}
          </div>
        </div>
      ) : d.status === 'domestic' ? (
        <p className="text-mute">Hai điểm cùng một nước – không phát sinh thuế nhập khẩu.</p>
      ) : (
        <div className="rounded-lg border border-dashed border-gold/40 bg-gold/5 p-3">
          <div className="font-semibold text-amber-200">Chưa có dữ liệu thuế</div>
          <p className="mt-1 text-[11.5px] text-mute">
            {d.status === 'no-value'
              ? 'Nhập mã HS (≥ 6 số) và giá trị hàng ở bảng bên trái để ước tính thuế.'
              : `Chưa có thuế suất cho HS ${plan.input.hs} nhập vào ${countryName(imp)}. PortRank không tự đoán thuế suất.`}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn btn-on" onClick={() => set({ page: 'tariffs' })}>＋ Nhập thuế suất</button>
            <a className="btn" href={link.url} target="_blank" rel="noreferrer">Tra cứu chính thức: {link.label} ↗</a>
          </div>
        </div>
      )}
      <OtherTaxesBox country={imp} hs={plan.input.hs} />
      {ftas.length > 0 && (
        <p className="rounded bg-sky/10 px-2 py-1.5 text-[11.5px] text-cyan-100">
          💡 {countryName(exp)} – {countryName(imp)} có thể áp dụng: <b>{ftas.join(', ')}</b>. Hãy kiểm tra thuế ưu đãi và điều kiện C/O (quy tắc xuất xứ) cho mã HS của bạn.
        </p>
      )}
      <p className="text-[11px] text-mute italic">Số thuế là ước tính để lập kế hoạch; số chính thức do cơ quan hải quan xác định.</p>
    </div>
  );
}

const isAuto = (e: { id: string }) => !!autoSourceOf(e);

/** VAT/GST tiêu chuẩn + các thuế/phí khác có thể áp dụng theo nước nhập & chương HS (tham khảo, không cộng vào tổng) */
function OtherTaxesBox({ country, hs }: { country: string; hs: string }) {
  const vat = standardVat(country);
  const list = otherTaxesFor(country, hs);
  const hs6 = hs6Of(hs);
  return (
    <div className="rounded-lg border border-line bg-well p-2.5 text-[11.5px]">
      <div className="mb-1 font-semibold text-fg">Các thuế / phí khác có thể áp dụng khi nhập vào {countryName(country)}{hs6 ? ` – HS ${fmtHsCode(hs6)}` : ''}</div>
      <ul className="space-y-1">
        <li>
          <b className="text-fg">{vat ? vatLabel(vat) : 'VAT / GST'}</b>{' '}
          {vat ? (vat.type === 'none' ? <span className="text-mute">– không có VAT/GST cấp quốc gia{vat.regional ? ' (thuế theo bang/tỉnh khi bán lẻ)' : ''}</span> : <><span className="font-mono text-amber-200">{vat.pct}%</span> <span className="text-mute">thuế suất tiêu chuẩn{vat.regional ? ' + thuế theo bang/tỉnh' : ''} – mặt hàng có thể chịu mức giảm/miễn</span></>) : <span className="text-mute">– chưa có dữ liệu</span>}
        </li>
        {list.map((t) => (
          <li key={t.name}>
            <b className="text-fg">{t.name}</b>{t.rate && <span className="ml-1 font-mono text-amber-200">{t.rate}</span>} <span className="text-mute">– {t.detail}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 text-[10.5px] text-mute italic">
        Danh mục tham khảo, chưa xác minh, không cộng vào tổng thuế. VAT tiêu chuẩn: <a href={VAT_DATA.sourceUrl} target="_blank" rel="noreferrer">{VAT_DATA.source}</a> ({fmtDateVi(VAT_DATA.fetchedAt)}).
      </div>
    </div>
  );
}

/** Kết quả tra cứu từ nguồn chính thức: mã đã dùng, lựa chọn mã chi tiết, ghi chú, lỗi */
function OfficialTariffBox({ plan }: { plan: Plan }) {
  const off = plan.tariffSource.official;
  const setForm = useAppStore((s) => s.setForm);
  if (!off) return null;
  return (
    <div className="rounded-lg border border-sky/30 bg-sky/5 p-2.5 text-[11.5px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-cyan-100">🏛 {off.providerLabel}</b>
        <a href={off.url} target="_blank" rel="noreferrer">Mở trang chính thức ↗</a>
      </div>
      {off.code && <div className="mt-0.5 text-mute">Mã <b className="font-mono text-fg">{off.code}</b>{off.description ? ` – ${off.description}` : ''}</div>}
      {off.error && <div className="mt-1 text-amber-200">⚠️ {off.error}</div>}
      {off.choices && (
        <div className="mt-1.5">
          <div className="mb-1 text-mute">Chọn mã chi tiết (mã HS sẽ được cập nhật và tính lại):</div>
          <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
            {off.choices.map((c) => (
              <button key={c.code} className="btn w-full !justify-start !whitespace-normal !text-left !text-[11px]" onClick={() => { setForm({ hs: c.code }); runPlan({ keepSelection: true }); }}>
                <span className="font-mono text-amber-200">{c.code}</span> <span className="text-mute">{c.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {off.snapshot && <div className="mt-1"><span className="chip chip-warn">Bản chụp ngày {fmtDateVi(off.snapshot)}</span> <span className="text-mute">API trực tuyến không phản hồi</span></div>}
      {off.notes.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-4 text-mute">{off.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      {off.additional && off.additional.length > 0 && (
        <div className="mt-2 rounded-md border border-gold/40 bg-gold/5 p-2">
          <div className="font-semibold text-amber-200">Cần xác minh – thuế bổ sung Chương 99 cho xuất xứ {countryName((plan.input.origin || plan.seller.country).toUpperCase())} ({off.additional.length})</div>
          <div className="mb-1 text-[11px] text-mute">Phụ thuộc ngày xếp hàng, danh mục loại trừ và điều kiện riêng – KHÔNG cộng vào tổng thuế.</div>
          <ul className="space-y-1">
            {off.additional.map((a) => (
              <li key={a.code}>
                <details>
                  <summary className="cursor-pointer"><span className="font-mono text-fg">HTS {a.code}</span> <span className="text-amber-200">{a.pct != null ? `${/^\d/.test(a.rate) ? '' : '+'}${a.pct}%` : a.rate}</span></summary>
                  <div className="mt-0.5 text-mute">{a.rate} · {a.note}</div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ───────────── Điều kiện & chứng từ ───────────── */
const SEV = {
  required: { label: 'Bắt buộc', cls: 'chip-bad' },
  recommended: { label: 'Nên có', cls: 'chip-sky' },
  warning: { label: 'Cảnh báo', cls: 'chip-warn' },
} as const;
const CAT_ORDER: RuleCategory[] = ['Cảnh báo tuyến', 'Hải quan & khai báo', 'Chứng từ', 'Xuất xứ (C/O)', 'Yêu cầu kỹ thuật'];

function Conditions({ plan, r }: { plan: Plan; r: RankedOption }) {
  const o = r.option;
  const list = useMemo(() => {
    if (o.mode !== 'sea' || !o.pol || !o.pod || !o.route) return [];
    return evaluateRules({ pol: o.pol, pod: o.pod, route: o.route, shipment: plan.input.shipment, avoidRedSea: plan.input.avoidRedSea });
  }, [o, plan]);
  if (o.mode !== 'sea') return <p className="text-[12px] text-mute">Checklist chứng từ chi tiết hiện mới có cho đường biển. Với đường bộ, tối thiểu cần: hợp đồng, hóa đơn thương mại, phiếu đóng gói, tờ khai xuất / nhập, C/O (nếu xin ưu đãi), giấy phép vận tải qua biên giới.</p>;
  return (
    <div className="space-y-3">
      {CAT_ORDER.map((cat) => {
        const items = list.filter((i) => i.category === cat);
        if (!items.length) return null;
        return (
          <div key={cat}>
            <div className="mb-1 text-[10.5px] font-bold tracking-wide text-mute uppercase">{cat}</div>
            <ul className="space-y-1.5">
              {items.map((it, i) => (
                <li key={i} className="rounded-lg border border-line bg-well px-2.5 py-1.5">
                  <div className="flex items-start justify-between gap-2"><span className="text-[12px] font-semibold text-fg">{it.title}</span><span className={`chip shrink-0 ${SEV[it.severity].cls}`}>{SEV[it.severity].label}</span></div>
                  <div className="text-[11px] leading-snug text-mute">{it.detail}</div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── Biến động giá (mô phỏng) ───────────── */
function PriceHistory({ r }: { r: RankedOption }) {
  const o = r.option;
  return (
    <div>
      <p className="mb-2 text-[11.5px] text-mute">
        <span className="chip chip-warn">Dữ liệu mô phỏng</span> Chuỗi {o.mode === 'sea' ? 'cước biển' : 'cước xe'} 12 tháng của <b className="text-fg">{o.title}</b> (seed cố định theo cặp cảng) – dùng để chấm điểm “ổn định giá”, không phải giá lịch sử thật.
      </p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={o.history} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--color-mute)' }} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--color-mute)' }} width={48} domain={['auto', 'auto']} />
            <Tooltip contentStyle={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)', borderRadius: 8, fontSize: 12, color: 'var(--color-fg)' }} formatter={(v) => [usd(Number(v)), 'Cước']} />
            <Line type="monotone" dataKey="price" stroke="#fbbf24" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[11.5px] text-mute">Hệ số biến thiên CV = <b className="text-fg">{(o.cv * 100).toFixed(1)}%</b> · điểm ổn định {r.scores.stability.toFixed(0)}/100 · tần suất ≈ {o.frequency} chuyến/tuần (mô phỏng) · điểm rủi ro {(o.risk * 100).toFixed(0)}/100.</p>
    </div>
  );
}

/* ───────────── Hãng tàu & lộ trình ───────────── */
const dd = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
const plus = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
};

function Timeline({ plan, r, e }: { plan: Plan; r: RankedOption; e: ScheduleEntry }) {
  const o = r.option;
  const steps: { date: string; label: string; note?: string; est?: boolean; kind?: string }[] = [];
  const firstCut = [e.cutoffCy, e.cutoffDoc, e.cutoffVgm].filter(Boolean).sort()[0] ?? e.etd;
  if (plan.seller.kind === 'address') steps.push({ date: plus(e.cutoffCy || firstCut, -Math.ceil(o.days.inlandO)), label: 'Hàng rời kho', note: `nội địa ≈ ${fmtDays(o.days.inlandO)} tới ${o.pol?.name}`, est: true });
  if (e.cutoffDoc) steps.push({ date: e.cutoffDoc, label: 'Cut-off chứng từ (SI)' });
  if (e.cutoffVgm) steps.push({ date: e.cutoffVgm, label: 'Cut-off VGM' });
  if (e.cutoffCy) steps.push({ date: e.cutoffCy, label: 'Cut-off CY (hạ bãi)' });
  steps.sort((a, b) => a.date.localeCompare(b.date));
  steps.push({ date: e.etd, label: `ETD ${PORT_BY_CODE[e.pol]?.name ?? e.pol}`, note: [e.vessel, e.voyage].filter(Boolean).join(' · '), kind: 'main' });
  for (const t of e.transshipments) {
    const wait = t.eta && t.etd ? dd(t.eta, t.etd) : null;
    steps.push({ date: t.eta || '', label: `Chuyển tải tại ${PORT_BY_CODE[t.port]?.name ?? t.port}`, note: `${t.eta ? `đến ${fmtDateVi(t.eta)}` : ''}${wait != null ? ` · chờ ${wait} ngày` : ''}${t.etd ? ` · đi ${fmtDateVi(t.etd)}` : ''}${t.vessel ? ` · tàu nối ${t.vessel}` : ''}`, kind: 'ts' });
  }
  steps.push({ date: e.eta, label: `ETA ${PORT_BY_CODE[e.pod]?.name ?? e.pod}`, kind: 'main' });
  steps.push({ date: plus(e.eta, 2), label: 'Hàng sẵn sàng lấy', note: 'sau dỡ hàng + thông quan (giả định 2 ngày)', est: true });
  if (plan.buyer.kind === 'address') steps.push({ date: plus(e.eta, 2 + Math.ceil(o.days.inlandD)), label: 'Về kho người mua', note: `nội địa ≈ ${fmtDays(o.days.inlandD)}`, est: true });
  return (
    <ol className="relative ml-2 space-y-2 border-l border-line pl-4">
      {steps.map((s, i) => (
        <li key={i} className="relative">
          <span className={`absolute top-1 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-panel ${s.kind === 'main' ? 'bg-gold' : s.kind === 'ts' ? 'bg-pink-400' : 'bg-slate-400'}`} />
          <div className="text-[12px] text-fg"><b>{fmtDateVi(s.date)}</b> · {s.label} {s.est && <span className="chip chip-est">ước tính</span>}</div>
          {s.note && <div className="text-[11px] text-mute">{s.note}</div>}
        </li>
      ))}
    </ol>
  );
}

function ApiScheduleBox({ plan, r }: { plan: Plan; r: RankedOption }) {
  const [cfg, setCfg] = useState<ApiConfig | null | undefined>(undefined);
  const o = r.option;
  const key = `${o.pol?.code}>${o.pod?.code}`;
  const state = useAppStore((s) => s.apiSchedules[key]);
  const configured = cfg?.dcsa.filter((c) => c.configured) ?? [];
  const wanted = plan.input.carriers.length ? configured.filter((c) => plan.input.carriers.includes(c.id)) : configured;
  const load = () => o.pol && o.pod && loadApiSchedules(o.pol.code, o.pod.code, plan.input.readyDate, wanted.map((c) => c.id));
  useEffect(() => {
    fetchApiConfig().then(setCfg);
  }, []);
  // tự lấy một lần cho mỗi cặp cảng khi máy chủ có cấu hình hãng
  useEffect(() => {
    if (cfg && wanted.length && !state) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, key]);
  if (cfg === undefined) return null;
  return (
    <div className="rounded-lg border border-sky/30 bg-sky/5 p-2.5 text-[11.5px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-cyan-100">🔌 API hãng tàu (chuẩn DCSA)</b>
        {wanted.length > 0 && <button className="btn !py-0.5" disabled={state?.status === 'loading'} onClick={load}>{state?.status === 'loading' ? 'Đang lấy…' : '↻ Lấy lịch'}</button>}
      </div>
      {!cfg ? (
        <p className="mt-1 text-mute">Trang đang chạy dạng tĩnh, không có máy chủ PortRank nên chưa gọi được API hãng tàu. Chạy <code>npm start</code> với key hãng tàu (xem README) để bật.</p>
      ) : !configured.length ? (
        <p className="mt-1 text-mute">Máy chủ chưa cấu hình key hãng nào (biến <code>DCSA_CARRIERS</code>, <code>DCSA_&lt;HÃNG&gt;_URL</code>, <code>DCSA_&lt;HÃNG&gt;_HEADERS</code>).</p>
      ) : !wanted.length ? (
        <p className="mt-1 text-mute">Các hãng bạn lọc chưa được cấu hình API. Đang có: {configured.map((c) => findCarrier(c.id)?.name ?? c.id).join(', ')}.</p>
      ) : (
        <div className="mt-1 text-mute">
          Hãng có API: {wanted.map((c) => findCarrier(c.id)?.name ?? c.id).join(', ')}
          {state?.status === 'ok' && <> · lấy lúc {fmtDateVi(state.fetchedAt)} · {state.entries.length} lộ trình</>}
          {state?.status === 'error' && <div className="text-amber-200">⚠️ {state.error}</div>}
          {state?.status === 'ok' && state.errors.map((e) => <div key={e.carrier} className="text-amber-200">⚠️ {findCarrier(e.carrier)?.name ?? e.carrier}: {e.error}</div>)}
        </div>
      )}
    </div>
  );
}

function SchedulePanel({ plan, r }: { plan: Plan; r: RankedOption }) {
  const own = useDataStore((s) => s.schedules);
  const apiState = useAppStore((s) => s.apiSchedules[`${r.option.pol?.code}>${r.option.pod?.code}`]);
  const schedules = useMemo(() => [...own, ...(apiState?.status === 'ok' ? apiState.entries : [])], [own, apiState]);
  const rates = useDataStore((s) => s.rates);
  const scheduleId = useAppStore((s) => s.scheduleId);
  const set = useAppStore((s) => s.set);
  const selectedKey = useAppStore((s) => s.selectedKey);
  const o = r.option;
  const filter = plan.input.carriers;
  const routings = useMemo(
    () => (o.pol && o.pod ? schedules.filter((e) => e.pol === o.pol!.code && e.pod === o.pod!.code && e.etd >= plan.input.readyDate).sort((a, b) => a.etd.localeCompare(b.etd)) : []),
    [schedules, o, plan],
  );
  const withData = new Set(routings.map((e) => e.carrier));
  const carriers = CARRIERS.filter((c) => !filter.length || filter.includes(c.id));
  const provider = useMemo(() => createTableRateProvider(rates), [rates]);
  const rows = carriers
    .filter((c) => withData.has(c.id))
    .map((c) => {
      const first = routings.find((e) => e.carrier === c.id)!;
      const rate = plan.input.shipment.mode === 'FCL' && o.pol && o.pod ? provider.find({ pol: o.pol.code, pod: o.pod.code, container: plan.input.shipment.container, date: plan.input.readyDate, carriers: [c.id] }) : null;
      const carrierRate = rate && rate.entry.carrier === c.id ? rate : null;
      return { c, first, days: dd(first.etd, first.eta), ts: first.transshipments.length, price: carrierRate ? carrierRate.perContainer : null };
    });
  const fastest = rows.length ? Math.min(...rows.map((x) => x.days)) : 0;
  const priced = rows.filter((x) => x.price != null);
  const cheapest = priced.length ? Math.min(...priced.map((x) => x.price!)) : null;
  const sel = routings.find((e) => e.id === scheduleId) ?? null;
  // Tự chọn phương án trên bản đồ để vẽ được chặng của hãng
  const pick = (e: ScheduleEntry) => {
    if (selectedKey !== o.key) useAppStore.getState().select(o.key);
    set({ scheduleId: scheduleId === e.id ? null : e.id, showSeaRoute: true });
  };
  if (o.mode !== 'sea' || !o.pol || !o.pod) return <p className="text-[12px] text-mute">Lộ trình hãng tàu chỉ áp dụng cho đường biển.</p>;
  return (
    <div className="space-y-3 text-[12px]">
      <ApiScheduleBox plan={plan} r={r} />
      <p className="text-mute">Cặp cảng <b className="text-fg">{o.pol.name} → {o.pod.name}</b> · hàng sẵn sàng {fmtDateVi(plan.input.readyDate)}{filter.length ? ` · lọc: ${filter.map((id) => findCarrier(id)?.name).join(', ')}` : ''}</p>
      {rows.length > 0 && (
        <table className="tbl">
          <thead><tr><th>Hãng</th><th>Ngày đi gần nhất</th><th>Số ngày</th><th>Chuyển tải</th><th className="!text-right">Cước/cont</th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.c.id}>
                <td className="font-semibold text-fg">{x.c.name}</td>
                <td>{fmtDateVi(x.first.etd)}</td>
                <td>{x.days} {x.days === fastest && rows.length > 1 && <span className="chip chip-sky">Nhanh nhất</span>}</td>
                <td>{x.ts ? `${x.ts} lần` : 'Đi thẳng'}</td>
                <td className="text-right">{x.price != null ? <>{usd(x.price)} <span className="chip chip-real">Giá thật</span>{x.price === cheapest && priced.length > 1 && <span className="chip chip-sky ml-1">Rẻ nhất</span>}</> : <span className="text-mute">ước tính chung</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {routings.map((e) => {
        const c = findCarrier(e.carrier);
        const stale = daysSince(e.fetchedAt) > SCHEDULE_STALE_DAYS;
        const on = scheduleId === e.id;
        return (
          <div key={e.id} className={`rounded-lg border p-2.5 ${on ? 'border-gold bg-gold/5' : 'border-line bg-well'}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-fg">{c?.name} · {e.service || 'Dịch vụ ?'} <span className="font-normal text-mute">· {e.vessel} {e.voyage}</span></div>
                <div className="text-[11px] text-mute">
                  {fmtDateVi(e.etd)} → {fmtDateVi(e.eta)} · <b className="text-fg">{dd(e.etd, e.eta)} ngày</b> · {e.transshipments.length ? `chuyển tải ${e.transshipments.map((t) => PORT_BY_CODE[t.port]?.name ?? t.port).join(', ')}` : 'đi thẳng'}
                  {e.freeDays != null && ` · miễn lưu ${e.freeDays} ngày`}
                </div>
                <div className="text-[10.5px] text-mute">Nguồn: {e.source || '—'} · lấy ngày {fmtDateVi(e.fetchedAt)} {stale && <span className="chip chip-warn">quá {SCHEDULE_STALE_DAYS} ngày chưa làm mới</span>}</div>
              </div>
              <button className={`btn shrink-0 ${on ? 'btn-on' : ''}`} onClick={() => pick(e)}>{on ? '✓ Đang chọn' : 'Chọn lộ trình'}</button>
            </div>
            {on && <div className="mt-2.5"><Timeline plan={plan} r={r} e={e} /></div>}
          </div>
        );
      })}
      {sel && <p className="text-[11px] text-emerald-300">Bản đồ đang vẽ đúng các chặng của lộ trình này; thanh “Ngày X / Y” dùng ngày thật của lịch.</p>}
      <div>
        <div className="mb-1 text-[10.5px] font-bold tracking-wide text-mute uppercase">Hãng chưa có lịch cho tuyến này</div>
        <ul className="space-y-1">
          {carriers.filter((c) => !withData.has(c.id)).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-line/60 px-2 py-1 text-[11.5px] text-mute opacity-80">
              <span>Chưa có lịch tàu của <b className="text-fg">{c.name}</b> cho tuyến này</span>
              <span className="flex shrink-0 gap-1.5">
                <button className="text-sky underline" onClick={() => set({ page: 'schedules' })}>Nhập lịch</button>
                <a href={c.scheduleUrl} target="_blank" rel="noreferrer">Trang của hãng ↗</a>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-[10.5px] text-mute">PortRank không tự sinh lịch tàu. Khi chưa có lịch, thời gian được ước tính theo quãng đường và ghi nhãn “Ước tính”.</p>
      </div>
    </div>
  );
}

/** Ngăn chi tiết trượt ra bên phải bản đồ */
export default function DetailDrawer() {
  const open = useAppStore((s) => s.detailOpen);
  const tab = useAppStore((s) => s.detailTab);
  const plan = useAppStore((s) => s.plan);
  const set = useAppStore((s) => s.set);
  const r = useCurrent();
  useEffect(() => {
    if (r && r.option.mode !== 'sea' && tab === 'schedule') set({ detailTab: 'cost' });
  }, [r, tab, set]);
  if (!open || !plan || !r) return null;
  return (
    <div className="absolute top-2 right-2 bottom-2 z-30 flex w-[min(480px,calc(100%-16px))] flex-col rounded-xl border border-line bg-panel/97 shadow-2xl backdrop-blur">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {TABS.filter((t) => t.tab !== 'schedule' || r.option.mode === 'sea').map((t) => (
            <button key={t.tab} onClick={() => set({ detailTab: t.tab })} className={`rounded-md px-2 py-1 text-[11.5px] font-medium whitespace-nowrap ${tab === t.tab ? 'bg-gold/20 text-amber-200' : 'text-mute hover:text-fg'}`}>{t.label}</button>
          ))}
        </div>
        <button className="btn !px-2 !py-0.5" onClick={() => set({ detailOpen: false })}>✕</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'cost' && <CostTable plan={plan} r={r} />}
        {tab === 'duty' && <DutyPanel plan={plan} r={r} />}
        {tab === 'rules' && <Conditions plan={plan} r={r} />}
        {tab === 'history' && <PriceHistory r={r} />}
        {tab === 'schedule' && <SchedulePanel plan={plan} r={r} />}
      </div>
    </div>
  );
}
