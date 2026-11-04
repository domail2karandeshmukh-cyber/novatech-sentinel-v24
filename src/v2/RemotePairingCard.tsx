import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowRight, Check, Clock3, Copy, LockKeyhole, MonitorOff, Radio, ShieldCheck, UserRound, Wifi, XCircle } from 'lucide-react';
import { canRequestMacShutdown } from './macPowerPolicy';
import type { DemoRun, Role } from './demoEngine';
import './remote-pairing.css';

type RemoteStatus = {
  service: string; live: boolean; macOS: boolean; remoteUrl: string; fingerprint: string;
  pairingCode: string | null; pairingExpiresAt: number | null; controllerName: string | null;
  pairedUntil: number | null; connected: boolean; busy: boolean;
  recentActions: { at: string; event: string; actor: string }[];
};

const ADMIN_URL = 'http://127.0.0.1:43873';

export function RemotePairingCard({ run, role, onRole }: { run: DemoRun; role: Role; onRole: (role: Role) => void }) {
  const [remote, setRemote] = useState<RemoteStatus | null>(null);
  const [presenter, setPresenter] = useState('Pavan');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const eligible = canRequestMacShutdown(run, role);
  const localPage = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);

  const refresh = useCallback(async () => {
    if (!localPage) return;
    try {
      const response = await fetch(`${ADMIN_URL}/state`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
      const result: RemoteStatus = await response.json();
      if (!response.ok || result.service !== 'novatech-remote-agent') throw new Error('Remote agent unavailable.');
      setRemote(result);
    } catch { setRemote(null); }
  }, [localPage]);

  useEffect(() => {
    void refresh();
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => { void refresh(); }, 6000);
    return () => { window.clearInterval(clock); window.clearInterval(poll); };
  }, [refresh]);

  async function action(endpoint: '/pair' | '/revoke') {
    if (!remote || !localPage || busy) return;
    if (endpoint === '/pair' && !eligible) return;
    if (endpoint === '/revoke' && !window.confirm('Revoke Pavan’s access immediately? He will need a new code.')) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${ADMIN_URL}${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(endpoint === '/pair'
          ? { workflowClosed: run.status === 'closed', approved: run.events.some(event => event.stage === 'authorise' && event.kind === 'approval'), scenarioId: run.scenarioId, controllerName: presenter }
          : {}),
        signal: AbortSignal.timeout(6000),
      });
      const body: { error?: string } = await response.json();
      if (!response.ok) throw new Error(body.error || 'The Mac rejected the pairing request.');
      setMessage(endpoint === '/pair' ? 'A new code is active for five minutes. Pavan has 30 minutes of access after pairing.' : 'Remote presenter disconnected and access revoked.');
      await refresh();
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Request failed.'); }
    finally { setBusy(false); }
  }

  async function copyLink() {
    if (!remote) return;
    try { await navigator.clipboard.writeText(remote.remoteUrl); setMessage('Link copied. Ask Pavan to verify the certificate fingerprint with you before pairing.'); }
    catch { setMessage('Select and copy the controller link manually.'); }
  }

  const pairingSeconds = Math.max(0, Math.ceil(((remote?.pairingExpiresAt ?? 0) - now) / 1000));
  const activeSeconds = Math.max(0, Math.ceil(((remote?.pairedUntil ?? 0) - now) / 1000));
  return <section id="v2-remote-control" className="v2-remote-card" aria-label="Remote presenter pairing">
    <div className="v2-remote-top">
      <div className="v2-remote-title"><span className="v2-remote-emblem"><Wifi size={22}/></span><div><span className="v2-eyebrow">V2.3 / SECURE CLASSROOM PAIRING</span><h2>Let Pavan take the final step.</h2><p>Same-Wi-Fi presenter connection · 30-minute session · final decision remains on your Mac.</p></div></div>
      <span className={`v2-remote-mode ${remote?.live ? 'live' : remote ? 'preview' : ''}`}><span/>{remote?.live ? 'LIVE AGENT' : remote ? 'SAFE PREVIEW' : 'AGENT OFFLINE'}</span>
    </div>
    <div className="v2-remote-body">
      <div className="v2-remote-left">
        <div className="v2-remote-policy"><ShieldCheck size={18}/><span>Remote users can request a shutdown, but cannot bypass your Mac's Allow/Cancel confirmation.</span></div>
        {!localPage ? <p className="v2-remote-warning">Remote pairing must be enabled on the target Mac using its local NOVATECH app.</p>
          : !remote ? <div className="v2-remote-offline"><Radio size={21}/><b>Start the Remote Agent</b><p>From the project folder, use <code>npm run remote:preview</code>. After testing, you can install the opt-in background agent.</p><button onClick={() => void refresh()}>Check connection <ArrowRight size={14}/></button></div>
            : <>
              {!eligible && <div className="v2-remote-warning"><LockKeyhole size={15}/> Complete the ransomware rehearsal and select IT Operations to enable pairing. {run.status === 'closed' && role !== 'IT Operations' && <button onClick={() => onRole('IT Operations')}>Switch role</button>}</div>}
              <label className="v2-remote-label" htmlFor="v2-presenter-name">Authorized presenter name</label>
              <input id="v2-presenter-name" className="v2-remote-name" value={presenter} maxLength={48} onChange={e => setPresenter(e.target.value)}/>
              <button className="v2-remote-primary" disabled={!eligible || busy || remote.busy} onClick={() => void action('/pair')}><UserRound size={16}/> {remote.pairingCode || remote.connected ? 'Create a NEW pairing code' : 'Enable remote pairing'} <ArrowRight size={15}/></button>
              {remote.pairingCode && <div className="v2-remote-code"><small>ONE-TIME CODE · SHOW ONLY TO PAVAN</small><strong>{remote.pairingCode}</strong><span><Clock3 size={13}/> Code expires in {String(Math.floor(pairingSeconds/60)).padStart(2, '0')}:{String(pairingSeconds%60).padStart(2, '0')}</span></div>}
              {remote.connected && <div className="v2-remote-connected"><Check size={15}/> {remote.controllerName} is paired · {Math.ceil(activeSeconds/60)} min remaining</div>}
            </>}
        <div className="v2-remote-steps"><div><b>01</b> Pair only after approved incident closure.</div><div><b>02</b> Pavan uses the HTTPS link and one-time code.</div><div><b>03</b> He requests shutdown; your Mac asks you to Allow or Cancel.</div></div>
      </div>
      <div className="v2-remote-right">
        <div className="v2-remote-link-head"><Activity size={17}/><b>PRESENTER ACCESS</b></div>
        <label className="v2-remote-label">Secure classroom controller</label>
        <div className="v2-remote-url"><span>{remote?.remoteUrl || 'Start Remote Agent to generate a link'}</span><button title="Copy controller link" aria-label="Copy controller link" onClick={() => void copyLink()} disabled={!remote}><Copy size={16}/></button></div>
        <label className="v2-remote-label">Certificate SHA-256 fingerprint</label>
        <div className="v2-remote-fingerprint">{remote?.fingerprint || 'Not available until the agent starts'}</div>
        <p className="v2-remote-instructions">The controller uses a locally generated HTTPS certificate, which browsers won't automatically trust. Pavan should verify this fingerprint in the browser’s certificate details with you <b>before</b> allowing the connection. Both laptops must be on the same Wi-Fi, without client isolation. Never expose the link to the public internet.</p>
        <div className="v2-remote-actions"><button onClick={() => void refresh()}><Radio size={15}/> Refresh status</button><button className="revoke" onClick={() => void action('/revoke')} disabled={!remote || busy}><XCircle size={15}/> Revoke access</button></div>
        <div className="v2-remote-activity"><small><Activity size={13}/> RECENT CONTROL ACTIVITY</small>{(remote?.recentActions ?? []).slice(-3).reverse().map(event => <div key={`${event.at}-${event.event}`}><span>{event.event}</span><b>{event.actor}</b></div>)}{!remote?.recentActions.length && <p>Nothing requested yet.</p>}</div>
      </div>
    </div>
    {message && <div className="v2-remote-message" role="status"><MonitorOff size={15}/>{message}</div>}
  </section>;
}
