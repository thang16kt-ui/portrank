import vat from './vatRates.json';

/**
 * VAT/GST TIÊU CHUẨN theo nước – gói npm `sales-tax` (MIT, github.com/valeriansaliou/node-sales-tax),
 * tải lại bằng `npm run tariffs:update`. Chỉ là thuế suất tiêu chuẩn: nhiều mặt hàng có mức giảm / miễn.
 */
export interface VatInfo {
  pct: number;
  type: string;
  /** Có thêm thuế theo bang / tỉnh (Mỹ, Canada…) */
  regional?: boolean;
}

export const VAT_DATA = vat as { source: string; sourceUrl: string; fetchedAt: string; rates: Record<string, VatInfo> };

export const standardVat = (iso2: string): VatInfo | null => VAT_DATA.rates[iso2] ?? null;

export const vatLabel = (v: VatInfo) => (v.type === 'gst' ? 'GST' : v.type === 'none' ? 'Không có VAT quốc gia' : v.type.toUpperCase());

/** 0 nếu nước không có VAT quốc gia (vd. Mỹ); null nếu chưa biết */
export const standardVatOf = (iso2: string): number | null => {
  const v = standardVat(iso2);
  return v ? (v.type === 'none' ? 0 : v.pct) : null;
};
