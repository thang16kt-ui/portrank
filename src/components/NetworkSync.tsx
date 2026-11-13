import { useEffect } from 'react';
import { getPort } from '../data/ports';
import { buildNetwork } from '../lib/network';
import { rankAlternatives } from '../lib/ranking';
import { routeOptionsOf, shipmentOf } from '../lib/results';
import { useAppStore } from '../store/useAppStore';

/** Tính danh sách cặp cảng (A-lân cận × B-lân cận) + mạng tuyến mỗi khi bấm "Tính" hoặc đổi trọng số */
export default function NetworkSync() {
  const computed = useAppStore((s) => s.computed);
  const weights = useAppStore((s) => s.weights);
  const setNetwork = useAppStore((s) => s.setNetwork);
  useEffect(() => {
    const pol = getPort(computed?.pol), pod = getPort(computed?.pod);
    if (!computed || !pol || !pod) return setNetwork([], []);
    const alts = rankAlternatives({ pol, pod, radiusKm: computed.radiusKm, shipment: shipmentOf(computed), options: routeOptionsOf(computed), weights });
    setNetwork(alts, buildNetwork(alts, computed.cargo));
  }, [computed, weights, setNetwork]);
  return null;
}
