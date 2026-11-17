import { getPort } from '../data/ports';
import type { FormState } from '../store/useAppStore';

/** Validate before routing or quoting; HTML input limits alone do not block clicks. */
export function validateShipment(form: FormState): string | null {
  if (!getPort(form.pol) || !getPort(form.pod)) return 'Vui lòng chọn cảng đi và cảng đến.';
  if (form.pol === form.pod) return 'Cảng đi và cảng đến phải khác nhau.';
  if (form.mode === 'FCL' && (!Number.isInteger(form.quantity) || form.quantity < 1 || form.quantity > 500))
    return 'Số container phải là số nguyên từ 1 đến 500.';
  if (form.mode === 'LCL') {
    if (!Number.isFinite(form.cbm) || form.cbm < 0.1) return 'Thể tích hàng phải từ 0,1 CBM trở lên.';
    if (!Number.isFinite(form.weightKg) || form.weightKg < 1) return 'Trọng lượng hàng phải từ 1 kg trở lên.';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.readyDate)) return 'Vui lòng nhập ngày hàng sẵn sàng hợp lệ.';
  const date = new Date(`${form.readyDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== form.readyDate)
    return 'Vui lòng nhập ngày hàng sẵn sàng hợp lệ.';
  return null;
}
