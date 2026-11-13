/**
 * Kiểm tra tuyến không cắt qua đất liền (trừ kênh đào và luồng ra/vào cảng).
 * Chạy: npx tsx scripts/check-land.ts [graph]
 */
import { PORT_BY_CODE } from '../src/data/ports';
import { findRoute } from '../src/lib/routing';
import { haversineKm } from '../src/lib/geo';
import { onLand, EXEMPT } from './land';

const engine = (process.argv[2] as 'graph' | 'searoute') ?? 'searoute';
const pairs = process.argv[3] ? [process.argv[3].split('-')] : [
  ['VNSGN', 'DEHAM'], ['VNHPH', 'USLAX'], ['VNCMT', 'USNYC'], ['SGSIN', 'BRSSZ'], ['CNSHA', 'NGLOS'], ['VNSGN', 'AUMEL'],
];
const all = process.argv[3] === 'ALL';
const codes = Object.keys(PORT_BY_CODE);
const list = all ? codes.flatMap((a, i) => codes.filter((_, j) => j > i && j % 7 === i % 7).map((b) => [a, b])) : pairs;
let bad = 0;
for (const [a, b] of list) {
  const pol = PORT_BY_CODE[a], pod = PORT_BY_CODE[b];
  for (const avoidRedSea of [false, true]) {
    if (all && avoidRedSea) continue;
    const t = performance.now();
    const r = findRoute(pol, pod, { avoidRedSea, avoidPanama: false, engine });
    const ms = performance.now() - t;
    const issues: string[] = [];
    let run = 0;
    r.coords.forEach((c, i) => {
      if (haversineKm(c, pol.coord) < 40 || haversineKm(c, pod.coord) < 40) return;
      const legs = [...(pol.approach ?? []), ...(pod.approach ?? [])];
      if (legs.some((q) => haversineKm(c, q) < 8)) return;
      if (EXEMPT.some((e) => haversineKm(c, e.c) < e.km)) return;
      if (onLand(c)) { run++; if (run === 1) issues.push(`${i}@${c[0].toFixed(2)},${c[1].toFixed(2)}`); } else run = 0;
    });
    if (issues.length || r.engine !== engine) bad++;
    if (!all || issues.length || r.engine !== engine)
      console.log(`[${r.engine}] ${a}→${b}${avoidRedSea ? ' [tránh Biển Đỏ]' : ''}: ${Math.round(r.distanceNm)} nm, ${r.coords.length} pts, ${ms.toFixed(0)} ms, qua: ${r.passages.map((p) => p.id).join(',')} ${issues.length ? '❌ ĐẤT LIỀN: ' + issues.slice(0, 6).join(' ') : '✅'}`);
  }
}
console.log(bad ? `${bad} tuyến có điểm trên đất liền` : 'OK – không tuyến nào cắt qua đất liền');
