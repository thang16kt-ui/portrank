import { COST_ITEMS, GROUP_C, INCOTERMS } from '../config/incoterms';
import { namedPlace, riskTransferText, sellerShare, type PlaceNames } from '../lib/incoterm';
import { usd } from '../lib/format';
import type { Plan, PlanOption } from '../lib/plan';
import { useAppStore } from '../store/useAppStore';
import type { Incoterm, Role, TransportMode } from '../types';
import IncotermDiagram, { BUYER_COLOR, IncotermLegend, SELLER_COLOR } from './IncotermDiagram';

/** Tên địa điểm thật của tuyến đang chọn (để chèn vào sơ đồ) */
export function placeNamesOf(plan: Plan | null, o: PlanOption | null): PlaceNames | undefined {
  if (!plan || !o) return undefined;
  const short = (s: string) => s.split(',')[0].split(' (')[0];
  const firstGate = o.gates?.[0]?.name.split(' – ')[0], lastGate = o.gates?.[o.gates.length - 1]?.name.split(' – ')[0];
  return {
    origin: short(plan.seller.label),
    portO: o.mode === 'sea' ? short(o.pol?.name ?? '') : firstGate ?? '',
    portD: o.mode === 'sea' ? short(o.pod?.name ?? '') : short(plan.buyer.label) || lastGate || '',
    dest: plan.buyer.kind === 'address' ? short(plan.buyer.label) : o.mode === 'sea' ? short(o.pod?.name ?? plan.buyer.label) : short(plan.buyer.label),
  };
}

const who = (p: 'seller' | 'buyer') => (
  <b style={{ color: p === 'seller' ? SELLER_COLOR : '#8fb0ff' }}>{p === 'seller' ? 'Người bán' : 'Người mua'}</b>
);

/** Vị trí cờ rủi ro trên dải 10 ô (đơn vị: số ô, 0..10) */
export function riskCellPos(term: Incoterm): number {
  const at = INCOTERMS[term].riskAt;
  let pos = 0;
  for (const c of COST_ITEMS) {
    if (!c.span) continue;
    const [a, b] = c.span;
    if (at >= b) pos = c.n;
    else {
      if (at > a) pos = c.n - 1 + (at - a) / (b - a);
      break;
    }
  }
  return pos;
}

/** Dải 10 ô "Ai trả khoản nào" – 2 màu người bán / người mua, cờ đánh dấu điểm chuyển rủi ro, chuyển động mượt khi đổi điều kiện */
export function IncotermStrip({ term, mode, option, role, destBySeller }: { term: Incoterm; mode: TransportMode; option: PlanOption | null; role: Role; destBySeller: boolean }) {
  const pos = riskCellPos(term);
  return (
    <div>
      <div className="relative pt-4">
        <div className="absolute top-0 z-10 -translate-x-1/2 transition-[left] duration-500 ease-out" style={{ left: `${Math.max(1, pos * 10)}%` }} title="Điểm chuyển rủi ro">
          <svg width="14" height="20" viewBox="-2 -19 15 23"><path d="M0 2V-17" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" /><path d="M0.8 -17h10l-2.6 3.4 2.6 3.4h-10z" fill="#f43f5e" stroke="#fff" strokeWidth={0.8} /></svg>
        </div>
        <div className="grid grid-cols-10 gap-[3px]">
          {COST_ITEMS.map((c) => {
            const sh = sellerShare(term, c.n, { destChargesBySeller: destBySeller });
            const it = option?.items[c.n - 1];
            const mineShare = role === 'seller' ? sh : 1 - sh;
            const bg = sh === 1 ? SELLER_COLOR : sh === 0 ? BUYER_COLOR : `linear-gradient(90deg, ${SELLER_COLOR} ${sh * 100}%, ${BUYER_COLOR} ${sh * 100}%)`;
            return (
              <div
                key={c.n}
                title={`${c.n}. ${c.label[mode]} – ${sh === 1 ? 'người bán trả' : sh === 0 ? 'người mua trả' : 'hai bên chia'}${it ? ` · ${it.amount == null ? 'chưa tính' : usd(it.amount)}` : ''}`}
                className="flex min-w-0 flex-col items-center rounded-md px-0.5 py-1 text-center transition-[background] duration-500"
                style={{ background: bg, color: sh >= 0.5 ? '#1c1917' : '#fff', outline: mineShare > 0 ? '1.5px solid rgba(255,255,255,.55)' : 'none', outlineOffset: -1.5 }}
              >
                <span className="text-[10px] leading-none font-bold">{c.n}</span>
                <span className="mt-0.5 w-full truncate text-[8.5px] leading-tight font-medium">{c.short[mode]}</span>
                {it && <span className="w-full truncate text-[8.5px] leading-tight opacity-85">{it.amount == null ? '—' : usd(it.amount)}</span>}
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-1 text-[10px] text-mute">Ô có viền trắng = khoản <b className="text-fg">bạn</b> trả. {GROUP_C.includes(term) && 'Phí cảng đến (khoản 7) ở nhóm C phụ thuộc hợp đồng vận tải – mặc định tính cho người mua (đổi trong Bảng chi phí).'}</p>
    </div>
  );
}

/** Thẻ sơ đồ: toàn bộ phần hiển thị của Incoterm nằm ở bảng kết quả (không nằm trong bảng dọc) */
export default function IncotermCard({ plan, option }: { plan: Plan | null; option: PlanOption | null }) {
  const term = useAppStore((s) => s.form.term);
  const mode = useAppStore((s) => s.form.mode);
  const role = useAppStore((s) => s.form.role);
  const destBySeller = useAppStore((s) => s.destChargesBySeller);
  const set = useAppStore((s) => s.set);
  const def = INCOTERMS[term];
  const names = placeNamesOf(plan, option);
  const place = names ? namedPlace(term, names) : '';
  const placeKind = def.place === 'origin' || def.place === 'pol' ? 'địa điểm giao hàng' : 'nơi đến';
  const curMode = option?.mode ?? mode;
  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-xl leading-none font-bold text-amber-300">{term}</span>
            <span className="truncate text-[13px] font-semibold text-fg">{place}</span>
          </div>
          <div className="text-[11px] text-mute">{def.nameVi} <span className="opacity-70">· ({placeKind})</span></div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button className="btn !px-2 !py-1 !text-[11px]" onClick={() => set({ explainerOpen: true })}>▶ Xem giải thích</button>
          <button className="btn !px-2 !py-1 !text-[11px]" onClick={() => set({ allTermsOpen: true })} title="So sánh các điều kiện">⊞ So sánh</button>
        </div>
      </div>
      <div className="mt-1.5 rounded-lg border border-line bg-[#0a1120] px-2 pt-2 pb-1">
        <IncotermDiagram term={term} mode={curMode} />
        <IncotermLegend />
      </div>
      <dl className="mt-2 space-y-1 text-[11.5px] leading-snug">
        <div className="flex gap-2"><dt className="w-[122px] shrink-0 text-mute">Thông quan xuất</dt><dd>{who(def.exportClearance)}</dd></div>
        <div className="flex gap-2">
          <dt className="w-[122px] shrink-0 text-mute">Bảo hiểm</dt>
          <dd>{def.insurance.by === 'seller' ? <>{who('seller')} mua – {def.insurance.level}</> : <span className="text-fg">Không bắt buộc – bên chịu rủi ro tự quyết định</span>}</dd>
        </div>
        <div className="flex gap-2"><dt className="w-[122px] shrink-0 text-mute">Thông quan nhập, thuế</dt><dd>{who(def.importClearance)}</dd></div>
        <div className="rounded-md border border-rose-400/25 bg-rose-500/5 px-2 py-1.5">
          <dt className="flex items-center gap-1.5 font-semibold text-rose-200">
            <svg width="11" height="14" viewBox="-2 -19 15 23"><path d="M0 2V-17" stroke="#fff" strokeWidth={1.8} /><path d="M0.8 -17h10l-2.6 3.4 2.6 3.4h-10z" fill="#f43f5e" /></svg>
            Rủi ro chuyển giao khi nào
          </dt>
          <dd className="mt-0.5 text-fg">{riskTransferText(term, curMode, names)}</dd>
          <dd className="mt-0.5 text-[10.5px] text-mute">Từ thời điểm này, hàng hư hỏng hoặc mất mát do người mua chịu.</dd>
          {GROUP_C.includes(term) && <dd className="mt-0.5 text-[10.5px] text-amber-200">⚠️ Điểm chuyển rủi ro sớm hơn điểm người bán hết trả cước.</dd>}
        </div>
        <p className="text-fg">{def.summary}</p>
      </dl>
      <div className="mt-2">
        <div className="mb-0.5 text-[11px] font-semibold text-mute">Ai trả khoản nào</div>
        <IncotermStrip term={term} mode={curMode} option={option} role={role} destBySeller={destBySeller} />
      </div>
      <p className="mt-1 text-[9.5px] text-mute/80">Theo Incoterms® 2020 của ICC. Sơ đồ do PortRank tự thiết kế để minh họa; khi ký hợp đồng hãy đối chiếu văn bản gốc của ICC.</p>
    </div>
  );
}
