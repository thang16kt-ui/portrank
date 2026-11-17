import countries from 'i18n-iso-countries';
import vi from 'i18n-iso-countries/langs/vi.json';
import en from 'i18n-iso-countries/langs/en.json';
import type { RegionId } from '../types';

countries.registerLocale(vi);
countries.registerLocale(en);

/** Khu vực (để chọn đơn giá vận tải nội địa…) */
const REGION_OF: Record<RegionId, string> = {
  SEA: 'VN TH MY SG ID PH KH LA MM BN TL',
  NEA: 'CN JP KR KP TW HK MO MN',
  SA: 'IN PK BD LK NP BT MV AF',
  ME: 'AE SA QA OM KW BH IQ IR JO IL PS LB SY YE',
  EU: 'DE NL BE FR GB IE LU CH AT DK SE NO FI IS PL CZ SK HU EE LV LT BY UA MD RU LI',
  MED: 'ES PT IT GR MT CY TR HR SI BA RS ME AL MK BG RO XK AD MC SM VA GE AM AZ KZ UZ TM KG TJ',
  AF: 'EG MA DZ TN LY SD SS ET ER DJ SO KE TZ UG RW BI CD CG GA GQ CM CF TD NE NG BJ TG GH CI LR SL GN GW SN GM ML BF MR CV ST AO ZM ZW MW MZ MG NA BW ZA LS SZ KM SC MU EH',
  NA: 'US CA MX',
  LATAM: 'GT BZ SV HN NI CR PA CU JM HT DO PR BS TT BB CO VE GY SR EC PE BO BR PY UY AR CL GF',
  OC: 'AU NZ PG FJ SB VU NC WS TO PF',
};
const regionByIso = new Map<string, RegionId>();
(Object.keys(REGION_OF) as RegionId[]).forEach((r) => REGION_OF[r].split(' ').forEach((c) => regionByIso.set(c, r)));

/** Tên ngắn gọn thường dùng (ghi đè tên chính thức dài) */
const NAME_OVERRIDE: Record<string, string> = {
  US: 'Hoa Kỳ (Mỹ)', GB: 'Anh (Vương quốc Anh)', KR: 'Hàn Quốc', KP: 'Triều Tiên', RU: 'Nga', LA: 'Lào', CZ: 'Séc', TW: 'Đài Loan',
  HK: 'Hồng Kông', MO: 'Ma Cao', AE: 'UAE (Các Tiểu vương quốc Ả Rập Thống nhất)', IR: 'Iran', SY: 'Syria', VE: 'Venezuela', BO: 'Bolivia',
  TZ: 'Tanzania', MD: 'Moldova', CI: 'Bờ Biển Ngà', CD: 'CHDC Congo', CG: 'Cộng hòa Congo', MK: 'Bắc Macedonia', TR: 'Thổ Nhĩ Kỳ',
};
const EXTRA_ALIAS: Record<string, string> = {
  US: 'my usa hoa ky america united states', GB: 'anh uk england britain united kingdom', CN: 'trung quoc tq china', DE: 'duc germany deutschland',
  FR: 'phap france', JP: 'nhat ban nhat japan', KR: 'han quoc korea', NL: 'ha lan netherlands holland', AU: 'uc australia', RU: 'nga russia',
  ES: 'tay ban nha spain', IT: 'y italia italy', IN: 'an do india', TH: 'thai lan thailand', BE: 'bi belgium', CH: 'thuy si switzerland',
  SE: 'thuy dien sweden', PL: 'ba lan poland', AE: 'uae dubai emirates', CA: 'canada', MX: 'mexico', BR: 'brazil', SG: 'singapore',
  TW: 'dai loan taiwan', HK: 'hong kong', VN: 'viet nam vietnam vn', KH: 'campuchia cambodia', LA: 'lao laos', ID: 'indonesia', MY: 'malaysia ma lai',
  PH: 'philippines phi luat tan', AT: 'ao austria', CZ: 'sec czech', DK: 'dan mach denmark', NO: 'na uy norway', FI: 'phan lan finland', PT: 'bo dao nha portugal',
  GR: 'hy lap greece', TR: 'tho nhi ky turkey turkiye', EG: 'ai cap egypt', ZA: 'nam phi south africa', NZ: 'new zealand', SA: 'a rap xe ut saudi',
};

export interface Country {
  iso2: string;
  /** Tên tiếng Việt */
  name: string;
  nameEn: string;
  region: RegionId;
  /** Chuỗi tìm kiếm không dấu */
  search: string;
}

export const stripAccents = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

const viNames = countries.getNames('vi');
const enNames = countries.getNames('en');

export const COUNTRIES: Country[] = Object.keys(enNames)
  .filter((iso2) => regionByIso.has(iso2))
  .map((iso2) => {
    const name = NAME_OVERRIDE[iso2] ?? viNames[iso2] ?? enNames[iso2];
    const nameEn = enNames[iso2];
    return { iso2, name, nameEn, region: regionByIso.get(iso2)!, search: stripAccents(`${name} ${nameEn} ${iso2} ${EXTRA_ALIAS[iso2] ?? ''}`) };
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

const byIso = new Map(COUNTRIES.map((c) => [c.iso2, c]));
export const getCountry = (iso2: string) => byIso.get(iso2);
export const countryName = (iso2: string) => byIso.get(iso2)?.name ?? iso2;
export const regionOf = (iso2: string): RegionId => regionByIso.get(iso2) ?? 'EU';
export const numericToIso2 = (id: string | number | undefined) => (id == null ? undefined : countries.numericToAlpha2(String(id).padStart(3, '0')));

export function searchCountries(q: string, limit = 6): Country[] {
  const s = stripAccents(q.trim());
  if (!s) return [];
  const scored = COUNTRIES.map((c) => {
    const nm = stripAccents(c.name), ne = c.nameEn.toLowerCase();
    let score = -1;
    if (nm === s || ne === s || c.iso2.toLowerCase() === s) score = 100;
    else if (nm.startsWith(s) || ne.startsWith(s)) score = 80;
    else if (c.search.split(' ').some((w) => w.startsWith(s)) || c.search.includes(` ${s}`)) score = 60;
    else if (s.length >= 3 && c.search.includes(s)) score = 40;
    return { c, score };
  }).filter((x) => x.score > 0);
  return scored.sort((a, b) => b.score - a.score || a.c.name.length - b.c.name.length).slice(0, limit).map((x) => x.c);
}

/* ───── Khối thương mại (gợi ý FTA, thủ tục) ───── */
export const EU_SET = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' '));
export const ASEAN_SET = new Set('VN SG MY TH ID PH KH MM LA BN'.split(' '));
export const RCEP_SET = new Set([...ASEAN_SET, 'CN', 'JP', 'KR', 'AU', 'NZ']);
export const CPTPP_SET = new Set('VN JP CA AU NZ SG MY BN MX CL PE GB'.split(' '));

/** Hiệp định có thể áp dụng giữa nước xuất và nước nhập (chỉ để NHẮC kiểm tra, không tự áp thuế suất) */
export function ftasBetween(exp: string, imp: string): string[] {
  const out: string[] = [];
  const pair = (a: string, b: string) => (exp === a && imp === b) || (exp === b && imp === a);
  if ((exp === 'VN' && EU_SET.has(imp)) || (imp === 'VN' && EU_SET.has(exp))) out.push('EVFTA');
  if (pair('VN', 'GB')) out.push('UKVFTA');
  if (ASEAN_SET.has(exp) && ASEAN_SET.has(imp) && exp !== imp) out.push('ATIGA');
  if (RCEP_SET.has(exp) && RCEP_SET.has(imp) && exp !== imp) out.push('RCEP');
  if (CPTPP_SET.has(exp) && CPTPP_SET.has(imp) && exp !== imp) out.push('CPTPP');
  if (pair('VN', 'KR')) out.push('VKFTA');
  if (pair('VN', 'JP')) out.push('VJEPA');
  if ((exp === 'VN' && imp === 'CN') || (exp === 'CN' && imp === 'VN')) out.push('ACFTA');
  return out;
}
