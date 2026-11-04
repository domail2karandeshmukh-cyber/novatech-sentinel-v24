import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createMacHelperServer, isAllowedOrigin, SHUTDOWN_PHRASE } from '../scripts/mac-helper-core.mjs';
import { advanceRun, blankRun, startRun } from '../src/v2/demoEngine.ts';
import { canRequestMacShutdown } from '../src/v2/macPowerPolicy.ts';

const origin = 'http://localhost:5173';
const consent = { confirmation: SHUTDOWN_PHRASE, approvedWorkflow: true, scenario: 'ransomware' };

async function withHelper(options, run) {
  const token = randomBytes(24).toString('hex');
  const server = createMacHelperServer({ token, ...options });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (body = consent, headers = {}) => fetch(`${url}/shutdown`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Novatech-Token': token, ...headers },
    body: JSON.stringify(body),
  });
  try { await run({ url, post, token }); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('only exact local development origins can contact the helper', () => {
  assert.equal(isAllowedOrigin(origin), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:5179'), true);
  for (const invalid of ['https://novatech-grc.vercel.app', 'https://localhost:5173', 'http://evil.localhost:5173', 'http://localhost:3000', 'http://localhost:5173.evil.com', '', undefined]) {
    assert.equal(isAllowedOrigin(invalid), false);
  }
});

test('health reports preview by default and rejects requests from a public origin', async () => {
  await withHelper({}, async ({ url }) => {
    const status = await fetch(`${url}/health`, { headers: { Origin: origin } });
    assert.equal(status.status, 200);
    assert.equal((await status.json()).live, false);
    const blocked = await fetch(`${url}/health`, { headers: { Origin: 'https://malicious.example' } });
    assert.equal(blocked.status, 403);
  });
});

test('session code, exact consent phrase, and scenario are mandatory', async () => {
  await withHelper({}, async ({ post }) => {
    assert.equal((await post(consent, { 'X-Novatech-Token': 'wrong' })).status, 401);
    assert.equal((await post({ ...consent, confirmation: 'yes' })).status, 400);
    assert.equal((await post({ ...consent, scenario: 'payments' })).status, 400);
    assert.equal((await post({ ...consent, approvedWorkflow: false })).status, 400);
  });
});

test('preview mode never invokes a native shutdown function', async () => {
  let nativeCalls = 0;
  await withHelper({ executeShutdown: async () => { nativeCalls++; return { status: 'requested' }; } }, async ({ post }) => {
    const response = await post();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'preview' });
    assert.equal(nativeCalls, 0);
  });
});

test('explicit live macOS mode invokes only the injected test executor, and rate-limits repeats', async () => {
  let nativeCalls = 0;
  await withHelper({ live: true, platform: 'darwin', executeShutdown: async () => { nativeCalls++; return { status: 'cancelled' }; } }, async ({ post }) => {
    const response = await post();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'cancelled' });
    assert.equal((await post()).status, 429);
    assert.equal(nativeCalls, 1);
  });
});

test('client policy only unlocks a finished, director-approved ransomware rehearsal in IT role', () => {
  let run = startRun(blankRun());
  const roles = ['Risk Lead', 'Cybersecurity', 'Finance', 'Director', 'IT Operations', 'Independent Reviewer', 'Risk Lead'];
  for (const role of roles) {
    assert.equal(canRequestMacShutdown(run, 'IT Operations'), false);
    const result = advanceRun(run, role, 'Validated evidence and approved the training stage.');
    assert.equal(result.error, undefined);
    run = result.run;
  }
  assert.equal(canRequestMacShutdown(run, 'Risk Lead'), false);
  assert.equal(canRequestMacShutdown(run, 'IT Operations'), true);
  assert.equal(canRequestMacShutdown({ ...run, scenarioId: 'cloud' }, 'IT Operations'), false);
  assert.equal(canRequestMacShutdown({ ...run, events: run.events.filter(event => event.stage !== 'authorise') }, 'IT Operations'), false);
});
