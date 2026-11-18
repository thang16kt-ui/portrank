/**
 * API trung gian của PortRank – chạy trong máy chủ Node (`npm start`) và trong dev server của Vite.
 * Giữ KEY ở phía máy chủ: trình duyệt không bao giờ thấy key hãng tàu.
 *
 *   GET /api/config                 → các tính năng đang bật (không lộ key)
 *   GET /api/hts/search?keyword=…   → chuyển tiếp tới USITC HTS REST (https://hts.usitc.gov/reststop/search)
 *   GET /api/hts/exportList?from=…&to=…
 *                                   → https://hts.usitc.gov/reststop/exportList (đủ dòng tiêu đề trung gian, dùng cho Chương 99)
 *   GET /api/taric/measures.jsp?… và /api/taric/measures_details.jsp?…
 *                                   → EU TARIC (ec.europa.eu/taxation_customs/dds2/taric) – biện pháp thuế của EU theo mã + xuất xứ
 *   GET /api/wits/reporter/{nnn}/partner/{nnn}/product/{hs6}/year/{yyyy}/datatype/reported
 *                                   → WITS (World Bank) – UNCTAD TRAINS, thuế MFN/ưu đãi theo HS6 cho mọi nước
 *   GET /api/schedules?pol=&pod=&from=&to=&carrier=
 *                                   → gọi DCSA Commercial Schedules 1.0 `GET {base}/v1/point-to-point-routes`
 *                                     của từng hãng đã cấu hình, trả về JSON gốc theo chuẩn DCSA
 *
 * Cấu hình hãng tàu bằng biến môi trường (xem README):
 *   DCSA_CARRIERS=MAERSK,CMACGM
 *   DCSA_<ID>_URL=https://…              (gốc API, KHÔNG gồm /v1/point-to-point-routes)
 *   DCSA_<ID>_HEADERS={"Consumer-Key":"…"}   (JSON các header xác thực)  – hoặc –
 *   DCSA_<ID>_KEY=…  và  DCSA_<ID>_KEY_HEADER=Authorization  (mặc định Authorization)
 */

import { handleRoad, roadConfig } from './road.mjs';

const HTS_BASE = 'https://hts.usitc.gov/reststop/search';
const HTS_EXPORT = 'https://hts.usitc.gov/reststop/exportList';
const HTS_CODE = /^[0-9.]{4,13}$/;
const WITS_BASE = 'https://wits.worldbank.org/API/V1/SDMX/V21/datasource/TRN';
const TARIC_BASE = 'https://ec.europa.eu/taxation_customs/dds2/taric';
const TARIC_PAGES = new Set(['/api/taric/measures.jsp', '/api/taric/measures_details.jsp']);
const WITS_PATH = /^\/api\/wits(\/reporter\/\d{3}\/partner\/(?:\d{3}|all)\/product\/\d{6}\/year\/\d{4}\/datatype\/reported)$/;
const LOCODE = /^[A-Z]{2}[A-Z2-9]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMEOUT_MS = 15000;
const MAX_PAGES = 3;

/** Danh sách hãng đã cấu hình từ biến môi trường */
export function dcsaCarriers(env = process.env) {
  return String(env.DCSA_CARRIERS ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .map((id) => {
      const url = env[`DCSA_${id}_URL`];
      let headers = {};
      try {
        if (env[`DCSA_${id}_HEADERS`]) headers = JSON.parse(env[`DCSA_${id}_HEADERS`]);
      } catch {
        headers = null;
      }
      if (env[`DCSA_${id}_KEY`] && headers) headers[env[`DCSA_${id}_KEY_HEADER`] || 'Authorization'] = env[`DCSA_${id}_KEY`];
      return { id, url: url ? String(url).replace(/\/+$/, '') : '', headers, ok: !!url && !!headers && Object.keys(headers).length > 0 };
    });
}

async function fetchWithTimeout(url, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

const htsCache = new Map();

async function handleHts(url) {
  const keyword = url.searchParams.get('keyword') ?? '';
  if (!/^[0-9.]{4,13}$/.test(keyword)) return json(400, { error: 'keyword phải là mã HTS, vd 9403.60' });
  const hit = htsCache.get(keyword);
  if (hit && Date.now() - hit.at < 12 * 3600e3) return json(200, hit.body, { 'Cache-Control': 'public, max-age=3600' });
  const res = await fetchWithTimeout(`${HTS_BASE}?keyword=${encodeURIComponent(keyword)}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return json(502, { error: `HTS trả về HTTP ${res.status}` });
  const body = await res.json();
  htsCache.set(keyword, { at: Date.now(), body });
  return json(200, body, { 'Cache-Control': 'public, max-age=3600' });
}

async function cachedJson(key, upstream) {
  const hit = htsCache.get(key);
  if (hit && Date.now() - hit.at < 12 * 3600e3) return json(200, hit.body, { 'Cache-Control': 'public, max-age=3600' });
  const res = await fetchWithTimeout(upstream, { headers: { Accept: 'application/json' } });
  if (!res.ok) return json(502, { error: `HTS trả về HTTP ${res.status}` });
  const body = await res.json();
  htsCache.set(key, { at: Date.now(), body });
  return json(200, body, { 'Cache-Control': 'public, max-age=3600' });
}

async function handleHtsExport(url) {
  const from = url.searchParams.get('from') ?? '', to = url.searchParams.get('to') ?? '';
  if (!HTS_CODE.test(from) || !HTS_CODE.test(to)) return json(400, { error: 'from/to phải là mã HTS, vd 9403.60 và 9403.60.99.99' });
  const q = new URLSearchParams({ from, to, format: 'JSON', styles: 'false' });
  return cachedJson(`export:${from}:${to}`, `${HTS_EXPORT}?${q}`);
}

const taricCache = new Map();

/** Chuyển tiếp 2 trang TARIC cần thiết (trả HTML); mã hàng phải là 6–10 số */
async function handleTaric(url) {
  if (!TARIC_PAGES.has(url.pathname)) return json(404, { error: 'Không có API này' });
  if (!/^\d{6,10}$/.test(url.searchParams.get('Taric') ?? '')) return json(400, { error: 'Taric phải là mã hàng 6–10 số' });
  const target = `${TARIC_BASE}/${url.pathname.slice('/api/taric/'.length)}${url.search}`;
  const hit = taricCache.get(target);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.out;
  const res = await fetchWithTimeout(target, { headers: { Accept: 'text/html' } });
  if (!res.ok) return json(502, { error: `TARIC trả về HTTP ${res.status}` });
  const out = { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }, body: await res.text() };
  taricCache.set(target, { at: Date.now(), out });
  return out;
}

const witsCache = new Map();

async function handleWits(url) {
  const m = url.pathname.match(WITS_PATH);
  if (!m) return json(400, { error: 'Đường dẫn phải dạng /api/wits/reporter/392/partner/000/product/610910/year/2023/datatype/reported' });
  const key = m[1];
  const hit = witsCache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600e3) return hit.out;
  const res = await fetchWithTimeout(`${WITS_BASE}${key}?format=JSON`, { headers: { Accept: 'application/json' } });
  // WITS trả 404 khi năm / nước chưa có số liệu → chuyển nguyên 404 để app thử năm khác
  const out = res.status === 404 ? json(404, { error: 'NoRecordsFound' }) : res.ok ? json(200, await res.json(), { 'Cache-Control': 'public, max-age=86400' }) : json(502, { error: `WITS trả về HTTP ${res.status}` });
  if (out.status !== 502) witsCache.set(key, { at: Date.now(), out });
  return out;
}

/** Gọi một hãng: theo chuẩn DCSA, trang sau chỉ gửi ?cursor=… (không kèm tham số khác) */
export async function fetchDcsaRoutes(carrier, q) {
  const params = new URLSearchParams({ placeOfReceipt: q.pol, placeOfDelivery: q.pod, limit: '50' });
  if (q.from) params.set('departureStartDate', q.from);
  if (q.to) params.set('departureEndDate', q.to);
  const headers = { Accept: 'application/json', 'API-Version': '1', ...carrier.headers };
  const routes = [];
  let next = `${carrier.url}/v1/point-to-point-routes?${params}`;
  for (let page = 0; page < MAX_PAGES && next; page++) {
    const res = await fetchWithTimeout(next, { headers });
    if (!res.ok) {
      // không chuyển tiếp nội dung lỗi để tránh lộ thông tin xác thực
      throw new Error(res.status === 401 || res.status === 403 ? `hãng từ chối xác thực (HTTP ${res.status}) – kiểm tra key` : `HTTP ${res.status}`);
    }
    const body = await res.json();
    if (!Array.isArray(body)) throw new Error('phản hồi không phải mảng PointToPoint theo DCSA CS 1.0');
    routes.push(...body);
    const cursor = res.headers.get('Next-Page-Cursor');
    next = cursor ? `${carrier.url}/v1/point-to-point-routes?cursor=${encodeURIComponent(cursor)}` : null;
  }
  return routes;
}

async function handleSchedules(url, env) {
  const q = {
    pol: (url.searchParams.get('pol') ?? '').toUpperCase(),
    pod: (url.searchParams.get('pod') ?? '').toUpperCase(),
    from: url.searchParams.get('from') ?? '',
    to: url.searchParams.get('to') ?? '',
  };
  if (!LOCODE.test(q.pol) || !LOCODE.test(q.pod)) return json(400, { error: 'pol/pod phải là UN/LOCODE 5 ký tự' });
  if ((q.from && !DATE.test(q.from)) || (q.to && !DATE.test(q.to))) return json(400, { error: 'from/to dạng YYYY-MM-DD' });
  const only = (url.searchParams.get('carrier') ?? '').toUpperCase().split(',').filter(Boolean);
  const carriers = dcsaCarriers(env).filter((c) => c.ok && (!only.length || only.includes(c.id)));
  const results = await Promise.all(
    carriers.map(async (c) => {
      try {
        return { carrier: c.id, routes: await fetchDcsaRoutes(c, q) };
      } catch (e) {
        return { carrier: c.id, routes: [], error: e.name === 'AbortError' ? 'quá thời gian chờ' : String(e.message ?? e) };
      }
    }),
  );
  return json(200, { fetchedAt: new Date().toISOString(), results });
}

function json(status, body, headers = {}) {
  return { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }, body: JSON.stringify(body) };
}

/** Xử lý một yêu cầu /api/*. Trả về null nếu không phải đường dẫn API. */
export async function handleApi(method, rawUrl, env = process.env) {
  const url = new URL(rawUrl, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return null;
  if (method !== 'GET') return json(405, { error: 'Chỉ hỗ trợ GET' });
  try {
    if (url.pathname === '/api/config') {
      const { browserKey: _publicBrowserKey, ...road } = roadConfig(env);
      return json(200, { server: true, hts: true, road, dcsa: dcsaCarriers(env).map((c) => ({ id: c.id, configured: c.ok })) });
    }
    if (url.pathname === '/api/road/config' || url.pathname === '/api/road/routes') return await handleRoad(url, env);
    if (url.pathname === '/api/hts/search') return await handleHts(url);
    if (url.pathname === '/api/hts/exportList') return await handleHtsExport(url);
    if (url.pathname.startsWith('/api/wits/')) return await handleWits(url);
    if (url.pathname.startsWith('/api/taric/')) return await handleTaric(url);
    if (url.pathname === '/api/schedules') return await handleSchedules(url, env);
    return json(404, { error: 'Không có API này' });
  } catch (e) {
    return json(502, { error: e.name === 'AbortError' ? 'Nguồn bên ngoài quá thời gian chờ' : `Lỗi: ${e.message}` });
  }
}

/** Middleware kiểu Connect (dùng cho Vite dev server và máy chủ Node) */
export function apiMiddleware(env = process.env) {
  return async (req, res, next) => {
    const out = await handleApi(req.method ?? 'GET', req.url ?? '/', env);
    if (!out) return next();
    res.writeHead(out.status, out.headers);
    res.end(out.body);
  };
}
