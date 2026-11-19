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

// Low-poly container truck, X points forward; Z is up. Generated locally, no external assets.
const red=[.85,.12,.08,1], steel=[.12,.18,.25,1], orange=[.96,.48,.08,1], glass=[.08,.3,.42,1], tire=[.035,.04,.05,1];
box(steel,-.5,.5,-.1,.1,.06,.1);
box(red,.27,.48,-.12,.12,.1,.3);
box(glass,.475,.485,-.10,.10,.20,.28);
box(glass,.31,.43,-.125,-.12,.20,.27);
box(glass,.31,.43,.12,.125,.20,.27);
box(orange,-.48,.22,-.12,.12,.12,.4);
for(let x=-.46;x<.21;x+=.035){box([.78,.32,.04,1],x,x+.008,-.125,-.12,.13,.39);box([.78,.32,.04,1],x,x+.008,.12,.125,.13,.39);}
for(const x of [-.35,-.22,.36])for(const y of [-.14,.14]){
 const t=[],n=16,r=.065,w=.025;
 for(let i=0;i<n;i++){
  const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2;
  const p=(angle,side)=>[x+Math.cos(angle)*r,y+side,.07+Math.sin(angle)*r];
  quad(t,p(a,-w),p(b,-w),p(b,w),p(a,w));
  t.push([[x,y-w,.07],p(b,-w),p(a,-w)],[[x,y+w,.07],p(a,w),p(b,w)]);
 }
 parts.push({color:tire,tris:t});
 box([.7,.72,.75,1],x-.025,x+.025,y-w-.001,y+w+.001,.045,.095);
}
box([1,.95,.6,1],.48,.49,-.10,-.06,.12,.15);
box([1,.95,.6,1],.48,.49,.06,.10,.12,.15);
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
  asset: { version: '2.0', generator: 'PortRank gen-truck-glb', copyright: 'CC0 – PortRank' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'container_truck' }],
  meshes: [{ primitives, name: 'truck' }],
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
writeFileSync('public/models/truck.glb', Buffer.concat([header, jh, json, bh, bin]));
console.log(`public/models/truck.glb: ${parts.length} primitives, ${(12 + 16 + json.length + bin.length) / 1024 | 0} KB`);
