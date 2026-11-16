// V2.4 owner-approval companion tests. Every native boundary is mocked: no real approval window,
// no osascript and no shutdown can run here (mac-approval.mjs also refuses its real defaults
// whenever NODE_TEST_CONTEXT is set by the Node test runner).
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  APPROVAL_LIMITS,
  DEFAULT_APPROVER_PATH,
  DEFAULT_REQUESTER_CONTEXT,
  SHUTDOWN_CONSEQUENCE,
  buildApprovalRequest,
  cleanText,
  createLocalHelperShutdownExecutor,
  createRemoteShutdownExecutor,
  parseDecisionLine,
  requestMacShutdown,
  requestNativeShutdownV24,
  requestOwnerApproval,
  resolveApprover,
} from '../scripts/mac-approval.mjs';
import { requestNativeShutdown } from '../scripts/mac-helper-core.mjs';
import { GOVERNANCE_MAX_APPROVALS, REMOTE_CONFIRMATION, RemotePairing, SESSION_DURATION_MS, validateGovernance } from '../scripts/remote-pairing.mjs';
import { createLocalPairingServer, LOCAL_ADMIN_BODY_LIMIT } from '../scripts/remote-helper-servers.mjs';

const ISO = '2026-10-28T09:00:00.000Z';
const approveLine = id => `${JSON.stringify({ decision: 'approve', requestId: id, decidedAt: ISO, detail: 'Owner authorized the shutdown.' })}\n`;
const decisionLine = (decision, id) => `${JSON.stringify({ decision, requestId: id, decidedAt: ISO })}\n`;

/**
 * A fake child process standing in for the SwiftUI companion. `behaviour` receives the parsed
 * request from stdin and controls stdout and the exit status.
 */
function fakeCompanion(behaviour) {
  const calls = { spawns: [], requests: [], kills: [] };
  const spawnImpl = (command, args, options) => {
    calls.spawns.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    const exit = (code, signal = null) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.exitCode = code;
      child.signalCode = signal;
      child.emit('exit', code, signal);
      child.emit('close', code, signal);
    };
    child.kill = (signal = 'SIGTERM') => {
      calls.kills.push(signal);
      if (child.exitCode !== null || child.signalCode !== null) return false;
      setImmediate(() => exit(null, signal));
      return true;
    };
    let input = '';
    child.stdin = new EventEmitter();
    child.stdin.end = chunk => {
      input += chunk ?? '';
      const request = JSON.parse(input);
      calls.requests.push(request);
      setImmediate(() => behaviour({ request, child, exit, print: text => child.stdout.emit('data', Buffer.from(text)) }));
    };
    return child;
  };
  return { spawnImpl, calls };
}

function shutdownSpy() {
  const spy = async () => { spy.calls++; return { status: 'requested' }; };
  spy.calls = 0;
  return spy;
}

const neverCalled = name => () => { throw new Error(`${name} must not be called in this test`); };

const meta = {
  requesterName: 'Pierre Sauvage',
  incidentId: 'NT-SEC-041',
  scenario: 'Ransomware on a finance workstation',
  reason: 'Final classroom step',
  governance: [{ gate: 'Detect', person: 'Karan Deshmukh', role: 'Risk Coordinator', decision: 'Acknowledged' }],
};

async function runV24(behaviour, options = {}) {
  const companion = fakeCompanion(behaviour);
  const shutdownImpl = shutdownSpy();
  const result = await requestNativeShutdownV24(options.meta ?? meta, {
    approver: 'swiftui',
    binaryPath: '/fake/NovatechApprover',
    spawnImpl: companion.spawnImpl,
    shutdownImpl,
    appleScriptImpl: neverCalled('appleScriptImpl'),
    ...options.extra,
  });
  return { result, shutdownImpl, companion };
}

// ---------------------------------------------------------------------------------------------
// requestNativeShutdownV24 — the only path to shutdown is a clean approval

test('approve → shutdown is requested exactly once, and the window always gets LIVE wording', async () => {
  const { result, shutdownImpl, companion } = await runV24(({ request, print, exit }) => { print(approveLine(request.requestId)); exit(0); }, { meta: { ...meta, mode: 'PREVIEW' } });
  assert.deepEqual(result, { status: 'requested' });
  assert.equal(shutdownImpl.calls, 1);
  assert.equal(companion.calls.spawns.length, 1);
  assert.equal(companion.calls.spawns[0].command, '/fake/NovatechApprover');
  assert.deepEqual(companion.calls.spawns[0].args, []);
  const sent = companion.calls.requests[0];
  assert.equal(sent.mode, 'LIVE', 'a live executor can never show the "nothing will shut down" preview wording');
  assert.equal(sent.requesterName, 'Pierre Sauvage');
  assert.equal(sent.incidentId, 'NT-SEC-041');
  assert.deepEqual(sent.governance, meta.governance);
});

const refusals = [
  ['owner rejects', ({ request, print, exit }) => { print(decisionLine('reject', request.requestId)); exit(10); }, 'rejected'],
  ['window times out', ({ request, print, exit }) => { print(decisionLine('timeout', request.requestId)); exit(11); }, 'timeout'],
  ['companion reports an error', ({ request, print, exit }) => { print(decisionLine('error', request.requestId)); exit(12); }, 'companion-error'],
  ['companion crashes', ({ exit }) => { exit(null, 'SIGSEGV'); }, 'crashed'],
  ['approve line but non-zero exit', ({ request, print, exit }) => { print(approveLine(request.requestId)); exit(1); }, 'unexpected-exit'],
  ['approve line but reject exit code', ({ request, print, exit }) => { print(approveLine(request.requestId)); exit(10); }, 'exit-mismatch'],
  ['reject line but exit 0', ({ request, print, exit }) => { print(decisionLine('reject', request.requestId)); exit(0); }, 'exit-mismatch'],
  ['malformed output', ({ print, exit }) => { print('Authorized!\n'); exit(0); }, 'malformed-output'],
  ['two JSON lines', ({ request, print, exit }) => { print(approveLine(request.requestId) + approveLine(request.requestId)); exit(0); }, 'extra-output'],
  ['approve split over two writes plus a stray line', ({ request, print, exit }) => { const line = approveLine(request.requestId); print(line.slice(0, 10)); print(line.slice(10)); print('debug\n'); exit(0); }, 'extra-output'],
  ['mismatched requestId', ({ print, exit }) => { print(approveLine('00000000-0000-4000-8000-000000000000')); exit(0); }, 'request-mismatch'],
  ['no output at all', ({ exit }) => { exit(0); }, 'no-output'],
  ['unknown decision', ({ request, print, exit }) => { print(decisionLine('APPROVE', request.requestId)); exit(0); }, 'malformed-output'],
  ['approve without decidedAt', ({ request, print, exit }) => { print(`${JSON.stringify({ decision: 'approve', requestId: request.requestId })}\n`); exit(0); }, 'malformed-output'],
  ['oversized output', ({ print }) => { print('x'.repeat(APPROVAL_LIMITS.maxOutputBytes + 1)); }, 'output-too-large'],
  ['stdin pipe breaks', ({ child, exit }) => { child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })); exit(null, 'SIGPIPE'); }, 'stdin-failed'],
  ['stdout pipe fails', ({ request, child, print, exit }) => { child.stdout.emit('error', new Error('read EIO')); print(approveLine(request.requestId)); exit(0); }, 'output-failed'],
  ['spawn error event', ({ child }) => { child.emit('error', Object.assign(new Error('spawn EACCES'), { code: 'EACCES' })); }, 'spawn-failed'],
];

for (const [name, behaviour, reason] of refusals) {
  test(`${name} → cancelled (${reason}); shutdown is NOT called`, async () => {
    const { result, shutdownImpl } = await runV24(behaviour);
    assert.deepEqual(result, { status: 'cancelled', reason });
    assert.equal(shutdownImpl.calls, 0);
  });
}

test('spawn throwing synchronously (binary missing) → cancelled, shutdown NOT called', async () => {
  const shutdownImpl = shutdownSpy();
  const result = await requestNativeShutdownV24(meta, {
    approver: 'swiftui',
    spawnImpl: () => { throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }); },
    shutdownImpl,
    appleScriptImpl: neverCalled('appleScriptImpl'),
  });
  assert.deepEqual(result, { status: 'cancelled', reason: 'spawn-failed' });
  assert.equal(shutdownImpl.calls, 0);
});

test('abort before the owner decides → window is closed, cancelled, shutdown NOT called', async () => {
  const controller = new AbortController();
  const { result, shutdownImpl, companion } = await runV24(() => { setImmediate(() => controller.abort()); }, { extra: { signal: controller.signal } });
  assert.deepEqual(result, { status: 'cancelled', reason: 'aborted' });
  assert.equal(shutdownImpl.calls, 0);
  assert.deepEqual(companion.calls.kills, ['SIGTERM'], 'the pending approval window is terminated');
});

test('abort after approve but before shutdown → cancelled, shutdown NOT called', async () => {
  const controller = new AbortController();
  const { result, shutdownImpl } = await runV24(({ request, print, exit }) => {
    print(approveLine(request.requestId));
    exit(0);
    controller.abort(); // revoked in the gap between the approval and the shutdown request
  }, { extra: { signal: controller.signal } });
  assert.deepEqual(result, { status: 'cancelled', reason: 'aborted' });
  assert.equal(shutdownImpl.calls, 0);
});

test('already-aborted signal → no window is opened at all', async () => {
  const controller = new AbortController();
  controller.abort();
  const { result, shutdownImpl, companion } = await runV24(neverCalled('companion'), { extra: { signal: controller.signal } });
  assert.deepEqual(result, { status: 'cancelled', reason: 'aborted' });
  assert.equal(companion.calls.spawns.length, 0);
  assert.equal(shutdownImpl.calls, 0);
});

test('approval that arrives after the paired session expired → cancelled, shutdown NOT called', async () => {
  const expiresAt = Date.parse('2026-10-28T12:30:00Z');
  const { result, shutdownImpl } = await runV24(({ request, print, exit }) => { print(approveLine(request.requestId)); exit(0); }, {
    meta: { ...meta, sessionExpiresAt: expiresAt },
    extra: { now: () => expiresAt + 1 },
  });
  assert.deepEqual(result, { status: 'cancelled', reason: 'session-expired' });
  assert.equal(shutdownImpl.calls, 0);
});

test('hard watchdog: a silent companion is killed and treated as timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const companion = fakeCompanion(() => { /* never answers */ });
  const shutdownImpl = shutdownSpy();
  const pending = requestNativeShutdownV24({ ...meta, timeoutSeconds: 10 }, {
    approver: 'swiftui', spawnImpl: companion.spawnImpl, shutdownImpl, appleScriptImpl: neverCalled('appleScriptImpl'), graceMs: 5000,
  });
  await new Promise(resolve => setImmediate(resolve)); // let the request reach the companion
  t.mock.timers.tick(14_999);
  assert.equal(companion.calls.kills.length, 0, 'not before timeoutSeconds + grace');
  t.mock.timers.tick(1);
  assert.deepEqual(await pending, { status: 'cancelled', reason: 'watchdog-timeout' });
  assert.deepEqual(companion.calls.kills, ['SIGTERM']);
  assert.equal(shutdownImpl.calls, 0);
});

test('approve printed after the watchdog fired is ignored', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let late;
  const companion = fakeCompanion(({ request, print, exit }) => { late = () => { print(approveLine(request.requestId)); exit(0); }; });
  const pending = requestOwnerApproval({ ...meta, timeoutSeconds: 10 }, { spawnImpl: companion.spawnImpl, graceMs: 0 });
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(10_000);
  late();
  const result = await pending;
  assert.equal(result.decision, 'timeout');
  assert.equal(result.reason, 'watchdog-timeout');
});

test('errors from the shutdown request reject like the existing executor', async () => {
  const companion = fakeCompanion(({ request, print, exit }) => { print(approveLine(request.requestId)); exit(0); });
  await assert.rejects(requestNativeShutdownV24(meta, {
    approver: 'swiftui',
    spawnImpl: companion.spawnImpl,
    shutdownImpl: async () => { throw new Error('Not authorized to send Apple events to System Events.'); },
    appleScriptImpl: neverCalled('appleScriptImpl'),
  }), /Not authorized/);
});

test('applescript approver delegates to the existing requestNativeShutdown function unchanged', async () => {
  const controller = new AbortController();
  const received = [];
  for (const approver of ['applescript', undefined, 'SwiftUI-typo']) {
    const result = await requestNativeShutdownV24(meta, {
      approver,
      signal: controller.signal,
      spawnImpl: neverCalled('spawnImpl'),
      shutdownImpl: neverCalled('shutdownImpl'),
      appleScriptImpl: async options => { received.push(options); return { status: 'cancelled' }; },
    });
    assert.deepEqual(result, { status: 'cancelled' });
  }
  assert.equal(received.length, 3);
  for (const options of received) assert.deepEqual(options, { signal: controller.signal });
});

test('applescript path propagates the existing executor\'s rejection', async () => {
  await assert.rejects(requestNativeShutdownV24(meta, { appleScriptImpl: async () => { throw new Error('macOS denied the command.'); } }), /denied/);
});

test('the shutdown request is the same System Events command as the proven AppleScript path', async () => {
  const calls = [];
  const fakeOsascript = (code, stderr = '') => (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => { if (stderr) child.stderr.emit('data', Buffer.from(stderr)); child.emit('close', code); });
    return child;
  };
  assert.deepEqual(await requestMacShutdown({ spawnImpl: fakeOsascript(0), platform: 'darwin' }), { status: 'requested' });
  assert.equal(calls[0].command, '/usr/bin/osascript');
  assert.deepEqual(calls[0].args, ['-e', 'tell application "System Events" to shut down']);
  assert.ok(requestNativeShutdown.toString().includes(`'${calls[0].args[1]}'`), 'identical to the final line of the proven script');
  await assert.rejects(requestMacShutdown({ spawnImpl: fakeOsascript(1, 'Not authorized to send Apple events to System Events. (-1743)'), platform: 'darwin' }), /Not authorized/);
  await assert.rejects(requestMacShutdown({ spawnImpl: neverCalled('spawnImpl'), platform: 'linux' }), /only supported on macOS/);
});

test('real native defaults refuse to run inside the test runner', async () => {
  assert.ok(process.env.NODE_TEST_CONTEXT, 'node --test sets NODE_TEST_CONTEXT');
  await assert.rejects(requestMacShutdown(), /test runner/);
  await assert.rejects(requestNativeShutdownV24(meta, { approver: 'applescript' }), /test runner/);
  const result = await requestOwnerApproval(meta, { binaryPath: DEFAULT_APPROVER_PATH });
  assert.equal(result.decision, 'error');
  assert.equal(result.reason, 'spawn-failed');
  assert.match(result.detail, /test runner/);
});

// ---------------------------------------------------------------------------------------------
// requestOwnerApproval result shape

test('requestOwnerApproval reports the decision, reason and timestamps of a clean answer', async () => {
  const companion = fakeCompanion(({ request, print, exit }) => { print(decisionLine('reject', request.requestId)); exit(10); });
  const result = await requestOwnerApproval({ ...meta, requestId: 'abcdef12-3456-4789-abcd-ef0123456789' }, { spawnImpl: companion.spawnImpl });
  assert.equal(result.decision, 'reject');
  assert.equal(result.reason, 'rejected');
  assert.equal(result.requestId, 'abcdef12-3456-4789-abcd-ef0123456789');
  assert.equal(result.decidedAt, ISO);
  assert.equal(result.request.requestId, result.requestId);
});

test('a companion that could not read its request is reported as a companion error', async () => {
  const companion = fakeCompanion(({ print, exit }) => { print(decisionLine('error', null)); exit(12); });
  const result = await requestOwnerApproval(meta, { spawnImpl: companion.spawnImpl });
  assert.equal(result.decision, 'error');
  assert.equal(result.reason, 'companion-error');
});

test('parseDecisionLine accepts exactly one JSON object line', () => {
  assert.equal(parseDecisionLine(approveLine('abcdefgh')).ok, true);
  assert.equal(parseDecisionLine(approveLine('abcdefgh').trimEnd()).ok, true);
  assert.equal(parseDecisionLine(`${approveLine('abcdefgh')}\n`).reason, 'extra-output');
  assert.equal(parseDecisionLine(approveLine('abcdefgh').replace('\n', '\r\n')).reason, 'extra-output');
  assert.equal(parseDecisionLine('[]').reason, 'malformed-output');
  assert.equal(parseDecisionLine('').reason, 'no-output');
});

// ---------------------------------------------------------------------------------------------
// Approver resolution

const exists = () => true;
const executable = () => {};
const darwin = { platform: 'darwin', existsSync: exists, accessSync: executable };

test('resolver defaults to the macOS dialog when the companion is not enabled', () => {
  const result = resolveApprover({ env: {}, argv: ['node', 'remote-agent.mjs', '--live'], ...darwin });
  assert.equal(result.approver, 'applescript');
  assert.equal(result.requested, false);
  assert.match(result.reason, /not enabled/);
});

test('resolver selects SwiftUI only when enabled AND the binary exists and is executable', () => {
  const viaEnv = resolveApprover({ env: { NOVATECH_APPROVER: 'swiftui' }, argv: [], ...darwin });
  assert.equal(viaEnv.approver, 'swiftui');
  assert.equal(viaEnv.binaryPath, DEFAULT_APPROVER_PATH);
  const viaFlag = resolveApprover({ env: {}, argv: ['node', 'remote-agent.mjs', '--live', '--approver=swiftui'], ...darwin });
  assert.equal(viaFlag.approver, 'swiftui');
});

test('resolver falls back when the binary is missing or not executable, or not on macOS', () => {
  const missing = resolveApprover({ env: { NOVATECH_APPROVER: 'swiftui' }, argv: [], platform: 'darwin', existsSync: () => false, accessSync: executable });
  assert.equal(missing.approver, 'applescript');
  assert.equal(missing.requested, true);
  assert.match(missing.reason, /companion:build/);
  const notExecutable = resolveApprover({ env: { NOVATECH_APPROVER: 'swiftui' }, argv: [], platform: 'darwin', existsSync: exists, accessSync: () => { throw new Error('EACCES'); } });
  assert.equal(notExecutable.approver, 'applescript');
  assert.match(notExecutable.reason, /not an executable/);
  const linux = resolveApprover({ env: { NOVATECH_APPROVER: 'swiftui' }, argv: [], platform: 'linux', existsSync: exists, accessSync: executable });
  assert.equal(linux.approver, 'applescript');
});

test('an explicit --approver=applescript flag rolls back even when the environment enables SwiftUI', () => {
  const result = resolveApprover({ env: { NOVATECH_APPROVER: 'swiftui' }, argv: ['--approver=applescript'], ...darwin });
  assert.equal(result.approver, 'applescript');
  assert.equal(result.requested, false);
  const unknown = resolveApprover({ env: { NOVATECH_APPROVER: 'swift' }, argv: [], ...darwin });
  assert.equal(unknown.approver, 'applescript');
  assert.match(unknown.reason, /Unknown approver/);
});

test('NOVATECH_APPROVER_PATH and binaryPath override the default location', () => {
  const checked = [];
  const result = resolveApprover({ env: { NOVATECH_APPROVER: 'swiftui', NOVATECH_APPROVER_PATH: '/Applications/NovatechApprover' }, argv: [], platform: 'darwin', existsSync: path => { checked.push(path); return true; }, accessSync: executable });
  assert.equal(result.binaryPath, '/Applications/NovatechApprover');
  assert.deepEqual(checked, ['/Applications/NovatechApprover']);
  assert.equal(resolveApprover({ env: { NOVATECH_APPROVER: 'swiftui' }, argv: [], binaryPath: '/opt/approver', ...darwin }).binaryPath, '/opt/approver');
});

test('default checks use the real filesystem: a plain file or a directory is not enough', () => {
  const folder = mkdtempSync(join(tmpdir(), 'novatech-approver-resolve-'));
  try {
    const binary = join(folder, 'NovatechApprover');
    writeFileSync(binary, '#!/bin/sh\nexit 12\n', { mode: 0o644 });
    const env = { NOVATECH_APPROVER: 'swiftui', NOVATECH_APPROVER_PATH: binary };
    assert.equal(resolveApprover({ env, argv: [], platform: 'darwin' }).approver, 'applescript');
    chmodSync(binary, 0o755);
    assert.equal(resolveApprover({ env, argv: [], platform: 'darwin' }).approver, 'swiftui');
    const directory = join(folder, 'dir');
    mkdirSync(directory);
    assert.equal(resolveApprover({ env: { ...env, NOVATECH_APPROVER_PATH: directory }, argv: [], platform: 'darwin' }).approver, 'applescript');
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------------
// Request sanitisation (same limits as the Swift side)

test('buildApprovalRequest keeps only known fields with safe defaults', () => {
  const request = buildApprovalRequest({ requesterName: 'Pierre Sauvage', command: 'rm -rf /', shell: true });
  assert.deepEqual(Object.keys(request).sort(), ['channel', 'consequence', 'governance', 'incidentId', 'mode', 'ownerName', 'reason', 'requestId', 'requesterContext', 'requesterName', 'scenario', 'timeoutSeconds']);
  assert.match(request.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(request.ownerName, 'Karan Deshmukh');
  assert.equal(request.requesterContext, DEFAULT_REQUESTER_CONTEXT);
  assert.equal(request.consequence, SHUTDOWN_CONSEQUENCE);
  assert.equal(request.mode, 'LIVE');
  assert.equal(request.channel, 'LAN_TLS');
  assert.equal(request.timeoutSeconds, 30);
});

test('strings are single-line, stripped of control/bidi characters and clamped to 160', () => {
  const request = buildApprovalRequest({
    requesterName: '  Pierre\n\tSauvage‮evil​  ',
    reason: 'x'.repeat(500),
    scenario: '\u0007 ',
    deviceName: 'Karans-MacBook-Air.local',
  });
  assert.equal(request.requesterName, 'Pierre Sauvageevil');
  assert.equal(Array.from(request.reason).length, APPROVAL_LIMITS.maxText);
  assert.equal(request.scenario, 'Not provided');
  assert.equal(request.deviceName, 'Karans-MacBook-Air.local');
  assert.equal(cleanText('😀'.repeat(200)).length, 320, 'clamping counts code points, never splitting an emoji');
  assert.equal(cleanText(42), null);
});

test('timeoutSeconds defaults to 30 and is clamped to 10…60', () => {
  for (const [input, expected] of [[undefined, 30], [5, 10], [10, 10], [45.9, 45], [60, 60], [120, 60], [-3, 10], ['45', 30], [Number.NaN, 30], [Infinity, 30], [true, 30]]) {
    assert.equal(buildApprovalRequest({ timeoutSeconds: input }).timeoutSeconds, expected, `timeoutSeconds ${String(input)}`);
  }
});

test('governance is limited to 10 clean rows; invalid rows are dropped', () => {
  const rows = ['bad', null, { gate: 'No person' }, { person: 'No gate' }, ...Array.from({ length: 14 }, (_, i) => ({ gate: `Gate ${i + 1}`, person: `Person ${i + 1}`, role: i === 0 ? 7 : 'Role', decision: 'Approved', extra: 'dropped' }))];
  const { governance } = buildApprovalRequest({ governance: rows });
  assert.equal(governance.length, APPROVAL_LIMITS.maxGovernance);
  assert.deepEqual(governance[0], { gate: 'Gate 1', person: 'Person 1', role: '', decision: 'Approved' });
  assert.equal(governance.at(-1).gate, 'Gate 10');
});

test('mode, channel, requestId and sessionExpiresAt accept only exact, valid values', () => {
  assert.equal(buildApprovalRequest({ mode: 'PREVIEW' }).mode, 'PREVIEW');
  assert.equal(buildApprovalRequest({ mode: 'preview' }).mode, 'LIVE');
  assert.equal(buildApprovalRequest({ channel: 'LOCAL_HELPER' }).channel, 'LOCAL_HELPER');
  assert.equal(buildApprovalRequest({ requestId: 'abcdef12-3456' }).requestId, 'abcdef12-3456');
  assert.notEqual(buildApprovalRequest({ requestId: '../../etc/passwd' }).requestId, '../../etc/passwd');
  assert.equal(buildApprovalRequest({ sessionExpiresAt: 1_793_000_000_123 }).sessionExpiresAt, 1_793_000_000_123);
  assert.equal('sessionExpiresAt' in buildApprovalRequest({ sessionExpiresAt: 1_793_000_000 }), false, 'seconds are rejected');
  assert.equal('sessionExpiresAt' in buildApprovalRequest({ sessionExpiresAt: '1793000000000' }), false);
});

// ---------------------------------------------------------------------------------------------
// Governance on RemotePairing (optional; legacy behaviour unchanged when absent)

function manager() {
  let now = Date.parse('2026-10-28T12:00:00Z');
  const pairing = new RemotePairing({ clock: () => now, getCode: () => '439281', getToken: () => 'a'.repeat(64) });
  return { pairing, tick: ms => { now += ms; } };
}
const approve = { workflowClosed: true, approved: true, scenarioId: 'ransomware', controllerName: 'Pierre Sauvage' };
const governance = {
  incidentId: 'NT-SEC-041',
  scenario: 'Ransomware on a finance workstation',
  reason: 'Final classroom step',
  approvals: [
    { gate: 'Detect', person: 'Karan Deshmukh', role: 'Risk Coordinator', decision: 'Acknowledged' },
    { gate: 'Security authorization', person: 'Victor Bonnet', role: 'RSSI / CISO', decision: 'Authorized' },
  ],
};

test('governance attached at activation follows the pairing into the session', () => {
  const { pairing } = manager();
  const status = pairing.activate({ ...approve, governance });
  assert.deepEqual(status.governance, governance);
  assert.equal(pairing.activeGovernance(), null, 'nothing is active until the presenter pairs');
  const { token } = pairing.redeem('439281');
  assert.deepEqual(pairing.activeGovernance(), governance);
  assert.ok(Object.isFrozen(pairing.activeGovernance()));
  assert.ok(Object.isFrozen(pairing.activeGovernance().approvals[0]));
  assert.equal(pairing.authorize(token).name, 'Pierre Sauvage');
});

test('without governance the pairing behaves exactly as before', () => {
  const { pairing } = manager();
  const status = pairing.activate(approve);
  assert.deepEqual(Object.keys(status), ['pairingCode', 'pairingExpiresAt', 'controllerName', 'pairedUntil', 'connected', 'busy', 'recentActions']);
  pairing.redeem('439281');
  assert.equal(pairing.activeGovernance(), null);
  assert.equal('governance' in pairing.localStatus(), false);
  assert.equal('governance' in pairing.session, false);
  assert.throws(() => pairing.activate({ ...approve, approved: false, governance }), /Finish the director-approved/);
  assert.throws(() => pairing.activate({ ...approve, controllerName: '<script>', governance }), /valid presenter name/);
});

test('invalid governance is dropped item by item and never blocks pairing', () => {
  assert.equal(validateGovernance('NT-SEC-041'), null);
  assert.equal(validateGovernance([governance]), null);
  assert.equal(validateGovernance({}), null);
  const record = validateGovernance({
    incidentId: 'X'.repeat(121),
    scenario: 42,
    reason: '  Final\nstep  ',
    approvals: [
      'bad',
      { gate: 'No person' },
      { gate: 'Too long', person: 'P', role: 'r'.repeat(121) },
      { gate: 'Bad role', person: 'P', role: 7 },
      ...Array.from({ length: 12 }, (_, i) => ({ gate: `Gate ${i + 1}`, person: `Person ${i + 1}` })),
    ],
  });
  assert.equal(record.incidentId, null);
  assert.equal(record.scenario, null);
  assert.equal(record.reason, 'Final step');
  assert.equal(record.approvals.length, GOVERNANCE_MAX_APPROVALS);
  assert.deepEqual(record.approvals[0], { gate: 'Gate 1', person: 'Person 1', role: '', decision: '' });
  const { pairing } = manager();
  assert.doesNotThrow(() => pairing.activate({ ...approve, governance: 'not an object' }));
  assert.equal('governance' in pairing.localStatus(), false);
});

test('governance ends with the session: expiry, revocation and re-activation clear it', () => {
  const { pairing, tick } = manager();
  pairing.activate({ ...approve, governance });
  pairing.redeem('439281');
  tick(SESSION_DURATION_MS);
  assert.equal(pairing.activeGovernance(), null);
  pairing.activate({ ...approve, governance });
  pairing.redeem('439281');
  pairing.revoke();
  assert.equal(pairing.activeGovernance(), null);
  pairing.activate({ ...approve, governance });
  pairing.activate(approve);
  pairing.redeem('439281');
  assert.equal(pairing.activeGovernance(), null, 'a new pairing without governance does not inherit the old record');
});

async function withServer(server, run) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('the local admin /pair route forwards a full governance record to activate()', async () => {
  const { pairing } = manager();
  const server = createLocalPairingServer({ pairing, address: '127.0.0.1', fingerprint: 'TEST', live: false });
  const full = {
    incidentId: 'NT-SEC-041',
    scenario: 's'.repeat(120),
    reason: 'r'.repeat(120),
    approvals: Array.from({ length: 10 }, (_, i) => ({ gate: `G${i}`.padEnd(120, 'g'), person: 'P'.repeat(120), role: 'R'.repeat(120), decision: 'D'.repeat(120) })),
  };
  const body = JSON.stringify({ ...approve, governance: full });
  assert.ok(body.length > 2048 && body.length < LOCAL_ADMIN_BODY_LIMIT, 'a maximal record exceeds the old 2 KB cap');
  await withServer(server, async url => {
    const headers = { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' };
    const response = await fetch(`${url}/pair`, { method: 'POST', headers, body });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).governance.approvals.length, 10);
    pairing.redeem('439281');
    assert.deepEqual(pairing.activeGovernance(), full);
    // Over the limit the existing handler refuses the body (400, or the connection is closed).
    const tooLarge = await fetch(`${url}/pair`, { method: 'POST', headers, body: JSON.stringify({ ...approve, padding: 'x'.repeat(LOCAL_ADMIN_BODY_LIMIT) }) })
      .then(response => response.status, () => 'connection closed');
    assert.notEqual(tooLarge, 200);
    assert.equal(pairing.localStatus().pairingCode, null, 'the oversized request did not open a new pairing');
  });
});

// ---------------------------------------------------------------------------------------------
// Agent wiring (the same executor factories the agents use)

test('remote executor: request built from the paired session; approve → one shutdown', async () => {
  const { pairing } = manager();
  pairing.activate({ ...approve, governance });
  const { token, expiresAt } = pairing.redeem('439281');
  const companion = fakeCompanion(({ request, print, exit }) => { print(approveLine(request.requestId)); exit(0); });
  const shutdownImpl = shutdownSpy();
  const executor = createRemoteShutdownExecutor({ pairing, approver: 'swiftui', binaryPath: '/fake/NovatechApprover', deviceName: 'karan-mba', spawnImpl: companion.spawnImpl, shutdownImpl, appleScriptImpl: neverCalled('appleScriptImpl'), now: () => expiresAt - 60_000 });
  const result = await pairing.request(token, { confirmation: REMOTE_CONFIRMATION }, { live: true, executor, platform: 'darwin' });
  assert.deepEqual(result, { status: 'requested' });
  assert.equal(shutdownImpl.calls, 1);
  const sent = companion.calls.requests[0];
  assert.equal(sent.requesterName, 'Pierre Sauvage');
  assert.equal(sent.requesterContext, DEFAULT_REQUESTER_CONTEXT);
  assert.equal(sent.ownerName, 'Karan Deshmukh');
  assert.equal(sent.incidentId, 'NT-SEC-041');
  assert.equal(sent.reason, 'Final classroom step');
  assert.deepEqual(sent.governance, governance.approvals);
  assert.equal(sent.mode, 'LIVE');
  assert.equal(sent.channel, 'LAN_TLS');
  assert.equal(sent.sessionExpiresAt, expiresAt);
  assert.equal(sent.deviceName, 'karan-mba');
});

test('remote executor: owner revocation closes the pending window and nothing shuts down', async () => {
  const { pairing } = manager();
  pairing.activate(approve);
  const { token } = pairing.redeem('439281');
  const companion = fakeCompanion(() => { setImmediate(() => pairing.revoke()); });
  const shutdownImpl = shutdownSpy();
  const executor = createRemoteShutdownExecutor({ pairing, approver: 'swiftui', spawnImpl: companion.spawnImpl, shutdownImpl, appleScriptImpl: neverCalled('appleScriptImpl') });
  const result = await pairing.request(token, { confirmation: REMOTE_CONFIRMATION }, { live: true, executor, platform: 'darwin' });
  assert.deepEqual(result, { status: 'cancelled', reason: 'aborted' });
  assert.deepEqual(companion.calls.kills, ['SIGTERM']);
  assert.equal(shutdownImpl.calls, 0);
  assert.equal(pairing.busy, false);
  assert.match(companion.calls.requests[0].incidentId, /Not provided/, 'no invented incident id without governance');
});

test('remote executor with the default approver passes the abort signal to the existing dialog', async () => {
  const { pairing } = manager();
  pairing.activate(approve);
  const { token } = pairing.redeem('439281');
  let seen;
  const executor = createRemoteShutdownExecutor({ pairing, spawnImpl: neverCalled('spawnImpl'), shutdownImpl: neverCalled('shutdownImpl'), appleScriptImpl: async ({ signal }) => { seen = signal; return { status: 'cancelled' }; } });
  assert.deepEqual(await pairing.request(token, { confirmation: REMOTE_CONFIRMATION }, { live: true, executor, platform: 'darwin' }), { status: 'cancelled' });
  assert.ok(seen instanceof AbortSignal);
});

test('preview mode never reaches any executor', async () => {
  const { pairing } = manager();
  pairing.activate({ ...approve, governance });
  const { token } = pairing.redeem('439281');
  const executor = createRemoteShutdownExecutor({ pairing, approver: 'swiftui', spawnImpl: neverCalled('spawnImpl'), shutdownImpl: neverCalled('shutdownImpl'), appleScriptImpl: neverCalled('appleScriptImpl') });
  assert.deepEqual(await pairing.request(token, { confirmation: REMOTE_CONFIRMATION }, { live: false, executor }), { status: 'preview' });
});

test('same-Mac helper executor labels the request as local and fails closed', async () => {
  const companion = fakeCompanion(({ request, print, exit }) => { print(decisionLine('reject', request.requestId)); exit(10); });
  const shutdownImpl = shutdownSpy();
  const executeShutdown = createLocalHelperShutdownExecutor({ approver: 'swiftui', spawnImpl: companion.spawnImpl, shutdownImpl, appleScriptImpl: neverCalled('appleScriptImpl') });
  assert.deepEqual(await executeShutdown(), { status: 'cancelled', reason: 'rejected' });
  assert.equal(companion.calls.requests[0].channel, 'LOCAL_HELPER');
  assert.equal(shutdownImpl.calls, 0);
  let delegated = 0;
  const defaultHelper = createLocalHelperShutdownExecutor({ appleScriptImpl: async () => { delegated++; return { status: 'cancelled' }; } });
  assert.deepEqual(await defaultHelper(), { status: 'cancelled' });
  assert.equal(delegated, 1);
});
