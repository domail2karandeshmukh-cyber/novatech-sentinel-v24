/**
 * Governance record sent to the Mac when Karan opens remote pairing (V2.4 agents show it in the
 * owner-approval window). The agent drops — never trims — any field over 120 characters and keeps
 * at most 10 approvals, so every field is clipped here to keep each signed step visible.
 */
import { GATES } from '../data/scenarios.ts';
import type { GateKey } from '../data/scenarios.ts';
import { actorName, actorRole } from '../data/team.ts';
import { scenarioOf } from './incident.ts';
import type { Run } from './incident.ts';

export const GOVERNANCE_FIELD_LIMIT = 120;
export const GOVERNANCE_MAX_APPROVALS = 10;

export type GovernanceRecord = {
  incidentId: string; scenario: string; reason: string;
  approvals: { gate: string; person: string; role: string; decision: string }[];
};

export function clipField(text: string): string {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  return chars.length <= GOVERNANCE_FIELD_LIMIT ? chars.join('') : `${chars.slice(0, GOVERNANCE_FIELD_LIMIT - 1).join('')}…`;
}

export function governanceRecord(run: Run): GovernanceRecord {
  const s = scenarioOf(run);
  const approvals = GATES.flatMap(g => {
    if (g.key === 'authorize') {
      return run.approvals.map(a => ({ gate: clipField(a.title), person: clipField(actorName(a.acting)), role: clipField(actorRole(a.acting)), decision: clipField(a.status) }));
    }
    const rec = run.records[g.key as Exclude<GateKey, 'authorize'>];
    return rec ? [{ gate: clipField(g.name), person: clipField(actorName(rec.by)), role: clipField(actorRole(rec.by)), decision: 'recorded' }] : [];
  });
  return {
    incidentId: clipField(s.ref),
    scenario: clipField(`${s.title} (classroom simulation)`),
    reason: clipField(`Power off the isolated endpoint for forensic imaging and re-imaging (${s.ref} closure follow-up)`),
    approvals: approvals.slice(0, GOVERNANCE_MAX_APPROVALS),
  };
}

/** The pairing request body the local agent expects (unchanged V2.3 fields plus the optional record). */
export function pairingBody(run: Run, controllerName: string) {
  return {
    workflowClosed: run.status === 'closed',
    approved: run.approvals.length > 0 && run.approvals.every(a => a.status === 'approved'),
    scenarioId: run.scenarioId,
    controllerName,
    governance: governanceRecord(run),
  };
}
