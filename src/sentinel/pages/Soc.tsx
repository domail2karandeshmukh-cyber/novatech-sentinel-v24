import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Cloud, Laptop, Landmark, Server, ShieldCheck, Wifi } from 'lucide-react';
import { useStore } from '../state/store';
import { gateDone, scenarioOf } from '../engine/incident';
import { ASSETS } from '../data/company';
import type { Asset } from '../data/company';
import { Drawer, Sim, timeOf } from '../components/kit';
import { Trajectory, KriMeters } from '../components/Charts';

type Alert = { id: string; at: string; title: string; source: string; severity: 'critical' | 'high' | 'medium' | 'low'; asset: string; status: string };

const TIMELINES = {
  ransomware: [
    ['T−18 min', 'Phishing email with an invoice attachment delivered to a finance mailbox'],
    ['T−11 min', 'Attachment opened on FIN-WS-07; macro launches a script'],
    ['T−6 min', 'Privileged token used to map the finance shared drive'],
    ['T−90 s', 'Encryption burst: 1,240 files renamed with a new extension'],
    ['T 0', 'EDR raises the critical alert; Sentinel opens NT-SEC-041'],
  ],
  cloud: [
    ['T−25 min', 'Provider status page: degraded storage in one availability zone'],
    ['T−12 min', 'API latency p95 rises above 1 s'],
    ['T−10 min', 'Error rate passes 2 % (warning)'],
    ['T−2 min', 'Error rate 7.4 %, 61 client accounts affected'],
    ['T 0', 'Monitor raises the alert; Sentinel opens NT-OPS-018'],
  ],
  payments: [
    ['T−3 d', 'Look-alike domain registered (one letter different from a supplier)'],
    ['T−2 d', 'Unusual sign-in to the Accounts Payable mailbox from a new location'],
    ['T−2 d', 'Mailbox rule created: forward “invoice” emails externally'],
    ['T−20 h', 'Supplier “bank detail change” email received'],
    ['T 0', 'Payment rule flags the IBAN change; Sentinel opens NT-FIN-027'],
  ],
} as const;

const ICON: Record<Asset['kind'], JSX.Element> = { endpoint: <Laptop size={16} />, server: <Server size={16} />, cloud: <Cloud size={16} />, saas: <Cloud size={16} />, network: <Wifi size={16} />, fleet: <Laptop size={16} />, 'demo-device': <Laptop size={16} /> };

export default function Soc() {
  const run = useStore(s => s.run);
  const s = scenarioOf(run);
  const [asset, setAsset] = useState<Asset | null>(null);
  const base = run.startedAt ? Date.parse(run.startedAt) : Date.now();
  const iso = (offsetMin: number) => new Date(base + offsetMin * 60_000).toISOString();
  const alerts: Alert[] = [
    ...(run.status !== 'ready' ? [{ id: s.ref, at: run.startedAt!, title: s.title, source: s.signal.split(' · ')[0], severity: s.severity === 'Critical' ? 'critical' as const : 'high' as const, asset: s.assetId, status: run.status === 'closed' ? 'Closed' : gateDone(run, 'execute') ? 'Contained' : 'Open — owned' }] : []),
    { id: 'AL-2291', at: iso(-42), title: 'Impossible-travel sign-in blocked by MFA', source: 'Identity provider', severity: 'medium', asset: 'M365-TEN', status: 'Auto-resolved' },
    { id: 'AL-2288', at: iso(-95), title: 'VPN firmware out of date', source: 'Vulnerability scan', severity: 'medium', asset: 'VPN-GW-01', status: 'Task overdue (Pierre)' },
    { id: 'AL-2279', at: iso(-240), title: 'Backup job exceeded its window', source: 'Backup monitor', severity: 'low', asset: 'STBY-EU', status: 'Acknowledged' },
  ];
  return (
    <div className="s-page">
      <div className="s-pagehead">
        <div><h1 className="s-h1">Security operations</h1><p className="s-lead" style={{ marginTop: 8 }}>Nadia’s view: the alert queue, what happened in order, and which assets depend on what. All telemetry here is synthetic.</p></div>
        <Sim large />
      </div>
      <div className="s-soc-grid">
        <section className="s-panel span-7" data-tour="soc-queue" aria-labelledby="h-q">
          <div className="s-panel-head"><h2 id="h-q" className="s-h3">Alert queue</h2><span className="s-small">{alerts.length} alerts · newest first</span></div>
          <div className="s-table-wrap"><table className="s-table">
            <thead><tr><th>Time</th><th>Alert</th><th>Severity</th><th>Asset</th><th>Status</th></tr></thead>
            <tbody>{alerts.map(a => (
              <tr key={a.id} className="clickable" onClick={() => setAsset(ASSETS.find(x => x.id === a.asset) ?? null)}>
                <td className="s-num">{timeOf(a.at)}</td>
                <td><b>{a.title}</b><div className="s-small"><span className="s-mono">{a.id}</span> · {a.source}</div></td>
                <td><span className={`s-chip ${a.severity === 'critical' ? 'crit' : a.severity === 'high' ? 'warn' : ''}`}>{a.severity}</span></td>
                <td className="s-mono">{a.asset}</td><td>{a.status}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {run.status === 'ready' && <p className="s-small" style={{ marginTop: 10 }}>No incident running. <Link to="/incident" className="s-linkbtn">Start a scenario<ArrowRight size={14} /></Link></p>}
        </section>
        <section className="s-panel span-5" data-tour="soc-timeline" aria-labelledby="h-t">
          <div className="s-panel-head"><h2 id="h-t" className="s-h3">Indicator timeline · {s.ref}</h2><Sim /></div>
          <ol className="s-timeline">{TIMELINES[s.id].map(([t, d]) => <li key={t + d}><span className="s-num">{t}</span><span>{d}</span></li>)}</ol>
        </section>
        <section className="s-panel span-7" aria-labelledby="h-traj2"><div className="s-panel-head"><h2 id="h-traj2" className="s-h3">Signal intensity</h2></div><Trajectory run={run} /></section>
        <section className="s-panel span-5" aria-labelledby="h-k"><div className="s-panel-head"><h2 id="h-k" className="s-h3">Incident indicators</h2></div><KriMeters kris={s.kris} /></section>
        <section className="s-panel span-12" aria-labelledby="h-assets">
          <div className="s-panel-head"><div><h2 id="h-assets" className="s-h3">Assets and endpoints</h2><p className="s-small" style={{ margin: '3px 0 0' }}>Criticality 1–4 · illustrative asset inventory</p></div></div>
          <div className="s-assets">{ASSETS.map(a => (
            <button key={a.id} className={`s-asset ${a.id === s.assetId && run.status !== 'ready' ? 'hot' : ''} ${a.kind === 'demo-device' ? 'demo' : ''}`} onClick={() => setAsset(a)}>
              <span className="ic">{ICON[a.kind]}</span><span className="t"><b>{a.name}</b><small><span className="s-mono">{a.id}</span> · {a.site}</small></span><span className={`crit c${a.criticality}`}>C{a.criticality}</span>
            </button>
          ))}</div>
        </section>
      </div>
      {asset && (
        <Drawer title={asset.name} onClose={() => setAsset(null)}>
          <dl className="s-kv"><dt>Asset ID</dt><dd className="s-mono">{asset.id}</dd><dt>Site</dt><dd>{asset.site}</dd><dt>Owner</dt><dd>{asset.owner}</dd><dt>Criticality</dt><dd>{asset.criticality} of 4</dd><dt>Status</dt><dd>{asset.status}</dd></dl>
          <p style={{ marginTop: 14 }}>{asset.note}</p>
          {asset.id === s.assetId && run.status !== 'ready' && <p className="s-policy warn"><Landmark size={16} /><span>Affected by <span className="s-mono">{s.ref}</span>. Treatment: {s.treatment.name}.</span></p>}
          {asset.kind === 'demo-device' && <p className="s-policy info"><ShieldCheck size={16} /><span>Classroom device standing in for FIN-WS-07. Its final step, the power-off for re-imaging, is requested on <Link to="/endpoint">Endpoint action</Link> and approved only by Karan, on the device.</span></p>}
        </Drawer>
      )}
    </div>
  );
}
