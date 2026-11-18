import { customsBasisOf, type CustomsBasis } from '../data/customsBasis';
import type { TariffEntry } from '../providers/TariffProvider';
import { daysSince } from './csv';
import { specificDutyUsd, type DutyQty } from './specificDuty';

export const TARIFF_STALE_DAYS = 90;

export interface DutyResult {
  /** 'ok' có thuế suất; 'no-data' chưa có thuế suất cho HS + nước; 'no-value' chưa nhập giá trị hàng / mã HS; 'domestic' nội địa */
  status: 'ok' | 'no-data' | 'no-value' | 'domestic';
  basis: CustomsBasis & { country: string };
  customsValue: number;
  duty: number;
  other: number;
  /** Phí theo trị giá không chịu VAT (MPF/HMF…) */
  fees: number;
  /** Thuế bổ sung theo xuất xứ (chống bán phá giá…) – có chịu VAT */
  additional: number;
  /** Phần thuế tuyệt đối đã tính (USD, gồm điều chỉnh MIN/MAX) – nằm trong `duty` */
  specific: number;
  /** Diễn giải phần thuế tuyệt đối, hoặc lý do chưa tính */
  specificNote?: string;
  /** Có phần thuế tuyệt đối nhưng chưa tính được (thiếu số lượng / dạng đặc biệt) */
  specificPending: boolean;
  vat: number;
  /** duty + other + fees + vat */
  total: number;
  entry: TariffEntry | null;
  /** Cập nhật quá 90 ngày */
  stale: boolean;
  vatMissing: boolean;
}

/**
 * Thuế nhập khẩu = trị giá tính thuế × thuế suất.
 * VAT/GST = (trị giá tính thuế + thuế NK + thuế khác) × thuế suất VAT.
 * Phí theo trị giá (MPF/HMF của Mỹ) = trị giá tính thuế × feePct – không chịu VAT.
 * Thuế bổ sung (chống bán phá giá…) = trị giá tính thuế × additionalPct – có chịu VAT.
 * Phần thuế tuyệt đối (specificDuty) chưa tính được vì cần khối lượng / số lượng → chỉ hiển thị.
 * Trị giá tính thuế = CIF hoặc FOB tuỳ nước nhập (data/customsBasis.ts).
 */
export function computeDuty(importCountry: string, cif: number, fob: number, entry: TariffEntry | null, hasInputs = true, qty?: DutyQty): DutyResult {
  const basis = customsBasisOf(importCountry);
  const customsValue = Math.max(0, basis.basis === 'CIF' ? cif : fob);
  const base = { basis, customsValue, duty: 0, other: 0, fees: 0, additional: 0, specific: 0, specificPending: false, vat: 0, total: 0, entry: null, stale: false, vatMissing: false };
  if (!hasInputs) return { ...base, status: 'no-value' };
  if (!entry) return { ...base, status: 'no-data' };
  let duty = (customsValue * entry.dutyPct) / 100;
  // phần thuế tuyệt đối theo lượng (+ ngưỡng MIN/MAX của cả khoản thuế)
  let specific = 0, specificNote: string | undefined, specificPending = false;
  if (entry.specificDuty) {
    const r = specificDutyUsd(entry.specificDuty, qty);
    specificNote = r.note;
    if (r.usd == null) specificPending = true;
    else {
      let d = duty + r.usd;
      if (r.minUsd != null) d = Math.max(d, r.minUsd);
      if (r.maxUsd != null) d = Math.min(d, r.maxUsd);
      specific = d - duty;
      duty = d;
    }
  }
  const other = ((customsValue + duty) * (entry.otherPct || 0)) / 100;
  const fees = (customsValue * (entry.feePct || 0)) / 100;
  const additional = (customsValue * (entry.additionalPct || 0)) / 100;
  const vat = entry.vatPct == null ? 0 : ((customsValue + duty + additional + other) * entry.vatPct) / 100;
  return {
    status: 'ok', basis, customsValue, duty, other, fees, additional, specific, specificNote, specificPending, vat, total: duty + additional + other + fees + vat, entry,
    stale: daysSince(entry.updatedAt) > TARIFF_STALE_DAYS,
    vatMissing: entry.vatPct == null,
  };
}
