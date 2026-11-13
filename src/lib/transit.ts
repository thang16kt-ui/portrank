import { VESSEL_CONFIG } from '../config/routing';
import type { CargoType, RouteResult } from '../types';

export const CANAL_IDS = ['SUEZ', 'PANAMA', 'KIEL'] as const;

export function vesselSpeed(cargo: CargoType): number {
  return cargo === 'reefer' ? VESSEL_CONFIG.reeferSpeedKn : VESSEL_CONFIG.speedKn;
}

/** Số ngày trên biển (không kể làm hàng) tính tới quãng đường nm */
export const seaDaysAt = (nm: number, cargo: CargoType) => nm / (vesselSpeed(cargo) * 24);

/**
 * T (ngày) = hải lý / (tốc độ × 24) + ngày làm hàng hai đầu + 1 ngày mỗi kênh đào
 */
export function transitDays(route: Pick<RouteResult, 'distanceNm' | 'passages'>, cargo: CargoType): number {
  const canals = route.passages.filter((p) => (CANAL_IDS as readonly string[]).includes(p.id)).length;
  return seaDaysAt(route.distanceNm, cargo) + VESSEL_CONFIG.portDays + canals * VESSEL_CONFIG.canalDays;
}

/** Ngày thứ X của hành trình tại quãng đường nm (gồm 1 ngày làm hàng đầu đi + kênh đã qua) */
export function dayAt(route: RouteResult, nm: number, cargo: CargoType): number {
  const canalsPassed = route.passages.filter((p) => (CANAL_IDS as readonly string[]).includes(p.id) && p.atNm <= nm).length;
  return VESSEL_CONFIG.portDays / 2 + seaDaysAt(nm, cargo) + canalsPassed * VESSEL_CONFIG.canalDays;
}

export function addDays(iso: string, days: number): Date {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + Math.round(days));
  return d;
}

export const fmtDate = (d: Date) => d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function schedule(readyDate: string, days: number) {
  const etd = addDays(readyDate, VESSEL_CONFIG.cutoffDays);
  const eta = new Date(etd);
  eta.setDate(eta.getDate() + Math.round(days));
  return { etd, eta };
}
