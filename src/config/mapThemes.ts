/**
 * Chủ đề màu của bản đồ (V2). Mỗi chủ đề là một bộ màu; người dùng có thể ghi đè từng màu.
 * Chỉ đổi màu phần BẢN ĐỒ (nền, đất, viền, tuyến, nhãn trên bản đồ) – các bảng điều khiển giữ nền tối.
 */
export interface MapColors {
  sea: string;
  land: string;
  border: string;
  coast: string;
  /** Màu quầng sáng quanh đường bờ biển */
  coastGlow: string;
  rank1: string;
  rank23: string;
  rankOther: string;
  road: string;
  inland: string;
  ports: string;
  /** Tô sáng quốc gia / ghim công ty phía bán và phía mua */
  seller: string;
  buyer: string;
}

export interface MapTheme {
  id: string;
  name: string;
  /** Nền sáng → nhãn trên bản đồ dùng chữ tối */
  light: boolean;
  colors: MapColors;
  /** Độ đậm quầng sáng bờ biển 0..1 */
  glow: number;
}

export const MAP_THEMES: MapTheme[] = [
  {
    id: 'glow', name: 'Tối phát sáng', light: false, glow: 0.4,
    colors: { sea: '#070b14', land: '#0c1a2c', border: '#1f3a5c', coast: '#7fe3f5', coastGlow: '#22d3ee', rank1: '#fbbf24', rank23: '#38d6ee', rankOther: '#6086b0', road: '#a3e635', inland: '#c4b5fd', ports: '#a5f3fc', seller: '#38bdf8', buyer: '#fb923c' },
  },
  {
    id: 'navy', name: 'Hải quân', light: false, glow: 0.3,
    colors: { sea: '#0b1e3a', land: '#16304f', border: '#2b4c75', coast: '#9cc4ef', coastGlow: '#4f8fd8', rank1: '#ffb020', rank23: '#5eead4', rankOther: '#7c93b3', road: '#bef264', inland: '#f0abfc', ports: '#e0f2fe', seller: '#60a5fa', buyer: '#fb7185' },
  },
  {
    id: 'chart', name: 'Hải đồ', light: true, glow: 0.15,
    colors: { sea: '#a9d3ea', land: '#f3e7c4', border: '#c2a979', coast: '#3b6e91', coastGlow: '#5aa0c8', rank1: '#d9480f', rank23: '#1c64c7', rankOther: '#7d8ea3', road: '#4d7c0f', inland: '#7c3aed', ports: '#0b4f8a', seller: '#1d4ed8', buyer: '#c2410c' },
  },
  {
    id: 'light', name: 'Sáng tối giản', light: true, glow: 0.1,
    colors: { sea: '#dfe9f3', land: '#ffffff', border: '#cbd5e1', coast: '#7aa7d6', coastGlow: '#93c5fd', rank1: '#f59e0b', rank23: '#0ea5e9', rankOther: '#94a3b8', road: '#65a30d', inland: '#8b5cf6', ports: '#0369a1', seller: '#2563eb', buyer: '#ea580c' },
  },
  {
    id: 'neon', name: 'Neon tím', light: false, glow: 0.55,
    colors: { sea: '#0a0614', land: '#1a1033', border: '#3b2a66', coast: '#f0abfc', coastGlow: '#e879f9', rank1: '#facc15', rank23: '#a78bfa', rankOther: '#6b5b95', road: '#4ade80', inland: '#67e8f9', ports: '#f5d0fe', seller: '#22d3ee', buyer: '#fb923c' },
  },
  {
    id: 'mono', name: 'Đen trắng', light: false, glow: 0.2,
    colors: { sea: '#000000', land: '#1c1c1c', border: '#3a3a3a', coast: '#d4d4d4', coastGlow: '#a3a3a3', rank1: '#ffffff', rank23: '#a3a3a3', rankOther: '#525252', road: '#e5e5e5', inland: '#a3a3a3', ports: '#e5e5e5', seller: '#e5e5e5', buyer: '#a3a3a3' },
  },
];

export const DEFAULT_THEME_ID = 'glow';

/** Nhãn hiển thị cho từng màu tùy chỉnh (theo thứ tự trong bảng chỉnh) */
export const COLOR_FIELDS: { key: keyof MapColors; label: string }[] = [
  { key: 'sea', label: 'Biển' },
  { key: 'land', label: 'Đất liền' },
  { key: 'border', label: 'Biên giới' },
  { key: 'coast', label: 'Viền bờ biển' },
  { key: 'coastGlow', label: 'Quầng sáng bờ' },
  { key: 'rank1', label: 'Tuyến hạng 1' },
  { key: 'rank23', label: 'Tuyến hạng 2–3' },
  { key: 'rankOther', label: 'Tuyến khác' },
  { key: 'road', label: 'Tuyến đường bộ' },
  { key: 'inland', label: 'Đoạn nội địa' },
  { key: 'ports', label: 'Chấm cảng' },
  { key: 'seller', label: 'Bên bán' },
  { key: 'buyer', label: 'Bên mua' },
];

export interface MapThemeSetting {
  base: string;
  overrides: Partial<MapColors>;
  /** null = dùng độ sáng mặc định của chủ đề */
  glow: number | null;
}

export const DEFAULT_THEME_SETTING: MapThemeSetting = { base: DEFAULT_THEME_ID, overrides: {}, glow: null };

const HEX = /^#[0-9a-f]{6}$/i;

/** Gộp chủ đề gốc với các màu người dùng chỉnh (bỏ qua giá trị không hợp lệ). Hàm thuần. */
export function resolveTheme(s: MapThemeSetting): MapTheme {
  const base = MAP_THEMES.find((t) => t.id === s.base) ?? MAP_THEMES[0];
  const colors = { ...base.colors };
  for (const [k, v] of Object.entries(s.overrides ?? {})) if (k in colors && typeof v === 'string' && HEX.test(v)) colors[k as keyof MapColors] = v.toLowerCase();
  // nền sáng/tối theo độ sáng của màu biển (để nhãn luôn đọc được khi người dùng tự đổi màu biển)
  const light = luminance(colors.sea) > 0.45;
  const glow = s.glow == null || !isFinite(s.glow) ? base.glow : Math.max(0, Math.min(1, s.glow));
  return { ...base, colors, light, glow };
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Độ sáng tương đối (0..1) theo WCAG */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Trộn hai màu hex (t = 0 → a, 1 → b) */
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return '#' + A.map((x, i) => Math.round(x + (B[i] - x) * t).toString(16).padStart(2, '0')).join('');
}

/** Biến CSS cho nhãn HTML trên bản đồ (nhãn cảng, ghim công ty…) */
export function labelVars(t: MapTheme): Record<string, string> {
  return t.light
    ? { '--map-label-bg': 'rgba(255,255,255,.92)', '--map-label-fg': '#0f172a', '--map-label-sub': '#475569', '--map-label-border': 'rgba(15,23,42,.18)', '--map-label-shadow': '0 0 3px #fff, 0 0 6px #fff', '--map-label-text': '#0f172a', '--map-price': t.colors.rank1 }
    : { '--map-label-bg': 'rgba(7,11,20,.78)', '--map-label-fg': '#e8f1fb', '--map-label-sub': '#8fa5c0', '--map-label-border': `${t.colors.coast}40`, '--map-label-shadow': '0 0 4px #000, 0 0 8px #000', '--map-label-text': '#ffffff', '--map-price': t.colors.rank1 };
}
