import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';

export const HELPER_PORT = 43871;
export const SHUTDOWN_PHRASE = 'SHUT DOWN MY MAC';

// Only a Vite development copy running on this same Mac can contact the helper.
// Production deployments deliberately cannot initiate local power operations.
export function isAllowedOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      /^517[3-9]$/.test(url.port) && url.pathname === '/' && !url.search && !url.hash;
  } catch { return false; }
}

export function constantTimeTokenMatch(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sendJson(response, status, body, origin) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
  });
  response.end(JSON.stringify(body));
}

async function readSmallJson(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk.toString('utf8');
    if (raw.length > 1024) throw new Error('Request too large.');
  }
  return JSON.parse(raw);
}

export function requestNativeShutdown({ signal } = {}) {
  // The dialog defaults to Cancel and times out to Cancel; no silent shutdown.
  // macOS may additionally ask permission to control System Events.
  const script = [
    'try',
    'set userDecision to display dialog "NOVATECH classroom rehearsal is complete. SHUT DOWN THIS MAC NOW? Save your work first. This closes applications and ends your presentation." with title "NOVATECH - FINAL MAC CONFIRMATION" buttons {"Cancel", "Shut Down Mac"} default button "Cancel" cancel button "Cancel" with icon caution giving up after 30',
    'if gave up of userDecision then return "NOVATECH_CANCELLED"',
    'if button returned of userDecision is not "Shut Down Mac" then return "NOVATECH_CANCELLED"',
    'on error number -128',
    'return "NOVATECH_CANCELLED"',
    'end try',
    'tell application "System Events" to shut down',
    'return "NOVATECH_REQUEST_SENT"',
  ].join('\n');

  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/osascript', ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'], ...(signal ? { signal } : {}) });
    let output = '';
    let errors = '';
    child.stdout.on('data', chunk => { output += chunk.toString('utf8').slice(0, 1024); });
    child.stderr.on('data', chunk => { errors += chunk.toString('utf8').slice(0, 1024); });
    child.on('error', reject);
    child.on('close', code => {
      if (output.includes('NOVATECH_CANCELLED')) resolve({ status: 'cancelled' });
      else if (output.includes('NOVATECH_REQUEST_SENT')) resolve({ status: 'requested' });
      else reject(new Error(code === 0 ? 'macOS did not confirm a shutdown request.' : errors.trim() || 'macOS denied the command.'));
    });
  });
}

export function createMacHelperServer({ token, live = false, platform = process.platform, executeShutdown = requestNativeShutdown, clock = Date.now }) {
  if (typeof token !== 'string' || token.length < 24) throw new Error('A fresh, strong session token is required.');
  let busy = false;
  let lastRequest = -Infinity;

  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (!isAllowedOrigin(origin)) {
      sendJson(response, 403, { error: 'Only the local NOVATECH development app can access this helper.' });
      return;
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Novatech-Token',
        'Access-Control-Max-Age': '300',
        Vary: 'Origin',
      });
      response.end();
      return;
    }
    if (request.method === 'GET' && request.url === '/health') {
      sendJson(response, 200, { service: 'novatech-mac-helper', live, macOS: platform === 'darwin', busy }, origin);
      return;
    }
    if (request.method !== 'POST' || request.url !== '/shutdown') {
      sendJson(response, 404, { error: 'Unknown helper route.' }, origin);
      return;
    }
    if (!constantTimeTokenMatch(request.headers['x-novatech-token'], token)) {
      sendJson(response, 401, { error: 'Incorrect helper session code. Check the Mac Terminal window.' }, origin);
      return;
    }
    if (!request.headers['content-type']?.startsWith('application/json')) {
      sendJson(response, 415, { error: 'JSON request required.' }, origin);
      return;
    }

    let payload;
    try { payload = await readSmallJson(request); }
    catch { sendJson(response, 400, { error: 'Invalid shutdown request.' }, origin); return; }
    if (payload?.confirmation !== SHUTDOWN_PHRASE || payload?.approvedWorkflow !== true || payload?.scenario !== 'ransomware') {
      sendJson(response, 400, { error: 'Missing explicit consent or completed ransomware workflow.' }, origin);
      return;
    }
    if (busy || clock() - lastRequest < 5000) {
      sendJson(response, 429, { error: 'A device request is already underway. Please wait.' }, origin);
      return;
    }
    if (live && platform !== 'darwin') {
      sendJson(response, 409, { error: 'Real shutdown is supported only on macOS.' }, origin);
      return;
    }
    busy = true;
    lastRequest = clock();
    try {
      const result = live ? await executeShutdown() : { status: 'preview' };
      sendJson(response, 200, result, origin);
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : 'The Mac declined this operation.' }, origin);
    } finally {
      busy = false;
    }
  });
}
