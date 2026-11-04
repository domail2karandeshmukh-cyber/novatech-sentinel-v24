import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { isAllowedOrigin } from './mac-helper-core.mjs';
import { REMOTE_CONFIRMATION } from './remote-pairing.mjs';

export const REMOTE_ADMIN_PORT = 43873;
export const REMOTE_CONTROLLER_PORT = 43872;
// V2.4: the local-only admin server (127.0.0.1, Vite origin only) accepts the optional governance
// record on /pair (up to 10 approvals). The LAN-facing controller keeps the 2 KB limit.
export const LOCAL_ADMIN_BODY_LIMIT = 16 * 1024;
const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function jsonBody(req, limit = 2048) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk.toString('utf8');
    if (raw.length > limit) throw new Error('Request too large.');
  }
  return JSON.parse(raw);
}

function reply(res, code, body, extra = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(JSON.stringify(body));
}

function errorText(err) { return err instanceof Error ? err.message : 'Request failed.'; }

export function createLocalPairingServer({ pairing, address, fingerprint, live, platform = process.platform }) {
  return createHttpServer(async (req, res) => {
    const origin = req.headers.origin;
    if (!isAllowedOrigin(origin)) { reply(res, 403, { error: 'Only the local NOVATECH app can change pairing.' }); return; }
    const cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); res.end(); return;
    }
    if (req.method === 'GET' && req.url === '/state') {
      reply(res, 200, { service: 'novatech-remote-agent', live, macOS: platform === 'darwin', remoteUrl: `https://${address}:${REMOTE_CONTROLLER_PORT}`, fingerprint, ...pairing.localStatus() }, cors); return;
    }
    if (req.method !== 'POST' || !['/pair', '/revoke'].includes(req.url)) { reply(res, 404, { error: 'Route not found.' }, cors); return; }
    if (!req.headers['content-type']?.startsWith('application/json')) { reply(res, 415, { error: 'JSON is required.' }, cors); return; }
    try {
      const body = await jsonBody(req, LOCAL_ADMIN_BODY_LIMIT);
      const state = req.url === '/revoke' ? pairing.revoke() : pairing.activate(body);
      reply(res, 200, state, cors);
    } catch (err) { reply(res, 400, { error: errorText(err) }, cors); }
  });
}

export function createRemoteControllerServer({ key, cert, pairing, address, live, executor, platform = process.platform }) {
  const html = readFileSync(resolve(projectDir, 'scripts/remote-ui.html'));
  const js = readFileSync(resolve(projectDir, 'scripts/remote-ui.js'));
  const css = readFileSync(resolve(projectDir, 'scripts/remote-ui.css'));
  return createHttpsServer({ key, cert, minVersion: 'TLSv1.2' }, async (req, res) => {
    // No CORS: this remote page must only make same-origin requests over TLS.
    const base = `https://${address}:${req.socket.localPort}`;
    if (req.headers.host !== `${address}:${req.socket.localPort}`) { reply(res, 403, { error: 'Unrecognized controller address.' }); return; }
    const headers = {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    };
    if (req.method === 'GET' && ['/', '/remote-controller.js', '/remote-controller.css'].includes(req.url)) {
      const isJS = req.url.endsWith('.js');
      const isCSS = req.url.endsWith('.css');
      const buffer = isJS ? js : isCSS ? css : html;
      res.writeHead(200, { ...headers, 'Content-Type': isJS ? 'text/javascript; charset=utf-8' : isCSS ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8' });
      res.end(buffer); return;
    }
    if (req.url === '/api/health' && req.method === 'GET') {
      reply(res, 200, { service: 'novatech-remote-controller', live, pairingAvailable: Boolean(pairing.localStatus().pairingCode) }, headers); return;
    }
    if (!req.url?.startsWith('/api/')) { reply(res, 404, { error: 'Not found.' }, headers); return; }
    if (req.method === 'POST' && (req.headers.origin !== base || !req.headers['content-type']?.startsWith('application/json'))) {
      reply(res, 403, { error: 'Request must originate from the secure controller.' }, headers); return;
    }
    let body;
    try { body = req.method === 'POST' ? await jsonBody(req) : {}; }
    catch { reply(res, 400, { error: 'Invalid request.' }, headers); return; }
    try {
      if (req.method === 'POST' && req.url === '/api/pair') {
        const session = pairing.redeem(body?.code);
        reply(res, 200, session, headers); return;
      }
      const authorization = req.headers.authorization;
      const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
      if (req.method === 'GET' && req.url === '/api/session') { reply(res, 200, pairing.authorize(bearer), headers); return; }
      if (req.method === 'POST' && req.url === '/api/shutdown') {
        if (body?.confirmation !== REMOTE_CONFIRMATION) throw new Error('Confirm the shutdown request first.');
        const result = await pairing.request(bearer, body, { live, executor, platform });
        reply(res, 200, result, headers); return;
      }
      reply(res, 404, { error: 'Route not found.' }, headers);
    } catch (err) { reply(res, 403, { error: errorText(err) }, headers); }
  });
}
