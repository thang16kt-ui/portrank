/** Six-faced CSS solids: a small 3D truck that also works without WebGL. Front points north. */
function solid(w: number, d: number, h: number, x: number, y: number, z: number, color: string, extra = '') {
  return `<i class="truck-solid ${extra}" style="--w:${w}px;--d:${d}px;--h:${h}px;--paint:${color};transform:translate3d(${x}px,${y}px,${z}px)">${['top','bottom','front','back','left','right'].map((f) => `<b class="truck-face truck-${f}"></b>`).join('')}</i>`;
}

export function truckModelMarkup() {
  let parts = solid(18, 65, 4, -9, -32, 6, '#334155');
  parts += solid(21, 19, 18, -10.5, -33, 17, '#dc2626');
  parts += solid(20, 44, 22, -10, -11, 21, '#ed8b23', 'truck-container');
  parts += solid(18, 1, 8, -9, -33.6, 21, '#164e63');
  for (const y of [-23, 12, 26]) for (const x of [-15, 10]) parts += solid(5, 9, 9, x, y, 5, '#1e293b', 'truck-wheel');
  for (const x of [-8, 4]) parts += solid(4, 1, 3, x, -34, 12, '#fff7ad');
  return `<div class="truck-model" role="img" aria-label="Xe tải container 3D"><div class="truck-shadow"></div><div class="truck-heading"><div class="truck-solids">${parts}</div></div></div>`;
}
