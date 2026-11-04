import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, ChevronDown, CircleAlert, CircleX, Fingerprint, Info, LockKeyhole, PenLine, Play, RotateCcw, ShieldCheck, Sparkles, UserCheck, UserX } from 'lucide-react';
import { GATES, SCENARIOS, gateIndex, scenarioById } from '../data/scenarios';
import type { GateKey, ScenarioId } from '../data/scenarios';
import { DELEGATION_POLICY, MIN_NOTE, exposureNow, gateActor, gateDone, money, nextAction, scenarioOf, sodForApproval, sodForExecute, sodForVerify, verifyLedger } from '../engine/incident';
import type { ApprovalState, LedgerEvent, Run, SodCheck } from '../engine/incident';
import { dispatch, resetRun, setPersona, setScenario, useStore } from '../state/store';
import type { ActorId, PersonId } from '../data/team';
import { Avatar, ConfirmButton, PersonTag, personMeta, timeOf, useToast } from './kit';
import { FieldGrid, Received, RoutingFooter, nextHop, usePlaybookFill } from './GateForm';
import { VALIDITY, approvalFormFor, approvalRecord, blankValues, composeNote, detailOf, formFor, missingFields, playbookValues, summaryOf } from '../data/forms';
import type { FormValues } from '../data/forms';

export function GateRail({ run, compact }: { run: Run; compact?: boolean }) {
  const s = scenarioOf(run);
  return (
    <ol className={`s-gates ${compact ? 'compact' : ''}`} aria-label="Seven governed gates" data-tour="inc-gates">
      {GATES.map((g, i) => {
        const done = gateDone(run, g.key);
        const current = run.status === 'active' && run.gate === i;
        const signer: ActorId[] = g.key === 'authorize'
          ? (run.approvals.length ? run.approvals.map(a => a.acting) : s.approvals.map(a => a.approver))
          : [run.records[g.key as Exclude<GateKey, 'authorize'>]?.by ?? gateActor(run, g.key as Exclude<GateKey, 'authorize'>)];
        const returned = g.key === 'authorize' && run.revisions > 0 && !done && !current;
        return (
          <li key={g.key} className={`${done ? 'done' : ''} ${current ? 'current' : ''}`} aria-current={current ? 'step' : undefined}>
            <span className="s-gate-n" aria-hidden="true">{done ? <Check size={15} /> : g.n}</span>
            <span className="s-gate-t"><b>{g.name}</b>
              {!compact && <small>{signer.map(id => personMeta(id).first).join(' + ')}{done ? ' · sealed' : current ? ' · now' : returned ? ' · returned once' : ''}</small>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Checks({ checks }: { checks: SodCheck[] }) {
  return (
    <ul className="s-sod" data-tour="inc-sod" aria-label="Separation of duties checks">
      {checks.map(c => (
        <li key={c.rule} className={c.disclosed ? 'disclosed' : c.ok ? 'ok' : 'fail'}>{c.disclosed ? <Info size={15} /> : c.ok ? <ShieldCheck size={15} /> : <CircleX size={15} />}<span><b>{c.rule}</b><small>{c.detail}</small></span></li>
      ))}
    </ul>
  );
}

function HandOver({ actor }: { actor: ActorId }) {
  const persona = useStore(s => s.persona);
  const inboxMode = useStore(s => s.settings.teamInboxMode);
  if (persona === actor) return <span className="s-chip active"><UserCheck size={14} />You are acting as {personMeta(actor).first}</span>;
  if (inboxMode) return <Link to="/inbox" className="s-btn sm"><UserCheck size={15} />Task sent to {personMeta(actor).first}'s inbox <ArrowRight size={14} /></Link>;
  return <button className="s-btn sm" onClick={() => setPersona(actor)}><UserCheck size={15} />Hand over to {personMeta(actor).first}</button>;
}

/** What the sign button says: the decision and who receives it next. */
function signLabel(run: Run, gate: Exclude<GateKey, 'authorize'>): string {
  const to = nextHop(run, gate).actors.map(a => personMeta(a).first).join(' and ');
  switch (gate) {
    case 'detect': return `Take ownership and send to ${to}`;
    case 'assess': return `Sign the assessment and send to ${to}`;
    case 'impact': return `Sign and request approval from ${to}`;
    case 'execute': return `Execute (simulated) and send to ${to}`;
    case 'verify': return `Sign the verification and send to ${to}`;
    case 'close': return 'Sign and close the incident';
  }
}

export function Workbench({ run }: { run: Run }) {
  const persona = useStore(s => s.persona);
  const toast = useToast();
  const s = scenarioOf(run);
  const g = run.status === 'active' ? GATES[run.gate] : null;
  const gate = g && g.key !== 'authorize' ? g.key as Exclude<GateKey, 'authorize'> : null;
  const fields = useMemo(() => (gate ? formFor(s.id, gate) : []), [s.id, gate]);
  const playbook = useMemo(() => playbookValues(fields), [fields]);
  const [values, setValues] = useState<FormValues>(() => blankValues(fields));
  const [note, setNote] = useState('');
  const [consent, setConsent] = useState(false);
  const [withinConditions, setWithinConditions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = `${run.id}:${run.gate}:${run.approvals.find(a => a.status === 'pending')?.id ?? ''}:${run.revisions}`;
  useEffect(() => { setValues(blankValues(fields)); setNote(''); setConsent(false); setWithinConditions(false); setError(null); }, [key, fields]);
  const afterFill = useCallback(() => { if (gate) setNote(s.notes[gate]); if (gate === 'execute') { setConsent(true); setWithinConditions(true); } }, [gate, s]);
  const { fill, flash } = usePlaybookFill(fields, playbook, setValues, afterFill);
  // "Do it for me" from the presenter console: the form fills itself here (on the projector) before it is signed.
  const fillReq = useStore(s => s.presenter.fill);
  const fillRef = useRef(fill); fillRef.current = fill;
  useEffect(() => { if (fillReq && gate && fillReq.gate === gate && Date.now() - fillReq.at < 4000) fillRef.current(); }, [fillReq, gate]);

  if (run.status === 'ready') return <StartPanel run={run} />;
  if (run.status === 'closed') return <ClosedPanel run={run} />;
  if (!g) return null;
  if (g.key === 'authorize' || !gate) return <AuthorizePanel run={run} />;

  const actor = gateActor(run, gate);
  const mine = persona === actor;
  const checks = gate === 'execute' ? sodForExecute(run, actor) : gate === 'verify' ? sodForVerify(run, actor) : null;
  const conditions = gate === 'execute' ? run.approvals.flatMap(a => (a.fields?.Conditions ?? '').split('; ').filter(Boolean).map(c => ({ c, by: a.acting }))) : [];
  const missing = missingFields(fields, values);
  const shortNote = note.trim().length < MIN_NOTE;
  const ready = mine && !missing.length && !shortNote && (gate !== 'execute' || (consent && (!conditions.length || withinConditions)));
  const requester = gate === s.requesterGate;
  const sign = () => {
    const hop = nextHop(run, gate);
    const out = dispatch({ type: 'record', gate, actor: persona, note: composeNote(summaryOf(fields, values), note), consent, fields: detailOf(fields, values) });
    if (out.error) { setError(out.error); toast('error', out.error); return; }
    setError(null);
    toast('ok', gate === 'close' ? (out.info ?? 'Incident closed.') : `Signed by ${personMeta(persona).name} and sent to ${hop.actors.map(a => personMeta(a).name).join(' and ')} — ${hop.title}.`);
  };
  return (
    <section className="s-panel raised s-workbench" data-tour="inc-workbench" aria-labelledby="s-wb-title">
      <div className="s-wb-head">
        <div><span className="s-label">Gate {g.n} of 7 · {g.question}</span><h3 id="s-wb-title" className="s-h2">{g.title}</h3></div>
        <HandOver actor={actor} />
      </div>
      <Received run={run} gate={gate} />
      <div className="s-wb-owner"><PersonTag id={actor} size="lg" sub={`${personMeta(actor).role}${actor !== s.owners[gate] ? ` · deputy for ${personMeta(s.owners[gate]).name}` : ''}`} />
        <button className="s-btn sm" onClick={fill} data-tour="inc-fill"><Sparkles size={14} />Fill from playbook</button></div>
      {gate === 'execute' && <div className="s-policy warn"><LockKeyhole size={16} /><span><b>Authorised scope only:</b> {s.treatment.scope}</span></div>}
      {requester && <p className="s-policy info"><Info size={16} /><span><b>You are the requester of this treatment.</b> Recommending it here means you can never approve it — the policy routes the decision to someone else.</span></p>}
      <FieldGrid fields={fields} values={values} set={(id, v) => setValues(x => ({ ...x, [id]: v }))} flash={flash} idPrefix={`f-${gate}`} />
      {conditions.length > 0 && (
        <fieldset className="s-ff wide s-ff-checks s-conditions" data-tour="inc-conditions"><legend className="s-ff-label">Conditions set by the approvers</legend>
          <ul className="s-cond-list">{conditions.map(x => <li key={x.c}><Avatar id={x.by} size="sm" /><span>{x.c}</span></li>)}</ul>
          <label className="s-check"><input type="checkbox" checked={withinConditions} onChange={e => setWithinConditions(e.target.checked)} /><span>I confirm the execution stays within these {conditions.length} conditions.</span></label>
        </fieldset>
      )}
      {checks && <Checks checks={checks} />}
      <div className="s-wb-note">
        <label htmlFor="s-note" className="s-label">Rationale (sealed in the ledger under {personMeta(actor).name}, with the form above)</label>
        <textarea id="s-note" className="s-textarea" value={note} onChange={e => setNote(e.target.value)} placeholder="What did you check, what did you decide, and why?" />
        <div className="s-row between s-small"><span>{note.trim().length} characters · minimum {MIN_NOTE}</span><span>Playbook values are deterministic guidance for {s.ref}, not AI output.</span></div>
      </div>
      {gate === 'execute' && <label className="s-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>{s.executeConsent}</span></label>}
      <RoutingFooter run={run} gate={gate} />
      {error && <p className="s-error" role="alert"><CircleAlert size={15} />{error}</p>}
      <div className="s-row wrap s-wb-actions">
        <button className={`s-btn ${gate === 'execute' ? 'danger' : 'primary'} lg`} disabled={!ready} onClick={sign} data-tour="inc-sign">
          {gate === 'close' ? <Check size={17} /> : <PenLine size={17} />}{signLabel(run, gate)}
        </button>
        {!mine ? <span className="s-small">Only {personMeta(actor).name} can sign this gate. Use “Hand over” to switch the demo persona.</span>
          : missing.length ? <span className="s-small s-amber">Still to complete: {missing.slice(0, 3).join(', ')}{missing.length > 3 ? ` and ${missing.length - 3} more` : ''}</span>
            : shortNote ? <span className="s-small s-amber">Add the rationale ({MIN_NOTE} characters minimum).</span> : null}
      </div>
    </section>
  );
}

function AuthorizePanel({ run }: { run: Run }) {
  const persona = useStore(s => s.persona);
  const toast = useToast();
  const s = scenarioOf(run);
  const pending = run.approvals.find(a => a.status === 'pending');
  const blocked = run.approvals.find(a => a.status === 'blocked');
  const step = pending ?? blocked;
  const checks = step ? sodForApproval(run, step.id, step.acting) : [];
  const mine = !!pending && persona === pending.acting;
  const form = step ? approvalFormFor(s.id, step.id) : null;
  const [conds, setConds] = useState<string[]>([]);
  const [validity, setValidity] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const key = `${run.id}:${step?.id ?? ''}:${step?.acting ?? ''}:${run.revisions}`;
  useEffect(() => { setConds([]); setValidity(''); setNote(''); setError(null); }, [key]);
  const fillTimer = useRef<number[]>([]);
  useEffect(() => () => fillTimer.current.forEach(t => window.clearTimeout(t)), []);
  const fill = () => {
    if (!form || !step) return;
    const rationale = (step.id === 'security' ? s.notes.security : s.notes.executive) ?? '';
    fillTimer.current.forEach(t => window.clearTimeout(t)); fillTimer.current = [];
    const instant = document.documentElement.dataset.sMotion === 'reduce' || (document.documentElement.dataset.sMotion !== 'full' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    if (instant) { setConds([...form.conditions]); setValidity(form.validity); setNote(rationale); return; }
    form.conditions.forEach((c, i) => fillTimer.current.push(window.setTimeout(() => setConds(x => x.includes(c) ? x : [...x, c]), i * 120)));
    fillTimer.current.push(window.setTimeout(() => { setValidity(form.validity); setNote(rationale); }, form.conditions.length * 120 + 60));
  };
  // "Do it for me" from the presenter console fills the approval form here before it is signed.
  const fillReq = useStore(s => s.presenter.fill);
  const fillRef = useRef(fill); fillRef.current = fill;
  useEffect(() => { if (fillReq && fillReq.gate === 'authorize' && Date.now() - fillReq.at < 4000) fillRef.current(); }, [fillReq]);
  const decide = (decision: 'approve' | 'return') => {
    if (!step) return;
    const rec = approvalRecord(s.id, step.id, decision, note, { conditions: conds, validity });
    const out = dispatch({ type: 'decide', step: step.id, actor: persona, decision, note: rec.note, fields: rec.fields });
    if (out.error) { setError(out.error); toast('error', out.error); return; }
    setError(null);
    const after = out.run.approvals.find(a => a.status === 'pending');
    toast('ok', decision === 'return' ? (out.info ?? 'Returned for revision.') : after ? `Approved by ${personMeta(persona).name} and sent to ${personMeta(after.acting).name} — ${after.title}.` : (out.info ?? 'All approvals recorded.'));
  };
  const canApprove = mine && conds.length > 0 && !!validity && note.trim().length >= MIN_NOTE;
  const canReturn = mine && note.trim().length >= MIN_NOTE;
  return (
    <section className="s-panel raised s-workbench" data-tour="inc-workbench" aria-labelledby="s-wb-title">
      <div className="s-wb-head">
        <div><span className="s-label">Gate 4 of 7 · Who is allowed to approve this, and do they?</span><h3 id="s-wb-title" className="s-h2">Executive authorization</h3></div>
        {pending && <HandOver actor={pending.acting} />}
      </div>
      <Received run={run} gate="authorize" />
      <ApprovalRoute run={run} />
      {step && (
        <div className="s-approval-focus">
          <div className="s-row between wrap" style={{ gap: 10 }}>
            <PersonTag id={step.acting} size="lg" sub={step.delegation ? `Delegated from ${personMeta(step.delegation.from).name}` : personMeta(step.acting).role} />
            <span className="s-row wrap" style={{ gap: 8 }}>
              <AvailabilityToggle run={run} step={step} />
              {step.status === 'pending' && <button className="s-btn sm" onClick={fill} data-tour="inc-fill"><Sparkles size={14} />Fill from playbook</button>}
            </span>
          </div>
          <p className="s-policy"><LockKeyhole size={16} /><span><b>{step.title}.</b> {step.rule}</span></p>
          {step.delegation && <p className="s-policy info"><UserCheck size={16} /><span>{step.delegation.reason}</span></p>}
          {run.unavailable.includes('vandana') && step.approver === 'vandana' && (
            <p className={`s-policy ${step.status === 'blocked' ? 'crit' : 'info'}`} role="status">
              <CircleAlert size={16} />
              <span><b>CEO unavailable — emergency continuity route.</b> Vijay is the first candidate for delegated executive authority; the engine checks every conflict before assigning him. If Vijay already gave the CISO approval, Srija is considered instead. If Vijay cannot act and Srija requested this payment hold, or no independent deputy is eligible, authorization is blocked. No invoice or payment is released automatically, and no Mac action proceeds without the separate device-owner confirmation. This is a simulated classroom delegation policy, not a real corporate authorization.</span>
            </p>
          )}
          {s.id === 'payments' && (
            <p className="s-policy info"><CircleAlert size={16} /><span><b>Supplier invoice/payment fraud warning:</b> The beneficiary bank details changed less than 24 hours before release. Hold only the suspicious €85,000 line, confirm the supplier by calling the independently verified contract number, preserve the email and ERP audit evidence, and require an eligible approver before any release. Do not trust a telephone number supplied in the suspicious email.</span></p>
          )}
          {step.status === 'blocked' && <p className="s-policy crit"><CircleX size={16} /><span>{step.blockedReason}</span></p>}
          <Checks checks={checks} />
          {step.status === 'pending' && form && (
            <>
              <div className="s-form-grid" data-tour="inc-form">
                <fieldset className="s-ff wide s-ff-checks" data-tour="inc-conditions"><legend className="s-ff-label">Conditions attached to this approval <small>· execution must respect them</small></legend>
                  {form.conditions.map(c => <label key={c} className="s-check"><input type="checkbox" checked={conds.includes(c)} onChange={e => setConds(x => e.target.checked ? [...x, c] : x.filter(y => y !== c))} /><span>{c}</span></label>)}
                </fieldset>
                <label className="s-ff" htmlFor="f-validity"><span className="s-ff-label">Authorization valid for</span>
                  <select id="f-validity" className="s-select" value={validity} onChange={e => setValidity(e.target.value)}><option value="">Choose…</option>{VALIDITY.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
                <div className="s-ff"><span className="s-ff-label">Scope being approved</span><div className="s-ro">{s.treatment.scope}</div></div>
              </div>
              <div className="s-wb-note">
                <label htmlFor="s-note" className="s-label">Decision rationale (sealed under {personMeta(step.acting).name})</label>
                <textarea id="s-note" className="s-textarea" value={note} onChange={e => setNote(e.target.value)} placeholder="What are you approving, within which scope, and why?" />
                <div className="s-small">{note.trim().length} characters · minimum {MIN_NOTE}</div>
              </div>
              {error && <p className="s-error" role="alert"><CircleAlert size={15} />{error}</p>}
              <div className="s-row wrap s-wb-actions">
                <button className="s-btn primary lg" disabled={!canApprove} onClick={() => decide('approve')} data-tour="inc-sign"><Check size={17} />Approve with {conds.length || 'these'} condition{conds.length === 1 ? '' : 's'}</button>
                <button className="s-btn lg" disabled={!canReturn} onClick={() => decide('return')}><RotateCcw size={16} />Return for revision</button>
                {!mine ? <span className="s-small">Only {personMeta(step.acting).name} can decide this step.</span>
                  : !canApprove && <span className="s-small s-amber">{!conds.length ? 'Tick the conditions you attach' : !validity ? 'Choose how long the authorization is valid' : `Add the rationale (${MIN_NOTE} characters minimum)`}.</span>}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function AvailabilityToggle({ run, step }: { run: Run; step: ApprovalState }) {
  const toast = useToast();
  const who = step.approver;
  if (!DELEGATION_POLICY[who]) return null;
  const away = run.unavailable.includes(who);
  return (
    <button className="s-btn sm quiet" data-tour="inc-delegation" onClick={() => { const out = dispatch({ type: away ? 'available' : 'unavailable', person: who as PersonId }); if (out.error) toast('error', out.error); }}>
      {away ? <UserCheck size={15} /> : <UserX size={15} />}{away ? `${personMeta(who).first} is back` : `${personMeta(who).first} unavailable?`}
    </button>
  );
}

export function ApprovalRoute({ run }: { run: Run }) {
  const s = scenarioOf(run);
  const steps = run.approvals.length ? run.approvals : s.approvals.map(a => ({ id: a.id, approver: a.approver, acting: a.approver, title: a.title, rule: a.rule, status: 'waiting' as const }));
  return (
    <ol className="s-route" data-tour="inc-approvals" aria-label="Approval route">
      {steps.map((a, i) => (
        <li key={a.id} className={`st-${a.status}`}>
          <span className="s-route-i">{a.status === 'approved' ? <Check size={14} /> : i + 1}</span>
          <Avatar id={a.acting} />
          <span className="s-route-t"><b>{a.title}</b><small>{personMeta(a.acting).name}{'delegation' in a && a.delegation ? ' (delegated)' : ''} · {a.status === 'pending' ? 'decision needed' : a.status === 'waiting' ? 'waiting' : a.status}{'fields' in a && a.fields?.Conditions ? ` · ${a.fields.Conditions.split('; ').length} conditions, valid ${a.fields.Validity ?? ''}` : ''}</small></span>
        </li>
      ))}
      {!run.approvals.length && <li className="s-route-note s-small">Route opens after the financial impact is recorded. Requester: {personMeta(s.requester).name} — cannot approve.</li>}
    </ol>
  );
}

function StartPanel({ run }: { run: Run }) {
  const s = scenarioOf(run);
  return (
    <section className="s-panel raised s-workbench" data-tour="inc-workbench">
      <div className="s-wb-head"><div><span className="s-label">Standing by</span><h3 className="s-h2">Choose a scenario, then inject the synthetic signal</h3></div></div>
      <ScenarioPicker current={run.scenarioId} />
      <p className="s-lead" style={{ marginTop: 14 }}>{s.summary}</p>
      <div className="s-row wrap" style={{ marginTop: 16 }}>
        <button className="s-btn danger lg" data-tour="inc-start" onClick={() => dispatch({ type: 'start' })}><Play size={17} fill="currentColor" />Start {s.ref}</button>
        <span className="s-small">The alert comes from a synthetic feed. Everything after it follows the platform’s governance rules.</span>
      </div>
    </section>
  );
}

export function ScenarioPicker({ current }: { current: ScenarioId }) {
  const run = useStore(s => s.run);
  const [pending, setPending] = useState<ScenarioId | null>(null);
  const choose = (id: ScenarioId) => {
    if (id === current) { setPending(null); return; }
    if (run.status === 'active' && run.ledger.length > 1) { setPending(id); return; }
    setScenario(id);
  };
  return (
    <>
    {pending && (
      <div className="s-policy warn s-switch" role="alert">
        <CircleAlert size={16} />
        <span><b>Switch to {scenarioById(pending).ref}?</b> The current rehearsal of {scenarioOf(run).ref} is discarded. Nothing outside this browser is affected.</span>
        <span className="s-row" style={{ gap: 6 }}><button className="s-btn sm danger" onClick={() => { setScenario(pending); setPending(null); }}>Switch</button><button className="s-btn sm" onClick={() => setPending(null)}>Keep current</button></span>
      </div>
    )}
    <div className="s-scenarios" role="radiogroup" aria-label="Scenario">
      {SCENARIOS.map(sc => (
        <button key={sc.id} role="radio" aria-checked={sc.id === current} className={`s-scenario ${sc.id === current ? 'on' : ''}`} onClick={() => choose(sc.id)}>
          <span className="s-mono">{sc.ref}</span><b>{sc.title}</b><small>{sc.family} · {money(sc.exposure)} · {sc.treatment.kind === 'endpoint_isolation' ? 'isolate endpoint' : sc.treatment.kind === 'cloud_failover' ? 'cloud failover' : 'payment hold'}</small>
        </button>
      ))}
    </div>
    </>
  );
}

function ClosedPanel({ run }: { run: Run }) {
  const s = scenarioOf(run);
  const v = verifyLedger(run.ledger);
  return (
    <section className="s-panel raised s-workbench" data-tour="inc-workbench">
      <div className="s-wb-head"><div><span className="s-label">All seven gates sealed</span><h3 className="s-h2">{s.ref} closed — the record is complete</h3></div><span className="s-chip ok"><ShieldCheck size={14} />Chain intact · {v.checked} entries</span></div>
      <p className="s-lead">Residual risk {s.residual.likelihood * s.residual.impact}/16 remains visible with named follow-up owners. {run.revisions ? `The treatment was returned for revision ${run.revisions} time${run.revisions > 1 ? 's' : ''} before approval.` : ''}</p>
      <div className="s-row wrap" style={{ marginTop: 14 }}>
        <Link to="/report" className="s-btn primary lg">After-action report<ArrowRight size={16} /></Link>
        <Link to="/evidence" className="s-btn lg"><Fingerprint size={16} />Evidence ledger</Link>
        {s.macEligible && <Link to="/endpoint" className="s-btn lg">Final step: power off for re-imaging</Link>}
        <ConfirmButton className="s-btn ghost" confirmLabel="Click again for a fresh run" onConfirm={resetRun}><RotateCcw size={15} />Run again</ConfirmButton>
      </div>
    </section>
  );
}

export function ExposurePanel({ run }: { run: Run }) {
  const s = scenarioOf(run);
  const e = exposureNow(run);
  const pct = Math.round((e.current / e.max) * 100);
  return (
    <section className="s-panel" data-tour="inc-exposure" aria-label="Financial exposure">
      <div className="s-panel-head"><div><h3 className="s-h3">Financial exposure</h3><p className="s-small" style={{ margin: '3px 0 0' }}>Modelled for {s.ref} · simulated figures</p></div></div>
      <div className="s-exposure">
        <div><span className="s-label">{e.treated ? 'Residual after treatment' : 'Current (untreated)'}</span><b className={`s-num ${e.treated ? 's-teal' : 's-crimson'}`}>{money(e.current)}</b></div>
        <div className="s-meter crit" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
        <div className="s-row between s-small"><span>Score {e.inherent}/16 → {e.residualScore}/16</span><span>Maximum {money(e.max)}</span></div>
      </div>
    </section>
  );
}

export function TreatmentPanel({ run }: { run: Run }) {
  const s = scenarioOf(run);
  return (
    <section className="s-panel" data-tour="inc-treatment">
      <div className="s-panel-head"><div><h3 className="s-h3">Proposed treatment</h3><p className="s-small" style={{ margin: '3px 0 0' }}>Requested by {personMeta(s.requester).name} · {s.treatment.disruptive ? 'disruptive' : 'non-disruptive'}</p></div></div>
      <p style={{ margin: 0 }}><b>{s.treatment.name}.</b> {s.treatment.why}</p>
      <p className="s-small" style={{ marginBottom: 0 }}><b>Scope:</b> {s.treatment.scope}</p>
      <div className="s-options" data-tour="inc-options">
        <span className="s-label">Options considered and rejected</span>
        <ul>{s.treatment.notChosen.map(o => <li key={o.option}><b>{o.option}</b><span>{o.why}</span></li>)}</ul>
      </div>
    </section>
  );
}

export function LedgerList({ ledger, limit, fresh, details }: { ledger: LedgerEvent[]; limit?: number; fresh?: number; details?: boolean }) {
  const items = useMemo(() => [...ledger].reverse().slice(0, limit ?? ledger.length), [ledger, limit]);
  if (!ledger.length) return <div className="s-empty"><b>No entries yet</b>Entries appear the moment each person acts.</div>;
  return (
    <ol className="s-ledger" data-tour="inc-ledger">
      {items.map(e => (
        <li key={e.seq} className={`k-${e.kind} ${fresh && e.seq > ledger.length - fresh ? 'fresh' : ''}`}>
          <span className="s-ledger-time s-num">{timeOf(e.at)}</span>
          <span className="s-ledger-body"><b>{e.title}</b><span>{e.note}</span><small>{e.actorName}{e.actorRole && e.actor !== 'system' ? ` · ${e.actorRole}` : ''} · <span className="s-mono">#{e.seq} {e.hash.slice(0, 10)}</span></small>
            {details && e.detail && (
              <details className="s-ledger-detail"><summary><ChevronDown size={13} aria-hidden="true" />Signed form · {Object.keys(e.detail).length} fields</summary>
                <dl>{Object.entries(e.detail).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
              </details>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function NextDecision({ run }: { run: Run }) {
  const n = nextAction(run);
  const s = scenarioOf(run);
  if (run.status === 'ready') return (
    <div className="s-next"><span className="s-label">Next authorized decision</span><b>No incident running</b><span className="s-small">Start a synthetic scenario to see who must act.</span>
      <Link to="/incident" className="s-btn primary" style={{ marginTop: 10 }}><Play size={15} />Open incident console</Link></div>
  );
  if (run.status === 'closed') return (
    <div className="s-next"><span className="s-label">Next authorized decision</span><b>{s.ref} closed</b><span className="s-small">Follow-ups stay open with named owners.</span>
      <Link to="/report" className="s-btn" style={{ marginTop: 10 }}>After-action report<ArrowRight size={15} /></Link></div>
  );
  return (
    <div className="s-next" data-tour="cmd-decision">
      <span className="s-label">Next authorized decision · gate {gateIndex(n.gate ?? 'detect') + 1} of 7</span>
      <div className="s-row" style={{ gap: 12, marginTop: 6 }}>{n.actor ? <Avatar id={n.actor} size="lg" /> : <CircleX size={28} className="s-crimson" />}<div><b className="s-next-title">{n.title}</b><span className="s-small">{n.actor ? `${personMeta(n.actor).name} · ${personMeta(n.actor).role}` : n.step?.blockedReason ?? 'Blocked'}</span></div></div>
      <Link to="/incident" className="s-btn primary" style={{ marginTop: 12 }}>Open the decision<ArrowRight size={15} /></Link>
    </div>
  );
}
