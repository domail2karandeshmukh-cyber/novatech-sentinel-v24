import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowRight, BellRing, Check, CheckCheck, ChevronRight, CircleAlert,
  Clock3, Command, Download, Fingerprint, Gauge, LockKeyhole, Maximize2,
  MicOff, MonitorOff, PauseCircle, Play, Radio, RotateCcw, ScanEye, Settings2, Shield,
  ShieldCheck, Sparkles, Terminal, TrendingUp, Users, Volume2, Wifi, X,
} from 'lucide-react';
import {
  advanceRun, blankRun, loadDemo, money, ROLES, saveDemo, SCENARIOS, STAGES, startRun,
} from './demoEngine';
import type { DemoRun, Role, ScenarioId } from './demoEngine';
import { VoiceStudio } from './VoiceStudio';
import { MacControlCard } from './MacControlCard';
import { RemotePairingCard } from './RemotePairingCard';
import { useVoiceStudio } from './useVoiceStudio';
import { stageNarration } from './voiceEngine';
import './demo.css';
import './mission.css';

type View = 'command' | 'workflow' | 'evidence';

function timeAgo(at: string, now: number) {
  const s = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function elapsed(from: string | null, to: string | null, now: number) {
  if (!from) return '00:00';
  const seconds = Math.max(0, Math.floor(((to ? Date.parse(to) : now) - Date.parse(from)) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatTime(at: string) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(at));
}

const ICON_BY_STAGE = [Radio, ScanEye, TrendingUp, LockKeyhole, MonitorOff, Fingerprint, CheckCheck];
const ICON_BY_VIEW = { command: Command, workflow: Activity, evidence: Fingerprint };

export default function DemoApp() {
  const [run, setRun] = useState<DemoRun>(loadDemo);
  const [role, setRole] = useState<Role>('Risk Lead');
  const [view, setView] = useState<View>('command');
  const [note, setNote] = useState('');
  const [voice, setVoice] = useState(false);
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const closeVoiceSettings = useCallback(() => setVoiceSettingsOpen(false), []);
  const voiceStudio = useVoiceStudio();
  const { speak, stop, supported, preferences } = voiceStudio;
  const spokenStage = useRef('');
  const [containmentChecked, setContainmentChecked] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [now, setNow] = useState(Date.now());

  const scenario = SCENARIOS.find(s => s.id === run.scenarioId)!;
  const stage = STAGES[run.step] ?? null;
  const activeRole = ROLES.find(r => r.role === role)!;
  const currentOwner = stage ? ROLES.find(r => r.role === stage.role)! : null;
  const isMine = stage?.role === role;
  const completed = run.status === 'closed';
  const started = run.status !== 'ready';
  const progress = completed ? 100 : started ? Math.round((run.step / STAGES.length) * 100) : 0;
  const eventsNewest = useMemo(() => [...run.events].reverse(), [run.events]);

  useEffect(() => saveDemo(run), [run]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 5000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!voice) return;
    const key = `${run.status}:${run.scenarioId}:${run.step}`;
    if (spokenStage.current === key) return;
    spokenStage.current = key;
    speak(stageNarration(run, stage, scenario, preferences.narrationStyle));
  }, [run, stage, scenario, voice, speak, preferences.narrationStyle]);

  function reset(scenarioId: ScenarioId = run.scenarioId) {
    if (run.status === 'active' && run.events.length > 1 && !window.confirm('Discard this local rehearsal and start again? No live data will be affected.')) return;
    setRun(blankRun(scenarioId)); setRole('Risk Lead'); setNote(''); setContainmentChecked(false); setView('command');
    setFeedback({ type: 'ok', text: 'New sandbox rehearsal ready. Production data was not touched.' });
  }

  function start() {
    setRun(r => startRun(r));
    setView('command');
    setFeedback({ type: 'ok', text: 'Synthetic signal injected. Your incident decision chain is now live.' });
  }

  function act(decision: 'approve' | 'revise' = 'approve') {
    if (stage?.key === 'contain' && !containmentChecked) {
      setFeedback({ type: 'error', text: 'Confirm that containment is a simulation before continuing.' }); return;
    }
    const result = advanceRun(run, role, note, decision);
    if (result.error) { setFeedback({ type: 'error', text: result.error }); return; }
    setRun(result.run); setNote(''); setContainmentChecked(false);
    setFeedback({ type: 'ok', text: decision === 'revise' ? 'Returned to Cybersecurity for a revised assessment.' : completed ? 'Decision recorded.' : 'Decision recorded in the local evidence trail.' });
  }

  function exportEvidence() {
    const payload = {
      disclaimer: 'NOVATECH V2 classroom simulation. Local browser events, not an authenticated or tamper-evident production audit ledger.',
      exportedAt: new Date().toISOString(), scenario, run,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `novatech-v2-${scenario.id}-evidence.json`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback({ type: 'ok', text: 'Local rehearsal evidence exported as JSON.' });
  }

  async function fullScreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { setFeedback({ type: 'error', text: 'Your browser has blocked full-screen mode.' }); }
  }

  function toggleVoice() {
    if (voice) { stop(); setVoice(false); spokenStage.current = ''; return; }
    if (!supported) {
      setFeedback({ type: 'error', text: 'Speech is not supported by this browser.' }); return;
    }
    spokenStage.current = '';
    setVoice(true);
  }

  const headline = completed ? 'The response is complete.' : started ? stage?.heading : 'Control the moment.\nProve every decision.';

  return (
    <div className="v2-app">
      <div className="v2-ambient" aria-hidden="true" />
      <header className="v2-topbar">
        <div className="v2-brand">
          <span className="v2-brandmark"><Shield size={21} strokeWidth={1.8} /><span /></span>
          <span><b>NOVATECH</b><small>RISK INTELLIGENCE / V2</small></span>
        </div>
        <div className="v2-top-center"><span className="v2-online-dot" /> <b>COMMAND CENTRE</b><span className="v2-top-div" /> <span>CLASSROOM SANDBOX</span></div>
        <div className="v2-top-actions">
          <span className="v2-top-clock">{new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now)} <span>LOCAL</span></span>
          <button className={`v2-icon-button ${voice ? 'on' : ''}`} title={voice ? 'Mute voice briefing' : 'Enable voice briefing'} aria-label={voice ? 'Mute voice briefing' : 'Enable voice briefing'} aria-pressed={voice} onClick={toggleVoice}>{voice ? <Volume2 size={17} /> : <MicOff size={17} />}</button>
          <button className="v2-icon-button v2-voice-settings-button" title="Voice and Indian pronunciation settings" aria-label="Voice studio settings" onClick={() => setVoiceSettingsOpen(true)}><Settings2 size={17} /></button>
          <button className="v2-icon-button" title="Full screen" onClick={fullScreen}><Maximize2 size={16} /></button>
        </div>
      </header>

      <div className="v2-layout">
        <aside className="v2-sidebar">
          <div className="v2-side-label">OPERATIONS</div>
          {(['command', 'workflow', 'evidence'] as View[]).map(v => {
            const Icon = ICON_BY_VIEW[v];
            return <button key={v} className={`v2-nav-item ${view === v ? 'active' : ''}`} aria-pressed={view === v} onClick={() => setView(v)}>
              <Icon size={18} strokeWidth={1.8} /><span>{v === 'command' ? 'Command centre' : v === 'workflow' ? 'Decision chain' : 'Evidence ledger'}</span>{view === v && <span className="v2-nav-pip" />}
            </button>;
          })}
          <div className="v2-sidebar-separator" />
          <div className="v2-side-label">SCENARIO LIBRARY <span>03</span></div>
          <div className="v2-scenario-list">
            {SCENARIOS.map((s, i) => <button key={s.id} className={`v2-scenario-choice ${s.id === scenario.id ? 'current' : ''}`} aria-pressed={s.id === scenario.id} onClick={() => reset(s.id)}>
              <span className="v2-scenario-index">0{i + 1}</span><span><b>{s.name}</b><small>{s.family}</small></span>{s.id === scenario.id && <span className="v2-selection-dot" />}
            </button>)}
          </div>
          <div className="v2-sidebar-bottom">
            <button className="v2-voice-side-cta" onClick={() => setVoiceSettingsOpen(true)}><Volume2 size={17}/><span><b>NOVA VOICE</b><small>Indian English · custom pronunciation</small></span><Settings2 size={15}/></button>
            <button className="v2-voice-side-cta" onClick={() => document.getElementById('v2-mac-control')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><MonitorOff size={17}/><span><b>MAC CONTROL</b><small>Optional local shutdown helper</small></span><ArrowRight size={15}/></button>
            <button className="v2-voice-side-cta" onClick={() => document.getElementById('v2-remote-control')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><Wifi size={17}/><span><b>REMOTE PRESENTER</b><small>Pierre · 30-minute pairing</small></span><ArrowRight size={15}/></button>
            <div className="v2-secure-note"><ShieldCheck size={15} /><span>LOCAL DEMO MODE<br/><small>No production writes</small></span></div>
            {import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY &&
              <a href="/" className="v2-back-link">Original platform <ArrowRight size={14} /></a>}
          </div>
        </aside>

        <main className="v2-main">
          <div className="v2-main-inner">
            <div className="v2-overline"><span className="v2-hairline" /> INTEGRATED RISK OPERATIONS <span className="v2-overline-right">CASE STUDY / NOVATECH SERVICES</span></div>

            <section className="v2-hero">
              <div className="v2-hero-copy">
                <div className="v2-status-row"><span className={`v2-status-badge ${started && !completed ? 'live' : completed ? 'done' : ''}`}><span />{completed ? 'INCIDENT RESOLVED' : started ? 'LIVE REHEARSAL' : 'SYSTEM READY'}</span><span className="v2-ref">{scenario.ref} / {scenario.family}</span></div>
                <h1>{headline?.split('\n').map((part, i) => <span key={part}>{i === 1 ? <em>{part}</em> : part}{i === 0 && headline.includes('\n') ? <br /> : null}</span>)}</h1>
                <p>{completed ? 'The record now contains each handoff, decision, approval and independent verification. Review or export the evidence.' : started ? stage?.prompt : 'A decision-ready rehearsal for security, finance and executive leaders. From the first alert to defensible closure.'}</p>
                <div className="v2-hero-buttons">
                  {!started ? <button className="v2-primary-btn" onClick={start}><Play size={16} fill="currentColor" /> Launch live scenario <ArrowRight size={17} /></button>
                    : completed ? <button className="v2-primary-btn" onClick={() => setView('evidence')}><Fingerprint size={17} /> Review decision evidence <ArrowRight size={17} /></button>
                      : <button className="v2-primary-btn" onClick={() => document.getElementById('v2-decision-workbench')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><Activity size={17} /> Open active decision <ArrowDownRight size={17} /></button>}
                  <button className="v2-secondary-btn" onClick={() => reset()}><RotateCcw size={15} /> Reset rehearsal</button>
                </div>
              </div>
              <div className="v2-hero-orbit" aria-label="Risk posture visualization">
                <div className="v2-orbit-ring r1" /><div className="v2-orbit-ring r2" /><div className="v2-orbit-ring r3" />
                <div className="v2-orbit-cross one" /><div className="v2-orbit-cross two" />
                <div className="v2-orbit-core"><span>RISK EXPOSURE</span><b>{scenario.likelihood * scenario.severity}<small>/16</small></b><em>{scenario.likelihood * scenario.severity >= 12 ? 'CRITICAL' : 'ELEVATED'}</em></div>
                <span className="v2-orbit-label top">LIVE ANALYSIS</span><span className="v2-orbit-label bottom">CONTROL SYSTEM / 02</span>
              </div>
            </section>

            <div className="v2-metrics">
              <div className="v2-metric"><span>01 / RISK POSTURE</span><b className="v2-metric-danger">{scenario.likelihood * scenario.severity}<small> / 16</small></b><small><CircleAlert size={13}/> Elevated exposure</small></div>
              <div className="v2-metric"><span>02 / FINANCIAL EXPOSURE</span><b>{money(scenario.exposure)}</b><small><TrendingUp size={13}/> Modelled scenario maximum</small></div>
              <div className="v2-metric"><span>03 / INCIDENT CLOCK</span><b className="v2-monospace">{elapsed(run.startedAt, run.completedAt, now)}</b><small><Clock3 size={13}/> {started ? (completed ? 'Stopped at closure' : 'Response in progress') : 'Starts on detection'}</small></div>
              <div className="v2-metric"><span>04 / DECISION PROGRESS</span><b>{progress}<small>%</small></b><div className="v2-small-progress"><i style={{ width: `${progress}%` }} /></div></div>
            </div>

            <IntelligenceOverview run={run} scenarioId={scenario.id} onRole={setRole} />

            {view === 'command' && <div className="v2-content-grid">
              <div className="v2-primary-column">
                <section className="v2-panel v2-signal-panel">
                  <div className="v2-panel-heading"><div><span className="v2-eyebrow">01 / DETECTION INTELLIGENCE</span><h2>Incident signal</h2></div><span className="v2-chip v2-chip-alert"><Radio size={13}/> SYNTHETIC FEED</span></div>
                  <div className="v2-signal-focus"><div className="v2-signal-emblem"><BellRing size={24}/></div><div><div className="v2-signal-title">{scenario.name}</div><p>{scenario.summary}</p></div></div>
                  <div className="v2-signal-details"><div><small>SIGNAL SOURCE</small><b>{scenario.signal}</b></div><div><small>CRITICAL ASSET</small><b>{scenario.asset}</b></div><div><small>BUSINESS EXPOSURE</small><b>{scenario.impact}</b></div></div>
                  <div className="v2-tag-row">{scenario.tags.map(t => <span key={t}>{t}</span>)}<span className="v2-tag-hot">SEVERITY {scenario.severity}/4</span></div>
                </section>

                <div className="v2-section-split"><div><span className="v2-eyebrow">02 / GOVERNANCE SEQUENCE</span><h2>One incident. Seven accountable gates.</h2></div><button onClick={() => setView('workflow')} className="v2-text-link">Open decision chain <ArrowRight size={15}/></button></div>
                <StageRail step={run.step} status={run.status} />
                <DecisionWorkbench run={run} role={role} onRole={setRole} note={note} onNote={setNote} onAction={act} onStart={start} containmentChecked={containmentChecked} onContainmentChecked={setContainmentChecked} scenario={scenario} />
              </div>
              <div className="v2-aside-column"><ResponsibilityCard role={role} onRole={setRole} stageRole={stage?.role ?? null} />
                <section className="v2-panel v2-activity-panel"><div className="v2-panel-heading"><div><span className="v2-eyebrow">03 / AUDIT PREVIEW</span><h2>Evidence stream</h2></div><button onClick={() => setView('evidence')} className="v2-simple-icon"><ArrowRight size={17}/></button></div>
                  <EventList events={eventsNewest.slice(0, 5)} now={now} />
                  <button className="v2-ledger-link" onClick={() => setView('evidence')}>Open evidence ledger <ArrowRight size={15}/></button>
                </section>
                <div className="v2-callout"><div><Sparkles size={17} /> <b>PLAYBOOK INTELLIGENCE</b></div><p>Contextual suggestions are based on the selected scenario. They are deterministic demo guidance, not AI-generated or validated recommendations.</p></div>
              </div>
            </div>}

            {view === 'workflow' && <div className="v2-focused-view"><div className="v2-focus-head"><div><span className="v2-eyebrow">DECISION ARCHITECTURE / SEGREGATION OF DUTIES</span><h2>Every gate has an owner.</h2><p>Switch demonstration personas to experience each handoff. Approval and verification are separate from execution.</p></div><span className="v2-chip"><LockKeyhole size={14} /> Role-gated simulation</span></div>
              <div className="v2-workflow-cards">{STAGES.map((s, i) => {const Icon = ICON_BY_STAGE[i]; const done = completed || started && i < run.step; const current = started && i === run.step && !completed; return <div className={`v2-stage-card ${done ? 'finished' : ''} ${current ? 'current' : ''}`} key={s.key}><div className="v2-stage-card-top"><span>{String(i + 1).padStart(2, '0')}</span><Icon size={21}/></div><b>{s.name}</b><p>{s.prompt}</p><div className="v2-stage-person">{s.person}</div><div className="v2-stage-state">{done ? <><Check size={13}/> Complete</> : current ? <><Activity size={13}/> Awaiting decision</> : 'Pending'}</div></div>})}</div>
              <DecisionWorkbench run={run} role={role} onRole={setRole} note={note} onNote={setNote} onAction={act} onStart={start} containmentChecked={containmentChecked} onContainmentChecked={setContainmentChecked} scenario={scenario} />
            </div>}

            {view === 'evidence' && <div className="v2-focused-view"><div className="v2-focus-head"><div><span className="v2-eyebrow">EVIDENCE / REHEARSAL SESSION</span><h2>Nothing happens without a record.</h2><p>Chronological record of this local simulation. Production permissions and tamper-evident storage are not connected here.</p></div><button className="v2-secondary-btn" onClick={exportEvidence}><Download size={16}/> Export JSON</button></div>
              <div className="v2-evidence-summary"><div><span>Recorded events</span><strong>{run.events.length}</strong></div><div><span>Approval revisions</span><strong>{run.revisions}</strong></div><div><span>Scenario ID</span><strong>{scenario.ref}</strong></div><div><span>Session status</span><strong>{completed ? 'Closed' : started ? 'Active' : 'Not started'}</strong></div></div>
              <section className="v2-panel v2-evidence-panel"><div className="v2-panel-heading"><div><span className="v2-eyebrow">DECISION TRACE</span><h2>Full timeline</h2></div><span className="v2-chip"><Fingerprint size={14}/> Local ledger</span></div><EventList events={eventsNewest} now={now} expanded /></section>
            </div>}

            <MacControlCard run={run} role={role} onRole={setRole} />
            <RemotePairingCard run={run} role={role} onRole={setRole} />
            <footer className="v2-footer"><span>© NOVATECH SERVICES / ESAIP GROUP 1</span><span><ShieldCheck size={13}/> Simulation by default · optional Mac-confirmed local and remote requests</span><span>V2.3 / MISSION CONTROL</span></footer>
          </div>
        </main>
      </div>
      {feedback && <div role="status" className={`v2-toast ${feedback.type}`}><span>{feedback.type === 'ok' ? <Check size={16}/> : <CircleAlert size={16}/>}</span>{feedback.text}<button onClick={() => setFeedback(null)} aria-label="Dismiss"><X size={15}/></button></div>}
      <VoiceStudio open={voiceSettingsOpen} onClose={closeVoiceSettings} preferences={voiceStudio.preferences} onChange={voiceStudio.setPreferences} voices={voiceStudio.voices} supported={voiceStudio.supported} onTest={() => voiceStudio.speak('Hello Karan Deshmukh. Nadia has completed the cybersecurity review. Sarah, please check the financial impact before the director approves the response.')} onTestName={name => voiceStudio.speak(`Hello ${name}. Your decision is now ready for review.`)} />
      {started && !completed && !isMine && <div className="v2-floating-handoff"><span>Awaiting <b>{currentOwner?.person}</b></span><button onClick={() => { if (stage) setRole(stage.role); setNote(''); }}><Users size={14}/> Assume demo role <ArrowRight size={14}/></button></div>}
      {activeRole && <div className="v2-sr-only" aria-live="polite">Current persona: {activeRole.person}. {stage ? `Next decision: ${stage.name}` : 'No pending decision'}.</div>}
    </div>
  );
}

const SIGNAL_PATHS: Record<ScenarioId, number[]> = {
  ransomware: [21,24,22,29,27,34,41,39,57,61,69,87,82,91],
  cloud: [15,18,17,23,30,29,36,38,44,63,59,77,83,81],
  payments: [12,18,15,16,25,24,32,49,43,58,62,74,88,92],
};

function IntelligenceOverview({ run, scenarioId, onRole }: { run: DemoRun; scenarioId: ScenarioId; onRole: (role: Role) => void }) {
  const trend = SIGNAL_PATHS[scenarioId];
  const points = trend.map((value, i) => `${(i / (trend.length - 1) * 500).toFixed(1)},${(100 - value).toFixed(1)}`).join(' ');
  const fill = `0,100 ${points} 500,100`;
  const owners = [
    { role: 'Cybersecurity' as Role, person: 'Nadia', gate: 1, color: 'teal' },
    { role: 'Finance' as Role, person: 'Sarah', gate: 2, color: 'violet' },
    { role: 'Director' as Role, person: 'Executive Director', gate: 3, color: 'amber' },
    { role: 'IT Operations' as Role, person: 'IT Operations', gate: 4, color: 'blue' },
  ];
  return <div className="v2-insights">
    <section className="v2-insight-card v2-trajectory">
      <div className="v2-insight-heading"><div><span className="v2-eyebrow">SYNTHETIC SIGNAL ANALYTICS</span><h2>Threat trajectory</h2></div><span className="v2-insight-live"><span/> {run.status === 'ready' ? 'MONITORING' : run.status === 'active' ? 'SIGNAL ACTIVE' : 'RESPONSE CLOSED'}</span></div>
      <div className="v2-chart-context"><b>{scenarioId === 'payments' ? 'Payment anomaly' : scenarioId === 'cloud' ? 'API failure signal' : 'Endpoint encryption signal'}</b><span>Simulated intensity · 14 observations</span></div>
      <div className="v2-chart-wrap"><div className="v2-chart-guides"><span>HIGH</span><span>MED</span><span>LOW</span></div><svg viewBox="0 0 500 110" role="img" aria-label="Illustrative rising risk-signal intensity in a synthetic monitoring feed"><defs><linearGradient id="v2-signal-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#52d5d9" stopOpacity=".34"/><stop offset="100%" stopColor="#52d5d9" stopOpacity="0"/></linearGradient><linearGradient id="v2-signal-line" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#64c4ee"/><stop offset="100%" stopColor="#a3ecbc"/></linearGradient></defs><line x1="0" y1="25" x2="500" y2="25" stroke="rgba(147,191,225,.11)" strokeDasharray="4 6"/><line x1="0" y1="55" x2="500" y2="55" stroke="rgba(147,191,225,.11)" strokeDasharray="4 6"/><line x1="0" y1="85" x2="500" y2="85" stroke="rgba(147,191,225,.11)" strokeDasharray="4 6"/><line x1="0" y1="39" x2="500" y2="39" stroke="rgba(250,162,111,.35)" strokeDasharray="7 7"/><polygon points={fill} fill="url(#v2-signal-fill)"/><polyline points={points} fill="none" stroke="url(#v2-signal-line)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="500" cy={100 - trend[trend.length-1]} r="5" fill="#b1f5c6" stroke="#0c2730" strokeWidth="3"/></svg></div>
      <div className="v2-chart-legend"><span><i className="line"/>Synthetic indicator</span><span><i className="threshold"/>Escalation threshold</span><b>01 → 14</b></div>
    </section>
    <section className="v2-insight-card v2-readiness"><div className="v2-insight-heading"><div><span className="v2-eyebrow">ACCOUNTABILITY AT A GLANCE</span><h2>Department readiness</h2></div><span className="v2-chip"><Users size={13}/> 4 functions</span></div><div className="v2-readiness-rows">{owners.map(item => { const done = run.status === 'closed' || run.status !== 'ready' && run.step > item.gate; const active = run.status === 'active' && run.step === item.gate; const percent = done ? 100 : active ? 55 : 8; return <button key={item.role} className="v2-readiness-row" onClick={() => onRole(item.role)} title={`Act as ${item.role}`}><div className="v2-readiness-name"><b>{item.role}</b><small>{item.person}</small></div><div className={`v2-readiness-bar ${item.color}`}><i style={{width: `${percent}%`}}/></div><span className={done ? 'complete' : active ? 'active' : ''}>{done ? 'Done' : active ? 'Active' : 'Pending'}</span></button>; })}</div><div className="v2-readiness-footer"><ShieldCheck size={13}/> Select a function to rehearse its role</div></section>
  </div>;
}

function StageRail({ step, status }: { step: number; status: DemoRun['status'] }) {
  return <ol className="v2-stage-rail" aria-label="Response sequence">{STAGES.map((s, i) => {const Icon = ICON_BY_STAGE[i]; const done = status === 'closed' || status === 'active' && i < step; const current = status === 'active' && i === step; return <li key={s.key} className={`${done ? 'done' : ''} ${current ? 'active' : ''}`}><div className="v2-stage-track"><span>{done ? <Check size={16}/> : <Icon size={17}/>}</span></div><b>{s.name}</b><small>{done ? 'Recorded' : current ? 'Active' : s.role}</small></li>})}</ol>;
}

function ResponsibilityCard({ role, onRole, stageRole }: { role: Role; onRole: (role: Role) => void; stageRole: Role | null }) {
  return <section className="v2-panel v2-team-panel"><div className="v2-panel-heading"><div><span className="v2-eyebrow">SIMULATED PERSONA</span><h2>Decision authority</h2></div><span className="v2-chip"><Users size={13}/> 06 roles</span></div><p className="v2-team-help">Choose a role to rehearse its permissions. This switch is for presentation only, not real authentication.</p><div className="v2-role-grid">{ROLES.map(r => <button key={r.role} className={`v2-role-option ${r.role === role ? 'selected' : ''} ${r.role === stageRole ? 'required' : ''}`} aria-pressed={r.role === role} onClick={() => onRole(r.role)}><span className="v2-avatar">{r.initials}</span><span className="v2-role-copy"><b>{r.person}</b><small>{r.role}</small></span>{r.role === stageRole && <span className="v2-role-star"><Activity size={12}/></span>}</button>)}</div></section>;
}

function DecisionWorkbench({ run, role, onRole, note, onNote, onAction, onStart, containmentChecked, onContainmentChecked, scenario }: {
  run: DemoRun; role: Role; onRole: (role: Role) => void; note: string; onNote: (note: string) => void;
  onAction: (decision?: 'approve' | 'revise') => void; onStart: () => void;
  containmentChecked: boolean; onContainmentChecked: (checked: boolean) => void;
  scenario: (typeof SCENARIOS)[number];
}) {
  const stage = STAGES[run.step] ?? null;
  const isMine = stage?.role === role;
  const suggested = stage ? scenario.suggestions[stage.key] : '';
  return <section className="v2-panel v2-workbench" id="v2-decision-workbench">
    <div className="v2-panel-heading"><div><span className="v2-eyebrow">04 / DECISION WORKBENCH</span><h2>{run.status === 'ready' ? 'Awaiting incident activation' : run.status === 'closed' ? 'All gates completed' : `Gate ${String(run.step + 1).padStart(2, '0')} · ${stage?.name}`}</h2></div><span className={`v2-chip ${run.status === 'active' ? 'v2-chip-warn' : ''}`}><Gauge size={14}/>{run.status.toUpperCase()}</span></div>
    {run.status === 'ready' ? <div className="v2-workbench-empty"><div className="v2-workbench-symbol"><Terminal size={27}/></div><h3>The control room is standing by.</h3><p>Launch the synthetic incident to reveal an interactive sequence of independent decisions, evidence and approvals.</p><button className="v2-primary-btn" onClick={onStart}><Play size={15}/> Start decision sequence <ArrowRight size={16}/></button></div> : run.status === 'closed' ? <div className="v2-workbench-empty v2-complete"><ShieldCheck size={38}/><h3>Verified and closed.</h3><p>Seven gates completed. The local evidence timeline now records the actions, actors and justification for the entire rehearsal.</p></div> : stage && <div className="v2-decision-body">
      <div className="v2-actor-bar"><span className="v2-actor-initial">{ROLES.find(r => r.role === stage.role)?.initials}</span><div><small>DECISION OWNER</small><b>{stage.person}</b><span>{stage.role}</span></div><span className={isMine ? 'v2-actor-ready' : 'v2-actor-wait'}>{isMine ? 'YOU ARE ACTING' : 'HANDOFF REQUIRED'}</span></div>
      <p className="v2-decision-prompt">{stage.prompt}</p>
      {stage.key === 'authorise' && <div className="v2-policy-line"><LockKeyhole size={17}/><span>Director authorization required. No disruption may be simulated before this gate is approved.</span></div>}
      {stage.key === 'contain' && <div className="v2-policy-line v2-policy-danger"><MonitorOff size={17}/><span><b>Controlled demo:</b> no actual Mac, server, payment, or network shutdown occurs. This button records a simulated action only.</span></div>}
      <div className="v2-note-title"><label htmlFor="v2-decision-note">Decision rationale / execution evidence</label><button className="v2-suggest-btn" onClick={() => onNote(suggested)}><Sparkles size={14}/> Fill from playbook</button></div>
      <textarea id="v2-decision-note" className="v2-note-input" value={note} onChange={e => onNote(e.target.value)} placeholder="Record what you checked, why you made this decision, and the next action..." rows={4} /><div className="v2-note-under"><span>Recorded under {role} · {note.trim().length} characters</span><span>Minimum 12 characters</span></div>
      {stage.key === 'contain' && <label className="v2-confirm-containment"><input type="checkbox" checked={containmentChecked} onChange={e => onContainmentChecked(e.target.checked)}/><span>I understand this is a simulated containment step, with no command sent to a device or external system.</span></label>}
      <div className="v2-workbench-actions"><button className="v2-primary-btn" disabled={!isMine || note.trim().length < 12 || stage.key === 'contain' && !containmentChecked} onClick={() => onAction('approve')}><Check size={17}/>{stage.action}<ArrowRight size={16}/></button>{stage.key === 'authorise' && <button className="v2-secondary-btn v2-revise" disabled={!isMine || note.trim().length < 12} onClick={() => onAction('revise')}><PauseCircle size={16}/> Return for revision</button>}{!isMine && <button className="v2-secondary-btn" onClick={() => onRole(stage.role)}>Assume {stage.role} role <ChevronRight size={15}/></button>}</div>
    </div>}
  </section>;
}

function EventList({ events, now, expanded = false }: { events: DemoRun['events']; now: number; expanded?: boolean }) {
  if (events.length === 0) return <div className="v2-empty-ledger"><div><Fingerprint size={22}/></div><b>No events yet</b><p>The event stream will populate when the simulated incident begins.</p></div>;
  return <div className={`v2-event-list ${expanded ? 'expanded' : ''}`}>{events.map(event => <div key={event.id} className={`v2-event ${event.kind}`}><div className="v2-event-line"><span className="v2-event-dot"/><span className="v2-event-time">{expanded ? formatTime(event.at) : timeAgo(event.at, now)}</span><span className="v2-event-role">{event.role}</span></div><h3>{event.title}</h3><p>{event.note}</p><div className="v2-event-owner">{event.actor} <span>· {event.stage.toUpperCase()}</span></div></div>)}</div>;
}
