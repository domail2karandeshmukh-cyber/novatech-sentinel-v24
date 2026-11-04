import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { RemotePairing, PAIRING_WINDOW_MS, SESSION_DURATION_MS, REMOTE_CONFIRMATION } from '../scripts/remote-pairing.mjs';
import { createLocalPairingServer, createRemoteControllerServer } from '../scripts/remote-helper-servers.mjs';
import { certificateMaterial, privateLanAddress } from '../scripts/remote-network.mjs';

function manager() {
  let now = Date.parse('2026-10-27T12:00:00Z');
  const pairing = new RemotePairing({ clock: () => now, getCode: () => '439281', getToken: () => 'a'.repeat(64) });
  return { pairing, tick: ms => { now += ms; } };
}

const approve = { workflowClosed: true, approved: true, scenarioId: 'ransomware', controllerName: 'Pavan' };

test('Mac must explicitly mark its ransomware rehearsal approved and closed', () => {
  const { pairing } = manager();
  assert.throws(() => pairing.activate({ ...approve, approved: false }), /Finish/);
  assert.throws(() => pairing.activate({ ...approve, scenarioId: 'payments' }), /Finish/);
  assert.throws(() => pairing.activate({ ...approve, workflowClosed: false }), /Finish/);
  assert.equal(pairing.activate(approve).pairingCode, '439281');
});

test('chooses a Wi-Fi private IP and generates a reusable TLS certificate with an IP SAN', () => {
  const address = privateLanAddress({
    utun0: [{ internal: false, family: 'IPv4', address: '100.64.1.4' }],
    en0: [{ internal: false, family: 'IPv4', address: '192.168.42.10' }],
    lo0: [{ internal: true, family: 'IPv4', address: '127.0.0.1' }],
  });
  assert.equal(address, '192.168.42.10');
  const folder = mkdtempSync(join(tmpdir(), 'novatech-cert-material-'));
  try {
    const first = certificateMaterial(address, folder);
    assert.match(new X509Certificate(first.cert).subjectAltName, /192\.168\.42\.10/);
    assert.match(first.fingerprint, /^([A-F0-9]{2}:){31}[A-F0-9]{2}$/);
    assert.equal(statSync(join(folder, 'lan-server.key')).mode & 0o777, 0o600);
    assert.equal(certificateMaterial(address, folder).fingerprint, first.fingerprint);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('pairing PIN expires after five minutes; wrong attempts cannot be brute-forced', () => {
  const { pairing, tick } = manager();
  pairing.activate(approve);
  assert.throws(() => pairing.redeem('000000'), /Incorrect/);
  tick(PAIRING_WINDOW_MS + 1);
  assert.throws(() => pairing.redeem('439281'), /expired/);
  pairing.activate(approve);
  for (let i = 0; i < 5; i++) assert.throws(() => pairing.redeem('000000'), /Incorrect/);
  assert.throws(() => pairing.redeem('439281'), /Too many/);
});

test('a single 30-minute bearer session expires and is revoked immediately', () => {
  const { pairing, tick } = manager();
  pairing.activate(approve);
  const { token, expiresAt } = pairing.redeem('439281');
  assert.equal(pairing.localStatus().connected, true);
  assert.equal(pairing.authorize(token).name, 'Pavan');
  assert.throws(() => pairing.authorize('invalid'), /expired or been revoked/);
  tick(SESSION_DURATION_MS - 1000);
  assert.equal(pairing.authorize(token).expiresAt, expiresAt);
  tick(1000);
  assert.throws(() => pairing.authorize(token), /expired/);
  pairing.activate(approve);
  pairing.redeem('439281');
  pairing.revoke();
  assert.throws(() => pairing.authorize(token), /revoked/);
});

test('preview cannot shut down anything; live calls only the injected mocked executor once', async () => {
  const { pairing } = manager();
  pairing.activate(approve);
  const { token } = pairing.redeem('439281');
  let calls = 0;
  const executor = async name => { calls++; assert.equal(name, 'Pavan'); return { status: 'cancelled' }; };
  await assert.rejects(() => pairing.request(token, { confirmation: 'NO' }, { live: false, executor }), /confirm/i);
  assert.deepEqual(await pairing.request(token, { confirmation: REMOTE_CONFIRMATION }, { live: false, executor }), { status: 'preview' });
  assert.equal(calls, 0);
  // New clock avoids rate limit for the next request.
  const liveSession = manager();
  liveSession.pairing.activate(approve);
  const { token: liveToken } = liveSession.pairing.redeem('439281');
  assert.deepEqual(await liveSession.pairing.request(liveToken, { confirmation: REMOTE_CONFIRMATION }, { live: true, executor, platform: 'darwin' }), { status: 'cancelled' });
  assert.equal(calls, 1);
  await assert.rejects(() => liveSession.pairing.request(liveToken, { confirmation: REMOTE_CONFIRMATION }, { live: true, executor, platform: 'darwin' }), /just made/);
});

test('Mac owner revocation cancels an outstanding mocked approval dialog', async () => {
  const { pairing } = manager();
  pairing.activate(approve);
  const { token } = pairing.redeem('439281');
  const blockedNative = () => new Promise((_resolve, reject) => {
    // The simulated dialog is waiting for an owner decision until it is aborted.
    pairing.pendingController.signal.addEventListener('abort', () => reject(new Error('Owner revoked permission')));
  });
  const pending = pairing.request(token, { confirmation: REMOTE_CONFIRMATION }, { live: true, executor: blockedNative, platform: 'darwin' });
  assert.equal(pairing.busy, true);
  pairing.revoke();
  await assert.rejects(pending, /revoked permission/);
  assert.equal(pairing.busy, false);
  assert.throws(() => pairing.authorize(token), /revoked/);
});

async function withServer(server, run) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try { await run(server.address().port); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('only the local Vite origin can create or revoke a pairing', async () => {
  const { pairing } = manager();
  const server = createLocalPairingServer({ pairing, address: '127.0.0.1', fingerprint: 'TEST', live: false });
  await withServer(server, async port => {
    const url = `http://127.0.0.1:${port}`;
    const denied = await fetch(`${url}/state`, { headers: { Origin: 'https://untrusted.example' } });
    assert.equal(denied.status, 403);
    const activated = await fetch(`${url}/pair`, { method: 'POST', headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }, body: JSON.stringify(approve) });
    assert.equal(activated.status, 200);
    assert.equal((await activated.json()).pairingCode, '439281');
    const status = await fetch(`${url}/state`, { headers: { Origin: 'http://localhost:5173' } });
    assert.equal((await status.json()).pairingCode, '439281');
  });
});

async function httpsJson(port, path, method = 'GET', body, token, origin = `https://127.0.0.1:${port}`) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = httpsRequest({ hostname: '127.0.0.1', port, path, method, rejectUnauthorized: false, headers: { Host: `127.0.0.1:${port}`, ...(data ? { Origin: origin, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test('HTTPS remote controller requires correct origin, pairing code and bearer token', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'novatech-cert-test-'));
  const keyFile = join(scratch, 'test.key');
  const certFile = join(scratch, 'test.crt');
  try {
    execFileSync('openssl', ['req', '-x509', '-nodes', '-newkey', 'rsa:2048', '-days', '1', '-keyout', keyFile, '-out', certFile, '-subj', '/CN=127.0.0.1'], { stdio: 'ignore' });
    const { pairing } = manager();
    pairing.activate(approve);
    const server = createRemoteControllerServer({ key: readFileSync(keyFile), cert: readFileSync(certFile), pairing, address: '127.0.0.1', live: false, executor: () => { throw new Error('Never run native shutdown in tests'); } });
    await withServer(server, async port => {
      const forbidden = await httpsJson(port, '/api/pair', 'POST', { code: '439281' }, null, 'https://attacker.example');
      assert.equal(forbidden.status, 403);
      const accepted = await httpsJson(port, '/api/pair', 'POST', { code: '439281' });
      assert.equal(accepted.status, 200);
      const { token } = accepted.body;
      assert.ok(token);
      assert.equal((await httpsJson(port, '/api/session')).status, 403);
      assert.equal((await httpsJson(port, '/api/session', 'GET', undefined, token)).status, 200);
      const preview = await httpsJson(port, '/api/shutdown', 'POST', { confirmation: REMOTE_CONFIRMATION }, token);
      assert.equal(preview.body.status, 'preview');
    });
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
