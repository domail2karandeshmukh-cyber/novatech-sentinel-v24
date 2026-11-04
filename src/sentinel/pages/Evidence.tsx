import { useMemo, useState } from 'react';
import { Download, Fingerprint, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useStore } from '../state/store';
import { HASH_ROUTING } from '../env';
import { scenarioOf, verifyLedger } from '../engine/incident';
import type { LedgerEvent } from '../engine/incident';
import { LedgerList } from '../components/Incident';
import { Sim, useToast } from '../components/kit';
import { play } from '../audio/sfx';

export default function Evidence() {
  const run = useStore(s => s.run);
  const toast = useToast();
  const s = scenarioOf(run);
  const [result, setResult] = useState<ReturnType<typeof verifyLedger> | null>(null);
  const [tamper, setTamper] = useState<{ seq: number; result: ReturnType<typeof verifyLedger> } | null>(null);
  const actors = useMemo(() => new Set(run.ledger.filter(e => e.actor !== 'system').map(e => e.actorName)).size, [run.ledger]);
  const verify = () => { const v = verifyLedger(run.ledger); setResult(v); play(v.ok ? 'verified' : 'approvalReturned'); };
  const tamperTest = () => {
    if (run.ledger.length < 3) { toast('error', 'Record a few decisions first, then try the tamper test.'); return; }
    const seq = Math.max(2, Math.floor(run.ledger.length / 2));
    const copy: LedgerEvent[] = run.ledger.map(e => e.seq === seq ? { ...e, note: `${e.note} (edited afterwards)` } : e);
    setTamper({ seq, result: verifyLedger(copy) });
  };
  const exportJson = () => {
    const payload = { disclaimer: 'NOVATECH Sentinel V2.4 public demo. Local, simulated classroom record — not an authenticated production audit ledger.', exportedAt: new Date().toISOString(), incident: { ref: s.ref, title: s.title, scenario: s.id }, chain: verifyLedger(run.ledger), run };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `novatech-${s.ref.toLowerCase()}-evidence.json`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('ok', 'Evidence exported as JSON.');
  };
  return (
    <div className="s-page">
      <div className="s-pagehead">
        <div><h1 className="s-h1">Evidence ledger</h1><p className="s-lead" style={{ marginTop: 8 }}>Every decision for <span className="s-mono">{s.ref}</span>, in order, with who took it and why. Each entry carries the SHA-256 fingerprint of the one before it, so an edit anywhere is detectable.</p></div>
        <Sim large>LOCAL SIMULATED LEDGER</Sim>
      </div>
      <div className="s-ev-stats">
        <div><span className="s-label">Entries</span><b>{run.ledger.length}</b></div>
        <div><span className="s-label">People who signed</span><b>{actors}</b></div>
        <div><span className="s-label">Returned for revision</span><b>{run.revisions}</b></div>
        <div><span className="s-label">Chain head</span><b className="s-mono">{run.ledger.length ? run.ledger[run.ledger.length - 1].hash.slice(0, 12) : '—'}</b></div>
      </div>
      <section className="s-panel raised" data-tour="ledger-verify" aria-labelledby="h-v" style={{ marginBottom: 16 }}>
        <div className="s-panel-head"><div><h2 id="h-v" className="s-h3">Verify the chain</h2><p className="s-small" style={{ margin: '3px 0 0' }}>Recomputes every fingerprint in this browser</p></div>
          <div className="s-row wrap"><button className="s-btn primary" onClick={verify}><Fingerprint size={16} />Verify chain</button><button className="s-btn" onClick={tamperTest}><ShieldAlert size={16} />Tamper test</button>{!HASH_ROUTING && <button className="s-btn" onClick={exportJson}><Download size={16} />Export JSON</button>}</div></div>
        {result && <p className={`s-policy ${result.ok ? 'ok' : 'crit'}`} role="status">{result.ok ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}<span>{result.ok ? `Chain intact — ${result.checked} entries recomputed. Head ${result.head.slice(0, 16)}…` : `Chain broken at entry #${result.brokenAt}.`}</span></p>}
        {tamper && <p className="s-policy warn" role="status"><ShieldAlert size={16} /><span>Tamper test on a copy: one word added to entry #{tamper.seq}. Verification {tamper.result.ok ? 'passed (unexpected)' : `fails at entry #${tamper.result.brokenAt}`} — the real ledger is untouched.</span></p>}
        <p className="s-small" style={{ margin: 0 }}>In the enterprise workspace the same chain lives in the database, where updates and deletions are refused outright.</p>
      </section>
      <section className="s-panel" data-tour="ledger-list" aria-label="Ledger entries"><LedgerList ledger={run.ledger} details /></section>
    </div>
  );
}
