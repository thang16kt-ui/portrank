/**
 * Sinh mô hình tàu container low-poly (public/models/ship.glb) bằng code – không cần tải model ngoài.
 * Hệ trục: X = mũi tàu (bow), Y = mạn trái, Z = hướng lên. Chiều dài tàu = 1 đơn vị.
 * Tác giả: PortRank (CC0 – tự do sử dụng).  Chạy: node scripts/gen-ship-glb.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const parts = []; // { color: [r,g,b,a], tris: [[x,y,z]x3][] }

function quad(tris, a, b, c, d) {
  tris.push([a, b, c], [a, c, d]);
}

/** Hộp chữ nhật */
function box(color, x0, x1, y0, y1, z0, z1) {
  const t = [];
  const p = (x, y, z) => [x, y, z];
  const [A, B, C, D] = [p(x0, y0, z0), p(x1, y0, z0), p(x1, y1, z0), p(x0, y1, z0)];
  const [E, F, G, H] = [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)];
  quad(t, A, D, C, B); // đáy
  quad(t, E, F, G, H); // nóc
  quad(t, A, B, F, E);
  quad(t, B, C, G, F);
  quad(t, C, D, H, G);
  quad(t, D, A, E, H);
  parts.push({ color, tris: t });
}

/** Thân tàu: đáy hẹp, mũi nhọn, đuôi vát */
function hull(color, deckColor) {
  const L0 = -0.5, L1 = 0.5, bow = 0.36, W = 0.075, Wb = 0.05, zb = 0, zd = 0.07;
  // mặt cắt ngang: [x, nửa bề rộng mặt boong, nửa bề rộng đáy]
  const st = [
    [L0, W * 0.9, Wb * 0.7],
    [-0.4, W, Wb],
    [bow, W, Wb],
    [0.44, W * 0.6, Wb * 0.25],
    [L1, 0.004, 0.002],
  ];
  const t = [];
  for (let i = 1; i < st.length; i++) {
    const [xa, wa, ba] = st[i - 1], [xb, wb, bb] = st[i];
    // mạn phải (y âm) & trái (y dương)
    quad(t, [xa, -ba, zb], [xb, -bb, zb], [xb, -wb, zd], [xa, -wa, zd]);
    quad(t, [xa, ba, zb], [xa, wa, zd], [xb, wb, zd], [xb, bb, zb]);
    // đáy
    quad(t, [xa, -ba, zb], [xa, ba, zb], [xb, bb, zb], [xb, -bb, zb]);
  }
  // đuôi
  const [x0, w0, b0] = st[0];
  quad(t, [x0, -b0, zb], [x0, -w0, zd], [x0, w0, zd], [x0, b0, zb]);
  parts.push({ color, tris: t });
  // boong
  const d = [];
  for (let i = 1; i < st.length; i++) {
    const [xa, wa] = st[i - 1], [xb, wb] = st[i];
    quad(d, [xa, -wa, zd], [xb, -wb, zd], [xb, wb, zd], [xa, wa, zd]);
  }
  parts.push({ color: deckColor, tris: d });
  // vạch nước màu đỏ
  const r = [];
  for (let i = 1; i < st.length; i++) {
    const [xa, wa, ba] = st[i - 1], [xb, wb, bb] = st[i];
    const ka = 0.35, kb = 0.35;
    const za = zb + (zd - zb) * ka, zbb = zb + (zd - zb) * kb;
    const ya = ba + (wa - ba) * ka, yb = bb + (wb - bb) * kb;
    quad(r, [xa, -ba * 1.01, zb - 0.001], [xb, -bb * 1.01, zb - 0.001], [xb, -yb * 1.01, zbb], [xa, -ya * 1.01, za]);
    quad(r, [xa, ba * 1.01, zb - 0.001], [xa, ya * 1.01, za], [xb, yb * 1.01, zbb], [xb, bb * 1.01, zb - 0.001]);
  }
  parts.push({ color: [0.62, 0.1, 0.1, 1], tris: r });
}

hull([0.13, 0.2, 0.33, 1], [0.35, 0.38, 0.4, 1]);

// Cabin / đài chỉ huy ở phía đuôi
box([0.95, 0.95, 0.93, 1], -0.43, -0.34, -0.06, 0.06, 0.07, 0.17);
box([0.18, 0.28, 0.38, 1], -0.345, -0.338, -0.055, 0.055, 0.14, 0.16); // kính
box([0.95, 0.95, 0.93, 1], -0.36, -0.35, -0.085, 0.085, 0.16, 0.172); // cánh gà
// ống khói
box([0.85, 0.35, 0.1, 1], -0.47, -0.43, -0.02, 0.02, 0.1, 0.2);

// Container: các dãy (bay) xếp chồng, màu ngẫu nhiên có seed
const palette = [
  [0.85, 0.2, 0.15, 1], [0.1, 0.45, 0.75, 1], [0.95, 0.62, 0.1, 1], [0.15, 0.6, 0.35, 1],
  [0.55, 0.55, 0.58, 1], [0.6, 0.25, 0.55, 1], [0.95, 0.95, 0.95, 1], [0.1, 0.3, 0.5, 1],
];
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const byColor = new Map();
const bayL = 0.055, gap = 0.006, rowW = 0.0255, tierH = 0.022;
for (let bx = -0.31; bx + bayL <= 0.38; bx += bayL + gap) {
  const tiers = bx > 0.3 ? 2 : 3 + Math.floor(rnd() * 2);
  for (let row = -2.5; row <= 2.5; row += 1) {
    const h = Math.max(1, tiers - (Math.abs(row) > 2 ? 1 : 0) - (rnd() < 0.15 ? 1 : 0));
    for (let tier = 0; tier < h; tier++) {
      const c = palette[Math.floor(rnd() * palette.length)];
      const key = c.join(',');
      if (!byColor.has(key)) byColor.set(key, { color: c, tris: [] });
      const y0 = row * rowW - rowW / 2 + 0.0015, y1 = row * rowW + rowW / 2 - 0.0015;
      const z0 = 0.07 + tier * tierH, z1 = z0 + tierH - 0.0015;
      const before = parts.length;
      box(c, bx, bx + bayL, y0, y1, z0, z1);
      const p = parts.splice(before, 1)[0];
      byColor.get(key).tris.push(...p.tris);
    }
  }
}
parts.push(...byColor.values());

/* ───────────── Ghi GLB ───────────── */
const bufs = [];
const accessors = [], bufferViews = [], materials = [], primitives = [];
let offset = 0;
function pushView(arr, target) {
  const buf = Buffer.from(arr.buffer);
  const pad = (4 - (buf.length % 4)) % 4;
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
  bufs.push(buf, Buffer.alloc(pad));
  offset += buf.length + pad;
  return bufferViews.length - 1;
}
for (const part of parts) {
  const pos = [], nor = [];
  for (const [a, b, c] of part.tris) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n) || 1;
    n = n.map((x) => x / l);
    for (const p of [a, b, c]) { pos.push(...p); nor.push(...n); }
  }
  const P = new Float32Array(pos), Nn = new Float32Array(nor);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], P[i + k]); max[k] = Math.max(max[k], P[i + k]); }
  const pv = pushView(P, 34962), nv = pushView(Nn, 34962);
  accessors.push({ bufferView: pv, componentType: 5126, count: P.length / 3, type: 'VEC3', min, max });
  accessors.push({ bufferView: nv, componentType: 5126, count: Nn.length / 3, type: 'VEC3' });
  materials.push({ pbrMetallicRoughness: { baseColorFactor: part.color, metallicFactor: 0.1, roughnessFactor: 0.7 } });
  primitives.push({ attributes: { POSITION: accessors.length - 2, NORMAL: accessors.length - 1 }, material: materials.length - 1 });
}
const bin = Buffer.concat(bufs);
const gltf = {
  asset: { version: '2.0', generator: 'PortRank gen-ship-glb', copyright: 'CC0 – PortRank' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'container_ship' }],
  meshes: [{ primitives, name: 'ship' }],
  materials,
  accessors,
  bufferViews,
  buffers: [{ byteLength: bin.length }],
};
let json = Buffer.from(JSON.stringify(gltf));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
mkdirSync('public/models', { recursive: true });
writeFileSync('public/models/ship.glb', Buffer.concat([header, jh, json, bh, bin]));
console.log(`public/models/ship.glb: ${parts.length} primitives, ${(12 + 16 + json.length + bin.length) / 1024 | 0} KB`);
