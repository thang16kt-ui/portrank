import { customsBasisOf, type CustomsBasis } from '../data/customsBasis';
import type { TariffEntry } from '../providers/TariffProvider';
import { daysSince } from './csv';

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
 * Trị giá tính thuế = CIF hoặc FOB tuỳ nước nhập (data/customsBasis.ts).
 */
export function computeDuty(importCountry: string, cif: number, fob: number, entry: TariffEntry | null, hasInputs = true): DutyResult {
  const basis = customsBasisOf(importCountry);
  const customsValue = Math.max(0, basis.basis === 'CIF' ? cif : fob);
  const base = { basis, customsValue, duty: 0, other: 0, fees: 0, vat: 0, total: 0, entry: null, stale: false, vatMissing: false };
  if (!hasInputs) return { ...base, status: 'no-value' };
  if (!entry) return { ...base, status: 'no-data' };
  const duty = (customsValue * entry.dutyPct) / 100;
  const other = ((customsValue + duty) * (entry.otherPct || 0)) / 100;
  const fees = (customsValue * (entry.feePct || 0)) / 100;
  const vat = entry.vatPct == null ? 0 : ((customsValue + duty + other) * entry.vatPct) / 100;
  return {
    status: 'ok', basis, customsValue, duty, other, fees, vat, total: duty + other + fees + vat, entry,
    stale: daysSince(entry.updatedAt) > TARIFF_STALE_DAYS,
    vatMissing: entry.vatPct == null,
  };
}
