import type { LngLat } from '../types';

/** Cửa khẩu đường bộ quốc tế chính. Toạ độ gần đúng (mức thị trấn cửa khẩu). Bổ sung dần tại đây. */
export interface BorderGate {
  id: string;
  name: string;
  /** Hai nước hai bên cửa khẩu */
  a: string;
  b: string;
  coord: LngLat;
}

export const BORDER_GATES: BorderGate[] = [
  // Việt Nam – Trung Quốc
  { id: 'HUUNGHI', name: 'Hữu Nghị – Hữu Nghị Quan (Lạng Sơn)', a: 'VN', b: 'CN', coord: [106.71, 21.97] },
  { id: 'MONGCAI', name: 'Móng Cái – Đông Hưng (Quảng Ninh)', a: 'VN', b: 'CN', coord: [107.97, 21.54] },
  { id: 'LAOCAI', name: 'Lào Cai – Hà Khẩu', a: 'VN', b: 'CN', coord: [103.96, 22.51] },
  // Việt Nam – Lào
  { id: 'LAOBAO', name: 'Lao Bảo – Dansavanh (Quảng Trị)', a: 'VN', b: 'LA', coord: [106.59, 16.62] },
  { id: 'CAUTREO', name: 'Cầu Treo – Nam Phao (Hà Tĩnh)', a: 'VN', b: 'LA', coord: [105.18, 18.39] },
  { id: 'CHALO', name: 'Cha Lo – Na Phao (Quảng Bình)', a: 'VN', b: 'LA', coord: [105.77, 17.67] },
  // Việt Nam – Campuchia
  { id: 'MOCBAI', name: 'Mộc Bài – Bavet (Tây Ninh)', a: 'VN', b: 'KH', coord: [106.17, 11.08] },
  { id: 'TINHBIEN', name: 'Tịnh Biên – Phnom Den (An Giang)', a: 'VN', b: 'KH', coord: [104.99, 10.6] },
  // Lào – Thái Lan
  { id: 'MUKDAHAN', name: 'Savannakhet – Mukdahan (cầu Hữu Nghị 2)', a: 'LA', b: 'TH', coord: [104.73, 16.6] },
  { id: 'NONGKHAI', name: 'Viêng Chăn – Nong Khai (cầu Hữu Nghị 1)', a: 'LA', b: 'TH', coord: [102.72, 17.88] },
  { id: 'NAKHONPHANOM', name: 'Thakhek – Nakhon Phanom (cầu Hữu Nghị 3)', a: 'LA', b: 'TH', coord: [104.74, 17.47] },
  // Campuchia – Thái Lan
  { id: 'POIPET', name: 'Poipet – Aranyaprathet', a: 'KH', b: 'TH', coord: [102.56, 13.66] },
  // Lào – Trung Quốc, Lào – Campuchia
  { id: 'BOTEN', name: 'Boten – Mohan (Ma Hàm)', a: 'LA', b: 'CN', coord: [101.68, 21.19] },
  { id: 'NONGNOKKHIENE', name: 'Nong Nok Khiene – Trapeang Kriel', a: 'LA', b: 'KH', coord: [105.93, 13.92] },
  // Thái Lan – Malaysia – Singapore, Thái Lan – Myanmar
  { id: 'SADAO', name: 'Sadao – Bukit Kayu Hitam', a: 'TH', b: 'MY', coord: [100.42, 6.52] },
  { id: 'WOODLANDS', name: 'Johor Bahru – Woodlands (Causeway)', a: 'MY', b: 'SG', coord: [103.77, 1.45] },
  { id: 'MAESOT', name: 'Mae Sot – Myawaddy', a: 'TH', b: 'MM', coord: [98.52, 16.69] },
  // Trung Quốc – các nước láng giềng
  { id: 'RUILI', name: 'Thụy Lệ – Muse', a: 'CN', b: 'MM', coord: [97.85, 23.99] },
  { id: 'KHORGOS', name: 'Khorgos (Horgos)', a: 'CN', b: 'KZ', coord: [80.42, 44.21] },
  { id: 'ALASHANKOU', name: 'Alashankou – Dostyk', a: 'CN', b: 'KZ', coord: [82.57, 45.17] },
  { id: 'ERENHOT', name: 'Erenhot – Zamyn-Üüd', a: 'CN', b: 'MN', coord: [111.98, 43.65] },
  { id: 'MANZHOULI', name: 'Mãn Châu Lý – Zabaykalsk', a: 'CN', b: 'RU', coord: [117.38, 49.6] },
  { id: 'KHUNJERAB', name: 'Khunjerab (Karakoram)', a: 'CN', b: 'PK', coord: [75.43, 36.85] },
  // Trung Á – Nga – châu Âu
  { id: 'PETROPAVL', name: 'Petropavl – Kazanskoye', a: 'KZ', b: 'RU', coord: [69.15, 54.9] },
  { id: 'KRASNOE', name: 'Krasnoye – Redki', a: 'RU', b: 'BY', coord: [31.05, 54.6] },
  { id: 'BREST', name: 'Brest – Terespol', a: 'BY', b: 'PL', coord: [23.66, 52.08] },
  // Nam Á
  { id: 'WAGAH', name: 'Wagah – Attari', a: 'PK', b: 'IN', coord: [74.57, 31.6] },
  { id: 'PETRAPOLE', name: 'Petrapole – Benapole', a: 'IN', b: 'BD', coord: [88.88, 23.04] },
  { id: 'BIRGUNJ', name: 'Raxaul – Birgunj', a: 'IN', b: 'NP', coord: [84.87, 27.0] },
  // Bắc Mỹ
  { id: 'LAREDO', name: 'Laredo – Nuevo Laredo', a: 'US', b: 'MX', coord: [-99.5, 27.5] },
  { id: 'TIJUANA', name: 'San Diego (Otay Mesa) – Tijuana', a: 'US', b: 'MX', coord: [-116.94, 32.55] },
  { id: 'DETROIT', name: 'Detroit – Windsor', a: 'US', b: 'CA', coord: [-83.07, 42.31] },
  { id: 'BLAINE', name: 'Blaine – Surrey (Pacific Highway)', a: 'US', b: 'CA', coord: [-122.74, 49.0] },
  // Châu Âu ngoài liên minh thuế quan EU
  { id: 'KAPIKULE', name: 'Kapıkule – Kapitan Andreevo', a: 'TR', b: 'BG', coord: [26.37, 41.72] },
  { id: 'CALAIS', name: 'Calais – Dover / Eurotunnel', a: 'FR', b: 'GB', coord: [1.82, 50.94] },
  { id: 'BASEL', name: 'Basel – Weil am Rhein', a: 'CH', b: 'DE', coord: [7.6, 47.59] },
];
