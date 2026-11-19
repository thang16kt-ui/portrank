import type { FeeRule } from '../providers/TariffProvider';

/**
 * Phí CBP của Mỹ (19 CFR 24.23 / 24.24) – tính MỘT LẦN mỗi tờ khai, không nhân theo container hay dòng hàng.
 *  - MPF (Merchandise Processing Fee) 0,3464% trị giá, có SÀN/TRẦN theo năm tài chính (1/10 → 30/9) – tờ khai chính thức (formal entry).
 *  - HMF (Harbor Maintenance Fee) 0,125% trị giá – CHỈ hàng bốc/dỡ từ tàu biển thương mại tại cảng thuộc phạm vi; không áp cho xe đường bộ.
 * Chỉ ghi các năm có văn bản đã đối chiếu; ngày ngoài bảng → dùng năm gần nhất và báo "chưa xác nhận".
 */
export const US_MPF_PCT = 0.3464;
export const US_HMF_PCT = 0.125;

export const US_MPF_BOUNDS: { from: string; to: string; min: number; max: number; source: string }[] = [
  {
    from: '2026-10-01', to: '2027-09-30', min: 34.58, max: 670.86,
    source: 'CBP Dec. 26-14, 91 FR 48398–48400 (FR Doc. 2026-15530), Table 2 – https://www.govinfo.gov/content/pkg/FR-2026-07-31/html/2026-15530.htm',
  },
];

/** Sàn/trần MPF áp dụng tại ngày `date`; `exact` = ngày nằm trong năm tài chính có văn bản */
export function mpfBoundsAt(date: string): { min: number; max: number; source: string; exact: boolean; fy: string } {
  const hit = US_MPF_BOUNDS.find((b) => b.from <= date && date <= b.to);
  const b = hit ?? (date < US_MPF_BOUNDS[0].from ? US_MPF_BOUNDS[0] : US_MPF_BOUNDS[US_MPF_BOUNDS.length - 1]);
  return { min: b.min, max: b.max, source: b.source, exact: !!hit, fy: `FY${+b.to.slice(0, 4)}` };
}

/** Các khoản phí CBP cho một dòng HTS. `mpfExempt`: hàng hưởng ưu đãi USMCA (CA/MX)… */
export function usFees(date: string, mpfExempt: boolean): FeeRule[] {
  const b = mpfBoundsAt(date);
  const fees: FeeRule[] = [];
  if (!mpfExempt)
    fees.push({
      code: 'MPF', label: 'Phí MPF (CBP)', pct: US_MPF_PCT, minUsd: b.min, maxUsd: b.max,
      note: `${b.fy}: tối thiểu ${b.min} – tối đa ${b.max} USD mỗi tờ khai${b.exact ? '' : ' (chưa có văn bản cho năm tài chính của ngày tính – đang dùng năm gần nhất)'}. Giả định tờ khai chính thức (formal entry); tờ khai không chính thức (dưới 2.500 USD) có mức cố định khác.`,
      source: b.source,
    });
  fees.push({
    code: 'HMF', label: 'Phí HMF (CBP)', pct: US_HMF_PCT, modes: ['sea'],
    note: 'Chỉ hàng bốc/dỡ từ tàu biển thương mại tại cảng Mỹ thuộc phạm vi (19 CFR 24.24); không có sàn/trần.',
    source: 'https://www.help.cbp.gov/s/article/Article-1105?language=en_US',
  });
  return fees;
}

export interface FeeLine {
  code: string;
  label: string;
  amount: number;
  note: string;
}

/** Tính các khoản phí theo trị giá + sàn/trần, bỏ khoản không thuộc phương thức vận chuyển */
export function computeFees(rules: FeeRule[], value: number, mode: 'sea' | 'road' | undefined): { lines: FeeLine[]; skipped: string[]; assumed: string[] } {
  const lines: FeeLine[] = [], skipped: string[] = [], assumed: string[] = [];
  for (const f of rules) {
    if (f.modes && mode && !f.modes.includes(mode)) {
      skipped.push(`${f.label}: không áp dụng cho vận chuyển ${mode === 'road' ? 'đường bộ' : mode}`);
      continue;
    }
    if (f.modes && !mode) assumed.push(`${f.label}: giả định hàng đi ${f.modes.join('/')}`);
    let amount = (value * f.pct) / 100;
    let how = `${f.pct}% × ${round2(value)} USD`;
    if (f.minUsd != null && amount < f.minUsd) [amount, how] = [f.minUsd, `${how} < sàn → ${f.minUsd} USD`];
    if (f.maxUsd != null && amount > f.maxUsd) [amount, how] = [f.maxUsd, `${how} > trần → ${f.maxUsd} USD`];
    lines.push({ code: f.code, label: f.label, amount: round2(amount), note: [how, f.note].filter(Boolean).join(' · ') });
  }
  return { lines, skipped, assumed };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
