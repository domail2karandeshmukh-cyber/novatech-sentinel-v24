// Outbound-only bridge from the Mac-owned helper to the public website.
// No incoming ports or tunnels are required. Every real shutdown uses native owner approval.
import { readFileSync, statSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import { requestNativeShutdownV24, remoteSessionApprovalMeta } from './mac-approval.mjs';

export const CONFIG_PATH = join(homedir(), 'Library', 'Application Support', 'NOVATECH Remote Agent', 'cloud.json');
export function loadCloudConfig(path = CONFIG_PATH) {
  try {
    const info = statSync(path);
    if ((info.mode & 0o077) !== 0) throw new Error('cloud.json is accessible to other users. Restrict it to mode 600.');
    const { url, deviceKey } = JSON.parse(readFileSync(path, 'utf8'));
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Cloud URL must be a plain HTTPS origin.');
    if (!/^[a-f0-9]{64}$/.test(deviceKey)) throw new Error('Cloud device key must be 64 lowercase hexadecimal characters.');
    return { url: parsed.origin, deviceKey };
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export function createCloudRelay({ config, live, approval, execute, fetchImpl = fetch, pollIntervalMs = 2500, logger = console, platform = process.platform }) {
  if (!config) return null;
  let stopped = false;
  let busy = false;
  let lastError = '';
  let activeController = null;
  let timer = null;
  const url = action => `${config.url}/api/remote?action=${encodeURIComponent(action)}`;
  async function call(action, body) {
    const result = await fetchImpl(url(action), {
      method: body ? 'POST' : 'GET',
      headers: { 'X-Novatech-Device-Key': config.deviceKey, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12000),
    });
    let json;
    try { json = await result.json(); } catch { throw new Error('Cloud relay returned an invalid response.'); }
    if (!result.ok) throw new Error(json?.error || `Relay responded ${result.status}.`);
    lastError = '';
    return json;
  }
  const status = () => ({ available: true, connected: !lastError, error: lastError || null, busy });
  async function openPair(body, state) {
    try {
      await call('open', { code: state.pairingCode, controllerName: body.controllerName,
        workflowClosed: body.workflowClosed, approved: body.approved, scenarioId: body.scenarioId, governance: body.governance });
    } catch (error) {
      // The older private-LAN pairing must still work even if cloud storage is down.
      lastError = error instanceof Error ? error.message : 'Cloud pairing failed';
      logger.error(`Cloud registration failed, private LAN remains active: ${lastError}`);
    }
  }
  async function revoke() {
    activeController?.abort();
    await call('revoke', {});
  }
  async function tick() {
    if (stopped || busy) return;
    try {
      const { request } = await call('poll');
      if (!request) return;
      busy = true;
      const controller = new AbortController();
      activeController = controller;
      let status = 'failed';
      try {
        // Before prompting, check that the cloud relay is still accessible. If not, fail closed.
        if (!live || platform !== 'darwin') throw new Error('Live macOS helper not enabled.');
        const meta = remoteSessionApprovalMeta({ requesterName: request.name,
          governance: request.governance, sessionExpiresAt: request.expiresAt, deviceName: hostname() });
        const outcome = await (execute ? execute(meta, controller.signal) : requestNativeShutdownV24(meta, {
          approver: approval.approver, binaryPath: approval.binaryPath, signal: controller.signal,
        }));
        status = outcome.status === 'requested' ? 'approved-shutdown-requested' : 'rejected';
      } catch (err) {
        logger.error(`Cloud request failed closed: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
      try { await call('result', { id: request.id, status }); }
      catch (err) { logger.error(`Could not record cloud result: ${err instanceof Error ? err.message : 'unknown error'}`); }
      activeController = null;
      busy = false;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Unknown relay error';
    }
  }
  function start() {
    logger.log(`NOVATECH cloud relay enabled: ${config.url} (outbound HTTPS; local owner approval required)`);
    timer = setInterval(() => { void tick(); }, pollIntervalMs);
    timer.unref?.();
    void tick();
  }
  function stop() { stopped = true; activeController?.abort(); if (timer) clearInterval(timer); }
  return { openPair, revoke, status, start, stop, tick };
}
