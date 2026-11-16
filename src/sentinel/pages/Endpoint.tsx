import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, CircleX, Copy, Laptop, LockKeyhole, MonitorSmartphone, Radio, ShieldCheck, Wifi, XCircle } from 'lucide-react';
import { pairingBody } from '../engine/governance';
import { useStore } from '../state/store';
import { macCan, macSim } from '../state/macsim';
import { useOnStage } from '../presenter/stageContext';
import { macEligibility, scenarioOf } from '../engine/incident';
import { GATES } from '../data/scenarios';
import { Avatar, ConfirmButton, Sim, clock, personMeta, useNow, useToast } from '../components/kit';
import { PowerOffScreen, SimPowerOff } from '../components/Overlays';
import CloudControls from './CloudControls';

const ADMIN_URL = 'http://127.0.0.1:43873';
const LOCAL = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);

type RemoteStatus = {
  service: string; live: boolean; macOS: boolean; remoteUrl: string; fingerprint: string; pairingCode: string | null; pairingExpiresAt: number | null;
  controllerName: string | null; pairedUntil: number | null; connected: boolean; busy: boolean; recentActions: { at: string; event: string; actor: string }[];
  /** Present only when the agent accepted the optional governance record (V2.4 agents). */
  governance?: { incidentId: string | null; scenario: string | null; reason: string | null; approvals: { gate: string; person: string; role: string; decision: string }[] };
};

export default function Endpoint() {
  const onStage = useOnStage();
  const run = useStore(s => s.run);
  const elig = macEligibility(run);
  return (
    <div className="s-page s-endpoint">
      <div className="s-pagehead">
        <div><h1 className="s-h1">Final step: power off for re-imaging</h1>
          <p className="s-lead" style={{ marginTop: 8 }}>The last follow-up of NT-SEC-041. FIN-WS-07 was isolated first so its memory evidence survived; after verification and closure the endpoint may be powered off for forensic imaging and re-imaging. <b>Karan’s MacBook is a classroom stand-in for FIN-WS-07.</b> Pierre can request shutdown from Windows through the public cloud relay or private LAN; only the Mac owner can approve. The simulation below never touches a device.</p></div>
        {LOCAL ? <span className="s-chip active"><Radio size={14} />Local copy on this computer</span> : <span className="s-chip active"><Radio size={14} />Public demo + opt-in real request</span>}
      </div>

      <div className="s-ep-grid">
        <section className="s-panel raised" data-tour="ep-eligibility" aria-labelledby="h-elig">
          <div className="s-panel-head"><div><h2 id="h-elig" className="s-h3">Unlocks only after the governed workflow</h2><p className="s-small" style={{ margin: '3px 0 0' }}>Checked from the incident record</p></div><span className={`s-chip ${elig.ok ? 'ok' : 'warn'}`}>{elig.ok ? 'Eligible' : 'Locked'}</span></div>
          <ul className="s-elig">{elig.checks.map(c => <li key={c.label} className={c.ok ? 'ok' : ''}>{c.ok ? <Check size={16} /> : <LockKeyhole size={15} />}{c.label}</li>)}</ul>
          {!elig.ok && <Link to="/incident" className="s-btn primary" style={{ marginTop: 12 }}>Complete the ransomware workflow<ArrowRight size={15} /></Link>}
        </section>
        <section className="s-panel" aria-labelledby="h-arch">
          <div className="s-panel-head"><h2 id="h-arch" className="s-h3">Who controls each step</h2></div>
          <ol className="s-chainflow">
            <li><Laptop size={18} /><span><b>Pierre’s Windows laptop</b><small>Edge or Chrome. Pairs with a 6-digit code (valid 5 min, max 5 tries), then holds a 30-minute session. Can only send a request.</small></span></li>
            <li><Wifi size={18} /><span><b>Secure connection</b><small>The tested cloud relay uses outbound HTTPS from the Mac—no exposed Mac port. A separately installed private-LAN controller is also available.</small></span></li>
            <li><MonitorSmartphone size={18} /><span><b>Karan’s Mac — local helper</b><small>Runs at login. Opens pairing only when Karan asks, only after the seven gates. Revocable at any moment.</small></span></li>
            <li><ShieldCheck size={18} /><span><b>Native approval on the Mac</b><small>Reject is the default; 30-second timeout; close or ignore = rejected. The SwiftUI window is opt-in; the proven macOS dialog stays the fallback.</small></span></li>
          </ol>
        </section>
      </div>

      {!LOCAL && !onStage && <CloudControls />}
      {LOCAL ? (onStage ? <LiveStatusOnStage /> : <LiveControls eligible={elig.ok} />) : null}
      <Simulation eligible={elig.ok} />
      {!onStage && <SimPowerOff />}

      <section className="s-panel" data-tour="ep-safety" style={{ marginTop: 16 }} aria-labelledby="h-safe">
        <div className="s-panel-head"><h2 id="h-safe" className="s-h3">Every failure keeps the Mac on</h2></div>
        <ul className="s-safety">
          {['Reject is the default button; Return and Escape both reject', 'No answer within 30 seconds = rejected', 'Closing the window = rejected', 'Pairing revoked or expired = request refused', 'Wrong or missing session token = refused', 'Helper crash or approval window failure = rejected', 'Public website can only queue a fixed request; it cannot directly control the Mac', 'Pierre can never run commands, browse files or approve on Karan’s behalf'].map(t => <li key={t}><ShieldCheck size={15} />{t}</li>)}
        </ul>
        <p className="s-small" style={{ marginBottom: 0 }}>Verified so far: Karan’s real Windows-to-Mac cloud request, macOS owner confirmation and shutdown. SwiftUI is optional and not part of that verified path. Full steps: <Link to="/guide" className="s-linkbtn">Demo guide</Link>.</p>
      </section>
    </div>
  );
}

/* ---------- Public preview: a complete, clearly simulated rehearsal of the flow ---------- */
function Simulation({ eligible }: { eligible: boolean }) {
  const now = useNow(250);
  const st = useStore(s => s.mac);
  const can = macCan(st, eligible, now);
  return (
    <section className="s-panel s-sim-panel" data-tour="ep-pairing" style={{ marginTop: 16 }} aria-labelledby="h-sim">
      <div className="s-panel-head"><div><h2 id="h-sim" className="s-h3">Rehearse the final act safely</h2><p className="s-small" style={{ margin: '3px 0 0' }}>A faithful simulation of pairing, request and owner decision. Nothing leaves this browser.</p></div><Sim /></div>
      <div className="s-sim-steps">
        <div className={`s-sim-step ${st.phase !== 'idle' ? 'done' : ''}`}>
          <span className="s-label">1 · Karan, on the Mac</span>
          {st.phase === 'idle' ? <button className="s-btn primary" disabled={!can.open} onClick={macSim.open}>Open 5-minute pairing</button>
            : <div><div className="s-code s-num">{st.code}</div><span className="s-small">{st.phase === 'code' ? `Expires in ${clock(st.codeUntil - now)}` : 'Code used — pairing closed'}</span></div>}
          {!eligible && <span className="s-small">Locked until the ransomware workflow is closed.</span>}
        </div>
        <div className={`s-sim-step ${['paired', 'pending', 'result'].includes(st.phase) ? 'done' : ''}`}>
          <span className="s-label">2 · Pierre, on Windows</span>
          {st.phase === 'code' ? <button className="s-btn" disabled={!can.pair} onClick={macSim.pair}>Enter the code and pair</button>
            : st.sessionUntil ? <div><b className="s-teal">Paired</b><span className="s-small"> · session {clock(Math.max(0, st.sessionUntil - now))} left</span></div> : <span className="s-small">Waiting for a code</span>}
        </div>
        <div className={`s-sim-step ${['pending', 'result'].includes(st.phase) ? 'done' : ''}`}>
          <span className="s-label">3 · Pierre sends the request</span>
          {can.request ? <button className="s-btn danger" onClick={macSim.request}>Request shutdown (request only)</button> : <span className="s-small">{st.phase === 'pending' ? 'Waiting for Karan’s decision…' : 'Needs an active session'}</span>}
        </div>
        <div className="s-sim-step">
          <span className="s-label">Karan can end it at any time</span>
          <button className="s-btn ghost" disabled={!can.revoke} onClick={macSim.revoke}><XCircle size={15} />Revoke access</button>
        </div>
      </div>
      {st.phase === 'pending' && <NativePreview key={st.deadline} secondsLeft={Math.max(0, Math.ceil((st.deadline - now) / 1000))} sessionUntil={st.sessionUntil} onDecide={macSim.decide} />}
      {st.phase === 'result' && (
        <div className={`s-sim-result r-${st.result}`} role="status">
          {st.result === 'approved' ? <><Check size={18} /><span><b>Authorized by the owner, on the device.</b> On Karan’s real Mac the helper now asks macOS to shut down (macOS may still ask about unsaved work). Here nothing shuts down.</span></>
            : st.result === 'rejected' ? <><CircleX size={18} /><span><b>Rejected.</b> The Mac stays on. Pierre sees “Karan rejected the shutdown request”.</span></>
              : <><CircleX size={18} /><span><b>Timed out after 30 seconds.</b> Treated as a rejection: the Mac stays on.</span></>}
        </div>
      )}
    </section>
  );
}

/** A web preview of the native SwiftUI window's design. Labelled — it never pretends to be the real macOS prompt. */
function NativePreview({ secondsLeft, sessionUntil, onDecide }: { secondsLeft: number; sessionUntil: number; onDecide: (d: 'approved' | 'rejected') => void }) {
  const run = useStore(s => s.run);
  const s = scenarioOf(run);
  const rejectRef = useRef<HTMLButtonElement>(null);
  const [armed, setArmed] = useState(false);
  useEffect(() => { rejectRef.current?.focus(); const t = window.setTimeout(() => setArmed(true), 1500); return () => window.clearTimeout(t); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); onDecide('rejected'); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onDecide]);
  const chain = GATES.map(g => {
    if (g.key === 'authorize') return { gate: g.name, who: run.approvals.map(a => personMeta(a.acting).name).join(' + ') || '—' };
    const rec = run.records[g.key as Exclude<typeof g.key, 'authorize'>];
    return { gate: g.name, who: rec ? personMeta(rec.by).name : '—' };
  });
  const pct = (secondsLeft / 30) * 100;
  return (
    <div className="s-native-wrap" data-tour="ep-native">
      <p className="s-native-banner">Web preview of the native window design · on the real demo this window appears only on Karan’s Mac</p>
      <div className="s-native" role="dialog" aria-modal="false" aria-labelledby="s-native-title">
        <div className="s-native-head">
          <span className="s-native-brand">NOVATECH SENTINEL</span>
          <h3 id="s-native-title">Endpoint action authorization</h3>
          <div className="s-native-states"><span className="done"><Check size={13} />Remote request received</span><span className="now">Owner approval pending</span></div>
        </div>
        <div className="s-native-body">
          <div className="s-native-ring" role="timer" aria-label={`${secondsLeft} seconds left before automatic rejection`} style={{ ['--p' as string]: `${pct}%` }}><b className="s-num">{secondsLeft}</b><small>s</small></div>
          <dl className="s-native-kv">
            <dt>Device</dt><dd>Karan’s MacBook Air · stand-in for FIN-WS-07 · owner Karan Deshmukh</dd>
            <dt>Requested by</dt><dd><Avatar id="pierre" size="sm" /> Pierre Sauvage <small>(name from the paired LAN session — not enterprise sign-in)</small></dd>
            <dt>Incident</dt><dd><span className="s-mono">{s.ref}</span> · {s.title}</dd>
            <dt>Reason</dt><dd>Power off the isolated endpoint for forensic imaging and re-imaging — closure follow-up, memory evidence already verified</dd>
            <dt>Connection</dt><dd>Paired LAN session · TLS · expires {new Date(sessionUntil).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</dd>
          </dl>
        </div>
        <ul className="s-native-chain" aria-label="Governance record (simulated classroom data)">{chain.map(c => <li key={c.gate}><span>{c.gate}</span><b>{c.who}</b></li>)}</ul>
        <p className="s-native-warn">Shuts down this Mac. Open apps will close — save your work first.</p>
        <div className="s-native-actions">
          <button ref={rejectRef} className="s-btn lg s-native-reject" onClick={() => onDecide('rejected')}>Reject <small>(default)</small></button>
          <span className="s-spacer" />
          <button className="s-btn danger lg" disabled={!armed} onClick={() => onDecide('approved')}>Authorize shutdown</button>
        </div>
      </div>
    </div>
  );
}

/** What the projector shows during the real final act: status only. The one-time code, the controller link and the
 *  certificate fingerprint stay on Karan's own screen, so nobody in the room can pair before Pierre. */
function LiveStatusOnStage() {
  const [remote, setRemote] = useState<RemoteStatus | null>(null);
  // The ending appears when the agent records the owner's approval after this screen opened (never for older events).
  const [ending, setEnding] = useState<'preview' | 'live' | null>(null);
  const openedAt = useRef(Date.now());
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${ADMIN_URL}/state`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
        const j: RemoteStatus = await r.json();
        const ok = r.ok && j.service === 'novatech-remote-agent';
        setRemote(ok ? j : null);
        const fresh = ok ? (j.recentActions ?? []).filter(a => Date.parse(a.at) > openedAt.current) : [];
        if (fresh.some(a => a.event === 'macOS shutdown requested')) setEnding('live');
        else if (fresh.some(a => a.event === 'Preview completed')) setEnding('preview');
      } catch { setRemote(null); }
    };
    void load(); const t = window.setInterval(() => void load(), 1500); return () => window.clearInterval(t);
  }, []);
  const status = !remote ? 'Karan’s Mac is controlling pairing from his own screen.'
    : remote.connected ? `${remote.controllerName ?? 'Pierre'} is paired. Any request appears as an approval window on Karan’s Mac — Reject is the default.`
      : remote.pairingCode ? 'A one-time pairing code is open on Karan’s Mac (shown only to Pierre, not on this screen).'
        : 'Pairing is closed. Karan opens it from his Mac when the seven gates are complete.';
  return (
    <section className="s-panel raised" style={{ marginTop: 16 }} aria-labelledby="h-live-stage">
      <div className="s-panel-head"><div><h2 id="h-live-stage" className="s-h3">Live pairing — Karan’s Mac</h2><p className="s-small" style={{ margin: '3px 0 0' }}>Codes, links and fingerprints are never shown on the projector.</p></div>
        <span className={`s-chip ${remote?.connected ? 'ok' : ''}`}>{remote?.connected ? 'Pierre paired' : remote?.pairingCode ? 'Code open on the Mac' : 'Not paired'}</span></div>
      <p style={{ margin: 0 }}>{status}</p>
      {ending && <PowerOffScreen kind={ending} onClose={ending === 'preview' ? () => { openedAt.current = Date.now(); setEnding(null); } : undefined} />}
    </section>
  );
}

/* ---------- Local copy on Karan's Mac: the proven V2.3 helper endpoints ---------- */
function LiveControls({ eligible }: { eligible: boolean }) {
  const run = useStore(s => s.run);
  const toast = useToast();
  const now = useNow();
  const [remote, setRemote] = useState<RemoteStatus | null>(null);
  const [presenter, setPresenter] = useState('Pierre Sauvage');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${ADMIN_URL}/state`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
      const j: RemoteStatus = await r.json();
      if (!r.ok || j.service !== 'novatech-remote-agent') throw new Error();
      setRemote(j);
    } catch { setRemote(null); }
  }, []);
  useEffect(() => { void refresh(); const t = window.setInterval(() => void refresh(), 5000); return () => window.clearInterval(t); }, [refresh]);
  async function act(path: '/pair' | '/revoke') {
    if (!remote || busy) return;
    setBusy(true);
    try {
      const body = path === '/pair' ? pairingBody(run, presenter) : {};
      const r = await fetch(`${ADMIN_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(6000) });
      const j: { error?: string } = await r.json();
      if (!r.ok) throw new Error(j.error || 'The Mac refused the request.');
      toast('ok', path === '/pair' ? 'New code active for five minutes. Pierre gets 30 minutes after pairing.' : 'Remote access revoked.');
      await refresh();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Request failed.'); }
    finally { setBusy(false); }
  }
  const codeLeft = Math.max(0, (remote?.pairingExpiresAt ?? 0) - now);
  const sessionLeft = Math.max(0, (remote?.pairedUntil ?? 0) - now);
  return (
    <section className="s-panel raised" style={{ marginTop: 16 }} aria-labelledby="h-live">
      <div className="s-panel-head"><div><h2 id="h-live" className="s-h3">Live pairing — this Mac</h2><p className="s-small" style={{ margin: '3px 0 0' }}>Talks only to the helper on 127.0.0.1. Preview mode never shuts anything down.</p></div>
        <span className={`s-chip ${remote?.live ? 'crit' : remote ? 'ok' : ''}`}>{remote?.live ? 'LIVE agent' : remote ? 'Safe preview agent' : 'Agent offline'}</span></div>
      {!remote ? (
        <div className="s-empty"><b>The remote agent is not running</b>Start it with <code>npm run remote:preview</code> (safe) or install the background agent. Then <button className="s-linkbtn" onClick={() => void refresh()}>check again</button>.</div>
      ) : (
        <div className="s-live-grid">
          <div className="s-stack">
            {!eligible && <p className="s-policy warn"><LockKeyhole size={16} /><span>Close the director-approved ransomware workflow first.</span></p>}
            <label className="s-field"><span>Authorised presenter name</span><input className="s-input" value={presenter} maxLength={48} onChange={e => setPresenter(e.target.value)} /></label>
            <button className="s-btn primary" disabled={!eligible || busy || remote.busy} onClick={() => void act('/pair')}>{remote.pairingCode || remote.connected ? 'Create a new pairing code' : 'Enable remote pairing'}</button>
            {remote.pairingCode && <div className="s-code-card"><span className="s-label">One-time code — show only to Pierre</span><div className="s-code s-num">{remote.pairingCode}</div><span className="s-small">Expires in {clock(codeLeft)}</span></div>}
            {remote.connected && <p className="s-policy ok"><Check size={16} /><span>{remote.controllerName} is paired · {clock(sessionLeft)} left</span></p>}
            {remote.governance && <p className="s-policy info"><ShieldCheck size={16} /><span>The Mac holds the governance record for {remote.governance.incidentId ?? 'this incident'} ({remote.governance.approvals.length} signed steps). The approval window shows it to Karan.</span></p>}
            <ConfirmButton className="s-btn ghost" confirmLabel="Click again: Pierre needs a new code" onConfirm={() => void act('/revoke')}><XCircle size={15} />Revoke access</ConfirmButton>
          </div>
          <div className="s-stack">
            <span className="s-label">Controller link for Pierre (same Wi-Fi)</span>
            <div className="s-row"><code className="s-url">{remote.remoteUrl}</code><button className="s-iconbtn" aria-label="Copy link" onClick={() => { void navigator.clipboard?.writeText(remote.remoteUrl); toast('ok', 'Link copied. Verify the fingerprint together before pairing.'); }}><Copy size={16} /></button></div>
            <span className="s-label">Certificate SHA-256 fingerprint — compare in person</span>
            <code className="s-fp">{remote.fingerprint}</code>
            <span className="s-label">Recent activity</span>
            <ul className="s-activity">{(remote.recentActions ?? []).slice(-4).reverse().map(a => <li key={a.at + a.event}><span>{a.event}</span><b>{a.actor}</b></li>)}{!remote.recentActions?.length && <li className="s-small">Nothing yet.</li>}</ul>
          </div>
        </div>
      )}
    </section>
  );
}
