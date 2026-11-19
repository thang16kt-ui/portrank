/**
 * Mô hình 3D bằng CSS (không cần WebGL) cho xe tải container và tàu container trên bản đồ hành trình.
 * Mỗi khối là một lăng trụ: đa giác nhìn từ trên (mặt bằng) + chiều cao. Mặt bên được đổ bóng theo hướng ánh sáng
 * để có khối. Mũi xe / mũi tàu hướng về phía bắc (−y); bản đồ xoay `.vehicle-heading` theo hướng đi.
 */

type Pt = [number, number];

interface PrismOpts {
  /** Màu mặt trên */
  top: string;
  /** Màu / nền mặt bên (CSS background) */
  side: string;
  /** Nền riêng cho từng cạnh (theo chỉ số cạnh i: điểm i → i+1) */
  faces?: Record<number, string>;
  /** Không đổ bóng mặt bên (vd. kính, đèn) */
  flat?: boolean;
  cls?: string;
}

/** Hướng ánh sáng (từ trên-trái phía trước) dùng để đổ bóng mặt bên */
const LIGHT = Math.atan2(-0.8, -0.6);

const f = (n: number) => +n.toFixed(2);

function prism(points: Pt[], z: number, h: number, o: PrismOpts): string {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, d = Math.max(...ys) - y0;
  const poly = points.map(([x, y]) => `${f(((x - x0) / w) * 100)}% ${f(((y - y0) / d) * 100)}%`).join(',');
  let html = `<i class="vm-top ${o.cls ?? ''}" style="width:${f(w)}px;height:${f(d)}px;background:${o.top};clip-path:polygon(${poly});transform:translate3d(${f(x0)}px,${f(y0)}px,${f(z + h)}px)"></i>`;
  points.forEach(([x1, y1], i) => {
    const [x2, y2] = points[(i + 1) % points.length];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 0.01) return;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    // pháp tuyến hướng ra ngoài (đa giác theo chiều kim đồng hồ trên màn hình)
    const normal = ang - Math.PI / 2;
    const shade = o.flat ? 1 : 0.58 + 0.42 * Math.max(0, Math.cos(normal - LIGHT));
    html += `<i class="vm-side" style="width:${f(len)}px;height:${f(h)}px;background:${o.faces?.[i] ?? o.side};filter:brightness(${f(shade)});transform:translate3d(${f(x1)}px,${f(y1)}px,${f(z)}px) rotateZ(${f((ang * 180) / Math.PI)}deg) rotateX(90deg)"></i>`;
  });
  return html;
}

const rect = (x: number, y: number, w: number, d: number): Pt[] => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];

function wrap(kind: 'truck' | 'ship', label: string, size: number, body: string, under = ''): string {
  return `<div class="vm vm-${kind}" style="--vm-size:${size}px" role="img" aria-label="${label}"><div class="vehicle-heading truck-heading">${under}<div class="vm-body">${body}</div></div></div>`;
}

/* ───────────── Xe đầu kéo + container 40' ───────────── */

/** Kích thước khung marker (px) */
export const TRUCK_MODEL_SIZE = 76;
export const SHIP_MODEL_SIZE = 110;

export function truckModelMarkup(): string {
  let b = '';
  // bánh xe: 3 trục (1 trước, 2 sau), lốp đen, mâm bạc ở mặt ngoài
  const tyre = 'radial-gradient(circle at 50% 50%,#cbd5e1 0 22%,#334155 24% 34%,#0b1120 36%)';
  for (const y of [-26, 13, 22]) for (const x of [-12.5, 8.5]) b += prism(rect(x, y, 4, 8), 0, 8, { top: '#111827', side: '#111827', faces: { [x < 0 ? 3 : 1]: tyre } });
  // khung gầm
  b += prism(rect(-8, -32, 16, 62), 3, 4, { top: '#1f2937', side: '#111827' });
  // cabin đỏ: mặt trước có kính chắn gió, lưới tản nhiệt, đèn
  const windshield = 'linear-gradient(to bottom,#e5e7eb 0 9%,#b91c1c 9% 52%,#0f172a 52% 56%,#1e3a5f 56%,#7aa7d6 78%,#1e3a5f 90%,#991b1b 90%)';
  // cửa sổ bên ở nửa phía trước cabin (mặt phải chạy trước → sau, mặt trái chạy sau → trước)
  const win = 'linear-gradient(to bottom,#b91c1c 0 55%,#2b4a6f 55% 88%,#b91c1c 88%)';
  const winR = `linear-gradient(to right,transparent 0 62%,#b91c1c 62%),${win}`;
  const winL = `linear-gradient(to right,#b91c1c 0 38%,transparent 38%),${win}`;
  b += prism([[-11, -29], [-9, -33], [9, -33], [11, -29], [11, -15], [-11, -15]], 5, 19, {
    top: 'linear-gradient(#ef4444,#b91c1c)', side: '#dc2626', faces: { 1: windshield, 3: winR, 5: winL },
  });
  // cánh gió nóc cabin
  b += prism([[-9, -27], [9, -27], [9, -17], [-9, -17]], 24, 4, { top: '#f1f5f9', side: '#e2e8f0' });
  // đèn pha & gương chiếu hậu
  for (const x of [-9, 5]) b += prism(rect(x, -33.6, 4, 0.8), 7, 2.5, { top: '#fef9c3', side: '#fde047', flat: true });
  for (const x of [-13.5, 11.5]) b += prism(rect(x, -29, 2, 2.5), 17, 5, { top: '#0f172a', side: '#1f2937' });
  // container 40' cam: vách gân dọc, cửa sau có thanh khoá
  const rib = 'repeating-linear-gradient(to right,rgba(0,0,0,.16) 0 1px,transparent 1px 3.2px),linear-gradient(to bottom,#c2410c,#f97316 30%,#ea580c)';
  const doors = 'linear-gradient(to right,transparent 49%,rgba(0,0,0,.35) 49% 51%,transparent 51%),repeating-linear-gradient(to right,transparent 0 4px,rgba(255,255,255,.35) 4px 5px),#ea580c';
  b += prism(rect(-11, -13, 22, 46), 7, 24, {
    top: 'repeating-linear-gradient(to bottom,#fb923c 0 3px,#f97316 3px 4px)', side: rib, faces: { 2: doors, 0: rib },
  });
  // đèn hậu
  for (const x of [-10, 7]) b += prism(rect(x, 33, 3, 0.8), 8, 2, { top: '#ef4444', side: '#ef4444', flat: true });
  return wrap('truck', 'Xe đầu kéo container 3D', TRUCK_MODEL_SIZE, b, '<div class="vm-shadow vm-shadow-truck"></div>');
}

/* ───────────── Tàu container ───────────── */

const BOX_COLORS = ['#ef4444', '#2563eb', '#f59e0b', '#10b981', '#0ea5e9', '#e11d48', '#8b5cf6', '#f97316', '#14b8a6', '#64748b'];

export function shipModelMarkup(): string {
  let b = '';
  // thân tàu: mũi nhọn, đuôi vát; mạn đen, đáy đỏ (đường nước), boong xám
  const hull: Pt[] = [[0, -50], [7, -42], [12, -30], [12, 38], [10, 46], [-10, 46], [-12, 38], [-12, -30], [-7, -42]];
  const hullSide = 'linear-gradient(to bottom,#b91c1c 0 30%,#f8fafc 30% 34%,#0f172a 34% 88%,#e2e8f0 88%)';
  b += prism(hull, 0, 10, { top: 'linear-gradient(#64748b,#475569)', side: hullSide });
  // mạn chắn sóng ở mũi
  b += prism([[0, -50], [7, -42], [9, -37], [-9, -37], [-7, -42]], 10, 3, { top: '#334155', side: '#0f172a' });
  // container xếp theo hàng (bay) × 2 cột, độ cao khác nhau
  let k = 0;
  for (let y = -33; y <= 20; y += 6.6) {
    const narrow = y < -26 ? 3 : 0;
    for (const x of [-10 + narrow, 0.4]) {
      const tiers = 1 + ((k * 7 + 3) % 3);
      const c = BOX_COLORS[(k * 3 + 1) % BOX_COLORS.length];
      const ribs = `repeating-linear-gradient(to right,rgba(0,0,0,.18) 0 .7px,transparent .7px 2.2px),linear-gradient(to bottom,${c},${c})`;
      b += prism(rect(x, y, 9.6 - narrow, 6), 10, tiers * 3.4, { top: `linear-gradient(135deg,${c},${c} 60%,rgba(255,255,255,.25))`, side: ribs });
      k++;
    }
  }
  // khu điều hành (bridge) màu trắng, dải cửa kính trên cùng, cánh gà hai bên
  const bridgeFront = 'linear-gradient(to bottom,#f8fafc 0 62%,#1e293b 62% 70%,#f8fafc 70% 76%,#1e293b 76% 84%,#f8fafc 84%)';
  b += prism(rect(-10, 28, 20, 11), 10, 17, { top: '#f1f5f9', side: '#e2e8f0', faces: { 0: bridgeFront } });
  b += prism(rect(-13, 28, 26, 3), 25, 2, { top: '#f8fafc', side: '#cbd5e1' });
  // ống khói: đỏ, chóp đen
  b += prism(rect(-3, 33, 6, 5), 27, 9, { top: '#0f172a', side: 'linear-gradient(to bottom,#dc2626 0 70%,#0f172a 70%)' });
  // cột anten
  b += prism(rect(-0.6, 29.5, 1.2, 1.2), 27, 7, { top: '#94a3b8', side: '#94a3b8', flat: true });
  return wrap('ship', 'Tàu container 3D', SHIP_MODEL_SIZE, b, '<div class="vm-wake"></div><div class="vm-shadow vm-shadow-ship"></div>');
}
