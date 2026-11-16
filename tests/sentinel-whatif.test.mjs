// "Challenge the controls": the professor's what-ifs are answered by the real engine on a private copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { whatIf, WHAT_IFS } from '../src/sentinel/engine/whatif.ts';

test('CEO unavailable on the ransomware case: delegated to the CFO, who passes every check', () => {
  const r = whatIf('ransomware', 'ceo-away');
  assert.equal(r.verdict, 'delegated');
  assert.match(r.headline, /Sarah Perrin/);
  assert.ok(r.checks.length > 0 && r.checks.every(c => c.ok));
});

test('CEO unavailable on the payment fraud case: Victor is eligible because Sarah requested the hold', () => {
  const r = whatIf('payments', 'ceo-away');
  assert.equal(r.verdict, 'delegated');
  assert.match(r.headline, /Victor Bonnet/);
  assert.ok(r.checks.every(c => c.ok));
});

test('the executor trying to approve is refused by separation of duties', () => {
  for (const id of ['ransomware', 'cloud', 'payments']) {
    const r = whatIf(id, 'executor-approves');
    assert.equal(r.verdict, 'refused');
    assert.ok(r.checks.some(c => c.rule === 'Approver will not execute' && !c.ok), id);
  }
});

test('the requester trying to approve is refused', () => {
  const r = whatIf('ransomware', 'requester-approves');
  assert.equal(r.verdict, 'refused');
  assert.ok(r.checks.some(c => c.rule === 'Approver is not the requester' && !c.ok));
  const f = whatIf('payments', 'requester-approves');
  assert.match(f.headline, /Sarah Perrin requested/);
});

test('the CEO returning the treatment sends it back to the cyber assessment', () => {
  const r = whatIf('cloud', 'ceo-returns');
  assert.equal(r.verdict, 'returned');
  assert.match(r.lines[0], /gate 2/);
});

test('every listed what-if has an answer for every scenario', () => {
  for (const s of ['ransomware', 'cloud', 'payments']) for (const w of WHAT_IFS) assert.ok(whatIf(s, w.id).headline.length > 10, `${s}/${w.id}`);
});
