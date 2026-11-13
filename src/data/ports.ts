import type { Port, RegionId } from '../types';

export const REGION_NAMES: Record<RegionId, string> = {
  SEA: 'Đông Nam Á',
  NEA: 'Đông Bắc Á',
  SA: 'Nam Á',
  ME: 'Trung Đông',
  EU: 'Bắc & Tây Âu',
  MED: 'Địa Trung Hải',
  AF: 'Châu Phi',
  NA: 'Bắc Mỹ',
  LATAM: 'Mỹ Latinh & Caribe',
  OC: 'Châu Đại Dương',
};

export const REGION_ORDER: RegionId[] = ['SEA', 'NEA', 'SA', 'ME', 'EU', 'MED', 'AF', 'NA', 'LATAM', 'OC'];

type P = Omit<Port, 'weeklyServices' | 'congestion'> & { w?: number; c?: number };

/**
 * Toạ độ đặt tại khu bến/khu nước trước bến. `approach` là luồng ra biển cho các cảng nằm
 * trong sông/vịnh (bến → biển thoáng). Số tuyến/tuần và chỉ số ùn tắc là DỮ LIỆU MÔ PHỎNG.
 */
const RAW: P[] = [
  // ── Việt Nam ─────────────────────────────────────────────
  { code: 'VNHPH', name: 'Hải Phòng (Lạch Huyện)', country: 'VN', countryName: 'Việt Nam', region: 'SEA', coord: [106.97, 20.76], approach: [[107.02, 20.68], [107.08, 20.58]], w: 38, c: 0.35, aliases: ['hai phong', 'lach huyen', 'bac'] },
  { code: 'VNDAD', name: 'Đà Nẵng (Tiên Sa)', country: 'VN', countryName: 'Việt Nam', region: 'SEA', coord: [108.21, 16.13], approach: [[108.22, 16.2], [108.3, 16.25]], w: 12, c: 0.15, aliases: ['da nang', 'tien sa', 'trung'] },
  { code: 'VNUIH', name: 'Quy Nhơn', country: 'VN', countryName: 'Việt Nam', region: 'SEA', coord: [109.24, 13.77], approach: [[109.28, 13.74], [109.36, 13.72]], w: 5, c: 0.1, aliases: ['quy nhon'] },
  { code: 'VNSGN', name: 'Cát Lái (TP.HCM)', country: 'VN', countryName: 'Việt Nam', region: 'SEA', coord: [106.79, 10.76], approach: [[106.78, 10.72], [106.75, 10.66], [106.77, 10.57], [106.79, 10.47], [106.8, 10.38], [106.86, 10.25], [106.95, 10.1]], w: 45, c: 0.55, aliases: ['cat lai', 'ho chi minh', 'sai gon', 'saigon', 'hcm', 'nam'] },
  { code: 'VNCMT', name: 'Cái Mép – Thị Vải', country: 'VN', countryName: 'Việt Nam', region: 'SEA', coord: [107.03, 10.53], approach: [[107.02, 10.48], [107.03, 10.42], [107.06, 10.33], [107.1, 10.2], [107.12, 10.05]], w: 30, c: 0.3, aliases: ['cai mep', 'thi vai', 'vung tau', 'ba ria'] },

  // ── Đông Nam Á ───────────────────────────────────────────
  { code: 'SGSIN', name: 'Singapore', country: 'SG', countryName: 'Singapore', region: 'SEA', coord: [103.78, 1.24], w: 140, c: 0.45 },
  { code: 'MYPKG', name: 'Port Klang', country: 'MY', countryName: 'Malaysia', region: 'SEA', coord: [101.28, 2.97], approach: [[101.18, 2.93]], w: 70, c: 0.35 },
  { code: 'MYTPP', name: 'Tanjung Pelepas', country: 'MY', countryName: 'Malaysia', region: 'SEA', coord: [103.55, 1.33], approach: [[103.56, 1.25]], w: 55, c: 0.3 },
  { code: 'THLCH', name: 'Laem Chabang', country: 'TH', countryName: 'Thái Lan', region: 'SEA', coord: [100.86, 13.07], approach: [[100.75, 13.0], [100.7, 12.8]], w: 45, c: 0.3 },
  { code: 'IDTPP', name: 'Tanjung Priok (Jakarta)', country: 'ID', countryName: 'Indonesia', region: 'SEA', coord: [106.88, -6.09], approach: [[106.88, -5.95]], w: 40, c: 0.45 },
  { code: 'IDSUB', name: 'Surabaya (Tanjung Perak)', country: 'ID', countryName: 'Indonesia', region: 'SEA', coord: [112.72, -7.18], approach: [[112.7, -7.05], [112.65, -6.85]], w: 18, c: 0.4 },
  { code: 'PHMNL', name: 'Manila', country: 'PH', countryName: 'Philippines', region: 'SEA', coord: [120.94, 14.6], approach: [[120.8, 14.5], [120.6, 14.38], [120.45, 14.3]], w: 28, c: 0.5 },
  { code: 'KHKOS', name: 'Sihanoukville', country: 'KH', countryName: 'Campuchia', region: 'SEA', coord: [103.5, 10.64], approach: [[103.4, 10.55]], w: 10, c: 0.2 },
  { code: 'MMRGN', name: 'Yangon (Thilawa)', country: 'MM', countryName: 'Myanmar', region: 'SEA', coord: [96.25, 16.65], approach: [[96.3, 16.5], [96.4, 16.3], [96.5, 16.1], [96.5, 15.8]], w: 6, c: 0.5 },

  // ── Đông Bắc Á ───────────────────────────────────────────
  { code: 'CNSHA', name: 'Thượng Hải (Dương Sơn)', country: 'CN', countryName: 'Trung Quốc', region: 'NEA', coord: [122.06, 30.62], approach: [[122.2, 30.6], [122.4, 30.6]], w: 150, c: 0.5, aliases: ['shanghai', 'yangshan'] },
  { code: 'CNNGB', name: 'Ninh Ba – Chu Sơn', country: 'CN', countryName: 'Trung Quốc', region: 'NEA', coord: [122.05, 29.9], approach: [[122.3, 29.8], [122.6, 29.8]], w: 120, c: 0.45, aliases: ['ningbo', 'zhoushan'] },
  { code: 'CNSZX', name: 'Thâm Quyến (Diêm Điền)', country: 'CN', countryName: 'Trung Quốc', region: 'NEA', coord: [114.28, 22.56], approach: [[114.35, 22.5], [114.45, 22.35], [114.5, 22.15]], w: 110, c: 0.4, aliases: ['shenzhen', 'yantian'] },
  { code: 'CNCAN', name: 'Quảng Châu (Nam Sa)', country: 'CN', countryName: 'Trung Quốc', region: 'NEA', coord: [113.66, 22.72], approach: [[113.7, 22.6], [113.75, 22.4], [113.8, 22.2], [113.85, 22.0]], w: 80, c: 0.45, aliases: ['guangzhou', 'nansha'] },
  { code: 'CNTAO', name: 'Thanh Đảo', country: 'CN', countryName: 'Trung Quốc', region: 'NEA', coord: [120.22, 35.97], approach: [[120.32, 35.93], [120.45, 35.88]], w: 85, c: 0.4, aliases: ['qingdao'] },
  { code: 'CNTSN', name: 'Thiên Tân', country: 'CN', countryName: 'Trung Quốc', region: 'NEA', coord: [117.85, 38.97], approach: [[118.1, 38.95], [118.4, 38.9]], w: 60, c: 0.45, aliases: ['tianjin'] },
  { code: 'CNXMN', name: 'Hạ Môn', country: 'CN', countryName: 'Trung Quốc', region: 'NEA', coord: [118.07, 24.44], approach: [[118.15, 24.4], [118.3, 24.35]], w: 45, c: 0.3, aliases: ['xiamen'] },
  { code: 'CNDLC', name: 'Đại Liên', country: 'CN', countryName: 'Trung Quốc', region: 'NEA', coord: [121.95, 39.0], approach: [[122.05, 38.95], [122.3, 38.85]], w: 30, c: 0.3, aliases: ['dalian'] },
  { code: 'HKHKG', name: 'Hồng Kông', country: 'HK', countryName: 'Hồng Kông (TQ)', region: 'NEA', coord: [114.17, 22.29], approach: [[114.25, 22.29], [114.28, 22.22], [114.3, 22.1]], w: 90, c: 0.3, aliases: ['hong kong'] },
  { code: 'TWKHH', name: 'Cao Hùng', country: 'TW', countryName: 'Đài Loan', region: 'NEA', coord: [120.28, 22.56], approach: [[120.2, 22.52]], w: 50, c: 0.25, aliases: ['kaohsiung'] },
  { code: 'KRPUS', name: 'Busan', country: 'KR', countryName: 'Hàn Quốc', region: 'NEA', coord: [128.82, 35.06], approach: [[128.85, 34.95]], w: 110, c: 0.3, aliases: ['pusan'] },
  { code: 'KRINC', name: 'Incheon', country: 'KR', countryName: 'Hàn Quốc', region: 'NEA', coord: [126.6, 37.35], approach: [[126.45, 37.25], [126.2, 37.1], [125.9, 36.95]], w: 25, c: 0.25 },
  { code: 'JPTYO', name: 'Tokyo', country: 'JP', countryName: 'Nhật Bản', region: 'NEA', coord: [139.8, 35.6], approach: [[139.8, 35.45], [139.75, 35.25], [139.7, 35.05], [139.75, 34.85]], w: 40, c: 0.2 },
  { code: 'JPYOK', name: 'Yokohama', country: 'JP', countryName: 'Nhật Bản', region: 'NEA', coord: [139.68, 35.44], approach: [[139.75, 35.35], [139.75, 35.25], [139.7, 35.05], [139.75, 34.85]], w: 42, c: 0.2 },
  { code: 'JPUKB', name: 'Kobe', country: 'JP', countryName: 'Nhật Bản', region: 'NEA', coord: [135.22, 34.65], approach: [[135.15, 34.5], [135.07, 34.27], [135.0, 34.1], [135.0, 33.8]], w: 30, c: 0.2 },
  { code: 'JPNGO', name: 'Nagoya', country: 'JP', countryName: 'Nhật Bản', region: 'NEA', coord: [136.85, 35.0], approach: [[136.8, 34.85], [136.88, 34.62], [137.0, 34.52], [137.0, 34.3]], w: 28, c: 0.2 },

  // ── Nam Á ────────────────────────────────────────────────
  { code: 'INNSA', name: 'Nhava Sheva (JNPT)', country: 'IN', countryName: 'Ấn Độ', region: 'SA', coord: [72.95, 18.95], approach: [[72.85, 18.9], [72.7, 18.85]], w: 60, c: 0.5, aliases: ['mumbai', 'jnpt'] },
  { code: 'INMUN', name: 'Mundra', country: 'IN', countryName: 'Ấn Độ', region: 'SA', coord: [69.7, 22.74], approach: [[69.65, 22.6], [69.5, 22.45]], w: 50, c: 0.4 },
  { code: 'INMAA', name: 'Chennai', country: 'IN', countryName: 'Ấn Độ', region: 'SA', coord: [80.3, 13.1], approach: [[80.4, 13.1]], w: 30, c: 0.45 },
  { code: 'LKCMB', name: 'Colombo', country: 'LK', countryName: 'Sri Lanka', region: 'SA', coord: [79.84, 6.95], approach: [[79.75, 6.95]], w: 75, c: 0.35 },
  { code: 'BDCGP', name: 'Chittagong', country: 'BD', countryName: 'Bangladesh', region: 'SA', coord: [91.8, 22.25], approach: [[91.75, 22.15], [91.7, 21.9]], w: 20, c: 0.7 },
  { code: 'PKKHI', name: 'Karachi', country: 'PK', countryName: 'Pakistan', region: 'SA', coord: [66.97, 24.8], approach: [[66.9, 24.75], [66.8, 24.7]], w: 25, c: 0.5 },

  // ── Trung Đông ───────────────────────────────────────────
  { code: 'AEJEA', name: 'Jebel Ali (Dubai)', country: 'AE', countryName: 'UAE', region: 'ME', coord: [55.03, 25.02], approach: [[54.95, 25.1]], w: 80, c: 0.3, aliases: ['dubai'] },
  { code: 'OMSLL', name: 'Salalah', country: 'OM', countryName: 'Oman', region: 'ME', coord: [54.0, 16.94], approach: [[54.0, 16.85]], w: 30, c: 0.25 },
  { code: 'SAJED', name: 'Jeddah', country: 'SA', countryName: 'Ả Rập Xê Út', region: 'ME', coord: [39.15, 21.47], approach: [[39.05, 21.47]], w: 45, c: 0.35 },
  { code: 'QAHMD', name: 'Hamad (Doha)', country: 'QA', countryName: 'Qatar', region: 'ME', coord: [51.65, 25.0], approach: [[51.75, 25.0]], w: 18, c: 0.2 },
  { code: 'EGPSD', name: 'Port Said', country: 'EG', countryName: 'Ai Cập', region: 'MED', coord: [32.36, 31.24], approach: [[32.4, 31.35]], w: 40, c: 0.35 },

  // ── Bắc & Tây Âu ─────────────────────────────────────────
  { code: 'NLRTM', name: 'Rotterdam', country: 'NL', countryName: 'Hà Lan', region: 'EU', coord: [4.02, 51.96], approach: [[3.9, 52.0]], w: 120, c: 0.4 },
  { code: 'BEANR', name: 'Antwerp-Bruges', country: 'BE', countryName: 'Bỉ', region: 'EU', coord: [4.3, 51.3], approach: [[4.25, 51.36], [4.18, 51.4], [4.05, 51.4], [3.85, 51.42], [3.65, 51.43], [3.5, 51.45], [3.3, 51.5]], w: 100, c: 0.4, aliases: ['antwerpen'] },
  { code: 'DEHAM', name: 'Hamburg', country: 'DE', countryName: 'Đức', region: 'EU', coord: [9.93, 53.54], approach: [[9.8, 53.56], [9.6, 53.58], [9.4, 53.65], [9.2, 53.8], [9.05, 53.87], [8.8, 53.9], [8.55, 53.95], [8.3, 54.0], [8.0, 54.03]], w: 95, c: 0.45 },
  { code: 'DEBRV', name: 'Bremerhaven', country: 'DE', countryName: 'Đức', region: 'EU', coord: [8.55, 53.58], approach: [[8.48, 53.65], [8.35, 53.75], [8.2, 53.85], [8.0, 53.95]], w: 60, c: 0.35 },
  { code: 'FRLEH', name: 'Le Havre', country: 'FR', countryName: 'Pháp', region: 'EU', coord: [0.1, 49.48], approach: [[-0.05, 49.52]], w: 50, c: 0.3 },
  { code: 'GBFXT', name: 'Felixstowe', country: 'GB', countryName: 'Anh', region: 'EU', coord: [1.33, 51.94], approach: [[1.4, 51.93], [1.6, 51.9]], w: 60, c: 0.4 },
  { code: 'GBSOU', name: 'Southampton', country: 'GB', countryName: 'Anh', region: 'EU', coord: [-1.4, 50.89], approach: [[-1.33, 50.83], [-1.3, 50.78], [-1.1, 50.72], [-1.0, 50.65]], w: 40, c: 0.3 },
  { code: 'GBLGP', name: 'London Gateway', country: 'GB', countryName: 'Anh', region: 'EU', coord: [0.48, 51.5], approach: [[0.7, 51.5], [0.95, 51.5], [1.3, 51.55], [1.6, 51.55]], w: 35, c: 0.3 },
  { code: 'PLGDN', name: 'Gdańsk', country: 'PL', countryName: 'Ba Lan', region: 'EU', coord: [18.7, 54.4], approach: [[18.75, 54.5]], w: 20, c: 0.25 },
  { code: 'SEGOT', name: 'Gothenburg', country: 'SE', countryName: 'Thụy Điển', region: 'EU', coord: [11.82, 57.69], approach: [[11.72, 57.67], [11.6, 57.65]], w: 20, c: 0.2 },
  { code: 'PTSIN', name: 'Sines', country: 'PT', countryName: 'Bồ Đào Nha', region: 'EU', coord: [-8.88, 37.94], approach: [[-8.95, 37.93]], w: 25, c: 0.2 },

  // ── Địa Trung Hải ────────────────────────────────────────
  { code: 'ESALG', name: 'Algeciras', country: 'ES', countryName: 'Tây Ban Nha', region: 'MED', coord: [-5.43, 36.13], approach: [[-5.38, 36.08]], w: 70, c: 0.3 },
  { code: 'ESVLC', name: 'Valencia', country: 'ES', countryName: 'Tây Ban Nha', region: 'MED', coord: [-0.31, 39.44], approach: [[-0.2, 39.43]], w: 60, c: 0.3 },
  { code: 'ESBCN', name: 'Barcelona', country: 'ES', countryName: 'Tây Ban Nha', region: 'MED', coord: [2.17, 41.33], approach: [[2.25, 41.3]], w: 40, c: 0.25 },
  { code: 'ITGOA', name: 'Genoa', country: 'IT', countryName: 'Ý', region: 'MED', coord: [8.9, 44.4], approach: [[8.9, 44.3]], w: 35, c: 0.3, aliases: ['genova'] },
  { code: 'ITGIT', name: 'Gioia Tauro', country: 'IT', countryName: 'Ý', region: 'MED', coord: [15.89, 38.45], approach: [[15.8, 38.45]], w: 30, c: 0.25 },
  { code: 'GRPIR', name: 'Piraeus', country: 'GR', countryName: 'Hy Lạp', region: 'MED', coord: [23.57, 37.94], approach: [[23.55, 37.85], [23.5, 37.7]], w: 55, c: 0.3 },
  { code: 'MTMAR', name: 'Marsaxlokk', country: 'MT', countryName: 'Malta', region: 'MED', coord: [14.55, 35.82], approach: [[14.6, 35.8]], w: 30, c: 0.2 },
  { code: 'TRAMR', name: 'Ambarlı (Istanbul)', country: 'TR', countryName: 'Thổ Nhĩ Kỳ', region: 'MED', coord: [28.68, 40.96], approach: [[28.7, 40.85]], w: 35, c: 0.4, aliases: ['istanbul', 'ambarli'] },
  { code: 'MAPTM', name: 'Tanger Med', country: 'MA', countryName: 'Maroc', region: 'MED', coord: [-5.5, 35.89], approach: [[-5.48, 35.93]], w: 65, c: 0.25 },

  // ── Châu Phi ─────────────────────────────────────────────
  { code: 'ZADUR', name: 'Durban', country: 'ZA', countryName: 'Nam Phi', region: 'AF', coord: [31.04, -29.88], approach: [[31.1, -29.9]], w: 30, c: 0.55 },
  { code: 'ZACPT', name: 'Cape Town', country: 'ZA', countryName: 'Nam Phi', region: 'AF', coord: [18.44, -33.9], approach: [[18.42, -33.8]], w: 15, c: 0.45 },
  { code: 'NGLOS', name: 'Lagos (Apapa)', country: 'NG', countryName: 'Nigeria', region: 'AF', coord: [3.39, 6.4], approach: [[3.4, 6.3]], w: 22, c: 0.75 },
  { code: 'GHTEM', name: 'Tema', country: 'GH', countryName: 'Ghana', region: 'AF', coord: [0.01, 5.62], approach: [[0.02, 5.55]], w: 18, c: 0.35 },
  { code: 'CIABJ', name: 'Abidjan', country: 'CI', countryName: 'Bờ Biển Ngà', region: 'AF', coord: [-4.01, 5.24], approach: [[-4.01, 5.18]], w: 16, c: 0.35 },
  { code: 'TGLFW', name: 'Lomé', country: 'TG', countryName: 'Togo', region: 'AF', coord: [1.28, 6.12], approach: [[1.28, 6.05]], w: 20, c: 0.3 },
  { code: 'SNDKR', name: 'Dakar', country: 'SN', countryName: 'Senegal', region: 'AF', coord: [-17.42, 14.68], approach: [[-17.38, 14.62], [-17.35, 14.55]], w: 12, c: 0.3 },
  { code: 'KEMBA', name: 'Mombasa', country: 'KE', countryName: 'Kenya', region: 'AF', coord: [39.65, -4.06], approach: [[39.66, -4.09], [39.7, -4.12], [39.8, -4.12]], w: 18, c: 0.5 },
  { code: 'TZDAR', name: 'Dar es Salaam', country: 'TZ', countryName: 'Tanzania', region: 'AF', coord: [39.3, -6.83], approach: [[39.35, -6.8], [39.45, -6.8]], w: 14, c: 0.6 },
  { code: 'DJJIB', name: 'Djibouti', country: 'DJ', countryName: 'Djibouti', region: 'AF', coord: [43.13, 11.6], approach: [[43.2, 11.68], [43.35, 11.75], [43.5, 11.8]], w: 20, c: 0.3 },
  { code: 'EGALY', name: 'Alexandria', country: 'EG', countryName: 'Ai Cập', region: 'MED', coord: [29.87, 31.19], approach: [[29.85, 31.25]], w: 22, c: 0.45 },

  // ── Bắc Mỹ ───────────────────────────────────────────────
  { code: 'USLAX', name: 'Los Angeles', country: 'US', countryName: 'Hoa Kỳ', region: 'NA', coord: [-118.26, 33.72], approach: [[-118.25, 33.68], [-118.3, 33.6]], w: 75, c: 0.45 },
  { code: 'USLGB', name: 'Long Beach', country: 'US', countryName: 'Hoa Kỳ', region: 'NA', coord: [-118.2, 33.74], approach: [[-118.18, 33.69], [-118.2, 33.6]], w: 70, c: 0.45 },
  { code: 'USOAK', name: 'Oakland', country: 'US', countryName: 'Hoa Kỳ', region: 'NA', coord: [-122.32, 37.8], approach: [[-122.38, 37.81], [-122.46, 37.81], [-122.5, 37.8], [-122.65, 37.77]], w: 30, c: 0.3 },
  { code: 'USSEA', name: 'Seattle', country: 'US', countryName: 'Hoa Kỳ', region: 'NA', coord: [-122.36, 47.59], approach: [[-122.42, 47.62], [-122.45, 47.75], [-122.48, 47.9], [-122.65, 48.1], [-122.8, 48.2], [-123.1, 48.25], [-123.5, 48.25], [-124.0, 48.35], [-124.5, 48.45], [-124.85, 48.45]], w: 30, c: 0.3, aliases: ['tacoma'] },
  { code: 'USNYC', name: 'New York – New Jersey', country: 'US', countryName: 'Hoa Kỳ', region: 'NA', coord: [-74.05, 40.67], approach: [[-74.04, 40.6], [-74.02, 40.5], [-73.9, 40.45], [-73.8, 40.4]], w: 70, c: 0.4, aliases: ['newark'] },
  { code: 'USSAV', name: 'Savannah', country: 'US', countryName: 'Hoa Kỳ', region: 'NA', coord: [-81.14, 32.12], approach: [[-81.0, 32.05], [-80.9, 32.03], [-80.75, 31.98]], w: 55, c: 0.4 },
  { code: 'USCHS', name: 'Charleston', country: 'US', countryName: 'Hoa Kỳ', region: 'NA', coord: [-79.92, 32.78], approach: [[-79.87, 32.75], [-79.75, 32.7]], w: 35, c: 0.3 },
  { code: 'USORF', name: 'Norfolk (Virginia)', country: 'US', countryName: 'Hoa Kỳ', region: 'NA', coord: [-76.33, 36.93], approach: [[-76.2, 36.97], [-76.05, 36.95], [-75.85, 36.92]], w: 40, c: 0.3 },
  { code: 'USHOU', name: 'Houston', country: 'US', countryName: 'Hoa Kỳ', region: 'NA', coord: [-95.0, 29.66], approach: [[-94.95, 29.55], [-94.85, 29.4], [-94.72, 29.33], [-94.6, 29.25]], w: 40, c: 0.35 },
  { code: 'USMIA', name: 'Miami', country: 'US', countryName: 'Hoa Kỳ', region: 'NA', coord: [-80.16, 25.77], approach: [[-80.1, 25.76], [-80.0, 25.75]], w: 25, c: 0.25 },
  { code: 'CAVAN', name: 'Vancouver', country: 'CA', countryName: 'Canada', region: 'NA', coord: [-123.1, 49.29], approach: [[-123.25, 49.31], [-123.4, 49.25], [-123.35, 49.05], [-123.25, 48.75], [-123.2, 48.5], [-123.4, 48.3], [-124.0, 48.35], [-124.5, 48.45], [-124.85, 48.45]], w: 40, c: 0.4 },
  { code: 'CAPRR', name: 'Prince Rupert', country: 'CA', countryName: 'Canada', region: 'NA', coord: [-130.35, 54.3], approach: [[-130.5, 54.25], [-130.8, 54.2]], w: 10, c: 0.2 },
  { code: 'CAHAL', name: 'Halifax', country: 'CA', countryName: 'Canada', region: 'NA', coord: [-63.56, 44.63], approach: [[-63.52, 44.55], [-63.45, 44.45]], w: 18, c: 0.2 },
  { code: 'MXZLO', name: 'Manzanillo (Mexico)', country: 'MX', countryName: 'Mexico', region: 'LATAM', coord: [-104.3, 19.06], approach: [[-104.33, 19.02]], w: 35, c: 0.35 },

  // ── Mỹ Latinh & Caribe ───────────────────────────────────
  { code: 'PAONX', name: 'Colón (MIT)', country: 'PA', countryName: 'Panama', region: 'LATAM', coord: [-79.88, 9.37], approach: [[-79.9, 9.42]], w: 50, c: 0.3 },
  { code: 'PABLB', name: 'Balboa', country: 'PA', countryName: 'Panama', region: 'LATAM', coord: [-79.57, 8.94], approach: [[-79.53, 8.85]], w: 45, c: 0.3 },
  { code: 'COCTG', name: 'Cartagena', country: 'CO', countryName: 'Colombia', region: 'LATAM', coord: [-75.53, 10.38], approach: [[-75.58, 10.32], [-75.65, 10.3]], w: 40, c: 0.25 },
  { code: 'JMKIN', name: 'Kingston', country: 'JM', countryName: 'Jamaica', region: 'LATAM', coord: [-76.82, 17.97], approach: [[-76.84, 17.92], [-76.8, 17.85]], w: 25, c: 0.25 },
  { code: 'BRSSZ', name: 'Santos', country: 'BR', countryName: 'Brazil', region: 'LATAM', coord: [-46.3, -23.96], approach: [[-46.32, -24.0], [-46.35, -24.05]], w: 45, c: 0.5 },
  { code: 'BRPNG', name: 'Paranaguá', country: 'BR', countryName: 'Brazil', region: 'LATAM', coord: [-48.5, -25.5], approach: [[-48.4, -25.55], [-48.3, -25.58], [-48.2, -25.6]], w: 20, c: 0.45 },
  { code: 'ARBUE', name: 'Buenos Aires', country: 'AR', countryName: 'Argentina', region: 'LATAM', coord: [-58.36, -34.58], approach: [[-58.2, -34.6], [-57.8, -34.75], [-57.3, -34.95], [-56.5, -35.1], [-55.8, -35.2], [-55.0, -35.4]], w: 20, c: 0.4 },
  { code: 'UYMVD', name: 'Montevideo', country: 'UY', countryName: 'Uruguay', region: 'LATAM', coord: [-56.21, -34.9], approach: [[-56.2, -35.0], [-55.5, -35.2]], w: 15, c: 0.3 },
  { code: 'CLSAI', name: 'San Antonio', country: 'CL', countryName: 'Chile', region: 'LATAM', coord: [-71.62, -33.59], approach: [[-71.68, -33.58]], w: 20, c: 0.3 },
  { code: 'PECLL', name: 'Callao', country: 'PE', countryName: 'Peru', region: 'LATAM', coord: [-77.15, -12.05], approach: [[-77.22, -12.05]], w: 30, c: 0.4 },

  // ── Châu Đại Dương ───────────────────────────────────────
  { code: 'AUMEL', name: 'Melbourne', country: 'AU', countryName: 'Úc', region: 'OC', coord: [144.92, -37.84], approach: [[144.9, -37.95], [144.8, -38.1], [144.7, -38.22], [144.63, -38.3], [144.6, -38.4]], w: 30, c: 0.35 },
  { code: 'AUSYD', name: 'Sydney (Port Botany)', country: 'AU', countryName: 'Úc', region: 'OC', coord: [151.22, -33.97], approach: [[151.25, -34.0], [151.3, -34.05]], w: 30, c: 0.35 },
  { code: 'AUBNE', name: 'Brisbane', country: 'AU', countryName: 'Úc', region: 'OC', coord: [153.17, -27.38], approach: [[153.2, -27.2], [153.25, -26.95], [153.4, -26.9]], w: 22, c: 0.3 },
  { code: 'AUFRE', name: 'Fremantle', country: 'AU', countryName: 'Úc', region: 'OC', coord: [115.74, -32.05], approach: [[115.65, -32.05]], w: 18, c: 0.3 },
  { code: 'NZAKL', name: 'Auckland', country: 'NZ', countryName: 'New Zealand', region: 'OC', coord: [174.78, -36.84], approach: [[174.85, -36.82], [175.0, -36.75], [175.1, -36.6]], w: 15, c: 0.35 },
];

export const PORTS: Port[] = RAW.map(({ w, c, ...p }) => ({ ...p, weeklyServices: w ?? 10, congestion: c ?? 0.3 }));

export const PORT_BY_CODE: Record<string, Port> = Object.fromEntries(PORTS.map((p) => [p.code, p]));

export function getPort(code: string | null | undefined): Port | undefined {
  return code ? PORT_BY_CODE[code] : undefined;
}

/** Nút chọn nhanh cảng Việt Nam */
export const VN_QUICK = [
  { label: 'Bắc', code: 'VNHPH' },
  { label: 'Trung', code: 'VNDAD' },
  { label: 'Nam', code: 'VNSGN' },
] as const;

export const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);
export const ASEAN_COUNTRIES = new Set(['VN', 'SG', 'MY', 'TH', 'ID', 'PH', 'KH', 'MM', 'LA', 'BN']);

/** Bỏ dấu tiếng Việt để tìm kiếm */
export function normalizeVi(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function searchPorts(query: string): Port[] {
  const q = normalizeVi(query.trim());
  if (!q) return PORTS;
  return PORTS.filter((p) => {
    const hay = normalizeVi([p.name, p.code, p.countryName, p.country, REGION_NAMES[p.region], ...(p.aliases ?? [])].join(' '));
    return q.split(/\s+/).every((t) => hay.includes(t));
  });
}
