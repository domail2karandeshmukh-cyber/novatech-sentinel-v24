/**
 * NOVATECH Sentinel V2.4 incident engine.
 * Pure, deterministic state transitions for the governed seven-gate workflow:
 * Detect → Cyber assessment → Financial impact → Executive authorization → IT action → Independent verification → Risk closure.
 * Every decision is checked against the canonical owner of the gate and separation-of-duties rules,
 * and recorded in a SHA-256 hash-chained local ledger (a classroom simulation, not a production audit store).
 */
import { GATES, gateIndex, scenarioById, SCENARIOS } from '../data/scenarios.ts';
import type { ApprovalSpec, GateKey, Scenario, ScenarioId, TaskSpec } from '../data/scenarios.ts';
import { actorName, actorRole, person } from '../data/team.ts';
import type { ActorId, PersonId } from '../data/team.ts';
import { sha256Hex } from './sha256.ts';

export type LedgerKind = 'signal' | 'ownership' | 'assessment' | 'impact' | 'approval_requested' | 'approved' | 'returned'
  | 'delegated' | 'sod_blocked' | 'availability' | 'executed' | 'verified' | 'closed' | 'remote';

export type LedgerEvent = {
  seq: number; at: string; actor: ActorId | 'system'; actorName: string; actorRole: string;
  gate: GateKey | 'system'; kind: LedgerKind; title: string; note: string; simulated: true;
  /** The structured form behind the decision (label → value), covered by the hash when present. */
  detail?: Record<string, string>;
  prevHash: string; hash: string;
};

export type StepId = ApprovalSpec['id'];
export type ApprovalState = {
  id: StepId; approver: PersonId; acting: ActorId; title: string; rule: string;
  status: 'waiting' | 'pending' | 'approved' | 'returned' | 'blocked';
  decidedAt?: string; note?: string; blockedReason?: string;
  delegation?: { from: PersonId; to: ActorId; reason: string };
  /** The approver's form: decision, conditions and validity. Execution must respect the conditions. */
  fields?: Record<string, string>;
};

export type GateRecord = { by: ActorId; at: string; note: string; fields?: Record<string, string> };
export type Run = {
  v: 24; id: string; scenarioId: ScenarioId; status: 'ready' | 'active' | 'closed';
  gate: number; startedAt: string | null; closedAt: string | null; revisions: number;
  approvals: ApprovalState[]; unavailable: PersonId[];
  records: Partial<Record<GateKey, GateRecord>>;
  ledger: LedgerEvent[];
};

export type Command =
  | { type: 'start' }
  | { type: 'record'; gate: Exclude<GateKey, 'authorize'>; actor: ActorId; note: string; consent?: boolean; fields?: Record<string, string> }
  | { type: 'decide'; step: StepId; actor: ActorId; decision: 'approve' | 'return'; note: string; fields?: Record<string, string> }
  | { type: 'unavailable'; person: PersonId }
  | { type: 'available'; person: PersonId }
  | { type: 'remote'; actor: ActorId | 'system'; title: string; note: string };

export type Outcome = { run: Run; error?: string; info?: string };
/** `disclosed`: not a block, but a conflict shown openly (e.g. the verifier also approved) instead of being hidden. */
export type SodCheck = { rule: string; ok: boolean; detail: string; disclosed?: boolean };

export const GENESIS = 'GENESIS';
export const MIN_NOTE = 12;

export function blankRun(scenarioId: ScenarioId = 'ransomware', id = 'run-local'): Run {
  return { v: 24, id, scenarioId, status: 'ready', gate: 0, startedAt: null, closedAt: null, revisions: 0, approvals: [], unavailable: [], records: {}, ledger: [] };
}

function linkHash(e: Omit<LedgerEvent, 'hash'>) {
  // Entries without a structured form hash exactly as before; a form is part of the fingerprint when present.
  const parts: (string | number)[] = [e.prevHash, e.seq, e.at, e.actor, e.gate, e.kind, e.title, e.note];
  if (e.detail && Object.keys(e.detail).length) parts.push(JSON.stringify(e.detail));
  return sha256Hex(parts.join('|'));
}

function append(run: Run, partial: { actor: ActorId | 'system'; gate: GateKey | 'system'; kind: LedgerKind; title: string; note: string; detail?: Record<string, string> }, at: string): Run {
  const prevHash = run.ledger.length ? run.ledger[run.ledger.length - 1].hash : GENESIS;
  const base: Omit<LedgerEvent, 'hash'> = { seq: run.ledger.length + 1, at, actor: partial.actor, actorName: actorName(partial.actor), actorRole: actorRole(partial.actor), gate: partial.gate, kind: partial.kind, title: partial.title, note: partial.note, simulated: true as const, prevHash };
  if (partial.detail && Object.keys(partial.detail).length) base.detail = partial.detail;
  return { ...run, ledger: [...run.ledger, { ...base, hash: linkHash(base) }] };
}

/** A structured form must be a small map of short strings; anything else is refused rather than trimmed silently. */
export function cleanFields(fields: unknown): { ok: true; fields?: Record<string, string> } | { ok: false; error: string } {
  if (fields === undefined) return { ok: true };
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return { ok: false, error: 'The form could not be read.' };
  const entries = Object.entries(fields as Record<string, unknown>);
  if (entries.length > 24) return { ok: false, error: 'The form has too many fields.' };
  const out: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (typeof v !== 'string' || k.length > 80 || v.length > 600) return { ok: false, error: `The form field “${k.slice(0, 40)}” is not valid.` };
    if (v.trim()) out[k] = v.trim();
  }
  return { ok: true, fields: Object.keys(out).length ? out : undefined };
}

/** Recompute the whole chain; reports the first broken link. */
export function verifyLedger(ledger: LedgerEvent[]): { ok: boolean; checked: number; brokenAt?: number; head: string } {
  let prev = GENESIS;
  for (let i = 0; i < ledger.length; i++) {
    const e = ledger[i];
    const { hash, ...rest } = e;
    if (e.prevHash !== prev || e.seq !== i + 1 || linkHash(rest) !== hash) return { ok: false, checked: i, brokenAt: e.seq, head: prev };
    prev = hash;
  }
  return { ok: true, checked: ledger.length, head: prev };
}

export const scenarioOf = (run: Run): Scenario => scenarioById(run.scenarioId);
export const currentGate = (run: Run): GateKey | null => run.status === 'active' ? GATES[run.gate]?.key ?? null : null;
export const gateDone = (run: Run, key: GateKey) => run.status === 'closed' || (run.status === 'active' && gateIndex(key) < run.gate);

/** Delegation policy for the professor's "what if someone is unavailable?" question. */
export const DELEGATION_POLICY: Partial<Record<PersonId, { covers: string; approvalDeputies: ActorId[]; gateDeputy?: { gate: GateKey; to: ActorId } }>> = {
  // In the fictional classroom policy, the CISO is first in the executive continuity line,
  // but may NEVER countersign a security decision he already approved. The CFO is the
  // independent fallback for that case; she may not approve her own payment request.
  vandana: { covers: 'Executive authorization (temporary, scenario-checked continuity authority)', approvalDeputies: ['vijay', 'srija'] },
  // The CISO's deputy is the security analyst first (competence), then the CEO; SoD skips either when conflicted.
  vijay: { covers: 'Security authorization and verification', approvalDeputies: ['nandini', 'vandana'], gateDeputy: { gate: 'verify', to: 'karan' } },
  pavan: { covers: 'Authorised IT action', approvalDeputies: [], gateDeputy: { gate: 'execute', to: 'thomas' } },
};

/** Who must act on a non-authorization gate, after applying delegation for unavailable people. */
export function gateActor(run: Run, gate: Exclude<GateKey, 'authorize'>): ActorId {
  const owner = scenarioOf(run).owners[gate];
  if (!run.unavailable.includes(owner)) return owner;
  const deputy = DELEGATION_POLICY[owner]?.gateDeputy;
  return deputy && deputy.gate === gate ? deputy.to : owner;
}

export const executorOf = (run: Run): ActorId => run.records.execute?.by ?? gateActor(run, 'execute');

export function sodForApproval(run: Run, step: StepId, actor: ActorId): SodCheck[] {
  const s = scenarioOf(run);
  const others = run.approvals.filter(a => a.id !== step && (a.status === 'approved' || a.status === 'pending' || a.status === 'waiting'));
  const executor = executorOf(run);
  return [
    { rule: 'Approver is not the requester', ok: actor !== s.requester, detail: `${actorName(s.requester)} requested this treatment.` },
    { rule: 'Approver will not execute', ok: actor !== executor, detail: `${actorName(executor)} executes the approved action.` },
    { rule: 'Dual control uses two different people', ok: !others.some(a => a.acting === actor), detail: others.length ? `Other approval held by ${others.map(a => actorName(a.acting)).join(', ')}.` : 'Single approval route.' },
  ];
}

export function sodForExecute(run: Run, actor: ActorId): SodCheck[] {
  return [{ rule: 'Executor did not approve', ok: !run.approvals.some(a => a.acting === actor), detail: 'Approvers cannot execute what they approved.' }];
}

export function sodForVerify(run: Run, actor: ActorId): SodCheck[] {
  const s = scenarioOf(run);
  const executor = run.records.execute?.by;
  return [
    { rule: 'Verifier did not execute', ok: actor !== executor, detail: executor ? `${actorName(executor)} executed the action.` : 'Execution not yet recorded.' },
    { rule: 'Verifier is not the requester', ok: actor !== s.requester, detail: `${actorName(s.requester)} requested the treatment.` },
    ...verifierAlsoApproved(run, actor),
  ];
}

/** Independence is claimed only as far as it is true: a verifier who also approved is disclosed, not called independent. */
function verifierAlsoApproved(run: Run, actor: ActorId): SodCheck[] {
  const own = run.approvals.filter(a => a.acting === actor && a.status === 'approved');
  if (!own.length) return [];
  const others = run.approvals.filter(a => a.acting !== actor && a.status === 'approved').map(a => actorName(a.acting));
  return [{
    rule: 'Disclosed: the verifier also approved', ok: true, disclosed: true,
    detail: `${actorName(actor)} gave the ${own.map(a => a.title.toLowerCase()).join(' and ')}. This check is independent of the execution and of the request, not of the approval${others.length ? `; ${others.join(' and ')} approved separately` : ''}. Internal audit can take this gate for full independence.`,
  }];
}

/** True when the person who verified also approved — the report and NOVA then say "independent of execution". */
export const verifierApproved = (run: Run): boolean => {
  const v = run.records.verify?.by ?? gateActor(run, 'verify');
  return run.approvals.some(a => a.acting === v && a.status === 'approved');
};

function instantiateApprovals(run: Run, at: string): Run {
  const s = scenarioOf(run);
  let next: Run = { ...run, approvals: normalizeOrder(s.approvals.map(spec => ({ id: spec.id, approver: spec.approver, acting: spec.approver, title: spec.title, rule: spec.rule, status: 'waiting' as const }))) };
  next = applyAvailability(next, at);
  const pending = next.approvals.find(a => a.status === 'pending');
  if (pending) next = append(next, { actor: 'system', gate: 'authorize', kind: 'approval_requested', title: `${pending.title} requested`, note: `${pending.rule} Routed to ${actorName(pending.acting)}.` }, at);
  return next;
}

/** Sequential route: the first undecided, unblocked step is pending; later ones wait. Blocked steps stop the route. */
function normalizeOrder(approvals: ApprovalState[]): ApprovalState[] {
  let open = true;
  return approvals.map(a => {
    if (a.status === 'approved' || a.status === 'returned') return a;
    if (a.status === 'blocked') { open = false; return a; }
    const status: ApprovalState['status'] = open ? 'pending' : 'waiting';
    open = false;
    return { ...a, status };
  });
}

/** Re-route undecided approval steps when an approver is unavailable; block when no eligible deputy exists. */
function applyAvailability(run: Run, at: string): Run {
  let next = run;
  const approvals = run.approvals.map(a => ({ ...a }));
  for (const a of approvals) {
    if (a.status === 'approved' || a.status === 'returned') continue;
    const away = run.unavailable.includes(a.approver);
    if (!away) {
      if (a.delegation || a.status === 'blocked') {
        a.acting = a.approver; delete a.delegation; delete a.blockedReason;
        if (a.status === 'blocked') a.status = 'waiting';
      }
      continue;
    }
    if (a.delegation && !run.unavailable.includes(a.delegation.to as PersonId)) continue;
    const deputies = DELEGATION_POLICY[a.approver]?.approvalDeputies ?? [];
    const temp: Run = { ...run, approvals };
    const eligible = deputies.find(d => !run.unavailable.includes(d as PersonId) && sodForApproval(temp, a.id, d).every(c => c.ok));
    if (eligible) {
      a.acting = eligible;
      a.delegation = { from: a.approver, to: eligible, reason: `${person(a.approver).first} is unavailable; ${actorName(eligible)} holds delegated authority for ${DELEGATION_POLICY[a.approver]?.covers.toLowerCase()}.` };
      if (a.status === 'blocked') { a.status = 'waiting'; delete a.blockedReason; }
      next = append({ ...next, approvals: normalizeOrder(approvals) }, { actor: 'system', gate: 'authorize', kind: 'delegated', title: `${a.title} delegated to ${actorName(eligible)}`, note: a.delegation.reason }, at);
    } else {
      const reasons = deputies.map(d => {
        const failed = sodForApproval(temp, a.id, d).filter(c => !c.ok).map(c => c.rule.toLowerCase());
        return `${actorName(d)} is ineligible (${failed.join('; ') || 'unavailable'})`;
      });
      a.status = 'blocked';
      a.acting = a.approver; delete a.delegation;
      a.blockedReason = `${person(a.approver).first} is unavailable and no eligible deputy exists. ${reasons.join('. ')}. The action stays blocked until ${person(a.approver).first} returns or the board appoints an interim.`;
      next = append({ ...next, approvals: normalizeOrder(approvals) }, { actor: 'system', gate: 'authorize', kind: 'sod_blocked', title: `${a.title} blocked — no eligible deputy`, note: a.blockedReason }, at);
    }
  }
  return { ...next, approvals: normalizeOrder(approvals) };
}

const KIND_BY_GATE: Record<Exclude<GateKey, 'authorize'>, LedgerKind> = {
  detect: 'ownership', assess: 'assessment', impact: 'impact', execute: 'executed', verify: 'verified', close: 'closed',
};
const TITLE_BY_GATE: Record<Exclude<GateKey, 'authorize'>, string> = {
  detect: 'Alert acknowledged — incident owned', assess: 'Cybersecurity assessment recorded', impact: 'Financial impact recorded',
  execute: 'Approved action executed (simulated)', verify: 'Independent verification recorded', close: 'Risk closed with residual risk recorded',
};

export function reduce(run: Run, cmd: Command, at: string = new Date().toISOString()): Outcome {
  const s = scenarioOf(run);
  switch (cmd.type) {
    case 'start': {
      if (run.status !== 'ready') return { run, error: 'This incident has already started. Reset to run it again.' };
      const started: Run = { ...run, status: 'active', gate: 0, startedAt: at };
      return { run: append(started, { actor: 'system', gate: 'system', kind: 'signal', title: `Signal received — ${s.ref}`, note: s.signal }, at), info: `${s.ref} is live. ${actorName(gateActor(started, 'detect'))} must take ownership.` };
    }
    case 'remote': {
      return { run: append(run, { actor: cmd.actor, gate: 'system', kind: 'remote', title: cmd.title, note: cmd.note }, at) };
    }
    case 'unavailable':
    case 'available': {
      if (!DELEGATION_POLICY[cmd.person]) return { run, error: 'Delegation is modelled for the CEO, the CISO and the IT Operations Manager.' };
      const unavailable = cmd.type === 'unavailable' ? [...new Set([...run.unavailable, cmd.person])] : run.unavailable.filter(p => p !== cmd.person);
      let next = append({ ...run, unavailable }, { actor: 'system', gate: 'system', kind: 'availability', title: `${person(cmd.person).name} marked ${cmd.type === 'unavailable' ? 'unavailable' : 'available again'}`, note: `Policy: ${DELEGATION_POLICY[cmd.person]!.covers}.` }, at);
      if (next.approvals.length) next = applyAvailability(next, at);
      return { run: next };
    }
    case 'record': {
      if (run.status !== 'active') return { run, error: run.status === 'ready' ? 'Start the incident before recording a decision.' : 'This incident is closed. Reset to rehearse again.' };
      const expected = GATES[run.gate]?.key;
      if (expected !== cmd.gate) return { run, error: `The next gate is ${GATES[run.gate]?.title ?? 'none'}, not ${GATES[gateIndex(cmd.gate)]?.title}.` };
      const owner = gateActor(run, cmd.gate);
      if (cmd.actor !== owner) return { run, error: `${GATES[run.gate].title} belongs to ${actorName(owner)} (${actorRole(owner)}). Switch persona to continue.` };
      if (cmd.note.trim().length < MIN_NOTE) return { run, error: `Add at least ${MIN_NOTE} characters of evidence or rationale.` };
      if (cmd.gate === 'execute') {
        if (!cmd.consent) return { run, error: 'Confirm that this execution is simulated before recording it.' };
        const failed = sodForExecute(run, cmd.actor).filter(c => !c.ok);
        if (failed.length) return { run, error: `Separation of duties: ${failed.map(f => f.rule).join('; ')}.` };
      }
      if (cmd.gate === 'verify') {
        const failed = sodForVerify(run, cmd.actor).filter(c => !c.ok);
        if (failed.length) return { run, error: `Separation of duties: ${failed.map(f => f.rule).join('; ')}.` };
      }
      const form = cleanFields(cmd.fields);
      if (!form.ok) return { run, error: form.error };
      const record: GateRecord = { by: cmd.actor, at, note: cmd.note.trim(), ...(form.fields ? { fields: form.fields } : {}) };
      let next: Run = { ...run, records: { ...run.records, [cmd.gate]: record } };
      next = append(next, { actor: cmd.actor, gate: cmd.gate, kind: KIND_BY_GATE[cmd.gate], title: TITLE_BY_GATE[cmd.gate], note: record.note, detail: form.fields }, at);
      if (cmd.gate === 'close') return { run: { ...next, gate: GATES.length, status: 'closed', closedAt: at }, info: `${s.ref} closed. The record is complete.` };
      next = { ...next, gate: run.gate + 1 };
      if (GATES[next.gate].key === 'authorize') next = instantiateApprovals(next, at);
      return { run: next };
    }
    case 'decide': {
      if (run.status !== 'active' || GATES[run.gate]?.key !== 'authorize') return { run, error: 'There is no authorization waiting for a decision.' };
      const idx = run.approvals.findIndex(a => a.id === cmd.step);
      const step = run.approvals[idx];
      if (!step) return { run, error: 'Unknown approval step.' };
      if (step.status === 'blocked') return { run, error: step.blockedReason ?? 'This approval is blocked.' };
      if (step.status !== 'pending') return { run, error: step.status === 'waiting' ? 'An earlier approval in the route must be decided first.' : 'This approval has already been decided.' };
      if (cmd.actor !== step.acting) return { run, error: `${step.title} belongs to ${actorName(step.acting)}${step.delegation ? ' (delegated authority)' : ''}. Switch persona to continue.` };
      if (cmd.note.trim().length < MIN_NOTE) return { run, error: `Add at least ${MIN_NOTE} characters of rationale.` };
      const failed = sodForApproval(run, step.id, cmd.actor).filter(c => !c.ok);
      if (failed.length) return { run, error: `Separation of duties: ${failed.map(f => f.rule).join('; ')}.` };
      const form = cleanFields(cmd.fields);
      if (!form.ok) return { run, error: form.error };
      if (cmd.decision === 'return') {
        let back: Run = { ...run, approvals: [], gate: gateIndex('assess'), revisions: run.revisions + 1, records: { detect: run.records.detect } };
        back = append(back, { actor: cmd.actor, gate: 'authorize', kind: 'returned', title: `${step.title}: returned for revision`, note: `${cmd.note.trim()} — No disruptive action is permitted. The treatment goes back to ${actorName(gateActor(run, 'assess'))}.`, detail: form.fields }, at);
        return { run: back, info: 'Returned for revision. Assessment and impact must be recorded again before a new authorization.' };
      }
      const approvals = normalizeOrder(run.approvals.map((a, i) => i === idx ? { ...a, status: 'approved' as const, decidedAt: at, note: cmd.note.trim(), ...(form.fields ? { fields: form.fields } : {}) } : a));
      let next: Run = append({ ...run, approvals }, { actor: cmd.actor, gate: 'authorize', kind: 'approved', title: `${step.title} granted${step.delegation ? ' (delegated)' : ''}`, note: cmd.note.trim(), detail: form.fields }, at);
      const pending = approvals.find(a => a.status === 'pending');
      if (pending) {
        next = append(next, { actor: 'system', gate: 'authorize', kind: 'approval_requested', title: `${pending.title} requested`, note: `${pending.rule} Routed to ${actorName(pending.acting)}.` }, at);
        return { run: next };
      }
      const blocked = approvals.find(a => a.status === 'blocked');
      if (blocked) return { run: next, info: `${step.title} granted, but ${blocked.title.toLowerCase()} is blocked: ${blocked.blockedReason}` };
      return { run: { ...next, gate: run.gate + 1 }, info: `All approvals recorded. ${actorName(gateActor(next, 'execute'))} may execute the authorised scope only.` };
    }
  }
}

/** Mac endpoint eligibility (V2.4): only after the complete, director-approved ransomware workflow. */
export function macEligibility(run: Run): { ok: boolean; checks: { label: string; ok: boolean }[] } {
  const s = scenarioOf(run);
  const checks = [
    { label: 'Ransomware training scenario', ok: s.macEligible },
    { label: 'All required approvals granted', ok: run.approvals.length > 0 && run.approvals.every(a => a.status === 'approved') },
    { label: 'Approved action executed (simulated)', ok: !!run.records.execute },
    { label: 'Verified by someone who did not execute', ok: !!run.records.verify && run.records.verify.by !== run.records.execute?.by },
    { label: 'Risk closed by the Risk Coordinator', ok: run.status === 'closed' && !!run.records.close },
  ];
  return { ok: checks.every(c => c.ok), checks };
}

export type TaskStatus = 'done' | 'open' | 'overdue' | 'planned';
export function taskStatus(t: TaskSpec, run: Run, nowMs: number): TaskStatus {
  const started = run.startedAt ? Date.parse(run.startedAt) : null;
  if (t.doneAt) {
    if (gateDone(run, t.doneAt)) return 'done';
    if (started === null) return 'planned';
    return nowMs > started + t.dueMin * 60_000 ? 'overdue' : 'open';
  }
  if (t.followUp) return started === null ? 'planned' : 'open';
  return t.dueMin < 0 ? 'overdue' : 'open';
}

export function taskDueLabel(t: TaskSpec, run: Run, nowMs: number): string {
  const fmt = (min: number) => Math.abs(min) >= 1440 ? `${Math.round(Math.abs(min) / 1440)} d` : Math.abs(min) >= 60 ? `${Math.round(Math.abs(min) / 60)} h` : `${Math.max(1, Math.round(Math.abs(min)))} min`;
  if (!t.doneAt && !t.followUp) return t.dueMin < 0 ? `${fmt(t.dueMin)} overdue` : `due in ${fmt(t.dueMin)}`;
  const started = run.startedAt ? Date.parse(run.startedAt) : null;
  if (started === null) return `T + ${fmt(t.dueMin)}`;
  const left = (started + t.dueMin * 60_000 - nowMs) / 60_000;
  return left < 0 ? `${fmt(left)} overdue` : `due in ${fmt(left)}`;
}

export function taskCounts(run: Run, nowMs: number) {
  const s = scenarioOf(run);
  const counts = { done: 0, open: 0, overdue: 0, planned: 0 };
  for (const t of s.tasks) counts[taskStatus(t, run, nowMs)]++;
  return counts;
}

export function deptReadiness(run: Run, nowMs: number) {
  const s = scenarioOf(run);
  return s.plans.map(plan => {
    const tasks = s.tasks.filter(t => t.dept === plan.dept && t.doneAt);
    const done = tasks.filter(t => taskStatus(t, run, nowMs) === 'done').length;
    const overdue = s.tasks.filter(t => t.dept === plan.dept && taskStatus(t, run, nowMs) === 'overdue').length;
    return { plan, total: tasks.length, done, overdue, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
  });
}

/** Exposure before treatment, and the residual exposure once the approved action is executed and verified. */
export function exposureNow(run: Run) {
  const s = scenarioOf(run);
  const inherent = s.likelihood * s.impact;
  const residualScore = s.residual.likelihood * s.residual.impact;
  const treated = gateDone(run, 'execute');
  return {
    inherent, residualScore, treated,
    current: treated ? Math.round((s.exposure * residualScore) / inherent / 1000) * 1000 : s.exposure,
    max: s.exposure,
  };
}

export function money(n: number) {
  return `€${new Intl.NumberFormat('en-IE', { maximumFractionDigits: 0 }).format(n)}`;
}
export function moneyShort(n: number) {
  return n >= 1_000_000 ? `€${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `€${Math.round(n / 1000)}k` : `€${n}`;
}

export function nextAction(run: Run): { gate: GateKey | null; actor: ActorId | null; title: string; step?: ApprovalState } {
  if (run.status === 'ready') return { gate: null, actor: null, title: 'Start the synthetic incident' };
  if (run.status === 'closed') return { gate: null, actor: null, title: 'Incident closed' };
  const g = GATES[run.gate];
  if (g.key === 'authorize') {
    const step = run.approvals.find(a => a.status === 'pending') ?? run.approvals.find(a => a.status === 'blocked');
    return { gate: 'authorize', actor: step?.status === 'pending' ? step.acting : null, title: step ? step.title : g.title, step };
  }
  return { gate: g.key, actor: gateActor(run, g.key as Exclude<GateKey, 'authorize'>), title: g.title };
}

export function sanitizeRun(raw: unknown): Run | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Run>;
  if (r.v !== 24 || !SCENARIOS.some(s => s.id === r.scenarioId) || !['ready', 'active', 'closed'].includes(String(r.status))) return null;
  if (!Number.isInteger(r.gate) || (r.gate as number) < 0 || (r.gate as number) > GATES.length) return null;
  if (!Array.isArray(r.ledger) || !Array.isArray(r.approvals) || !Array.isArray(r.unavailable)) return null;
  if (!verifyLedger(r.ledger as LedgerEvent[]).ok) return null;
  return r as Run;
}
