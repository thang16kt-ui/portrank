import type { LngLat } from '../types';
import { stripAccents } from './countries';

/**
 * Danh sách thành phố lớn (dự phòng offline cho geocoding) – toạ độ làm tròn, chính xác mức thành phố.
 * Định dạng: Tên|Mã nước|vĩ độ|kinh độ|từ khoá phụ. Thành phố đứng trước trong mỗi nước = quan trọng hơn.
 */
const RAW = `
TP. Hồ Chí Minh|VN|10.78|106.70|sai gon saigon hcm ho chi minh city
Hà Nội|VN|21.03|105.85|hanoi
Bình Dương|VN|11.17|106.67|thu dau mot vsip di an thuan an
Đồng Nai|VN|10.95|106.82|bien hoa nhon trach long thanh
Hải Phòng|VN|20.86|106.68|hai phong
Đà Nẵng|VN|16.05|108.21|da nang
Bắc Ninh|VN|21.18|106.07|yen phong que vo
Bắc Giang|VN|21.28|106.20|
Hải Dương|VN|20.94|106.33|
Hưng Yên|VN|20.65|106.05|pho noi
Vĩnh Phúc|VN|21.31|105.60|vinh yen
Thái Nguyên|VN|21.59|105.84|
Quảng Ninh|VN|20.95|107.08|ha long mong cai
Nam Định|VN|20.43|106.17|
Thanh Hóa|VN|19.81|105.78|nghi son
Nghệ An|VN|18.68|105.68|vinh
Hà Tĩnh|VN|18.34|105.90|vung ang
Huế|VN|16.46|107.59|thua thien hue
Quảng Nam|VN|15.57|108.47|tam ky chu lai hoi an
Quảng Ngãi|VN|15.12|108.80|dung quat
Bình Định|VN|13.78|109.22|quy nhon
Khánh Hòa|VN|12.24|109.19|nha trang cam ranh
Đắk Lắk|VN|12.67|108.04|buon ma thuot
Lâm Đồng|VN|11.94|108.44|da lat
Bình Thuận|VN|10.93|108.10|phan thiet
Bà Rịa – Vũng Tàu|VN|10.50|107.17|vung tau phu my ba ria
Long An|VN|10.54|106.41|tan an duc hoa ben luc
Tây Ninh|VN|11.31|106.10|trang bang
Bình Phước|VN|11.54|106.90|dong xoai chon thanh
Tiền Giang|VN|10.36|106.36|my tho
Cần Thơ|VN|10.03|105.77|can tho
An Giang|VN|10.39|105.43|long xuyen chau doc
Kiên Giang|VN|10.01|105.08|rach gia phu quoc
Cà Mau|VN|9.18|105.15|
Lào Cai|VN|22.48|103.97|
Lạng Sơn|VN|21.85|106.76|
Thượng Hải|CN|31.23|121.47|shanghai
Bắc Kinh|CN|39.90|116.40|beijing
Thâm Quyến|CN|22.54|114.06|shenzhen
Quảng Châu|CN|23.13|113.26|guangzhou
Đông Quản|CN|23.02|113.75|dongguan
Phật Sơn|CN|23.02|113.12|foshan
Thiên Tân|CN|39.13|117.20|tianjin
Thanh Đảo|CN|36.07|120.38|qingdao
Ninh Ba|CN|29.87|121.55|ningbo
Hàng Châu|CN|30.27|120.15|hangzhou
Tô Châu|CN|31.30|120.58|suzhou
Nam Kinh|CN|32.06|118.80|nanjing
Nghĩa Ô|CN|29.31|120.08|yiwu
Hạ Môn|CN|24.48|118.09|xiamen
Phúc Châu|CN|26.07|119.30|fuzhou
Đại Liên|CN|38.91|121.60|dalian
Vũ Hán|CN|30.59|114.31|wuhan
Trùng Khánh|CN|29.56|106.55|chongqing
Thành Đô|CN|30.57|104.07|chengdu
Tây An|CN|34.34|108.94|xian
Trịnh Châu|CN|34.75|113.63|zhengzhou
Côn Minh|CN|25.04|102.71|kunming
Nam Ninh|CN|22.82|108.32|nanning
Trường Sa|CN|28.23|112.94|changsha
Thẩm Dương|CN|41.80|123.43|shenyang
Cáp Nhĩ Tân|CN|45.80|126.53|harbin
Urumqi|CN|43.83|87.62|urumqi tan cuong
Hồng Kông|HK|22.32|114.17|hong kong
Đài Bắc|TW|25.03|121.57|taipei
Cao Hùng|TW|22.63|120.30|kaohsiung
Đài Trung|TW|24.15|120.67|taichung
Tokyo|JP|35.68|139.69|
Osaka|JP|34.69|135.50|
Nagoya|JP|35.18|136.91|
Yokohama|JP|35.44|139.64|
Kobe|JP|34.69|135.20|
Fukuoka|JP|33.59|130.40|
Sapporo|JP|43.06|141.35|
Hiroshima|JP|34.39|132.46|
Seoul|KR|37.57|126.98|
Busan|KR|35.18|129.08|pusan
Incheon|KR|37.46|126.71|
Daegu|KR|35.87|128.60|
Ulsan|KR|35.54|129.31|
Bangkok|TH|13.76|100.50|bang coc
Chiang Mai|TH|18.79|98.98|
Rayong|TH|12.68|101.28|
Chonburi|TH|13.36|100.98|
Khon Kaen|TH|16.44|102.83|
Singapore|SG|1.35|103.82|
Kuala Lumpur|MY|3.14|101.69|
Penang|MY|5.41|100.33|george town
Johor Bahru|MY|1.49|103.74|
Jakarta|ID|-6.21|106.85|
Surabaya|ID|-7.26|112.75|
Bandung|ID|-6.92|107.61|
Medan|ID|3.59|98.67|
Semarang|ID|-6.97|110.42|
Manila|PH|14.60|120.98|
Cebu|PH|10.32|123.89|
Davao|PH|7.19|125.46|
Phnom Penh|KH|11.56|104.92|nam vang
Siem Reap|KH|13.36|103.86|
Viêng Chăn|LA|17.97|102.63|vientiane
Savannakhet|LA|16.57|104.75|
Luang Prabang|LA|19.89|102.13|
Yangon|MM|16.87|96.20|rangoon
Mandalay|MM|21.96|96.09|
Mumbai|IN|19.08|72.88|bombay
Delhi|IN|28.61|77.21|new delhi
Bengaluru|IN|12.97|77.59|bangalore
Chennai|IN|13.08|80.27|madras
Kolkata|IN|22.57|88.36|calcutta
Hyderabad|IN|17.39|78.49|
Ahmedabad|IN|23.02|72.57|
Pune|IN|18.52|73.86|
Surat|IN|21.17|72.83|
Karachi|PK|24.86|67.01|
Lahore|PK|31.55|74.34|
Islamabad|PK|33.68|73.05|
Dhaka|BD|23.81|90.41|
Chittagong|BD|22.36|91.78|chattogram
Colombo|LK|6.93|79.86|
Kathmandu|NP|27.72|85.32|
Dubai|AE|25.20|55.27|
Abu Dhabi|AE|24.45|54.38|
Riyadh|SA|24.71|46.68|
Jeddah|SA|21.49|39.19|
Dammam|SA|26.43|50.10|
Doha|QA|25.29|51.53|
Kuwait City|KW|29.38|47.99|
Muscat|OM|23.59|58.41|
Tehran|IR|35.69|51.39|
Baghdad|IQ|33.31|44.37|
Tel Aviv|IL|32.09|34.78|
Amman|JO|31.95|35.93|
Istanbul|TR|41.01|28.98|
Ankara|TR|39.93|32.86|
Izmir|TR|38.42|27.14|
Bursa|TR|40.19|29.06|
Berlin|DE|52.52|13.40|
Munich|DE|48.14|11.58|munchen muenchen
Hamburg|DE|53.55|10.00|
Frankfurt|DE|50.11|8.68|
Köln|DE|50.94|6.96|cologne koln
Düsseldorf|DE|51.23|6.78|dusseldorf
Stuttgart|DE|48.78|9.18|
Nürnberg|DE|49.45|11.08|nuremberg nurnberg
Leipzig|DE|51.34|12.37|
Dortmund|DE|51.51|7.47|
Bremen|DE|53.08|8.80|
Hannover|DE|52.37|9.74|
Dresden|DE|51.05|13.74|
Paris|FR|48.86|2.35|
Lyon|FR|45.76|4.84|
Marseille|FR|43.30|5.37|
Toulouse|FR|43.60|1.44|
Lille|FR|50.63|3.06|
Bordeaux|FR|44.84|-0.58|
Nantes|FR|47.22|-1.55|
Strasbourg|FR|48.57|7.75|
London|GB|51.51|-0.13|luan don
Manchester|GB|53.48|-2.24|
Birmingham|GB|52.49|-1.89|
Leeds|GB|53.80|-1.55|
Glasgow|GB|55.86|-4.25|
Liverpool|GB|53.41|-2.98|
Bristol|GB|51.45|-2.59|
Edinburgh|GB|55.95|-3.19|
Amsterdam|NL|52.37|4.90|
Rotterdam|NL|51.92|4.48|
Eindhoven|NL|51.44|5.47|
Utrecht|NL|52.09|5.12|
Brussels|BE|50.85|4.35|bruxelles
Antwerp|BE|51.22|4.40|antwerpen
Luxembourg|LU|49.61|6.13|
Zürich|CH|47.38|8.54|zurich
Geneva|CH|46.20|6.14|geneve
Basel|CH|47.56|7.59|
Vienna|AT|48.21|16.37|wien vien
Linz|AT|48.31|14.29|
Graz|AT|47.07|15.44|
Prague|CZ|50.08|14.44|praha
Brno|CZ|49.20|16.61|
Bratislava|SK|48.15|17.11|
Budapest|HU|47.50|19.04|
Warsaw|PL|52.23|21.01|warszawa vac-sa-va
Kraków|PL|50.06|19.94|krakow
Wrocław|PL|51.11|17.04|wroclaw
Poznań|PL|52.41|16.93|poznan
Łódź|PL|51.76|19.46|lodz
Gdańsk|PL|54.35|18.65|gdansk
Copenhagen|DK|55.68|12.57|kobenhavn
Aarhus|DK|56.16|10.20|
Stockholm|SE|59.33|18.07|
Gothenburg|SE|57.71|11.97|goteborg
Malmö|SE|55.60|13.00|malmo
Oslo|NO|59.91|10.75|
Helsinki|FI|60.17|24.94|
Dublin|IE|53.35|-6.26|
Madrid|ES|40.42|-3.70|
Barcelona|ES|41.39|2.17|
Valencia|ES|39.47|-0.38|
Sevilla|ES|37.39|-5.98|seville
Zaragoza|ES|41.65|-0.89|
Bilbao|ES|43.26|-2.93|
Lisbon|PT|38.72|-9.14|lisboa
Porto|PT|41.15|-8.61|
Rome|IT|41.90|12.50|roma
Milan|IT|45.46|9.19|milano
Turin|IT|45.07|7.69|torino
Naples|IT|40.85|14.27|napoli
Bologna|IT|44.49|11.34|
Florence|IT|43.77|11.26|firenze
Genoa|IT|44.41|8.93|genova
Venice|IT|45.44|12.32|venezia
Verona|IT|45.44|10.99|
Athens|GR|37.98|23.73|
Thessaloniki|GR|40.64|22.94|
Bucharest|RO|44.43|26.10|
Sofia|BG|42.70|23.32|
Belgrade|RS|44.79|20.45|
Zagreb|HR|45.81|15.98|
Ljubljana|SI|46.06|14.51|
Kyiv|UA|50.45|30.52|kiev
Odesa|UA|46.48|30.73|odessa
Minsk|BY|53.90|27.57|
Moscow|RU|55.76|37.62|moskva mat-xco-va
Saint Petersburg|RU|59.93|30.34|st petersburg
Novosibirsk|RU|55.03|82.92|
Yekaterinburg|RU|56.84|60.61|
Vladivostok|RU|43.12|131.89|
Vilnius|LT|54.69|25.28|
Riga|LV|56.95|24.11|
Tallinn|EE|59.44|24.75|
Almaty|KZ|43.24|76.89|
Astana|KZ|51.17|71.43|nur-sultan
Tashkent|UZ|41.30|69.24|
Tbilisi|GE|41.72|44.79|
Baku|AZ|40.41|49.87|
Ulaanbaatar|MN|47.89|106.91|
New York|US|40.71|-74.01|nyc
Los Angeles|US|34.05|-118.24|la
Chicago|US|41.88|-87.63|
Houston|US|29.76|-95.37|
Dallas|US|32.78|-96.80|
Atlanta|US|33.75|-84.39|
Miami|US|25.76|-80.19|
Seattle|US|47.61|-122.33|
San Francisco|US|37.77|-122.42|
San Jose|US|37.34|-121.89|
San Diego|US|32.72|-117.16|
Phoenix|US|33.45|-112.07|
Denver|US|39.74|-104.99|
Las Vegas|US|36.17|-115.14|
Boston|US|42.36|-71.06|
Philadelphia|US|39.95|-75.17|
Washington DC|US|38.91|-77.04|
Detroit|US|42.33|-83.05|
Minneapolis|US|44.98|-93.27|
Kansas City|US|39.10|-94.58|
St. Louis|US|38.63|-90.20|
Memphis|US|35.15|-90.05|
Nashville|US|36.16|-86.78|
Charlotte|US|35.23|-80.84|
Columbus|US|39.96|-83.00|
Indianapolis|US|39.77|-86.16|
Cincinnati|US|39.10|-84.51|
Salt Lake City|US|40.76|-111.89|
Portland|US|45.52|-122.68|
New Orleans|US|29.95|-90.07|
Savannah|US|32.08|-81.09|
Toronto|CA|43.65|-79.38|
Montreal|CA|45.50|-73.57|
Vancouver|CA|49.28|-123.12|
Calgary|CA|51.05|-114.07|
Edmonton|CA|53.55|-113.49|
Winnipeg|CA|49.90|-97.14|
Ottawa|CA|45.42|-75.70|
Mexico City|MX|19.43|-99.13|ciudad de mexico
Monterrey|MX|25.69|-100.32|
Guadalajara|MX|20.66|-103.35|
Tijuana|MX|32.51|-117.04|
Querétaro|MX|20.59|-100.39|queretaro
Guatemala City|GT|14.63|-90.51|
San José|CR|9.93|-84.08|
Panama City|PA|8.98|-79.52|
Havana|CU|23.11|-82.37|
Santo Domingo|DO|18.49|-69.93|
Bogotá|CO|4.71|-74.07|bogota
Medellín|CO|6.24|-75.58|medellin
Caracas|VE|10.48|-66.90|
Quito|EC|-0.18|-78.47|
Guayaquil|EC|-2.17|-79.92|
Lima|PE|-12.05|-77.04|
La Paz|BO|-16.49|-68.12|
Santa Cruz|BO|-17.78|-63.18|
São Paulo|BR|-23.55|-46.63|sao paulo
Rio de Janeiro|BR|-22.91|-43.17|
Belo Horizonte|BR|-19.92|-43.94|
Brasília|BR|-15.79|-47.88|brasilia
Curitiba|BR|-25.43|-49.27|
Porto Alegre|BR|-30.03|-51.23|
Manaus|BR|-3.12|-60.02|
Recife|BR|-8.05|-34.88|
Salvador|BR|-12.97|-38.50|
Asunción|PY|-25.26|-57.58|asuncion
Montevideo|UY|-34.90|-56.16|
Buenos Aires|AR|-34.60|-58.38|
Córdoba|AR|-31.42|-64.18|cordoba
Rosario|AR|-32.95|-60.64|
Santiago|CL|-33.45|-70.67|
Cairo|EG|30.04|31.24|
Alexandria|EG|31.20|29.92|
Casablanca|MA|33.57|-7.59|
Algiers|DZ|36.75|3.06|
Tunis|TN|36.81|10.18|
Lagos|NG|6.52|3.38|
Abuja|NG|9.08|7.40|
Kano|NG|12.00|8.52|
Accra|GH|5.60|-0.19|
Abidjan|CI|5.36|-4.01|
Dakar|SN|14.72|-17.47|
Bamako|ML|12.64|-8.00|
Ouagadougou|BF|12.37|-1.52|
Niamey|NE|13.51|2.13|
Douala|CM|4.05|9.77|
Kinshasa|CD|-4.44|15.27|
Lubumbashi|CD|-11.66|27.48|
Luanda|AO|-8.84|13.23|
Addis Ababa|ET|9.02|38.75|
Nairobi|KE|-1.29|36.82|
Mombasa|KE|-4.04|39.67|
Kampala|UG|0.35|32.58|
Kigali|RW|-1.94|30.06|
Dar es Salaam|TZ|-6.79|39.21|
Lusaka|ZM|-15.39|28.32|
Harare|ZW|-17.83|31.05|
Maputo|MZ|-25.97|32.57|
Johannesburg|ZA|-26.20|28.05|
Cape Town|ZA|-33.92|18.42|
Durban|ZA|-29.86|31.02|
Pretoria|ZA|-25.75|28.19|
Khartoum|SD|15.50|32.56|
Sydney|AU|-33.87|151.21|
Melbourne|AU|-37.81|144.96|
Brisbane|AU|-27.47|153.03|
Perth|AU|-31.95|115.86|
Adelaide|AU|-34.93|138.60|
Auckland|NZ|-36.85|174.76|
Wellington|NZ|-41.29|174.78|
Christchurch|NZ|-43.53|172.64|
`;

export interface City {
  name: string;
  country: string;
  coord: LngLat;
  search: string;
}

export const CITIES: City[] = RAW.trim().split('\n').map((l) => {
  const [name, country, lat, lon, alias = ''] = l.split('|');
  return { name, country, coord: [+lon, +lat] as LngLat, search: stripAccents(`${name} ${alias}`) };
});

export function searchCities(q: string, limit = 6): City[] {
  const s = stripAccents(q.trim()).replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length < 2) return [];
  const words = s.split(' ');
  return CITIES.map((c, i) => {
    const nm = stripAccents(c.name);
    let score = -1;
    if (nm === s) score = 100;
    else if (nm.startsWith(s) || s.startsWith(nm + ' ')) score = 85;
    else if (c.search.split(' ').some((w) => w.startsWith(words[0])) && words.slice(0, 2).every((w) => c.search.includes(w) || w.length < 3)) score = 60;
    else if (s.length >= 3 && c.search.includes(s)) score = 45;
    return { c, score: score - i * 0.001 };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.c);
}

/** Thành phố quan trọng nhất của một nước (dùng khi người dùng đổi nhánh Quốc gia → Địa chỉ) */
export const mainCityOf = (iso2: string) => CITIES.find((c) => c.country === iso2);
