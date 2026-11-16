import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOW_IDS, buildShow, QUESTIONS, showMeta } from '../src/sentinel/presenter/shows.ts';
import { DURATIONS } from '../src/sentinel/presenter/model.ts';
import { DEFAULT_RELAY, TEAM } from '../src/sentinel/data/team.ts';

const who = (sc) => {
  const slot = sc.segment === 'Introduction' ? 0 : sc.segment === 'Final demonstration and conclusion' ? 6 : DEFAULT_RELAY.findIndex(r => r.segment === sc.segment);
  return slot >= 0 ? DEFAULT_RELAY[slot].person : sc.speaker;
};
// Routes the projector can render (src/sentinel/routes.tsx STAGE_PAGES); kept here because the test runner cannot load TSX.
const STAGE_ROUTES = ['/', '/command', '/incident', '/soc', '/response', '/endpoint', '/evidence', '/report', '/team', '/risks', '/ebios', '/quant', '/compliance', '/controls', '/continuity', '/board', '/vendors'];

test('every show exists in every length, including 20 and 30 minutes', () => {
  assert.deepEqual(DURATIONS, [2, 5, 8, 12, 20, 30]);
  for (const id of SHOW_IDS) for (const d of DURATIONS) {
    const scenes = buildShow(id, d);
    assert.ok(scenes.length >= 2, `${id} ${d} min has scenes`);
    const total = scenes.reduce((a, s) => a + s.seconds, 0);
    assert.ok(Math.abs(total - d * 60) <= Math.max(10, scenes.length * 1.5), `${id} ${d} min lasts about ${d} minutes (got ${total} s)`);
    for (const s of scenes) {
      assert.ok(STAGE_ROUTES.includes(s.route), `${s.id} route ${s.route} can be shown on the projector`);
      assert.ok(s.say.length > 60 && s.keywords.length >= 4 && s.beats.length >= 1, `${s.id} is complete`);
    }
    // No scene appears twice in one show.
    assert.equal(new Set(scenes.map(s => s.id)).size, scenes.length, `${id} ${d} min has no repeated scene`);
  }
});

test('the graded relay is fair in the 20- and 30-minute versions', () => {
  for (const d of [20, 30]) {
    const t = Object.fromEntries(TEAM.map(p => [p.id, 0]));
    for (const s of buildShow('full', d)) t[who(s)] += s.seconds;
    const values = Object.values(t);
    const others = TEAM.filter(p => p.id !== 'karan').map(p => t[p.id]);
    assert.ok(Math.min(...values) >= (d === 20 ? 140 : 210), `${d} min: everyone speaks long enough (${JSON.stringify(t)})`);
    assert.ok(t.karan <= Math.max(...others) * 1.6, `${d} min: the coordinator does not dominate (${JSON.stringify(t)})`);
  }
});

test('the full show ends with the power-off decided by the device owner', () => {
  for (const d of [5, 8, 12, 20, 30]) {
    const scenes = buildShow('full', d);
    assert.equal(scenes[scenes.length - 1].id, 'macApprove', `${d} min ends on the final step`);
    const ids = scenes.map(s => s.id);
    assert.ok(ids.indexOf('close') < ids.indexOf('macApprove'), `${d} min: closure comes before the power-off`);
    if (ids.includes('macIntro')) assert.equal(ids.indexOf('macIntro'), ids.length - 2, `${d} min: Pierre’s request comes just before`);
  }
  assert.equal(buildShow('full', 2).at(-1).id, 'thanks');
  assert.match(showMeta('full').blurb, /power-off decided by the device owner/);
});

test('the long shows present the case workspace', () => {
  const ids30 = buildShow('full', 30).map(s => s.id);
  for (const id of ['register', 'ebios', 'compliance', 'controls', 'quant', 'vendors', 'board', 'continuity']) assert.ok(ids30.includes(id), `30 min includes ${id}`);
  const ids20 = buildShow('full', 20).map(s => s.id);
  for (const id of ['register', 'compliance', 'quant', 'board', 'continuity']) assert.ok(ids20.includes(id), `20 min includes ${id}`);
});

test('all eleven professor questions have an owner, an answer and evidence', () => {
  const expected = ['Who can approve this action?', 'What happens if the CEO rejects it?', 'Who owns this risk?', 'Why is shutdown necessary?', 'Why not isolate the endpoint instead?', 'What is the financial impact?', 'Where is the audit history?', 'What happens if the responsible person is unavailable?', 'Is the role switch real authentication?', 'Can Pierre shut down Karan’s Mac?', 'Is this real data?'];
  assert.deepEqual(QUESTIONS.map(q => q.q), expected);
  for (const q of QUESTIONS) {
    assert.ok(TEAM.some(p => p.id === q.who), `${q.id} has an owner`);
    assert.ok(q.a.length > 80 && q.evidence.length > 4 && STAGE_ROUTES.includes(q.route), `${q.id} is complete`);
  }
  assert.match(QUESTIONS.find(q => q.id === 'why-shutdown').a, /isolation did that at gate 5/);
  assert.match(QUESTIONS.find(q => q.id === 'pierre-mac').a, /Nothing happens automatically/);
  assert.match(QUESTIONS.find(q => q.id === 'auth').a, /^No\./);
});
