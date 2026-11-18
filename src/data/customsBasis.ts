/**
 * Cơ sở xác định TRỊ GIÁ TÍNH THUẾ nhập khẩu theo nước: CIF (gồm cước + bảo hiểm tới cửa khẩu nhập)
 * hoặc FOB (không gồm cước, bảo hiểm quốc tế).
 * `verified` = đã được người dùng đối chiếu với văn bản hiện hành. Mặc định CHƯA xác minh – hãy mở link nguồn để kiểm tra.
 */
export interface CustomsBasis {
  basis: 'CIF' | 'FOB';
  verified: boolean;
  /** Trang tra cứu / cơ quan hải quan chính thức */
  source: string;
  sourceLabel: string;
  note?: string;
}

const EU_SRC = { source: 'https://taxation-customs.ec.europa.eu/', sourceLabel: 'EU – DG TAXUD / TARIC' };

export const CUSTOMS_BASIS: Record<string, CustomsBasis> = {
  VN: { basis: 'CIF', verified: false, source: 'https://www.customs.gov.vn/', sourceLabel: 'Tổng cục Hải quan Việt Nam' },
  EU: { basis: 'CIF', verified: false, ...EU_SRC },
  GB: { basis: 'CIF', verified: false, source: 'https://www.trade-tariff.service.gov.uk/', sourceLabel: 'UK Trade Tariff' },
  US: { basis: 'FOB', verified: false, source: 'https://hts.usitc.gov/', sourceLabel: 'US HTS (USITC) / CBP', note: 'Mỹ không có VAT liên bang; có phí MPF/HMF riêng' },
  CA: { basis: 'FOB', verified: false, source: 'https://www.cbsa-asfc.gc.ca/', sourceLabel: 'CBSA Canada' },
  AU: { basis: 'FOB', verified: false, source: 'https://www.abf.gov.au/', sourceLabel: 'Australian Border Force' },
  NZ: { basis: 'FOB', verified: false, source: 'https://www.customs.govt.nz/', sourceLabel: 'New Zealand Customs' },
  ZA: { basis: 'FOB', verified: false, source: 'https://www.sars.gov.za/', sourceLabel: 'SARS South Africa' },
  CN: { basis: 'CIF', verified: false, source: 'http://english.customs.gov.cn/', sourceLabel: 'Hải quan Trung Quốc (GACC)' },
  JP: { basis: 'CIF', verified: false, source: 'https://www.customs.go.jp/english/', sourceLabel: 'Japan Customs' },
  KR: { basis: 'CIF', verified: false, source: 'https://www.customs.go.kr/english/', sourceLabel: 'Korea Customs Service' },
  IN: { basis: 'CIF', verified: false, source: 'https://www.cbic.gov.in/', sourceLabel: 'CBIC India' },
  SG: { basis: 'CIF', verified: false, source: 'https://www.customs.gov.sg/', sourceLabel: 'Singapore Customs' },
  TH: { basis: 'CIF', verified: false, source: 'https://www.customs.go.th/', sourceLabel: 'Thai Customs' },
};

const EU = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' '));

/** Mặc định CIF (đa số nước theo Hiệp định trị giá WTO chọn CIF) – luôn hiển thị là CHƯA xác minh */
export function customsBasisOf(iso2: string): CustomsBasis & { country: string } {
  const hit = CUSTOMS_BASIS[iso2] ?? (EU.has(iso2) ? CUSTOMS_BASIS.EU : undefined);
  if (hit) return { ...hit, country: iso2 };
  return { basis: 'CIF', verified: false, source: 'https://ttd.wto.org/', sourceLabel: 'WTO Tariff & Trade Data', note: 'Chưa có dữ liệu riêng cho nước này – tạm dùng CIF', country: iso2 };
}

/** Link tra cứu biểu thuế chính thức theo nước nhập */
export function tariffLookupLink(iso2: string): { url: string; label: string } {
  if (iso2 === 'VN') return { url: 'https://www.customs.gov.vn/', label: 'Biểu thuế – Hải quan Việt Nam' };
  if (EU.has(iso2)) return { url: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp', label: 'EU TARIC' };
  if (iso2 === 'GB') return { url: 'https://www.trade-tariff.service.gov.uk/', label: 'UK Trade Tariff' };
  if (iso2 === 'US') return { url: 'https://hts.usitc.gov/', label: 'US HTS' };
  return { url: 'https://ttd.wto.org/', label: 'WTO Tariff & Trade Data' };
}

/**
 * Cơ sở tính VAT/GST khi nhập khẩu – có thể KHÁC cơ sở tính thuế nhập khẩu.
 *  - Úc: GST trên VoTI = customs value + duty + cước & bảo hiểm quốc tế (+ WET). Nguồn: ABF "GST and other taxes when importing".
 *  - New Zealand: GST trên customs value + duty + cước & bảo hiểm quốc tế. Nguồn: NZ Customs.
 * Nước khác: trị giá tính thuế nhập khẩu (CIF/FOB như trên) + thuế NK + thuế khác.
 */
export const VAT_BASIS: Record<string, { basis: 'CIF'; source: string }> = {
  AU: { basis: 'CIF', source: 'https://www.abf.gov.au/importing-exporting-and-manufacturing/importing/cost-of-importing-goods/gst-and-other-taxes' },
  NZ: { basis: 'CIF', source: 'https://www.customs.govt.nz/' },
};

export function vatBasisOf(iso2: string): 'CIF' | 'customs' {
  return VAT_BASIS[iso2]?.basis ?? 'customs';
}
