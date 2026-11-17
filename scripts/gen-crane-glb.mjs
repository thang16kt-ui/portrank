/**
 * Sinh mô hình cẩu bờ STS low-poly (public/models/crane.glb) bằng code – không dùng tài sản bên ngoài.
 * Đơn vị: MÉT. Hệ trục: +X = phía mặt nước (cần vươn), Y = dọc cầu cảng, Z = hướng lên. Gốc toạ độ ở giữa chân cẩu.
 * Tác giả: PortRank (CC0).  Chạy: node scripts/gen-crane-glb.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const parts = new Map(); // key màu → { color, tris }

function box(color, x0, x1, y0, y1, z0, z1) {
  const key = color.join(',');
  if (!parts.has(key)) parts.set(key, { color, tris: [] });
  const t = parts.get(key).tris;
  const quad = (a, b, c, d) => t.push([a, b, c], [a, c, d]);
  const [A, B, C, D] = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]];
  const [E, F, G, H] = [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  quad(A, D, C, B);
  quad(E, F, G, H);
  quad(A, B, F, E);
  quad(B, C, G, F);
  quad(C, D, H, G);
  quad(D, A, E, H);
}

const STEEL = [0.93, 0.36, 0.1, 1];
const STEEL_D = [0.72, 0.25, 0.07, 1];
const WHITE = [0.93, 0.94, 0.95, 1];
const DARK = [0.16, 0.2, 0.27, 1];
const YEL = [0.98, 0.8, 0.15, 1];
const BLUE = [0.12, 0.45, 0.8, 1];

const LEG_X = 15, LEG_Y = 13, H = 46;
// 4 chân
for (const x of [-LEG_X, LEG_X]) for (const y of [-LEG_Y, LEG_Y]) box(STEEL, x - 1.2, x + 1.2, y - 1.2, y + 1.2, 0, H);
// dầm ngang chân (sill beam) dọc cầu cảng + bánh xe
for (const x of [-LEG_X, LEG_X]) {
  box(STEEL_D, x - 1, x + 1, -LEG_Y, LEG_Y, 5, 7);
  box(DARK, x - 1.6, x + 1.6, -LEG_Y - 3, LEG_Y + 3, 0, 1.6);
}
// khung cổng trên
for (const y of [-LEG_Y, LEG_Y]) box(STEEL_D, -LEG_X, LEG_X, y - 1, y + 1, H - 2.5, H);
for (const x of [-LEG_X, LEG_X]) box(STEEL_D, x - 1, x + 1, -LEG_Y, LEG_Y, H - 2.5, H);
// cần (boom) – 2 dầm chạy từ phía bờ ra mặt nước
for (const y of [-4.5, 4.5]) box(STEEL, -38, 66, y - 0.9, y + 0.9, H, H + 3);
for (const x of [-38, -12, 14, 40, 66]) box(STEEL_D, x - 0.6, x + 0.6, -4.5, 4.5, H + 0.6, H + 2.4);
// tháp chữ A + thanh giằng ngang đỉnh
for (const y of [-4.5, 4.5]) box(STEEL, 12, 14.4, y - 0.9, y + 0.9, H + 3, H + 32);
box(STEEL_D, 12, 14.4, -4.5, 4.5, H + 30, H + 32);
// buồng máy
box(WHITE, -30, -12, -7, 7, H + 3, H + 11);
box(DARK, -30.1, -29.9, -5, 5, H + 5, H + 9);
// xe tời + cabin điều khiển + khung chụp + container đang cẩu
box(DARK, 30, 36, -4, 4, H - 2, H);
box(WHITE, 26, 30, -2, 2, H - 4.5, H - 1);
box(YEL, 27, 39, -1.4, 1.4, 24, 25);
box(BLUE, 26.9, 39.1, -1.22, 1.22, 21.4, 24);
box(DARK, 32.8, 33.2, -0.2, 0.2, 25, H - 2);

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
for (const part of parts.values()) {
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
  asset: { version: '2.0', generator: 'PortRank gen-crane-glb', copyright: 'CC0 – PortRank' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'sts_crane' }],
  meshes: [{ primitives, name: 'crane' }],
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
writeFileSync('public/models/crane.glb', Buffer.concat([header, jh, json, bh, bin]));
console.log(`public/models/crane.glb: ${parts.size} primitives, ${((12 + 16 + json.length + bin.length) / 1024) | 0} KB`);
