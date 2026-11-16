import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blankRun, reduce, verifyLedger, macEligibility, sodForApproval, taskCounts, taskStatus, exposureNow, nextAction, sanitizeRun, gateActor,
} from '../src/sentinel/engine/incident.ts';
import { SCENARIOS, GATES, scenarioById } from '../src/sentinel/data/scenarios.ts';
import { TEAM } from '../src/sentinel/data/team.ts';
import { sha256Hex } from '../src/sentinel/engine/sha256.ts';

let clock = Date.parse('2026-11-02T09:00:00.000Z');
const at = () => new Date((clock += 30_000)).toISOString();
const ok = (outcome) => { assert.equal(outcome.error, undefined, outcome.error); return outcome.run; };
const NOTE = 'Recorded evidence and rationale for this gate.';

function runThrough(scenarioId, upTo = 'close') {
  const s = scenarioById(scenarioId);
  let run = ok(reduce(blankRun(scenarioId), { type: 'start' }, at()));
  for (const g of GATES) {
    if (g.key === 'authorize') {
      for (const a of [...run.approvals]) {
        const pending = run.approvals.find(x => x.status === 'pending');
        run = ok(reduce(run, { type: 'decide', step: pending.id, actor: pending.acting, decision: 'approve', note: s.notes[pending.id] || NOTE }, at()));
        void a;
      }
    } else {
      run = ok(reduce(run, { type: 'record', gate: g.key, actor: gateActor(run, g.key), note: s.notes[g.key], consent: true }, at()));
    }
    if (g.key === upTo) break;
  }
  return run;
}

test('sha256 matches the FIPS 180-4 test vectors', () => {
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
});

test('canonical roster: six people, exact names and roles', () => {
  assert.deepEqual(TEAM.map(p => `${p.name} — ${p.role}`), [
    'Karan Deshmukh — Project Manager / Risk Coordinator',
    'Victor Bonnet — RSSI / CISO',
    'Vanessa Mallet — Chief Executive Officer',
    'Nadia Vasseur — Cybersecurity Analyst',
    'Sarah Perrin — Finance Director (CFO / DAF)',
    'Pierre Sauvage — IT Operations Manager',
  ]);
});

test('each scenario has its own treatment, route and plans (no copy-paste)', () => {
  const kinds = new Set(SCENARIOS.map(s => s.treatment.kind));
  assert.equal(kinds.size, 3);
  assert.equal(scenarioById('ransomware').approvals.length, 2);
  assert.equal(scenarioById('payments').approvals.length, 1);
  assert.equal(scenarioById('payments').requester, 'sarah');
  for (const s of SCENARIOS) {
    assert.ok(s.notes.detect.length > 40 && s.notes.close.length > 40);
    assert.equal(new Set(s.plans.map(p => p.dept)).size, 5);
    for (const row of s.raci) assert.ok(row.a, `one Accountable for ${row.activity}`);
  }
});

test('full ransomware rehearsal closes with an intact hash chain and actor-stamped evidence', () => {
  const run = runThrough('ransomware');
  assert.equal(run.status, 'closed');
  assert.equal(run.gate, 7);
  const actors = run.ledger.map(e => e.actorName);
  for (const name of ['Karan Deshmukh', 'Nadia Vasseur', 'Sarah Perrin', 'Victor Bonnet', 'Vanessa Mallet', 'Pierre Sauvage']) assert.ok(actors.includes(name), name);
  const v = verifyLedger(run.ledger);
  assert.equal(v.ok, true);
  assert.equal(v.checked, run.ledger.length);
  const tampered = run.ledger.map((e, i) => i === 3 ? { ...e, note: 'edited later' } : e);
  assert.equal(verifyLedger(tampered).ok, false);
  assert.equal(sanitizeRun({ ...run, ledger: tampered }), null);
  assert.ok(sanitizeRun(JSON.parse(JSON.stringify(run))));
});

test('wrong person, short rationale and skipped gates are refused', () => {
  let run = ok(reduce(blankRun('ransomware'), { type: 'start' }, at()));
  assert.match(reduce(run, { type: 'record', gate: 'detect', actor: 'nadia', note: NOTE }, at()).error, /Karan Deshmukh/);
  assert.match(reduce(run, { type: 'record', gate: 'detect', actor: 'karan', note: 'short' }, at()).error, /12 characters/);
  assert.match(reduce(run, { type: 'record', gate: 'execute', actor: 'pierre', note: NOTE, consent: true }, at()).error, /next gate/);
  run = ok(reduce(run, { type: 'record', gate: 'detect', actor: 'karan', note: NOTE }, at()));
  assert.equal(nextAction(run).actor, 'nadia');
});

test('ransomware needs CISO then CEO; the CEO can return the treatment for revision', () => {
  let run = runThrough('ransomware', 'impact');
  assert.deepEqual(run.approvals.map(a => [a.id, a.acting, a.status]), [['security', 'victor', 'pending'], ['executive', 'vanessa', 'waiting']]);
  assert.match(reduce(run, { type: 'decide', step: 'executive', actor: 'vanessa', decision: 'approve', note: NOTE }, at()).error, /earlier approval/);
  run = ok(reduce(run, { type: 'decide', step: 'security', actor: 'victor', decision: 'approve', note: NOTE }, at()));
  run = ok(reduce(run, { type: 'decide', step: 'executive', actor: 'vanessa', decision: 'return', note: 'Narrow the scope to the workstation only, please.' }, at()));
  assert.equal(GATES[run.gate].key, 'assess');
  assert.equal(run.revisions, 1);
  assert.equal(run.approvals.length, 0);
  assert.equal(run.ledger.at(-1).kind, 'returned');
  assert.match(reduce(run, { type: 'record', gate: 'execute', actor: 'pierre', note: NOTE, consent: true }, at()).error, /next gate/);
});

test('payment hold: the CFO requests it, so only an independent approver (CEO) can approve', () => {
  let run = runThrough('payments', 'impact');
  assert.equal(run.approvals.length, 1);
  assert.equal(run.approvals[0].acting, 'vanessa');
  const checks = sodForApproval(run, 'executive', 'sarah');
  assert.equal(checks.find(c => c.rule.startsWith('Approver is not the requester')).ok, false);
  // CEO unavailable: Victor is the independent emergency executive deputy here;
  // the CFO requested the hold and cannot approve it herself.
  run = ok(reduce(run, { type: 'unavailable', person: 'vanessa' }, at()));
  assert.equal(run.approvals[0].acting, 'victor');
  assert.equal(run.approvals[0].status, 'pending');
  assert.ok(run.approvals[0].delegation);
  assert.match(reduce(run, { type: 'decide', step: 'executive', actor: 'sarah', decision: 'approve', note: NOTE }, at()).error, /Victor Bonnet/);
  run = ok(reduce(run, { type: 'available', person: 'vanessa' }, at()));
  assert.equal(run.approvals[0].status, 'pending');
  run = ok(reduce(run, { type: 'decide', step: 'executive', actor: 'vanessa', decision: 'approve', note: NOTE }, at()));
  assert.equal(GATES[run.gate].key, 'execute');
});

test('ransomware with the CEO unavailable uses the CFO, never Victor twice', () => {
  let run = runThrough('ransomware', 'impact');
  run = ok(reduce(run, { type: 'unavailable', person: 'vanessa' }, at()));
  assert.equal(run.approvals[1].acting, 'sarah');
  assert.ok(run.approvals[1].delegation);
  run = ok(reduce(run, { type: 'decide', step: 'security', actor: 'victor', decision: 'approve', note: NOTE }, at()));
  run = ok(reduce(run, { type: 'decide', step: 'executive', actor: 'sarah', decision: 'approve', note: NOTE }, at()));
  assert.equal(GATES[run.gate].key, 'execute');
  assert.ok(run.ledger.some(e => e.kind === 'delegated'));
});

test('ransomware with the CISO unavailable blocks: the analyst deputy requested it, the CEO already holds the other approval', () => {
  let run = runThrough('ransomware', 'impact');
  run = ok(reduce(run, { type: 'unavailable', person: 'victor' }, at()));
  assert.equal(run.approvals[0].status, 'blocked');
  assert.match(run.approvals[0].blockedReason, /Nadia Vasseur is ineligible/);
  assert.match(run.approvals[0].blockedReason, /Vanessa Mallet is ineligible/);
  assert.equal(run.approvals[1].status, 'waiting');
  assert.ok(run.ledger.some(e => e.kind === 'sod_blocked'));
});

test('IT Operations Manager unavailable: the Systems Administrator executes, the CISO still verifies', () => {
  let run = runThrough('cloud', 'authorize');
  run = ok(reduce(run, { type: 'unavailable', person: 'pierre' }, at()));
  assert.equal(gateActor(run, 'execute'), 'thomas');
  assert.match(reduce(run, { type: 'record', gate: 'execute', actor: 'thomas', note: NOTE }, at()).error, /simulated/);
  run = ok(reduce(run, { type: 'record', gate: 'execute', actor: 'thomas', note: NOTE, consent: true }, at()));
  run = ok(reduce(run, { type: 'record', gate: 'verify', actor: 'victor', note: NOTE }, at()));
  assert.equal(run.records.execute.by, 'thomas');
});

test('the Mac action unlocks only after the complete ransomware workflow', () => {
  assert.equal(macEligibility(runThrough('ransomware', 'verify')).ok, false);
  assert.equal(macEligibility(runThrough('ransomware')).ok, true);
  assert.equal(macEligibility(runThrough('cloud')).ok, false);
  assert.equal(macEligibility(runThrough('payments')).ok, false);
});

test('tasks move from planned to done as gates complete; backlog overdue stays visible', () => {
  const now = Date.parse('2026-11-02T09:05:00.000Z');
  const ready = blankRun('ransomware');
  const before = taskCounts(ready, now);
  assert.ok(before.planned > 0 && before.overdue >= 3);
  const closed = runThrough('ransomware');
  const s = scenarioById('ransomware');
  for (const t of s.tasks.filter(t => t.doneAt)) assert.equal(taskStatus(t, closed, now), 'done', t.id);
  assert.ok(taskCounts(closed, now).open > 0, 'follow-ups remain open after closure');
});

test('exposure falls to the residual figure only after the approved action is executed', () => {
  const s = scenarioById('ransomware');
  assert.equal(exposureNow(runThrough('ransomware', 'authorize')).current, s.exposure);
  assert.equal(exposureNow(runThrough('ransomware', 'execute')).current, 90_000);
});
