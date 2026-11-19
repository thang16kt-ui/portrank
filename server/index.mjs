/**
 * Máy chủ PortRank: phục vụ bản build (dist/) + API trung gian /api/* (xem server/api.mjs).
 *   npm run build && npm start        → http://localhost:8080  (PORT để đổi cổng)
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiMiddleware } from './api.mjs';

const ROOT = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const PORT = Number(process.env.PORT ?? 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

if (!existsSync(join(ROOT, 'index.html'))) {
  console.error('Chưa có dist/ – chạy "npm run build" trước.');
  process.exit(1);
}

const api = apiMiddleware();

function serveStatic(req, res) {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    if (path.startsWith('/assets/') || path.startsWith('/models/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    file = join(ROOT, 'index.html');
  }
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const cache = file.includes(`${ROOT}/assets/`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  api(req, res, () => serveStatic(req, res)).catch((e) => {
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end(String(e));
  });
}).listen(PORT, '0.0.0.0', () => {
  const carriers = String(process.env.DCSA_CARRIERS ?? '').trim();
  console.log(`PortRank đang chạy: http://localhost:${PORT}  ·  DCSA: ${carriers || 'chưa cấu hình hãng nào'}`);
});
