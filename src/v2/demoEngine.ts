export type Role = 'Risk Lead' | 'Cybersecurity' | 'Finance' | 'Director' | 'IT Operations' | 'Independent Reviewer';
export type StageKey = 'detect' | 'assess' | 'finance' | 'authorise' | 'contain' | 'verify' | 'close';
export type ScenarioId = 'ransomware' | 'cloud' | 'payments';

export type Stage = {
  key: StageKey;
  name: string;
  role: Role;
  person: string;
  heading: string;
  prompt: string;
  action: string;
};

export type Scenario = {
  id: ScenarioId;
  ref: string;
  name: string;
  family: string;
  summary: string;
  signal: string;
  asset: string;
  impact: string;
  exposure: number;
  likelihood: number;
  severity: number;
  proposedAction: string;
  tags: string[];
  suggestions: Record<StageKey, string>;
};

export type AuditEvent = {
  id: string;
  at: string;
  actor: string;
  role: Role | 'System';
  stage: StageKey | 'start';
  title: string;
  note: string;
  kind: 'signal' | 'action' | 'approval' | 'revision' | 'closure';
};

export type DemoRun = {
  version: 2;
  scenarioId: ScenarioId;
  status: 'ready' | 'active' | 'closed';
  step: number;
  startedAt: string | null;
  completedAt: string | null;
  revisions: number;
  events: AuditEvent[];
};

export const ROLES: { role: Role; person: string; initials: string; team: string }[] = [
  { role: 'Risk Lead', person: 'Karan Deshmukh', initials: 'KD', team: 'Risk & governance' },
  { role: 'Cybersecurity', person: 'Nadia', initials: 'NA', team: 'Security operations' },
  { role: 'Finance', person: 'Sarah', initials: 'SR', team: 'Financial risk' },
  { role: 'Director', person: 'Executive Director', initials: 'ED', team: 'Executive authority' },
  { role: 'IT Operations', person: 'IT Operations Lead', initials: 'IT', team: 'Infrastructure' },
  { role: 'Independent Reviewer', person: 'Independent Reviewer', initials: 'IR', team: 'Assurance' },
];

export const STAGES: Stage[] = [
  { key: 'detect', name: 'Detect', role: 'Risk Lead', person: 'Karan Deshmukh', heading: 'A signal becomes a decision.', prompt: 'Acknowledge the simulated detection signal and create an owned incident.', action: 'Acknowledge incident' },
  { key: 'assess', name: 'Assess', role: 'Cybersecurity', person: 'Nadia', heading: 'Establish technical reality.', prompt: 'Confirm the affected asset, assess the threat and document containment options.', action: 'Record cyber assessment' },
  { key: 'finance', name: 'Impact', role: 'Finance', person: 'Sarah', heading: 'Put a number on exposure.', prompt: 'Validate the business impact and recommend how financial exposure should be controlled.', action: 'Record financial impact' },
  { key: 'authorise', name: 'Authorise', role: 'Director', person: 'Executive Director', heading: 'Authority before disruption.', prompt: 'Review the independent assessments. Approve the proposed treatment or return it for revision.', action: 'Approve treatment' },
  { key: 'contain', name: 'Contain', role: 'IT Operations', person: 'IT Operations Lead', heading: 'Execute the approved playbook.', prompt: 'Demonstrate the approved containment. No real device, service or network is changed.', action: 'Simulate containment' },
  { key: 'verify', name: 'Verify', role: 'Independent Reviewer', person: 'Independent Reviewer', heading: 'Separate execution from proof.', prompt: 'Independently verify evidence before allowing closure.', action: 'Verify evidence' },
  { key: 'close', name: 'Close', role: 'Risk Lead', person: 'Karan Deshmukh', heading: 'Close the loop, preserve the record.', prompt: 'Record the outcome and residual risk, then close the rehearsal.', action: 'Close incident' },
];

export const SCENARIOS: Scenario[] = [
  {
    id: 'ransomware', ref: 'NT-SEC-041', name: 'Ransomware containment', family: 'Cybersecurity',
    summary: 'An unusual encryption pattern is detected on a privileged workstation. The business faces possible lateral movement into critical services.',
    signal: 'Endpoint telemetry · unusual encryption spike', asset: 'Finance workstation & shared drive',
    impact: 'Service interruption / data availability', exposure: 240000, likelihood: 4, severity: 4,
    proposedAction: 'Isolate the affected workstation and suspend privileged access after director approval.',
    tags: ['Endpoint', 'Privilege', 'Service continuity'],
    suggestions: {
      detect: 'Synthetic EDR alert reviewed. Unusual encryption behaviour identified on a privileged workstation; escalation to Cybersecurity requested.',
      assess: 'Nadia: Validate endpoint indicators, preserve relevant logs, check lateral movement and recommend isolation of the impacted workstation.',
      finance: 'Sarah: Estimated maximum business exposure €240,000. Prioritise continuity of payroll and payment operations; monitor interruption costs.',
      authorise: 'Authorize simulated isolation of the affected workstation only. Require execution evidence, independent verification and a recovery plan.',
      contain: 'Simulation: affected endpoint isolated from the network; privileged session revoked in the rehearsal only. No physical MacBook shutdown performed.',
      verify: 'Evidence reviewed independently. Rehearsal indicates containment complete, access isolated and recovery handoff documented.',
      close: 'Rehearsal closed following independent review. Residual risk remains monitored; update awareness and endpoint response controls.',
    },
  },
  {
    id: 'cloud', ref: 'NT-OPS-018', name: 'Cloud service disruption', family: 'Cloud & infrastructure',
    summary: 'Elevated API failures and an unusual increase in response times threaten client access to recurring services.',
    signal: 'Synthetic service monitor · API error rate +640%', asset: 'EU client portal & API gateway',
    impact: 'Client SLA / recurring revenue', exposure: 110000, likelihood: 3, severity: 4,
    proposedAction: 'Approve a controlled failover to the standby environment after validating recovery objectives.',
    tags: ['Cloud', 'SLA', 'Continuity'],
    suggestions: {
      detect: 'Synthetic availability alert acknowledged. Client-facing API errors exceed the agreed warning threshold.',
      assess: 'Nadia: Review platform logs and gateway health, confirm no malicious traffic pattern, and validate failover readiness.',
      finance: 'Sarah: Assess potential service credits and lost recurring revenue; estimated maximum exposure €110,000.',
      authorise: 'Authorize a simulated failover after validating RTO, RPO, rollback steps and customer communications.',
      contain: 'Simulation: traffic rerouted to the standby region in the rehearsal; no production infrastructure changed.',
      verify: 'Independent reviewer confirms simulated recovery checks, latency targets and rollback evidence.',
      close: 'Close the rehearsal with follow-up resilience tests and updated supplier dependency documentation.',
    },
  },
  {
    id: 'payments', ref: 'NT-FIN-027', name: 'Supplier payment anomaly', family: 'Finance & fraud',
    summary: 'A supplier requests an urgent bank account change just before payment execution, creating a possible business email compromise.',
    signal: 'Synthetic payment rule · beneficiary mismatch', asset: 'Accounts payable payment batch',
    impact: 'Fraud loss / supplier trust', exposure: 85000, likelihood: 4, severity: 3,
    proposedAction: 'Place the payment on hold, verify beneficiary details out-of-band, and record dual approval.',
    tags: ['Payments', 'Fraud', 'Dual control'],
    suggestions: {
      detect: 'Synthetic supplier payment anomaly acknowledged. Unverified change to beneficiary bank details flagged before release.',
      assess: 'Nadia: Check email authenticity, account compromise indicators and anomalous sign-in history.',
      finance: 'Sarah: Hold the €85,000 exposure pending independent beneficiary callback and payment control review.',
      authorise: 'Authorize simulated payment hold. No payment release without independent callback and dual approval.',
      contain: 'Simulation: payment flagged as held in the rehearsal only. No bank account or real transaction was affected.',
      verify: 'Independent reviewer verifies simulated hold, callback evidence and separation of duties.',
      close: 'Close the rehearsal and retain supplier verification and payment control actions for review.',
    },
  },
];

export const STORAGE_KEY = 'novatech-v2-demo-run';

export function blankRun(scenarioId: ScenarioId = 'ransomware'): DemoRun {
  return { version: 2, scenarioId, status: 'ready', step: 0, startedAt: null, completedAt: null, revisions: 0, events: [] };
}

function makeEvent(run: DemoRun, actor: string, role: Role | 'System', stage: StageKey | 'start', title: string, note: string, kind: AuditEvent['kind'], now: string): AuditEvent {
  return { id: `${Date.parse(now)}-${run.events.length + 1}`, at: now, actor, role, stage, title, note, kind };
}

export function startRun(run: DemoRun, now = new Date().toISOString()): DemoRun {
  if (run.status !== 'ready') return run;
  const scenario = SCENARIOS.find(s => s.id === run.scenarioId)!;
  const first = makeEvent(run, 'Synthetic monitoring feed', 'System', 'start', 'Signal received', scenario.signal, 'signal', now);
  return { ...run, status: 'active', startedAt: now, events: [first] };
}

export type TransitionResult = { run: DemoRun; error?: string };

export function advanceRun(run: DemoRun, role: Role, note: string, decision: 'approve' | 'revise' = 'approve', now = new Date().toISOString()): TransitionResult {
  if (run.status !== 'active') return { run, error: 'Start a rehearsal before recording an action.' };
  const stage = STAGES[run.step];
  if (!stage) return { run, error: 'This rehearsal is already finished.' };
  if (stage.role !== role) return { run, error: `This decision belongs to ${stage.role}. Switch to the correct simulated role.` };
  if (note.trim().length < 12) return { run, error: 'Add at least 12 characters of evidence or decision rationale.' };
  if (decision === 'revise' && stage.key !== 'authorise') return { run, error: 'Only the director may return a treatment for revision.' };
  const owner = ROLES.find(r => r.role === role)!.person;
  const revised = decision === 'revise';
  const title = revised ? 'Treatment returned for revision' : stage.key === 'authorise' ? 'Treatment approved' : `${stage.name} recorded`;
  const kind: AuditEvent['kind'] = revised ? 'revision' : stage.key === 'authorise' ? 'approval' : stage.key === 'close' ? 'closure' : 'action';
  const event = makeEvent(run, owner, role, stage.key, title, note.trim(), kind, now);
  const finished = stage.key === 'close' && !revised;
  return {
    run: {
      ...run,
      events: [...run.events, event],
      step: revised ? 1 : Math.min(run.step + 1, STAGES.length),
      status: finished ? 'closed' : 'active',
      completedAt: finished ? now : null,
      revisions: run.revisions + (revised ? 1 : 0),
    },
  };
}

export function loadDemo(): DemoRun {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved?.version === 2 && SCENARIOS.some(s => s.id === saved.scenarioId) && ['ready', 'active', 'closed'].includes(saved.status)
      && Number.isInteger(saved.step) && saved.step >= 0 && saved.step <= STAGES.length && Array.isArray(saved.events)) return saved as DemoRun;
  } catch { /* local storage unavailable: run an ephemeral rehearsal */ }
  return blankRun();
}

export function saveDemo(run: DemoRun) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(run)); } catch { /* retain session in memory */ }
}

export function money(amount: number) { return `€${new Intl.NumberFormat('en-IE', { maximumFractionDigits: 0 }).format(amount)}`; }
