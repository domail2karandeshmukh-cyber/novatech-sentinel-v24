import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalPairingServer } from '../scripts/remote-helper-servers.mjs';

test('Mac owner page can fetch local /state without an Origin header', async () => {
  const pairing = { localStatus: () => ({ pairingCode: null, connected: false }) };
  const server = createLocalPairingServer({
    pairing, address: '127.0.0.1', fingerprint: 'test-fingerprint', live: false,
    cloudStatus: () => ({ available: true }),
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const page = await fetch(`${url}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /NOVATECH Sentinel/);
    const state = await fetch(`${url}/state`);
    assert.equal(state.status, 200);
    assert.equal(state.headers.get('access-control-allow-origin'), null);
    const result = await state.json();
    assert.equal(result.service, 'novatech-remote-agent');
    assert.equal(result.cloud.available, true);
    assert.equal(result.live, false);
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});
