import { INCOTERMS, STATIONS } from '../config/incoterms';
import type { Incoterm, TransportMode } from '../types';

export const SELLER_COLOR = '#fbbf24';
export const BUYER_COLOR = '#3f6ad8';

/** Hình vẽ đơn giản cho các trạm – thiết kế riêng của PortRank */
function Glyph({ icon, x, y, lit }: { icon: string; x: number; y: number; lit: boolean }) {
  // màu lấy từ biến CSS (đổi theo giao diện sáng / tối) – dùng style vì thuộc tính SVG không hiểu var()
  const c = lit ? 'var(--color-fg)' : 'var(--color-diagram-dim)';
  const s = { style: { fill: 'none', stroke: c }, strokeWidth: 1.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  const g = (children: React.ReactNode) => <g transform={`translate(${x - 12},${y - 12})`} style={{ transition: 'opacity .3s' }}>{children}</g>;
  switch (icon) {
    case 'factory':
      return g(<><path d="M2 22V11l6 4v-4l6 4V6h6v16z" {...s} /><path d="M6 18h3M12 18h3" {...s} /></>);
    case 'warehouse':
      return g(<><path d="M2 22V10l10-6 10 6v12z" {...s} /><path d="M7 22v-7h10v7M7 18h10" {...s} /></>);
    case 'crane':
      return g(<><path d="M5 22V6h14M8 22V6M5 6l3-4 11 4M16 6v6" {...s} /><rect x="13.5" y="12" width="5" height="3.5" {...s} /><path d="M2 22h14" {...s} /></>);
    case 'ship':
      return g(<><path d="M2 15h20l-3 6H5z" {...s} /><path d="M6 15v-5h5v5M11 15V8h5v7M16 15v-3h3v3" {...s} /></>);
    case 'yard':
      return g(<><rect x="3" y="14" width="8" height="5" {...s} /><rect x="13" y="14" width="8" height="5" {...s} /><rect x="8" y="8" width="8" height="5" {...s} /><path d="M2 22h20" {...s} /></>);
    case 'gate':
      return g(<><path d="M4 22V8M20 22V8M4 8h16M4 12h16" {...s} /><path d="M7 22v-5h10" {...s} strokeDasharray="2 2" /></>);
    default:
      return null;
  }
}

function Truck({ x, y, lit }: { x: number; y: number; lit: boolean }) {
  const c = lit ? 'var(--color-diagram-label)' : 'var(--color-diagram-dim)';
  return (
    <g transform={`translate(${x - 8},${y - 6})`} style={{ fill: 'none', stroke: c }} strokeWidth={1.3} strokeLinejoin="round">
      <path d="M0 9V2h9v7M9 4h4l3 3v2H9" />
      <circle cx="4" cy="10" r="1.6" style={{ fill: c, stroke: 'none' }} /><circle cx="12.5" cy="10" r="1.6" style={{ fill: c, stroke: 'none' }} />
    </g>
  );
}

function Flag({ x, y, show, drop }: { x: number; y: number; show: boolean; drop: boolean }) {
  return (
    <g style={{ transform: `translate(${x}px, ${show ? y : y - 26}px)`, opacity: show ? 1 : 0, transition: drop ? 'transform .45s cubic-bezier(.3,1.6,.5,1), opacity .2s' : 'transform .5s ease, opacity .2s' }}>
      <path d="M0 0V-17" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M0.8 -17h10l-2.6 3.4 2.6 3.4h-10z" fill="#f43f5e" stroke="#fff" strokeWidth={0.8} />
      <circle r={2.4} fill="#f43f5e" stroke="#fff" strokeWidth={1} />
    </g>
  );
}

interface Props {
  term: Incoterm;
  mode: TransportMode;
  /** Thời điểm hoạt ảnh (giây). Bỏ trống = hình tĩnh ở trạng thái cuối */
  t?: number;
  compact?: boolean;
}

export const EXPLAINER_SECONDS = 15;

/** Vị trí kiện hàng (0–100% chuỗi) theo thời gian hoạt ảnh */
export const cargoAt = (t: number) => Math.max(0, Math.min(100, ((t - 0.6) / 6.4) * 100));

/**
 * Sơ đồ một điều kiện Incoterms® 2020: chuỗi vận tải 5 trạm, thanh Chi phí, thanh Rủi ro có cờ, thanh Bảo hiểm (CIF, CIP).
 * Sinh hoàn toàn từ dữ liệu trong config/incoterms.ts. Thiết kế riêng của PortRank.
 */
export default function IncotermDiagram({ term, mode, t, compact }: Props) {
  const def = INCOTERMS[term];
  const stations = STATIONS[mode];
  const W = 520, L = 64, R = 14;
  const X = (p: number) => L + (p / 100) * (W - L - R);
  const anim = t !== undefined;
  const pos = anim ? cargoAt(t!) : 100;
  const costFill = Math.min(def.costAt, pos);
  const riskFill = Math.min(def.riskAt, pos);
  const buyerShown = anim ? pos >= 100 || t! > 7.2 : true;
  const flagShown = anim ? pos >= Math.max(def.riskAt, 1) : true;
  const hasIns = def.insurance.by === 'seller';
  const insShown = anim ? t! > 9.3 : true;
  const chainY = 22, barY = 62, barH = 13, gap = 25;
  const riskY = barY + gap, insY = riskY + gap;
  const H = (hasIns ? insY : riskY) + barH + (compact ? 6 : 8);
  const barBg = 'var(--color-diagram-track)';
  const Bar = ({ y, label, cut, fill, showBuyer }: { y: number; label: string; cut: number; fill: number; showBuyer: boolean }) => (
    <g>
      <text x={L - 8} y={y + barH - 3} textAnchor="end" fontSize={10.5} style={{ fill: 'var(--color-diagram-axis)' }} fontWeight={500}>{label}</text>
      <rect x={X(0)} y={y} width={X(100) - X(0)} height={barH} rx={barH / 2} style={{ fill: barBg }} />
      {showBuyer && cut < 100 && <rect x={X(cut)} y={y} width={X(100) - X(cut)} height={barH} rx={barH / 2} fill={BUYER_COLOR} />}
      {fill > 0 && <rect x={X(0)} y={y} width={Math.max(barH, X(fill) - X(0))} height={barH} rx={barH / 2} fill={SELLER_COLOR} />}
      {fill > 0 && fill < 100 && showBuyer && <rect x={X(fill) - 1} y={y - 2} width={2} height={barH + 4} style={{ fill: 'var(--color-panel)' }} />}
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Sơ đồ ${term}: người bán trả chi phí đến ${def.costAt}% chuỗi, rủi ro chuyển tại ${def.riskAt}%`}>
      {/* Chuỗi vận tải */}
      <line x1={X(0)} y1={chainY} x2={X(100)} y2={chainY} style={{ stroke: 'var(--color-diagram-dash)' }} strokeWidth={2} strokeDasharray="3 4" />
      {anim && <line x1={X(0)} y1={chainY} x2={X(pos)} y2={chainY} style={{ stroke: 'var(--color-diagram-lit)' }} strokeWidth={2} />}
      {[15, 39, 63, 86].map((p, i) => (i === 0 || i === 3 ? <Truck key={p} x={X(p)} y={chainY - 9} lit={!anim || pos >= p} /> : null))}
      {stations.map((s, i) => {
        const lit = !anim || pos >= s.at - 3;
        return (
          <g key={i}>
            <circle cx={X(s.at)} cy={chainY} r={14} style={{ fill: 'var(--color-diagram-node)', stroke: lit ? 'var(--color-diagram-lit)' : 'var(--color-diagram-dash)' }} strokeWidth={1.4} />
            <Glyph icon={s.icon} x={X(s.at)} y={chainY} lit={lit} />
            <text x={Math.max(X(0) + 2, Math.min(X(100) - 2, X(s.at)))} y={chainY + 27} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'} dx={i === 0 ? -12 : i === 4 ? 12 : 0} fontSize={9.5} style={{ fill: lit ? 'var(--color-diagram-label)' : 'var(--color-diagram-dim)' }}>{s.label}</text>
          </g>
        );
      })}
      {/* Kiện hàng chạy */}
      {anim && pos < 100 && (
        <g transform={`translate(${X(pos) - 6},${chainY - 26})`}>
          <rect width={12} height={9} rx={1.5} fill="#f97316" stroke="#fff" strokeWidth={0.8} />
          <path d="M4 0v9M8 0v9" stroke="#fff" strokeWidth={0.5} opacity={0.7} />
        </g>
      )}
      <Bar y={barY} label="Chi phí" cut={def.costAt} fill={costFill} showBuyer={buyerShown} />
      <Bar y={riskY} label="Rủi ro" cut={def.riskAt} fill={riskFill} showBuyer={buyerShown} />
      <Flag x={X(Math.max(def.riskAt, 1.5))} y={riskY + 1} show={flagShown} drop={anim} />
      {hasIns && (
        <g style={{ opacity: insShown ? 1 : 0.15, transition: 'opacity .4s' }}>
          <text x={L - 8} y={insY + barH - 3} textAnchor="end" fontSize={10.5} style={{ fill: 'var(--color-diagram-axis)' }} fontWeight={500}>Bảo hiểm</text>
          <rect x={X(0)} y={insY} width={X(100) - X(0)} height={barH} rx={barH / 2} style={{ fill: barBg }} />
          <rect x={X(def.riskAt)} y={insY} width={X(def.costAt) - X(def.riskAt)} height={barH} rx={barH / 2} fill={SELLER_COLOR} opacity={0.85} />
          <text x={(X(def.riskAt) + X(def.costAt)) / 2} y={insY + barH - 3.2} textAnchor="middle" fontSize={8.5} fill="#1c1917" fontWeight={700}>{term === 'CIF' ? 'TỐI THIỂU · ICC C' : 'CAO NHẤT · ICC A'}</text>
        </g>
      )}
    </svg>
  );
}

export function IncotermLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-mute">
      <span className="flex items-center gap-1"><i className="inline-block h-2 w-4 rounded-full" style={{ background: SELLER_COLOR }} /> Người bán</span>
      <span className="flex items-center gap-1"><i className="inline-block h-2 w-4 rounded-full" style={{ background: BUYER_COLOR }} /> Người mua</span>
      <span className="flex items-center gap-1"><svg width="10" height="12" viewBox="-2 -19 14 22"><path d="M0 0V-17" stroke="#fff" strokeWidth={1.6} /><path d="M0.8 -17h10l-2.6 3.4 2.6 3.4h-10z" fill="#f43f5e" /></svg> Điểm chuyển rủi ro</span>
    </div>
  );
}
