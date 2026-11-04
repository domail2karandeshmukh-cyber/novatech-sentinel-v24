import { Link } from 'react-router-dom';
import { ArrowRight, BellRing, Clock3, Scale } from 'lucide-react';
import { GateRail, Workbench, TreatmentPanel, ExposurePanel, LedgerList } from '../components/Incident';
import Atlas from '../components/Atlas';
import { Sim, clock, useNow, PersonTag } from '../components/kit';
import { reopenAlert, useStore } from '../state/store';
import { exposureNow, gateDone, money, scenarioOf } from '../engine/incident';
import { levelOf, LEVEL_LABEL } from '../data/register';

export default function Incident() {
  const run = useStore(s => s.run);
  const now = useNow();
  const s = scenarioOf(run);
  const started = run.startedAt ? Date.parse(run.startedAt) : null;
  const elapsed = started ? clock((run.closedAt ? Date.parse(run.closedAt) : now) - started) : '00:00';
  const deadline = started ? started + s.responseDeadlineMin * 60_000 : null;
  const contained = gateDone(run, 'execute');
  const left = deadline ? deadline - now : null;
  const ex = exposureNow(run);
  const residualLevel = levelOf(ex.residualScore);
  return (
    <div className="s-page s-incident">
      <header className={`s-inc-head ${run.status === 'active' ? 'live' : run.status}`} data-tour="inc-header">
        <div className="s-inc-id">
          <span className="s-mono s-inc-ref">{s.ref}</span>
          <h1 className="s-h1">{s.title}</h1>
          <p className="s-muted" style={{ margin: '6px 0 0' }}>{s.assetName} · {s.site} · {s.family}</p>
        </div>
        <dl className="s-inc-stats">
          <div><dt>Status</dt><dd>{run.status === 'ready' ? 'Standing by' : run.status === 'active' ? <span className="s-crimson">Live</span> : <span className="s-teal">Closed</span>}</dd></div>
          {contained
            ? <div><dt>Residual risk</dt><dd className={residualLevel === 'critical' ? 's-crimson' : residualLevel === 'low' ? 's-teal' : 's-amber'}>{LEVEL_LABEL[residualLevel]} · {ex.residualScore}/16</dd></div>
            : <div><dt>Severity</dt><dd className={s.severity === 'Critical' ? 's-crimson' : 's-amber'}>{s.severity}</dd></div>}
          <div><dt>Elapsed</dt><dd className="s-num">{elapsed}</dd></div>
          <div><dt>{contained ? 'Contained' : 'Contain within'}</dt><dd className={`s-num ${left !== null && left < 0 && !contained ? 's-crimson' : ''}`}>{contained ? 'Yes' : left === null ? `${s.responseDeadlineMin >= 60 ? `${s.responseDeadlineMin / 60} h` : `${s.responseDeadlineMin} min`}` : left >= 0 ? clock(left) : `${clock(-left)} late`}</dd></div>
          <div><dt>{contained ? 'Residual exposure' : 'Exposure'}</dt><dd className="s-num">{money(ex.current)}</dd></div>
        </dl>
        <div className="s-row wrap" style={{ gap: 8 }}><Sim large />{run.status !== 'ready' && <button className="s-btn sm" onClick={reopenAlert}><BellRing size={14} />Alert</button>}</div>
      </header>

      <section className="s-panel s-proof"><GateRail run={run} /></section>

      <div className="s-inc-grid">
        <div className="s-inc-main">
          <Workbench run={run} />
          <TreatmentPanel run={run} />
        </div>
        <aside className="s-inc-side">
          <ExposurePanel run={run} />
          <section className="s-panel s-inc-mini" aria-label="Affected location">
            <Atlas mode="mini" run={run} interactive={false} showTeleworkers={false} />
          </section>
          <section className="s-panel" aria-labelledby="h-led">
            <div className="s-panel-head"><div><h2 id="h-led" className="s-h3">Live ledger</h2><p className="s-small" style={{ margin: '3px 0 0' }}>Hash-chained · simulated local record</p></div><Link to="/evidence" className="s-linkbtn">Verify<ArrowRight size={14} /></Link></div>
            <LedgerList ledger={run.ledger} limit={6} fresh={1} />
          </section>
          <section className="s-panel" aria-labelledby="h-reg">
            <div className="s-panel-head"><div><h2 id="h-reg" className="s-h3"><Scale size={16} style={{ verticalAlign: -2, marginRight: 6 }} />Regulatory clocks</h2><p className="s-small" style={{ margin: '3px 0 0' }}>Assessed by Compliance, decided by the CEO</p></div></div>
            <ul className="s-reg">{s.regulatory.map(r => <li key={r.name}><b>{r.name}</b><span><Clock3 size={13} />{r.clock}</span><small>{r.status}</small></li>)}</ul>
          </section>
          <section className="s-panel" aria-labelledby="h-who">
            <div className="s-panel-head"><h2 id="h-who" className="s-h3">Accountable owners</h2></div>
            <div className="s-stack">
              <PersonTag id={s.owners.detect} sub="Incident owner · Risk Coordinator" />
              <PersonTag id={s.requester} sub="Requested the treatment — cannot approve it" />
              {s.approvals.map(a => <PersonTag key={a.id} id={a.approver} sub={a.title} />)}
              <PersonTag id={s.owners.execute} sub="Executes the authorised scope only" />
              <PersonTag id={s.owners.verify} sub="Verifies — never his own execution" />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
