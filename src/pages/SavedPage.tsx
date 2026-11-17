import { runPlan } from '../lib/actions';
import { fmtDays, usd } from '../lib/format';
import { DEFAULT_FORM, useAppStore } from '../store/useAppStore';
import { PageShell } from './shared';

/** Phương án đã lưu (localStorage) */
export default function SavedPage() {
  const saved = useAppStore((s) => s.saved);
  const del = useAppStore((s) => s.deleteSaved);
  const open = async (id: string) => {
    const q = useAppStore.getState().saved.find((x) => x.id === id);
    if (!q) return;
    useAppStore.setState({ form: { ...DEFAULT_FORM, ...q.form }, page: 'plan' });
    await runPlan();
    useAppStore.getState().select(q.optionKey);
  };
  return (
    <PageShell title="Phương án đã lưu" intro="Các phương án bạn đã lưu trên trình duyệt này. Mở lại sẽ tính lại theo bảng giá, biểu thuế hiện tại.">
      <section className="card overflow-x-auto p-1">
        <table className="tbl">
          <thead><tr><th>Ngày lưu</th><th>Tuyến</th><th>Phương án</th><th className="!text-right">Bạn trả</th><th className="!text-right">Tổng 10 khoản</th><th>Thời gian</th><th /></tr></thead>
          <tbody>
            {saved.length === 0 && <tr><td colSpan={7} className="!py-6 text-center text-mute">Chưa có phương án nào. Bấm “💾 Lưu phương án” ở bảng kết quả.</td></tr>}
            {saved.map((q) => (
              <tr key={q.id}>
                <td className="whitespace-nowrap">{new Date(q.createdAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="text-fg">{q.title}</td>
                <td>{q.summary}</td>
                <td className="text-right font-semibold text-amber-200">{usd(q.youPay)}</td>
                <td className="text-right">{usd(q.total)}</td>
                <td>{fmtDays(q.days)}</td>
                <td className="text-right whitespace-nowrap">
                  <button className="mr-2 text-sky hover:underline" onClick={() => open(q.id)}>Mở lại</button>
                  <button className="text-mute hover:text-red-300" onClick={() => del(q.id)}>Xoá</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </PageShell>
  );
}
