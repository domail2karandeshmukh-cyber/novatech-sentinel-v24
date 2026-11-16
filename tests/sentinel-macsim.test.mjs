// Rules of the public-preview rehearsal of the final act (no device involved): eligibility, expiry, fail-safe timeout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blankMacSim, macCan, macStep, PAIRING_MS, SESSION_MS, DECISION_MS } from '../src/sentinel/engine/macsim.ts';

const T0 = Date.parse('2026-10-28T09:00:00Z');
const step = (m, a, now, eligible = true) => macStep(m, a, now, eligible);

test('nothing opens before the seven gates are closed', () => {
  assert.equal(step(blankMacSim(), { type: 'open', code: '123456' }, T0, false), null);
  assert.equal(macCan(blankMacSim(), false, T0).open, false);
});

test('owner opens, Pierre pairs and requests, owner decides — each step logged under the right person', () => {
  const a = step(blankMacSim(), { type: 'open', code: '123456' }, T0);
  assert.equal(a.mac.phase, 'code'); assert.equal(a.mac.codeUntil, T0 + PAIRING_MS); assert.equal(a.log.actor, 'karan');
  const b = step(a.mac, { type: 'pair' }, T0 + 1000);
  assert.equal(b.mac.phase, 'paired'); assert.equal(b.mac.sessionUntil, T0 + 1000 + SESSION_MS); assert.equal(b.log.actor, 'pierre');
  const c = step(b.mac, { type: 'request' }, T0 + 2000);
  assert.equal(c.mac.phase, 'pending'); assert.equal(c.mac.deadline, T0 + 2000 + DECISION_MS); assert.equal(c.log.actor, 'pierre');
  const d = step(c.mac, { type: 'decide', decision: 'rejected' }, T0 + 5000);
  assert.equal(d.mac.result, 'rejected'); assert.equal(d.log.actor, 'karan'); assert.match(d.log.title, /stays on/);
  // A new request is possible while the session lasts; Pierre never decides.
  const e = step(d.mac, { type: 'request' }, T0 + 6000);
  assert.equal(e.mac.phase, 'pending');
});

test('no answer within 30 seconds is a rejection, and a late click cannot approve', () => {
  let m = step(blankMacSim(), { type: 'open', code: '654321' }, T0).mac;
  m = step(m, { type: 'pair' }, T0).mac;
  m = step(m, { type: 'request' }, T0).mac;
  assert.equal(step(m, { type: 'tick' }, T0 + DECISION_MS), null, 'still inside the window');
  assert.equal(step(m, { type: 'decide', decision: 'approved' }, T0 + DECISION_MS + 1), null, 'late approval refused');
  const t = step(m, { type: 'tick' }, T0 + DECISION_MS + 1);
  assert.equal(t.mac.result, 'timeout'); assert.equal(t.log.actor, 'system');
});

test('an expired pairing code cannot be used and closes itself', () => {
  const m = step(blankMacSim(), { type: 'open', code: '111111' }, T0).mac;
  assert.equal(step(m, { type: 'pair' }, T0 + PAIRING_MS + 1), null);
  const t = step(m, { type: 'tick' }, T0 + PAIRING_MS + 1);
  assert.equal(t.mac.phase, 'idle'); assert.equal(t.log, null);
});

test('no request without a live session or after the incident is reopened', () => {
  let m = step(blankMacSim(), { type: 'open', code: '222222' }, T0).mac;
  assert.equal(step(m, { type: 'request' }, T0), null, 'not paired yet');
  m = step(m, { type: 'pair' }, T0).mac;
  assert.equal(step(m, { type: 'request' }, T0 + SESSION_MS + 1), null, 'session expired');
  assert.equal(step(m, { type: 'request' }, T0, false), null, 'gates no longer closed');
});

test('the owner can revoke at any time; revoking nothing does nothing', () => {
  assert.equal(step(blankMacSim(), { type: 'revoke' }, T0), null);
  let m = step(blankMacSim(), { type: 'open', code: '333333' }, T0).mac;
  m = step(m, { type: 'pair' }, T0).mac;
  m = step(m, { type: 'request' }, T0).mac;
  const r = step(m, { type: 'revoke' }, T0 + 1);
  assert.equal(r.mac.phase, 'idle'); assert.equal(r.log.actor, 'karan');
  assert.equal(step(r.mac, { type: 'decide', decision: 'approved' }, T0 + 2), null, 'no decision after revocation');
});

test('pairing codes must be six digits', () => {
  assert.equal(step(blankMacSim(), { type: 'open', code: '12345' }, T0), null);
  assert.equal(step(blankMacSim(), { type: 'open', code: 'abcdef' }, T0), null);
});
