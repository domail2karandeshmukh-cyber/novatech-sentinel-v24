/**
 * The structured case forms behind each gate: what a real responder records, not just a sentence.
 * Every value here is fictional NOVATECH case data (labelled SIMULATED in the UI); indicators use
 * documentation-only addresses (RFC 5737) and invented file names.
 * The playbook values are deterministic guidance for each scenario, not AI output.
 */
import type { GateKey, ScenarioId } from './scenarios.ts';
import { scenarioById } from './scenarios.ts';

export type FormGate = Exclude<GateKey, 'authorize'>;
export const SEVERITIES = ['Critical — P1', 'High — P2', 'Medium — P3', 'Low — P4'];

type Base = { id: string; label: string; hint?: string; /** shown in the ledger summary line */ key?: boolean; wide?: boolean };
export type Field =
  | (Base & { kind: 'select'; options: string[]; value: string })
  | (Base & { kind: 'segmented'; options: string[]; value: string })
  | (Base & { kind: 'text'; value: string; mono?: boolean })
  | (Base & { kind: 'money'; value: number })
  | (Base & { kind: 'checks'; options: string[]; value: string[]; /** every box must be ticked (a checklist) */ all?: boolean })
  | (Base & { kind: 'tags'; options: string[]; value: string[] })
  | (Base & { kind: 'readonly'; value: string; mono?: boolean });
export type FormValue = string | string[];
export type FormValues = Record<string, FormValue>;

export type ApprovalForm = { conditions: string[]; validity: string };
export const VALIDITY = ['2 hours', '4 hours', '24 hours'];

const sev = (value: string, label = 'Severity', key = true): Field => ({ id: 'severity', label, kind: 'select', options: SEVERITIES, value, key });

const FORMS: Record<ScenarioId, Record<FormGate, Field[]>> = {
  ransomware: {
    detect: [
      { id: 'source', label: 'Alert source', kind: 'select', options: ['EDR telemetry (synthetic feed)', 'SOC analyst escalation', 'User report', 'Service monitor', 'Payment rule'], value: 'EDR telemetry (synthetic feed)' },
      { id: 'triage', label: 'Triage verdict', kind: 'segmented', options: ['Confirmed — escalate', 'Suspected — investigate', 'False positive — close'], value: 'Confirmed — escalate', key: true },
      sev('Critical — P1', 'Initial severity'),
      { id: 'category', label: 'Incident category', kind: 'select', options: ['Ransomware / destructive malware', 'Malware (other)', 'Unauthorised access', 'Availability incident', 'Fraud / business email compromise', 'Personal-data breach'], value: 'Ransomware / destructive malware', key: true },
      { id: 'assets', label: 'Affected assets', kind: 'tags', options: ['FIN-WS-07 finance workstation', 'Finance share FS-01', 'Privileged account fin-adm-02', 'ERP (SaaS)'], value: ['FIN-WS-07 finance workstation', 'Finance share FS-01'], wide: true },
      { id: 'informed', label: 'Informed now', kind: 'checks', options: ['Victor Bonnet — CISO', 'Vanessa Mallet — CEO', 'Sophie Girard — Compliance (GDPR 72 h clock)'], value: ['Victor Bonnet — CISO', 'Sophie Girard — Compliance (GDPR 72 h clock)'], wide: true },
    ],
    assess: [
      sev('Critical — P1', 'Confirmed severity'),
      { id: 'confidence', label: 'Confidence', kind: 'segmented', options: ['High', 'Medium', 'Low'], value: 'High' },
      { id: 'spread', label: 'Spread', kind: 'segmented', options: ['One host only', 'Lateral movement', 'Several hosts'], value: 'One host only', key: true },
      { id: 'technique', label: 'Techniques observed (MITRE ATT&CK)', kind: 'tags', options: ['T1486 Data encrypted for impact', 'T1078 Valid accounts', 'T1490 Inhibit system recovery', 'T1021 Remote services'], value: ['T1486 Data encrypted for impact', 'T1078 Valid accounts'], wide: true },
      { id: 'iocs', label: 'Indicators (synthetic)', kind: 'text', mono: true, value: 'ext .nvx · note README_RESTORE.txt · proc svchst.exe · beacon 203.0.113.47:443', wide: true },
      { id: 'evidence', label: 'Evidence preserved before any action', kind: 'checks', all: true, options: ['EDR timeline exported', 'Memory image captured (SHA-256 recorded)', 'Ransom note and sample file hashed', 'Hunt query run on the other 84 endpoints'], value: ['EDR timeline exported', 'Memory image captured (SHA-256 recorded)', 'Ransom note and sample file hashed', 'Hunt query run on the other 84 endpoints'], wide: true },
      { id: 'treatment', label: 'Recommended treatment', kind: 'select', options: ['Isolate FIN-WS-07 and suspend its privileged sessions', 'Shut the workstation down now', 'Monitor and wait', 'Pay the ransom'], value: 'Isolate FIN-WS-07 and suspend its privileged sessions', key: true, wide: true },
    ],
    impact: [
      { id: 'low', label: 'Exposure — low', kind: 'money', value: 60_000 },
      { id: 'likely', label: 'Most likely', kind: 'money', value: 150_000, key: true },
      { id: 'high', label: 'Modelled maximum', kind: 'money', value: 240_000, key: true },
      { id: 'drivers', label: 'What the maximum is made of', kind: 'checks', all: true, options: ['Payroll delay penalties — €70,000', 'Supplier late-payment penalties — €45,000', 'Recovery effort and overtime — €65,000', 'Possible GDPR exposure — €60,000'], value: ['Payroll delay penalties — €70,000', 'Supplier late-payment penalties — €45,000', 'Recovery effort and overtime — €65,000', 'Possible GDPR exposure — €60,000'], wide: true },
      { id: 'delay', label: 'Cost of delay', kind: 'text', value: '≈ €8,000 per hour the finance share stays down' },
      { id: 'insurance', label: 'Cyber insurance', kind: 'select', options: ['Covered — €25,000 deductible, notify the insurer within 24 h', 'Not covered', 'To be confirmed with the broker'], value: 'Covered — €25,000 deductible, notify the insurer within 24 h' },
      { id: 'continuity', label: 'Payment continuity', kind: 'text', value: 'Payroll from the offline backup file (Léa Moreau) · supplier batch frozen', wide: true },
    ],
    execute: [
      { id: 'ticket', label: 'Change ticket', kind: 'readonly', mono: true, value: 'CHG-2026-0412 · emergency change', key: true },
      { id: 'steps', label: 'Execution steps — authorised scope only', kind: 'checks', all: true, options: ['EDR network containment applied to FIN-WS-07 (simulated)', 'Privileged session fin-adm-02 revoked (simulated)', 'Finance share FS-01 set to read-only for 2 hours (simulated)', 'SOC confirms FIN-WS-07 is unreachable on the network (simulated)'], value: ['EDR network containment applied to FIN-WS-07 (simulated)', 'Privileged session fin-adm-02 revoked (simulated)', 'Finance share FS-01 set to read-only for 2 hours (simulated)', 'SOC confirms FIN-WS-07 is unreachable on the network (simulated)'], wide: true },
      { id: 'device', label: 'Device state', kind: 'segmented', options: ['Powered on, isolated', 'Powered off'], value: 'Powered on, isolated', key: true, hint: 'Kept on so memory evidence survives. Power-off for re-imaging is a separate step after verification.' },
    ],
    verify: [
      { id: 'method', label: 'Verification method', kind: 'select', options: ['EDR console review + log correlation', 'Health checks', 'ERP review + mailbox audit + callback evidence'], value: 'EDR console review + log correlation', key: true },
      { id: 'result', label: 'Result', kind: 'segmented', options: ['Pass', 'Pass with observations', 'Fail — reopen'], value: 'Pass', key: true },
      { id: 'refs', label: 'Evidence references', kind: 'text', mono: true, value: 'EV-041-03 memory image · EV-041-04 EDR export · EV-041-05 hunt results', wide: true },
    ],
    close: [
      { id: 'residual', label: 'Residual risk', kind: 'readonly', value: 'Likelihood 2 × impact 3 = 6/16 · moderate', key: true },
      { id: 'decision', label: 'Risk decision', kind: 'segmented', options: ['Accept residual risk', 'Treat further', 'Transfer'], value: 'Accept residual risk', key: true },
      { id: 'register', label: 'Register updates', kind: 'tags', options: ['R8 unauthorised access to finance systems — rescored', 'R2 account compromise — reviewed', 'R1 cloud outage — unchanged'], value: ['R8 unauthorised access to finance systems — rescored', 'R2 account compromise — reviewed'], wide: true },
      { id: 'followups', label: 'Follow-ups handed over', kind: 'checks', all: true, options: ['Power off and re-image FIN-WS-07 — Pierre requests, the device owner approves on the device', 'Restore files from the 06:00 snapshot — Pierre Sauvage', '14-day re-infection watch — Nadia Vasseur', 'Finance phishing simulation (6 days overdue) — Nadia Vasseur'], value: ['Power off and re-image FIN-WS-07 — Pierre requests, the device owner approves on the device', 'Restore files from the 06:00 snapshot — Pierre Sauvage', '14-day re-infection watch — Nadia Vasseur', 'Finance phishing simulation (6 days overdue) — Nadia Vasseur'], wide: true },
      { id: 'lessons', label: 'Lessons-learned session', kind: 'text', value: 'Friday 14:00 · all six owners · report to the board pack' },
    ],
  },
  cloud: {
    detect: [
      { id: 'source', label: 'Alert source', kind: 'select', options: ['Service monitor (synthetic feed)', 'SOC analyst escalation', 'Client complaint', 'EDR telemetry', 'Payment rule'], value: 'Service monitor (synthetic feed)' },
      { id: 'triage', label: 'Triage verdict', kind: 'segmented', options: ['Confirmed — escalate', 'Suspected — investigate', 'False positive — close'], value: 'Confirmed — escalate', key: true },
      sev('High — P2', 'Initial severity'),
      { id: 'category', label: 'Incident category', kind: 'select', options: ['Availability incident', 'Possible denial of service', 'Malware (other)', 'Fraud / business email compromise'], value: 'Availability incident', key: true },
      { id: 'assets', label: 'Affected assets', kind: 'tags', options: ['API-GW-EU client portal', 'Primary EU region storage', 'Standby region', 'Internal tools'], value: ['API-GW-EU client portal', 'Primary EU region storage'], wide: true },
      { id: 'informed', label: 'Informed now', kind: 'checks', options: ['Victor Bonnet — CISO', 'Julie Martin — Service Delivery', 'Vanessa Mallet — CEO'], value: ['Victor Bonnet — CISO', 'Julie Martin — Service Delivery'], wide: true },
    ],
    assess: [
      sev('High — P2', 'Confirmed severity'),
      { id: 'confidence', label: 'Confidence', kind: 'segmented', options: ['High', 'Medium', 'Low'], value: 'High' },
      { id: 'spread', label: 'Scope', kind: 'segmented', options: ['One service', 'Several services', 'All services'], value: 'One service', key: true },
      { id: 'technique', label: 'Cause analysis', kind: 'tags', options: ['No attack pattern (no volumetric spike)', 'Normal source mix', 'Provider storage fault (status page)', 'Release regression'], value: ['No attack pattern (no volumetric spike)', 'Normal source mix', 'Provider storage fault (status page)'], wide: true },
      { id: 'iocs', label: 'Observations (synthetic)', kind: 'text', mono: true, value: 'errors 7.4 % · p95 2.8 s · provider incident EU-STOR-2291 · standby RPO < 1 h', wide: true },
      { id: 'evidence', label: 'Evidence preserved before any action', kind: 'checks', all: true, options: ['Gateway logs exported', 'Traffic analysis saved', 'Standby replication status checked'], value: ['Gateway logs exported', 'Traffic analysis saved', 'Standby replication status checked'], wide: true },
      { id: 'treatment', label: 'Recommended treatment', kind: 'select', options: ['Controlled failover of the client portal to the standby region', 'Shut the services down', 'Wait for the provider', 'Roll back the last release'], value: 'Controlled failover of the client portal to the standby region', key: true, wide: true },
    ],
    impact: [
      { id: 'low', label: 'Exposure — low', kind: 'money', value: 30_000 },
      { id: 'likely', label: 'Most likely', kind: 'money', value: 70_000, key: true },
      { id: 'high', label: 'Modelled maximum', kind: 'money', value: 110_000, key: true },
      { id: 'drivers', label: 'What the maximum is made of', kind: 'checks', all: true, options: ['SLA service credits, 61 clients — €62,000', 'Recurring revenue at risk — €38,000', 'Standby uplift and overtime — €10,000'], value: ['SLA service credits, 61 clients — €62,000', 'Recurring revenue at risk — €38,000', 'Standby uplift and overtime — €10,000'], wide: true },
      { id: 'delay', label: 'Cost of delay', kind: 'text', value: '≈ €4,500 per hour of outage' },
      { id: 'insurance', label: 'Recovery of costs', kind: 'select', options: ['Provider contract — regional-fault credit to claim', 'Cyber insurance — business interruption', 'Not recoverable'], value: 'Provider contract — regional-fault credit to claim' },
      { id: 'continuity', label: 'Client continuity', kind: 'text', value: 'Key accounts informed by Julie Martin within 1 h · inside the 4-hour RTO', wide: true },
    ],
    execute: [
      { id: 'ticket', label: 'Change ticket', kind: 'readonly', mono: true, value: 'CHG-2026-0418 · emergency change', key: true },
      { id: 'steps', label: 'Execution steps — authorised scope only', kind: 'checks', all: true, options: ['Client-portal traffic switched to the standby region (simulated)', 'Health checks green on the standby (simulated)', 'Status page updated for clients (simulated)'], value: ['Client-portal traffic switched to the standby region (simulated)', 'Health checks green on the standby (simulated)', 'Status page updated for clients (simulated)'], wide: true },
      { id: 'device', label: 'Primary region', kind: 'segmented', options: ['Kept as fail-back target', 'Decommissioned'], value: 'Kept as fail-back target', key: true },
    ],
    verify: [
      { id: 'method', label: 'Verification method', kind: 'select', options: ['Health checks + replication consistency', 'EDR console review + log correlation', 'ERP review + mailbox audit + callback evidence'], value: 'Health checks + replication consistency', key: true },
      { id: 'result', label: 'Result', kind: 'segmented', options: ['Pass', 'Pass with observations', 'Fail — reopen'], value: 'Pass', key: true },
      { id: 'refs', label: 'Evidence references', kind: 'text', mono: true, value: 'EV-018-02 health report · EV-018-03 replication check · EV-018-04 rollback plan', wide: true },
    ],
    close: [
      { id: 'residual', label: 'Residual risk', kind: 'readonly', value: 'Likelihood 2 × impact 3 = 6/16 · moderate', key: true },
      { id: 'decision', label: 'Risk decision', kind: 'segmented', options: ['Accept residual risk', 'Treat further', 'Transfer'], value: 'Accept residual risk', key: true },
      { id: 'register', label: 'Register updates', kind: 'tags', options: ['R1 cloud outage — rescored', 'R4 SLA capacity — rescored', 'R5 supplier failure — reviewed'], value: ['R1 cloud outage — rescored', 'R4 SLA capacity — rescored'], wide: true },
      { id: 'followups', label: 'Follow-ups handed over', kind: 'checks', all: true, options: ['Fail back after the provider fix — Pierre Sauvage', 'Provider review with Procurement — Marc Dubois', 'Quarterly failover test — Pierre Sauvage'], value: ['Fail back after the provider fix — Pierre Sauvage', 'Provider review with Procurement — Marc Dubois', 'Quarterly failover test — Pierre Sauvage'], wide: true },
      { id: 'lessons', label: 'Lessons-learned session', kind: 'text', value: 'Thursday 10:00 · IT, Delivery, Finance · report to the board pack' },
    ],
  },
  payments: {
    detect: [
      { id: 'source', label: 'Alert source', kind: 'select', options: ['Payment rule (synthetic feed)', 'Accounts Payable report', 'Bank fraud desk', 'SOC analyst escalation'], value: 'Payment rule (synthetic feed)' },
      { id: 'triage', label: 'Triage verdict', kind: 'segmented', options: ['Confirmed — escalate', 'Suspected — investigate', 'False positive — close'], value: 'Confirmed — escalate', key: true },
      sev('High — P2', 'Initial severity'),
      { id: 'category', label: 'Incident category', kind: 'select', options: ['Fraud / business email compromise', 'Unauthorised access', 'Malware (other)', 'Availability incident'], value: 'Fraud / business email compromise', key: true },
      { id: 'assets', label: 'Affected assets', kind: 'tags', options: ['ERP payables batch B-1027', 'Accounts Payable mailbox', 'Supplier master data'], value: ['ERP payables batch B-1027', 'Accounts Payable mailbox'], wide: true },
      { id: 'informed', label: 'Informed now', kind: 'checks', options: ['Sarah Perrin — CFO', 'Victor Bonnet — CISO', 'Bank fraud desk (same day)'], value: ['Sarah Perrin — CFO', 'Victor Bonnet — CISO'], wide: true },
    ],
    assess: [
      sev('High — P2', 'Confirmed severity'),
      { id: 'confidence', label: 'Confidence', kind: 'segmented', options: ['High', 'Medium', 'Low'], value: 'High' },
      { id: 'spread', label: 'Spread', kind: 'segmented', options: ['One mailbox', 'Several mailboxes', 'Unknown'], value: 'One mailbox', key: true },
      { id: 'technique', label: 'Techniques observed (MITRE ATT&CK)', kind: 'tags', options: ['T1566 Phishing (look-alike domain)', 'T1114.003 Email forwarding rule', 'T1078 Valid accounts'], value: ['T1566 Phishing (look-alike domain)', 'T1114.003 Email forwarding rule'], wide: true },
      { id: 'iocs', label: 'Indicators (synthetic)', kind: 'text', mono: true, value: 'sender novatech-suppIiers.example · rule "fwd-archive" to an external address · sign-in from 198.51.100.23', wide: true },
      { id: 'evidence', label: 'Evidence preserved before any action', kind: 'checks', all: true, options: ['Email headers analysed', 'Forwarding rule exported', 'Sign-in logs exported'], value: ['Email headers analysed', 'Forwarding rule exported', 'Sign-in logs exported'], wide: true },
      { id: 'treatment', label: 'Recommended treatment', kind: 'select', options: ['Hold the €85,000 payment and verify the supplier by phone', 'Pay as requested', 'Cancel the whole batch'], value: 'Hold the €85,000 payment and verify the supplier by phone', key: true, wide: true },
    ],
    impact: [
      { id: 'low', label: 'Exposure if held', kind: 'money', value: 0 },
      { id: 'likely', label: 'Most likely if paid', kind: 'money', value: 85_000 },
      { id: 'high', label: 'Modelled maximum', kind: 'money', value: 85_000, key: true },
      { id: 'drivers', label: 'What the maximum is made of', kind: 'checks', all: true, options: ['Direct loss: the €85,000 payment line', 'Recovery through the bank: rarely successful after 24 h'], value: ['Direct loss: the €85,000 payment line', 'Recovery through the bank: rarely successful after 24 h'], wide: true },
      { id: 'hold', label: 'Hold request', kind: 'segmented', options: ['Hold this line only', 'Hold the whole batch', 'Release'], value: 'Hold this line only', key: true, hint: 'You request the hold, so you cannot approve it — the policy routes it to the CEO.' },
      { id: 'delay', label: 'Cost of a 48-hour hold', kind: 'text', value: '≈ €200 late-payment fee · 40 other lines released today' },
      { id: 'continuity', label: 'Callback', kind: 'text', value: 'Léa Moreau calls the supplier on the number in the contract — never the one in the email', wide: true },
    ],
    execute: [
      { id: 'ticket', label: 'Change ticket', kind: 'readonly', mono: true, value: 'CHG-2026-0427 · standard change', key: true },
      { id: 'steps', label: 'Execution steps — authorised scope only', kind: 'checks', all: true, options: ['Payment line flagged as held in the ERP (simulated)', 'Malicious forwarding rule removed (simulated)', 'Accounts Payable credentials reset and MFA re-registered (simulated)'], value: ['Payment line flagged as held in the ERP (simulated)', 'Malicious forwarding rule removed (simulated)', 'Accounts Payable credentials reset and MFA re-registered (simulated)'], wide: true },
      { id: 'device', label: 'Rest of the batch', kind: 'segmented', options: ['Released today', 'Held'], value: 'Released today', key: true },
    ],
    verify: [
      { id: 'method', label: 'Verification method', kind: 'select', options: ['ERP review + mailbox audit + callback evidence', 'Health checks', 'EDR console review + log correlation'], value: 'ERP review + mailbox audit + callback evidence', key: true },
      { id: 'result', label: 'Result', kind: 'segmented', options: ['Pass', 'Pass with observations', 'Fail — reopen'], value: 'Pass', key: true },
      { id: 'refs', label: 'Evidence references', kind: 'text', mono: true, value: 'EV-027-02 ERP hold · EV-027-03 mailbox audit · EV-027-04 callback note', wide: true },
    ],
    close: [
      { id: 'residual', label: 'Residual risk', kind: 'readonly', value: 'Likelihood 1 × impact 3 = 3/16 · low', key: true },
      { id: 'decision', label: 'Risk decision', kind: 'segmented', options: ['Accept residual risk', 'Treat further', 'Transfer'], value: 'Accept residual risk', key: true },
      { id: 'register', label: 'Register updates', kind: 'tags', options: ['R7 supplier payment fraud — rescored', 'R2 account compromise — reviewed'], value: ['R7 supplier payment fraud — rescored', 'R2 account compromise — reviewed'], wide: true },
      { id: 'followups', label: 'Follow-ups handed over', kind: 'checks', all: true, options: ['Publish the callback procedure — Sarah Perrin', 'Alert on new mailbox forwarding rules — Pierre Sauvage', 'Awareness session for Accounts Payable — Camille Laurent'], value: ['Publish the callback procedure — Sarah Perrin', 'Alert on new mailbox forwarding rules — Pierre Sauvage', 'Awareness session for Accounts Payable — Camille Laurent'], wide: true },
      { id: 'lessons', label: 'Lessons-learned session', kind: 'text', value: 'Wednesday 16:00 · Finance and Cybersecurity · report to the board pack' },
    ],
  },
};

/** Conditions each approver attaches; execution must respect them. */
export const APPROVAL_FORMS: Record<ScenarioId, Partial<Record<'security' | 'executive', ApprovalForm>>> = {
  ransomware: {
    security: { conditions: ['Scope limited to FIN-WS-07 and its privileged session', 'Device stays powered on until the memory evidence is verified', 'Isolation reversible from the EDR console', 'Independent verification before closure'], validity: '2 hours' },
    executive: { conditions: ['No ransom payment, under any circumstances', 'Payroll stakeholders informed today', 'GDPR assessment by Compliance within 72 hours', 'Board briefed at closure'], validity: '2 hours' },
  },
  cloud: {
    security: { conditions: ['No indicator of attack before switching', 'Gateway logs preserved and exported', 'Internal tools stay on the primary region'], validity: '4 hours' },
    executive: { conditions: ['Client communication within 30 minutes', 'Fail-back only after the provider confirms the fix', 'Standby cost capped at €2,000 per day'], validity: '4 hours' },
  },
  payments: {
    executive: { conditions: ['Release only after a verified callback on the contract number', 'Dual control on any later release', 'The other 40 lines of the batch go out today'], validity: '24 hours' },
  },
};

/** The fields of a gate. Verification starts with the scenario's own checklist (every item required). */
export function formFor(scenarioId: ScenarioId, gate: FormGate): Field[] {
  if (gate !== 'verify') return FORMS[scenarioId][gate];
  const list = scenarioById(scenarioId).verification;
  return [{ id: 'checklist', label: 'Verification checklist', kind: 'checks', all: true, options: list, value: [...list], wide: true }, ...FORMS[scenarioId][gate]];
}
export const approvalFormFor = (scenarioId: ScenarioId, step: 'security' | 'executive'): ApprovalForm =>
  APPROVAL_FORMS[scenarioId][step] ?? { conditions: ['Scope limited to the approved treatment', 'Independent verification before closure'], validity: '2 hours' };

export function playbookValues(fields: Field[]): FormValues {
  const v: FormValues = {};
  for (const f of fields) v[f.id] = f.kind === 'money' ? String(f.value) : Array.isArray(f.value) ? [...f.value] : f.value;
  return v;
}

/** A blank form: choices must be made (readonly fields keep their value). */
export function blankValues(fields: Field[]): FormValues {
  const v: FormValues = {};
  for (const f of fields) v[f.id] = f.kind === 'readonly' ? f.value : f.kind === 'checks' || f.kind === 'tags' ? [] : '';
  return v;
}

export const money = (n: number) => `€${new Intl.NumberFormat('en-IE', { maximumFractionDigits: 0 }).format(n)}`;

/** Labels of the fields still missing. */
export function missingFields(fields: Field[], values: FormValues): string[] {
  return fields.filter(f => {
    const v = values[f.id];
    if (f.kind === 'readonly') return false;
    if (f.kind === 'checks') return f.all ? !f.options.every(o => (v as string[] | undefined)?.includes(o)) : false;
    if (f.kind === 'tags') return !(Array.isArray(v) && v.length);
    if (f.kind === 'money') return !(typeof v === 'string' && /^\d+$/.test(v));
    return !(typeof v === 'string' && v.trim());
  }).map(f => f.label);
}

function display(f: Field, v: FormValue | undefined): string {
  if (f.kind === 'money') return typeof v === 'string' && /^\d+$/.test(v) ? money(Number(v)) : '—';
  if (Array.isArray(v)) return v.join('; ');
  return (v ?? '').trim();
}

/** Every field as label → value, as written to the ledger (and covered by its hash). */
export function detailOf(fields: Field[], values: FormValues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) { const d = display(f, values[f.id]); if (d) out[f.label] = d.slice(0, 400); }
  return out;
}

/** The key facts as one line for the ledger list. */
export function summaryOf(fields: Field[], values: FormValues): string {
  return keyFacts(fields, values).join(' · ');
}

/** Key facts of a form; amounts carry their label ("Modelled maximum €240,000"). */
export function keyFacts(fields: Field[], values: FormValues): string[] {
  return fields.filter(f => f.key).map(f => { const d = display(f, values[f.id]); return d && f.kind === 'money' ? `${f.label} ${d}` : d; }).filter(Boolean);
}

/** Key facts read back from a sealed record (label → value). */
export function keyFactsOfRecord(fields: Field[], recorded: Record<string, string> | undefined): string[] {
  if (!recorded) return [];
  return fields.filter(f => f.key).map(f => { const d = recorded[f.label]; return d && f.kind === 'money' ? `${f.label} ${d}` : d; }).filter((x): x is string => !!x);
}

export const composeNote = (summary: string, rationale: string) => (summary ? `${summary}. ${rationale.trim()}` : rationale.trim());

/** What "Do it for me" and fast-forward record: the playbook form, exactly as a person filling it would. */
export function playbookRecord(scenarioId: ScenarioId, gate: FormGate, rationale: string): { note: string; fields: Record<string, string> } {
  const fields = formFor(scenarioId, gate);
  const values = playbookValues(fields);
  return { note: composeNote(summaryOf(fields, values), rationale), fields: detailOf(fields, values) };
}

export function approvalRecord(scenarioId: ScenarioId, step: 'security' | 'executive', decision: 'approve' | 'return', rationale: string, form: ApprovalForm = approvalFormFor(scenarioId, step)): { note: string; fields: Record<string, string> } {
  if (decision === 'return') return { note: rationale.trim(), fields: { Decision: 'Returned for revision' } };
  return {
    note: `Approved with ${form.conditions.length} condition${form.conditions.length === 1 ? '' : 's'}, valid ${form.validity}. ${rationale.trim()}`,
    fields: { Decision: 'Approved with conditions', Conditions: form.conditions.join('; '), Validity: form.validity },
  };
}
