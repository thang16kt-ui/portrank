/**
 * Kiểu dữ liệu biểu thuế – dùng chung cho app và script `scripts/update-tariffs.ts`.
 * Không import gì từ trình duyệt/Vite để script Node dùng được.
 */

/** Loại thuế/phí áp dụng cho một dòng hàng */
export type TaxKind =
  | 'mfn' // Thuế nhập khẩu thông thường / MFN (hoặc biểu thuế riêng cho một số xuất xứ, vd. cột 2 của Mỹ)
  | 'preferential' // Thuế ưu đãi đặc biệt theo FTA / chương trình ưu đãi (cần C/O)
  | 'additional' // Thuế bổ sung theo xuất xứ: chống bán phá giá, chống trợ cấp, tự vệ, đối ứng, Section 301…
  | 'vat' // VAT / GST nhập khẩu
  | 'excise' // Thuế tiêu thụ đặc biệt
  | 'other'; // Phí khác tính theo trị giá (vd. MPF/HMF của Mỹ)

export type Confidence =
  /** Lấy tự động từ nguồn chính thức (API) trong lần cập nhật gần nhất */
  | 'official'
  /** Nhập tay từ văn bản – cần đối chiếu định kỳ */
  | 'manual'
  /** Chỉ để tham khảo: có thể áp dụng tuỳ điều kiện, KHÔNG cộng vào tổng */
  | 'reference';

export interface TaxMeasure {
  kind: TaxKind;
  label: string;
  /** Thuế suất nguyên văn của nguồn, ví dụ "16.5%", "Free", "2.2¢/kg + 5%". Rỗng = chưa có số */
  rate: string;
  /** Phần trăm theo trị giá đã tách ra; null = không tách được (thuế tuyệt đối) hoặc chưa có số */
  pct: number | null;
  /** Có thành phần thuế tuyệt đối (theo lượng) mà engine chưa tính */
  specific?: boolean;
  /** Chỉ áp dụng cho hàng có xuất xứ từ các nước này (ISO 3166-1 alpha-2). Không có = mọi xuất xứ */
  origins?: string[];
  /** Loại trừ các xuất xứ này */
  excludedOrigins?: string[];
  /** Tên hiệp định / chương trình ưu đãi */
  agreement?: string;
  /** Chứng từ cần có để hưởng (C/O, tự chứng nhận…) */
  proof?: string;
  /** YYYY-MM-DD */
  validFrom?: string;
  validTo?: string | null;
  note?: string;
  confidence: Confidence;
  source: string;
}

export interface TariffLine {
  /** Mã quốc gia chỉ gồm chữ số (8–10 số), hoặc tiền tố (vd. HS6) áp dụng cho mọi dòng con */
  code: string;
  description: string;
  measures: TaxMeasure[];
  /** Mã chi tiết hơn nằm dưới dòng này (vd. mã thống kê 10 số của Mỹ) – dùng để kiểm tra mã */
  children?: { code: string; description: string }[];
}

export interface TariffBook {
  /** ISO alpha-2 của nước nhập khẩu, hoặc 'EU' (áp dụng cho mọi nước thành viên) */
  country: string;
  source: string;
  sourceUrl: string;
  /** Phiên bản biểu thuế của nguồn (vd. "2026HTSRev23") */
  release?: string;
  /** Thời điểm tải dữ liệu (ISO) */
  fetchedAt: string;
  lines: TariffLine[];
  /** Thuế theo xuất xứ không gắn với dòng hàng cụ thể (vd. thuế bổ sung chương 99 của Mỹ) */
  originMeasures?: TaxMeasure[];
}

/** Một mặt hàng trong danh mục: 1 mã HS6 + mã quốc gia của từng nước */
export interface Product {
  sku: string;
  name: string;
  hs6: string;
  /** country (hoặc 'EU') → mã quốc gia, chỉ gồm chữ số */
  codes: Record<string, string>;
}
