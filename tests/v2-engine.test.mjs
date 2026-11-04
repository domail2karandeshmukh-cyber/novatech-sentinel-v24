import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceRun, blankRun, loadDemo, money, saveDemo, SCENARIOS, STAGES, startRun, STORAGE_KEY,
} from '../src/v2/demoEngine.ts';

const T0 = '2026-10-27T15:00:00.000Z';
const T1 = '2026-10-27T15:01:00.000Z';

test('all three scenarios are complete and ready for a rehearsal', () => {
  assert.equal(SCENARIOS.length, 3);
  assert.equal(new Set(SCENARIOS.map(s => s.id)).size, 3);
  for (const scenario of SCENARIOS) {
    for (const stage of STAGES) assert.ok(scenario.suggestions[stage.key].length >= 12);
  }
  assert.equal(money(240000), '€240,000');
});

test('starts only once and inserts a synthetic source event', () => {
  const run = startRun(blankRun(), T0);
  assert.equal(run.status, 'active');
  assert.equal(run.events.length, 1);
  assert.equal(run.events[0].role, 'System');
  assert.deepEqual(startRun(run, T1), run);
});

test('enforces role, minimum rationale and decision gates', () => {
  let run = startRun(blankRun(), T0);
  assert.match(advanceRun(run, 'Finance', 'A reasonable amount of justification.').error, /Risk Lead/);
  assert.match(advanceRun(run, 'Risk Lead', 'short').error, /12 characters/);
  assert.match(advanceRun(run, 'Risk Lead', 'A valid response note', 'revise').error, /Only the director/);
  assert.equal(run.step, 0);
  const first = advanceRun(run, 'Risk Lead', 'A valid incident acknowledgment note.', 'approve', T1);
  assert.equal(first.error, undefined);
  run = first.run;
  assert.equal(run.step, 1);
  assert.equal(run.events[1].actor, 'Karan Deshmukh');
});

test('a director can return the treatment for reassessment', () => {
  let run = startRun(blankRun(), T0);
  for (let i = 0; i < 3; i++) {
    run = advanceRun(run, STAGES[i].role, `Evidence recorded for ${STAGES[i].name}`, 'approve', T1).run;
  }
  assert.equal(run.step, 3);
  run = advanceRun(run, 'Director', 'Please reassess the containment scope before approval.', 'revise', T1).run;
  assert.equal(run.step, 1);
  assert.equal(run.revisions, 1);
  assert.equal(run.events.at(-1).kind, 'revision');
  run = advanceRun(run, 'Cybersecurity', 'Revised cyber impact has been reviewed.').run;
  run = advanceRun(run, 'Finance', 'Updated financial exposure has been reviewed.').run;
  run = advanceRun(run, 'Director', 'Treatment approved with evidence controls.').run;
  assert.equal(run.step, 4);
  assert.equal(run.events.at(-1).kind, 'approval');
});

test('the seven-stage sequence closes with actor-stamped evidence', () => {
  let run = startRun(blankRun('payments'), T0);
  const chosen = SCENARIOS.find(s => s.id === 'payments');
  for (const stage of STAGES) {
    const res = advanceRun(run, stage.role, chosen.suggestions[stage.key], 'approve', T1);
    assert.equal(res.error, undefined);
    run = res.run;
  }
  assert.equal(run.status, 'closed');
  assert.equal(run.step, 7);
  assert.equal(run.completedAt, T1);
  assert.equal(run.events.length, 8);
  assert.equal(run.events.filter(e => e.kind === 'approval').length, 1);
  assert.equal(run.events.filter(e => e.kind === 'closure').length, 1);
  assert.match(advanceRun(run, 'Risk Lead', 'Trying to add more evidence.').error, /Start a rehearsal/);
});

test('persisted demo runs are versioned and malformed state is ignored', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const run = startRun(blankRun('cloud'), T0);
  saveDemo(run);
  assert.deepEqual(loadDemo(), run);
  store.set(STORAGE_KEY, '{broken json');
  assert.deepEqual(loadDemo(), blankRun());
  store.set(STORAGE_KEY, JSON.stringify({ version: 2, scenarioId: 'unknown', status: 'active', events: [], step: 0 }));
  assert.deepEqual(loadDemo(), blankRun());
  delete globalThis.localStorage;
});
