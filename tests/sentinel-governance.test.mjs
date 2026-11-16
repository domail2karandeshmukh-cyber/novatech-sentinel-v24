// The web app's pairing request must be accepted, field for field, by the Mac agent's own validator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blankRun, reduce, gateActor } from '../src/sentinel/engine/incident.ts';
import { GATES, scenarioById } from '../src/sentinel/data/scenarios.ts';
import { governanceRecord, pairingBody, clipField } from '../src/sentinel/engine/governance.ts';
import { RemotePairing, validateGovernance } from '../scripts/remote-pairing.mjs';

let clock = Date.parse('2026-11-02T09:00:00.000Z');
const at = () => new Date((clock += 30_000)).toISOString();
const ok = (o) => { assert.equal(o.error, undefined, o.error); return o.run; };

function closedRun(scenarioId = 'ransomware') {
  const s = scenarioById(scenarioId);
  let run = ok(reduce(blankRun(scenarioId), { type: 'start' }, at()));
  for (const g of GATES) {
    if (g.key === 'authorize') {
      while (run.approvals.some(a => a.status === 'pending')) {
        const p = run.approvals.find(a => a.status === 'pending');
        run = ok(reduce(run, { type: 'decide', step: p.id, actor: p.acting, decision: 'approve', note: s.notes[p.id] }, at()));
      }
    } else {
      run = ok(reduce(run, { type: 'record', gate: g.key, actor: gateActor(run, g.key), note: s.notes[g.key], consent: true }, at()));
    }
  }
  return run;
}

test('every signed step of the closed ransomware run survives the agent validator', () => {
  const run = closedRun();
  assert.equal(run.status, 'closed');
  const record = governanceRecord(run);
  assert.equal(record.approvals.length, 8, 'six recorded gates plus two approvals');
  const accepted = validateGovernance(record);
  assert.ok(accepted, 'the agent accepted the record');
  assert.equal(accepted.approvals.length, record.approvals.length, 'no approval row was dropped');
  assert.equal(accepted.incidentId, 'NT-SEC-041');
  assert.deepEqual(accepted.approvals.map(a => a.person), [
    'Karan Deshmukh', 'Nadia Vasseur', 'Sarah Perrin', 'Victor Bonnet', 'Vanessa Mallet', 'Pierre Sauvage', 'Victor Bonnet', 'Karan Deshmukh',
  ]);
});

test('the pairing body opens a pairing window on the real agent class, with the record attached', () => {
  const run = closedRun();
  const pairing = new RemotePairing({ clock: () => clock, getCode: () => '123456', getToken: () => 't'.repeat(64) });
  const status = pairing.activate(pairingBody(run, 'Pierre Sauvage'));
  assert.equal(status.pairingCode, '123456');
  assert.equal(status.governance?.incidentId, 'NT-SEC-041');
  assert.equal(status.governance?.approvals.length, 8);
});

test('an unfinished run is refused by the agent, exactly as in V2.3', () => {
  const s = scenarioById('ransomware');
  let run = ok(reduce(blankRun('ransomware'), { type: 'start' }, at()));
  run = ok(reduce(run, { type: 'record', gate: 'detect', actor: gateActor(run, 'detect'), note: s.notes.detect }, at()));
  const pairing = new RemotePairing();
  assert.throws(() => pairing.activate(pairingBody(run, 'Pierre Sauvage')), /Finish the director-approved ransomware workflow/);
});

test('long fields are clipped, never dropped', () => {
  const long = 'x'.repeat(300);
  const clipped = clipField(long);
  assert.equal(Array.from(clipped).length, 120);
  assert.ok(validateGovernance({ incidentId: clipped, approvals: [{ gate: clipped, person: clipped }] }).approvals.length === 1);
});
