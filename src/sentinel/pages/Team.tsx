import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Ban, ShieldCheck, UserCheck } from 'lucide-react';
import { DEFAULT_RELAY, SECONDARY, TEAM } from '../data/team';
import type { ActorId, PersonId } from '../data/team';
import { GATES, SCENARIOS, scenarioById } from '../data/scenarios';
import type { GateKey, ScenarioId } from '../data/scenarios';
import { DELEGATION_POLICY } from '../engine/incident';
import { Avatar, PersonTag, Sim, personMeta } from '../components/kit';
import { useStore } from '../state/store';

type Mark = { kind: 'sign' | 'approve' | 'consulted' | 'request' | 'none'; label: string };

function marksFor(scenarioId: ScenarioId, p: PersonId): Record<GateKey, Mark> {
  const s = scenarioById(scenarioId);
  const out = {} as Record<GateKey, Mark>;
  for (const g of GATES) {
    if (g.key === 'authorize') {
      const a = s.approvals.find(x => x.approver === p);
      out[g.key] = a ? { kind: 'approve', label: a.id === 'security' ? 'Security sign-off' : 'Executive decision' } : p === s.requester ? { kind: 'request', label: 'Requester — barred' } : { kind: 'none', label: '' };
      continue;
    }
    const owner = s.owners[g.key as Exclude<GateKey, 'authorize'>];
    if (owner === p) out[g.key] = { kind: 'sign', label: g.key === 'detect' ? 'Owns' : g.key === 'assess' ? (s.requester === p ? 'Assesses · proposes' : 'Assesses') : g.key === 'impact' ? (s.requester === p ? 'Prices · requests' : 'Prices') : g.key === 'execute' ? 'Executes' : g.key === 'verify' ? 'Verifies' : 'Closes' };
    else {
      const row = s.raci.find(r => r.c.includes(p) && r.activity.toLowerCase().includes(g.key === 'impact' ? 'financial' : g.key === 'execute' ? 'execution' : g.key === 'verify' ? 'verification' : g.key === 'close' ? 'closure' : g.key === 'assess' ? 'investigat' : 'detect'));
      out[g.key] = row ? { kind: 'consulted', label: 'Consulted' } : { kind: 'none', label: '' };
    }
  }
  return out;
}

const NEVER: Record<PersonId, string> = {
  karan: 'Approve an action he coordinates', victor: 'Verify anything he executed', vanessa: 'Execute an action',
  nadia: 'Approve her own proposal', sarah: 'Approve a hold she requested', pierre: 'Approve or verify his own work',
};

export default function Team() {
  const run = useStore(s => s.run);
  const [scenario, setScenario] = useState<ScenarioId>(run.scenarioId);
  const [focus, setFocus] = useState<PersonId | null>(null);
  const s = scenarioById(scenario);
  return (
    <div className="s-page">
      <div className="s-pagehead">
        <div><h1 className="s-h1">Authority map</h1><p className="s-lead" style={{ marginTop: 8 }}>Who may detect, assess, approve, execute, verify and close — per scenario. Authority follows the role, and the rules below are enforced by the workflow.</p></div>
        <div className="s-seg" role="group" aria-label="Scenario">{SCENARIOS.map(x => <button key={x.id} aria-pressed={scenario === x.id} onClick={() => setScenario(x.id)}>{x.ref}</button>)}</div>
      </div>

      <section className="s-panel" data-tour="team-map" aria-label={`Authority map for ${s.ref}`}>
        <div className="s-authmap" role="table">
          <div className="s-authmap-row head" role="row"><span role="columnheader" className="who">Person</span>{GATES.map(g => <span role="columnheader" key={g.key}><b>{g.n}</b>{g.name}</span>)}</div>
          {TEAM.map(p => {
            const m = marksFor(scenario, p.id);
            return (
              <div key={p.id} role="row" className={`s-authmap-row ${focus === p.id ? 'focus' : ''} ${focus && focus !== p.id ? 'dim' : ''}`}>
                <span role="rowheader" className="who-h"><button type="button" className="who" onClick={() => setFocus(f => f === p.id ? null : p.id)} aria-pressed={focus === p.id}><PersonTag id={p.id} /></button></span>
                {GATES.map(g => <span role="cell" key={g.key} className={`mk k-${m[g.key].kind}`}>{m[g.key].kind !== 'none' && <><i aria-hidden="true" />{m[g.key].label}</>}</span>)}
              </div>
            );
          })}
        </div>
        <div className="s-legend" style={{ marginTop: 12 }}>
          <span><i className="mk-sign" />Signs the gate</span><span><i className="mk-approve" />Approves</span><span><i className="mk-request" />Requester (barred from approving)</span><span><i className="mk-consulted" />Consulted</span>
        </div>
        {focus && (
          <div className="s-authfocus">
            <PersonTag id={focus} size="lg" />
            <p><span className="s-label">Owns at NOVATECH</span>{TEAM.find(p => p.id === focus)!.owns.join(' · ')}</p>
            <p><span className="s-label">May never</span><Ban size={14} className="s-crimson" style={{ verticalAlign: -2, marginRight: 4 }} />{NEVER[focus]}</p>
          </div>
        )}
      </section>

      <div className="s-team-grid">
        <section className="s-panel raised" data-tour="team-rules" aria-labelledby="h-rules">
          <div className="s-panel-head"><h2 id="h-rules" className="s-h3">Separation of duties — enforced</h2></div>
          <ul className="s-rules">
            <li><ShieldCheck size={18} /><span><b>The requester cannot approve.</b> {personMeta(s.requester).name} requested this treatment, so the route goes to {s.approvals.map(a => personMeta(a.approver).name).join(' and ')}.</span></li>
            <li><ShieldCheck size={18} /><span><b>An approver cannot execute.</b> {personMeta(s.owners.execute).name} executes and approves nothing.</span></li>
            <li><ShieldCheck size={18} /><span><b>The executor cannot verify.</b> {personMeta(s.owners.verify).name} verifies {personMeta(s.owners.execute).first}’s work.</span></li>
            <li><ShieldCheck size={18} /><span><b>Dual control from €100,000.</b> Two different people approve high-impact actions{s.approvals.length > 1 ? ' — as here.' : '. Here one independent approver is enough (below €100,000).'} This case rule sits on top of the standing rule for each action type (see Approvals in the case workspace).</span></li>
          </ul>
        </section>
        <section className="s-panel" aria-labelledby="h-deleg">
          <div className="s-panel-head"><div><h2 id="h-deleg" className="s-h3">If someone is unavailable</h2><p className="s-small" style={{ margin: '3px 0 0' }}>Recorded, time-boxed delegation — the same rules apply to the deputy</p></div></div>
          <ul className="s-deleg">
            {(Object.keys(DELEGATION_POLICY) as PersonId[]).map(p => {
              const pol = DELEGATION_POLICY[p]!;
              const deputies: ActorId[] = pol.gateDeputy ? [...pol.approvalDeputies, pol.gateDeputy.to] : pol.approvalDeputies;
              return <li key={p}><Avatar id={p} /><span><b>{personMeta(p).name}</b> — {pol.covers}<small>Deputy order: {deputies.map(d => personMeta(d).name + (SECONDARY.some(x => x.id === d) ? ' (fictional employee)' : '')).join(' → ')}. A deputy who requested, executes or already approved is skipped; if none is eligible the action stays blocked.</small></span></li>;
            })}
          </ul>
          <Link to="/incident" className="s-linkbtn">Try it on the live incident<ArrowRight size={14} /></Link>
        </section>
      </div>

      <section className="s-panel" style={{ marginTop: 16 }} data-tour="team-raci" aria-labelledby="h-raci">
        <div className="s-panel-head"><div><h2 id="h-raci" className="s-h3">RACI · {s.ref}</h2><p className="s-small" style={{ margin: '3px 0 0' }}>Responsible · Accountable · Consulted · Informed — one A per activity</p></div><Sim /></div>
        <RaciMatrix scenarioId={scenario} />
      </section>

      <section className="s-panel" style={{ marginTop: 16 }} aria-labelledby="h-relay">
        <div className="s-panel-head"><div><h2 id="h-relay" className="s-h3">Classroom speaking order</h2><p className="s-small" style={{ margin: '3px 0 0' }}>Default relay — editable in Presenter Mode</p></div><Link to="/present" className="s-linkbtn">Presenter Mode<ArrowRight size={14} /></Link></div>
        <ol className="s-relay">{DEFAULT_RELAY.map((r, i) => <li key={i}><span className="n">{i + 1}</span><Avatar id={r.person} /><span><b>{personMeta(r.person).name} — {r.segment}</b><small>{r.focus}</small></span></li>)}</ol>
      </section>

      <section className="s-panel flat" style={{ marginTop: 16 }} aria-labelledby="h-sec">
        <div className="s-panel-head"><div><h2 id="h-sec" className="s-h3">Fictional NOVATECH employees</h2><p className="s-small" style={{ margin: '3px 0 0' }}>From the original application. Not Group 1 members.</p></div></div>
        <ul className="s-secondary">{SECONDARY.map(p => <li key={p.id}><PersonTag id={p.id} sub={p.role} /><small>{p.note}</small></li>)}</ul>
      </section>
    </div>
  );
}

export function RaciMatrix({ scenarioId }: { scenarioId: ScenarioId }) {
  const s = scenarioById(scenarioId);
  const letters = (row: (typeof s.raci)[number], p: PersonId) => [row.r.includes(p) ? 'R' : '', row.a === p ? 'A' : '', row.c.includes(p) ? 'C' : '', row.i.includes(p) ? 'I' : ''].filter(Boolean).join('/');
  const others = (row: (typeof s.raci)[number]) => [...row.r, ...row.c, ...row.i].filter(x => !TEAM.some(t => t.id === x)).map(x => personMeta(x).name);
  return (
    <div className="s-table-wrap"><table className="s-table s-raci">
      <thead><tr><th>Activity</th>{TEAM.map(p => <th key={p.id} title={p.name}><span className="s-row" style={{ gap: 6 }}><Avatar id={p.id} size="sm" />{p.first}</span></th>)}<th>Others</th></tr></thead>
      <tbody>{s.raci.map(row => (
        <tr key={row.activity}><td>{row.activity}</td>{TEAM.map(p => { const l = letters(row, p.id); return <td key={p.id} className={`raci ${l.includes('A') ? 'a' : l.includes('R') ? 'r' : l ? 'ci' : ''}`}>{l || <span className="s-faint">·</span>}</td>; })}<td className="s-small">{others(row).join(', ') || '—'}</td></tr>
      ))}</tbody>
    </table><p className="s-small" style={{ padding: '8px 12px', margin: 0 }}><UserCheck size={13} style={{ verticalAlign: -2 }} /> R responsible · A accountable · C consulted · I informed</p></div>
  );
}
