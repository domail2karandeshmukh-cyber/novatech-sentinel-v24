import { useCallback, useEffect, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { clock, useNow } from '../components/kit';

/** Real, opt-in remote request. Browser never executes shutdown; the Mac helper decides. */
export default function CloudControls() {
  const [available, setAvailable] = useState(false);
  const [checked, setChecked] = useState(false);
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [until, setUntil] = useState(0);
  const [requestId, setRequestId] = useState('');
  const [state, setState] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const now = useNow(1000);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/remote?action=health', { signal: controller.signal, cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { setAvailable(j?.service === 'novatech-cloud-relay' && j.available === true); setChecked(true); })
      .catch(() => setChecked(true));
    return () => controller.abort();
  }, []);
  const cloud = useCallback(async (action: string, body?: object, authorization = token) => {
    const response = await fetch(`/api/remote?action=${action}`, {
      method: body ? 'POST' : 'GET',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error ?? 'Cloud relay request failed.');
    return result;
  }, [token]);
  async function pair() {
    setBusy(true); setMessage('');
    try {
      const result = await cloud('pair', { code: code.trim() }, '');
      setToken(result.token); setUntil(result.expiresAt); setState('paired'); setCode('');
      setMessage('Paired with Karan’s Mac. Pairing alone never triggers shutdown.');
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Pairing failed.'); }
    finally { setBusy(false); }
  }
  async function request() {
    if (!confirm || !token || until <= Date.now()) return;
    setBusy(true); setMessage('');
    try {
      const result = await cloud('request', { confirmation: 'REQUEST MAC SHUTDOWN' });
      setRequestId(result.id); setState('pending');
      setMessage('Request queued. Karan must decide on his physical Mac.');
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Request failed.'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!requestId || !token) return;
    let active = true;
    const poll = async () => {
      try {
        const result = await cloud(`status&id=${encodeURIComponent(requestId)}`);
        if (active) setState(result.status);
      } catch (err) { if (active) setMessage(err instanceof Error ? err.message : 'Status unavailable.'); }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [requestId, token, cloud]);
  const liveSession = Boolean(token && until > now);
  return (
    <section className="s-panel raised" style={{ marginTop: 16 }} aria-labelledby="h-cloud">
      <div className="s-panel-head">
        <div><h2 id="h-cloud" className="s-h3">REAL cloud pairing · Pavan on Windows</h2>
          <p className="s-small">Public website → authenticated cloud relay → Mac background helper → Karan’s physical approval. This section is separate from the simulation.</p></div>
        <span className={`s-chip ${available ? 'ok' : 'warn'}`}>{!checked ? 'Checking' : available ? 'Relay available' : 'Relay not configured'}</span>
      </div>
      {!available ? <p className="s-policy warn"><LockKeyhole size={16} /><span>Real requests are unavailable. The simulation below remains safe to use.</span></p> : (
        <div className="s-stack">
          <p className="s-small">Only after the director-approved incident workflow is complete, Karan opens <code>http://127.0.0.1:43873/</code> on his Mac and privately gives Pavan the five-minute code.</p>
          {!liveSession ? <div className="s-row"><label className="s-field"><span>Six-digit code from Karan’s Mac</span>
            <input className="s-input" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
            <button className="s-btn primary" disabled={busy || code.length !== 6} onClick={() => void pair()}>Pair with Karan’s Mac</button></div> : <>
            <p className="s-policy ok"><ShieldCheck size={16} /><span>Pavan Sanam paired · {clock(until - now)} remaining · Karan’s approval still required</span></p>
            <label className="s-field"><span><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} /> I understand this requests a REAL shutdown of Karan’s Mac, subject to his physical approval.</span></label>
            <button className="s-btn danger" disabled={busy || !confirm || Boolean(requestId)} onClick={() => void request()}>Request REAL Mac shutdown (owner must approve)</button>
            {requestId && <p className="s-small" role="status">Request <code>{requestId.slice(0, 8)}</code> · {state === 'approved-shutdown-requested' ? 'Mac reported macOS shutdown was requested.' : state === 'rejected' ? 'Karan rejected the request; Mac remains on.' : state === 'failed' ? 'Request failed; Mac should remain on.' : state === 'delivered' ? 'Delivered to Mac; waiting for owner decision.' : 'Waiting for Mac agent; do not assume it shut down.'}</p>}
          </>}
          {message && <p className="s-small" role="status">{message}</p>}
        </div>
      )}
    </section>
  );
}
