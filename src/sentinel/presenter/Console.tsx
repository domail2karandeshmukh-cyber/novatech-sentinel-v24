import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, AudioLines, CirclePlay, ExternalLink, FastForward, Flag, MessageCircleQuestion, MonitorPlay, Pause, Play,
  RotateCcw, SkipForward, Square, Volume2, WandSparkles, X, ChevronsRight, PanelBottomClose, BellRing, Laptop,
} from 'lucide-react';
import { closeAlert, livePeers, requestSoundCheck, resetEverything, useStore } from '../state/store';
import { usePeers } from '../state/effects';
import { DURATION_LABEL, actApplies, fastForward, presenter, runActVisibly, sceneElapsed, scenesOf, speakerFor, stateCheck, totalElapsed } from './controller';
import { QUESTIONS, showMeta } from './shows';
import { WHAT_IFS } from '../engine/whatif';
import type { SceneAct, TimedScene } from './shows';
import { Avatar, ConfirmButton, clock, personMeta, useNow, useToast } from '../components/kit';
import { GateRail } from '../components/Incident';
import { getPrefs, novaRemoteLine, replayOnSpeakers, sayOnSpeakers, setPrefs, silenceNova, unlockNova } from '../audio/nova';
import { unlockAudio } from '../audio/sfx';
import { macEligibility, scenarioOf } from '../engine/incident';
import { macCan, macSim } from '../state/macsim';
import { useNova } from '../components/Shell';
import { appUrl } from '../env';

function actLabel(a: SceneAct): string {
  switch (a.kind) {
    case 'scenario': return 'Select the scenario';
    case 'start': return 'Start the incident (alert)';
    case 'gate': return a.gate === 'detect' ? 'Take ownership (Karan)' : a.gate === 'assess' ? 'Record cyber assessment' : a.gate === 'impact' ? 'Record financial impact' : a.gate === 'execute' ? 'Execute (simulated)' : a.gate === 'verify' ? 'Record verification' : 'Close the incident';
    case 'approve': return a.step === 'security' ? 'Approve — security (CISO)' : 'Approve — executive (CEO)';
    case 'return': return 'Return for revision';
    case 'unavailable': return `Mark ${personMeta(a.person).first} unavailable`;
    case 'available': return `${personMeta(a.person).first} is available again`;
  }
}

export function useConsoleKeys(enabled = true) {
  const p = useStore(s => s.presenter);
  useEffect(() => {
    if (!enabled) return;
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
      // From the end card, "next" opens questions — an extra clicker press never discards the finished run.
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); presenter.advance(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); presenter.prev(); }
      else if (e.key.toLowerCase() === 'p') { if (p.status === 'paused') presenter.resume(); else presenter.pause(); }
      else if (e.key.toLowerCase() === 'q') { if (p.status === 'qa') presenter.closeQuestions(); else presenter.openQuestion(null); }
      else if (e.key.toLowerCase() === 'm') silenceNova();
      else if (e.key.toLowerCase() === 'b') presenter.beat(1);
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [p.status, enabled]);
}

/** Private presenter console — keep this window on the laptop screen, never on the projector. */
export default function Console() {
  const p = useStore(s => s.presenter);
  const run = useStore(s => s.run);
  const alertOpen = useStore(s => s.alert.open && s.alert.runId === s.run.id && s.run.status !== 'ready');
  const now = useNow(250);
  usePeers();
  useConsoleKeys();
  const toast = useToast();
  const nova = useNova();
  const scenes = scenesOf(p);
  const scene = scenes[p.scene] ?? scenes[0];
  const next = scenes[p.scene + 1] ?? null;
  const speaker = speakerFor(scene, p);
  const nextSpeaker = next ? speakerFor(next, p) : null;
  const left = scene.seconds * 1000 - sceneElapsed(p, now);
  const total = p.duration * 60_000;
  const elapsed = totalElapsed(p, now);
  const audiencePeer = livePeers().find(x => x.role === 'audience');
  const audience = !!audiencePeer;
  const check = stateCheck(scene, run);
  const meta = showMeta(p.showId);
  const [qa, setQa] = useState<string | null>(null);
  const question = QUESTIONS.find(q => q.id === (p.qa.questionId ?? qa)) ?? null;
  useEffect(() => { document.title = 'Presenter console · NOVATECH Sentinel'; }, []);

  const doAct = (a: SceneAct) => { unlockAudio(); unlockNova(); runActVisibly(a, out => { if (out.error) toast('error', out.error); else toast('ok', out.info ?? `${actLabel(a)} — signed.`); }); };
  const openAudience = () => { unlockAudio(); const w = window.open(appUrl('/present/audience'), 'novatech-audience', 'popup=yes,width=1280,height=760'); if (!w) toast('error', 'The browser blocked the audience window. Allow pop-ups for this site, or use “One screen” mode.'); };
  const preparePresentation = async () => {
    const showId = p.showId;
    const duration = p.duration;
    silenceNova();
    resetEverything();
    presenter.configure(showId, duration);
    try {
      const backend = await import('../../enterprise/demo/demoBackend.ts');
      await backend.resetDemoData();
      toast('ok', 'Presentation ready: fresh incident, tasks, persona, rehearsal and case workspace. Your voice settings remain.');
    } catch {
      toast('error', 'Incident reset; case workspace reset failed. Open Settings → Reset demo before presenting.');
    }
  };
  const remainingTone = left < 0 ? 'over' : left < 30_000 ? 'warn' : '';

  return (
    <div className="s-console">
      <header className="s-console-head">
        <div className="s-row" style={{ gap: 12 }}>
          <Link to="/present" className="s-iconbtn" aria-label="Back to Presenter Mode"><ArrowLeft size={18} /></Link>
          <div><span className="s-label">Private console · {meta.title} · {DURATION_LABEL[p.duration]}</span><div className="s-console-status">{p.status === 'idle' ? 'Ready to start' : p.status === 'running' ? 'Presenting' : p.status === 'paused' ? 'Paused' : p.status === 'qa' ? 'Questions' : 'Finished'}</div></div>
        </div>
        <div className="s-row wrap" style={{ gap: 8 }}>
          <span className={`s-chip ${audience ? 'ok' : 'warn'}`}><MonitorPlay size={14} />{audience ? 'Audience window connected' : 'No audience window'}</span>
          {!audience && <button className="s-btn sm" onClick={openAudience}><ExternalLink size={14} />Open audience window</button>}
          {audiencePeer && !audiencePeer.sound && <span className="s-chip warn" title="Browsers allow sound and voice only after a click or key press in that window.">Projector sound off: click “Start the projector” on the projector once</span>}
          {audiencePeer && <button className="s-btn sm" onClick={requestSoundCheck} title="Plays a short tone and a NOVA line on the projector">Test projector sound</button>}
          <span className="s-console-clock s-num" title="Presentation time / planned">{clock(elapsed)} <small>/ {clock(total)}</small></span>
        </div>
      </header>

      <div className="s-console-grid">
        <nav className="s-console-outline" aria-label="Scenes">
          <span className="s-label">Run of show · {scenes.length} scenes</span>
          <ol>{scenes.map((s, i) => (
            <li key={s.id + i}><button className={`${i === p.scene ? 'now' : ''} ${i < p.scene ? 'done' : ''}`} onClick={() => presenter.jump(i)} aria-current={i === p.scene ? 'step' : undefined}>
              <span className="n s-num">{i + 1}</span><span className="t"><b>{s.title}</b><small>{personMeta(speakerFor(s, p)).first} · {Math.round(s.seconds)} s</small></span>
            </button></li>
          ))}</ol>
          <div className="s-console-gates"><span className="s-label">Incident · {scenarioOf(run).ref}</span><GateRail run={run} compact /></div>
        </nav>

        <main className="s-console-main">
          {p.status === 'qa' && (
            <section className="s-console-qa" aria-label="Question on the projector">
              <div className="s-row between wrap" style={{ gap: 10 }}>
                <span className="s-label"><MessageCircleQuestion size={14} /> Questions — the show is paused</span>
                <button className="s-btn primary" onClick={() => { presenter.closeQuestions(); setQa(null); }}>{p.qa.returnTo?.done ? 'Back to the end card' : `Resume at scene ${(p.qa.returnTo?.scene ?? p.scene) + 1}`}<ArrowRight size={15} /></button>
              </div>
              {question
                ? <><h2 className="s-h2">{question.q}</h2><p className="s-qa-by"><Avatar id={question.who} size="sm" /><b>{personMeta(question.who).name}</b> answers</p><p>{question.a}</p><small className="s-faint">Evidence on the projector: {question.evidence}</small></>
                : <p className="s-small" style={{ margin: 0 }}>Pick a question on the right to put its evidence on the projector, or answer freely.</p>}
            </section>
          )}
          <section className="s-console-now">
            <div className="s-row" style={{ gap: 14 }}>
              <Avatar id={speaker} size="xl" />
              <div><span className="s-label">Now speaking · {scene.segment}</span><div className="s-console-speaker">{personMeta(speaker).name}</div><span className="s-small">{personMeta(speaker).role}</span></div>
            </div>
            <div className={`s-console-timer ${remainingTone}`} role="timer" aria-label="Scene time remaining"><span className="s-label">Scene time</span><b className="s-num">{left >= 0 ? clock(left) : `+${clock(-left)}`}</b><small>of {clock(scene.seconds * 1000)}</small></div>
          </section>
          <h1 className="s-h1 s-console-title"><span className="s-num s-faint">{p.scene + 1}.</span> {scene.title}</h1>
          {check.behind && p.status !== 'idle' && (
            <div className="s-console-behind" role="status">
              <span><b>The incident hasn’t reached this scene yet.</b> {check.message} Do the step live (see “Click”), use “Do it for me”, or fast-forward. Skipped gates never complete on their own.</span>
              <FastForwardButton scene={scene} />
            </div>
          )}
          {next?.id === 'macApprove' && p.status !== 'idle' && <p className="s-console-notice-final" role="note"><b>Questions with evidence on screen?</b> Take them now (Q): the Mac powers off at the end of the next scene. After that, every answer is in the phone script.</p>}
          <div className="s-console-say"><span className="s-label">Say this</span><p>{scene.say}</p></div>
          <div className="s-keywords" aria-label="Five keywords">{scene.keywords.map(k => <span key={k}>{k}</span>)}</div>
          <div className="s-console-cols">
            <div><span className="s-label">Show</span><p>{scene.show}</p></div>
            <div><span className="s-label">Click</span><p>{scene.click}</p></div>
            <div><span className="s-label">Expected result</span><p>{scene.expected}</p></div>
            <div><span className="s-label">Why it matters</span><p>{scene.why}</p></div>
          </div>
          <div className="s-console-q"><span className="s-label"><MessageCircleQuestion size={14} /> Likely professor question</span><b>{scene.question.q}</b><p>{scene.question.a}</p></div>
          <p className="s-small"><b>If something fails:</b> {scene.fallback}</p>
          {next && nextSpeaker && <div className="s-console-next"><span className="s-label">Up next</span><span className="s-row" style={{ gap: 10 }}><Avatar id={nextSpeaker} /><b>{personMeta(nextSpeaker).name}</b><span className="s-small">— {next.title}</span></span>{scene.handoff && <p className="s-small" style={{ margin: '6px 0 0' }}>Hand-off: “{scene.handoff}”</p>}</div>}
        </main>

        <aside className="s-console-side">
          <section className="s-console-ctl" aria-label="Presentation controls">
            {p.status === 'idle'
              ? <div className="s-stack"><ConfirmButton className="s-btn block" confirmLabel="Click again to reset ALL simulated data" onConfirm={() => { void preparePresentation(); }}><RotateCcw size={17} />Reset &amp; prepare presentation</ConfirmButton>
                  <button className="s-btn primary lg block" onClick={() => { unlockAudio(); unlockNova(); presenter.start(); }}><Play size={18} fill="currentColor" />Start presentation</button>
                  <p className="s-small">Reset clears practice incidents, approvals, timers and simulated workspace changes. Real Mac pairing is separate: revoke it on Karan’s Mac before rehearsal.</p></div>
              : p.status === 'done' ? <div className="s-ctl-grid">
                <button className="s-btn primary lg" style={{ gridColumn: '1 / -1' }} onClick={() => presenter.openQuestion(null)}><MessageCircleQuestion size={18} />Open questions</button>
                <button className="s-btn" onClick={presenter.prev}><ArrowLeft size={16} />Last scene</button>
                <ConfirmButton confirmLabel="Click again: discards this run" onConfirm={() => { unlockAudio(); unlockNova(); presenter.start(); }}><RotateCcw size={16} />Start again</ConfirmButton>
              </div>
              : <div className="s-ctl-grid">
                <button className="s-btn lg" onClick={presenter.prev}><ArrowLeft size={18} />Previous</button>
                <button className="s-btn primary lg" onClick={presenter.next}>Next<ArrowRight size={18} /></button>
                {p.status === 'paused' ? <button className="s-btn" onClick={presenter.resume}><Play size={16} />Resume</button> : <button className="s-btn" onClick={presenter.pause} disabled={p.status === 'qa'}><Pause size={16} />Pause</button>}
                <button className="s-btn" onClick={presenter.replay}><RotateCcw size={16} />Replay scene</button>
                <button className="s-btn" onClick={presenter.skip}><SkipForward size={16} />Skip</button>
                <button className="s-btn" onClick={() => presenter.beat(1)}><ChevronsRight size={16} />Next spotlight</button>
                <ConfirmButton confirmLabel="Click again: fresh incident, scene 1" onConfirm={presenter.restartDemo}><Flag size={16} />Restart demo</ConfirmButton>
                <ConfirmButton className="s-btn ghost" confirmLabel="Click again to exit" onConfirm={presenter.exit}><X size={16} />Exit</ConfirmButton>
              </div>}
            <p className="s-small" style={{ margin: '8px 0 0' }}>Keys: → / Space next · ← back · P pause · Q questions · B spotlight · M silence NOVA</p>
          </section>

          {alertOpen && (
            <section className="s-console-alert" aria-label="Alert on the projector">
              <span className="s-label"><BellRing size={14} /> The ATTENTION overlay is on the projector</span>
              <button className="s-btn danger block" onClick={() => closeAlert()}>Acknowledge on the projector</button>
              <p className="s-small" style={{ margin: 0 }}>Moving to the next scene also acknowledges it.</p>
            </section>
          )}

          <section className="s-console-box" aria-label="Drive the live workflow">
            <span className="s-label"><WandSparkles size={14} /> Do it for me — same rules as a click</span>
            <p className={`s-small ${check.ok ? 's-teal' : check.behind ? 's-amber' : ''}`} style={{ margin: '6px 0' }}>{check.message}</p>
            {p.notice && <p className="s-small s-console-notice">{p.notice}</p>}
            {check.behind && <FastForwardButton scene={scene} block />}
            <div className="s-stack" style={{ marginTop: 8 }}>{(scene.acts ?? []).map((a, i) => { const ap = actApplies(a, run); return <button key={i} className="s-btn sm" disabled={!ap.ok || !!p.fill} title={ap.why} onClick={() => doAct(a)}><CirclePlay size={14} />{actLabel(a)}{!ap.ok && ap.why && <small className="s-faint"> — {ap.why}</small>}</button>; })}
              {p.fill && <span className="s-small s-teal" role="status">Filling the form on the projector, then signing…</span>}{!(scene.acts ?? []).length && <span className="s-small">This scene has no workflow action — talk and point.</span>}</div>
            <label className="s-check" style={{ marginTop: 10 }}><input type="checkbox" checked={p.keepInStep} onChange={e => presenter.setKeepInStep(e.target.checked)} /><span>Auto catch-up on Next <small className="s-faint">— off by default. When on, Next records the gates you skipped as their owners, labelled as fast-forward.</small></span></label>
          </section>

          {scene.route === '/endpoint' && <MacRehearsal />}

          <section className="s-console-box" aria-label="NOVA">
            <span className="s-label"><AudioLines size={14} /> NOVA co-presenter</span>
            <div className="s-seg" style={{ marginTop: 6 }}>{(['auto', 'manual', 'off'] as const).map(m => <button key={m} aria-pressed={p.narration === m} onClick={() => presenter.setNarration(m)}>{m === 'auto' ? 'Automatic' : m === 'manual' ? 'On cue' : 'Off'}</button>)}</div>
            <div className="s-row wrap" style={{ marginTop: 8, gap: 6 }}>
              <button className="s-btn sm" onClick={() => { unlockNova(); if (!getPrefs().enabled) setPrefs({ enabled: true }); sayOnSpeakers(scene.nova ?? scene.say, { force: true }); }}><Volume2 size={14} />{scene.nova ? 'Speak cue' : 'Read the script'}</button>
              <button className="s-btn sm" onClick={replayOnSpeakers}><RotateCcw size={14} />Replay</button>
              <button className="s-btn sm" onClick={silenceNova}><Square size={12} />Silence</button>
            </div>
            <p className="s-small s-voice-q" style={{ margin: '8px 0 0' }}>Voice: <b>{nova.voiceName || 'browser default'}</b><span className={`q ${nova.quality}`}>{nova.quality === 'natural' ? 'natural' : nova.quality === 'enhanced' ? 'enhanced' : 'standard'}</span></p>
            {nova.advice && <p className="s-small s-amber" style={{ margin: '4px 0 0' }}>{nova.advice}</p>}
            {!getPrefs().enabled && <p className="s-small" style={{ margin: '4px 0 0' }}>NOVA’s voice is off; it switches on when the presentation starts (unless narration is Off).</p>}
            <label className="s-check" style={{ marginTop: 8 }}><input type="checkbox" checked={p.audienceCaptions} onChange={e => presenter.setCaptions(e.target.checked)} /><span>Captions on the projector</span></label>
            {nova.caption ? <p className="s-small" style={{ margin: '6px 0 0' }}>Saying: “{nova.caption.text}”</p>
              : novaRemoteLine() && <p className="s-small" style={{ margin: '6px 0 0' }}>On the projector: “{novaRemoteLine()}”</p>}
          </section>

          <section className="s-console-box" aria-label="Professor questions">
            <span className="s-label"><MessageCircleQuestion size={14} /> Professor Q&amp;A</span>
            {question && p.status !== 'qa' && <div className="s-qa-answer"><b>{question.q}</b><p className="s-qa-by"><Avatar id={question.who} size="sm" />{personMeta(question.who).first} answers</p><p>{question.a}</p><small>Evidence on the projector: {question.evidence}</small></div>}
            <div className="s-challenge">
              <span className="s-label">Challenge the controls — the engine answers live, nothing is recorded</span>
              <div className="s-challenge-grid">{WHAT_IFS.map(w => <button key={w.id} className={`s-btn sm ${p.whatIf === w.id ? 'primary' : ''}`} aria-pressed={p.whatIf === w.id} onClick={() => presenter.challenge(p.whatIf === w.id ? null : w.id)}>{w.label}</button>)}</div>
            </div>
            <ul className="s-qa-list">{QUESTIONS.map(q => <li key={q.id}><button className={question?.id === q.id ? 'on' : ''} aria-pressed={question?.id === q.id} onClick={() => { setQa(q.id); presenter.openQuestion(q.id); }}><span>{q.q}</span><small><Avatar id={q.who} size="sm" />{personMeta(q.who).first}</small></button></li>)}</ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

/** Labelled fast-forward. Switching to another scenario discards the current run, so that case asks for a second click. */
function FastForwardButton({ scene, block }: { scene: TimedScene; block?: boolean }) {
  const toast = useToast();
  const run = useStore(s => s.run);
  const go = () => { const log = fastForward(scene); toast(log.length ? 'ok' : 'error', log.length ? `Fast-forwarded: ${log.length} step(s), labelled in the ledger.` : 'Nothing to fast-forward.'); };
  const switching = !!scene.needs && scene.needs.scenario !== run.scenarioId && run.status !== 'ready';
  const label = block ? 'Fast-forward to this scene (labelled)' : 'Fast-forward (labelled)';
  return switching
    ? <ConfirmButton className={`s-btn sm ${block ? 'block' : ''}`} confirmLabel={`Click again: discards ${scenarioOf(run).ref}`} onConfirm={go}><FastForward size={14} />{label}</ConfirmButton>
    : <button className={`s-btn sm ${block ? 'block' : ''}`} onClick={go}><FastForward size={14} />{label}</button>;
}

/** Drives the simulated final step (power-off for re-imaging) shown on the projector; the real one runs on Pierre's laptop and Karan's Mac. */
function MacRehearsal() {
  const mac = useStore(s => s.mac);
  const run = useStore(s => s.run);
  const now = useNow(500);
  const eligible = macEligibility(run).ok;
  const can = macCan(mac, eligible, now);
  const status = mac.phase === 'idle' ? (eligible ? 'Ready. Karan opens pairing first.' : 'Locked until the ransomware incident is closed.')
    : mac.phase === 'code' ? `Code ${mac.code} on screen, expires in ${clock(mac.codeUntil - now)}.`
      : mac.phase === 'paired' ? `Pierre is paired. Session ${clock(Math.max(0, mac.sessionUntil - now))} left.`
        : mac.phase === 'pending' ? `The approval window is on the projector: ${Math.max(0, Math.ceil((mac.deadline - now) / 1000))} s before automatic rejection.`
          : mac.result === 'approved' ? 'Authorized (simulated). Nothing shuts down.' : mac.result === 'timeout' ? 'Timed out. The Mac stays on.' : 'Rejected. The Mac stays on.';
  return (
    <section className="s-console-box" aria-label="Mac rehearsal">
      <span className="s-label"><Laptop size={14} /> Mac rehearsal on the projector (simulated)</span>
      <p className="s-small" role="status" style={{ margin: '6px 0' }}>{status}</p>
      <div className="s-stack">
        <button className="s-btn sm" disabled={!can.open} onClick={macSim.open}>1. Open pairing (Karan)</button>
        <button className="s-btn sm" disabled={!can.pair} onClick={macSim.pair}>2. Pair from Windows (Pierre)</button>
        <button className="s-btn sm" disabled={!can.request} onClick={macSim.request}>3. Send the request (Pierre)</button>
        <div className="s-ctl-pair"><button className="s-btn sm" disabled={!can.decide} onClick={() => macSim.decide('rejected')}>Reject</button><button className="s-btn sm danger" disabled={!can.decide} onClick={() => macSim.decide('approved')}>Authorize</button></div>
        <button className="s-btn sm ghost" disabled={!can.revoke} onClick={macSim.revoke}>Revoke access</button>
      </div>
      <p className="s-small" style={{ margin: '8px 0 0' }}>The real final step runs on Pierre’s laptop and Karan’s Mac. This rehearsal never reaches a device; leave the approval window alone to show the 30-second timeout.</p>
    </section>
  );
}

/** Single-screen dock: compact controls + short script. Visible to the room if the screen is mirrored. */
export function PresenterDock({ onHide }: { onHide: () => void }) {
  const p = useStore(s => s.presenter);
  const now = useNow(500);
  useConsoleKeys(false);
  const scenes = scenesOf(p);
  const scene: TimedScene = scenes[p.scene] ?? scenes[0];
  const left = scene.seconds * 1000 - sceneElapsed(p, now);
  return (
    <div className="s-dock" role="region" aria-label="Presenter dock">
      <div className="s-dock-warn">Presenter dock — visible to the audience if your screen is mirrored. For private notes use two windows or the phone script.</div>
      <div className="s-dock-row">
        <button className="s-iconbtn" onClick={presenter.prev} aria-label="Previous scene"><ArrowLeft size={18} /></button>
        {p.status === 'qa' ? <>
          <button className="s-btn primary" onClick={presenter.closeQuestions}><Play size={15} />{p.qa.returnTo?.done ? 'Back to the end card' : `Resume scene ${(p.qa.returnTo?.scene ?? p.scene) + 1}`}</button>
          <label className="s-dock-q"><span className="s-sr">Show the evidence for a question</span>
            <select className="s-input" value={p.whatIf ? `whatif:${p.whatIf}` : p.qa.questionId ?? ''} onChange={e => { const v = e.target.value; if (v.startsWith('whatif:')) presenter.challenge(v.slice(7) as (typeof WHAT_IFS)[number]['id']); else { presenter.challenge(null); presenter.openQuestion(v || null); } }}>
              <option value="">Pick a question to show its evidence…</option>
              <optgroup label="Professor questions">{QUESTIONS.map(q => <option key={q.id} value={q.id}>{q.q} — {personMeta(q.who).first}</option>)}</optgroup>
              <optgroup label="Challenge the controls (nothing is recorded)">{WHAT_IFS.map(w => <option key={w.id} value={`whatif:${w.id}`}>{w.question}</option>)}</optgroup>
            </select>
          </label>
        </> : p.status === 'done' ? <>
          <button className="s-btn primary" onClick={() => presenter.openQuestion(null)}><MessageCircleQuestion size={15} />Questions</button>
          <ConfirmButton className="s-btn" confirmLabel="Click again: discards this run" onConfirm={() => presenter.start()}><RotateCcw size={15} />Start again</ConfirmButton>
        </> : <>
          {p.status === 'idle' ? <button className="s-btn primary" onClick={() => presenter.start()}><Play size={15} />Start</button> : p.status === 'paused' ? <button className="s-btn" onClick={presenter.resume}><Play size={15} />Resume</button> : <button className="s-btn" onClick={presenter.pause}><Pause size={15} />Pause</button>}
          <button className="s-btn primary" onClick={presenter.advance}>Next<ArrowRight size={15} /></button>
        </>}
        {p.status !== 'qa' && <span className="s-dock-script"><b>{scene.title}</b> — {scene.keywords.join(' · ')}</span>}
        {p.status !== 'qa' && p.status !== 'done' && <span className={`s-num s-dock-time ${left < 30_000 ? 's-amber' : ''}`}>{left >= 0 ? clock(left) : `+${clock(-left)}`}</span>}
        {p.status !== 'qa' && p.status !== 'done' && <button className="s-btn sm" onClick={() => presenter.openQuestion(null)}><MessageCircleQuestion size={14} />Q&amp;A</button>}
        <button className="s-iconbtn" onClick={onHide} aria-label="Hide dock (N)"><PanelBottomClose size={18} /></button>
      </div>
    </div>
  );
}
