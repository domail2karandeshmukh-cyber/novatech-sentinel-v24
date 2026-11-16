// NOVATECH cloud relay. The only privileged actor is the Mac-owned background agent.
// Vercel Functions are stateless, therefore every mutable item lives in Upstash Redis.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const PREFIX = 'novatech:cloud:v1:';
const PHRASE = 'REQUEST MAC SHUTDOWN';
const SESSION_SECONDS = 30 * 60;
const CODE_SECONDS = 5 * 60;
const MAX_JSON = 8192;
const DEVICE_KEY = 'karans-mac';

const sha = s => createHash('sha256').update(s).digest('hex');
function equals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
const key = (kind, id = DEVICE_KEY) => PREFIX + kind + ':' + id;
// Vercel's Upstash Marketplace may inject KV_REST_API_* when a custom STORAGE prefix is used.
// Both official variable conventions are supported without copying secrets between settings.
const redisUrl = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const configured = () => Boolean(redisUrl() && redisToken() && process.env.NOVATECH_CLOUD_DEVICE_KEY?.length >= 32);
const respond = (res, status, object) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(status).end(JSON.stringify(object));
};
const clientError = (res, message, status = 400) => respond(res, status, { error: message });
async function redis(...command) {
  const url = new URL(redisUrl());
  if (url.protocol !== 'https:') throw new Error('Redis endpoint must use HTTPS.');
  const result = await fetch(url, {
    method: 'POST', headers: { authorization: `Bearer ${redisToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify(command), signal: AbortSignal.timeout(6000),
  });
  if (!result.ok) throw new Error('Remote relay store unavailable.');
  const json = await result.json();
  if (json.error) throw new Error('Remote relay store rejected the request.');
  return json.result;
}
async function getJSON(k) { const s = await redis('GET', k); return s ? JSON.parse(s) : null; }
async function setJSON(k, object, ttl) { await redis('SET', k, JSON.stringify(object), 'EX', ttl); }
function device(req) {
  const provided = req.headers['x-novatech-device-key'];
  return equals(provided, process.env.NOVATECH_CLOUD_DEVICE_KEY);
}
async function session(req) {
  const authorization = req.headers.authorization;
  const token = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const stored = await getJSON(key('session'));
  return stored && equals(stored.tokenHash, sha(token)) && stored.expiresAt > Date.now() ? stored : null;
}
async function payload(req) {
  if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) throw new Error('JSON POST required.');
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  if (raw.length > MAX_JSON) throw new Error('Request body too large.');
  const body = JSON.parse(raw);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid JSON object.');
  return body;
}
const validCode = c => typeof c === 'string' && /^\d{6}$/.test(c);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return clientError(res, 'Cross-origin requests are disabled.', 405);
  const action = typeof req.query?.action === 'string' ? req.query.action : '';
  if (req.method === 'GET' && action === 'health') return respond(res, 200, { service: 'novatech-cloud-relay', available: configured(), liveRequiresMacApproval: true });
  if (!configured()) return clientError(res, 'Secure relay not configured. Pairing and real shutdown are unavailable.', 503);
  try {
    if (action === 'open' && device(req)) {
      const body = await payload(req);
      if (!validCode(body.code) || body.controllerName !== 'Pierre Sauvage' || body.workflowClosed !== true || body.approved !== true || body.scenarioId !== 'ransomware') {
        return clientError(res, 'Approved ransomware workflow and valid pairing code required.');
      }
      // A new Mac-owned code atomically invalidates any earlier cloud session.
      await redis('DEL', key('session'));
      await redis('DEL', key('attempts'));
      await setJSON(key('pairing'), { codeHash: sha(body.code), openedAt: Date.now(), governance: body.governance ?? null }, CODE_SECONDS);
      return respond(res, 200, { registered: true, pairingExpiresInSeconds: CODE_SECONDS });
    }
    if (action === 'revoke' && device(req)) {
      await redis('DEL', key('pairing'), key('session'));
      return respond(res, 200, { revoked: true });
    }
    if (action === 'pair' && req.method === 'POST') {
      const body = await payload(req);
      // Global throttling applies even when codes are invalid, so no arbitrary IP bypass.
      const used = Number(await redis('INCR', key('attempts')));
      if (used === 1) await redis('EXPIRE', key('attempts'), CODE_SECONDS);
      if (used > 5) return clientError(res, 'Too many attempts. Ask Karan to issue a new code.', 429);
      const entry = await getJSON(key('pairing'));
      if (!entry || !validCode(body.code) || !equals(entry.codeHash, sha(body.code))) return clientError(res, 'Pairing code is invalid or expired.', 403);
      const token = randomBytes(32).toString('hex');
      const expiresAt = Date.now() + SESSION_SECONDS * 1000;
      await setJSON(key('session'), { tokenHash: sha(token), expiresAt, name: 'Pierre Sauvage', governance: entry.governance }, SESSION_SECONDS);
      await redis('DEL', key('pairing'));
      return respond(res, 200, { token, name: 'Pierre Sauvage', expiresAt });
    }
    if (action === 'session' && req.method === 'GET') {
      const st = await session(req);
      return st ? respond(res, 200, { name: st.name, expiresAt: st.expiresAt }) : clientError(res, 'Session expired or revoked.', 401);
    }
    if (action === 'request' && req.method === 'POST') {
      const st = await session(req);
      if (!st) return clientError(res, 'Pairing expired or revoked.', 401);
      if (st.expiresAt - Date.now() < 60_000) return clientError(res, 'Session is nearly expired. Open a new pairing session.', 401);
      const body = await payload(req);
      if (body.confirmation !== PHRASE) return clientError(res, 'Explicit confirmation required.');
      const admitted = await redis('SET', key('request-lock'), '1', 'EX', 45, 'NX');
      if (admitted !== 'OK') return clientError(res, 'An action is already pending. Please wait.', 429);
      const id = randomBytes(16).toString('hex');
      await setJSON(key('request', id), { id, name: st.name, status: 'pending', at: Date.now(), sessionHash: st.tokenHash, expiresAt: Date.now() + 60_000 }, 120);
      await redis('LPUSH', key('queue'), id);
      await redis('EXPIRE', key('queue'), 180);
      return respond(res, 202, { id, status: 'pending', notice: 'Awaiting Karan’s physical Mac approval. This does not shut down anything by itself.' });
    }
    if (action === 'status' && req.method === 'GET') {
      const st = await session(req);
      if (!st) return clientError(res, 'Pairing expired or revoked.', 401);
      const id = req.query?.id;
      if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) return clientError(res, 'Invalid request ID.');
      const item = await getJSON(key('request', id));
      if (!item || !equals(item.sessionHash, st.tokenHash)) return clientError(res, 'Request not found.', 404);
      return respond(res, 200, { id, status: item.status, at: item.at });
    }
    if (action === 'poll' && device(req) && req.method === 'GET') {
      for (let i = 0; i < 3; i++) {
        const id = await redis('RPOP', key('queue'));
        if (!id) break;
        const request = await getJSON(key('request', id));
        const st = await getJSON(key('session'));
        if (request && st && request.status === 'pending' && request.expiresAt > Date.now() && st.expiresAt > Date.now() + 45_000 && equals(request.sessionHash, st.tokenHash)) {
          request.status = 'delivered';
          await setJSON(key('request', id), request, 120);
          return respond(res, 200, { request: { id, name: st.name, expiresAt: st.expiresAt, governance: st.governance } });
        }
      }
      return respond(res, 200, { request: null });
    }
    if (action === 'result' && device(req)) {
      const body = await payload(req);
      if (!/^[a-f0-9]{32}$/.test(body.id) || !['approved-shutdown-requested', 'rejected', 'failed'].includes(body.status)) return clientError(res, 'Invalid outcome.');
      const item = await getJSON(key('request', body.id));
      if (!item || item.status !== 'delivered') return clientError(res, 'Request not found or already resolved.', 409);
      item.status = body.status;
      item.completedAt = Date.now();
      await setJSON(key('request', body.id), item, 120);
      return respond(res, 200, { recorded: true });
    }
    return clientError(res, 'Route not found or not authorized.', 404);
  } catch (err) {
    console.error('NOVATECH relay operation failed', { action, name: err?.name });
    return clientError(res, 'Relay temporarily unavailable. No shutdown was initiated by the server.', 503);
  }
}
