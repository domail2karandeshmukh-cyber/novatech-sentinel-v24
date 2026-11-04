/**
 * Presenter controller: every presentation control maps to a state change in the shared store,
 * so the audience window, the private console and a single-screen stage always agree.
 */
import { dispatch, getState, setPersona, setPresenter, setScenario, resetRun, closeAlert } from '../state/store';
import { gateActor, scenarioOf } from '../engine/incident';
import type { Outcome, Run } from '../engine/incident';
import { GATES, gateIndex, scenarioById } from '../data/scenarios';
import type { GateKey } from '../data/scenarios';
import { buildShow, showMeta } from './shows';
import type { Scene, SceneAct, TimedScene } from './shows';
import type { Duration, PresenterState, ShowId } from './model';
import type { WhatIfId } from '../engine/whatif';
import { DEFAULT_RELAY } from './model';
import { DEFAULT_RELAY as RELAY_SEGMENTS } from '../data/team';
import type { PersonId } from '../data/team';
import { play } from '../audio/sfx';
import { approvalRecord, playbookRecord } from '../data/forms';
import { getPrefs, setPrefs, silenceNova } from '../audio/nova';

export const scenesOf = (p: PresenterState): TimedScene[] => buildShow(p.showId, p.duration);
export const currentScene = (p: PresenterState): TimedScene | null => scenesOf(p)[p.scene] ?? null;

/** Map a scene's segment to the editable speaking relay (default classroom order). */
export function speakerFor(scene: Scene, p: PresenterState): PersonId {
  const slots = RELAY_SEGMENTS.map((r, i) => ({ ...r, i }));
  const slot = scene.segment === 'Introduction' ? 0 : scene.segment === 'Final demonstration and conclusion' ? 6 : slots.find(s => s.segment === scene.segment)?.i;
  return slot === undefined ? scene.speaker : (p.relay[slot] ?? DEFAULT_RELAY[slot]);
}

const now = () => Date.now();

export function sceneElapsed(p: PresenterState, at = now()): number {
  if (!p.sceneStartedAt) return 0;
  const pausedNow = p.status === 'paused' || p.status === 'qa' ? at - (p.pausedAt ?? at) : 0;
  return Math.max(0, at - p.sceneStartedAt - p.scenePausedTotal - pausedNow);
}
export function totalElapsed(p: PresenterState, at = now()): number {
  if (!p.startedAt) return 0;
  const pausedNow = p.status === 'paused' || p.status === 'qa' ? at - (p.pausedAt ?? at) : 0;
  return Math.max(0, at - p.startedAt - p.pausedTotal - pausedNow);
}

/**
 * On entering a scene: acknowledge a lingering alert, optionally catch the incident up (opt-in "auto catch-up",
 * recorded as the rightful owners and labelled as presenter fast-forward), then run the scene's opening actions
 * (the synthetic alert). Without the opt-in, skipped gates stay open and the console offers an explicit,
 * labelled fast-forward. Going backwards never rewrites the ledger.
 */
function syncScene(idx: number) {
  const p = getState().presenter;
  const scene = scenesOf(p)[idx];
  if (!scene) return;
  if (getState().alert.open && !(scene.enter ?? []).some(a => a.kind === 'start')) closeAlert();
  const notes: string[] = [];
  const before = stateCheck(scene, getState().run);
  if (p.keepInStep && !before.ok && before.behind) {
    const log = fastForward(scene);
    if (log.length) notes.push(`Caught up ${log.length} step${log.length === 1 ? '' : 's'} to match “${scene.title}” (labelled as fast-forward in the ledger).`);
  }
  // Opening actions only select the scenario and inject the synthetic signal (the alert); they never sign a gate.
  if (scene.enter && stateCheck(scene, getState().run).ok) {
    for (const a of scene.enter) {
      if (a.kind !== 'scenario' && a.kind !== 'start') continue;
      const out = runAct(a); if (out.error) { notes.push(out.error); break; }
    }
  }
  setPresenter(x => ({ ...x, notice: notes.length ? notes.join(' ') : null }));
}

function go(scene: number, beat = 0) {
  setPresenter(p => {
    const list = scenesOf(p);
    const idx = Math.max(0, Math.min(list.length - 1, scene));
    const t = now();
    const resumed = p.status === 'paused' ? { pausedTotal: p.pausedTotal + (t - (p.pausedAt ?? t)), pausedAt: null } : {};
    return { ...p, ...resumed, status: p.status === 'idle' || p.status === 'done' ? 'running' : p.status === 'qa' ? 'running' : p.status === 'paused' ? 'running' : p.status, scene: idx, beat: Math.min(beat, Math.max(0, list[idx].beats.length - 1)), sceneStartedAt: t, scenePausedTotal: 0, startedAt: p.startedAt ?? t, qa: { questionId: null, returnTo: null } };
  });
  play('scene');
  syncScene(getState().presenter.scene);
}

export const presenter = {
  configure(showId: ShowId, duration: Duration) { setPresenter(p => ({ ...p, showId, duration, scene: 0, beat: 0, status: p.status === 'running' ? p.status : 'idle' })); },
  setRelay(relay: PersonId[]) { setPresenter(p => ({ ...p, relay })); },
  setNarration(narration: PresenterState['narration']) { setPresenter(p => ({ ...p, narration })); if (narration === 'off') silenceNova(); },
  setCaptions(on: boolean) { setPresenter(p => ({ ...p, audienceCaptions: on })); },
  setKeepInStep(on: boolean) { setPresenter(p => ({ ...p, keepInStep: on, notice: null })); },
  /** Start from the first scene with a fresh incident for the show's scenario. */
  start(freshIncident = true) {
    const p = getState().presenter;
    // Presenting means NOVA speaks (every window follows): the console's "Off" narration is the way to keep it quiet.
    if (p.narration !== 'off' && !getPrefs().enabled) setPrefs({ enabled: true });
    const meta = showMeta(p.showId);
    if (freshIncident) { if (meta.scenario && meta.scenario !== getState().run.scenarioId) setScenario(meta.scenario); else resetRun(); }
    const t = now();
    setPresenter(x => ({ ...x, status: 'running', scene: 0, beat: 0, startedAt: t, sceneStartedAt: t, pausedAt: null, pausedTotal: 0, scenePausedTotal: 0, qa: { questionId: null, returnTo: null }, notice: null }));
    play('start');
    syncScene(0);
  },
  next() {
    const p = getState().presenter; const list = scenesOf(p);
    if (p.status === 'done') return; // the end card is final: extra clicker presses never restart or reset anything
    if (p.scene >= list.length - 1) { setPresenter(x => ({ ...x, status: 'done' })); play('closed'); return; }
    go(p.scene + 1);
  },
  /** Clicker "next" from any state: start from the title card, questions from the end card, resume from questions. */
  advance() {
    const st = getState().presenter.status;
    if (st === 'idle') presenter.start();
    else if (st === 'done') presenter.openQuestion(null);
    else if (st === 'qa') presenter.closeQuestions();
    else presenter.next();
  },
  prev() { const p = getState().presenter; go(Math.max(0, p.scene - 1)); },
  jump(i: number) { go(i); },
  replay() { const p = getState().presenter; go(p.scene, 0); },
  skip() { presenter.next(); },
  pause() { setPresenter(p => p.status === 'running' ? { ...p, status: 'paused', pausedAt: now() } : p); silenceNova(); },
  resume() { setPresenter(p => { if (p.status !== 'paused') return p; const t = now(); const d = t - (p.pausedAt ?? t); return { ...p, status: 'running', pausedAt: null, pausedTotal: p.pausedTotal + d, scenePausedTotal: p.scenePausedTotal + d }; }); },
  exit() { setPresenter(p => ({ ...p, status: 'idle', startedAt: null, sceneStartedAt: null, pausedAt: null, pausedTotal: 0, scenePausedTotal: 0, qa: { questionId: null, returnTo: null } })); silenceNova(); },
  restartDemo() { resetRun(); closeAlert(); presenter.start(false); },
  beat(delta: number) { setPresenter(p => { const sc = scenesOf(p)[p.scene]; if (!sc) return p; return { ...p, beat: Math.max(0, Math.min(sc.beats.length - 1, p.beat + delta)) }; }); },
  /** Professor Q&A: freeze clocks, remember the exact place, open evidence; resume returns to the same scene and beat. */
  openQuestion(questionId: string | null) {
    setPresenter(p => {
      const t = now();
      const pausedAt = p.status === 'running' ? t : p.pausedAt ?? t;
      return { ...p, status: 'qa', pausedAt, qa: { questionId, returnTo: p.qa.returnTo ?? { scene: p.scene, beat: p.beat, done: p.status === 'done' } } };
    });
    silenceNova();
  },
  /** Professor's what-if on the projector (opens questions if needed); null clears it. */
  challenge(id: WhatIfId | null) {
    if (id && getState().presenter.status !== 'qa') presenter.openQuestion(null);
    setPresenter(p => ({ ...p, whatIf: id }));
  },
  closeQuestions() {
    setPresenter(p => {
      if (p.status !== 'qa') return p;
      const t = now(); const d = t - (p.pausedAt ?? t);
      const back = p.qa.returnTo ?? { scene: p.scene, beat: p.beat };
      return { ...p, status: back.done ? 'done' : p.startedAt ? 'running' : 'idle', pausedAt: null, pausedTotal: p.pausedTotal + d, scenePausedTotal: p.scenePausedTotal + d, scene: back.scene, beat: back.beat, qa: { questionId: null, returnTo: null }, whatIf: null };
    });
  },
};

/** Where the incident stands relative to what the scene expects. */
export function stateCheck(scene: Scene, run: Run): { ok: boolean; behind: boolean; message: string } {
  if (!scene.needs) return { ok: true, behind: false, message: 'No incident state required.' };
  const want = scene.needs;
  if (run.scenarioId !== want.scenario) return { ok: false, behind: true, message: `This scene uses ${scenarioById(want.scenario).ref}; the current incident is ${scenarioOf(run).ref}.` };
  const pos = run.status === 'ready' ? -1 : run.status === 'closed' ? GATES.length : run.gate;
  const target = want.gate === 'ready' ? -1 : want.gate === 'closed' ? GATES.length : gateIndex(want.gate as GateKey);
  if (pos === target) return { ok: true, behind: false, message: 'The incident is exactly where this scene starts.' };
  if (pos < target) return { ok: false, behind: true, message: `The incident is behind this scene (${run.status === 'ready' ? 'not started' : `at ${GATES[pos]?.name ?? 'start'}`}).` };
  return { ok: false, behind: false, message: 'The incident is already past this scene’s starting point — you can narrate the result.' };
}

const FF = ' [Recorded in presenter fast-forward]';

/** Execute one scene action through the engine as the rightful person (same rules as a manual click). */
export function runAct(act: SceneAct): Outcome | { error?: string; info?: string } {
  const st = getState();
  const run = st.run;
  const s = scenarioOf(run);
  switch (act.kind) {
    case 'scenario':
      if (run.scenarioId === act.scenario) return { info: `${scenarioById(act.scenario).ref} is already selected.` };
      if (run.status !== 'ready') return { error: `${s.ref} is in progress. Use “Restart demo” to switch to ${scenarioById(act.scenario).ref} — the current run would be discarded.` };
      setScenario(act.scenario); return { info: `${scenarioById(act.scenario).ref} selected.` };
    case 'start': return dispatch({ type: 'start' });
    case 'gate': {
      const actor = gateActor(run, act.gate); setPersona(actor);
      const rec = playbookRecord(run.scenarioId, act.gate, s.notes[act.gate]);
      return dispatch({ type: 'record', gate: act.gate, actor, note: rec.note, consent: true, fields: rec.fields });
    }
    case 'approve': case 'return': {
      const step = run.approvals.find(a => a.id === act.step && a.status === 'pending') ?? run.approvals.find(a => a.status === 'pending');
      if (!step) return { error: 'No approval is pending right now.' };
      setPersona(step.acting);
      const rationale = act.kind === 'approve' ? (step.id === 'security' ? s.notes.security : s.notes.executive) ?? '' : 'Returned for revision: narrow the scope to the affected asset only and resubmit with evidence.';
      const rec = approvalRecord(run.scenarioId, step.id, act.kind === 'approve' ? 'approve' : 'return', rationale);
      return dispatch({ type: 'decide', step: step.id, actor: step.acting, decision: act.kind === 'approve' ? 'approve' : 'return', note: rec.note, fields: rec.fields });
    }
    case 'unavailable': return dispatch({ type: 'unavailable', person: act.person });
    case 'available': return dispatch({ type: 'available', person: act.person });
  }
}

/**
 * "Do it for me" as the audience sees it: the person takes over, their form fills itself on the projector, then it is
 * signed — with exactly the playbook values that were shown. Other actions run at once.
 */
export function runActVisibly(act: SceneAct, done: (out: ReturnType<typeof runAct>) => void) {
  const run = getState().run;
  if (getState().presenter.fill) return; // one at a time
  const gateKey = act.kind === 'gate' ? act.gate : act.kind === 'approve' ? 'authorize' : null;
  const applies = actApplies(act, run);
  if (!gateKey || !applies.ok) { done(runAct(act)); return; }
  if (act.kind === 'gate') setPersona(gateActor(run, act.gate));
  else if (act.kind === 'approve') { const want = act.step; const step = run.approvals.find(a => a.id === want && a.status === 'pending') ?? run.approvals.find(a => a.status === 'pending'); if (step) setPersona(step.acting); }
  setPresenter(p => ({ ...p, fill: { gate: gateKey, at: Date.now() } }));
  const quick = typeof document !== 'undefined' && (document.documentElement.dataset.sMotion === 'reduce' || (document.documentElement.dataset.sMotion !== 'full' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  window.setTimeout(() => { setPresenter(p => ({ ...p, fill: null })); done(runAct(act)); }, quick ? 700 : 2000);
}

/** Whether a "Do it for me" action can run now; the console disables the others and says why. */
export function actApplies(act: SceneAct, run: Run): { ok: boolean; why?: string } {
  const gateKey = run.status === 'active' ? GATES[run.gate]?.key : null;
  switch (act.kind) {
    case 'scenario': return run.status === 'ready' && run.scenarioId !== act.scenario ? { ok: true } : { ok: false, why: run.scenarioId === act.scenario ? 'Already selected.' : 'A run is in progress.' };
    case 'start': return run.status === 'ready' ? { ok: true } : { ok: false, why: 'Already started.' };
    case 'gate': return gateKey === act.gate ? { ok: true } : { ok: false, why: run.status === 'closed' ? 'Incident closed.' : 'Not the current gate.' };
    case 'approve': case 'return': return gateKey === 'authorize' && run.approvals.some(a => a.status === 'pending') ? { ok: true } : { ok: false, why: 'No approval pending.' };
    case 'unavailable': return run.unavailable.includes(act.person) ? { ok: false, why: 'Already unavailable.' } : { ok: true };
    case 'available': return run.unavailable.includes(act.person) ? { ok: true } : { ok: false, why: 'Already available.' };
  }
}

/** Bring the incident to the scene's starting point, recording each gate as its rightful owner, labelled as fast-forward. */
export function fastForward(scene: Scene): string[] {
  const log: string[] = [];
  if (!scene.needs) return log;
  const want = scene.needs;
  if (getState().run.scenarioId !== want.scenario) { setScenario(want.scenario); log.push(`Switched to ${scenarioById(want.scenario).ref}.`); }
  const targetIdx = want.gate === 'ready' ? -1 : want.gate === 'closed' ? GATES.length : gateIndex(want.gate as GateKey);
  if (targetIdx === -1) return log;
  for (let guard = 0; guard < 20; guard++) {
    const run = getState().run;
    const pos = run.status === 'ready' ? -1 : run.status === 'closed' ? GATES.length : run.gate;
    if (pos >= targetIdx) break;
    const s = scenarioOf(run);
    let out: Outcome;
    if (run.status === 'ready') { out = dispatch({ type: 'start' }); closeAlert(); }
    else {
      const g = GATES[run.gate].key;
      if (g === 'authorize') {
        const step = run.approvals.find(a => a.status === 'pending');
        if (!step) { log.push('Authorization is blocked (an approver is unavailable). Resolve it on the incident page.'); break; }
        const rec = approvalRecord(run.scenarioId, step.id, 'approve', `${(step.id === 'security' ? s.notes.security : s.notes.executive) ?? 'Approved.'}${FF}`);
        out = dispatch({ type: 'decide', step: step.id, actor: step.acting, decision: 'approve', note: rec.note, fields: rec.fields });
      } else {
        const gate = g as Exclude<GateKey, 'authorize'>;
        const rec = playbookRecord(run.scenarioId, gate, `${s.notes[gate]}${FF}`);
        out = dispatch({ type: 'record', gate, actor: gateActor(run, gate), note: rec.note, consent: true, fields: rec.fields });
      }
    }
    if (out.error) { log.push(out.error); break; }
    log.push(out.info ?? 'Recorded.');
  }
  return log;
}

export { RELAY_SEGMENTS };
export const DURATION_LABEL: Record<Duration, string> = { 2: '2 min', 5: '5 min', 8: '8 min', 12: '12 min', 20: '20 min', 30: '30 min' };
