/**
 * Hãng tàu container lớn. `alliance` là thông tin tham khảo tại thời điểm `allianceAsOf` và CHƯA xác minh –
 * liên minh hãng tàu thay đổi theo năm, hãy kiểm tra lại trước khi dùng.
 */
export interface Carrier {
  id: string;
  name: string;
  scac: string;
  alliance: string;
  allianceAsOf: string;
  allianceVerified: boolean;
  /** Hãng là thành viên DCSA – có thể cung cấp API lịch tàu theo chuẩn DCSA (cần key riêng; chưa xác minh) */
  dcsaApi: boolean;
  /** Trang chủ của hãng – vào mục Schedules để tra lịch tàu */
  scheduleUrl: string;
}

const A = '2025';
export const CARRIERS: Carrier[] = [
  { id: 'MSC', name: 'MSC', scac: 'MSCU', alliance: 'Độc lập', allianceAsOf: A, allianceVerified: false, dcsaApi: true, scheduleUrl: 'https://www.msc.com/' },
  { id: 'MAERSK', name: 'Maersk', scac: 'MAEU', alliance: 'Gemini Cooperation', allianceAsOf: A, allianceVerified: false, dcsaApi: true, scheduleUrl: 'https://www.maersk.com/' },
  { id: 'CMACGM', name: 'CMA CGM', scac: 'CMDU', alliance: 'Ocean Alliance', allianceAsOf: A, allianceVerified: false, dcsaApi: true, scheduleUrl: 'https://www.cma-cgm.com/' },
  { id: 'COSCO', name: 'COSCO', scac: 'COSU', alliance: 'Ocean Alliance', allianceAsOf: A, allianceVerified: false, dcsaApi: false, scheduleUrl: 'https://lines.coscoshipping.com/' },
  { id: 'HAPAG', name: 'Hapag-Lloyd', scac: 'HLCU', alliance: 'Gemini Cooperation', allianceAsOf: A, allianceVerified: false, dcsaApi: true, scheduleUrl: 'https://www.hapag-lloyd.com/' },
  { id: 'ONE', name: 'ONE', scac: 'ONEY', alliance: 'Premier Alliance', allianceAsOf: A, allianceVerified: false, dcsaApi: true, scheduleUrl: 'https://www.one-line.com/' },
  { id: 'EVERGREEN', name: 'Evergreen', scac: 'EGLV', alliance: 'Ocean Alliance', allianceAsOf: A, allianceVerified: false, dcsaApi: true, scheduleUrl: 'https://www.evergreen-line.com/' },
  { id: 'HMM', name: 'HMM', scac: 'HDMU', alliance: 'Premier Alliance', allianceAsOf: A, allianceVerified: false, dcsaApi: true, scheduleUrl: 'https://www.hmm21.com/' },
  { id: 'YANGMING', name: 'Yang Ming', scac: 'YMLU', alliance: 'Premier Alliance', allianceAsOf: A, allianceVerified: false, dcsaApi: true, scheduleUrl: 'https://www.yangming.com/' },
  { id: 'ZIM', name: 'ZIM', scac: 'ZIMU', alliance: 'Độc lập', allianceAsOf: A, allianceVerified: false, dcsaApi: true, scheduleUrl: 'https://www.zim.com/' },
  { id: 'OOCL', name: 'OOCL', scac: 'OOLU', alliance: 'Ocean Alliance', allianceAsOf: A, allianceVerified: false, dcsaApi: false, scheduleUrl: 'https://www.oocl.com/' },
  { id: 'WANHAI', name: 'Wan Hai', scac: 'WHLC', alliance: 'Độc lập', allianceAsOf: A, allianceVerified: false, dcsaApi: false, scheduleUrl: 'https://www.wanhai.com/' },
  { id: 'PIL', name: 'PIL', scac: 'PCIU', alliance: 'Độc lập', allianceAsOf: A, allianceVerified: false, dcsaApi: false, scheduleUrl: 'https://www.pilship.com/' },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Tìm hãng theo id, SCAC hoặc tên (dùng khi import CSV) */
export function findCarrier(text: string | undefined): Carrier | undefined {
  if (!text) return undefined;
  const t = norm(text);
  return CARRIERS.find((c) => norm(c.id) === t || norm(c.scac) === t || norm(c.name) === t);
}
