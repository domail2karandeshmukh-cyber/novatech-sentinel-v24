import test from 'node:test';
import assert from 'node:assert/strict';
import { blankRun, reduce, verifyLedger, gateActor, cleanFields } from '../src/sentinel/engine/incident.ts';
import { GATES, SCENARIOS, scenarioById } from '../src/sentinel/data/scenarios.ts';
import {
  SEVERITIES, approvalFormFor, approvalRecord, blankValues, detailOf, formFor, keyFacts, missingFields, playbookRecord, playbookValues, summaryOf,
} from '../src/sentinel/data/forms.ts';

let clock = Date.parse('2026-11-02T09:00:00.000Z');
const at = () => new Date((clock += 30_000)).toISOString();
const ok = (outcome) => { assert.equal(outcome.error, undefined, outcome.error); return outcome.run; };
const FORM_GATES = GATES.map(g => g.key).filter(k => k !== 'authorize');
const euros = (s) => Number(String(s).replace(/[^\d]/g, ''));

test('every playbook form is complete, and a blank form is not', () => {
  for (const s of SCENARIOS) for (const g of FORM_GATES) {
    const fields = formFor(s.id, g);
    assert.ok(fields.length >= 3, `${s.id}/${g} has a real form`);
    assert.deepEqual(missingFields(fields, playbookValues(fields)), [], `${s.id}/${g} playbook fills everything`);
    const required = fields.filter(f => f.kind !== 'readonly' && !(f.kind === 'checks' && !f.all));
    assert.equal(missingFields(fields, blankValues(fields)).length, required.length, `${s.id}/${g} blank form lists every required field`);
    assert.ok(summaryOf(fields, playbookValues(fields)).length > 4, `${s.id}/${g} has key facts`);
    for (const f of fields) if ((f.kind === 'select' || f.kind === 'segmented') && f.value) assert.ok(f.options.includes(f.value), `${s.id}/${g}/${f.id} playbook value is an option`);
    for (const f of fields) if (f.kind === 'tags' || f.kind === 'checks') for (const v of f.value) assert.ok(f.options.includes(v), `${s.id}/${g}/${f.id} playbook choice is an option`);
  }
});

test('severity is recorded at detection and confirmed at assessment', () => {
  for (const s of SCENARIOS) {
    for (const g of ['detect', 'assess']) {
      const sev = formFor(s.id, g).find(f => f.id === 'severity');
      assert.ok(sev && sev.kind === 'select', `${s.id}/${g} asks for a severity`);
      assert.deepEqual(sev.options, SEVERITIES);
      assert.equal(sev.value.startsWith(s.severity), true, `${s.id}/${g} playbook severity matches the scenario (${s.severity})`);
    }
  }
});

test('the financial form adds up to the modelled exposure', () => {
  for (const s of SCENARIOS) {
    const fields = formFor(s.id, 'impact');
    const v = playbookValues(fields);
    assert.equal(Number(v.high), s.exposure, `${s.id}: modelled maximum equals the scenario exposure`);
    assert.ok(Number(v.low) <= Number(v.likely) && Number(v.likely) <= Number(v.high), `${s.id}: low ≤ likely ≤ maximum`);
    const drivers = fields.find(f => f.id === 'drivers');
    const amounts = drivers.options.map(o => (o.match(/€[\d,]+/g) ?? []).map(euros)).flat();
    if (s.id !== 'payments') assert.equal(amounts.reduce((a, b) => a + b, 0), s.exposure, `${s.id}: the drivers sum to the maximum`);
    assert.ok(keyFacts(fields, v).some(x => x.startsWith('Modelled maximum €')), `${s.id}: amounts carry their label in the summary`);
  }
});

test('the ransomware story keeps the device on until verification, then powers it off as a follow-up', () => {
  const exec = playbookValues(formFor('ransomware', 'execute'));
  assert.equal(exec.device, 'Powered on, isolated');
  const close = formFor('ransomware', 'close').find(f => f.id === 'followups');
  assert.ok(close.value.some(x => /^Power off and re-image FIN-WS-07/.test(x)), 'closure hands over the power-off');
  const sec = approvalFormFor('ransomware', 'security');
  assert.ok(sec.conditions.some(c => /powered on until the memory evidence is verified/.test(c)), 'the CISO conditions the power state');
  const s = scenarioById('ransomware');
  assert.match(s.treatment.notChosen.find(o => /Shut the workstation down/.test(o.option)).why, /after the memory image is verified/);
});

test('signed forms are sealed in the ledger: detail is hashed, tampering is detected', () => {
  const s = scenarioById('ransomware');
  let run = ok(reduce(blankRun('ransomware'), { type: 'start' }, at()));
  const rec = playbookRecord('ransomware', 'detect', s.notes.detect);
  run = ok(reduce(run, { type: 'record', gate: 'detect', actor: 'karan', note: rec.note, fields: rec.fields }, at()));
  assert.deepEqual(run.records.detect.fields, rec.fields);
  const e = run.ledger[run.ledger.length - 1];
  assert.deepEqual(e.detail, rec.fields);
  assert.match(e.note, /^Confirmed — escalate · Critical — P1 · Ransomware/);
  assert.equal(verifyLedger(run.ledger).ok, true);
  const tampered = run.ledger.map((x, i) => i === run.ledger.length - 1 ? { ...x, detail: { ...x.detail, 'Initial severity': 'Low — P4' } } : x);
  assert.equal(verifyLedger(tampered).ok, false, 'changing one field of a signed form breaks the chain');
  const stripped = run.ledger.map((x, i) => i === run.ledger.length - 1 ? (({ detail, ...rest }) => rest)(x) : x);
  assert.equal(verifyLedger(stripped).ok, false, 'removing the form breaks the chain');
});

test('entries without a form hash exactly as before (old ledgers stay valid)', () => {
  const s = scenarioById('cloud');
  let run = ok(reduce(blankRun('cloud'), { type: 'start' }, at()));
  run = ok(reduce(run, { type: 'record', gate: 'detect', actor: 'karan', note: s.notes.detect }, at()));
  assert.equal(run.ledger[1].detail, undefined);
  assert.equal(verifyLedger(run.ledger).ok, true);
});

test('malformed forms are refused, not trimmed', () => {
  assert.equal(cleanFields(undefined).ok, true);
  assert.equal(cleanFields({ a: 'b' }).ok, true);
  assert.equal(cleanFields(['x']).ok, false);
  assert.equal(cleanFields({ a: 3 }).ok, false);
  assert.equal(cleanFields({ a: 'x'.repeat(601) }).ok, false);
  assert.equal(cleanFields(Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`k${i}`, 'v']))).ok, false);
  let run = ok(reduce(blankRun('ransomware'), { type: 'start' }, at()));
  const out = reduce(run, { type: 'record', gate: 'detect', actor: 'karan', note: 'Recorded with a broken form.', fields: { Severity: 42 } }, at());
  assert.match(out.error, /not valid/);
  assert.equal(out.run.ledger.length, run.ledger.length, 'nothing recorded');
});

test('approvals carry their conditions and validity; returns carry the decision', () => {
  const s = scenarioById('ransomware');
  let run = ok(reduce(blankRun('ransomware'), { type: 'start' }, at()));
  for (const g of ['detect', 'assess', 'impact']) { const r = playbookRecord('ransomware', g, s.notes[g]); run = ok(reduce(run, { type: 'record', gate: g, actor: gateActor(run, g), note: r.note, fields: r.fields }, at())); }
  const a = approvalRecord('ransomware', 'security', 'approve', s.notes.security);
  run = ok(reduce(run, { type: 'decide', step: 'security', actor: 'victor', decision: 'approve', note: a.note, fields: a.fields }, at()));
  const sec = run.approvals.find(x => x.id === 'security');
  assert.equal(sec.fields.Decision, 'Approved with conditions');
  assert.equal(sec.fields.Conditions.split('; ').length, approvalFormFor('ransomware', 'security').conditions.length);
  assert.equal(sec.fields.Validity, '2 hours');
  const r = approvalRecord('ransomware', 'executive', 'return', 'Narrow the scope and resubmit with evidence.');
  run = ok(reduce(run, { type: 'decide', step: 'executive', actor: 'vanessa', decision: 'return', note: r.note, fields: r.fields }, at()));
  const back = run.ledger[run.ledger.length - 1];
  assert.equal(back.kind, 'returned');
  assert.deepEqual(back.detail, { Decision: 'Returned for revision' });
  assert.equal(verifyLedger(run.ledger).ok, true);
});

test('detail map from a form uses labels and readable values', () => {
  const fields = formFor('payments', 'impact');
  const d = detailOf(fields, playbookValues(fields));
  assert.equal(d['Modelled maximum'], '€85,000');
  assert.equal(d['Exposure if held'], '€0');
  assert.match(d['Hold request'], /Hold this line only/);
});
