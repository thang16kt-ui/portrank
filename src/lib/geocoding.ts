import { mainCityOf } from '../data/cities';
import { countryName } from '../data/countries';
import { OfflineGeocoder, PhotonGeocoder, type GeocodingProvider } from '../providers/GeocodingProvider';
import type { Place } from '../types';
import { haversineKm } from './geo';
import { loadWorld } from './world';

export const geocoders: GeocodingProvider[] = [OfflineGeocoder, PhotonGeocoder];

/** Điền toạ độ tâm nước cho Place cấp quốc gia */
export async function resolveCountryCoord(p: Place): Promise<Place> {
  if (p.kind !== 'country') return p;
  const w = await loadWorld();
  return { ...p, coord: w.centroid.get(p.country) ?? p.coord };
}

/** Gộp kết quả: bỏ trùng (cùng nước với nhánh A; cùng nước + cách < 15 km với nhánh B) */
export function mergePlaces(a: Place[], b: Place[]): Place[] {
  const out = [...a];
  for (const p of b) {
    const dup = out.some((q) =>
      q.kind === p.kind && q.country === p.country && (p.kind === 'country' || haversineKm(q.coord, p.coord) < 15),
    );
    if (!dup) out.push(p);
  }
  return out;
}

/** Tìm ngay bằng dữ liệu có sẵn (đồng bộ về mặt trải nghiệm), rồi bổ sung kết quả Photon nếu mạng cho phép */
export async function searchOffline(q: string): Promise<Place[]> {
  return OfflineGeocoder.search(q);
}
export async function searchOnline(q: string, signal?: AbortSignal): Promise<Place[]> {
  try {
    return await PhotonGeocoder.search(q, signal);
  } catch {
    return [];
  }
}

/** Người dùng bấm chip để đổi nhánh thủ công */
export async function switchBranch(p: Place): Promise<Place> {
  if (p.kind === 'address') return resolveCountryCoord({ kind: 'country', label: countryName(p.country), country: p.country, countryName: countryName(p.country), coord: p.coord });
  const city = mainCityOf(p.country);
  if (city) return { kind: 'address', label: `${city.name}, ${p.countryName}`, country: p.country, countryName: p.countryName, coord: city.coord, source: 'offline' };
  const r = await resolveCountryCoord(p);
  return { ...r, kind: 'address', label: `Trung tâm ${p.countryName}` };
}
