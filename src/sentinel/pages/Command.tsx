import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BellRing, Play } from 'lucide-react';
import Atlas from '../components/Atlas';
import { GateRail, NextDecision, ExposurePanel, LedgerList, ScenarioPicker } from '../components/Incident';
import { Heatmap, KriMeters, Readiness, TaskStatusChart, TopExposures, Trajectory } from '../components/Charts';
import { Drawer, Sim, clock, useNow, PersonTag } from '../components/kit';
import { dispatch, reopenAlert, useStore } from '../state/store';
import { scenarioOf, money } from '../engine/incident';
import { REGISTER, scoreOf, levelOf, LEVEL_LABEL, kriStatus, APPETITE_LIMIT } from '../data/register';
import type { RiskEntry, Kri } from '../data/register';
import { TEAM } from '../data/team';

export default function Command() {
  const run = useStore(s => s.run);
  const now = useNow();
  const nav = useNavigate();
  const [risk, setRisk] = useState<RiskEntry | null>(null);
  const s = scenarioOf(run);
  const live = run.status === 'active';
  const outside = REGISTER.filter(r => scoreOf(r) > APPETITE_LIMIT);
  const registerKris: Kri[] = REGISTER.filter(r => r.kri).slice(0, 4).map(r => ({ ...r.kri!, name: `${r.code} · ${r.kri!.name}` }));
  const elapsed = run.startedAt ? clock((run.closedAt ? Date.parse(run.closedAt) : now) - Date.parse(run.startedAt)) : null;

  return (
    <div className="s-page s-command">
      <div className="s-pagehead">
        <div>
          <h1 className="s-h1">Command Center</h1>
          <p className="s-lead" style={{ marginTop: 8 }}>
            {run.status === 'ready' ? `${outside.length} risks sit outside the board’s appetite. No incident running.`
              : live ? `${s.ref} is live: ${s.title.toLowerCase()}. Elapsed ${elapsed}.`
                : `${s.ref} closed in ${elapsed}. Residual risk ${s.residual.likelihood * s.residual.impact}/16 stays visible.`}
          </p>
        </div>
        <div className="s-row wrap">
          <Sim large />
          {run.status === 'ready'
            ? <button className="s-btn danger" onClick={() => { const o = dispatch({ type: 'start' }); if (!o.error) nav('/incident'); }}><Play size={15} fill="currentColor" />Start {s.ref}</button>
            : <><button className="s-btn" onClick={reopenAlert}><BellRing size={15} />Show alert</button><Link to="/incident" className="s-btn primary">Open incident<ArrowRight size={15} /></Link></>}
        </div>
      </div>

      <div className="s-cmd-top">
        <section className="s-panel s-cmd-map" aria-label="Enterprise atlas">
          <div className="s-cmd-map-head">
            <span className="s-label">Enterprise atlas · {run.status === 'ready' ? 'all sites' : s.site}</span>
            <span className="s-map-legend"><span><i className="st ok" />Normal</span><span><i className="st watch" />Watch</span><span><i className="st crit" />Critical</span><span><i className="st rec" />Recovery</span></span>
          </div>
          <Atlas mode="command" run={run} tour="cmd-atlas" onNode={id => nav(id === 'angers' || id === 'nantes' || id === 'rennes' ? '/soc' : '/soc')} />
        </section>
        <aside className="s-cmd-side">
          <section className="s-panel raised"><NextDecision run={run} /></section>
          {run.status === 'ready' ? (
            <section className="s-panel">
              <span className="s-label">Rehearse a scenario</span>
              <ScenarioPicker current={run.scenarioId} />
            </section>
          ) : <ExposurePanel run={run} />}
        </aside>
      </div>

      <section className="s-panel s-proof" aria-label="Proof bar" data-tour="cmd-proofbar">
        <div className="s-row between wrap" style={{ marginBottom: 10 }}><span className="s-label">Proof bar — who signed each gate of {s.ref}</span><Link to="/evidence" className="s-linkbtn">Evidence ledger<ArrowRight size={14} /></Link></div>
        <GateRail run={run} />
      </section>

      <div className="s-cmd-grid">
        <section className="s-panel span-6" aria-labelledby="h-top5">
          <div className="s-panel-head"><div><h2 id="h-top5" className="s-h3">Top five exposures</h2><p className="s-small" style={{ margin: '3px 0 0' }}>Likelihood × impact, 1–16 · Group 1 register</p></div><Link to="/team" className="s-linkbtn">Owners<ArrowRight size={14} /></Link></div>
          <TopExposures highlight={live ? s.risks : []} onPick={setRisk} />
        </section>
        <section className="s-panel span-3" aria-labelledby="h-heat">
          <div className="s-panel-head"><div><h2 id="h-heat" className="s-h3">Heatmap</h2><p className="s-small" style={{ margin: '3px 0 0' }}>R1–R8 by likelihood and impact</p></div></div>
          <Heatmap highlight={live ? s.risks : []} onPick={setRisk} />
        </section>
        <section className="s-panel span-3" aria-labelledby="h-kri">
          <div className="s-panel-head"><div><h2 id="h-kri" className="s-h3">{live ? `Indicators · ${s.ref}` : 'Key risk indicators'}</h2><p className="s-small" style={{ margin: '3px 0 0' }}>{live ? 'Synthetic incident telemetry' : 'Case-study values'}</p></div></div>
          <KriMeters kris={live ? s.kris : registerKris} tour="cmd-kri" />
        </section>

        <section className="s-panel span-6" aria-labelledby="h-tasks">
          <div className="s-panel-head"><div><h2 id="h-tasks" className="s-h3">Tasks across departments</h2><p className="s-small" style={{ margin: '3px 0 0' }}>Incident tasks plus the existing backlog · {s.ref}</p></div><Link to="/response" className="s-linkbtn">Department plans<ArrowRight size={14} /></Link></div>
          <TaskStatusChart run={run} now={now} />
        </section>
        <section className="s-panel span-3" aria-labelledby="h-ready">
          <div className="s-panel-head"><div><h2 id="h-ready" className="s-h3">Department readiness</h2><p className="s-small" style={{ margin: '3px 0 0' }}>Incident tasks done</p></div></div>
          <Readiness run={run} now={now} />
        </section>
        <section className="s-panel span-3" aria-labelledby="h-attn">
          <div className="s-panel-head"><div><h2 id="h-attn" className="s-h3">Attention rail</h2><p className="s-small" style={{ margin: '3px 0 0' }}>Latest sealed entries</p></div><Link to="/evidence" className="s-linkbtn">All<ArrowRight size={14} /></Link></div>
          <LedgerList ledger={run.ledger} limit={4} />
        </section>

        <section className="s-panel span-6" aria-labelledby="h-traj">
          <div className="s-panel-head"><div><h2 id="h-traj" className="s-h3">Threat trajectory</h2><p className="s-small" style={{ margin: '3px 0 0' }}>Synthetic signal intensity for {s.ref} · 0–100</p></div><Sim /></div>
          <Trajectory run={run} />
        </section>
        <section className="s-panel span-6" aria-labelledby="h-team">
          <div className="s-panel-head"><div><h2 id="h-team" className="s-h3">Response team</h2><p className="s-small" style={{ margin: '3px 0 0' }}>Who holds which authority in {s.ref}</p></div><Link to="/team" className="s-linkbtn">Authority map<ArrowRight size={14} /></Link></div>
          <ul className="s-roster">
            {TEAM.map(p => {
              const role = p.id === s.owners.detect ? 'Owns the incident' : p.id === s.owners.assess ? 'Assesses · proposes' : p.id === s.owners.impact ? (s.requester === p.id ? 'Prices · requests hold' : 'Prices the exposure') : s.approvals.some(a => a.approver === p.id) ? `Approves (${s.approvals.find(a => a.approver === p.id)!.title.toLowerCase()})` : p.id === s.owners.execute ? 'Executes approved scope' : '';
              const verifies = p.id === s.owners.verify ? ' · verifies' : '';
              return <li key={p.id}><PersonTag id={p.id} sub={`${p.short} · ${role}${verifies}`.replace(' · ·', ' ·')} /></li>;
            })}
          </ul>
        </section>
      </div>

      {risk && (
        <Drawer title={`${risk.code} · ${risk.title}`} onClose={() => setRisk(null)}>
          <div className="s-row wrap" style={{ marginBottom: 14 }}>
            <span className={`s-chip ${scoreOf(risk) > APPETITE_LIMIT ? 'crit' : 'warn'}`}>{LEVEL_LABEL[levelOf(scoreOf(risk))]} · {scoreOf(risk)}/16</span>
            <span className="s-chip">{risk.category}</span>
            <span className="s-chip">{risk.origin === 'case' ? 'Group 1 case register' : 'Added for Finance (governance upgrade)'}</span>
          </div>
          <dl className="s-kv">
            <dt>Owner</dt><dd>{risk.owner}{risk.ownerTeam === 'fictional' ? ' (fictional NOVATECH employee)' : ' (Group 1)'}</dd>
            <dt>Department</dt><dd>{risk.department}</dd>
            <dt>Likelihood × impact</dt><dd>{risk.likelihood} × {risk.impact} = {scoreOf(risk)}</dd>
            <dt>Residual target</dt><dd>{risk.residualTarget}/16</dd>
            <dt>Treatment</dt><dd>{risk.treatment}</dd>
            <dt>Mitigation</dt><dd>{risk.mitigation}</dd>
          </dl>
          {risk.kri && <><hr className="s-rule" /><h3 className="s-h3" style={{ marginBottom: 10 }}>Key risk indicator</h3><KriMeters kris={[risk.kri]} /><p className="s-small">Status: {kriStatus(risk.kri)} (case-study value).</p></>}
          {live && s.risks.includes(risk.code) && <p className="s-policy warn" style={{ marginTop: 14 }}><BellRing size={16} /><span>{s.ref} touches this risk. Modelled exposure {money(s.exposure)}.</span></p>}
        </Drawer>
      )}
    </div>
  );
}
