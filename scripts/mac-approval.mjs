// NOVATECH Sentinel V2.4 — opt-in native owner-approval companion (SwiftUI).
//
// Safety model (fail closed):
//  * The SwiftUI companion (native/macos/NovatechApprover) is ONLY a consent window. It never
//    runs commands, never uses the network and never shuts anything down. It prints exactly one
//    JSON decision line and exits: approve 0, reject 10, timeout 11, error 12.
//  * This module asks macOS to shut down only when the companion printed a valid "approve" line
//    for THIS request (matching requestId) AND exited with code 0, the request was not withdrawn
//    (abort signal) and the paired session has not expired. Everything else is "cancelled".
//  * The proven AppleScript dialog (requestNativeShutdown in mac-helper-core.mjs, unchanged)
//    stays the default. The companion is used only when explicitly enabled AND the built binary
//    exists and is executable.
//  * Under the Node test runner, every real native default (approval window, AppleScript dialog,
//    osascript shutdown) refuses to run, so a test that forgets a mock can never touch a Mac.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { accessSync as fsAccessSync, constants as fsConstants, existsSync as fsExistsSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requestNativeShutdown } from './mac-helper-core.mjs';

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const APPROVER_SWIFTUI = 'swiftui';
export const APPROVER_APPLESCRIPT = 'applescript';
export const DEFAULT_APPROVER_PATH = resolve(projectDir, 'native/macos/build/NovatechApprover');

/** Same limits as ApprovalLimits in native/macos/NovatechApprover/Sources/ApproverCore. */
export const APPROVAL_LIMITS = Object.freeze({
  maxText: 160,
  maxGovernance: 10,
  minTimeoutSeconds: 10,
  maxTimeoutSeconds: 60,
  defaultTimeoutSeconds: 30,
  maxOutputBytes: 4096,
});
export const DECISION_EXIT_CODES = Object.freeze({ approve: 0, reject: 10, timeout: 11, error: 12 });

export const DEFAULT_OWNER_NAME = 'Karan Deshmukh';
export const DEFAULT_REQUESTER_CONTEXT = 'Paired LAN session — identity is the name entered at pairing, not enterprise SSO';
export const SHUTDOWN_CONSEQUENCE = 'Shuts down this Mac. Open apps will close — save your work first.';
const NOT_PROVIDED = 'Not provided';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

function underTestRunner() {
  return Boolean(process.env.NODE_TEST_CONTEXT);
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------------------------
// Approver selection

function selectedApprover(env, argv) {
  // The last --approver=… flag wins over the environment, so --approver=applescript always rolls back.
  const flags = Array.isArray(argv) ? argv.filter(arg => typeof arg === 'string' && arg.startsWith('--approver=')) : [];
  if (flags.length) return { value: flags.at(-1).slice('--approver='.length).trim().toLowerCase(), source: '--approver flag' };
  const fromEnv = env?.NOVATECH_APPROVER;
  if (typeof fromEnv === 'string' && fromEnv.trim()) return { value: fromEnv.trim().toLowerCase(), source: 'NOVATECH_APPROVER' };
  return { value: APPROVER_APPLESCRIPT, source: 'default' };
}

function resolveBinaryPath(candidate) {
  if (typeof candidate !== 'string' || !candidate.trim()) return DEFAULT_APPROVER_PATH;
  const trimmed = candidate.trim();
  return isAbsolute(trimmed) ? trimmed : resolve(projectDir, trimmed);
}

function defaultAccessSync(path, mode) {
  fsAccessSync(path, mode);
  if (!statSync(path).isFile()) throw new Error('Not a regular file.');
}

/**
 * Decide which owner-approval UI the agent uses. Returns 'swiftui' ONLY when it is explicitly
 * enabled (NOVATECH_APPROVER=swiftui or --approver=swiftui), the Mac runs macOS and the built
 * binary exists and is executable. Otherwise 'applescript' (the proven default), with the reason.
 */
export function resolveApprover({
  env = process.env,
  argv = process.argv,
  existsSync = fsExistsSync,
  accessSync = defaultAccessSync,
  binaryPath,
  platform = process.platform,
} = {}) {
  const choice = selectedApprover(env, argv);
  const path = resolveBinaryPath(binaryPath ?? env?.NOVATECH_APPROVER_PATH);
  const requested = choice.value === APPROVER_SWIFTUI;
  const fallback = reason => ({ approver: APPROVER_APPLESCRIPT, reason, binaryPath: path, requested });

  if (!requested) {
    if (choice.value !== APPROVER_APPLESCRIPT) return fallback(`Unknown approver "${choice.value}" (from ${choice.source}); keeping the macOS dialog.`);
    return fallback(choice.source === 'default'
      ? 'SwiftUI companion not enabled (opt in with NOVATECH_APPROVER=swiftui or --approver=swiftui).'
      : `macOS dialog selected explicitly (${choice.source}).`);
  }
  if (platform !== 'darwin') return fallback('SwiftUI companion requested, but it only runs on macOS; keeping the default approval path.');
  if (!existsSync(path)) return fallback(`SwiftUI companion requested, but it is not built yet (${path}). Run "npm run companion:build". Using the macOS dialog.`);
  try {
    accessSync(path, fsConstants.X_OK);
  } catch {
    return fallback(`SwiftUI companion requested, but ${path} is not an executable file. Re-run "npm run companion:build". Using the macOS dialog.`);
  }
  return { approver: APPROVER_SWIFTUI, reason: `SwiftUI companion enabled by ${choice.source}: ${path}`, binaryPath: path, requested };
}

// ---------------------------------------------------------------------------------------------
// Request building (mirrors RequestParser.swift)

/**
 * Display-safe, single-line text: format characters (bidi overrides, zero-width characters) and
 * lone surrogates are removed, control characters and whitespace runs become one space, and the
 * result is trimmed and clamped to `max` code points. Returns null for non-strings/empty text.
 */
export function cleanText(value, max = APPROVAL_LIMITS.maxText) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\p{Cf}\p{Cs}]/gu, '').replace(/[\p{Cc}\p{Zl}\p{Zp}\s]+/gu, ' ').trim();
  if (!text) return null;
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  const clamped = chars.slice(0, max).join('').trimEnd();
  return clamped || null;
}

function cleanGovernanceRows(list) {
  if (!Array.isArray(list)) return [];
  const rows = [];
  for (const entry of list.slice(0, 200)) {
    if (rows.length >= APPROVAL_LIMITS.maxGovernance) break;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const gate = cleanText(entry.gate);
    const person = cleanText(entry.person);
    if (!gate || !person) continue;
    rows.push({ gate, person, role: cleanText(entry.role) ?? '', decision: cleanText(entry.decision) ?? '' });
  }
  return rows;
}

function clampTimeout(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return APPROVAL_LIMITS.defaultTimeoutSeconds;
  return Math.min(APPROVAL_LIMITS.maxTimeoutSeconds, Math.max(APPROVAL_LIMITS.minTimeoutSeconds, Math.trunc(value)));
}

/** Epoch milliseconds between 2001 and 2286, else null (protects against seconds or strings). */
export function validEpochMs(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value >= 1e12 && value <= 1e13 ? Math.trunc(value) : null;
}

/**
 * Build the sanitized request the companion reads on stdin. Unknown fields are dropped.
 * mode is 'PREVIEW' only when exactly 'PREVIEW' is given; anything else is 'LIVE', so the window
 * never under-states the consequence.
 */
export function buildApprovalRequest(meta = {}) {
  const source = meta && typeof meta === 'object' ? meta : {};
  const request = {
    requestId: typeof source.requestId === 'string' && REQUEST_ID_PATTERN.test(source.requestId) ? source.requestId : randomUUID(),
    ownerName: cleanText(source.ownerName) ?? DEFAULT_OWNER_NAME,
    requesterName: cleanText(source.requesterName) ?? 'Unidentified requester',
    requesterContext: cleanText(source.requesterContext) ?? DEFAULT_REQUESTER_CONTEXT,
    incidentId: cleanText(source.incidentId) ?? NOT_PROVIDED,
    scenario: cleanText(source.scenario) ?? NOT_PROVIDED,
    reason: cleanText(source.reason) ?? NOT_PROVIDED,
    consequence: cleanText(source.consequence) ?? SHUTDOWN_CONSEQUENCE,
    governance: cleanGovernanceRows(source.governance),
    mode: source.mode === 'PREVIEW' ? 'PREVIEW' : 'LIVE',
    channel: source.channel === 'LOCAL_HELPER' ? 'LOCAL_HELPER' : 'LAN_TLS',
    timeoutSeconds: clampTimeout(source.timeoutSeconds),
  };
  const deviceName = cleanText(source.deviceName);
  if (deviceName) request.deviceName = deviceName;
  const sessionExpiresAt = validEpochMs(source.sessionExpiresAt);
  if (sessionExpiresAt !== null) request.sessionExpiresAt = sessionExpiresAt;
  return request;
}

/** Metadata for a request that arrived through the paired LAN controller (remote agent). */
export function remoteSessionApprovalMeta({ requesterName, governance, sessionExpiresAt, deviceName } = {}) {
  return {
    ownerName: DEFAULT_OWNER_NAME,
    requesterName,
    requesterContext: DEFAULT_REQUESTER_CONTEXT,
    // Pairing only opens after the director-approved, closed ransomware rehearsal, so these
    // fallbacks are truthful when the web app has not sent a governance record.
    incidentId: governance?.incidentId || 'Not provided by the web app',
    scenario: governance?.scenario || 'Ransomware response rehearsal (classroom)',
    reason: governance?.reason || 'Final step after the director-approved, closed ransomware rehearsal.',
    governance: Array.isArray(governance?.approvals) ? governance.approvals : [],
    mode: 'LIVE',
    channel: 'LAN_TLS',
    sessionExpiresAt,
    deviceName,
    timeoutSeconds: APPROVAL_LIMITS.defaultTimeoutSeconds,
  };
}

/** Metadata for a request from the same-Mac helper (scripts/mac-control-helper.mjs). */
export function localHelperApprovalMeta({ deviceName } = {}) {
  return {
    ownerName: DEFAULT_OWNER_NAME,
    requesterName: 'NOVATECH web app on this Mac',
    requesterContext: 'Same-Mac helper — the request came from the local NOVATECH page with the helper session code, not from another device',
    incidentId: NOT_PROVIDED,
    scenario: 'Ransomware response rehearsal (classroom)',
    reason: 'Final step after the closed ransomware rehearsal, requested from Mac Control on this Mac.',
    governance: [],
    mode: 'LIVE',
    channel: 'LOCAL_HELPER',
    deviceName,
    timeoutSeconds: APPROVAL_LIMITS.defaultTimeoutSeconds,
  };
}

// ---------------------------------------------------------------------------------------------
// Talking to the companion

/**
 * Strictly parse the companion's stdout: exactly one JSON object line (one trailing newline is
 * allowed) with a known decision, a string-or-null requestId and an ISO decidedAt.
 */
export function parseDecisionLine(stdout) {
  const fail = (reason, detail) => ({ ok: false, reason, detail });
  if (typeof stdout !== 'string' || !stdout.trim()) return fail('no-output', 'The approval companion printed no decision — failed closed.');
  const body = stdout.endsWith('\n') ? stdout.slice(0, -1) : stdout;
  if (/[\r\n]/.test(body)) return fail('extra-output', 'The approval companion printed more than one line — failed closed.');
  let value;
  try { value = JSON.parse(body); }
  catch { return fail('malformed-output', 'The approval companion printed something that is not JSON — failed closed.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('malformed-output', 'The approval companion output is not a JSON object — failed closed.');
  if (typeof value.decision !== 'string' || !Object.hasOwn(DECISION_EXIT_CODES, value.decision)) return fail('malformed-output', 'The approval companion returned an unknown decision — failed closed.');
  if (!(typeof value.requestId === 'string' || value.requestId === null)) return fail('malformed-output', 'The approval companion returned no request id — failed closed.');
  if (typeof value.decidedAt !== 'string' || Number.isNaN(Date.parse(value.decidedAt))) return fail('malformed-output', 'The approval companion returned no decision time — failed closed.');
  if (value.detail !== undefined && typeof value.detail !== 'string') return fail('malformed-output', 'The approval companion returned an invalid detail — failed closed.');
  return { ok: true, value };
}

/** Combine exit status and stdout into a verdict. Only approve + exit 0 + matching id is consent. */
export function interpretCompanionResult({ code, signal, stdout, requestId }) {
  const verdict = (decision, reason, detail, decidedAt = null) => ({ decision, reason, detail, decidedAt });
  if (signal) return verdict('error', 'crashed', `The approval companion stopped unexpectedly (${signal}) — failed closed.`);
  if (!Object.values(DECISION_EXIT_CODES).includes(code)) return verdict('error', 'unexpected-exit', `The approval companion exited with code ${code} — failed closed.`);
  const parsed = parseDecisionLine(stdout);
  if (!parsed.ok) return verdict('error', parsed.reason, parsed.detail);
  const line = parsed.value;
  const detail = cleanText(line.detail, 200);
  if (line.requestId !== requestId) {
    if (line.decision === 'error' && line.requestId === null) return verdict('error', 'companion-error', detail ?? 'The approval companion could not read the request — failed closed.', line.decidedAt);
    return verdict('error', 'request-mismatch', 'The approval companion answered a different request — failed closed.');
  }
  if (DECISION_EXIT_CODES[line.decision] !== code) return verdict('error', 'exit-mismatch', `Decision "${line.decision}" did not match exit code ${code} — failed closed.`);
  switch (line.decision) {
    case 'approve': return verdict('approve', 'approved', detail ?? 'Owner authorized the shutdown.', line.decidedAt);
    case 'reject': return verdict('reject', 'rejected', detail ?? 'Owner rejected the request.', line.decidedAt);
    case 'timeout': return verdict('timeout', 'timeout', detail ?? 'No owner decision in time — failed closed.', line.decidedAt);
    default: return verdict('error', 'companion-error', detail ?? 'The approval companion reported an error — failed closed.', line.decidedAt);
  }
}

function defaultApprovalSpawn(command, args, options) {
  if (underTestRunner()) throw new Error('Refusing to open the real approval window inside the Node test runner.');
  return spawn(command, args, options);
}

/**
 * Show the SwiftUI approval window and wait for the owner's answer.
 * Resolves (never rejects) with { decision, reason, detail, decidedAt, requestId, request }.
 * decision is 'approve' ONLY if the companion printed one valid approve line for this request id
 * AND exited 0. Spawn errors, crashes, signals, unexpected exit codes, malformed or extra output,
 * a mismatched request id, output after the hard timeout, or an abort all resolve to non-approve.
 */
export function requestOwnerApproval(meta = {}, {
  binaryPath = DEFAULT_APPROVER_PATH,
  signal,
  spawnImpl = defaultApprovalSpawn,
  graceMs = 5000,
  killGraceMs = 2000,
} = {}) {
  const request = buildApprovalRequest(meta);
  const payload = `${JSON.stringify(request)}\n`;
  const grace = Number.isFinite(graceMs) && graceMs >= 0 ? graceMs : 5000;
  const limitMs = request.timeoutSeconds * 1000 + grace;

  return new Promise(resolvePromise => {
    let settled = false;
    let child = null;
    let watchdog = null;
    const chunks = [];
    let outputBytes = 0;

    const running = () => child && child.exitCode === null && child.signalCode === null;
    const stopChild = () => {
      if (!running() || typeof child.kill !== 'function') return;
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
      const escalate = setTimeout(() => {
        if (running()) { try { child.kill('SIGKILL'); } catch { /* already gone */ } }
      }, killGraceMs);
      escalate.unref?.();
    };
    const onAbort = () => settle('error', 'aborted', 'The request was withdrawn (remote access revoked) before it could take effect — no shutdown.');
    function settle(decision, reason, detail, decidedAt = null) {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      signal?.removeEventListener?.('abort', onAbort);
      stopChild();
      resolvePromise({ decision, reason, detail, decidedAt, requestId: request.requestId, request });
    }

    if (signal?.aborted) {
      settle('error', 'aborted', 'The request was withdrawn before the approval window opened — no shutdown.');
      return;
    }
    try {
      child = spawnImpl(binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) {
      settle('error', 'spawn-failed', `Could not start the approval companion: ${errorText(error)}`);
      return;
    }
    if (!child || typeof child.on !== 'function' || !child.stdin || !child.stdout) {
      child = null;
      settle('error', 'spawn-failed', 'The approval companion did not start correctly.');
      return;
    }

    signal?.addEventListener?.('abort', onAbort, { once: true });
    watchdog = setTimeout(() => settle('timeout', 'watchdog-timeout', `No answer from the approval companion within ${limitMs / 1000} s — failed closed.`), limitMs);

    child.on('error', error => settle('error', 'spawn-failed', `Approval companion error: ${errorText(error)}`));
    child.stdin.on?.('error', error => settle('error', 'stdin-failed', `Could not hand the request to the approval companion: ${errorText(error)}`));
    child.stdout.on('data', chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      outputBytes += buffer.length;
      if (outputBytes > APPROVAL_LIMITS.maxOutputBytes) {
        settle('error', 'output-too-large', 'The approval companion printed unexpected output — failed closed.');
        return;
      }
      chunks.push(buffer);
    });
    child.stdout.on?.('error', error => settle('error', 'output-failed', `Could not read the approval companion's answer: ${errorText(error)}`));
    child.stderr?.on?.('data', () => { /* diagnostics only; never part of the decision */ });
    child.stderr?.on?.('error', () => { /* diagnostics only */ });
    child.on('close', (code, signalName) => {
      if (settled) return;
      const verdict = interpretCompanionResult({ code, signal: signalName, stdout: Buffer.concat(chunks).toString('utf8'), requestId: request.requestId });
      settle(verdict.decision, verdict.reason, verdict.detail, verdict.decidedAt);
    });

    try {
      child.stdin.end(payload);
    } catch (error) {
      settle('error', 'stdin-failed', `Could not hand the request to the approval companion: ${errorText(error)}`);
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Shutdown executors

/** The same System Events request as the proven AppleScript path, without its dialog. */
export function requestMacShutdown({ spawnImpl = spawn, platform = process.platform } = {}) {
  if (spawnImpl === spawn && underTestRunner()) return Promise.reject(new Error('Refusing to run a real shutdown inside the Node test runner.'));
  if (platform !== 'darwin') return Promise.reject(new Error('Real shutdown is only supported on macOS.'));
  return new Promise((resolvePromise, reject) => {
    const child = spawnImpl('/usr/bin/osascript', ['-e', 'tell application "System Events" to shut down'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let errors = '';
    child.stdout.on('data', () => { /* drained; nothing is expected */ });
    child.stderr.on('data', chunk => { errors += chunk.toString('utf8').slice(0, 1024); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolvePromise({ status: 'requested' });
      else reject(new Error(errors.trim() || 'macOS denied the command.'));
    });
  });
}

function defaultAppleScript(options) {
  if (underTestRunner()) return Promise.reject(new Error('Refusing to open the real macOS shutdown dialog inside the Node test runner.'));
  return requestNativeShutdown(options);
}

/**
 * V2.4 live shutdown executor.
 *  - approver 'applescript' (default, or anything unrecognised): delegates to the existing,
 *    proven requestNativeShutdown({ signal }) and returns its result unchanged.
 *  - approver 'swiftui': shows the SwiftUI window (always in LIVE wording); only an approval that
 *    passes every check, with the signal not aborted and the session not expired, calls
 *    shutdownImpl() → { status: 'requested' }. Otherwise { status: 'cancelled', reason }.
 *    Errors from shutdownImpl reject, like the existing executor.
 */
export async function requestNativeShutdownV24(meta = {}, {
  approver = APPROVER_APPLESCRIPT,
  signal,
  binaryPath,
  spawnImpl,
  shutdownImpl = requestMacShutdown,
  appleScriptImpl = defaultAppleScript,
  graceMs,
  now = Date.now,
} = {}) {
  if (approver !== APPROVER_SWIFTUI) return appleScriptImpl({ signal });
  if (signal?.aborted) return { status: 'cancelled', reason: 'aborted' };

  // A live executor must never show PREVIEW wording: the window has to say this Mac shuts down.
  const approval = await requestOwnerApproval({ ...(meta && typeof meta === 'object' ? meta : {}), mode: 'LIVE' }, { binaryPath, signal, spawnImpl, graceMs });
  if (approval.decision !== 'approve' || approval.reason !== 'approved' || approval.request.mode !== 'LIVE') {
    return { status: 'cancelled', reason: approval.reason };
  }
  if (signal?.aborted) return { status: 'cancelled', reason: 'aborted' };
  const expiresAt = validEpochMs(meta?.sessionExpiresAt);
  if (expiresAt !== null && now() >= expiresAt) return { status: 'cancelled', reason: 'session-expired' };

  await shutdownImpl();
  return { status: 'requested' };
}

/** Executor for RemotePairing.request(): metadata comes from the active paired session. */
export function createRemoteShutdownExecutor({ pairing, approver = APPROVER_APPLESCRIPT, binaryPath, deviceName, ...deps } = {}) {
  return (presenterName, signal) => requestNativeShutdownV24(
    remoteSessionApprovalMeta({
      requesterName: presenterName,
      governance: pairing?.activeGovernance?.() ?? null,
      sessionExpiresAt: pairing?.localStatus?.().pairedUntil ?? undefined,
      deviceName,
    }),
    { ...deps, approver, binaryPath, signal },
  );
}

/** Executor for createMacHelperServer({ executeShutdown }) on the same Mac. */
export function createLocalHelperShutdownExecutor({ approver = APPROVER_APPLESCRIPT, binaryPath, deviceName, ...deps } = {}) {
  return () => requestNativeShutdownV24(localHelperApprovalMeta({ deviceName }), { ...deps, approver, binaryPath });
}

export function describeApprover(resolution) {
  return resolution?.approver === APPROVER_SWIFTUI ? 'Owner approval: SwiftUI companion' : 'Owner approval: macOS dialog (default)';
}
