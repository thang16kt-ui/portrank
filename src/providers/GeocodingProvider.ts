import { searchCities } from '../data/cities';
import { countryName, getCountry, searchCountries } from '../data/countries';
import type { Place } from '../types';

export interface GeocodingProvider {
  readonly id: string;
  readonly label: string;
  search(query: string, signal?: AbortSignal): Promise<Place[]>;
}

/** Dự phòng offline: danh sách quốc gia + ~300 thành phố lớn. Toạ độ quốc gia được điền sau (tâm nước). */
export const OfflineGeocoder: GeocodingProvider = {
  id: 'offline',
  label: 'Danh sách có sẵn',
  async search(query) {
    const out: Place[] = [];
    for (const c of searchCountries(query, 5)) out.push({ kind: 'country', label: c.name, country: c.iso2, countryName: c.name, coord: [0, 0], source: 'offline' });
    for (const c of searchCities(query, 6)) {
      const cn = countryName(c.country);
      out.push({ kind: 'address', label: `${c.name}, ${cn}`, country: c.country, countryName: cn, coord: c.coord, source: 'offline' });
    }
    return out;
  },
};

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; type?: string; osm_value?: string; country?: string; countrycode?: string; state?: string; city?: string; county?: string; street?: string; housenumber?: string };
}

/** Chuyển 1 kết quả Photon thành Place; cấp quốc gia → nhánh A, còn lại → nhánh B */
export function photonToPlace(f: PhotonFeature): Place | null {
  const p = f.properties;
  const cc = (p.countrycode ?? '').toUpperCase();
  if (!cc || !getCountry(cc)) return null;
  const cn = countryName(cc);
  if (p.type === 'country' || p.osm_value === 'country') return { kind: 'country', label: cn, country: cc, countryName: cn, coord: f.geometry.coordinates, source: 'photon' };
  const street = [p.street, p.housenumber].filter(Boolean).join(' ');
  const parts = [p.name && p.name !== street ? p.name : '', street, p.city && p.city !== p.name ? p.city : '', p.state && p.state !== p.name && p.state !== p.city ? p.state : ''].filter(Boolean);
  if (!parts.length) return null;
  return { kind: 'address', label: `${parts.slice(0, 3).join(', ')}, ${cn}`, country: cc, countryName: cn, coord: f.geometry.coordinates, source: 'photon' };
}

/** Photon (photon.komoot.io) – dữ liệu OpenStreetMap, không cần API key */
export const PhotonGeocoder: GeocodingProvider = {
  id: 'photon',
  label: 'Photon (OpenStreetMap)',
  async search(query, signal) {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=7&lang=en`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    signal?.addEventListener('abort', () => ctrl.abort());
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`Photon ${res.status}`);
      const json = (await res.json()) as { features: PhotonFeature[] };
      return json.features.map(photonToPlace).filter((x): x is Place => !!x);
    } finally {
      clearTimeout(timer);
    }
  },
};
