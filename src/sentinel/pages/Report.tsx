import { Link } from 'react-router-dom';
import { ArrowRight, CircleAlert, CircleCheck, CircleDot, Clock3, Printer } from 'lucide-react';
import { useStore } from '../state/store';
import { HASH_ROUTING } from '../env';
import { exposureNow, money, scenarioOf, taskDueLabel, taskStatus, verifierApproved, verifyLedger } from '../engine/incident';
import type { TaskStatus } from '../engine/incident';
import { GATES } from '../data/scenarios';
import type { GateKey } from '../data/scenarios';
import { Avatar, PersonTag, Sim, clock, personMeta, timeOf, useNow } from '../components/kit';

const ICON: Record<TaskStatus, JSX.Element> = { done: <CircleCheck size={14} />, open: <Clock3 size={14} />, overdue: <CircleAlert size={14} />, planned: <CircleDot size={14} /> };
const LABEL: Record<TaskStatus, string> = { done: 'Done', open: 'Open', overdue: 'Overdue', planned: 'Planned' };

export default function Report() {
  const run = useStore(s => s.run);
  const now = useNow(10000);
  const s = scenarioOf(run);
  const e = exposureNow(run);
  const chain = verifyLedger(run.ledger);
  const start = run.startedAt ? Date.parse(run.startedAt) : null;
  const followUps = s.tasks.filter(t => t.followUp || (!t.doneAt && taskStatus(t, run, now) === 'overdue'));
  if (run.status === 'ready') return (
    <div className="s-page"><div className="s-empty" style={{ padding: '80px 16px' }}><b>No incident to report yet</b>Run a scenario to produce an after-action report. <Link to="/incident" className="s-linkbtn">Open the incident console<ArrowRight size={14} /></Link></div></div>
  );
  const rows = GATES.map(g => {
    if (g.key === 'authorize') {
      const ev = run.ledger.filter(x => x.gate === 'authorize' && (x.kind === 'approved' || x.kind === 'returned'));
      const conds = run.approvals.filter(a => a.status === 'approved' && a.fields?.Conditions).map(a => `${a.fields!.Conditions!.split('; ').length} conditions from the ${a.title.toLowerCase()}`);
      return { g, people: run.approvals.map(a => a.acting), at: ev.length ? ev[ev.length - 1].at : null, note: [ev.map(x => `${x.actorName}: ${x.title.toLowerCase()}`).join(' · '), conds.length ? `Execution bound by ${conds.join(' and ')}.` : ''].filter(Boolean).join(' — ') };
    }
    const r = run.records[g.key as Exclude<GateKey, 'authorize'>];
    return { g, people: r ? [r.by] : [], at: r?.at ?? null, note: r?.note ?? '' };
  });
  return (
    <div className="s-page s-report">
      <div className="s-pagehead">
        <div><span className="s-label">After-action report · {run.status === 'closed' ? 'final' : 'interim'}</span><h1 className="s-h1"><span className="s-mono" style={{ fontSize: '0.7em', marginRight: 10 }}>{s.ref}</span>{s.title}</h1>
          <p className="s-lead" style={{ marginTop: 8 }}>{run.status === 'closed' ? `Closed in ${clock(Date.parse(run.closedAt!) - start!)} after verification independent of the execution${verifierApproved(run) ? ' (the verifier also gave an approval — disclosed in the trace)' : ''}.` : 'The incident is still open — this report updates as gates are sealed.'} {run.revisions ? `Returned for revision ${run.revisions}×.` : ''}</p></div>
        <div className="s-row wrap"><Sim large />{!HASH_ROUTING && <button className="s-btn" onClick={() => window.print()}><Printer size={16} />Print or save as PDF</button>}</div>
      </div>
      <div className="s-rep-summary" data-tour="rep-summary">
        <div><span className="s-label">Modelled exposure</span><b>{money(e.max)}</b><small>simulated</small></div>
        <div><span className="s-label">Residual after treatment</span><b className="s-teal">{e.treated ? money(e.current) : '—'}</b><small>score {e.residualScore}/16</small></div>
        <div><span className="s-label">Treatment</span><b className="s-rep-small">{s.treatment.name}</b><small>{s.treatment.disruptive ? 'Disruptive — dual authority' : 'Non-disruptive'}</small></div>
        <div><span className="s-label">Evidence chain</span><b className={chain.ok ? 's-teal' : 's-crimson'}>{chain.ok ? 'Intact' : 'Broken'}</b><small>{chain.checked} entries</small></div>
      </div>
      <section className="s-panel" data-tour="rep-trace" aria-labelledby="h-trace">
        <div className="s-panel-head"><h2 id="h-trace" className="s-h3">Causal trace — who did what</h2></div>
        <ol className="s-trace">
          {rows.map(r => (
            <li key={r.g.key} className={r.at ? 'done' : ''}>
              <span className="s-trace-n">{r.g.n}</span>
              <div className="s-trace-b">
                <div className="s-row between wrap"><b>{r.g.title}</b><span className="s-small s-num">{r.at ? `${timeOf(r.at)} · T+${clock(Date.parse(r.at) - start!)}` : 'pending'}</span></div>
                <div className="s-row wrap" style={{ gap: 12, margin: '6px 0' }}>{r.people.length ? r.people.map(p => <PersonTag key={p} id={p} />) : <span className="s-small">Not yet signed</span>}</div>
                {r.note && <p className="s-small" style={{ margin: 0 }}>{r.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>
      <div className="s-rep-grid">
        <section className="s-panel" data-tour="rep-residual" aria-labelledby="h-res">
          <div className="s-panel-head"><h2 id="h-res" className="s-h3">What remains — and who owns it</h2></div>
          <ul className="s-tasklist">{followUps.map(t => { const st = taskStatus(t, run, now); return <li key={t.id} className={`st-${st}`}><span className={`s-task-st t-${st}`} title={LABEL[st]}>{ICON[st]}<span className="s-sr">{LABEL[st]}</span></span><span className="s-task-t"><b>{t.title}</b><small><Avatar id={t.owner} size="sm" /> {personMeta(t.owner).name} · {taskDueLabel(t, run, now)}</small></span></li>; })}</ul>
        </section>
        <section className="s-panel" aria-labelledby="h-les">
          <div className="s-panel-head"><h2 id="h-les" className="s-h3">Lessons learned</h2></div>
          <ul className="s-lessons">{s.lessons.map(l => <li key={l}>{l}</li>)}</ul>
          <h3 className="s-h3" style={{ margin: '16px 0 8px' }}>Controls that held</h3>
          <ul className="s-lessons">
            <li>Requester ({personMeta(s.requester).name}) did not approve.</li>
            <li>Approvals by {run.approvals.map(a => personMeta(a.acting).name).join(' and ') || '—'}{run.approvals.some(a => a.delegation) ? ' (delegated authority recorded)' : ''}.</li>
            <li>Executed by {run.records.execute ? personMeta(run.records.execute.by).name : '—'}; verified by {run.records.verify ? personMeta(run.records.verify.by).name : '—'} — different people.</li>
          </ul>
        </section>
      </div>
      <p className="s-small" style={{ marginTop: 16 }}>Classroom simulation for the fictional NOVATECH Services. The causal trace and ledger are local browser records, not production audit evidence.</p>
    </div>
  );
}
