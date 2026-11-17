import { PORT_BY_CODE } from '../data/ports';
import { useRanked } from '../lib/actions';
import { daysSince, fmtDateVi } from '../lib/csv';
import { flag, fmtKm, usd } from '../lib/format';
import { PORT_FIELDS, PORT_GROUPS, PORT_STALE_DAYS, portInfoOf } from '../lib/portInfo';
import { useAppStore } from '../store/useAppStore';
import { useDataStore } from '../store/useDataStore';

/**
 * Thẻ thông tin cảng. Dạng rút gọn khi bấm ghim cảng trên bản đồ 2D; dạng đầy đủ (6 nhóm) khi đang xem cảng 3D.
 * Mỗi số liệu kèm nguồn + ngày cập nhật; trường thiếu ghi "Chưa có dữ liệu" (không tự điền số ước đoán).
 */
export default function PortCard() {
  const code = useAppStore((s) => s.portCard);
  const portView = useAppStore((s) => s.portView);
  const plan = useAppStore((s) => s.plan);
  const set = useAppStore((s) => s.set);
  const select = useAppStore((s) => s.select);
  const user = useDataStore((s) => (code ? s.portInfo[code] : undefined));
  const ranked = useRanked();
  const port = code ? PORT_BY_CODE[code] : undefined;
  if (!port || !code) return null;
  const full = portView === code;
  const info = portInfoOf(port, user);
  const best = ranked.find((r) => r.option.pol?.code === code || r.option.pod?.code === code);
  const isPol = best?.option.pol?.code === code;
  const km = best ? (isPol ? best.option.originInlandKm : best.option.destInlandKm) : null;
  const inlandCost = best ? best.option.items[isPol ? 1 : 8].amount : null;
  const groups = full ? PORT_GROUPS : (['Nhận diện'] as const);
  return (
    <div className="pointer-events-auto absolute top-14 right-3 z-20 flex max-h-[calc(100%-70px)] w-[min(340px,calc(100%-24px))] flex-col rounded-xl border border-line bg-panel/97 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-fg">{flag(port.country)} {port.name}</div>
          <div className="text-[11px] text-mute">{port.code} · {port.countryName}</div>
        </div>
        <button className="btn !px-2 !py-0.5" onClick={() => set({ portCard: null })}>✕</button>
      </div>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        <div className="flex flex-wrap gap-1.5">
          {full ? (
            <button className="btn btn-on" onClick={() => set({ portView: null })}>← Thoát cảng 3D</button>
          ) : (
            <button className="btn btn-on" onClick={() => set({ portView: code, detailOpen: false, explainerOpen: false })}>🏗️ Xem cảng 3D</button>
          )}
          {best && !full && <button className="btn" onClick={() => select(best.option.key)}>Chọn tuyến tốt nhất qua cảng</button>}
          <button className="btn" onClick={() => set({ page: 'ports' })}>✎ Sửa dữ liệu</button>
        </div>
        {groups.map((g) => (
          <section key={g}>
            <h3 className="mb-1 text-[10px] font-bold tracking-wide text-mute uppercase">{g}</h3>
            <dl className="space-y-1">
              {PORT_FIELDS.filter((f) => f.group === g).map((f) => {
                const v = info[f.key];
                const stale = v && daysSince(v.updatedAt) > PORT_STALE_DAYS;
                return (
                  <div key={f.key} className="grid grid-cols-[118px_1fr] gap-2 text-[11.5px]">
                    <dt className="text-mute">{f.label}</dt>
                    <dd>
                      {v ? (
                        <>
                          <span className="text-fg">{v.value}</span>
                          <div className="text-[9.5px] leading-tight text-mute">
                            {v.source} · {fmtDateVi(v.updatedAt)} · <span className={v.verified ? 'text-emerald-300' : 'text-amber-200'}>{v.verified ? 'đã xác minh' : 'chưa xác minh'}</span>{stale && <span className="text-amber-200"> · quá {PORT_STALE_DAYS} ngày</span>}
                          </div>
                        </>
                      ) : (
                        <span className="text-mute/70 italic">Chưa có dữ liệu</span>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
        <section>
          <h3 className="mb-1 text-[10px] font-bold tracking-wide text-mute uppercase">Trong phương án của bạn</h3>
          {best && plan ? (
            <dl className="space-y-1 text-[11.5px]">
              <div className="grid grid-cols-[118px_1fr] gap-2"><dt className="text-mute">Tuyến tốt nhất</dt><dd className="text-fg">#{best.rank} · {best.option.title}</dd></div>
              <div className="grid grid-cols-[118px_1fr] gap-2"><dt className="text-mute">Chi phí</dt><dd className="text-fg">tổng {usd(best.option.total)} · bạn trả {usd(best.youPay)} <span className="chip chip-est">{best.option.rate ? 'có giá thật' : 'ước tính'}</span></dd></div>
              <div className="grid grid-cols-[118px_1fr] gap-2">
                <dt className="text-mute">Nội địa tới địa chỉ</dt>
                <dd className="text-fg">{km != null ? <>≈ {fmtKm(km)} · {inlandCost != null ? usd(inlandCost) : '—'} <span className="chip chip-est">ước tính</span></> : <span className="text-mute italic">Chưa tính · nhập địa chỉ để tính</span>}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-[11.5px] text-mute italic">Cảng này không nằm trong phương án hiện tại.</p>
          )}
        </section>
        {!full && <p className="text-[10.5px] text-mute">Bấm “Xem cảng 3D” để xem đủ 6 nhóm thông tin và bố cục bến bãi.</p>}
      </div>
    </div>
  );
}
