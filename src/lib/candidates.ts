import { PORTS } from '../data/ports';
import type { Place, Port } from '../types';
import { haversineKm } from './geo';

export interface Candidates {
  ports: Port[];
  notes: string[];
}

export const MAX_PORTS_PER_END = 8;

/**
 * Cảng ứng viên cho một đầu.
 * - Nhánh A (quốc gia): mọi cảng container của nước đó; nước không có cảng trong dữ liệu (vd. không giáp biển)
 *   → lấy các cảng gần nhất của nước láng giềng.
 * - Nhánh B (địa chỉ): các cảng trong bán kính R (kể cả ở nước láng giềng); không có → 3 cảng gần nhất.
 */
export function candidatePorts(place: Place, radiusKm: number, ports: Port[] = PORTS): Candidates {
  const notes: string[] = [];
  const byDist = (list: Port[]) => [...list].sort((a, b) => haversineKm(a.coord, place.coord) - haversineKm(b.coord, place.coord));
  let out: Port[];
  if (place.kind === 'country') {
    out = ports.filter((p) => p.country === place.country).sort((a, b) => b.weeklyServices - a.weeklyServices);
    if (!out.length) {
      out = byDist(ports).slice(0, 3);
      notes.push(`${place.countryName} không có cảng container trong dữ liệu (có thể không giáp biển) – dùng các cảng gần nhất ở nước láng giềng: ${out.map((p) => p.name).join(', ')}.`);
    }
  } else {
    out = byDist(ports.filter((p) => haversineKm(p.coord, place.coord) <= radiusKm));
    if (!out.length) {
      out = byDist(ports).slice(0, 3);
      notes.push(`Không có cảng nào trong bán kính ${radiusKm} km quanh ${place.label} – dùng 3 cảng gần nhất: ${out.map((p) => p.name).join(', ')}.`);
    }
  }
  if (out.length > MAX_PORTS_PER_END) {
    notes.push(`${place.kind === 'country' ? place.countryName : place.label}: có ${out.length} cảng phù hợp, chỉ so sánh ${MAX_PORTS_PER_END} cảng ${place.kind === 'country' ? 'lớn nhất' : 'gần nhất'}.`);
    out = out.slice(0, MAX_PORTS_PER_END);
  }
  return { ports: out, notes };
}
