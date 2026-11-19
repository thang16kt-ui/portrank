export const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
export const usdK = (n: number) => (Math.abs(n) >= 10000 ? `$${(n / 1000).toFixed(1)}k` : usd(n));
export const fmtDays = (d: number) => `${(Math.round(d * 2) / 2).toLocaleString('vi-VN')} ngày`;
export const fmtNm = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} hải lý`;
export const fmtKm = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} km`;
export const fmtDrivingDistance = (meters: number) => meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} km`;
export function fmtDuration(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours ? `${hours} giờ${rest ? ` ${rest} phút` : ''}` : `${minutes} phút`;
}
export const flag = (iso2: string) => (iso2.length === 2 ? String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '');
/** USD có cent khi cần (thuế, phí: khớp đến cent với tổng) */
export const usdC = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? usd(r) : `$${r.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
