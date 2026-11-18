import fx from '../data/fxRates.json';

/**
 * Thuế TUYỆT ĐỐI / theo lượng: đọc chuỗi thuế (HTS Mỹ, TARIC, UK Trade Tariff) → số tiền USD theo số lượng hàng.
 *   "90¢/pr."  "4.4¢/kg"  "$1.25/doz."  "25¢ each"  "2.50 EUR / 100 kg"  "33.00 GBP / 100 kg/net"  "MIN 0.30 EUR / 100 kg"  "1.20 EUR / hl"
 * Thuế theo độ cồn ("% vol/hl"), theo đường (… / 100 kg/net mas) và các dạng lạ → không tính, báo cần tính tay.
 */

export const FX = fx as { source: string; sourceUrl: string; date: string; usdPer: Record<string, number> };

/** Số lượng hàng để tính thuế tuyệt đối */
export interface DutyQty {
  /** Khối lượng tịnh (kg) */
  netKg: number;
  /** Số lượng sản phẩm (chiếc / đôi / cái) */
  units: number;
  /** Thể tích (lít) */
  liters: number;
}

type Basis = 'kg' | 'units' | 'liters';
interface Term {
  /** Số tiền theo đồng tiền gốc cho `per` đơn vị */
  amount: number;
  currency: string;
  basis: Basis;
  per: number;
  /** MIN / MAX: ngưỡng của cả khoản thuế (so với phần %) */
  bound?: 'MIN' | 'MAX';
  text: string;
}

const UNIT: [RegExp, Basis, number][] = [
  [/^1000\s*kg|^t(onne)?\b|^ton\b/i, 'kg', 1000],
  [/^100\s*kg/i, 'kg', 100],
  [/^kg/i, 'kg', 1],
  [/^1000\s*p\/st|^1000\s*(pcs|items?)/i, 'units', 1000],
  [/^doz/i, 'units', 12],
  [/^(pr\.?|pair|pairs)\b/i, 'units', 1],
  [/^(p\/st|pcs?|no\.?|items?|units?|each|head)\b/i, 'units', 1],
  [/^hl\b/i, 'liters', 100],
  [/^(l|liters?|litres?)\b/i, 'liters', 1],
];

/** Tách một chuỗi thuế tuyệt đối thành các khoản. null nếu có khoản không đọc được */
export function parseSpecific(text: string): Term[] | null {
  const terms: Term[] = [];
  for (const raw of text.split(/\s\+\s|\+/).map((x) => x.trim()).filter(Boolean)) {
    let t = raw;
    let bound: Term['bound'];
    const b = t.match(/^(MIN|MAX)\s+/i);
    if (b) {
      bound = b[1].toUpperCase() as Term['bound'];
      t = t.slice(b[0].length);
    }
    if (/%\s*vol|mas\b|\/\s*%|eda\b|edb\b|edc\b|ede\b/i.test(t)) return null; // theo độ cồn / đường / thành phần → không tự tính
    let amount: number, currency: string, rest: string;
    let m = t.match(/^(\d+(?:\.\d+)?)\s*¢\s*(.*)$/);
    if (m) [amount, currency, rest] = [+m[1] / 100, 'USD', m[2]];
    else if ((m = t.match(/^\$\s*(\d+(?:\.\d+)?)\s*(.*)$/))) [amount, currency, rest] = [+m[1], 'USD', m[2]];
    else if ((m = t.match(/^(\d+(?:\.\d+)?)\s*([A-Z]{3})\b\s*(.*)$/))) [amount, currency, rest] = [+m[1], m[2], m[3]];
    else return null;
    rest = rest.replace(/^\/\s*/, '').replace(/\/net\b|\s+net\b/i, '').trim();
    if (!rest) return null; // không ghi đơn vị (vd. phí cố định mỗi lô) → không tính theo lượng
    const u = UNIT.find(([re]) => re.test(rest));
    if (!u) return null;
    terms.push({ amount: Math.round(amount * 1e6) / 1e6, currency, basis: u[1], per: u[2], ...(bound && { bound }), text: raw });
  }
  return terms.length ? terms : null;
}

const QTY_LABEL: Record<Basis, string> = { kg: 'khối lượng tịnh (kg)', units: 'số lượng sản phẩm', liters: 'thể tích (lít)' };

export interface SpecificResult {
  /** Phần thuế tuyệt đối (USD) cộng thêm; null nếu chưa tính được */
  usd: number | null;
  /** Ngưỡng tối thiểu / tối đa của cả khoản thuế (USD) */
  minUsd?: number;
  maxUsd?: number;
  /** Diễn giải hoặc lý do chưa tính */
  note: string;
  /** Lý do chưa tính: thiếu số lượng (cần nhập) / dạng không hỗ trợ / thiếu tỷ giá */
  reason?: 'qty' | 'format' | 'fx';
  /** Số lượng còn thiếu */
  needs?: 'netKg' | 'units' | 'liters';
}

/** Tính phần thuế tuyệt đối (USD) theo số lượng hàng và tỷ giá ECB */
export function specificDutyUsd(text: string, qty: DutyQty | undefined): SpecificResult {
  const terms = parseSpecific(text);
  if (!terms) return { usd: null, reason: 'format', note: `"${text}" – dạng thuế này chưa tự tính được (theo độ cồn, thành phần…) – cần tính tay.` };
  let usd = 0, minUsd: number | undefined, maxUsd: number | undefined;
  const parts: string[] = [];
  for (const t of terms) {
    const rate = FX.usdPer[t.currency];
    if (!rate) return { usd: null, reason: 'fx', note: `Chưa có tỷ giá ${t.currency} để quy đổi "${t.text}".` };
    const field = t.basis === 'kg' ? 'netKg' : t.basis;
    const q = qty?.[field] ?? 0;
    if (!(q > 0)) return { usd: null, reason: 'qty', needs: field, note: `Nhập ${QTY_LABEL[t.basis]} để tính phần "${t.text}".` };
    const v = ((t.amount * q) / t.per) * rate;
    if (t.bound === 'MIN') minUsd = v;
    else if (t.bound === 'MAX') maxUsd = v;
    else usd += v;
    parts.push(`${t.text} × ${q.toLocaleString('en-US')} ${t.basis === 'kg' ? 'kg' : t.basis === 'units' ? 'đv' : 'l'}${t.currency !== 'USD' ? ` × ${rate} USD/${t.currency}` : ''}`);
  }
  return { usd, ...(minUsd != null && { minUsd }), ...(maxUsd != null && { maxUsd }), note: `${parts.join(' + ')} (tỷ giá ECB ${FX.date})` };
}
