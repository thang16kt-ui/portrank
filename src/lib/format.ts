export const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
export const usdK = (n: number) => (Math.abs(n) >= 10000 ? `$${(n / 1000).toFixed(1)}k` : usd(n));
export const fmtDays = (d: number) => `${(Math.round(d * 2) / 2).toLocaleString('vi-VN')} ngày`;
export const fmtNm = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} hải lý`;
export const fmtKm = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} km`;
export const flag = (iso2: string) => (iso2.length === 2 ? String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '');
/** USD có cent khi cần (thuế, phí: khớp đến cent với tổng) */
export const usdC = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? usd(r) : `$${r.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
