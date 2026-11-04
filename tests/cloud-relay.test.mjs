import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/remote.js';
import { createCloudRelay } from '../scripts/cloud-relay-client.mjs';

function mockRedis() {
  const data = new Map();
  const lists = new Map();
  const command = c => {
    const [op, k, ...args] = c;
    switch (op) {
      case 'GET': return data.get(k) ?? null;
      case 'DEL': return [k, ...args].reduce((a, x) => a + Number(data.delete(x)), 0);
      case 'SET': if (args.includes('NX') && data.has(k)) return null; data.set(k, args[0]); return 'OK';
      case 'INCR': { const v = Number(data.get(k) ?? 0) + 1; data.set(k, String(v)); return v; }
      case 'EXPIRE': return 1;
      case 'LPUSH': lists.set(k, [args[0], ...(lists.get(k) ?? [])]); return lists.get(k).length;
      case 'RPOP': return lists.get(k)?.pop() ?? null;
      default: throw Error('Unknown test Redis command: ' + op);
    }
  };
  return async (url, options) => {
    if (String(url).includes('redis.test')) return { ok: true, json: async () => ({ result: command(JSON.parse(options.body)) }) };
    throw Error('Unexpected fetch ' + url);
  };
}
function api(action, { method = 'POST', body = {}, headers = {}, id } = {}) {
  const req = { method, query: { action, ...(id ? { id } : {}) }, headers: { 'content-type': 'application/json', ...headers }, body };
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, end(s) { this.body = JSON.parse(s); } };
  return handler(req, res).then(() => ({ code: res.code, ...res.body }));
}
test('Cloud relay fails closed without secrets', async () => {
  const keys = ['UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL'];
  const old = keys.map(k => process.env[k]);
  keys.forEach(k => delete process.env[k]);
  try {
    const health = await api('health', { method: 'GET' });
    assert.equal(health.available, false);
    const result = await api('request', { body: { confirmation: 'REQUEST MAC SHUTDOWN' } });
    assert.equal(result.code, 503);
  } finally { keys.forEach((k, i) => { if (old[i] === undefined) delete process.env[k]; else process.env[k] = old[i]; }); }
});
test('Vercel Marketplace KV_REST_API names are accepted', async () => {
  const keys = ['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN','NOVATECH_CLOUD_DEVICE_KEY'];
  const old = keys.map(k => process.env[k]);
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.KV_REST_API_URL = 'https://redis.test';
  process.env.KV_REST_API_TOKEN = 'not-a-real-redis-token';
  process.env.NOVATECH_CLOUD_DEVICE_KEY = 'b'.repeat(64);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = mockRedis();
  try {
    assert.equal((await api('health', { method: 'GET' })).available, true);
    assert.equal((await api('open', { headers: { 'x-novatech-device-key': 'b'.repeat(64) }, body: { code:'654321', controllerName:'Pavan Sanam', workflowClosed:true, approved:true, scenarioId:'ransomware' } })).registered, true);
  } finally {
    globalThis.fetch = previousFetch;
    keys.forEach((k, i) => { if (old[i] === undefined) delete process.env[k]; else process.env[k] = old[i]; });
  }
});
test('Mac-owned code -> Pavan token -> single request -> Mac poll -> recorded approval', async () => {
  const previous = globalThis.fetch;
  const before = ['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','NOVATECH_CLOUD_DEVICE_KEY'].map(k => process.env[k]);
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'not-a-real-redis-token';
  process.env.NOVATECH_CLOUD_DEVICE_KEY = 'a'.repeat(64);
  globalThis.fetch = mockRedis();
  try {
    assert.equal((await api('health', { method: 'GET' })).available, true);
    const macHeaders = { 'x-novatech-device-key': 'a'.repeat(64) };
    assert.equal((await api('open', { headers: macHeaders, body: { code: '123456', controllerName: 'Pavan Sanam', workflowClosed: true, approved: true, scenarioId: 'ransomware', governance: { incidentId: 'NT-SEC-041' } } })).registered, true);
    assert.equal((await api('pair', { body: { code: '000000' } })).code, 403);
    const paired = await api('pair', { body: { code: '123456' } });
    assert.match(paired.token, /^[a-f0-9]{64}$/);
    assert.equal((await api('pair', { body: { code: '123456' } })).code, 403);
    assert.equal((await api('request', { body: { confirmation: 'REQUEST MAC SHUTDOWN' } })).code, 401);
    const bearer = { authorization: `Bearer ${paired.token}` };
    assert.equal((await api('request', { headers: bearer, body: { confirmation: 'no' } })).code, 400);
    const req = await api('request', { headers: bearer, body: { confirmation: 'REQUEST MAC SHUTDOWN' } });
    assert.equal(req.code, 202);
    assert.equal((await api('request', { headers: bearer, body: { confirmation: 'REQUEST MAC SHUTDOWN' } })).code, 429);
    const polled = await api('poll', { method: 'GET', headers: macHeaders });
    assert.equal(polled.request.id, req.id);
    assert.equal(polled.request.governance.incidentId, 'NT-SEC-041');
    assert.equal((await api('status', { method: 'GET', headers: bearer, id: req.id })).status, 'delivered');
    assert.equal((await api('result', { headers: macHeaders, body: { id: req.id, status: 'rejected' } })).recorded, true);
    assert.equal((await api('status', { method: 'GET', headers: bearer, id: req.id })).status, 'rejected');
    assert.equal((await api('revoke', { headers: macHeaders })).revoked, true);
    assert.equal((await api('status', { method: 'GET', headers: bearer, id: req.id })).code, 401);
  } finally {
    globalThis.fetch = previous;
    ['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','NOVATECH_CLOUD_DEVICE_KEY'].forEach((k, i) => { if (before[i] === undefined) delete process.env[k]; else process.env[k] = before[i]; });
  }
});
test('Cloud agent never executes when preview mode is selected', async () => {
  let executed = 0;
  const responses = [{ request: { id: 'b'.repeat(32), name: 'Pavan Sanam', expiresAt: Date.now() + 10000 } }, { recorded: true }];
  const relay = createCloudRelay({ config: { url: 'https://demo.test', deviceKey: 'a'.repeat(64) }, live: false, approval: { approver: 'applescript' },
    platform: 'darwin', execute: async () => { executed++; return { status: 'requested' }; },
    fetchImpl: async () => ({ ok: true, json: async () => responses.shift() }), logger: { log() {}, error() {} } });
  await relay.tick();
  assert.equal(executed, 0);
  assert.equal(relay.status().busy, false);
});
