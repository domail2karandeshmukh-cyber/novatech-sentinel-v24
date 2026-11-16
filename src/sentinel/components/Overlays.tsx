import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Captions, Power, RotateCcw, Square, Volume2, VolumeX } from 'lucide-react';
import { closeAlert, setSettings, useStore } from '../state/store';
import { exposureNow, gateActor, money, nextAction, scenarioOf } from '../engine/incident';
import { Avatar, clock, Codes, personMeta, Sim, useNow } from './kit';
import { replayLast, stopNova } from '../audio/nova';
import { CUE_CAPTION, onCue } from '../audio/sfx';
import type { Cue } from '../audio/sfx';
import { useNova } from './Shell';

const HEADLINE = { ransomware: 'CRITICAL SECURITY INCIDENT', cloud: 'SERVICE DISRUPTION', payments: 'PAYMENT FRAUD ATTEMPT' } as const;

/** The cinematic ATTENTION overlay: state-driven, dismissible, readable beats, no strobe (slow pulses only). */
export function CriticalAlert({ audience = false, stage = false }: { audience?: boolean; stage?: boolean }) {
  const alert = useStore(s => s.alert);
  const run = useStore(s => s.run);
  const muted = useStore(s => s.settings.muted);
  const nav = useNavigate();
  const now = useNow(250);
  const btn = useRef<HTMLButtonElement>(null);
  const open = alert.open && alert.runId === run.id && run.status !== 'ready';
  useEffect(() => { if (open && !audience) window.setTimeout(() => btn.current?.focus(), 300); }, [open, audience]);
  useEffect(() => {
    if (!open || audience) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAlert(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open, audience]);
  if (!open) return null;
  const s = scenarioOf(run);
  const owner = gateActor(run, 'detect');
  const started = Date.parse(run.startedAt!);
  const deadline = started + s.responseDeadlineMin * 60_000;
  const left = deadline - now;
  const spent = Math.min(1, Math.max(0, (now - started) / (deadline - started)));
  const next = nextAction(run);
  const exp = exposureNow(run);
  const approvals = s.approvals.map(a => personMeta(a.approver).first).join(' + ');
  const critical = s.severity === 'Critical';
  return (
    <div className={`s-alert ${audience || stage ? 'audience' : ''} sev-${critical ? 'critical' : 'high'}`} role="alertdialog" aria-modal="true" aria-labelledby="s-alert-title" aria-describedby="s-alert-desc">
      <div className="s-alert-bloom" aria-hidden="true" />
      <div className="s-alert-scan" aria-hidden="true"><i /></div>
      <div className="s-alert-frame" aria-hidden="true" />
      <div className="s-alert-card">
        <div className="s-alert-tape" aria-hidden="true" />
        <div className="s-alert-beat b1">
          <div className="s-row between wrap" style={{ gap: 10 }}>
            <span className="s-alert-kicker"><span className="s-alert-dot" />Sentinel · {critical ? 'critical' : 'high-severity'} signal · {s.family}</span>
            <span className="s-row" style={{ gap: 8 }}><Sim /><span className="s-mono s-alert-ref">{s.ref}</span></span>
          </div>
          <h2 id="s-alert-title" className="s-alert-title"><span className="s-alert-attn">Attention</span><span className="s-alert-hl">{HEADLINE[s.id]}</span></h2>
          <p id="s-alert-desc" className="s-alert-sub"><Codes text={s.signal} /></p>
        </div>
        <dl className="s-alert-grid b2">
          <div><dt>Affected system</dt><dd><span><Codes text={s.assetName} /></span><small>{s.site}</small></dd></div>
          <div><dt>Threat severity</dt><dd className={critical ? 's-crimson' : 's-amber'}>{critical ? 'Critical — P1' : 'High — P2'}<small>Likelihood {s.likelihood} × impact {s.impact} = {s.likelihood * s.impact}/16</small></dd></div>
          <div><dt>Estimated financial exposure</dt><dd className="s-num">{money(exp.max)}<small>Modelled maximum · simulated</small></dd></div>
          <div className="s-alert-clock"><dt>Response deadline</dt><dd className={`s-num ${left < 0 ? 's-crimson' : ''}`}>{left >= 0 ? clock(left) : `${clock(-left)} over`}<small>Contain within {s.responseDeadlineMin >= 60 ? `${Math.round(s.responseDeadlineMin / 60)} h` : `${s.responseDeadlineMin} min`}</small></dd><i className="s-alert-meter" aria-hidden="true"><em style={{ width: `${(1 - spent) * 100}%` }} /></i></div>
        </dl>
        <div className="s-alert-decision b3">
          <div className="s-row" style={{ gap: 12 }}>
            <Avatar id={owner} size="lg" />
            <div><span className="s-label">Responsible now</span><div className="s-alert-who">{personMeta(owner).name}<span>{personMeta(owner).role}</span></div></div>
          </div>
          <div className="s-alert-next"><span className="s-label">Required next action</span><b>{next.title}</b><span className="s-small">Approval route once the financial impact is recorded: {approvals} · not yet requested</span></div>
        </div>
        {!audience && (
          <div className="s-row wrap s-alert-actions">
            <button ref={btn} className="s-btn danger lg" onClick={() => { closeAlert(); if (!stage) nav('/incident'); }}>{stage ? 'Acknowledge' : 'Acknowledge and open the incident'}</button>
            <button className="s-btn lg" onClick={() => closeAlert()}>Dismiss</button>
            <button className="s-iconbtn" aria-pressed={!muted} aria-label={muted ? 'Unmute sound' : 'Mute sound'} onClick={() => setSettings({ muted: !muted })}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** NOVA captions (word-highlighted) plus short captions for sound cues, so no information depends on sound alone. */
export function CaptionBar({ audience = false, cues = true }: { audience?: boolean; cues?: boolean }) {
  const nova = useNova();
  const soundCaptions = useStore(s => s.settings.soundCaptions) && cues;
  const [cue, setCue] = useState<{ cue: Cue; at: number } | null>(null);
  useEffect(() => onCue(c => setCue({ cue: c, at: Date.now() })), []);
  useEffect(() => { if (!cue) return; const t = window.setTimeout(() => setCue(null), 2600); return () => window.clearTimeout(t); }, [cue]);
  const c = nova.caption;
  if (!c && !(cue && soundCaptions)) return null;
  return (
    <div className={`s-caption ${audience ? 'audience' : ''}`} role="status" aria-live="polite">
      {cue && soundCaptions && cue.cue !== 'select' && <div className="s-caption-cue"><Captions size={14} />{CUE_CAPTION[cue.cue]}</div>}
      {c && (
        <div className="s-caption-line">
          <span className="s-caption-who"><span className="s-nova-orb" aria-hidden="true"><i /><i /><i /></span>{c.speaker}</span>
          <p>{c.text.split(/(\s+)/).reduce<{ out: JSX.Element[]; pos: number }>((acc, w, i) => { const start = acc.pos; acc.pos += w.length; acc.out.push(/\S/.test(w) ? <span key={i} className={start < c.progress ? 'on' : ''}>{w}</span> : <span key={i}>{w}</span>); return acc; }, { out: [], pos: 0 }).out}</p>
          {!audience && <span className="s-row" style={{ gap: 4 }}><button className="s-iconbtn" onClick={replayLast} aria-label="Replay this line" title="Replay"><RotateCcw size={16} /></button><button className="s-iconbtn" onClick={stopNova} aria-label="Silence NOVA" title="Silence"><Square size={14} /></button></span>}
        </div>
      )}
    </div>
  );
}

const LOCAL_HOST = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);

/**
 * The ending of the final act: the screen collapses like a monitor switching off, then states what happened.
 * kind "simulated": the public rehearsal; "preview": the real agent in safe preview mode; "live": the real Mac,
 * which is shutting down while this shows.
 */
export function PowerOffScreen({ kind, onClose, onNext }: { kind: 'simulated' | 'preview' | 'live'; onClose?: () => void; onNext?: () => void }) {
  const run = useStore(s => s.run);
  const s = scenarioOf(run);
  const head = run.ledger[run.ledger.length - 1];
  useEffect(() => { if (!onClose) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className={`s-poweroff k-${kind}`} role="status" aria-live="assertive">
      <div className="s-poweroff-crt" aria-hidden="true"><i /></div>
      <div className="s-poweroff-text">
        <Power size={30} aria-hidden="true" />
        <span className="s-poweroff-k">{s.ref} · final step · {kind === 'live' ? 'Karan’s Mac is shutting down' : kind === 'preview' ? 'safe preview — nothing shuts down' : 'simulated'}</span>
        <h2>Powered off by its owner.</h2>
        <p>Pierre requested it. Karan authorized it on the device. Nothing happened automatically — and every step is in the ledger.</p>
        {head && <small className="s-mono">Ledger #{head.seq} · {head.hash.slice(0, 16)}</small>}
        <p className="s-poweroff-end">See the threat. Own the decision. Prove the response.</p>
        {kind !== 'live' && <span className="s-sim lg">{kind === 'preview' ? 'PREVIEW MODE — THE MAC STAYS ON' : LOCAL_HOST ? 'REHEARSAL — NO DEVICE INVOLVED' : 'SIMULATED — ON THE REAL MAC THE SCREEN IS NOW OFF'}</span>}
        {onClose && <button className="s-btn" onClick={onClose}>Turn the screen back on</button>}
        {onNext && <button className="s-btn ghost s-poweroff-next" onClick={onNext}>Continue</button>}
      </div>
    </div>
  );
}

/** The simulated final act's ending, driven by the shared rehearsal state (console and projector agree). */
export function SimPowerOff({ closable = true, onNext }: { closable?: boolean; onNext?: () => void }) {
  const mac = useStore(s => s.mac);
  const [hidden, setHidden] = useState<number | null>(null);
  if (!(mac.phase === 'result' && mac.result === 'approved') || hidden === mac.seq) return null;
  return <PowerOffScreen kind="simulated" onClose={closable ? () => setHidden(mac.seq) : undefined} onNext={onNext} />;
}
