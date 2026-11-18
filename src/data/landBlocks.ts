/**
 * Khối lục địa nối được bằng ĐƯỜNG BỘ. Hai nước cùng một khối thì cho phép chọn phương thức "Đường bộ".
 * Đảo quốc (Nhật, Đài Loan, Philippines, Indonesia, Úc…) không thuộc khối nào → chỉ đi đường biển.
 * Anh nối với lục địa qua hầm Eurotunnel (xe tải đi tàu con thoi) nên được xếp vào khối Á–Âu–Phi.
 */
export const LAND_BLOCKS: { id: string; name: string; countries: string[] }[] = [
  {
    id: 'afro-eurasia',
    name: 'Á – Âu – Phi',
    countries: (
      'VN CN LA KH TH MM MY SG IN PK BD NP BT AF IR IQ SY JO IL PS LB SA AE QA OM KW YE TR GE AM AZ KZ UZ TM KG TJ MN RU KP KR ' +
      'DE NL BE FR GB LU CH AT DK SE NO FI PL CZ SK HU EE LV LT BY UA MD LI ES PT IT GR HR SI BA RS ME AL MK BG RO XK AD MC SM ' +
      'EG LY TN DZ MA EH MR SN GM GW GN SL LR CI GH TG BJ NG NE ML BF TD SD SS ET ER DJ SO KE UG RW BI TZ CD CG GA GQ CM CF AO ZM ZW MW MZ NA BW ZA LS SZ'
    ).split(' '),
  },
  { id: 'north-america', name: 'Bắc & Trung Mỹ', countries: 'CA US MX GT BZ SV HN NI CR PA'.split(' ') },
  { id: 'south-america', name: 'Nam Mỹ', countries: 'CO VE GY SR GF EC PE BO BR PY UY AR CL'.split(' ') },
];

/** Hàn Quốc về địa lý nằm trên lục địa nhưng không có đường bộ thông ra ngoài */
const ROAD_ISOLATED = new Set(['KR']);

export function landBlockOf(iso2: string) {
  if (ROAD_ISOLATED.has(iso2)) return undefined;
  return LAND_BLOCKS.find((b) => b.countries.includes(iso2));
}

/** Kiểm tra hai nước có nối được bằng đường bộ không, kèm lý do nếu không */
export function roadAvailability(a: string | undefined, b: string | undefined): { ok: boolean; reason?: string } {
  if (!a || !b) return { ok: false, reason: 'Chọn điểm của hai bên trước' };
  // Island countries and South Korea still have domestic roads. The routing API checks actual connectivity.
  if (a === b) return { ok: true };
  const ba = landBlockOf(a), bb = landBlockOf(b);
  if (!ba || !bb) return { ok: false, reason: 'Một trong hai nước là đảo quốc / không có đường bộ thông ra ngoài' };
  if (ba.id !== bb.id) return { ok: false, reason: `Hai điểm khác khối lục địa (${ba.name} ↔ ${bb.name})` };
  return { ok: true };
}
