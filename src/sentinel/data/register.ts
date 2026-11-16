/**
 * Group 1 case register (R1–R6 from the original analysis, R7–R8 added for Finance in the governance upgrade).
 * Values read from the NOVATECH database (public.risk_dashboard and grc.risks, org NT) on 27 Oct 2026.
 * Scale: likelihood 1–4 × impact 1–4 = score 1–16 (teacher scale: 1–3 low, 4–7 moderate, 8–11 high, 12–16 critical).
 */
export type Kri = { name: string; unit: string; value: number; warning: number; critical: number; higherIsWorse: boolean };
export type RiskEntry = {
  code: string; title: string; category: string; owner: string; ownerTeam: 'group1' | 'fictional';
  department: string; likelihood: number; impact: number; residualTarget: number; treatment: string;
  mitigation: string; kri?: Kri; origin: 'case' | 'governance_upgrade';
};

export const REGISTER: RiskEntry[] = [
  { code: 'R1', title: 'Cloud outage / business continuity', category: 'Technology / Continuity', owner: 'Pierre Sauvage', ownerTeam: 'group1', department: 'IT Operations', likelihood: 4, impact: 4, residualTarget: 8, treatment: 'Reduce', mitigation: 'BCP/DR readiness, backup and restore testing, failover validation.', kri: { name: 'Cloud availability', unit: '%', value: 99.7, warning: 99.9, critical: 99.5, higherIsWorse: false }, origin: 'case' },
  { code: 'R2', title: 'Account compromise / cyber identity', category: 'Cybersecurity / Identity', owner: 'Victor Bonnet', ownerTeam: 'group1', department: 'Cybersecurity leadership', likelihood: 3, impact: 4, residualTarget: 6, treatment: 'Reduce', mitigation: 'MFA coverage, privileged-access review and suspicious-authentication investigation.', kri: { name: 'High-risk authentication events', unit: 'per day', value: 3, warning: 5, critical: 10, higherIsWorse: true }, origin: 'case' },
  { code: 'R3', title: 'Human error / onboarding / training', category: 'Human / Organisational', owner: 'Camille Laurent', ownerTeam: 'fictional', department: 'Human Resources', likelihood: 3, impact: 3, residualTarget: 6, treatment: 'Reduce', mitigation: 'Structured onboarding, training completion tracking and SOP reinforcement.', kri: { name: 'Training completion', unit: '%', value: 88, warning: 90, critical: 80, higherIsWorse: false }, origin: 'case' },
  { code: 'R4', title: 'Operational capacity / SLA failure', category: 'Operational', owner: 'Julie Martin', ownerTeam: 'fictional', department: 'Client Delivery', likelihood: 4, impact: 3, residualTarget: 6, treatment: 'Reduce', mitigation: 'Capacity review, SLA dashboard, escalation workflow and workload balancing.', kri: { name: 'SLA breaches this month', unit: 'breaches', value: 1, warning: 2, critical: 4, higherIsWorse: true }, origin: 'case' },
  { code: 'R5', title: 'Supplier / subcontractor failure', category: 'Third party', owner: 'Marc Dubois', ownerTeam: 'fictional', department: 'Procurement', likelihood: 3, impact: 3, residualTarget: 6, treatment: 'Reduce / Transfer', mitigation: 'Supplier criticality assessment, SLA clauses, continuity plans and overdue-action tracking.', kri: { name: 'Overdue supplier actions', unit: 'actions', value: 2, warning: 2, critical: 5, higherIsWorse: true }, origin: 'case' },
  { code: 'R6', title: 'Legal / compliance obligations', category: 'Legal / Compliance', owner: 'Sophie Girard', ownerTeam: 'fictional', department: 'Legal & Compliance', likelihood: 2, impact: 3, residualTarget: 4, treatment: 'Reduce', mitigation: 'Compliance register, periodic review and remediation tracking.', kri: { name: 'High-priority compliance gaps', unit: 'gaps', value: 1, warning: 2, critical: 4, higherIsWorse: true }, origin: 'case' },
  { code: 'R7', title: 'Supplier payment fraud (business email compromise)', category: 'Finance / Fraud', owner: 'Sarah Perrin', ownerTeam: 'group1', department: 'Finance (DAF)', likelihood: 3, impact: 4, residualTarget: 6, treatment: 'Reduce', mitigation: 'Out-of-band callback on any bank-detail change, dual control above €100,000, mailbox-rule monitoring.', origin: 'governance_upgrade' },
  { code: 'R8', title: 'Unauthorised access to finance systems', category: 'Finance / Cybersecurity', owner: 'Sarah Perrin', ownerTeam: 'group1', department: 'Finance (DAF)', likelihood: 2, impact: 4, residualTarget: 4, treatment: 'Reduce', mitigation: 'Privileged workstation hardening, EDR coverage, quarterly access recertification.', origin: 'governance_upgrade' },
];

export const scoreOf = (r: { likelihood: number; impact: number }) => r.likelihood * r.impact;
export type Level = 'low' | 'moderate' | 'high' | 'critical';
export function levelOf(score: number): Level {
  return score >= 12 ? 'critical' : score >= 8 ? 'high' : score >= 4 ? 'moderate' : 'low';
}
export const LEVEL_LABEL: Record<Level, string> = { low: 'Low', moderate: 'Moderate', high: 'High', critical: 'Critical' };
/** Board-approved appetite in the case: scores of 12 or more are outside tolerance. */
export const APPETITE_LIMIT = 11;

export function kriStatus(k: Kri): 'normal' | 'warning' | 'critical' {
  if (k.higherIsWorse) return k.value >= k.critical ? 'critical' : k.value >= k.warning ? 'warning' : 'normal';
  return k.value <= k.critical ? 'critical' : k.value < k.warning ? 'warning' : 'normal';
}

export const topExposures = (n = 5) => [...REGISTER].sort((a, b) => scoreOf(b) - scoreOf(a) || a.code.localeCompare(b.code)).slice(0, n);
