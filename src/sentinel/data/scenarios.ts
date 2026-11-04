import type { ActorId, PersonId } from './team';

/** The governed seven-stage workflow preserved from V2.3, now owned by the canonical team. */
export type GateKey = 'detect' | 'assess' | 'impact' | 'authorize' | 'execute' | 'verify' | 'close';
export const GATES: { key: GateKey; n: number; name: string; title: string; question: string }[] = [
  { key: 'detect', n: 1, name: 'Detect', title: 'Detect & take ownership', question: 'Is this real, and who owns it?' },
  { key: 'assess', n: 2, name: 'Cyber assessment', title: 'Cybersecurity assessment', question: 'What is technically happening, and what is the safest treatment?' },
  { key: 'impact', n: 3, name: 'Financial impact', title: 'Financial impact', question: 'What could this cost the business?' },
  { key: 'authorize', n: 4, name: 'Executive authorization', title: 'Executive authorization', question: 'Who is allowed to approve this, and do they?' },
  { key: 'execute', n: 5, name: 'IT action', title: 'Authorised IT action', question: 'Do exactly what was approved — nothing more.' },
  { key: 'verify', n: 6, name: 'Independent verification', title: 'Independent verification', question: 'Did it work? Checked by someone who did not do it.' },
  { key: 'close', n: 7, name: 'Risk closure', title: 'Risk closure', question: 'What risk remains, and who owns the follow-up?' },
];
export const gateIndex = (k: GateKey) => GATES.findIndex(g => g.key === k);

export type ScenarioId = 'ransomware' | 'cloud' | 'payments';
export type DeptKey = 'cyber' | 'finance' | 'it' | 'exec' | 'risk';
export type ApprovalSpec = { id: 'security' | 'executive'; approver: PersonId; title: string; rule: string };
export type TaskSpec = {
  id: string; dept: DeptKey; title: string; owner: ActorId; dueMin: number;
  doneAt?: GateKey; followUp?: boolean; evidence: string;
};
export type DeptPlan = { dept: DeptKey; name: string; owner: PersonId; accountable: PersonId; objective: string; rollback: string };
export type RaciRow = { activity: string; r: ActorId[]; a: PersonId; c: ActorId[]; i: ActorId[] };
export type Kri = { name: string; unit: string; value: number; warning: number; critical: number; higherIsWorse: boolean };

export type Scenario = {
  id: ScenarioId; ref: string; title: string; family: string; severity: 'Critical' | 'High';
  summary: string; signal: string; assetId: string; assetName: string; site: string; businessImpact: string;
  exposure: number; likelihood: number; impact: number; residual: { likelihood: number; impact: number };
  risks: string[];
  treatment: { kind: 'endpoint_isolation' | 'cloud_failover' | 'payment_hold'; name: string; disruptive: boolean; scope: string; why: string; notChosen: { option: string; why: string }[] };
  requester: PersonId; requesterGate: GateKey;
  owners: Record<Exclude<GateKey, 'authorize'>, PersonId>;
  approvals: ApprovalSpec[];
  notes: Record<Exclude<GateKey, 'authorize'>, string> & { security?: string; executive: string };
  executeConsent: string;
  verification: string[];
  plans: DeptPlan[];
  tasks: TaskSpec[];
  raci: RaciRow[];
  regulatory: { name: string; clock: string; status: string }[];
  kris: Kri[];
  trajectory: number[];
  atlas: { focus: string; affected: string[]; watch: string[]; threat: string[]; recovery?: string };
  responseDeadlineMin: number;
  lessons: string[];
  macEligible: boolean;
};

const COMMON_BACKLOG: TaskSpec[] = [
  { id: 'bk-phish', dept: 'cyber', title: 'Quarterly phishing simulation for Finance', owner: 'nandini', dueMin: -6 * 1440, evidence: 'Campaign report' },
  { id: 'bk-vpn', dept: 'it', title: 'Patch the VPN gateway firmware (October batch)', owner: 'pavan', dueMin: -2 * 1440, evidence: 'Change record + version check' },
  { id: 'bk-restore', dept: 'risk', title: 'Re-run the restore test that missed the 4 h RTO in July', owner: 'karan', dueMin: -9 * 1440, evidence: 'Restore test report' },
  { id: 'bk-callback', dept: 'finance', title: 'Publish the supplier bank-detail callback procedure', owner: 'srija', dueMin: 5 * 1440, evidence: 'Signed procedure' },
  { id: 'bk-budget', dept: 'exec', title: 'Approve the 2027 security budget', owner: 'vandana', dueMin: 12 * 1440, evidence: 'Board minute' },
  { id: 'bk-mfa', dept: 'cyber', title: 'Close the last 6 accounts without MFA', owner: 'vijay', dueMin: 3 * 1440, evidence: 'MFA coverage report' },
];

export const DEPT_NAMES: Record<DeptKey, string> = {
  cyber: 'Cybersecurity', finance: 'Finance', it: 'IT Operations', exec: 'Executive', risk: 'Risk & PMO',
};

export const SCENARIOS: Scenario[] = [
  {
    id: 'ransomware', ref: 'NT-SEC-041', title: 'Ransomware on a finance workstation', family: 'Cybersecurity', severity: 'Critical',
    summary: 'EDR telemetry shows an encryption burst on FIN-WS-07, a privileged finance workstation in Angers that maps the finance shared drive. Payroll and supplier-payment files are next in line.',
    signal: 'EDR telemetry · 1,240 files renamed in 90 seconds on FIN-WS-07',
    assetId: 'FIN-WS-07', assetName: 'Finance workstation FIN-WS-07', site: 'Angers head office',
    businessImpact: 'Payroll and supplier payments, finance shared-drive availability',
    exposure: 240_000, likelihood: 4, impact: 4, residual: { likelihood: 2, impact: 3 },
    risks: ['R2', 'R8', 'R1'],
    treatment: {
      kind: 'endpoint_isolation', name: 'Isolate FIN-WS-07 and suspend its privileged sessions', disruptive: true,
      scope: 'One workstation and one privileged account. The finance shared drive becomes read-only for two hours.',
      why: 'Stops encryption reaching the shared drive while keeping the device powered on, so memory evidence survives.',
      notChosen: [
        { option: 'Shut the workstation down now', why: 'Not yet: it would destroy the memory evidence (keys, attacker processes) and does nothing about other hosts. Power-off comes after the memory image is verified, as the first step of re-imaging.' },
        { option: 'Monitor and wait', why: 'Encryption reaches the finance shared drive within minutes; the exposure grows.' },
        { option: 'Pay the ransom', why: 'No guarantee of recovery, funds crime, possible sanctions exposure. NOVATECH policy forbids it.' },
      ],
    },
    requester: 'nandini', requesterGate: 'assess',
    owners: { detect: 'karan', assess: 'nandini', impact: 'srija', execute: 'pavan', verify: 'vijay', close: 'karan' },
    approvals: [
      { id: 'security', approver: 'vijay', title: 'Security authorization', rule: 'A disruptive endpoint isolation needs the CISO.' },
      { id: 'executive', approver: 'vandana', title: 'Executive authorization', rule: 'Modelled exposure is €100,000 or more, so the CEO is added (dual control).' },
    ],
    notes: {
      detect: 'Synthetic EDR alert reviewed: encryption burst on FIN-WS-07 in Angers. I take ownership of NT-SEC-041 and hand the technical assessment to Cybersecurity.',
      assess: 'Indicators confirmed on FIN-WS-07 only; one privileged session active; no spread yet. Timeline and memory preserved. Proposed treatment: isolate FIN-WS-07 from the network and suspend its privileged sessions, keeping it powered on for forensics.',
      impact: 'Modelled maximum exposure €240,000: payroll delay, supplier penalties and recovery effort. Payroll runs in two days, so Finance switches to the offline backup file. Two hours of read-only shared drive is acceptable.',
      security: 'Security authorization for the scoped isolation of FIN-WS-07 and suspension of its privileged sessions only. The device stays powered on. Execution evidence and independent verification are required.',
      executive: 'Executive authorization: proceed with the scoped isolation. Exposure above €100,000 noted. No ransom payment. Keep payroll stakeholders informed.',
      execute: 'SIMULATION: FIN-WS-07 isolated through the EDR console, privileged session revoked, shared drive set to read-only. No real device, network or account was changed.',
      verify: 'Independent check: isolation confirmed (simulated EDR console), no new encryption events for 15 minutes, privileged session revoked, evidence package complete. I did not execute this action.',
      close: 'Closed after independent verification. Residual risk 6 (likelihood 2 × impact 3). Follow-ups: power off and re-image FIN-WS-07 (the device owner approves on the device), restore from snapshot, 14-day re-infection watch, Finance phishing simulation, lessons-learned session.',
    },
    executeConsent: 'I confirm this is a simulated isolation. No command is sent to any real device, network or account.',
    verification: ['Isolation status confirmed in the EDR console (simulated)', 'No new encryption events for 15 minutes', 'Privileged session revoked', 'Evidence package complete: timeline, memory capture, file hashes', 'The verifier did not execute the action'],
    plans: [
      { dept: 'cyber', name: 'Cybersecurity plan', owner: 'nandini', accountable: 'vijay', objective: 'Contain without losing evidence; prove nothing else is infected.', rollback: 'Release the isolation from the EDR console if the alert proves false.' },
      { dept: 'finance', name: 'Finance plan', owner: 'srija', accountable: 'srija', objective: 'Keep payroll and supplier payments safe and on time.', rollback: 'Return to the normal payment run once the shared drive is verified clean.' },
      { dept: 'it', name: 'IT Operations plan', owner: 'pavan', accountable: 'vijay', objective: 'Execute only the approved isolation, then restore cleanly.', rollback: 'Shared drive back to read-write after two hours if verification passes.' },
      { dept: 'exec', name: 'Executive plan', owner: 'vandana', accountable: 'vandana', objective: 'Authorise in scope; decide on communication.', rollback: 'Not applicable — decisions are recorded, not reversed.' },
      { dept: 'risk', name: 'Risk & PMO plan', owner: 'karan', accountable: 'karan', objective: 'Own the incident end to end and keep the record complete.', rollback: 'Reopen the incident if re-infection is detected within 14 days.' },
    ],
    tasks: [
      { id: 'r-own', dept: 'risk', title: 'Take ownership of NT-SEC-041 and route it to Cybersecurity', owner: 'karan', dueMin: 15, doneAt: 'detect', evidence: 'Acknowledgement in the ledger' },
      { id: 'r-preserve', dept: 'cyber', title: 'Preserve the EDR timeline and capture memory on FIN-WS-07', owner: 'nandini', dueMin: 30, doneAt: 'assess', evidence: 'Timeline export, memory image hash' },
      { id: 'r-hunt', dept: 'cyber', title: 'Hunt for the same indicators on the other 84 endpoints', owner: 'nandini', dueMin: 90, doneAt: 'verify', evidence: 'Hunt query results' },
      { id: 'r-freeze', dept: 'finance', title: 'Freeze payment batches prepared on FIN-WS-07', owner: 'srija', dueMin: 45, doneAt: 'impact', evidence: 'ERP batch status' },
      { id: 'r-payroll', dept: 'finance', title: 'Switch payroll to the offline backup file process', owner: 'lea', dueMin: 48 * 60, followUp: true, evidence: 'Payroll run confirmation' },
      { id: 'r-cost', dept: 'finance', title: 'Track the business-interruption cost daily', owner: 'srija', dueMin: 24 * 60, followUp: true, evidence: 'Cost log' },
      { id: 'r-auth', dept: 'exec', title: 'Decide on the scoped isolation', owner: 'vandana', dueMin: 60, doneAt: 'authorize', evidence: 'Executive authorization record' },
      { id: 'r-comms', dept: 'exec', title: 'Decide on staff, client and regulator communication', owner: 'vandana', dueMin: 24 * 60, followUp: true, evidence: 'Communication decision' },
      { id: 'r-isolate', dept: 'it', title: 'Isolate FIN-WS-07 and set the shared drive read-only', owner: 'pavan', dueMin: 75, doneAt: 'execute', evidence: 'Execution record (simulated)' },
      { id: 'r-restore', dept: 'it', title: 'Restore affected files from the 06:00 snapshot', owner: 'pavan', dueMin: 6 * 60, followUp: true, evidence: 'Restore log + integrity check' },
      { id: 'r-reimage', dept: 'it', title: 'Power off FIN-WS-07 for imaging, then re-image — the device owner approves on the device', owner: 'pavan', dueMin: 24 * 60, followUp: true, evidence: 'Owner approval on the device + build record' },
      { id: 'r-verify', dept: 'cyber', title: 'Verify containment independently', owner: 'vijay', dueMin: 120, doneAt: 'verify', evidence: 'Verification checklist' },
      { id: 'r-close', dept: 'risk', title: 'Close with residual risk and follow-up owners', owner: 'karan', dueMin: 180, doneAt: 'close', evidence: 'Closure record' },
      { id: 'r-kri', dept: 'risk', title: 'Update R2 / R8 scores and KRIs after the incident', owner: 'karan', dueMin: 48 * 60, followUp: true, evidence: 'Register change log' },
      ...COMMON_BACKLOG,
    ],
    raci: [
      { activity: 'Detect and take ownership', r: ['karan'], a: 'karan', c: ['nandini'], i: ['vijay'] },
      { activity: 'Technical investigation and proposal', r: ['nandini'], a: 'vijay', c: ['pavan'], i: ['karan'] },
      { activity: 'Financial impact', r: ['srija'], a: 'srija', c: ['karan'], i: ['vandana'] },
      { activity: 'Security authorization', r: ['vijay'], a: 'vijay', c: ['nandini'], i: ['karan'] },
      { activity: 'Executive authorization', r: ['vandana'], a: 'vandana', c: ['srija', 'vijay'], i: ['karan'] },
      { activity: 'Isolation (simulated execution)', r: ['pavan'], a: 'vijay', c: ['nandini'], i: ['karan'] },
      { activity: 'Independent verification', r: ['vijay'], a: 'vijay', c: ['pavan'], i: ['karan', 'vandana'] },
      { activity: 'Closure and residual risk', r: ['karan'], a: 'karan', c: ['vijay', 'srija'], i: ['vandana', 'nandini', 'pavan'] },
      { activity: 'Communication and regulators', r: ['karan', 'sophie'], a: 'vandana', c: ['vijay'], i: ['srija'] },
    ],
    regulatory: [
      { name: 'GDPR personal-data breach assessment', clock: '72 h from awareness', status: 'Possible — payroll files contain personal data. Compliance (Sophie Girard) assesses; the CEO decides.' },
      { name: 'NIS2 early warning', clock: '24 h · notification 72 h', status: 'Only if NOVATECH is in scope as a managed IT service provider and the incident is significant.' },
    ],
    kris: [
      { name: 'Endpoints with encryption alerts', unit: 'endpoints', value: 1, warning: 1, critical: 2, higherIsWorse: true },
      { name: 'Privileged sessions on finance hosts', unit: 'sessions', value: 2, warning: 2, critical: 4, higherIsWorse: true },
      { name: 'Hosts sharing the indicators', unit: 'hosts', value: 0, warning: 1, critical: 3, higherIsWorse: true },
    ],
    trajectory: [21, 24, 22, 29, 27, 34, 41, 39, 57, 61, 69, 87, 82, 91],
    atlas: { focus: 'angers', affected: ['angers'], watch: ['nantes', 'rennes', 'erp', 'bank'], threat: ['internet', 'angers'] },
    responseDeadlineMin: 60,
    lessons: ['Finance workstations need application allow-listing.', 'The shared drive needs immutable snapshots every hour, not every four.', 'Run the Finance phishing simulation that is six days overdue.'],
    macEligible: true,
  },
  {
    id: 'cloud', ref: 'NT-OPS-018', title: 'Cloud service disruption', family: 'Cloud & continuity', severity: 'High',
    summary: 'The EU client portal’s API error rate jumps to 7.4 % and p95 latency to 2.8 s. Sixty-one client accounts see failures. Recurring-revenue services and SLAs are at risk.',
    signal: 'Synthetic service monitor · API error rate +640 % in 10 minutes',
    assetId: 'API-GW-EU', assetName: 'Client portal & API gateway', site: 'EU cloud · primary region',
    businessImpact: 'Client SLAs and recurring revenue (70 % of turnover)',
    exposure: 110_000, likelihood: 3, impact: 4, residual: { likelihood: 2, impact: 3 },
    risks: ['R1', 'R4'],
    treatment: {
      kind: 'cloud_failover', name: 'Controlled failover of the client portal to the standby region', disruptive: true,
      scope: 'Client portal and API gateway only. Internal tools stay on the primary region. About 10 minutes of degraded service during the switch.',
      why: 'Restores service inside the 4-hour RTO while the provider repairs the primary region.',
      notChosen: [
        { option: 'Shut the services down', why: 'Turns a partial outage into a total one for 230 clients.' },
        { option: 'Wait for the provider', why: 'No provider ETA; SLA breaches for 61 clients become likely.' },
        { option: 'Roll back the last release', why: 'No release in 48 hours; the failures are on the provider side.' },
      ],
    },
    requester: 'nandini', requesterGate: 'assess',
    owners: { detect: 'karan', assess: 'nandini', impact: 'srija', execute: 'pavan', verify: 'vijay', close: 'karan' },
    approvals: [
      { id: 'security', approver: 'vijay', title: 'Security sign-off', rule: 'A failover must not hide an attack: the CISO confirms there is no malicious cause and that logs are preserved.' },
      { id: 'executive', approver: 'vandana', title: 'Executive authorization', rule: 'A client-facing change with exposure of €100,000 or more needs the CEO.' },
    ],
    notes: {
      detect: 'Synthetic availability alert reviewed: client API errors above the critical threshold for 10 minutes. I take ownership of NT-OPS-018 and ask Cybersecurity to rule out an attack.',
      assess: 'No malicious traffic pattern (no volumetric spike, normal source mix); provider status page reports a regional storage fault. Gateway logs preserved. Standby is in sync (RPO under 1 hour). Proposed treatment: controlled failover of the client portal to the standby region.',
      impact: 'Modelled maximum exposure €110,000: SLA service credits for 61 clients plus revenue at risk on recurring contracts. Failover keeps us inside the 4-hour RTO; cost of the standby uplift is about €2,000 per day.',
      security: 'Security sign-off: no indicator of attack; logs preserved and exported. Failover approved from a security standpoint, limited to the client portal and API gateway.',
      executive: 'Executive authorization: proceed with the controlled failover. Client communication goes out within 30 minutes; Julie Martin informs key accounts.',
      execute: 'SIMULATION: traffic for the client portal switched to the standby region; health checks green. No real infrastructure or DNS record was changed.',
      verify: 'Independent check: error rate back under 0.5 %, p95 latency 410 ms, data consistency confirmed against the last replication point, rollback plan documented. I did not execute this action.',
      close: 'Closed after independent verification. Residual risk 6. Follow-ups: fail back after the provider fix, provider review with Procurement, quarterly failover test.',
    },
    executeConsent: 'I confirm this is a simulated failover. No real infrastructure, DNS or client traffic is changed.',
    verification: ['API error rate back under 0.5 %', 'p95 latency under 500 ms', 'Data consistent with the last replication point', 'Rollback (fail-back) plan documented', 'The verifier did not execute the action'],
    plans: [
      { dept: 'it', name: 'IT Operations plan', owner: 'pavan', accountable: 'vijay', objective: 'Restore client service inside the RTO without data loss.', rollback: 'Fail back to the primary region once the provider confirms the fix.' },
      { dept: 'cyber', name: 'Cybersecurity plan', owner: 'nandini', accountable: 'vijay', objective: 'Make sure the outage is not an attack in disguise.', rollback: 'Reopen as a security incident if malicious indicators appear.' },
      { dept: 'finance', name: 'Finance plan', owner: 'srija', accountable: 'srija', objective: 'Quantify credits and revenue at risk; approve standby cost.', rollback: 'Stop standby uplift spending after fail-back.' },
      { dept: 'exec', name: 'Executive plan', owner: 'vandana', accountable: 'vandana', objective: 'Authorise the client-facing change and own client communication.', rollback: 'Not applicable — decisions are recorded, not reversed.' },
      { dept: 'risk', name: 'Risk & PMO plan', owner: 'karan', accountable: 'karan', objective: 'Coordinate, track SLA impact and the provider review.', rollback: 'Reopen if the error rate rises again within 24 hours.' },
    ],
    tasks: [
      { id: 'c-own', dept: 'risk', title: 'Take ownership of NT-OPS-018 and request an attack check', owner: 'karan', dueMin: 15, doneAt: 'detect', evidence: 'Acknowledgement in the ledger' },
      { id: 'c-attack', dept: 'cyber', title: 'Rule out a DDoS or malicious pattern; preserve gateway logs', owner: 'nandini', dueMin: 30, doneAt: 'assess', evidence: 'Traffic analysis + log export' },
      { id: 'c-standby', dept: 'it', title: 'Confirm the standby is in sync (RPO under 1 h)', owner: 'pavan', dueMin: 30, doneAt: 'assess', evidence: 'Replication status' },
      { id: 'c-credits', dept: 'finance', title: 'Estimate SLA credits and revenue at risk', owner: 'srija', dueMin: 45, doneAt: 'impact', evidence: 'Exposure worksheet' },
      { id: 'c-auth', dept: 'exec', title: 'Decide on the client-facing failover', owner: 'vandana', dueMin: 60, doneAt: 'authorize', evidence: 'Executive authorization record' },
      { id: 'c-clients', dept: 'exec', title: 'Send the client communication (key accounts first)', owner: 'julie', dueMin: 90, followUp: true, evidence: 'Status-page update + emails' },
      { id: 'c-failover', dept: 'it', title: 'Switch the client portal to the standby region', owner: 'pavan', dueMin: 75, doneAt: 'execute', evidence: 'Execution record (simulated)' },
      { id: 'c-verify', dept: 'cyber', title: 'Verify service health and data consistency independently', owner: 'vijay', dueMin: 120, doneAt: 'verify', evidence: 'Verification checklist' },
      { id: 'c-close', dept: 'risk', title: 'Close with residual risk and follow-up owners', owner: 'karan', dueMin: 180, doneAt: 'close', evidence: 'Closure record' },
      { id: 'c-failback', dept: 'it', title: 'Fail back to the primary region after the provider fix', owner: 'pavan', dueMin: 24 * 60, followUp: true, evidence: 'Change record' },
      { id: 'c-provider', dept: 'risk', title: 'Provider performance review with Procurement', owner: 'marc', dueMin: 7 * 1440, followUp: true, evidence: 'Review minutes' },
      { id: 'c-test', dept: 'it', title: 'Schedule a quarterly failover test', owner: 'pavan', dueMin: 30 * 1440, followUp: true, evidence: 'Test plan' },
      ...COMMON_BACKLOG,
    ],
    raci: [
      { activity: 'Detect and take ownership', r: ['karan'], a: 'karan', c: ['pavan'], i: ['vijay'] },
      { activity: 'Rule out an attack', r: ['nandini'], a: 'vijay', c: ['pavan'], i: ['karan'] },
      { activity: 'Financial impact', r: ['srija'], a: 'srija', c: ['julie'], i: ['vandana'] },
      { activity: 'Security sign-off', r: ['vijay'], a: 'vijay', c: ['nandini'], i: ['karan'] },
      { activity: 'Executive authorization', r: ['vandana'], a: 'vandana', c: ['srija', 'vijay'], i: ['karan'] },
      { activity: 'Failover (simulated execution)', r: ['pavan'], a: 'vijay', c: ['thomas'], i: ['karan', 'julie'] },
      { activity: 'Independent verification', r: ['vijay'], a: 'vijay', c: ['pavan'], i: ['karan'] },
      { activity: 'Closure and residual risk', r: ['karan'], a: 'karan', c: ['pavan', 'srija'], i: ['vandana', 'nandini'] },
      { activity: 'Client communication', r: ['julie'], a: 'vandana', c: ['karan'], i: ['srija'] },
    ],
    regulatory: [
      { name: 'Client SLA notices', clock: 'Contractual — within 1 h for key accounts', status: 'Applies: 61 client accounts affected.' },
      { name: 'NIS2 significant-incident test', clock: '24 h early warning if significant', status: 'Compliance assesses: availability incident at a managed IT service provider.' },
    ],
    kris: [
      { name: 'API error rate', unit: '%', value: 7.4, warning: 2, critical: 5, higherIsWorse: true },
      { name: 'p95 latency', unit: 's', value: 2.8, warning: 1, critical: 2, higherIsWorse: true },
      { name: 'Cloud availability (30 d)', unit: '%', value: 99.4, warning: 99.9, critical: 99.5, higherIsWorse: false },
    ],
    trajectory: [15, 18, 17, 23, 30, 29, 36, 38, 44, 63, 59, 77, 83, 81],
    atlas: { focus: 'cloud-paris', affected: ['cloud-paris'], watch: ['c-west', 'c-paris', 'c-lyon', 'c-brussels', 'c-munich'], threat: [], recovery: 'cloud-fra' },
    responseDeadlineMin: 240,
    lessons: ['Failover must be rehearsed quarterly, not discovered during an incident.', 'Client communication templates should be pre-approved.', 'Provider contract needs a regional-fault credit clause.'],
    macEligible: false,
  },
  {
    id: 'payments', ref: 'NT-FIN-027', title: 'Supplier payment fraud attempt', family: 'Finance & fraud', severity: 'High',
    summary: 'A “supplier” emails Accounts Payable asking to change bank details just before tomorrow’s batch. The mailbox has a new forwarding rule. €85,000 is about to leave for an unverified account.',
    signal: 'Synthetic payment rule · beneficiary IBAN changed less than 24 h before release',
    assetId: 'ERP-SAAS', assetName: 'Payables batch in the ERP', site: 'Finance · Angers',
    businessImpact: 'Direct fraud loss and supplier trust',
    exposure: 85_000, likelihood: 4, impact: 3, residual: { likelihood: 1, impact: 3 },
    risks: ['R7', 'R2'],
    treatment: {
      kind: 'payment_hold', name: 'Hold the €85,000 payment and verify the supplier by phone', disruptive: false,
      scope: 'One payment line is held for up to 48 hours. The other 40 lines of the batch are released normally.',
      why: 'The money cannot leave until the new bank details are confirmed on a phone number we already know.',
      notChosen: [
        { option: 'Pay as requested', why: 'Classic business email compromise; funds are rarely recovered.' },
        { option: 'Cancel the whole batch', why: 'Penalises 40 legitimate suppliers.' },
        { option: 'Shut the finance workstation down', why: 'Does nothing: the payment is already scheduled in the ERP.' },
      ],
    },
    requester: 'srija', requesterGate: 'impact',
    owners: { detect: 'karan', assess: 'nandini', impact: 'srija', execute: 'pavan', verify: 'vijay', close: 'karan' },
    approvals: [
      { id: 'executive', approver: 'vandana', title: 'Executive authorization', rule: 'Srija requested the hold, so she cannot approve it herself. The policy routes it to the next authority, the CEO. Below €100,000 one independent approver is enough.' },
    ],
    notes: {
      detect: 'Synthetic payment-rule alert reviewed: beneficiary bank details changed less than 24 hours before release. I take ownership of NT-FIN-027 and ask Cybersecurity to check the mailbox.',
      assess: 'Email from a look-alike domain; the Accounts Payable mailbox has a new forwarding rule created from an unusual sign-in. Indicators of business email compromise. Recommend holding the payment and resetting the mailbox credentials.',
      impact: 'Exposure €85,000 for this payment line. I request a hold on this line only and an out-of-band callback to the supplier on the number in our contract. The other 40 lines can be released.',
      security: '',
      executive: 'Executive authorization: hold the €85,000 line, release the rest of the batch. No release without a verified callback and dual control.',
      execute: 'SIMULATION: payment line flagged as held in the ERP, malicious forwarding rule removed, Accounts Payable credentials reset. No bank account or real transaction was affected.',
      verify: 'Independent check: hold active on the payment line, forwarding rule gone, sign-ins clean since the reset, callback evidence attached. I did not execute this action.',
      close: 'Closed after independent verification. Residual risk 3. Follow-ups: publish the callback procedure, phishing awareness for Accounts Payable, mailbox-rule alerting.',
    },
    executeConsent: 'I confirm this is a simulated payment hold and mailbox clean-up. No bank account, payment or mailbox is changed.',
    verification: ['Hold active on the €85,000 payment line', 'Malicious forwarding rule removed', 'No suspicious sign-ins since the reset', 'Supplier callback evidence attached', 'The verifier did not execute the action'],
    plans: [
      { dept: 'finance', name: 'Finance plan', owner: 'srija', accountable: 'srija', objective: 'No money leaves before the supplier is verified.', rollback: 'Release the line after a verified callback and dual approval.' },
      { dept: 'cyber', name: 'Cybersecurity plan', owner: 'nandini', accountable: 'vijay', objective: 'Find out how the mailbox was compromised and whether others are.', rollback: 'Not applicable — investigation only.' },
      { dept: 'it', name: 'IT Operations plan', owner: 'pavan', accountable: 'vijay', objective: 'Execute the approved hold and clean the mailbox.', rollback: 'Remove the hold flag after the authorised release.' },
      { dept: 'exec', name: 'Executive plan', owner: 'vandana', accountable: 'vandana', objective: 'Approve the hold independently of the requester.', rollback: 'Not applicable — decisions are recorded, not reversed.' },
      { dept: 'risk', name: 'Risk & PMO plan', owner: 'karan', accountable: 'karan', objective: 'Coordinate and turn the lesson into a control.', rollback: 'Reopen if the supplier confirms a second attempt.' },
    ],
    tasks: [
      { id: 'p-own', dept: 'risk', title: 'Take ownership of NT-FIN-027 and request a mailbox check', owner: 'karan', dueMin: 15, doneAt: 'detect', evidence: 'Acknowledgement in the ledger' },
      { id: 'p-headers', dept: 'cyber', title: 'Analyse the email headers and the forwarding rule', owner: 'nandini', dueMin: 30, doneAt: 'assess', evidence: 'Header analysis' },
      { id: 'p-mailboxes', dept: 'cyber', title: 'Check the other finance mailboxes for the same rule', owner: 'nandini', dueMin: 90, doneAt: 'verify', evidence: 'Mailbox audit query' },
      { id: 'p-request', dept: 'finance', title: 'Request a hold on the €85,000 line', owner: 'srija', dueMin: 45, doneAt: 'impact', evidence: 'Hold request record' },
      { id: 'p-callback', dept: 'finance', title: 'Call the supplier on the contract phone number', owner: 'lea', dueMin: 4 * 60, followUp: true, evidence: 'Callback note' },
      { id: 'p-auth', dept: 'exec', title: 'Decide on the payment hold', owner: 'vandana', dueMin: 60, doneAt: 'authorize', evidence: 'Executive authorization record' },
      { id: 'p-hold', dept: 'it', title: 'Flag the line as held; remove the rule; reset credentials', owner: 'pavan', dueMin: 75, doneAt: 'execute', evidence: 'Execution record (simulated)' },
      { id: 'p-verify', dept: 'cyber', title: 'Verify the hold and the mailbox clean-up independently', owner: 'vijay', dueMin: 120, doneAt: 'verify', evidence: 'Verification checklist' },
      { id: 'p-close', dept: 'risk', title: 'Close with residual risk and follow-up owners', owner: 'karan', dueMin: 180, doneAt: 'close', evidence: 'Closure record' },
      { id: 'p-alerting', dept: 'it', title: 'Alert on new mailbox forwarding rules', owner: 'pavan', dueMin: 3 * 1440, followUp: true, evidence: 'Alert rule' },
      { id: 'p-awareness', dept: 'risk', title: 'Awareness session for Accounts Payable', owner: 'camille', dueMin: 10 * 1440, followUp: true, evidence: 'Attendance list' },
      ...COMMON_BACKLOG,
    ],
    raci: [
      { activity: 'Detect and take ownership', r: ['karan'], a: 'karan', c: ['srija'], i: ['vijay'] },
      { activity: 'Mailbox investigation', r: ['nandini'], a: 'vijay', c: ['pavan'], i: ['karan', 'srija'] },
      { activity: 'Exposure and hold request', r: ['srija'], a: 'srija', c: ['lea'], i: ['vandana'] },
      { activity: 'Executive authorization of the hold', r: ['vandana'], a: 'vandana', c: ['karan'], i: ['srija'] },
      { activity: 'Hold and mailbox clean-up (simulated)', r: ['pavan'], a: 'vijay', c: ['lea'], i: ['srija'] },
      { activity: 'Independent verification', r: ['vijay'], a: 'vijay', c: ['nandini'], i: ['karan', 'srija'] },
      { activity: 'Supplier callback', r: ['lea'], a: 'srija', c: ['marc'], i: ['karan'] },
      { activity: 'Closure and residual risk', r: ['karan'], a: 'karan', c: ['srija', 'vijay'], i: ['vandana'] },
    ],
    regulatory: [
      { name: 'Bank fraud desk', clock: 'Same day', status: 'Pre-emptive alert so the beneficiary account can be flagged.' },
      { name: 'GDPR assessment', clock: '72 h from awareness', status: 'Only if the compromised mailbox exposed personal data — Compliance checks.' },
    ],
    kris: [
      { name: 'Bank-detail changes without callback (30 d)', unit: 'changes', value: 1, warning: 1, critical: 2, higherIsWorse: true },
      { name: 'Payments ≥ €50k awaiting dual control', unit: 'payments', value: 2, warning: 3, critical: 5, higherIsWorse: true },
      { name: 'New mailbox forwarding rules (24 h)', unit: 'rules', value: 1, warning: 1, critical: 3, higherIsWorse: true },
    ],
    trajectory: [12, 18, 15, 16, 25, 24, 32, 49, 43, 58, 62, 74, 88, 92],
    atlas: { focus: 'bank', affected: ['bank'], watch: ['angers', 'erp'], threat: ['internet', 'angers', 'bank'] },
    responseDeadlineMin: 18 * 60,
    lessons: ['Any bank-detail change needs a callback on a known number — no exceptions.', 'Mailbox forwarding rules should raise an alert.', 'Accounts Payable needs targeted awareness on look-alike domains.'],
    macEligible: false,
  },
];

export const scenarioById = (id: ScenarioId) => SCENARIOS.find(s => s.id === id)!;
export const isScenarioId = (v: unknown): v is ScenarioId => v === 'ransomware' || v === 'cloud' || v === 'payments';
