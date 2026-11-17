import { INCOTERMS } from '../config/incoterms';
import { useCurrent, useRanked } from '../lib/actions';
import { fmtDays, fmtKm, fmtNm, usd } from '../lib/format';
import { sellerShare } from '../lib/incoterm';
import type { Plan } from '../lib/plan';
import type { RankedOption } from '../lib/ranking';
import { useAppStore, type DetailTab } from '../store/useAppStore';
import IncotermCard, { placeNamesOf } from './IncotermCard';

const rankCls = (rank: number) => (rank === 1 ? 'bg-gold text-slate-900 shadow-[0_0_10px_rgba(251,191,36,.7)]' : rank <= 3 ? 'bg-sky/80 text-slate-900' : 'bg-slate-600 text-white');

function Big({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-well px-2.5 py-2">
      <div className="text-[10.5px] font-medium text-mute">{label}</div>
      <div className={`text-[19px] leading-tight font-bold ${tone ?? 'text-fg'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] leading-snug text-mute">{sub}</div>}
    </div>
  );
}

/** Văn bản báo giá để copy */
export function quoteText(plan: Plan, r: RankedOption, term: string): string {
  const o = r.option, i = plan.input;
  const cargo = i.shipment.mode === 'FCL' ? `${i.shipment.quantity} × ${i.shipment.container}` : `LCL ${i.shipment.cbm} CBM / ${i.shipment.weightKg} kg`;
  const lines = [
    `PORTRANK – PHƯƠNG ÁN #${r.rank} (${plan.scopeShort})`,
    `Tuyến: ${plan.seller.label} → ${plan.buyer.label}`,
    `${o.mode === 'sea' ? 'Đường biển' : 'Đường bộ'}: ${o.title}${o.route ? ` · ${fmtNm(o.route.distanceNm)}` : o.roadKm ? ` · ${fmtKm(o.roadKm)}` : ''}`,
    `Hàng: ${cargo}${i.hs ? ` · HS ${i.hs}` : ''}${i.goodsValue ? ` · trị giá ${usd(i.goodsValue)} (${i.valueTerm})` : ''}`,
    `Điều kiện: ${term} – ${INCOTERMS[term as keyof typeof INCOTERMS].nameVi}`,
    `Thời gian: ${fmtDays(o.days.total)}${o.rate ? '' : ' (ước tính)'}`,
    `Bạn trả: ${usd(r.youPay)} · Bên kia trả: ${usd(r.otherPays)} · Tổng 10 khoản: ${usd(o.total)} (khoảng ${usd(o.low)} – ${usd(o.high)})`,
    `Thuế NK + VAT: ${o.duty.status === 'ok' ? `${usd(o.duty.total)} (nguồn: ${o.duty.entry!.source}, cập nhật ${o.duty.entry!.updatedAt})` : 'chưa có dữ liệu'}`,
    `Giá cước: ${o.rate ? o.rate.label : 'ƯỚC TÍNH theo mô hình PortRank – không phải giá thị trường'}`,
    'Số thuế là ước tính để lập kế hoạch; số chính thức do cơ quan hải quan xác định.',
  ];
  return lines.join('\n');
}

function Overview({ plan, r }: { plan: Plan; r: RankedOption }) {
  const term = useAppStore((s) => s.form.term);
  const destBySeller = useAppStore((s) => s.destChargesBySeller);
  const showToast = useAppStore((s) => s.showToast);
  const savePlan = useAppStore((s) => s.savePlan);
  const form = useAppStore((s) => s.form);
  const set = useAppStore((s) => s.set);
  const o = r.option, role = plan.input.role;
  const hasValue = plan.input.goodsValue > 0;
  const priceAtTerm = o.value.exw + o.items.reduce((s, it) => s + (it.amount ?? 0) * sellerShare(term, it.n, { destChargesBySeller: destBySeller }), 0);
  const landed = o.value.exw + o.total;
  const d = o.days;
  const duty = o.duty;
  return (
    <div className="flex h-full flex-col">
      <div className="mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold ${rankCls(r.rank)}`}>#{r.rank}</span>
          <span className="truncate text-[13px] font-semibold text-fg" title={o.title}>{o.title}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10.5px] text-mute">
          <span>{plan.scopeTitle}</span>
          {o.rate ? <span className="chip chip-real" title={o.rate.label}>Giá thật</span> : <span className="chip chip-est">Ước tính ±12%</span>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Big label={`Bạn trả (${role === 'seller' ? 'người bán' : 'người mua'})`} tone="text-amber-300" value={usd(r.youPay)} sub={<>logistics + thuế · bên kia trả {usd(r.otherPays)}</>} />
        <Big
          label="Tổng về đến kho"
          value={usd(hasValue ? landed : o.total)}
          sub={hasValue ? <>giá hàng {term} ≈ {usd(priceAtTerm)} + phần người mua trả</> : <>chưa gồm giá hàng · {usd(o.low)}–{usd(o.high)}</>}
        />
        <Big
          label="Thời gian"
          value={fmtDays(d.total)}
          sub={o.mode === 'sea' ? <>{d.inlandO + d.inlandD > 0 ? `nội địa ${d.inlandO + d.inlandD} + ` : ''}chờ tàu {d.wait} + biển {d.main.toFixed(1)} + làm hàng {d.handling}</> : <>xe {d.main.toFixed(1)} + cửa khẩu {d.handling}</>}
        />
        <Big
          label="Thuế và VAT"
          tone={duty.status === 'ok' ? 'text-fg' : 'text-mute'}
          value={duty.status === 'ok' ? usd(duty.total) : duty.status === 'domestic' ? '—' : <span className="text-[13px]">Chưa có dữ liệu</span>}
          sub={
            duty.status === 'ok' ? (
              <>NK {duty.entry!.dutyPct}%{duty.vatMissing ? '' : ` · VAT ${duty.entry!.vatPct}%`} · {duty.entry!.verified ? 'đã xác minh' : 'chưa xác minh'}</>
            ) : duty.status === 'no-value' ? (
              <>nhập mã HS và giá trị hàng</>
            ) : duty.status === 'domestic' ? (
              <>nội địa</>
            ) : (
              <button className="text-sky underline" onClick={() => set({ detailTab: 'duty', detailOpen: true })}>Nhập thuế suất</button>
            )
          }
        />
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <button className="btn flex-1 !text-[11px]" onClick={() => navigator.clipboard.writeText(quoteText(plan, r, term)).then(() => showToast('Đã copy báo giá'), () => showToast('Không copy được'))}>📋 Copy báo giá</button>
        <button
          className="btn flex-1 !text-[11px]"
          onClick={() => {
            savePlan({ form, optionKey: o.key, title: `${plan.seller.label} → ${plan.buyer.label}`, summary: `${o.title} · ${term}`, youPay: r.youPay, total: o.total, days: d.total });
            showToast('Đã lưu phương án');
          }}
        >
          💾 Lưu
        </button>
      </div>
      {plan.notes.length > 0 && <ul className="mt-1.5 space-y-0.5 text-[10px] leading-snug text-mute">{plan.notes.map((n, i) => <li key={i}>ℹ️ {n}</li>)}</ul>}
    </div>
  );
}

function Ranking({ ranked }: { ranked: RankedOption[] }) {
  const selectedKey = useAppStore((s) => s.selectedKey);
  const hoverKey = useAppStore((s) => s.hoverKey);
  const basis = useAppStore((s) => s.costBasis);
  const set = useAppStore((s) => s.set);
  const select = useAppStore((s) => s.select);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-fg">Xếp hạng tuyến <span className="font-normal text-mute">({ranked.length})</span></span>
        <div className="flex overflow-hidden rounded-md border border-line text-[10.5px]">
          <button className={`px-1.5 py-0.5 ${basis === 'mine' ? 'bg-gold/20 text-amber-200' : 'text-mute'}`} onClick={() => set({ costBasis: 'mine' })} title="Xếp theo phần bạn phải trả theo Incoterm đang chọn">Phần tôi trả</button>
          <button className={`px-1.5 py-0.5 ${basis === 'total' ? 'bg-gold/20 text-amber-200' : 'text-mute'}`} onClick={() => set({ costBasis: 'total' })}>Tổng</button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {ranked.map((r) => {
          const o = r.option;
          const on = selectedKey === o.key, hov = hoverKey === o.key;
          return (
            <button
              key={o.key}
              data-rank-row={r.rank}
              onMouseEnter={() => set({ hoverKey: o.key })}
              onMouseLeave={() => set({ hoverKey: null })}
              onClick={() => select(on ? null : o.key)}
              className={`block w-full rounded-lg border px-2 py-1.5 text-left transition ${on ? 'border-gold bg-gold/10' : hov ? 'border-sky/60 bg-sky/5' : 'border-line bg-well hover:border-line-strong'}`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${rankCls(r.rank)}`}>{r.rank}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-fg">{o.title}</span>
                <span className="text-[12px] font-semibold text-amber-200">{usd(basis === 'mine' ? r.youPay : o.total)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-6 text-[10.5px] text-mute">
                <span>{fmtDays(o.days.total)}</span>
                <span>tổng {usd(o.total)}</span>
                <span>điểm {r.score.toFixed(0)}</span>
                {o.rate ? <span className="chip chip-real">Giá thật</span> : <span className="chip chip-est">Ước tính</span>}
                {r.tags.map((t) => <span key={t} className="chip chip-sky">{t}</span>)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const DETAILS: { tab: DetailTab; icon: string; label: string; seaOnly?: boolean }[] = [
  { tab: 'cost', icon: '📋', label: 'Bảng chi phí' },
  { tab: 'duty', icon: '🧾', label: 'Thuế nhập khẩu' },
  { tab: 'rules', icon: '✅', label: 'Điều kiện, chứng từ' },
  { tab: 'history', icon: '📈', label: 'Biến động giá' },
  { tab: 'schedule', icon: '🚢', label: 'Hãng tàu & lộ trình', seaOnly: true },
];

function Details({ mode }: { mode: 'sea' | 'road' }) {
  const set = useAppStore((s) => s.set);
  const tab = useAppStore((s) => s.detailTab);
  const open = useAppStore((s) => s.detailOpen);
  return (
    <div className="flex h-full flex-col">
      <div className="mb-1.5 text-[12px] font-semibold text-fg">Xem chi tiết</div>
      <div className="space-y-1.5">
        {DETAILS.filter((d) => !d.seaOnly || mode === 'sea').map((d) => (
          <button key={d.tab} className={`btn w-full !justify-start !gap-1.5 !px-2 !py-1.5 !text-[11.5px] !whitespace-normal !text-left ${open && tab === d.tab ? 'btn-on' : ''}`} onClick={() => set({ detailTab: d.tab, detailOpen: !(open && tab === d.tab) })}>
            <span>{d.icon}</span> {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Bảng kết quả nằm ngang – 4 phần, trái sang phải: Tổng quan | Sơ đồ Incoterm | Xếp hạng tuyến | Xem chi tiết */
export default function ResultPanel() {
  const plan = useAppStore((s) => s.plan);
  const ranked = useRanked();
  const cur = useCurrent();
  const sec = 'card shrink-0 p-2.5 max-[899px]:w-full max-[899px]:!h-auto';
  return (
    <div className="flex h-full gap-2.5 overflow-x-auto p-2.5 max-[899px]:h-auto max-[899px]:flex-col max-[899px]:overflow-visible">
      {plan && cur ? (
        <section className={`${sec} w-[236px] overflow-y-auto`}><Overview plan={plan} r={cur} /></section>
      ) : (
        <section className={`${sec} flex w-[236px] flex-col justify-center text-center text-[12px] leading-relaxed text-mute`}>
          <div className="text-2xl">🧭</div>
          Nhập <b className="text-fg">bên tôi</b> và <b className="text-fg">bên đối tác</b> (quốc gia hoặc địa chỉ) rồi bấm <b className="text-amber-200">Tìm tuyến tối ưu</b>.
          <div className="mt-1 text-[10.5px]">Mọi con số giá là ước tính, trừ khi bạn đã nhập bảng giá thật.</div>
        </section>
      )}
      <section className={`${sec} min-w-[350px] flex-1 overflow-y-auto max-[899px]:min-w-0`}>
        <IncotermCard plan={plan} option={cur?.option ?? null} />
      </section>
      {plan && cur && (
        <>
          <section className={`${sec} w-[264px] max-[899px]:max-h-[320px]`}><Ranking ranked={ranked} /></section>
          <section className={`${sec} w-[150px]`}><Details mode={cur.option.mode} /></section>
        </>
      )}
    </div>
  );
}

export { placeNamesOf };
