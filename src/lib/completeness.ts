import type { Completeness } from './duty';

/** Nhãn trạng thái đầy đủ của tổng tiền – dùng chung cho thẻ tổng, bảng chi tiết, báo giá copy */
export const COMPLETENESS_LABEL: Record<Completeness, { label: string; cls: string; hint: string }> = {
  complete: { label: 'Đủ các khoản', cls: 'chip-real', hint: 'Đã tính mọi khoản thuế/phí mà dữ liệu hiện có xác định được' },
  partial: { label: 'Chưa đủ', cls: 'chip-warn', hint: 'Có khoản chưa tính hoặc mới là ước tính – tổng chỉ là phần đã biết' },
  'needs-input': { label: 'Cần nhập thêm', cls: 'chip-warn', hint: 'Thiếu thông tin (số lượng, khối lượng tịnh…) để tính hết thuế' },
  unavailable: { label: 'Chưa có thuế', cls: 'chip-warn', hint: 'Chưa có thuế suất – tổng chưa gồm thuế nhập khẩu / VAT' },
};

