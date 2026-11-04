/**
 * "Challenge the controls": a professor's what-if, answered by the real engine on a private copy of the scenario
 * brought to the authorization gate. Nothing here touches the live run or its ledger.
 */
import { blankRun, gateActor, reduce, scenarioOf, sodForApproval } from './incident.ts';
import type { Run, SodCheck } from './incident.ts';
import type { ScenarioId } from '../data/scenarios.ts';
import { actorName } from '../data/team.ts';

export type WhatIfId = 'ceo-away' | 'ceo-returns' | 'executor-approves' | 'requester-approves';
export const WHAT_IFS: { id: WhatIfId; label: string; question: string }[] = [
  { id: 'ceo-away', label: 'The CEO is unavailable', question: 'What if the CEO is unavailable?' },
  { id: 'ceo-returns', label: 'The CEO sends it back', question: 'What if the CEO refuses and returns it?' },
  { id: 'executor-approves', label: 'Pavan approves his own action', question: 'What if the executor tries to approve?' },
  { id: 'requester-approves', label: 'The requester approves', question: 'What if the requester tries to approve?' },
];
export const isWhatIf = (v: unknown): v is WhatIfId => WHAT_IFS.some(w => w.id === v);

export type WhatIfResult = { verdict: 'refused' | 'delegated' | 'blocked' | 'returned'; headline: string; lines: string[]; checks: SodCheck[] };

/** A private copy of the scenario, recorded by the rightful owners up to the authorization gate. */
function atAuthorization(scenarioId: ScenarioId): Run {
  let t = Date.parse('2026-10-28T09:00:00Z');
  const at = () => new Date(t += 1000).toISOString();
  let run = reduce(blankRun(scenarioId, 'what-if'), { type: 'start' }, at()).run;
  const s = scenarioOf(run);
  for (const g of ['detect', 'assess', 'impact'] as const) {
    run = reduce(run, { type: 'record', gate: g, actor: gateActor(run, g), note: s.notes[g] ?? 'Recorded for the what-if copy.', consent: true }, at()).run;
  }
  return run;
}

export function whatIf(scenarioId: ScenarioId, id: WhatIfId): WhatIfResult {
  const base = atAuthorization(scenarioId);
  const s = scenarioOf(base);
  const at = () => new Date(Date.parse('2026-10-28T09:10:00Z')).toISOString();
  const route = (run: Run) => run.approvals.map(a => `${a.title}: ${actorName(a.acting)}${a.delegation ? ` (deputy for ${actorName(a.delegation.from)})` : ''} — ${a.status === 'blocked' ? 'blocked' : a.status}`);
  const pending = base.approvals.find(a => a.status === 'pending') ?? base.approvals[0];
  switch (id) {
    case 'ceo-away': {
      const out = reduce(base, { type: 'unavailable', person: 'vandana' }, at()).run;
      const exec = out.approvals.find(a => a.approver === 'vandana');
      if (exec?.status === 'blocked') return { verdict: 'blocked', headline: 'Blocked — nobody eligible may stand in for the CEO.', lines: [exec.blockedReason ?? '', ...route(out)], checks: [] };
      return { verdict: 'delegated', headline: `Delegated to ${actorName(exec?.acting ?? 'srija')}, time-boxed and recorded.`, lines: [...route(out), 'The deputy faces the same separation-of-duties checks as the CEO.'], checks: exec ? sodForApproval(out, exec.id, exec.acting) : [] };
    }
    case 'ceo-returns': {
      let run = base;
      for (const a of run.approvals) if (a.status === 'pending' && a.approver !== 'vandana') run = reduce(run, { type: 'decide', step: a.id, actor: a.acting, decision: 'approve', note: s.notes.security ?? 'Security sign-off for the scoped action.' }, at()).run;
      const ex = run.approvals.find(a => a.approver === 'vandana' && a.status === 'pending');
      const out = ex ? reduce(run, { type: 'decide', step: ex.id, actor: 'vandana', decision: 'return', note: 'Narrow the scope and resubmit with evidence.' }, at()).run : run;
      return { verdict: 'returned', headline: 'Returned for revision — nothing can be executed.', lines: [`The incident goes back to gate 2, ${actorName(gateActor(out, 'assess'))}’s cyber assessment.`, 'Every earlier approval must be given again on the revised proposal.', 'The return and its reason are written to the ledger.'], checks: [] };
    }
    case 'executor-approves': {
      const executor = gateActor(base, 'execute');
      const checks = sodForApproval(base, pending.id, executor);
      const out = reduce(base, { type: 'decide', step: pending.id, actor: executor, decision: 'approve', note: 'I approve this myself.' }, at());
      return { verdict: 'refused', headline: `Refused — ${actorName(executor)} executes this action and so can never approve it.`, lines: [`${pending.title} belongs to ${actorName(pending.acting)}.`, out.error ? 'The engine rejected the decision; nothing was recorded.' : ''].filter(Boolean), checks };
    }
    case 'requester-approves': {
      const checks = sodForApproval(base, pending.id, s.requester);
      const out = reduce(base, { type: 'decide', step: pending.id, actor: s.requester, decision: 'approve', note: 'I approve my own request.' }, at());
      return { verdict: 'refused', headline: `Refused — ${actorName(s.requester)} requested this treatment and cannot approve it.`, lines: [`${pending.title} belongs to ${actorName(pending.acting)}.`, out.error ? 'The engine rejected the decision; nothing was recorded.' : ''].filter(Boolean), checks };
    }
  }
}
