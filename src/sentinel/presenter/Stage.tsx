import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Captions, CircleX, Maximize2, MessageCircleQuestion, Pause, PanelBottomOpen, PanelBottomClose, ShieldCheck, VolumeX } from 'lucide-react';
import { getState, useStore } from '../state/store';
import { isAudioOwner } from '../state/store';
import { STAGE_PAGES } from '../routes';
import { CaptionBar, CriticalAlert, SimPowerOff } from '../components/Overlays';
import { Avatar, BrandMark, clock, personMeta, Sim, useNow } from '../components/kit';
import { presenter, scenesOf, sceneElapsed, speakerFor, totalElapsed } from './controller';
import { QUESTIONS, showMeta } from './shows';
import type { PersonId } from '../data/team';
import { GATES } from '../data/scenarios';
import { blankRun, exposureNow, money, scenarioOf, verifierApproved, verifyLedger } from '../engine/incident';
import { WHAT_IFS, whatIf } from '../engine/whatif';
import type { WhatIfId } from '../engine/whatif';
import type { Run } from '../engine/incident';
import { getPrefs, say, setPrefs, stopNova, unlockNova } from '../audio/nova';
import { CUE_CAPTION, onCue, play, sfxReady, unlockAudio } from '../audio/sfx';
import type { Cue } from '../audio/sfx';
import { PresenterDock } from './Console';
import { OnStage } from './stageContext';
import { useNova } from '../components/Shell';

/** Projector view: the real screens, one spotlight, large type, the speaker, progress — never private notes. */
export default function Stage({ single }: { single?: boolean }) {
  const p = useStore(s => s.presenter);
  const now = useNow(500);
  const scenes = scenesOf(p);
  const scene = scenes[p.scene] ?? scenes[0];
  const meta = showMeta(p.showId);
  const speaker = speakerFor(scene, p);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [dock, setDock] = useState(true);
  const novaSpeaking = !!useNova().caption;
  const cue = useStageCue();
  const [fullscreen, setFullscreen] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  useEffect(() => { const f = () => setFullscreen(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  const question = p.qa.questionId ? QUESTIONS.find(q => q.id === p.qa.questionId) ?? null : null;
  const route = p.status === 'qa' && question ? question.route : scene.route;
  const Page = STAGE_PAGES[route] ?? STAGE_PAGES['/command'];
  const left = scene.seconds * 1000 - sceneElapsed(p, now);
  const beat = scene.beats[Math.min(p.beat, scene.beats.length - 1)];
  // Baton card when the speaker changes mid-show (not on the first scene, not during questions).
  const [baton, setBaton] = useState<{ speaker: PersonId; segment: string; key: string } | null>(null);
  const lastSpeaker = useRef<{ who: PersonId; scene: number } | null>(null);
  useEffect(() => {
    if (p.status !== 'running') { if (p.status === 'idle') lastSpeaker.current = null; return; }
    const prev = lastSpeaker.current;
    lastSpeaker.current = { who: speaker, scene: p.scene };
    if (prev && prev.scene !== p.scene && prev.who !== speaker) setBaton({ speaker, segment: scene.segment, key: `${p.scene}-${speaker}` });
  }, [p.status, p.scene, speaker, scene.segment]);
  const endBaton = useCallback(() => setBaton(null), []);

  useEffect(() => {
    document.documentElement.classList.add('s-stage-root');
    return () => document.documentElement.classList.remove('s-stage-root');
  }, []);

  // NOVA scene cue (only for scenes without engine-driven lines) and the 30-second warning tick — audio window only.
  const spokenScene = useRef('');
  useEffect(() => {
    if (p.status !== 'running' || !isAudioOwner()) return;
    const key = `${p.showId}:${p.duration}:${p.scene}:${p.startedAt}`;
    if (spokenScene.current === key) return;
    // A new scene interrupts whatever NOVA was still saying about the previous one.
    if (spokenScene.current) stopNova();
    spokenScene.current = key;
    const prefs = getPrefs();
    if (scene.nova && p.narration === 'auto' && prefs.mode === 'auto' && (prefs.enabled || prefs.captions)) window.setTimeout(() => say(scene.nova!, { key: `scene-${key}` }), 700);
  }, [p.status, p.scene, p.showId, p.duration, p.startedAt, p.narration, scene.nova]);
  // "Time nearly up" tick for the presenter: 30 s before the end of long scenes, a quarter of the scene (8 s
  // minimum) for short ones — never at the very start of a scene.
  const ticked = useRef('');
  const warnAt = Math.min(30_000, Math.max(8_000, scene.seconds * 250));
  useEffect(() => {
    if (p.status !== 'running' || !isAudioOwner()) return;
    const k = `${p.scene}:${p.sceneStartedAt}`;
    if (left <= warnAt && left > warnAt - 4_000 && ticked.current !== k) { ticked.current = k; play('tick'); }
  }, [left, warnAt, p.status, p.scene, p.sceneStartedAt]);

  // Keyboard: the projector window still answers the presenter's clicker.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) { e.preventDefault(); presenter.advance(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); presenter.prev(); }
      else if (e.key.toLowerCase() === 'f') { void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch(() => undefined); }
      else if (e.key.toLowerCase() === 'p') { if (p.status === 'paused') presenter.resume(); else presenter.pause(); }
      else if (e.key.toLowerCase() === 'q') { if (p.status === 'qa') presenter.closeQuestions(); else presenter.openQuestion(null); }
      else if (e.key.toLowerCase() === 'b') presenter.beat(1);
      else if (e.key.toLowerCase() === 'n' && single) setDock(d => !d);
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [p.status, single]);

  return (
    <div className={`s-stage st-${p.status} ${single ? 'single' : 'audience'}`}>
      <header className="s-stage-band">
        <span className="s-row" style={{ gap: 10 }}><BrandMark size={34} /><span className="s-stage-show"><b>NOVATECH Sentinel</b>{cue ? <small className="cue" key={cue.at} role="status"><Captions size={13} aria-hidden="true" />{cue.text}</small> : <small>{meta.title}</small>}</span></span>
        <span className="s-stage-speaker" aria-live="polite">
          <Avatar id={speaker} size="lg" />
          <span><small>Now speaking</small><b>{personMeta(speaker).name}</b><span>{personMeta(speaker).role} · {scene.segment}</span></span>
        </span>
        <span className="s-row" style={{ gap: 14 }}>
          {!single && p.status !== 'idle' && <ProjectorStart />}
          {p.status === 'paused' && <span className="s-chip warn"><Pause size={13} />Paused</span>}
          {p.status === 'qa' && <span className="s-chip active"><MessageCircleQuestion size={13} />Questions</span>}
          <span className="s-stage-clock s-num" aria-label="Presentation time">{clock(totalElapsed(p, now))}</span>
          <Sim large>LIVE SIMULATION</Sim>
          {!fullscreen && <button className="s-iconbtn" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)} aria-label="Full screen" title="Full screen"><Maximize2 size={18} /></button>}
        </span>
      </header>
      <div className="s-stage-body" ref={bodyRef}>
        <OnStage.Provider value={true}><Suspense fallback={<div className="s-empty">Loading…</div>}><Page /></Suspense></OnStage.Provider>
      </div>
      {p.status === 'running' && beat && <Spotlight container={bodyRef} target={beat.target} caption={beat.caption} />}
      {p.status !== 'idle' && p.status !== 'done' && !(p.audienceCaptions && novaSpeaking) && (
        <div className="s-stage-lower" key={`${p.scene}-${p.status}`}>
          <span className="s-stage-idx s-num">{String(p.scene + 1).padStart(2, '0')}<small>/{scenes.length}</small></span>
          <span className="s-stage-title">{p.status === 'qa' ? (question ? question.q : 'Your questions') : scene.title}</span>
          {p.status === 'qa' && question && <span className="s-stage-answers"><Avatar id={question.who} size="sm" />{personMeta(question.who).first} answers</span>}
        </div>
      )}
      <div className="s-stage-progress" aria-hidden="true">{scenes.map((s, i) => <i key={s.id + i} className={i < p.scene ? 'done' : i === p.scene ? 'now' : ''} style={{ flex: s.seconds }}>{i === p.scene && p.status === 'running' && <em style={{ width: `${Math.min(100, (sceneElapsed(p, now) / (s.seconds * 1000)) * 100)}%` }} />}</i>)}</div>
      {p.audienceCaptions && <CaptionBar audience cues={false} />}
      {single ? <CriticalAlert stage /> : <CriticalAlert audience />}
      {route === '/endpoint' && p.status !== 'idle' && p.status !== 'done' && <SimPowerOff closable={false} onNext={single ? presenter.advance : undefined} />}
      {baton && p.status === 'running' && <Baton key={baton.key} speaker={baton.speaker} segment={baton.segment} onDone={endBaton} />}
      {p.status === 'qa' && p.whatIf && <WhatIfPanel id={p.whatIf} />}
      {p.status === 'idle' && <TitleCard title={meta.title} blurb={meta.blurb} minutes={p.duration} speakers={showSpeakers(scenes, p)} single={single} />}
      {p.status === 'done' && <EndCard single={single} />}
      {single && dock && <PresenterDock onHide={() => setDock(false)} />}
      {single && !dock && <button className="s-dock-show" onClick={() => setDock(true)}><PanelBottomOpen size={16} />Presenter dock (N)</button>}
      {single && dock && <span className="s-sr"><PanelBottomClose size={1} /></span>}
    </div>
  );
}

/** Short names for the relay segments on the title card. */
const SEGMENT_SHORT: Record<string, string> = {
  'Introduction': 'Introduction', 'Security leadership': 'Security leadership', 'Cybersecurity investigation': 'Investigation',
  'Financial analysis': 'Financial analysis', 'Executive approval': 'Executive approval', 'IT execution': 'IT execution',
  'Final demonstration and conclusion': 'Demo and conclusion',
};

/** Who actually speaks in this show, in order: one entry per person and segment (short shows list fewer people). */
function showSpeakers(scenes: ReturnType<typeof scenesOf>, p: Parameters<typeof speakerFor>[1]): { id: PersonId; segment: string }[] {
  const out: { id: PersonId; segment: string }[] = [];
  for (const s of scenes) { const id = speakerFor(s, p); if (!out.some(x => x.id === id && x.segment === s.segment)) out.push({ id, segment: s.segment }); }
  return out;
}

function TitleCard({ title, blurb, minutes, speakers, single }: { title: string; blurb: string; minutes: number; speakers: { id: PersonId; segment: string }[]; single?: boolean }) {
  const soundOn = useSoundReady();
  return (
    <div className="s-stage-card">
      <BrandMark size={64} />
      <p className="s-hero-kicker">NOVATECH Sentinel — the enterprise nervous system</p>
      <h1 className="s-display">{title}</h1>
      <p className="s-lead">{blurb}</p>
      <ol className="s-stage-relay" aria-label="Speaking order">
        {speakers.map(({ id, segment }, i) => (
          <li key={`${id}-${i}`}><Avatar id={id} size="lg" /><b>{personMeta(id).first}</b><small>{SEGMENT_SHORT[segment] ?? segment}</small></li>
        ))}
      </ol>
      <p className="s-stage-meta">About {minutes} minutes, presented by ESAIP MSc Group 1</p>
      {single ? <button className="s-btn primary lg" onClick={() => { readyAudio(); presenter.start(); }}>Start presentation</button>
        : soundOn ? <p className="s-small">Projector ready · waiting for the presenter to start (press → on the console).</p> : <ProjectorStart big />}
    </div>
  );
}

/** Everything a click in this window can unlock: effects, NOVA's voice (switched on unless narration is off). */
function readyAudio() {
  unlockAudio(); unlockNova();
  if (getState().presenter.narration !== 'off' && !getPrefs().enabled) setPrefs({ enabled: true });
}

/** One click on the projector: full screen, sound and voice together. Browsers require a click in every window. */
function ProjectorStart({ big }: { big?: boolean }) {
  const soundOn = useSoundReady();
  const nova = useNova();
  if (soundOn && nova.engine !== 'needs-click') return null;
  const go = () => {
    readyAudio();
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.()?.catch(() => undefined);
    window.setTimeout(() => { play('acknowledge'); if (getPrefs().enabled && getState().presenter.status === 'idle') say('Projector ready.', { force: true }); }, 120);
  };
  return big
    ? <button className="s-projstart" onClick={go}><Maximize2 size={22} aria-hidden="true" /><span><b>Start the projector</b><small>One click here: full screen, sound and NOVA’s voice</small></span></button>
    : <button className="s-projpill" onClick={go}><VolumeX size={14} aria-hidden="true" />Click here once to enable sound</button>;
}

/** Whether this window may play sound yet (browsers need one click or key press per window). */
function useSoundReady() {
  const [ok, setOk] = useState(sfxReady);
  useEffect(() => { if (ok) return; const t = window.setInterval(() => { if (sfxReady()) setOk(true); }, 700); return () => window.clearInterval(t); }, [ok]);
  return ok;
}

/** Sound captions on the projector: shown for a few seconds in place of the show subtitle in the band, so they never
 *  cover the page, the lower third or NOVA's caption. Presenter-only cues (the time tick) are not captioned. */
function useStageCue(): { text: string; at: number } | null {
  const show = useStore(s => s.settings.soundCaptions);
  const [cue, setCue] = useState<{ cue: Cue; at: number } | null>(null);
  useEffect(() => onCue(c => { if (c !== 'tick' && c !== 'select') setCue({ cue: c, at: Date.now() }); }), []);
  useEffect(() => { if (!cue) return; const t = window.setTimeout(() => setCue(null), 3000); return () => window.clearTimeout(t); }, [cue]);
  return show && cue ? { text: CUE_CAPTION[cue.cue], at: cue.at } : null;
}

const GATE_KIND: Record<string, string[]> = { detect: ['ownership'], assess: ['assessment'], impact: ['impact'], authorize: ['approved'], execute: ['executed'], verify: ['verified'], close: ['closed'] };

/** The proof receipt: each of the seven gates with who signed it and the fingerprint of that ledger entry. */
function ProofReceipt({ run }: { run: Run }) {
  return (
    <ol className="s-receipt" aria-label="Proof receipt: who signed each gate">
      {GATES.map(g => {
        const entries = run.ledger.filter(e => e.gate === g.key && GATE_KIND[g.key].includes(e.kind));
        const signers = [...new Set(entries.map(e => e.actor))].filter((a): a is Exclude<typeof a, 'system'> => a !== 'system');
        const last = entries[entries.length - 1];
        return (
          <li key={g.key} className={last ? 'signed' : ''}>
            <span className="n s-num">{g.n}</span>
            <span className="g">{g.name}</span>
            <span className="who">{signers.length ? signers.map(a => <span key={a} className="s-row" style={{ gap: 6 }}><Avatar id={a} size="sm" />{personMeta(a).first}</span>) : <span className="s-faint">not signed</span>}</span>
            {last && <span className="h s-mono">#{last.seq} · {last.hash.slice(0, 8)}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function EndCard({ single }: { single?: boolean }) {
  const run = useStore(s => s.run);
  const sc = scenarioOf(run);
  const ex = exposureNow(run);
  const chain = verifyLedger(run.ledger);
  return (
    <div className="s-stage-card s-end">
      <BrandMark size={48} />
      <h1 className="s-end-title">See the threat.<br />Own the decision.<br />Prove the response.</h1>
      {run.status !== 'ready' ? (
        <>
          <p className="s-end-k">Proof receipt · {sc.ref} {run.status === 'closed' ? '· closed' : `· open at ${GATES[run.gate]?.name ?? 'start'}`}</p>
          <ProofReceipt run={run} />
          <dl className="s-end-facts">
            <div><dt>{ex.treated ? 'Residual risk' : 'Exposure'}</dt><dd>{ex.treated ? `${ex.residualScore}/16 · ${money(ex.current)} modelled` : `${money(ex.current)} modelled`}</dd></div>
            <div><dt>Evidence</dt><dd>{run.ledger.length} ledger entries · chain {chain.ok ? 'intact' : `broken at #${chain.brokenAt}`}</dd></div>
            <div><dt>Chain head</dt><dd className="s-mono">{run.ledger[run.ledger.length - 1]?.hash.slice(0, 16) ?? '—'}</dd></div>
            <div><dt>Verification</dt><dd>{run.status === 'closed' ? `Independent of the execution${verifierApproved(run) ? '; approver overlap disclosed' : ''}` : 'Not yet'}</dd></div>
          </dl>
        </>
      ) : <p className="s-lead">No incident was run in this show.</p>}
      <p className="s-lead">Thank you — questions are welcome. Every answer has evidence on screen.</p>
      {single && <div className="s-row wrap" style={{ justifyContent: 'center' }}><button className="s-btn lg" onClick={() => presenter.openQuestion(null)}><MessageCircleQuestion size={18} />Questions</button><Link to="/present" className="s-btn ghost lg">Presenter Mode</Link></div>}
    </div>
  );
}

/** A professor's what-if, answered by the engine on a private copy at the authorization gate — never recorded. */
function WhatIfPanel({ id }: { id: WhatIfId }) {
  const scenarioId = useStore(s => s.run.scenarioId);
  const res = useMemo(() => whatIf(scenarioId, id), [scenarioId, id]);
  const meta = WHAT_IFS.find(w => w.id === id)!;
  const sc = scenarioOf({ ...blankRun(scenarioId) });
  return (
    <div className="s-whatif" role="status">
      <div className={`s-whatif-card v-${res.verdict}`}>
        <span className="s-label">Challenge the controls · {sc.ref} at the authorization gate</span>
        <h2>{meta.question}</h2>
        <p className="s-whatif-verdict">{res.headline}</p>
        {res.lines.length > 0 && <ul className="s-whatif-lines">{res.lines.map(l => <li key={l}>{l}</li>)}</ul>}
        {res.checks.length > 0 && <ul className="s-sod">{res.checks.map(c => <li key={c.rule} className={c.ok ? 'ok' : 'fail'}>{c.ok ? <ShieldCheck size={15} /> : <CircleX size={15} />}<span><b>{c.rule}</b><small>{c.detail}</small></span></li>)}</ul>}
        <small className="s-faint">Answered by the same engine on a private copy · simulated · nothing is written to the ledger.</small>
      </div>
    </div>
  );
}

/** A two-second card when the speaker changes: who speaks next and the one question their part answers. */
const SEGMENT_QUESTION: Record<string, string> = {
  'Introduction': 'What is NOVATECH, and why does it need Sentinel?',
  'Security leadership': 'Which risks are outside our appetite — and who owns them?',
  'Cybersecurity investigation': 'Is it real, and how far has it spread?',
  'Financial analysis': 'What could this cost us?',
  'Executive approval': 'Do we authorize the disruption — and within which scope?',
  'IT execution': 'Can we do exactly what was approved, and nothing more?',
  'Final demonstration and conclusion': 'Did it work, and what risk remains?',
};
function Baton({ speaker, segment, onDone }: { speaker: PersonId; segment: string; onDone: () => void }) {
  useEffect(() => { const t = window.setTimeout(onDone, 2400); return () => window.clearTimeout(t); }, [onDone]);
  const m = personMeta(speaker);
  return (
    <div className="s-baton" role="status" onClick={onDone}>
      <div className="s-baton-card">
        <Avatar id={speaker} size="xl" />
        <div><span className="s-label">Over to</span><b>{m.name}</b><span>{m.role} · {segment}</span><p>{SEGMENT_QUESTION[segment] ?? ''}</p></div>
      </div>
    </div>
  );
}

type Box = { x: number; y: number; w: number; h: number };
const PAD = 10;
const area = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const reducedMotion = () => {
  const m = document.documentElement.dataset.sMotion;
  return m === 'reduce' || (m !== 'full' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
};

/** Everything a spotlight caption must not cover: visible text lines, form fields and pictures, and the fixed overlays. */
function obstacles(root: HTMLElement): { box: Box; weight: number }[] {
  const out: { box: Box; weight: number }[] = [];
  const vh = window.innerHeight;
  // Boxes are inflated a little so a caption never sits flush against a line of text.
  const m = 6;
  const push = (r: DOMRect, weight: number) => { if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh) out.push({ box: { x: r.left - m, y: r.top - m, w: r.width + m * 2, h: r.height + m * 2 }, weight }); };
  // Text that is present but invisible (opacity 0, visibility hidden — e.g. a map label for a quiet node) is not an obstacle.
  const seen = new Map<Element, boolean>();
  const visible = (el: Element | null) => {
    if (!el) return false;
    let v = seen.get(el);
    if (v === undefined) { v = (el as Element & { checkVisibility?: (o: object) => boolean }).checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true; seen.set(el, v); }
    return v;
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => /\S/.test(n.nodeValue ?? '') && visible(n.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { range.selectNodeContents(n); for (const r of Array.from(range.getClientRects())) push(r, 10); }
  root.querySelectorAll('input, textarea, select').forEach(el => push(el.getBoundingClientRect(), 5));
  // Pictures and maps may be partly covered; their own labels are text and count in full.
  root.querySelectorAll('svg, canvas, img').forEach(el => push(el.getBoundingClientRect(), 0.05));
  document.querySelectorAll('.s-stage-band, .s-stage-lower, .s-caption-line, .s-dock, .s-stage-progress').forEach(el => push(el.getBoundingClientRect(), 60));
  return out;
}

/** Picks the caption position (relative to the frame) that covers the least content: outside first, then inside. */
function placeCaption(rect: Box, size: { w: number; h: number }, root: HTMLElement): { dx: number; dy: number } {
  const f = { l: rect.x - PAD, t: rect.y - PAD, r: rect.x + rect.w + PAD, b: rect.y + rect.h + PAD };
  const vw = window.innerWidth, vh = window.innerHeight, gap = 10, inset = 14;
  const band = document.querySelector('.s-stage-band')?.getBoundingClientRect().bottom ?? 0;
  const top = band + 6, bottom = vh - 12;
  const visT = Math.max(f.t, top), visB = Math.min(f.b, bottom);
  // In order of preference: under or over the frame, beside it, then inside its corners. Side positions never clamp
  // (that would slide them over the frame); the others clamp to the screen.
  const candidates: { x: number; y: number; side?: boolean }[] = [
    { x: f.l, y: f.b + gap }, { x: f.l, y: f.t - gap - size.h }, { x: f.r - size.w, y: f.b + gap }, { x: f.r - size.w, y: f.t - gap - size.h },
    { x: f.r + gap, y: visT, side: true }, { x: f.r + gap, y: visB - size.h, side: true }, { x: f.l - gap - size.w, y: visT, side: true },
    { x: f.r - size.w - inset, y: visT + inset }, { x: f.r - size.w - inset, y: visB - size.h - inset }, { x: f.l + inset, y: visB - size.h - inset }, { x: f.l + inset, y: visT + inset },
  ];
  // Text inside the spotlight is what the room is reading: covering it costs three times more than dimmed text.
  const lit = (b: Box) => { const cx = b.x + b.w / 2, cy = b.y + b.h / 2; return cx > f.l && cx < f.r && cy > f.t && cy < f.b; };
  const obs = obstacles(root).map(o => (o.weight === 10 && lit(o.box) ? { ...o, weight: 30 } : o));
  let best = { x: f.l, y: f.b + gap }, bestScore = Infinity;
  candidates.forEach((c, i) => {
    if (c.side && (c.x < 12 || c.x + size.w > vw - 12)) return;
    const x = c.side ? c.x : Math.min(Math.max(12, c.x), vw - size.w - 12);
    if (c.y < top || c.y + size.h > bottom) return;
    const box = { x, y: c.y, w: size.w, h: size.h };
    const score = obs.reduce((s, o) => s + area(box, o.box) * o.weight, 0) + i * 120;
    if (score < bestScore) { bestScore = score; best = { x, y: c.y }; }
  });
  return { dx: best.x - f.l, dy: best.y - f.t };
}

/**
 * Finds a spotlight target. Sentinel pages use data-tour ids; the original case-workspace pages are addressed
 * without editing them: "stats" (their figure row), "card:<title>", "h:<heading text>" or "sel:<css selector>".
 */
function locate(root: HTMLElement | null, t: string): Element | null {
  if (!root) return null;
  if (t === 'stats') return root.querySelector('.ent-root .stats');
  if (t.startsWith('sel:')) { try { return root.querySelector(t.slice(4)); } catch { return null; } }
  if (t.startsWith('card:')) { const want = t.slice(5); return Array.from(root.querySelectorAll('section.card')).find(c => c.querySelector('.card-head h3')?.textContent?.includes(want)) ?? null; }
  if (t.startsWith('h:')) { const want = t.slice(2); const h = Array.from(root.querySelectorAll('h1, h2, h3')).find(x => x.textContent?.includes(want)); return h ? (h.closest('section') ?? h.parentElement) : null; }
  return root.querySelector(`[data-tour="${t}"]`);
}

/** Frame + dim around the element the narration is about; follows it through scrolling and re-renders.
 *  A target may list fallbacks ("a|b"): the first one present on the page is used. */
function Spotlight({ container, target, caption }: { container: React.RefObject<HTMLDivElement>; target: string; caption: string }) {
  const [rect, setRect] = useState<Box | null>(null);
  const [cap, setCap] = useState<{ dx: number; dy: number; key: string } | null>(null);
  const capRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let el: Element | null = null;
    const find = () => { for (const t of target.split('|')) { const hit = locate(container.current, t); if (hit) return hit; } return null; };
    let framed = false;
    // Frame the target in the space above the lower third and captions; tall targets show their top edge.
    const frame = () => {
      const body = container.current;
      if (!el || !body) return;
      const b = body.getBoundingClientRect(), r = el.getBoundingClientRect();
      const avail = b.height - 160;
      // Tall targets keep a strip above them for the caption, so it never has to sit on what is spotlit.
      const offset = r.height <= avail - 48 ? Math.max(24, (avail - r.height) / 2) : 76;
      body.scrollTo({ top: Math.max(0, body.scrollTop + (r.top - b.top) - offset), behavior: reducedMotion() ? 'auto' : 'smooth' });
    };
    const measure = () => {
      // A preferred target can appear later (the approval window opens mid-scene): switch to it and re-frame.
      const best = find();
      if (best !== el) { el = best; if (framed) frame(); }
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect(prev => prev && Math.abs(prev.x - r.left) < 1 && Math.abs(prev.y - r.top) < 1 && Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1 ? prev : { x: r.left, y: r.top, w: r.width, h: r.height });
    };
    const first = window.setTimeout(() => { el = find(); framed = true; frame(); measure(); }, 350);
    const t = window.setInterval(measure, 250);
    window.addEventListener('resize', measure);
    container.current?.addEventListener('scroll', measure, { passive: true });
    const c = container.current;
    return () => { window.clearTimeout(first); window.clearInterval(t); window.removeEventListener('resize', measure); c?.removeEventListener('scroll', measure); };
  }, [container, target]);
  // Place the caption once the frame settles (re-placed after scrolling or layout changes).
  useEffect(() => {
    if (!rect || !caption) return;
    const t = window.setTimeout(() => {
      const el = capRef.current, root = container.current;
      if (!el || !root) return;
      const pos = placeCaption(rect, { w: el.offsetWidth, h: el.offsetHeight }, root);
      setCap(prev => prev && prev.key === caption && Math.abs(prev.dx - pos.dx) < 1 && Math.abs(prev.dy - pos.dy) < 1 ? prev : { ...pos, key: caption });
    }, 140);
    return () => window.clearTimeout(t);
  }, [rect, caption, container]);
  if (!rect) return null;
  const placed = cap && cap.key === caption ? cap : null;
  return (
    <div className="s-spot" style={{ left: rect.x - PAD, top: rect.y - PAD, width: rect.w + PAD * 2, height: rect.h + PAD * 2 }} aria-hidden="true">
      <i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
      {caption && <span ref={capRef} className={`s-spot-cap ${placed ? 'placed' : ''}`} style={placed ? { left: placed.dx, top: placed.dy } : undefined}>{caption}</span>}
    </div>
  );
}
