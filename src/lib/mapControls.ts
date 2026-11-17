import type maplibregl from 'maplibre-gl';
import { bbox } from './geo';
import { useAppStore } from '../store/useAppStore';
import type { RouteResult } from '../types';

export const mapHandle: { map: maplibregl.Map | null } = { map: null };

export function fitRoute(map: maplibregl.Map, route: RouteResult) {
  const [a, b, c, d] = bbox(route.coords);
  const w = map.getContainer().clientWidth;
  const pad = Math.min(120, Math.max(40, w * 0.08));
  const isGlobe = useAppStore.getState().mapMode === 'globe';
  const cam = map.cameraForBounds(
    [
      [a, b],
      [c, d],
    ],
    { padding: { top: pad, bottom: pad + 40, left: pad, right: pad } },
  );
  const center: [number, number] = [((a + c) / 2 + 540) % 360 - 180, (b + d) / 2];
  // globe: xoay để tuyến nằm giữa
  // globe ở zoom thấp hiển thị lớn hơn mercator → lùi thêm
  const zoom = Math.min(5, Math.max(isGlobe ? 0.9 : 0.4, (cam?.zoom ?? 2) - (isGlobe ? 0.9 : 0.1)));
  map.flyTo({ center, zoom, pitch: 0, bearing: 0, duration: 1800, essential: true });
}

