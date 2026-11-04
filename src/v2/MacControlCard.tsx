import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, CircleAlert, ExternalLink, LockKeyhole, MonitorOff, Radio, ShieldCheck, Terminal } from 'lucide-react';
import type { DemoRun, Role } from './demoEngine';
import { canRequestMacShutdown } from './macPowerPolicy';
import './mac-control.css';

const HELPER_URL = 'http://127.0.0.1:43871';
const CONFIRMATION = 'SHUT DOWN MY MAC';

type HelperStatus = { service: string; live: boolean; macOS: boolean; busy: boolean };

export function MacControlCard({ run, role, onRole }: { run: DemoRun; role: Role; onRole: (role: Role) => void }) {
  const [helper, setHelper] = useState<HelperStatus | null>(null);
  const [sessionCode, setSessionCode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const ready = canRequestMacShutdown(run, role);
  const localPage = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);

  const checkHelper = useCallback(async () => {
    if (!localPage) return;
    try {
      const response = await fetch(`${HELPER_URL}/health`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error('Helper not available.');
      const result: HelperStatus = await response.json();
      if (result.service !== 'novatech-mac-helper') throw new Error('Unexpected local service.');
      setHelper(result);
      setMessage(null);
    } catch {
      setHelper(null);
      setMessage({ error: true, text: 'Helper is offline. Start it in a second Terminal window, then click Check connection.' });
    }
  }, [localPage]);

  useEffect(() => { void checkHelper(); }, [checkHelper]);

  async function requestShutdown() {
    if (!ready || !helper || !localPage || pending || !acknowledged || confirmation !== CONFIRMATION || !sessionCode.trim()) return;
    if (!window.confirm(helper.live
      ? 'FINAL WEB CHECK: Your Mac may shut down after the separate macOS confirmation. Have you saved all work?'
      : 'Send a safe rehearsal request? Preview mode cannot shut down your Mac.')) return;
    setPending(true);
    setMessage({ error: false, text: helper.live ? 'Waiting for the separate macOS confirmation window. You can cancel there.' : 'Testing the local helper without any device action…' });
    try {
      const response = await fetch(`${HELPER_URL}/shutdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Novatech-Token': sessionCode.trim() },
        body: JSON.stringify({ confirmation: CONFIRMATION, approvedWorkflow: true, scenario: run.scenarioId }),
        signal: AbortSignal.timeout(90000),
      });
      const result: { status?: string; error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error || 'Helper refused the request.');
      setMessage({ error: false, text: result.status === 'preview' ? 'Preview passed. No Mac shutdown command was run.'
        : result.status === 'cancelled' ? 'You cancelled the Mac shutdown. Your computer remains on.'
          : 'macOS accepted the shutdown request. Open apps may still prevent shutdown.' });
      setConfirmation('');
      setAcknowledged(false);
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : 'Could not reach the helper.' });
    } finally { setPending(false); }
  }

  return <section className="v2-mac-card" id="v2-mac-control" aria-label="Mac Control Helper">
    <div className="v2-mac-header">
      <div className="v2-mac-heading"><span className="v2-mac-icon"><MonitorOff size={22}/></span><div><span className="v2-eyebrow">OPTIONAL PHYSICAL ENDPOINT / MAC CONTROL</span><h2>Final command. Human confirmation.</h2><p>Connect the local Mac Helper to demonstrate a real shutdown only after the seven risk-management gates are complete.</p></div></div>
      <span className={`v2-mac-state ${helper?.live ? 'live' : helper ? 'preview' : 'offline'}`}><span/>{helper?.live ? 'LIVE HELPER' : helper ? 'PREVIEW HELPER' : 'HELPER OFFLINE'}</span>
    </div>
    <div className="v2-mac-gates">
      <div className={run.status === 'closed' ? 'passed' : ''}><ShieldCheck size={15}/><span>Seven gates closed</span>{run.status === 'closed' ? <Check size={14}/> : <LockKeyhole size={13}/>}</div>
      <div className={role === 'IT Operations' ? 'passed' : ''}><LockKeyhole size={15}/><span>IT Operations role</span>{role === 'IT Operations' ? <Check size={14}/> : <LockKeyhole size={13}/>}</div>
      <div className={helper ? 'passed' : ''}><Radio size={15}/><span>Local Mac Helper</span>{helper ? <Check size={14}/> : <LockKeyhole size={13}/>}</div>
    </div>
    <div className="v2-mac-inner">
      <div className="v2-mac-intro">
        {!localPage ? <div className="v2-mac-alert"><CircleAlert size={18}/> This feature runs only from the app opened locally on your Mac, not from a deployed website.</div>
          : run.status !== 'closed' ? <div className="v2-mac-alert"><LockKeyhole size={17}/> Finish the ransomware scenario, including Director approval and independent verification, to unlock this control.</div>
            : run.scenarioId !== 'ransomware' ? <div className="v2-mac-alert"><LockKeyhole size={17}/> The physical Mac shutdown option is limited to the ransomware training scenario.</div>
              : role !== 'IT Operations' ? <button className="v2-mac-role-btn" onClick={() => onRole('IT Operations')}><ShieldCheck size={17}/> Switch to IT Operations to request the approved action <ArrowRight size={15}/></button>
                : <div className="v2-mac-alert ready"><Check size={17}/> Workflow complete. IT Operations may request a final device action using the local helper.</div>}
        <div className="v2-mac-steps">
          <div><b>01</b><span>Open a <strong>second Terminal</strong> in this project folder.</span></div>
          <div><b>02</b><span>Test first with <code>npm run helper:mac</code>. For an actual shutdown, restart the helper using <code>npm run helper:mac:live</code>.</span></div>
          <div><b>03</b><span>Paste the temporary session code from Terminal, then approve the action on macOS.</span></div>
        </div>
        <button className="v2-mac-check" onClick={() => void checkHelper()} disabled={!localPage}><Radio size={15}/> Check connection <ArrowRight size={14}/></button>
      </div>
      <div className="v2-mac-form">
        <label htmlFor="v2-mac-token">Temporary code from Mac Terminal</label>
        <input id="v2-mac-token" type="password" autoComplete="off" value={sessionCode} onChange={e => setSessionCode(e.target.value)} placeholder="Paste your helper session code" />
        <label htmlFor="v2-mac-phrase">Type <strong>{CONFIRMATION}</strong> to unlock the request</label>
        <input id="v2-mac-phrase" autoComplete="off" value={confirmation} onChange={e => setConfirmation(e.target.value)} placeholder={CONFIRMATION} />
        <label className="v2-mac-consent"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)}/><span>I have saved my work. I understand this could actually shut down my Mac, ending the presentation.</span></label>
        <button className={`v2-mac-shutdown-btn ${helper?.live ? 'danger' : ''}`} disabled={!ready || !helper || !localPage || pending || helper.busy || !sessionCode.trim() || !acknowledged || confirmation !== CONFIRMATION} onClick={() => void requestShutdown()}><MonitorOff size={17}/>{pending ? 'Waiting for Mac…' : helper?.live ? 'Request REAL Mac shutdown' : 'Test request (no shutdown)'}<ExternalLink size={13}/></button>
        <p className="v2-mac-disclaimer"><AlertTriangle size={13}/> A local browser role switch is for the classroom only. The temporary token and macOS dialog provide the actual on-device safeguards. Nothing runs on its own.</p>
        {message && <div role="status" className={`v2-mac-message ${message.error ? 'error' : 'success'}`}><Terminal size={15}/>{message.text}</div>}
      </div>
    </div>
  </section>;
}
