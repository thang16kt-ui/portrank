import type { TaxMeasure } from '../data/tariff/types';

/**
 * Cấu hình thuế ở cấp QUỐC GIA (không phụ thuộc mã hàng).
 * Thuế theo từng dòng hàng nằm ở `src/data/tariff/` (tự động tải + nhập tay).
 *
 * ⚠️ Đây là thuế suất TIÊU CHUẨN nhập tay, có thể có thuế suất giảm cho từng nhóm hàng.
 * Khi biểu thuế của dòng hàng có VAT riêng (vd. dữ liệu Anh tải từ API) thì dùng VAT của dòng hàng.
 */
export const TAX_CONFIG_AS_OF = '2026-11';

interface CountryVat {
  pct: number;
  label: string;
  note?: string;
}

export const STANDARD_VAT: Record<string, CountryVat> = {
  // EU – VAT nhập khẩu theo nước thành viên nơi thông quan
  BE: { pct: 21, label: 'VAT nhập khẩu (Bỉ)' },
  DE: { pct: 19, label: 'Einfuhrumsatzsteuer (Đức)', note: 'Thực phẩm và một số mặt hàng: 7%.' },
  ES: { pct: 21, label: 'IVA nhập khẩu (Tây Ban Nha)' },
  FR: { pct: 20, label: 'TVA nhập khẩu (Pháp)' },
  GR: { pct: 24, label: 'VAT nhập khẩu (Hy Lạp)' },
  IT: { pct: 22, label: 'IVA nhập khẩu (Ý)' },
  MT: { pct: 18, label: 'VAT nhập khẩu (Malta)' },
  NL: { pct: 21, label: 'BTW nhập khẩu (Hà Lan)', note: 'Thực phẩm và một số mặt hàng: 9%.' },
  PL: { pct: 23, label: 'VAT nhập khẩu (Ba Lan)' },
  PT: { pct: 23, label: 'IVA nhập khẩu (Bồ Đào Nha)' },
  SE: { pct: 25, label: 'Moms nhập khẩu (Thụy Điển)' },
  // Châu Âu ngoài EU
  GB: { pct: 20, label: 'Import VAT (Anh)' },
  TR: { pct: 20, label: 'KDV nhập khẩu (Thổ Nhĩ Kỳ)' },
  // Châu Á – Thái Bình Dương
  VN: { pct: 10, label: 'Thuế GTGT hàng nhập khẩu (Việt Nam)', note: 'Một số nhóm hàng chịu 5%/0% hoặc đang được giảm còn 8% – kiểm tra danh mục.' },
  CN: { pct: 13, label: 'VAT nhập khẩu (Trung Quốc)', note: 'Nông sản, một số hàng thiết yếu: 9%.' },
  JP: { pct: 10, label: 'Thuế tiêu dùng (Nhật Bản)', note: 'Thực phẩm: 8%.' },
  KR: { pct: 10, label: 'VAT nhập khẩu (Hàn Quốc)' },
  TW: { pct: 5, label: 'Business tax nhập khẩu (Đài Loan)' },
  SG: { pct: 9, label: 'GST nhập khẩu (Singapore)' },
  TH: { pct: 7, label: 'VAT nhập khẩu (Thái Lan)' },
  PH: { pct: 12, label: 'VAT nhập khẩu (Philippines)' },
  KH: { pct: 10, label: 'VAT nhập khẩu (Campuchia)' },
  AU: { pct: 10, label: 'GST nhập khẩu (Úc)', note: 'Tính trên trị giá hải quan + thuế + cước & bảo hiểm (VoTI).' },
  NZ: { pct: 15, label: 'GST nhập khẩu (New Zealand)' },
  // Trung Đông & châu Phi
  AE: { pct: 5, label: 'VAT nhập khẩu (UAE)' },
  SA: { pct: 15, label: 'VAT nhập khẩu (Ả Rập Xê Út)' },
  OM: { pct: 5, label: 'VAT nhập khẩu (Oman)' },
  EG: { pct: 14, label: 'VAT nhập khẩu (Ai Cập)' },
  MA: { pct: 20, label: 'TVA nhập khẩu (Maroc)' },
  ZA: { pct: 15, label: 'VAT nhập khẩu (Nam Phi)' },
  KE: { pct: 16, label: 'VAT nhập khẩu (Kenya)' },
  NG: { pct: 7.5, label: 'VAT nhập khẩu (Nigeria)' },
  TZ: { pct: 18, label: 'VAT nhập khẩu (Tanzania)' },
  SN: { pct: 18, label: 'TVA nhập khẩu (Senegal)' },
  CI: { pct: 18, label: 'TVA nhập khẩu (Bờ Biển Ngà)' },
  TG: { pct: 18, label: 'TVA nhập khẩu (Togo)' },
  // Châu Mỹ
  CA: { pct: 5, label: 'GST nhập khẩu (Canada)', note: 'Chưa gồm PST/HST theo tỉnh.' },
  MX: { pct: 16, label: 'IVA nhập khẩu (Mexico)' },
  PA: { pct: 7, label: 'ITBMS nhập khẩu (Panama)' },
  JM: { pct: 15, label: 'GCT nhập khẩu (Jamaica)' },
  CO: { pct: 19, label: 'IVA nhập khẩu (Colombia)' },
  PE: { pct: 18, label: 'IGV nhập khẩu (Peru)' },
  CL: { pct: 19, label: 'IVA nhập khẩu (Chile)' },
  AR: { pct: 21, label: 'IVA nhập khẩu (Argentina)', note: 'Chưa gồm các khoản thu bổ sung khi nhập khẩu.' },
  UY: { pct: 22, label: 'IVA nhập khẩu (Uruguay)' },
};

/** Nước không có VAT/GST nhập khẩu ở cấp quốc gia – không hiển thị cảnh báo "thiếu VAT" */
export const NO_NATIONAL_VAT = new Set(['US', 'HK', 'QA']);

/** Phí khác tính theo trị giá, áp dụng cho mọi dòng hàng của nước nhập khẩu */
export const COUNTRY_CHARGES: Record<string, TaxMeasure[]> = {
  US: [
    {
      kind: 'other',
      label: 'Merchandise Processing Fee (MPF)',
      rate: '0.3464%',
      pct: 0.3464,
      note: 'Có mức tối thiểu/tối đa mỗi tờ khai, điều chỉnh theo năm tài chính của CBP. Hàng có xuất xứ USMCA được miễn.',
      excludedOrigins: ['CA', 'MX'],
      confidence: 'manual',
      source: 'CBP – 19 CFR 24.23',
    },
    {
      kind: 'other',
      label: 'Harbor Maintenance Fee (HMF)',
      rate: '0.125%',
      pct: 0.125,
      note: 'Áp dụng cho hàng nhập qua cảng biển.',
      confidence: 'manual',
      source: 'CBP – 19 CFR 24.24',
    },
  ],
};

/**
 * Cơ sở tính thuế nhập khẩu: phần lớn các nước tính trên trị giá CIF.
 * Mỹ, Canada, Úc, New Zealand, Nam Phi tính trên trị giá FOB/giao dịch (không cộng cước biển).
 */
export const FOB_BASIS_COUNTRIES = new Set(['US', 'CA', 'AU', 'NZ', 'ZA']);

/** Phí bảo hiểm giả định khi quy đổi FOB → CIF (% của FOB + cước) */
export const INSURANCE_PCT = 0.3;

/** Dữ liệu tự động cũ hơn số ngày này sẽ bị cảnh báo */
export const STALE_AFTER_DAYS = 35;

/** Dữ liệu nhập tay chưa được rà soát lại sau số ngày này sẽ bị cảnh báo */
export const MANUAL_REVIEW_AFTER_DAYS = 180;
