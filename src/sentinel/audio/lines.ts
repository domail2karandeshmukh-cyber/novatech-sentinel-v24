/**
 * What NOVA says, tied to real engine state. Short, human, name-aware lines — NOVA explains
 * why the next person matters instead of reading the screen aloud.
 */
import type { LedgerEvent, Run } from '../engine/incident.ts';
import { scenarioOf, gateActor } from '../engine/incident.ts';
import { actorName } from '../data/team.ts';
import type { ScenarioId } from '../data/scenarios.ts';

type Style = 'story' | 'executive';
const first = (id: string) => actorName(id as never).split(' ')[0];

const ALERT: Record<ScenarioId, Record<Style, string>> = {
  ransomware: {
    story: 'Attention, team. A critical ransomware signal is spreading on a finance workstation in Angers. Karan, please take ownership. Nadia is already pulling the endpoint telemetry.',
    executive: 'Critical alert. Ransomware on a finance workstation in Angers. Two hundred and forty thousand euros modelled exposure. Owner required: Karan Deshmukh.',
  },
  cloud: {
    story: 'Attention, team. Our client portal is failing for sixty-one clients. Karan, please take ownership. Nadia, let’s rule out an attack before anyone touches the infrastructure.',
    executive: 'High-severity alert. Client portal errors above the critical threshold. One hundred and ten thousand euros at risk. Owner required: Karan Deshmukh.',
  },
  payments: {
    story: 'Heads up, team. A supplier’s bank details changed less than a day before an eighty-five thousand euro payment. Karan, please take ownership. Nadia, please check that mailbox.',
    executive: 'Payment-fraud alert. Bank details changed before an eighty-five thousand euro payment. Owner required: Karan Deshmukh.',
  },
};

export function alertLine(scenarioId: ScenarioId, style: Style) { return ALERT[scenarioId][style]; }

/** Narration for the newest ledger event, or null when NOVA should stay quiet. */
export function lineForEvent(run: Run, e: LedgerEvent, style: Style): { key: string; text: string } | null {
  const s = scenarioOf(run);
  const key = `${run.id}:${e.seq}`;
  const story = style === 'story';
  switch (e.kind) {
    case 'signal': return { key, text: alertLine(s.id, style) };
    case 'ownership': return { key, text: story
      ? `${first(e.actor)} has taken ownership. ${first(gateActor(run, 'assess'))}, over to you: what is really happening, and what is the safest way to contain it?`
      : `Owner confirmed: ${actorName(e.actor)}. Next: cybersecurity assessment by ${actorName(gateActor(run, 'assess'))}.` };
    case 'assessment': {
      const next = first(gateActor(run, 'impact'));
      const t = s.id === 'ransomware' ? `Assessment recorded. Nadia proposes isolating the workstation and keeping it powered on for forensics. ${next}, we need the business view: what could this cost us?`
        : s.id === 'cloud' ? `Assessment recorded. No sign of an attack, and the standby region is in sync. ${next}, what does this outage cost us?`
          : `Assessment recorded. This looks like business email compromise. ${next}, this one is yours: how much is at risk, and should the payment be held?`;
      return { key, text: story ? t : `Assessment recorded. Proposed treatment: ${s.treatment.name}. Next: financial impact.` };
    }
    case 'impact': {
      const t = s.id === 'ransomware' ? 'Two hundred and forty thousand euros at stake. Because isolation is disruptive, Victor’s security authorization comes first, and above one hundred thousand euros Vanessa must approve too. That is dual control.'
        : s.id === 'cloud' ? 'One hundred and ten thousand euros at stake. Victor, please confirm this is not an attack in disguise. Then Vanessa decides on the client-facing failover.'
          : 'Sarah requested the hold, so she cannot approve it herself. The policy routes the decision to Vanessa, as CEO.';
      return { key, text: story ? t : `Impact recorded: ${Math.round(s.exposure / 1000)} thousand euros. Approval route: ${run.approvals.map(a => actorName(a.acting)).join(', then ')}.` };
    }
    case 'approval_requested': return null; // covered by the impact / approved lines
    case 'approved': {
      const pending = run.approvals.find(a => a.status === 'pending');
      if (pending) return { key, text: story ? `${first(e.actor)} has authorized the ${e.title.toLowerCase().includes('security') ? 'security side' : 'step'}. ${first(pending.acting)}, the final call is yours. You can approve, or send it back for revision.` : `${e.title}. Next approver: ${actorName(pending.acting)}.` };
      const exec = first(gateActor(run, 'execute'));
      return { key, text: story ? `${first(e.actor)} has approved. ${exec}, you may execute the authorized scope, and only that scope.` : `All approvals recorded. Execution by ${actorName(gateActor(run, 'execute'))}, within scope only.` };
    }
    case 'returned': return { key, text: story ? `${first(e.actor)} has returned the treatment for revision. No disruptive action is allowed. ${first(gateActor(run, 'assess'))}, the proposal comes back to you.` : 'Returned for revision. Execution blocked. Back to the cybersecurity assessment.' };
    case 'delegated': return { key, text: `${e.title}. The separation-of-duties checks still apply to the delegate.` };
    case 'sod_blocked': return { key, text: story ? 'There is no eligible deputy, so the action stays blocked. That is exactly what governance should do.' : 'Approval blocked: no eligible deputy under separation of duties.' };
    case 'availability': return null;
    case 'executed': {
      // Say exactly how far the check is independent: of the execution always; of the approval only if that is true.
      const v = gateActor(run, 'verify');
      const alsoApproved = run.approvals.some(a => a.acting === v && a.status === 'approved');
      return { key, text: story ? `${first(e.actor)} has executed the approved action, in simulation. ${first(v)}, please verify the evidence. You did not perform this action, so your check is independent of the execution${alsoApproved ? ' — and the record shows that you also approved it' : ''}.` : `Execution recorded, simulated. Verification by ${actorName(v)}, independent of the execution.` };
    }
    case 'verified': return { key, text: story ? `Verification complete. ${first(gateActor(run, 'close'))}, the final gate is yours: record the residual risk and close the incident.` : 'Verification recorded. Closure by the Risk Coordinator.' };
    case 'closed': return { key, text: story ? 'The response is closed. Every decision has an owner, an authority and a proof. The remaining risk stays visible.' : `Incident ${s.ref} closed. Seven gates complete. Evidence ready for export.` };
    case 'remote': return null; // the endpoint page speaks its own, more specific lines
  }
}
