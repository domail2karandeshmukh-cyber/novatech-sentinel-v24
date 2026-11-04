/**
 * The writer RPCs of the NOVATECH backend, simulated in memory. Each one mirrors its plpgsql
 * definition: the same permission checks (role permissions, delegations), separation of duties
 * (via check_op), policy routing (approval rules: €100,000 dual control adds the CEO step), the same
 * notifications and the same hash-chained ledger entries (marked `simulated: true`).
 */
import type { Action, Approval, Employee, Incident, JsonObject, Json, Raci, Risk } from './types.ts';
import type { Tx } from './store.ts';
import {
  NOT_IN_DEMO, authError, chainState, dbError, raiseText, denied, employee, insertNotification, invalid, log, me, myEmployees, notFound, notify, notifyRole, nowTs,
} from './store.ts';
import {
  CLOSED, actionType, assertOp, authorityVia, classifyKri, controlLastTest, empName, evaluateCriteria, hasPerm, holders, kriState, matchingRules, numText,
  regJson, roleHolders, roleName, s, ts,
} from './model.ts';
import { field, hasKey, jsonText, nullif, toBool, toDate, toInt, toNumeric, toTimestamp, toUuid, trimEmpty } from './cast.ts';
import { addMonths, addMonthsMicros, collate, compactTimestamp, groupThousands, parisDayMonthTime, pgRound, pgSort, pgTs, sortRows, tsMicros } from './pg.ts';

const HOUR_US = 3600 * 1000000;

// ---------------------------------------------------------------- shared helpers
function requirePerm(tx: Tx, e: Employee, perm: string, what: string): void {
  if (!hasPerm(tx, e.id, perm)) denied(`${what} requires permission "${perm}". Your role (${raiseText(roleName(tx, e.role_id))}) does not hold it.`);
}
function lockAction(tx: Tx, id: string | null): Action {
  const a = id ? tx.db.actions.find(x => x.id === id) : undefined;
  if (!a) notFound(`action ${raiseText(id)} does not exist`);
  return a as Action;
}
const touch = (tx: Tx, a: Action, bump = true) => { a.updated_at = nowTs(tx); if (bump) a.version += 1; };
const actionLog = (a: Action) => ({ entityType: 'action', entityId: a.id, entityRef: a.ref, risk: a.risk_id, incident: a.incident_id, asset: a.asset_id, run: a.scenario_run_id });
const notifyAction = (tx: Tx, a: Action, recipient: string | null, kind: string, title: string | null, body: string | null) =>
  notify(tx, a.org_id, recipient, kind, title, body, 'action', a.id);
/** to_char(n, 'FM999G999G999') */
function fmtAmount(n: number): string {
  const r = pgRound(n);
  if (Math.abs(r) > 999999999) return '###,###,###';
  return (r < 0 ? '-' : '') + groupThousands(Math.abs(r));
}
function insertRaci(tx: Tx, org: string, entityType: string, entityId: string, employeeId: string, raci: string): void {
  if (!['risk', 'action'].includes(entityType)) dbError('new row for relation "raci" violates check constraint "raci_entity_type_check"');
  if (tx.db.raci.some(r => r.entity_type === entityType && r.entity_id === entityId && r.employee_id === employeeId && r.raci === raci)) return;
  const row: Raci = { id: tx.db.counters.raci++, org_id: org, entity_type: entityType, entity_id: entityId, employee_id: employeeId, raci };
  tx.db.raci.push(row);
}
function insertEvidence(tx: Tx, x: { action?: string | null; incident?: string | null; kind: string; summary: string; data?: JsonObject; label?: string | null; by: string | null }) {
  tx.db.evidence.push({
    id: tx.uuid(), action_id: x.action ?? null, incident_id: x.incident ?? null, kind: x.kind, summary: x.summary, data: x.data ?? {},
    execution_label: x.label ?? null, submitted_by: x.by, created_at: nowTs(tx),
  });
}
const fkEmployee = (tx: Tx, id: string | null, table: string, column: string) => {
  if (id !== null && !employee(tx, id)) dbError(`insert or update on table "${table}" violates foreign key constraint "${table}_${column}_fkey"`);
};
const nextRef = (tx: Tx, prefix: string) => `${prefix}-${tx.db.counters.ref_seq++}`;
const display = (tx: Tx, micros: number) => micros + tx.offsetMs * 1000;

/** grc.notify_executors */
function notifyExecutors(tx: Tx, a: Action, title: string | null, body: string | null): void {
  if (a.executor_id !== null) { notifyAction(tx, a, a.executor_id, 'execution_ready', title, body); return; }
  const t = actionType(tx, a.org_id, a.action_type);
  if (!t || t.executor_role_ids.length === 0) { notifyAction(tx, a, a.responsible_id, 'execution_ready', title, body); return; }
  for (const r of t.executor_role_ids) notifyRole(tx, a.org_id, r, 'execution_ready', title, body, 'action', a.id);
}

/** grc.route_approvals: supersedes open approvals and routes the action through the matching policy rules. */
function routeApprovals(tx: Tx, id: string, actor: string): string {
  const a = lockAction(tx, id);
  const before = a.status;
  const crit = a.asset_id ? tx.db.assets.find(x => x.id === a.asset_id)?.criticality ?? null : null;
  const amount = a.amount ?? a.budget;
  for (const x of tx.db.approvals) if (x.action_id === a.id && ['waiting', 'pending', 'info_requested', 'escalated'].includes(x.status)) x.status = 'superseded';
  const rules = matchingRules(tx, a.org_id, a.action_type, a.severity, crit, amount);
  const steps: Json[] = [];
  rules.forEach((r, k) => {
    const n = k + 1;
    tx.db.approvals.push({
      id: tx.uuid(), action_id: a.id, step: n, kind: 'pre', approver_role_id: r.approver_role_id, rule_id: r.id, rationale: r.rationale,
      status: n === 1 ? 'pending' : 'waiting', decided_by: null, on_behalf_of: null, comment: null, created_at: nowTs(tx), decided_at: null,
    });
    steps.push({ step: n, role: roleName(tx, r.approver_role_id), rule_id: r.id, rationale: r.rationale });
  });
  if (rules.length === 0) {
    a.status = 'approved'; touch(tx, a);
    log(tx, { org: a.org_id, actor, stage: 'authorise', event: 'auto_authorised',
      summary: `${a.ref} authorised by policy: no approval required for "${a.action_type}" at severity ${a.severity}`,
      ...actionLog(a), prev: before, next: 'approved', outcome: 'policy', details: { matched_rules: 0, amount } });
    notifyExecutors(tx, a, a.ref + ' ready for execution', a.title + ' — authorised by policy (no approval required).');
    return 'approved';
  }
  a.status = 'awaiting_approval'; touch(tx, a);
  const first = rules[0].approver_role_id;
  log(tx, { org: a.org_id, actor, stage: 'authorise', event: 'approval_requested',
    summary: `${a.ref} routed to ${rules.length} approval step(s); first approver: ${s(roleName(tx, first))}`,
    ...actionLog(a), prev: before, next: 'awaiting_approval', details: { steps, severity: a.severity, asset_criticality: crit, amount } });
  notifyRole(tx, a.org_id, first, 'approval_requested', 'Approval required: ' + a.ref, a.title + (amount === null ? '' : ' · €' + fmtAmount(amount)), 'action', a.id);
  return 'awaiting_approval';
}

// ---------------------------------------------------------------- actions
export function proposeAction(tx: Tx, org: string, p: JsonObject): string {
  const m = me(tx, org);
  requirePerm(tx, m, 'action.propose', 'Proposing an action');
  const t = actionType(tx, org, field(p, 'action_type') ?? '');
  if (!t) invalid(`unknown action type ${raiseText(field(p, 'action_type'))}`);
  const type = t as NonNullable<typeof t>;
  if (trimEmpty(field(p, 'title'))) invalid('a title is required');
  let inc: Incident | undefined;
  const incId = nullif(field(p, 'incident_id'));
  if (incId !== null) {
    const iid = toUuid(incId);
    inc = tx.db.incidents.find(i => i.id === iid && i.org_id === org);
    if (!inc) invalid('incident not found in this organisation');
    if ((inc as Incident).archived) denied('the incident belongs to a reset scenario run');
  }
  const riskId = nullif(field(p, 'risk_id')) ?? inc?.risk_id ?? null;
  const risk = riskId ? tx.db.risks.find(r => r.id === riskId && r.org_id === org) : undefined;
  const assetId = nullif(field(p, 'asset_id')) ?? inc?.asset_id ?? null;
  let acc = toUuid(nullif(field(p, 'accountable_id'))) ?? risk?.owner_id ?? null;
  if (acc === null && assetId !== null) {
    const asset = tx.db.assets.find(x => x.id === assetId);
    const owners = asset ? tx.db.employees.filter(e => e.role_id === asset.owner_role_id && e.active) : [];
    acc = sortRows(owners, [e => e.is_student, 'desc'])[0]?.id ?? null;
  }
  const exec = toUuid(nullif(field(p, 'executor_id')));
  const resp = toUuid(nullif(field(p, 'responsible_id'))) ?? exec ?? m.id;
  if (acc === null) invalid('an accountable owner is required (link a risk with an owner or choose one).');
  if (exec !== null && !tx.db.employees.some(e => e.id === exec && e.org_id === org && e.active && (type.executor_role_ids.length === 0 || type.executor_role_ids.includes(e.role_id)))) {
    denied(`the selected executor does not hold a role authorised to execute "${type.name}".`);
  }
  if (assetId !== null && !tx.db.assets.some(x => x.id === assetId)) dbError('insert or update on table "actions" violates foreign key constraint "actions_asset_id_fkey"');
  fkEmployee(tx, resp, 'actions', 'responsible_id'); fkEmployee(tx, acc, 'actions', 'accountable_id');
  const severity = toInt(field(p, 'severity')) ?? inc?.severity ?? 2;
  const priority = field(p, 'priority') ?? 'P2';
  const mode = field(p, 'execution_mode') ?? 'simulated';
  if (severity < 1 || severity > 4) dbError('new row for relation "actions" violates check constraint "actions_severity_check"');
  if (!['P1', 'P2', 'P3', 'P4'].includes(priority)) dbError('new row for relation "actions" violates check constraint "actions_priority_check"');
  if (!['simulated', 'device'].includes(mode)) dbError('new row for relation "actions" violates check constraint "actions_execution_mode_check"');
  const deadline = toTimestamp(nullif(field(p, 'deadline')));
  const ref = nextRef(tx, 'ACT');
  const now = nowTs(tx);
  const a: Action = {
    id: tx.uuid(), org_id: org, ref, action_type: type.code, title: field(p, 'title') as string, proposed_action: field(p, 'proposed_action'),
    justification: field(p, 'justification'), business_impact: field(p, 'business_impact'), business_process: field(p, 'business_process'),
    treatment_strategy: field(p, 'treatment_strategy') ?? 'Reduce', priority, severity, amount: toNumeric(nullif(field(p, 'amount'))),
    risk_id: risk?.id ?? null, incident_id: inc?.id ?? null, asset_id: assetId, status: 'draft', emergency: false, emergency_reason: null,
    requested_by: m.id, responsible_id: resp, accountable_id: acc, executor_id: exec, assessed_by: null, assessment: null, info_request: null,
    blocked_reason: null, budget: toNumeric(nullif(field(p, 'budget'))), resources: field(p, 'resources'), start_date: toDate(nullif(field(p, 'start_date'))),
    deadline: deadline !== null ? pgTs(deadline) : pgTs(tx.now + 48 * HOUR_US), depends_on: [], progress: 0, execution_mode: mode, scheduled_for: null,
    criteria: (Array.isArray(p.criteria) ? p.criteria : type.default_criteria) as Action['criteria'], residual_likelihood: null, residual_impact: null,
    scenario_run_id: inc?.scenario_run_id ?? null, archived: false, version: 1, created_at: now, updated_at: now, completed_at: null,
  };
  tx.db.actions.push(a);
  insertRaci(tx, org, 'action', a.id, resp, 'R');
  insertRaci(tx, org, 'action', a.id, acc as string, 'A');
  for (const r of type.consulted_role_ids) for (const e of roleHolders(tx, org, r)) insertRaci(tx, org, 'action', a.id, e.id, 'C');
  for (const e of holders(tx, org, 'governance.oversight')) insertRaci(tx, org, 'action', a.id, e.id, 'I');
  log(tx, { org, actor: m.id, stage: 'assess', event: 'action_proposed', summary: `${ref} proposed: ${s(field(p, 'title'))}`,
    ...actionLog(a), next: 'draft', details: { action_type: type.code, amount: field(p, 'amount') } });
  return a.id;
}

export function submitAction(tx: Tx, id: string): string {
  const a = lockAction(tx, id);
  const m = me(tx, a.org_id);
  assertOp(tx, a, m.id, 'submit');
  const t = actionType(tx, a.org_id, a.action_type);
  if (a.accountable_id === null) invalid('an accountable owner must be assigned before submission');
  log(tx, { org: a.org_id, actor: m.id, stage: 'assess', event: 'action_submitted', summary: a.ref + ' submitted for review', ...actionLog(a), prev: a.status, next: 'submitted' });
  if (t?.assessor_role_id && authorityVia(tx, a.requested_by, t.assessor_role_id) === null) {
    a.status = 'under_review'; a.info_request = null; a.blocked_reason = null; touch(tx, a);
    notifyRole(tx, a.org_id, t.assessor_role_id, 'assessment_requested', 'Assessment required: ' + a.ref, a.title, 'action', a.id);
    return 'under_review';
  }
  a.blocked_reason = null;
  if (t?.assessor_role_id) { a.assessed_by = a.requested_by; a.assessment = a.assessment ?? 'Requester holds the assessor role for this action type.'; }
  return routeApprovals(tx, a.id, m.id);
}

export function assessAction(tx: Tx, id: string, assessment: string | null, recommend: boolean | null, severity: number | null): string {
  const a = lockAction(tx, id);
  const m = me(tx, a.org_id);
  assertOp(tx, a, m.id, 'assess');
  if (trimEmpty(assessment)) invalid('assessment text is required');
  if (severity !== null && (severity < 1 || severity > 4)) invalid('severity must be 1–4');
  const sev = severity ?? a.severity;
  a.assessed_by = m.id; a.assessment = assessment; a.severity = sev; touch(tx, a, false);
  insertEvidence(tx, { action: a.id, kind: 'assessment', summary: assessment as string, data: { recommend, severity: sev }, by: m.id });
  if (recommend === false) {
    a.status = 'rejected'; touch(tx, a);
    log(tx, { org: a.org_id, actor: m.id, stage: 'assess', event: 'assessment_not_recommended', summary: a.ref + ' not recommended by assessor',
      ...actionLog(a), prev: 'under_review', next: 'rejected', outcome: 'rejected', details: { assessment } });
    notifyAction(tx, a, a.requested_by, 'rejected', a.ref + ' not recommended', assessment);
    return 'rejected';
  }
  log(tx, { org: a.org_id, actor: m.id, stage: 'assess', event: 'action_assessed', summary: `${a.ref} assessed and recommended (severity ${sev})`,
    ...actionLog(a), prev: 'under_review', next: 'under_review', outcome: 'recommended', details: { assessment } });
  return routeApprovals(tx, a.id, m.id);
}

export function decide(tx: Tx, id: string, decision: string | null, comment: string | null): string {
  if (!['approve', 'reject', 'request_info', 'escalate'].includes(decision ?? '')) invalid(`unknown decision ${raiseText(decision)}`);
  const a = lockAction(tx, id);
  const m = me(tx, a.org_id);
  assertOp(tx, a, m.id, decision as string);
  if (decision !== 'approve' && trimEmpty(comment)) invalid('a justification is required for this decision');
  const ap = sortRows(tx.db.approvals.filter(x => x.action_id === a.id && x.status === 'pending'
    && ((x.kind === 'pre' && ['awaiting_approval', 'escalated'].includes(a.status)) || x.kind === 'post_review')), [x => x.kind === 'pre', 'desc'], [x => x.step])[0] as Approval;
  const via = authorityVia(tx, m.id, ap.approver_role_id);
  const before = a.status;
  const apRole = roleName(tx, ap.approver_role_id);

  if (decision === 'approve') {
    ap.status = 'approved'; ap.decided_by = m.id; ap.on_behalf_of = via === m.id ? null : via; ap.comment = comment; ap.decided_at = nowTs(tx);
    const onBehalf = via !== null && via !== m.id ? ` on behalf of ${s(empName(tx, via))} (delegation)` : '';
    log(tx, { org: a.org_id, actor: m.id, stage: 'authorise', event: ap.kind === 'post_review' ? 'post_emergency_review_approved' : 'approval_granted',
      summary: `${a.ref} approved by ${m.full_name}${onBehalf} (step ${ap.step}: ${s(apRole)})`, ...actionLog(a), prev: before, outcome: 'approved',
      details: { comment, rule_id: ap.rule_id, kind: ap.kind } });
    if (ap.kind === 'post_review') return before;
    const nxt = sortRows(tx.db.approvals.filter(x => x.action_id === a.id && x.kind === 'pre' && x.status === 'waiting'), [x => x.step])[0];
    if (nxt) {
      nxt.status = 'pending';
      a.status = 'awaiting_approval'; touch(tx, a);
      notifyRole(tx, a.org_id, nxt.approver_role_id, 'approval_requested', 'Approval required: ' + a.ref,
        `${a.title} · step ${nxt.step} — previous step approved by ${m.full_name}`, 'action', a.id);
      return 'awaiting_approval';
    }
    a.status = 'approved'; touch(tx, a);
    log(tx, { org: a.org_id, actor: m.id, stage: 'authorise', event: 'action_authorised', summary: a.ref + ' fully authorised — all required approvals granted',
      ...actionLog(a), prev: before, next: 'approved', outcome: 'authorised' });
    notifyExecutors(tx, a, a.ref + ' approved — ready for execution', a.title);
    notifyAction(tx, a, a.requested_by, 'approved', a.ref + ' approved', a.title);
    return 'approved';
  }
  if (decision === 'reject') {
    ap.status = 'rejected'; ap.decided_by = m.id; ap.on_behalf_of = via === m.id ? null : via; ap.comment = comment; ap.decided_at = nowTs(tx);
    let status: string;
    if (ap.kind === 'post_review') {
      a.status = 'reopened'; a.blocked_reason = 'Post-emergency review rejected: ' + comment; touch(tx, a); status = 'reopened';
    } else {
      for (const x of tx.db.approvals) if (x.action_id === a.id && x.status === 'waiting') x.status = 'superseded';
      a.status = 'rejected'; touch(tx, a); status = 'rejected';
    }
    log(tx, { org: a.org_id, actor: m.id, stage: 'authorise', event: ap.kind === 'post_review' ? 'post_emergency_review_rejected' : 'approval_rejected',
      summary: `${a.ref} rejected by ${m.full_name} (${s(apRole)}): ${s(comment)}`, ...actionLog(a), prev: before, next: status, outcome: 'rejected', details: { comment } });
    notifyAction(tx, a, a.requested_by, 'rejected', apRole === null ? null : `${a.ref} rejected by ${apRole}`, comment);
    if (a.accountable_id !== a.requested_by) notifyAction(tx, a, a.accountable_id, 'rejected', a.ref + ' rejected', comment);
    return status;
  }
  if (decision === 'request_info') {
    ap.status = 'info_requested'; ap.comment = comment;
    a.status = 'submitted'; a.info_request = comment; touch(tx, a);
    log(tx, { org: a.org_id, actor: m.id, stage: 'authorise', event: 'information_requested', summary: `${a.ref}: ${m.full_name} requested more information`,
      ...actionLog(a), prev: before, next: 'submitted', details: { question: comment } });
    notifyAction(tx, a, a.requested_by, 'info_requested', 'Information requested on ' + a.ref, comment);
    return 'submitted';
  }
  const higher = tx.db.roles.find(r => r.id === ap.approver_role_id)?.reports_to ?? null;
  ap.status = 'escalated'; ap.decided_by = m.id; ap.comment = comment; ap.decided_at = nowTs(tx);
  for (const x of tx.db.approvals) if (x.action_id === a.id && x.kind === ap.kind && x.step > ap.step && x.status !== 'superseded') x.step += 1;
  tx.db.approvals.push({
    id: tx.uuid(), action_id: a.id, step: ap.step + 1, kind: ap.kind, approver_role_id: higher as string, rule_id: null,
    rationale: `Escalated by ${m.full_name}: ${s(comment)}`, status: 'pending', decided_by: null, on_behalf_of: null, comment: null, created_at: nowTs(tx), decided_at: null,
  });
  if (ap.kind === 'pre') a.status = 'escalated';
  touch(tx, a);
  log(tx, { org: a.org_id, actor: m.id, stage: 'authorise', event: 'approval_escalated', summary: `${a.ref} escalated from ${s(apRole)} to ${s(roleName(tx, higher))}`,
    ...actionLog(a), prev: before, next: 'escalated', details: { reason: comment } });
  notifyRole(tx, a.org_id, higher, 'escalation', 'Escalated decision: ' + a.ref, comment, 'action', a.id);
  return 'escalated';
}

export function respondInfo(tx: Tx, id: string, response: string | null): string {
  const a = lockAction(tx, id);
  const m = me(tx, a.org_id);
  assertOp(tx, a, m.id, 'respond_info');
  if (trimEmpty(response)) invalid('a response is required');
  const ap = sortRows(tx.db.approvals.filter(x => x.action_id === a.id && x.status === 'info_requested'), [x => x.step])[0];
  if (ap) ap.status = 'pending';
  const question = a.info_request;
  a.status = 'awaiting_approval'; a.info_request = null; touch(tx, a);
  insertEvidence(tx, { action: a.id, kind: 'note', summary: response as string, data: { in_reply_to: question }, by: m.id });
  log(tx, { org: a.org_id, actor: m.id, stage: 'authorise', event: 'information_provided', summary: a.ref + ': requester responded; returned to approver',
    ...actionLog(a), prev: 'submitted', next: 'awaiting_approval', details: { response } });
  notifyRole(tx, a.org_id, ap?.approver_role_id ?? null, 'approval_requested', 'Information provided on ' + a.ref, response, 'action', a.id);
  return 'awaiting_approval';
}

export function invokeEmergency(tx: Tx, id: string, reason: string | null): string {
  let a = lockAction(tx, id);
  const m = me(tx, a.org_id);
  assertOp(tx, a, m.id, 'emergency');
  if ((reason ?? '').trim().length < 10) invalid('describe the emergency (at least 10 characters)');
  const OPEN = ['pending', 'waiting', 'info_requested'];
  if (!tx.db.approvals.some(x => x.action_id === a.id && OPEN.includes(x.status))) { routeApprovals(tx, a.id, m.id); a = lockAction(tx, id); }
  let own = 0;
  for (const x of tx.db.approvals) {
    if (x.action_id === a.id && x.kind === 'pre' && OPEN.includes(x.status) && authorityVia(tx, m.id, x.approver_role_id) !== null && m.id !== a.requested_by) {
      x.status = 'approved'; x.decided_by = m.id; x.decided_at = nowTs(tx); x.comment = 'Approved under emergency authority: ' + reason; own++;
    }
  }
  for (const x of tx.db.approvals) {
    const rule = x.rule_id === null ? undefined : tx.db.approval_rules.find(r => r.id === x.rule_id);
    if (x.action_id === a.id && rule && x.kind === 'pre' && OPEN.includes(x.status) && rule.in_emergency === 'post_review') {
      x.kind = 'post_review'; x.status = 'pending'; x.rationale = (x.rationale ?? '') + ' — converted to post-emergency review';
    }
  }
  const remaining = tx.db.approvals.filter(x => x.action_id === a.id && x.kind === 'pre' && OPEN.includes(x.status)).length;
  if (!tx.db.approvals.some(x => x.action_id === a.id && x.kind === 'pre' && x.status === 'pending')) {
    const first = sortRows(tx.db.approvals.filter(x => x.action_id === a.id && x.kind === 'pre' && x.status === 'waiting'), [x => x.step])[0];
    if (first) first.status = 'pending';
  }
  const before = a.status;
  a.emergency = true; a.emergency_reason = reason; a.info_request = null;
  a.assessed_by = a.assessed_by ?? m.id; a.assessment = a.assessment ?? 'Emergency assessment: ' + reason;
  a.status = remaining === 0 ? 'approved' : 'awaiting_approval';
  if (!a.criteria.some(c => c.type === 'post_reviews_approved')) a.criteria = [...a.criteria, { key: 'post_review', label: 'Post-emergency review approved', type: 'post_reviews_approved' }];
  touch(tx, a);
  const postReviews = tx.db.approvals.filter(x => x.action_id === a.id && x.kind === 'post_review' && x.status === 'pending');
  log(tx, { org: a.org_id, actor: m.id, stage: 'authorise', event: 'emergency_invoked',
    summary: `EMERGENCY procedure invoked on ${a.ref} by ${m.full_name} (${s(roleName(tx, m.role_id))}): ${s(reason)}`, ...actionLog(a), prev: before,
    next: remaining === 0 ? 'approved' : 'awaiting_approval', outcome: 'emergency',
    details: { reason, own_authority_steps: own, approvals_still_required_before_execution: remaining, post_reviews: postReviews.map(x => roleName(tx, x.approver_role_id)) } });
  for (const role of pgSort([...new Set(postReviews.map(x => x.approver_role_id))], collate)) {
    notifyRole(tx, a.org_id, role, 'post_review_required', 'Post-emergency review required: ' + a.ref, `${m.full_name} invoked the emergency procedure: ${s(reason)}`, 'action', a.id);
  }
  if (a.status === 'approved') notifyExecutors(tx, a, 'EMERGENCY — execute ' + a.ref, reason);
  return a.status;
}

export function scheduleAction(tx: Tx, id: string, when: number | null): string {
  const a = lockAction(tx, id);
  const m = me(tx, a.org_id);
  assertOp(tx, a, m.id, 'schedule');
  const before = a.status;
  a.status = 'scheduled'; a.scheduled_for = when === null ? null : pgTs(when); a.executor_id = a.executor_id ?? m.id; touch(tx, a);
  log(tx, { org: a.org_id, actor: m.id, stage: 'execute', event: 'execution_scheduled',
    summary: `${a.ref} scheduled for ${when === null ? '' : parisDayMonthTime(display(tx, when))}`, ...actionLog(a), prev: before, next: 'scheduled' });
  return 'scheduled';
}

export function startExecution(tx: Tx, id: string): string {
  const a = lockAction(tx, id);
  const m = me(tx, a.org_id);
  assertOp(tx, a, m.id, 'start');
  const before = a.status;
  a.status = 'in_progress'; a.executor_id = m.id; a.progress = Math.max(a.progress, 20); touch(tx, a);
  insertRaci(tx, a.org_id, 'action', a.id, m.id, 'R');
  log(tx, { org: a.org_id, actor: m.id, stage: 'execute', event: 'execution_started',
    summary: `${a.ref} execution started by ${m.full_name}${a.emergency ? ' under EMERGENCY authorisation' : ''}`, ...actionLog(a), prev: before, next: 'in_progress',
    details: { mode: a.execution_mode, emergency: a.emergency } });
  return 'in_progress';
}

export function recordExecution(tx: Tx, id: string, outcome: string | null, notes: string | null): string {
  if (!['success', 'failed'].includes(outcome ?? '')) invalid('outcome must be success or failed');
  const a = lockAction(tx, id);
  const m = me(tx, a.org_id);
  assertOp(tx, a, m.id, 'record_execution');
  if (a.execution_mode === 'device') denied('device actions are recorded by the enrolled device agent, not manually.');
  if (trimEmpty(notes)) invalid('execution notes are required as evidence');
  const t = actionType(tx, a.org_id, a.action_type);
  const assetName = a.asset_id ? tx.db.assets.find(x => x.id === a.asset_id)?.name ?? null : null;
  const manual = ['endpoint_shutdown', 'lock_device'].includes(a.action_type);
  const label = manual ? 'MANUAL ACTION' : 'SIMULATED ACTION';
  insertEvidence(tx, { action: a.id, kind: 'execution_record', summary: notes as string, label, by: m.id, data: {
    outcome, action_type: t?.name ?? null, target: assetName, executor: m.full_name,
    simulation_notice: manual ? 'Performed by hand by the authorised executor and recorded here. The platform itself did not control the device.'
      : 'Simulated in the NOVATECH governance platform. No production system was changed.',
  } });
  const ok = outcome === 'success';
  const status = ok ? 'awaiting_verification' : 'failed';
  a.status = status; if (ok) a.progress = 80; touch(tx, a);
  log(tx, { org: a.org_id, actor: m.id, stage: 'execute', event: ok ? 'execution_completed' : 'execution_failed',
    summary: `${a.ref} execution ${ok ? 'completed' : 'FAILED'} (${label}): ${s(notes)}`, ...actionLog(a), prev: 'in_progress', next: status, outcome, details: { label } });
  if (ok) {
    const verifiers = holders(tx, a.org_id, 'action.verify').filter(e => e.id !== m.id && (e.id === a.accountable_id || e.role_id === t?.assessor_role_id
      || tx.db.raci.some(rc => rc.entity_type === 'action' && rc.entity_id === a.id && rc.employee_id === e.id)));
    for (const e of verifiers) insertNotification(tx, a.org_id, e.id, 'verification_required', 'Verification required: ' + a.ref, a.title, 'action', a.id);
  } else {
    notifyAction(tx, a, a.accountable_id, 'execution_failed', a.ref + ' execution failed', notes);
    for (const e of holders(tx, a.org_id, 'action.reassign').filter(e => e.id !== a.accountable_id)) {
      insertNotification(tx, a.org_id, e.id, 'execution_failed', a.ref + ' execution failed', notes, 'action', a.id);
    }
  }
  return status;
}

export function verifyAction(tx: Tx, id: string, confirmations: JsonObject | null, notes: string | null, rl: number | null, ri: number | null): JsonObject {
  const a = lockAction(tx, id);
  const m = me(tx, a.org_id);
  assertOp(tx, a, m.id, 'verify');
  const res = evaluateCriteria(tx, a, m.id, confirmations ?? {});
  const passed = res.map(x => x.passed).filter(x => x !== null);
  const allOk = res.length > 0 && passed.length > 0 && passed.every(x => x === true);
  insertEvidence(tx, { action: a.id, kind: 'verification', summary: allOk ? 'All verification criteria passed' : 'Verification failed: criteria not met',
    data: { criteria: res, notes, residual_likelihood: rl, residual_impact: ri }, by: m.id });
  const before = a.status;
  if (allOk) {
    for (const v of [rl, ri]) if (v !== null && (v < 1 || v > 4)) dbError('new row for relation "actions" violates check constraint "actions_residual_likelihood_check"');
    a.status = 'completed'; a.progress = 100; a.completed_at = nowTs(tx);
    a.residual_likelihood = rl ?? a.residual_likelihood; a.residual_impact = ri ?? a.residual_impact; touch(tx, a);
    if (a.risk_id !== null && rl !== null && ri !== null) {
      const r = tx.db.risks.find(x => x.id === a.risk_id);
      if (r) { r.residual_likelihood = rl; r.residual_impact = ri; r.status = 'treating'; }
    }
    log(tx, { org: a.org_id, actor: m.id, stage: 'verify', event: 'verification_passed', summary: `${a.ref} verified by ${m.full_name} — all ${res.length} criteria passed`,
      ...actionLog(a), prev: before, next: 'completed', outcome: 'success', details: { criteria: res, notes } });
    notifyAction(tx, a, a.accountable_id, 'action_completed', a.ref + ' completed and verified', a.title);
    if (a.requested_by !== a.accountable_id) notifyAction(tx, a, a.requested_by, 'action_completed', a.ref + ' completed and verified', a.title);
  } else {
    log(tx, { org: a.org_id, actor: m.id, stage: 'verify', event: 'verification_failed', summary: `${a.ref} verification by ${m.full_name} FAILED — action stays open`,
      ...actionLog(a), prev: before, next: before, outcome: 'failed', details: { criteria: res, notes } });
    notifyAction(tx, a, a.accountable_id, 'verification_failed', a.ref + ' failed verification', 'One or more verification criteria were not met.');
  }
  return { passed: allOk, criteria: res };
}

export function reopenAction(tx: Tx, id: string, reason: string | null): string {
  const a = lockAction(tx, id);
  const m = me(tx, a.org_id);
  assertOp(tx, a, m.id, 'reopen');
  if (trimEmpty(reason)) invalid('a reason is required');
  for (const x of tx.db.approvals) if (x.action_id === a.id && ['pending', 'waiting', 'info_requested'].includes(x.status)) x.status = 'superseded';
  const before = a.status;
  a.status = 'reopened'; a.blocked_reason = reason; a.executor_id = null; a.progress = 0; a.completed_at = null; a.emergency = false; touch(tx, a);
  log(tx, { org: a.org_id, actor: m.id, stage: 'governance', event: 'action_reopened', summary: `${a.ref} reopened by ${m.full_name}: ${s(reason)}`,
    ...actionLog(a), prev: before, next: 'reopened', details: { reason } });
  notifyAction(tx, a, a.requested_by, 'reopened', a.ref + ' reopened', reason);
  return 'reopened';
}

export function cancelAction(tx: Tx, id: string, reason: string | null): string {
  const a = lockAction(tx, id);
  const m = me(tx, a.org_id);
  assertOp(tx, a, m.id, 'cancel');
  if (trimEmpty(reason)) invalid('a reason is required');
  for (const x of tx.db.approvals) if (x.action_id === a.id && ['pending', 'waiting', 'info_requested'].includes(x.status)) x.status = 'superseded';
  const before = a.status;
  a.status = 'cancelled'; touch(tx, a);
  log(tx, { org: a.org_id, actor: m.id, stage: 'governance', event: 'action_cancelled', summary: `${a.ref} cancelled by ${m.full_name}: ${s(reason)}`,
    ...actionLog(a), prev: before, next: 'cancelled', details: { reason } });
  return 'cancelled';
}

export function reassignAction(tx: Tx, id: string, fieldName: string | null, employeeId: string | null, reason: string | null): string {
  if (!['executor', 'responsible', 'accountable'].includes(fieldName ?? '')) invalid('field must be executor, responsible or accountable');
  const a = lockAction(tx, id);
  const m = me(tx, a.org_id);
  assertOp(tx, a, m.id, 'reassign');
  if (trimEmpty(reason)) invalid('a reason is required');
  const target = tx.db.employees.find(e => e.id === employeeId && e.org_id === a.org_id);
  if (!target || !target.active) invalid('the new assignee must be an active employee of this organisation');
  const tgt = target as Employee;
  const t = actionType(tx, a.org_id, a.action_type);
  let old: string | null;
  if (fieldName === 'executor') {
    if (a.status === 'in_progress') denied('execution is in progress; record the result before reassigning.');
    if (t && t.executor_role_ids.length > 0 && !t.executor_role_ids.includes(tgt.role_id)) {
      denied(`${tgt.full_name} (${s(roleName(tx, tgt.role_id))}) does not hold a role authorised to execute "${t.name}".`);
    }
    if (tx.db.approvals.some(x => x.action_id === a.id && x.decided_by === tgt.id && x.status === 'approved')) {
      denied(`${tgt.full_name} approved this action; separation of duties forbids them executing it.`);
    }
    old = a.executor_id; a.executor_id = tgt.id;
  } else if (fieldName === 'responsible') { old = a.responsible_id; a.responsible_id = tgt.id; } else { old = a.accountable_id; a.accountable_id = tgt.id; }
  touch(tx, a);
  insertRaci(tx, a.org_id, 'action', a.id, tgt.id, fieldName === 'accountable' ? 'A' : 'R');
  log(tx, { org: a.org_id, actor: m.id, stage: 'governance', event: 'responsibility_reassigned',
    summary: `${a.ref}: ${fieldName} reassigned from ${empName(tx, old) ?? '(unassigned)'} to ${tgt.full_name} — ${s(reason)}`, ...actionLog(a), prev: a.status, next: a.status,
    details: { field: fieldName, from: old, to: tgt.id, reason } });
  notifyAction(tx, a, tgt.id, 'assigned', `You are now ${fieldName} for ${a.ref}`, a.title);
  return 'ok';
}

export function addNote(tx: Tx, entityType: string | null, id: string | null, note: string | null): string {
  let org: string | null = null, ref: string | null = null, run: string | null = null;
  if (entityType === 'incident') { const i = tx.db.incidents.find(x => x.id === id); if (i) { org = i.org_id; ref = i.ref; run = i.scenario_run_id; } }
  else if (entityType === 'action') { const a = tx.db.actions.find(x => x.id === id); if (a) { org = a.org_id; ref = a.ref; run = a.scenario_run_id; } }
  else invalid('entity type');
  if (org === null) notFound();
  const m = me(tx, org as string);
  if (trimEmpty(note)) invalid('note is empty');
  insertEvidence(tx, { action: entityType === 'action' ? id : null, incident: entityType === 'incident' ? id : null, kind: 'note', summary: note as string, by: m.id });
  log(tx, { org, actor: m.id, stage: 'governance', event: 'evidence_added', summary: `${s(ref)}: note added by ${m.full_name}`, entityType, entityId: id, entityRef: ref,
    details: { note }, incident: entityType === 'incident' ? id : null, run });
  return 'ok';
}

// ---------------------------------------------------------------- incidents
const newIncident = (tx: Tx, x: Partial<Incident> & Pick<Incident, 'org_id' | 'ref' | 'title' | 'category' | 'severity' | 'source'>): Incident => {
  if (x.severity < 1 || x.severity > 4) dbError('new row for relation "incidents" violates check constraint "incidents_severity_check"');
  const row: Incident = {
    id: tx.uuid(), description: null, status: 'new', reported_by: null, assigned_to: null, risk_id: null, asset_id: null, financial_exposure: null,
    security_assessment: null, financial_assessment: null, legacy_alert_id: null, scenario_run_id: null, archived: false, detected_at: nowTs(tx),
    closed_at: null, aware_at: null, regimes: [], personal_data: false, significant: false, ...x,
  };
  if (row.risk_id !== null && !tx.db.risks.some(r => r.id === row.risk_id)) dbError('insert or update on table "incidents" violates foreign key constraint "incidents_risk_id_fkey"');
  if (row.asset_id !== null && !tx.db.assets.some(r => r.id === row.asset_id)) dbError('insert or update on table "incidents" violates foreign key constraint "incidents_asset_id_fkey"');
  fkEmployee(tx, row.assigned_to, 'incidents', 'assigned_to');
  tx.db.incidents.push(row);
  return row;
};

export function createIncident(tx: Tx, org: string, p: JsonObject): string {
  const m = me(tx, org);
  requirePerm(tx, m, 'incident.create', 'Creating an incident');
  if (trimEmpty(field(p, 'title'))) invalid('a title is required');
  const assignee = toUuid(nullif(field(p, 'assigned_to')));
  const ref = nextRef(tx, 'INC');
  const i = newIncident(tx, {
    org_id: org, ref, title: field(p, 'title') as string, description: field(p, 'description'), category: field(p, 'category') ?? 'Security',
    severity: toInt(field(p, 'severity')) ?? 2, source: 'manual', reported_by: m.id, assigned_to: assignee, risk_id: nullif(field(p, 'risk_id')),
    asset_id: nullif(field(p, 'asset_id')), financial_exposure: toNumeric(nullif(field(p, 'financial_exposure'))),
  });
  log(tx, { org, actor: m.id, stage: 'detect', event: 'incident_created', summary: `${ref} reported by ${m.full_name}: ${s(field(p, 'title'))}`,
    entityType: 'incident', entityId: i.id, entityRef: ref, next: 'new', risk: i.risk_id, incident: i.id, asset: i.asset_id });
  if (assignee !== null) notify(tx, org, assignee, 'incident_assigned', 'Investigate ' + ref, field(p, 'title'), 'incident', i.id);
  return i.id;
}

export function incidentTransition(tx: Tx, id: string, status: string | null, note: string | null): string {
  const i = tx.db.incidents.find(x => x.id === id);
  if (!i) notFound('incident');
  const inc = i as Incident;
  const m = me(tx, inc.org_id);
  if (inc.archived) denied('this incident belongs to a reset scenario run and is read-only.');
  if (!['investigating', 'contained', 'resolved', 'closed'].includes(status ?? '')) invalid('invalid status');
  if (trimEmpty(note)) invalid('a note is required');
  if (inc.status === 'closed') denied('the incident is already closed');
  if (status === 'investigating') {
    if (inc.status !== 'new') denied('investigation has already started');
    if (inc.assigned_to !== m.id && !hasPerm(tx, m.id, 'incident.investigate')) denied('only the assigned investigator or a security role can open the investigation');
    if (inc.assigned_to === null) inc.assigned_to = m.id;
  } else if (status === 'closed') {
    requirePerm(tx, m, 'incident.close', 'Closing an incident');
    const open = tx.db.actions.filter(a => a.incident_id === inc.id && !CLOSED.includes(a.status)).length;
    if (open > 0) denied(`${open} linked action(s) are not completed or cancelled. An incident cannot be closed before its response is verified.`);
  } else {
    requirePerm(tx, m, 'incident.investigate', 'Changing incident status');
  }
  const before = inc.status;
  inc.status = status as string; inc.closed_at = status === 'closed' ? nowTs(tx) : null;
  insertEvidence(tx, { incident: inc.id, kind: 'note', summary: note as string, data: { status }, by: m.id });
  log(tx, { org: inc.org_id, actor: m.id, stage: status === 'investigating' ? 'detect' : status === 'closed' ? 'verify' : 'execute', event: 'incident_' + status,
    summary: `${inc.ref} → ${status} by ${m.full_name}: ${s(note)}`, entityType: 'incident', entityId: inc.id, entityRef: inc.ref, prev: before, next: status,
    risk: inc.risk_id, incident: inc.id, asset: inc.asset_id, run: inc.scenario_run_id });
  if (status === 'closed') {
    for (const e of holders(tx, inc.org_id, 'governance.oversight').filter(e => e.id !== m.id)) {
      insertNotification(tx, inc.org_id, e.id, 'incident_closed', inc.ref + ' closed', note, 'incident', inc.id);
    }
  }
  return status as string;
}

export function assessIncident(tx: Tx, id: string, kind: string | null, summary: string | null, severity: number | null, recommendation: string | null): string {
  const i = tx.db.incidents.find(x => x.id === id);
  if (!i) notFound('incident');
  const inc = i as Incident;
  const m = me(tx, inc.org_id);
  if (inc.archived) denied('archived incident');
  if (!['security', 'financial'].includes(kind ?? '')) invalid('kind must be security or financial');
  requirePerm(tx, m, 'incident.assess.' + kind, (kind as string).charAt(0).toUpperCase() + (kind as string).slice(1) + ' assessment');
  if (trimEmpty(summary)) invalid('summary required');
  const svc = inc.asset_id ? tx.db.assets.find(x => x.id === inc.asset_id)?.business_service ?? null : null;
  const payload: JsonObject = { by: m.full_name, role: roleName(tx, m.role_id), at: nowTs(tx), summary, severity, recommendation, affected_service: svc };
  const before = inc.status;
  if (kind === 'security') { inc.security_assessment = payload; inc.severity = Math.max(inc.severity, severity ?? inc.severity); }
  else inc.financial_assessment = payload;
  if (inc.status === 'new') inc.status = 'investigating';
  insertEvidence(tx, { incident: inc.id, kind: 'assessment', summary: summary as string, data: payload, by: m.id });
  log(tx, { org: inc.org_id, actor: m.id, stage: 'assess', event: kind + '_assessment',
    summary: `${inc.ref} ${kind} assessment by ${m.full_name} (${s(roleName(tx, m.role_id))}): ${s(summary)}`, entityType: 'incident', entityId: inc.id, entityRef: inc.ref,
    prev: before, details: payload, risk: inc.risk_id, incident: inc.id, asset: inc.asset_id, run: inc.scenario_run_id });
  return 'ok';
}

export function incidentFromAlert(tx: Tx, org: string, alertId: number | null): string {
  const m = me(tx, org);
  requirePerm(tx, m, 'incident.create', 'Opening an incident from an alert');
  const al = tx.db.alerts.find(x => x.id === alertId);
  if (!al) notFound('alert');
  const alert = al as NonNullable<typeof al>;
  const existing = tx.db.incidents.find(i => i.legacy_alert_id === alertId && i.org_id === org && !i.archived);
  if (existing) return existing.id;
  const r = tx.db.risks.find(x => x.legacy_id === alert.risk_id && x.org_id === org);
  const ref = nextRef(tx, 'INC');
  const i = newIncident(tx, {
    org_id: org, ref, title: 'KRI alert: ' + alert.message, description: `Opened from monitoring alert #${alert.id}. The alert itself authorises nothing; any response action follows the approval policy.`,
    category: 'KRI threshold', severity: alert.severity === 'critical' ? 3 : 2, source: 'kri_alert', reported_by: m.id, assigned_to: r?.owner_id ?? null,
    risk_id: r?.id ?? null, legacy_alert_id: alert.id,
  });
  log(tx, { org, actor: m.id, stage: 'detect', event: 'incident_from_alert', summary: `${ref} opened from alert #${alert.id} (${alert.severity})`,
    entityType: 'incident', entityId: i.id, entityRef: ref, next: 'new', details: { alert_id: alert.id }, risk: r?.id ?? null, incident: i.id });
  notify(tx, org, r?.owner_id, 'incident_assigned', 'Incident opened on your risk: ' + ref, alert.message, 'incident', i.id);
  return i.id;
}

/** grc.reg_recompute: the NIS2 / GDPR / DORA notification clocks of an incident. */
function regRecompute(tx: Tx, incidentId: string): void {
  const i = tx.db.incidents.find(x => x.id === incidentId);
  if (!i || i.aware_at === null) return;
  const aware = tsMicros(i.aware_at);
  const rows = () => tx.db.reg_notifications.filter(n => n.incident_id === i.id);
  const find = (regime: string, stage: string) => rows().find(n => n.regime === regime && n.stage === stage);
  const insert = (regime: string, stage: string, authority: string, due: number | null, onConflictUpdate: boolean) => {
    const cur = find(regime, stage);
    if (!cur) {
      tx.db.reg_notifications.push({ id: tx.db.counters.reg_notification++, incident_id: i.id, regime, stage, authority, due_at: due === null ? null : pgTs(due), sent_at: null, sent_by: null, reference: null });
    } else if (onConflictUpdate && due !== null && cur.sent_at === null) cur.due_at = pgTs(due);
  };
  const sentAt = (regime: string, stage: string) => { const n = find(regime, stage); return n?.sent_at ? tsMicros(n.sent_at) : null; };
  const setDue = (regime: string, stage: string, due: number | null) => {
    const n = find(regime, stage);
    if (n && due !== null && n.sent_at === null) n.due_at = pgTs(due);
  };
  if (i.regimes.includes('NIS2')) {
    insert('NIS2', '1 · Early warning', 'CERT-FR / ANSSI', aware + 24 * HOUR_US, true);
    insert('NIS2', '2 · Incident notification', 'CERT-FR / ANSSI', aware + 72 * HOUR_US, true);
    insert('NIS2', '3 · Final report', 'CERT-FR / ANSSI', null, true);
    const sent = sentAt('NIS2', '2 · Incident notification');
    if (sent !== null) setDue('NIS2', '3 · Final report', addMonthsMicros(sent, 1));
  }
  if (i.regimes.includes('GDPR')) {
    insert('GDPR', '1 · Notify the CNIL', 'CNIL', aware + 72 * HOUR_US, false);
    if (i.personal_data) insert('GDPR', '2 · Inform data subjects (if high risk)', 'Data subjects', null, false);
  }
  if (i.regimes.includes('DORA')) {
    insert('DORA', '1 · Initial notification', 'Competent authority (via client)', aware + 24 * HOUR_US, false);
    insert('DORA', '2 · Intermediate report', 'Competent authority (via client)', null, false);
    insert('DORA', '3 · Final report', 'Competent authority (via client)', null, false);
    const s1 = sentAt('DORA', '1 · Initial notification');
    if (s1 !== null) setDue('DORA', '2 · Intermediate report', s1 + 72 * HOUR_US);
    const s2 = sentAt('DORA', '2 · Intermediate report');
    if (s2 !== null) setDue('DORA', '3 · Final report', addMonthsMicros(s2, 1));
  }
  tx.db.reg_notifications = tx.db.reg_notifications.filter(n => !(n.incident_id === i.id && n.sent_at === null && !i.regimes.includes(n.regime)));
}

export function incidentRegulatorySet(tx: Tx, org: string, incidentId: string | null, p: JsonObject): JsonObject | null {
  const m = me(tx, org);
  requirePerm(tx, m, 'incident.regulatory', 'Classifying an incident for regulatory reporting');
  const i = tx.db.incidents.find(x => x.id === incidentId && x.org_id === org);
  if (!i) notFound('incident');
  const inc = i as Incident;
  const regimesIn = p.regimes;
  if (regimesIn !== undefined && regimesIn !== null && !Array.isArray(regimesIn)) dbError('cannot extract elements from a scalar');
  const listed = (Array.isArray(regimesIn) ? regimesIn : []).map(x => jsonText(x as Json)).filter((x): x is string => x !== null);
  const aware = toTimestamp(field(p, 'aware_at'));
  inc.aware_at = aware !== null ? pgTs(aware) : inc.aware_at ?? inc.detected_at;
  inc.regimes = listed.filter(x => ['NIS2', 'GDPR', 'DORA'].includes(x));
  inc.personal_data = toBool(field(p, 'personal_data')) ?? inc.personal_data;
  inc.significant = toBool(field(p, 'significant')) ?? inc.significant;
  regRecompute(tx, inc.id);
  log(tx, { org, actor: m.id, stage: 'governance', event: 'regulatory_classified',
    summary: `${inc.ref} classified for reporting (${listed.length ? listed.join(', ') : 'no regime'}) by ${m.full_name}`, entityType: 'incident', entityId: inc.id,
    entityRef: inc.ref, details: p, risk: inc.risk_id, incident: inc.id, asset: inc.asset_id, run: inc.scenario_run_id });
  return regJson(tx, inc.id);
}

export function regMarkSent(tx: Tx, org: string, id: number | null, reference: string | null): JsonObject | null {
  const m = me(tx, org);
  requirePerm(tx, m, 'incident.regulatory', 'Recording a regulatory notification');
  const n = tx.db.reg_notifications.find(x => x.id === id);
  const i = n ? tx.db.incidents.find(x => x.id === n.incident_id && x.org_id === org) : undefined;
  if (!n || !i) notFound('notification');
  const note = n as NonNullable<typeof n>, inc = i as Incident;
  if (note.sent_at !== null) denied('already recorded as sent');
  const due = note.due_at;
  const late = due !== null && tx.now > tsMicros(due);
  note.sent_at = nowTs(tx); note.sent_by = m.id; note.reference = reference === null || reference.trim() === '' ? null : reference.trim();
  regRecompute(tx, inc.id);
  log(tx, { org, actor: m.id, stage: 'governance', event: 'regulatory_notified',
    summary: `${inc.ref} ${note.regime} ${note.stage} recorded as submitted by ${m.full_name}${late ? ' (LATE)' : ''}`, entityType: 'incident', entityId: inc.id, entityRef: inc.ref,
    outcome: late ? 'late' : 'on_time', details: { regime: note.regime, stage: note.stage, reference, due_at: due }, risk: inc.risk_id, incident: inc.id, asset: inc.asset_id, run: inc.scenario_run_id });
  return regJson(tx, inc.id);
}

// ---------------------------------------------------------------- risks, RACI, KRIs, controls
export function setRaci(tx: Tx, org: string, entityType: string | null, entityId: string | null, employeeId: string | null, raci: string | null, on: boolean | null): string {
  const m = me(tx, org);
  requirePerm(tx, m, 'action.reassign', 'Changing RACI assignments');
  if (!['R', 'A', 'C', 'I'].includes(raci ?? '')) invalid('raci');
  if (!tx.db.employees.some(e => e.id === employeeId && e.org_id === org && e.active)) invalid('employee');
  const removeSuffix = () => '#removed:' + compactTimestamp(tx.clock());
  if (on) {
    insertRaci(tx, org, entityType as string, entityId as string, employeeId as string, raci as string);
    if (entityType === 'risk' && raci === 'A') {
      for (const r of tx.db.raci) if (r.entity_type === 'risk' && r.entity_id === entityId && r.raci === 'A' && r.employee_id !== employeeId) r.entity_id = r.entity_id + removeSuffix();
      const risk = tx.db.risks.find(x => x.id === entityId);
      if (risk) risk.owner_id = employeeId;
    }
  } else {
    if (raci === 'A') invalid('the Accountable owner cannot be removed, only replaced');
    for (const r of tx.db.raci) if (r.entity_type === entityType && r.entity_id === entityId && r.employee_id === employeeId && r.raci === raci) r.entity_id = r.entity_id + removeSuffix();
  }
  log(tx, { org, actor: m.id, stage: 'governance', event: 'raci_changed',
    summary: `${s(entityType)} ${s(entityId)}: ${s(empName(tx, employeeId))} ${on ? 'assigned' : 'removed'} as ${s(raci)}`, entityType, entityId, details: { raci, on } });
  return 'ok';
}

export function riskSave(tx: Tx, org: string, p: JsonObject): string {
  const m = me(tx, org);
  requirePerm(tx, m, 'risk.manage', 'Managing the risk register');
  if (nullif(field(p, 'owner_id')) === null) invalid('every risk must have an accountable owner');
  const owner = toUuid(field(p, 'owner_id')) as string;
  if (!tx.db.employees.some(e => e.id === owner && e.org_id === org && e.active)) invalid('owner');
  if (nullif(field(p, 'id')) === null) {
    if (trimEmpty(field(p, 'title'))) invalid('title required');
    const l = toInt(field(p, 'likelihood')), im = toInt(field(p, 'impact'));
    const outside = (v: number | null) => (v === null ? null : v < 1 || v > 4);
    const o1 = outside(l), o2 = outside(im);
    if (o1 === true || o2 === true) invalid('likelihood and impact use the 1–4 scale');
    const id = `${org}-R${tx.db.counters.ref_seq++}`;
    const code = id.split('-')[1] ?? '';
    const dept = nullif(field(p, 'department_id'));
    if (dept !== null && !tx.db.departments.some(d => d.id === dept)) dbError('insert or update on table "risks" violates foreign key constraint "risks_department_id_fkey"');
    const risk: Risk = {
      id, org_id: org, code, legacy_id: null, title: field(p, 'title') as string, category: field(p, 'category') ?? 'Operational', department_id: dept,
      description: field(p, 'description'), likelihood: l, impact: im, owner_id: owner, treatment: field(p, 'treatment'), residual_likelihood: null,
      residual_impact: null, origin: 'governance_upgrade', status: 'open', created_at: nowTs(tx), appetite_id: null, legacy: null,
    };
    tx.db.risks.push(risk);
    insertRaci(tx, org, 'risk', id, owner, 'A');
    log(tx, { org, actor: m.id, stage: 'detect', event: 'risk_identified',
      summary: `Risk ${code} identified: ${s(field(p, 'title'))} (L${s(field(p, 'likelihood'))} × I${s(field(p, 'impact'))})`, entityType: 'risk', entityId: id, entityRef: code,
      next: 'open', details: p, risk: id });
    notify(tx, org, owner, 'risk_assigned', 'Risk assigned to you: ' + field(p, 'title'), 'You are the accountable owner.', 'risk', id);
    return id;
  }
  const r = tx.db.risks.find(x => x.id === field(p, 'id') && x.org_id === org);
  if (!r) notFound('risk');
  const risk = r as Risk;
  const hasL = hasKey(p, 'likelihood'), hasI = hasKey(p, 'impact');
  const newL = toInt(field(p, 'likelihood')), newI = toInt(field(p, 'impact'));
  if (risk.legacy_id !== null && (hasL || hasI)) {
    const legacy = risk.legacy ?? { likelihood: null, impact: null, treatment: null, residual_target_score: null, priority_rank: null };
    legacy.likelihood = newL ?? legacy.likelihood; legacy.impact = newI ?? legacy.impact;
    risk.legacy = legacy;
  } else if (hasL || hasI) {
    const l = newL ?? risk.likelihood, im = newI ?? risk.impact;
    if ((l !== null && (l < 1 || l > 4)) || (im !== null && (im < 1 || im > 4))) dbError('new row for relation "risks" violates check constraint "risks_likelihood_check"');
    risk.likelihood = l; risk.impact = im;
  }
  if (owner !== risk.owner_id) {
    setRaci(tx, org, 'risk', risk.id, owner, 'A', true);
    notify(tx, org, owner, 'risk_assigned', 'Risk assigned to you: ' + risk.title, 'You are now the accountable owner.', 'risk', risk.id);
  }
  log(tx, { org, actor: m.id, stage: 'assess', event: 'risk_updated', summary: `Risk ${risk.code} updated by ${m.full_name}`, entityType: 'risk', entityId: risk.id,
    entityRef: risk.code, details: { changes: p }, risk: risk.id });
  return risk.id;
}

/** public.process_kri_reading + grc.on_legacy_alert: classify a new reading, open or resolve legacy alerts, route them to the risk owners. */
function processReading(tx: Tx, readingId: number): void {
  const rd = tx.db.kri_readings.find(x => x.id === readingId);
  const k = rd ? tx.db.kri_definitions.find(x => x.id === rd.kri_id) : undefined;
  if (!rd || !k) return;
  const level = classifyKri(k.direction, rd.value, k.warning_threshold, k.critical_threshold);
  const OPEN = ['open', 'acknowledged'];
  if (level === 'warning' || level === 'critical') {
    for (const al of tx.db.alerts) {
      if (al.risk_id === k.risk_id && al.kri_id === k.id && OPEN.includes(al.status) && ['warning', 'critical'].includes(al.severity) && al.severity !== level) {
        al.status = 'resolved'; al.resolved_at = al.resolved_at ?? nowTs(tx);
      }
    }
    const fp = `${k.risk_id}:${k.id}:${level}`;
    if (tx.db.alerts.some(al => al.fingerprint === fp && OPEN.includes(al.status))) return;
    const alert = {
      id: tx.db.counters.alert++, risk_id: k.risk_id, kri_id: k.id, reading_id: rd.id, severity: level, status: 'open',
      message: `${k.risk_id}: ${k.name} reached ${numText(rd.value)}. ${level.charAt(0).toUpperCase() + level.slice(1)} threshold reached.`,
      fingerprint: fp, created_at: nowTs(tx), acknowledged_at: null, resolved_at: null,
    };
    tx.db.alerts.push(alert);
    for (const r of tx.db.risks.filter(x => x.legacy_id === alert.risk_id)) {
      log(tx, { org: r.org_id, actor: null, stage: 'detect', event: 'kri_alert_' + level, summary: 'Monitoring alert: ' + alert.message, entityType: 'alert',
        entityId: String(alert.id), entityRef: alert.risk_id, next: level, details: { alert_id: alert.id }, risk: r.id });
      if (r.owner_id !== null) notify(tx, r.org_id, r.owner_id, 'kri_' + level, `${level.toUpperCase()}: ${r.code} ${r.title}`, alert.message, 'risk', r.id);
      for (const e of holders(tx, r.org_id, 'governance.oversight')) {
        if (e.id !== r.owner_id && (level === 'critical' || e.role_id.endsWith('riskco'))) {
          insertNotification(tx, r.org_id, e.id, 'kri_' + level, `${level.toUpperCase()}: ${r.code} ${r.title}`, alert.message, 'risk', r.id);
        }
      }
    }
    return;
  }
  let resolved = 0;
  for (const al of tx.db.alerts) {
    if (al.risk_id === k.risk_id && al.kri_id === k.id && OPEN.includes(al.status) && ['warning', 'critical'].includes(al.severity)) {
      al.status = 'resolved'; al.resolved_at = al.resolved_at ?? nowTs(tx); resolved++;
    }
  }
  if (resolved > 0) {
    const fp = `${k.risk_id}:${k.id}:recovery:${rd.id}`;
    if (!tx.db.alerts.some(al => al.fingerprint === fp && al.reading_id === rd.id)) {
      tx.db.alerts.push({ id: tx.db.counters.alert++, risk_id: k.risk_id, kri_id: k.id, reading_id: rd.id, severity: 'recovery', status: 'resolved',
        message: `${k.risk_id}: ${k.name} returned to normal at ${numText(rd.value)}.`, fingerprint: fp, created_at: nowTs(tx), acknowledged_at: null, resolved_at: nowTs(tx) });
    }
  }
}

export function recordKri(tx: Tx, org: string, legacyRisk: string | null, value: number | null, note: string | null): JsonObject | null {
  const m = me(tx, org);
  requirePerm(tx, m, 'kri.record', 'Recording a KRI measurement');
  const k = tx.db.kri_definitions.find(x => x.risk_id === legacyRisk);
  if (!k) notFound(`no KRI for ${raiseText(legacyRisk)}`);
  const kri = k as NonNullable<typeof k>;
  if (value === null) dbError('null value in column "value" of relation "kri_readings" violates not-null constraint');
  const reading = {
    id: tx.db.counters.kri_reading++, kri_id: kri.id, value: value as number, source: 'governance_platform',
    note: (note !== null && note !== '' ? note + ' · ' : '') + 'recorded by ' + m.full_name, recorded_at: nowTs(tx),
  };
  tx.db.kri_readings.push(reading);
  processReading(tx, reading.id);
  const st = kriState(tx, legacyRisk);
  log(tx, { org, actor: m.id, stage: 'detect', event: 'kri_recorded',
    summary: `${s(legacyRisk)} ${kri.name} = ${numText(value as number)} ${kri.unit} → ${String(st?.level ?? '').toUpperCase()}`, entityType: 'kri', entityId: kri.id,
    entityRef: legacyRisk, next: (st?.level as string) ?? null, details: { reading_id: reading.id, note }, risk: tx.db.risks.find(r => r.legacy_id === legacyRisk && r.org_id === org)?.id ?? null });
  return st;
}

/** grc.monitor_run: the automated control monitors. */
function monitorRun(tx: Tx, org: string, actor: string): JsonObject[] {
  const out: JsonObject[] = [];
  for (const c of sortRows(tx.db.controls.filter(x => x.org_id === org && x.monitor !== null), [x => x.code])) {
    let res: string | null = null, det = '', metrics: JsonObject = {};
    const monitor = c.monitor as string;
    if (monitor === 'sod') {
      const acts = tx.db.actions.filter(a => a.org_id === org);
      let v = 0;
      for (const a of acts) for (const ap of tx.db.approvals) if (ap.action_id === a.id && ap.status === 'approved' && (ap.decided_by === a.requested_by || (ap.decided_by !== null && ap.decided_by === a.executor_id))) v++;
      res = v === 0 ? 'pass' : 'fail';
      det = `${acts.length} actions checked; ${v} approvals by the requester or the executor.`;
      metrics = { actions_checked: acts.length, violations: v };
    } else if (monitor === 'dual_control') {
      const acts = tx.db.actions.filter(a => a.org_id === org && ['payment_hold', 'transaction_hold'].includes(a.action_type) && a.amount !== null && a.amount >= 100000
        && ['approved', 'scheduled', 'in_progress', 'awaiting_verification', 'completed'].includes(a.status) && !a.emergency);
      const v = acts.filter(a => new Set(tx.db.approvals.filter(ap => ap.action_id === a.id && ap.kind === 'pre' && ap.status === 'approved' && ap.decided_by !== null).map(ap => ap.decided_by)).size < 2).length;
      res = v === 0 ? 'pass' : 'fail';
      det = acts.length === 0 ? 'No authorised payment decision of €100,000 or more yet; policy rule active (CFO step 1, CEO step 2).'
        : `${acts.length} authorised payment decisions of €100,000 or more; ${v} without two distinct approvers.`;
      metrics = { checked: acts.length, violations: v };
    } else if (monitor === 'audit_chain') {
      const st = chainState(tx);
      res = st.ok ? 'pass' : 'fail';
      det = st.ok ? `${st.checked} ledger entries recomputed; every fingerprint matches.` : `Chain broken at entry #${st.first_broken_id}.`;
      metrics = { ok: st.ok, checked: st.checked, first_broken_id: st.first_broken_id };
    } else if (monitor === 'overdue_actions') {
      const v = tx.db.actions.filter(a => a.org_id === org && !a.archived && a.deadline !== null && tsMicros(a.deadline) < tx.now && !CLOSED.includes(a.status)).length;
      res = v === 0 ? 'pass' : v <= 2 ? 'warn' : 'fail';
      det = `${v} open treatment actions past their deadline.`;
      metrics = { overdue: v };
    } else if (monitor.startsWith('kri:')) {
      const st = kriState(tx, monitor.split(':')[1] ?? '');
      if (st === null || st.value === null) { res = 'warn'; det = 'No KRI reading available.'; metrics = {}; }
      else {
        res = st.level === 'normal' ? 'pass' : st.level === 'warning' ? 'warn' : 'fail';
        det = `${s(st.kri)} = ${s(st.value)} ${s(st.unit)} (warning ${s(st.warning)}, critical ${s(st.critical)}).`;
        metrics = st;
      }
    }
    if (res !== null) {
      tx.db.control_tests.push({ id: tx.db.counters.control_test++, control_id: c.id, run_at: nowTs(tx), result: res, detail: det, source: 'platform_monitor', tester: actor, metrics });
      c.last_tested = tx.today;
      out.push({ code: c.code, result: res, detail: det });
    }
  }
  return out;
}

export function monitorRunRpc(tx: Tx, org: string): JsonObject[] {
  const m = me(tx, org);
  requirePerm(tx, m, 'control.test', 'Running control monitoring');
  const r = monitorRun(tx, org, m.id);
  const count = (x: string) => r.filter(y => y.result === x).length;
  log(tx, { org, actor: m.id, stage: 'verify', event: 'controls_monitored',
    summary: `Continuous monitoring run by ${m.full_name}: ${count('pass')} pass, ${count('warn')} warn, ${count('fail')} fail`, entityType: 'control', details: { results: r } });
  return r;
}

export function controlTestRecord(tx: Tx, org: string, controlId: string | null, result: string | null, detail: string | null): JsonObject | null {
  const m = me(tx, org);
  requirePerm(tx, m, 'control.test', 'Recording a control test');
  const c = tx.db.controls.find(x => x.id === controlId && x.org_id === org);
  if (!c) notFound('control');
  const ctl = c as NonNullable<typeof c>;
  if (!['pass', 'warn', 'fail'].includes(result ?? '')) invalid('result must be pass, warn or fail');
  if (trimEmpty(detail)) invalid('describe what was tested and the evidence');
  tx.db.control_tests.push({ id: tx.db.counters.control_test++, control_id: ctl.id, run_at: nowTs(tx), result: result as string, detail, source: 'manual', tester: m.id, metrics: null });
  ctl.last_tested = tx.today;
  log(tx, { org, actor: m.id, stage: 'verify', event: 'control_tested', summary: `${ctl.code} ${ctl.title} tested by ${m.full_name}: ${(result as string).toUpperCase()}`,
    entityType: 'control', entityId: ctl.id, entityRef: ctl.code, next: result, outcome: result, details: { detail } });
  return controlLastTest(tx, ctl.id);
}

export function ebiosItemSave(tx: Tx, org: string, id: string | null, p: JsonObject): JsonObject {
  const m = me(tx, org);
  requirePerm(tx, m, 'ebios.manage', 'Editing the EBIOS RM study');
  const study = sortRows(tx.db.ebios_studies.filter(x => x.org_id === org), [x => ts(x.updated_at), 'desc'])[0];
  if (!study) notFound('study');
  if (trimEmpty(field(p, 'title'))) invalid('a title is required');
  let item;
  if (id === null) {
    const workshop = toInt(field(p, 'workshop'));
    const kind = field(p, 'kind');
    if (workshop === null) dbError('null value in column "workshop" of relation "ebios_items" violates not-null constraint');
    if ((workshop as number) < 1 || (workshop as number) > 5) dbError('new row for relation "ebios_items" violates check constraint "ebios_items_workshop_check"');
    if (kind === null) dbError('null value in column "kind" of relation "ebios_items" violates not-null constraint');
    let nid = '';
    do nid = 'EB-' + Array.from({ length: 6 }, () => '0123456789ABCDEF'[Math.floor(tx.random() * 16)]).join(''); while (tx.db.ebios_items.some(x => x.id === nid));
    const data = p.data;
    item = { id: nid, study_id: study.id, workshop: workshop as number, kind: kind as string, ref: field(p, 'ref'), title: field(p, 'title') as string,
      data: (data !== undefined && data !== null ? data : {}) as JsonObject, sort: toInt(field(p, 'sort')) ?? 99 };
    tx.db.ebios_items.push(item);
  } else {
    item = tx.db.ebios_items.find(x => x.id === id && x.study_id === study.id);
    if (!item) notFound('item');
    const it = item as NonNullable<typeof item>;
    it.title = field(p, 'title') as string;
    it.ref = field(p, 'ref') ?? it.ref;
    if (p.data !== undefined && p.data !== null) it.data = p.data as JsonObject;
  }
  const it = item as NonNullable<typeof item>;
  study.updated_at = nowTs(tx);
  log(tx, { org, actor: m.id, stage: 'assess', event: 'ebios_updated',
    summary: `EBIOS RM workshop ${it.workshop}: ${id === null ? 'added' : 'updated'} ${it.ref ?? ''} ${it.title} by ${m.full_name}`, entityType: 'ebios', entityId: it.id,
    entityRef: it.ref, details: { kind: it.kind, data: it.data } });
  return { ...it };
}

export function quantSave(tx: Tx, org: string, riskId: string | null, p: JsonObject): JsonObject {
  const m = me(tx, org);
  requirePerm(tx, m, 'quant.manage', 'Editing loss estimates');
  const v = tx.db.risks.find(x => x.id === riskId && x.org_id === org);
  if (!v) notFound('risk');
  const risk = v as Risk;
  const val = (k: string) => toNumeric(field(p, k));
  for (const k of ['tef', 'vuln', 'lm']) {
    const lo = val(k + '_min'), ml = val(k + '_ml'), hi = val(k + '_max');
    if ((lo !== null && ml !== null && lo > ml) || (ml !== null && hi !== null && ml > hi)) invalid(`${k} must satisfy minimum ≤ most likely ≤ maximum`);
  }
  const vmax = val('vuln_max'), vmin = val('vuln_min');
  if ((vmax !== null && vmax > 1) || (vmin !== null && vmin < 0)) invalid('vulnerability is a probability between 0 and 1');
  const cols = ['tef_min', 'tef_ml', 'tef_max', 'vuln_min', 'vuln_ml', 'vuln_max', 'lm_min', 'lm_ml', 'lm_max'] as const;
  const values = {} as Record<(typeof cols)[number], number>;
  for (const c of cols) {
    const n = val(c);
    if (n === null) dbError(`null value in column "${c}" of relation "risk_quant" violates not-null constraint`);
    values[c] = n as number;
  }
  const row = { risk_id: risk.id, ...values, rationale: field(p, 'rationale'), updated_at: nowTs(tx), updated_by: m.id };
  const at = tx.db.risk_quant.findIndex(x => x.risk_id === risk.id);
  if (at >= 0) tx.db.risk_quant[at] = row; else tx.db.risk_quant.push(row);
  log(tx, { org, actor: m.id, stage: 'assess', event: 'risk_quantified', summary: `Loss estimate for ${risk.code} ${risk.title} updated by ${m.full_name}`,
    entityType: 'risk', entityId: risk.id, entityRef: risk.code, details: p, risk: risk.id });
  return { ok: true };
}

const VENDOR_WEIGHTS: [string, number][] = [['mfa', 15], ['cert', 15], ['eu_data', 5], ['vuln_mgmt', 10], ['bcp_tested', 10], ['encryption', 10], ['audit_right', 10],
  ['exit_clause', 5], ['subprocessors', 10], ['incident_notice', 10]];
export function vendorAssess(tx: Tx, org: string, vendorId: string | null, answers: JsonObject | null, findings: string | null): JsonObject {
  const m = me(tx, org);
  requirePerm(tx, m, 'vendor.manage', 'Assessing a supplier');
  const v = tx.db.vendors.find(x => x.id === vendorId && x.org_id === org);
  if (!v) notFound('vendor');
  const ven = v as NonNullable<typeof v>;
  let twice = 0; // score × 2, exact
  for (const [k, w] of VENDOR_WEIGHTS) {
    if (!hasKey(answers ?? undefined, k)) invalid(`answer every question (missing ${k})`);
    const a = field(answers, k);
    twice += a === 'yes' ? 2 * w : a === 'partial' ? w : 0;
  }
  const score = twice / 2;
  const inherent = ven.inherent_score ?? 50;
  const resid = Number.isInteger(inherent) ? Math.floor((inherent * (1000 - 3 * twice) + 500) / 1000) : pgRound(inherent * (1 - score / 100 * 0.6));
  const months = ven.tier === 'critical' || ven.tier === 'high' ? 12 : ven.tier === 'medium' ? 24 : 36;
  const rounded = pgRound(score);
  tx.db.vendor_assessments.push({ id: tx.db.counters.vendor_assessment++, vendor_id: ven.id, assessed_on: tx.today, score: rounded, answers: answers ?? {}, findings, assessor: m.id, created_at: nowTs(tx) });
  const before = ven.residual_score;
  ven.last_assessed = tx.today; ven.next_review = addMonths(tx.today, months); ven.residual_score = resid;
  ven.exit_plan = field(answers, 'exit_clause') === 'yes' || ven.exit_plan;
  log(tx, { org, actor: m.id, stage: 'assess', event: 'vendor_assessed',
    summary: `${ven.name} assessed by ${m.full_name}: control score ${rounded}/100, residual risk ${resid}`, entityType: 'vendor', entityId: ven.id, entityRef: ven.name,
    prev: before === null ? null : numText(before), next: String(resid), details: { answers, findings }, risk: ven.risk_id });
  return { score: rounded, residual: resid };
}

export function bcpTestRecord(tx: Tx, org: string, processId: string | null, p: JsonObject): JsonObject {
  const m = me(tx, org);
  requirePerm(tx, m, 'bcm.manage', 'Recording a continuity test');
  const pr = tx.db.processes.find(x => x.id === processId && x.org_id === org);
  if (!pr) notFound('process');
  const proc = pr as NonNullable<typeof pr>;
  const result = field(p, 'result');
  if (result !== null && !['pass', 'partial', 'fail'].includes(result)) invalid('result must be pass, partial or fail');
  if (result === null) dbError('null value in column "result" of relation "bcp_tests" violates not-null constraint');
  tx.db.bcp_tests.push({
    id: tx.db.counters.bcp_test++, process_id: proc.id, tested_on: toDate(field(p, 'tested_on')) ?? tx.today, test_type: field(p, 'test_type'),
    achieved_rto_hours: toNumeric(nullif(field(p, 'achieved_rto_hours'))), achieved_rpo_hours: toNumeric(nullif(field(p, 'achieved_rpo_hours'))),
    result: result as string, notes: field(p, 'notes'), recorded_by: m.id,
  });
  log(tx, { org, actor: m.id, stage: 'verify', event: 'continuity_tested',
    summary: `${proc.name}: ${field(p, 'test_type') ?? 'test'} recorded by ${m.full_name}, result ${s(result).toUpperCase()}`, entityType: 'process', entityId: proc.id,
    entityRef: proc.name, next: result, outcome: result, details: p, risk: proc.risk_id });
  return { ok: true };
}

export function policyAttest(tx: Tx, org: string, policyId: string | null): JsonObject {
  const m = me(tx, org);
  const p = tx.db.policies.find(x => x.id === policyId && x.org_id === org);
  if (!p) notFound('policy');
  const pol = p as NonNullable<typeof p>;
  if (pol.status !== 'approved') denied('only an approved policy can be acknowledged');
  if (!tx.db.policy_attestations.some(a => a.policy_id === pol.id && a.employee_id === m.id && a.version === pol.version)) {
    tx.db.policy_attestations.push({ policy_id: pol.id, employee_id: m.id, version: pol.version, attested_at: nowTs(tx) });
  }
  log(tx, { org, actor: m.id, stage: 'governance', event: 'policy_attested', summary: `${m.full_name} acknowledged ${pol.code} ${pol.title} v${pol.version}`,
    entityType: 'policy', entityId: pol.id, entityRef: pol.code, details: { version: pol.version } });
  return { ok: true };
}

// ---------------------------------------------------------------- delegation, notifications
export function delegate(tx: Tx, org: string, to: string | null, until: number | null, reason: string | null): string {
  const m = me(tx, org);
  requirePerm(tx, m, 'authority.delegate', 'Delegating approval authority');
  const target = tx.db.employees.find(e => e.id === to && e.org_id === org && e.active);
  if (!target) invalid('delegate must be an active employee of this organisation');
  const tgt = target as Employee;
  if (tgt.id === m.id) invalid('cannot delegate to yourself');
  if (until !== null && (until <= tx.now || until > tx.now + 30 * 24 * HOUR_US)) invalid('delegation must end within 30 days');
  if (trimEmpty(reason)) invalid('a reason is required');
  if (until === null) dbError('null value in column "valid_until" of relation "delegations" violates not-null constraint');
  const id = tx.uuid();
  tx.db.delegations.push({ id, org_id: org, from_employee: m.id, to_employee: tgt.id, role_id: m.role_id, reason: reason as string, valid_from: nowTs(tx),
    valid_until: pgTs(until as number), granted_by: m.id, revoked_at: null });
  log(tx, { org, actor: m.id, stage: 'governance', event: 'authority_delegated',
    summary: `${m.full_name} (${s(roleName(tx, m.role_id))}) delegated approval authority to ${tgt.full_name} until ${parisDayMonthTime(display(tx, until as number))}: ${s(reason)}`,
    entityType: 'delegation', entityId: id, next: 'active', details: { role: m.role_id, to: tgt.id } });
  notify(tx, org, tgt.id, 'delegation', 'Authority delegated to you', `${m.full_name} delegated ${s(roleName(tx, m.role_id))} approval authority to you: ${s(reason)}`, 'delegation', id);
  return id;
}

export function revokeDelegation(tx: Tx, id: string | null): string {
  const d = tx.db.delegations.find(x => x.id === id);
  if (!d) notFound();
  const del = d as NonNullable<typeof d>;
  const m = me(tx, del.org_id);
  if (m.id !== del.from_employee && !hasPerm(tx, m.id, 'org.admin')) denied('only the delegator or an administrator can revoke');
  if (del.revoked_at === null) del.revoked_at = nowTs(tx);
  log(tx, { org: del.org_id, actor: m.id, stage: 'governance', event: 'delegation_revoked',
    summary: `Delegation from ${s(empName(tx, del.from_employee))} to ${s(empName(tx, del.to_employee))} revoked`, entityType: 'delegation', entityId: del.id, prev: 'active', next: 'revoked' });
  return 'revoked';
}

export function notificationsMark(tx: Tx, ids: (number | null)[] | null, mode: string | null): number {
  if (!tx.userEmployeeId) authError('sign-in required');
  const mine = new Set(myEmployees(tx).map(e => e.id));
  let n = 0;
  if (mode === 'read') {
    for (const x of tx.db.notifications) if ((ids === null || ids.includes(x.id)) && mine.has(x.recipient)) { x.read_at = x.read_at ?? nowTs(tx); n++; }
  } else if (mode === 'shown') {
    for (const x of tx.db.notifications) if (ids !== null && ids.includes(x.id) && mine.has(x.recipient)) { x.browser_shown_at = x.browser_shown_at ?? nowTs(tx); n++; }
  } else invalid('mode');
  return n;
}

// ---------------------------------------------------------------- administration
export function adminEmployeeSave(tx: Tx, org: string, p: JsonObject): string {
  const m = me(tx, org);
  requirePerm(tx, m, 'org.admin', 'Managing employees');
  const role = field(p, 'role_id');
  const r = tx.db.roles.find(x => x.id === role && x.org_id === org);
  if (!r) invalid('unknown role for this organisation');
  const dept = nullif(field(p, 'department_id')) ?? (r as NonNullable<typeof r>).department_id;
  const manager = toUuid(nullif(field(p, 'manager_id')));
  if (nullif(field(p, 'id')) === null) {
    if (trimEmpty(field(p, 'full_name'))) invalid('name is required');
    fkEmployee(tx, manager, 'employees', 'manager_id');
    const id = tx.uuid();
    tx.db.employees.push({ id, org_id: org, full_name: field(p, 'full_name') as string, email: nullif(field(p, 'email')), role_id: role as string, department_id: dept,
      manager_id: manager, active: true, is_student: false, note: 'Directory record created by administrator', created_at: nowTs(tx), has_login: false });
    log(tx, { org, actor: m.id, stage: 'admin', event: 'employee_added', summary: `${s(field(p, 'full_name'))} added as ${s(roleName(tx, role))}`,
      entityType: 'employee', entityId: id, entityRef: field(p, 'full_name') });
    return id;
  }
  const oldId = toUuid(field(p, 'id'));
  const old = tx.db.employees.find(e => e.id === oldId && e.org_id === org);
  if (!old) notFound('employee');
  const emp = old as Employee;
  if (emp.id === m.id && role !== emp.role_id) invalid('you cannot change your own role');
  const before = { full_name: emp.full_name, role_id: emp.role_id };
  fkEmployee(tx, manager, 'employees', 'manager_id');
  emp.role_id = role as string; emp.department_id = dept; emp.manager_id = manager ?? emp.manager_id; emp.full_name = nullif(field(p, 'full_name')) ?? emp.full_name;
  log(tx, { org, actor: m.id, stage: 'admin', event: 'employee_role_changed',
    summary: `${before.full_name}: role ${s(roleName(tx, before.role_id))} → ${s(roleName(tx, role))}`, entityType: 'employee', entityId: emp.id, entityRef: before.full_name,
    prev: before.role_id, next: role, details: { department: dept } });
  return emp.id;
}

export function adminRuleSave(tx: Tx, org: string, p: JsonObject): number {
  const m = me(tx, org);
  requirePerm(tx, m, 'org.admin', 'Changing approval policy');
  const approver = field(p, 'approver_role_id');
  if (!tx.db.roles.some(r => r.id === approver && r.org_id === org)) invalid('approver role');
  if (trimEmpty(field(p, 'rationale'))) invalid('a policy rationale is required');
  const intOr = (k: string, d: number) => toInt(field(p, k)) ?? d;
  const checkRule = (rule: { min_severity: number; max_severity: number; min_asset_criticality: number; in_emergency: string }) => {
    for (const [k, v] of [['min_severity', rule.min_severity], ['max_severity', rule.max_severity], ['min_asset_criticality', rule.min_asset_criticality]] as [string, number][]) {
      if (v < 1 || v > 4) dbError(`new row for relation "approval_rules" violates check constraint "approval_rules_${k}_check"`);
    }
    if (!['post_review', 'still_required'].includes(rule.in_emergency)) dbError('new row for relation "approval_rules" violates check constraint "approval_rules_in_emergency_check"');
  };
  if (nullif(field(p, 'id')) === null) {
    const type = field(p, 'action_type');
    if (!tx.db.action_types.some(t => t.org_id === org && t.code === type)) dbError('insert or update on table "approval_rules" violates foreign key constraint "approval_rules_org_id_action_type_fkey"');
    const rule = {
      id: tx.db.counters.approval_rule++, org_id: org, action_type: type as string, step: intOr('step', 1), approver_role_id: approver as string,
      min_severity: intOr('min_severity', 1), max_severity: intOr('max_severity', 4), min_asset_criticality: intOr('min_asset_criticality', 1),
      min_amount: toNumeric(field(p, 'min_amount')) ?? 0, in_emergency: field(p, 'in_emergency') ?? 'post_review', rationale: field(p, 'rationale') as string,
      active: true, updated_at: nowTs(tx),
    };
    checkRule(rule);
    tx.db.approval_rules.push(rule);
    log(tx, { org, actor: m.id, stage: 'admin', event: 'policy_rule_created', summary: `Approval rule #${rule.id} created for ${s(type)}: ${s(roleName(tx, approver))}`,
      entityType: 'approval_rule', entityId: String(rule.id), details: p });
    return rule.id;
  }
  const ruleId = toInt(field(p, 'id'));
  const old = tx.db.approval_rules.find(r => r.id === ruleId && r.org_id === org);
  if (!old) notFound('rule');
  const rule = old as NonNullable<typeof old>;
  const before = { ...rule };
  const next = {
    approver_role_id: approver as string, step: intOr('step', rule.step), min_severity: intOr('min_severity', rule.min_severity), max_severity: intOr('max_severity', rule.max_severity),
    min_asset_criticality: intOr('min_asset_criticality', rule.min_asset_criticality), min_amount: toNumeric(field(p, 'min_amount')) ?? rule.min_amount,
    in_emergency: field(p, 'in_emergency') ?? rule.in_emergency, active: toBool(field(p, 'active')) ?? rule.active, rationale: field(p, 'rationale') as string, updated_at: nowTs(tx),
  };
  checkRule(next);
  Object.assign(rule, next);
  log(tx, { org, actor: m.id, stage: 'admin', event: 'policy_rule_changed', summary: `Approval rule #${rule.id} (${rule.action_type}) changed by ${m.full_name}`,
    entityType: 'approval_rule', entityId: String(rule.id), details: { before, after: p } });
  return rule.id;
}

export function adminSetActive(tx: Tx, empId: string | null, active: boolean | null, reason: string | null): JsonObject {
  const e = tx.db.employees.find(x => x.id === empId);
  if (!e) notFound();
  const emp = e as Employee;
  const m = me(tx, emp.org_id);
  requirePerm(tx, m, 'org.admin', 'Activating or deactivating accounts');
  if (emp.id === m.id) invalid('you cannot deactivate your own account');
  if (trimEmpty(reason)) invalid('a reason is required');
  if (active === null) dbError('null value in column "active" of relation "employees" violates not-null constraint');
  emp.active = active as boolean;
  if (!active) for (const d of tx.db.delegations) if ((d.from_employee === emp.id || d.to_employee === emp.id) && d.revoked_at === null) d.revoked_at = nowTs(tx);
  const open: Json[] = tx.db.actions.filter(a => !a.archived && !CLOSED.includes(a.status) && (a.executor_id === emp.id || a.accountable_id === emp.id || a.responsible_id === emp.id))
    .map(a => ({ ref: a.ref, id: a.id, title: a.title, status: a.status, as: a.executor_id === emp.id ? 'executor' : a.accountable_id === emp.id ? 'accountable' : 'responsible' }));
  log(tx, { org: emp.org_id, actor: m.id, stage: 'admin', event: active ? 'account_reactivated' : 'account_deactivated',
    summary: `${emp.full_name} ${active ? 'reactivated' : 'deactivated'}: ${s(reason)} (${open.length} open assignment(s) need reassignment)`, entityType: 'employee', entityId: emp.id,
    entityRef: emp.full_name, prev: active ? 'inactive' : 'active', next: active ? 'active' : 'inactive', details: { open_items: open } });
  return { open_items: open };
}

export function adminSetPermission(tx: Tx, roleId: string | null, perm: string | null, grant: boolean | null): string {
  const r = tx.db.roles.find(x => x.id === roleId);
  if (!r) notFound('role');
  const role = r as NonNullable<typeof r>;
  const m = me(tx, role.org_id);
  requirePerm(tx, m, 'org.admin', 'Changing role permissions');
  if (perm === null) dbError('null value in column "permission" of relation "role_permissions" violates not-null constraint');
  if ((perm as string).includes('#')) invalid('invalid permission');
  if (perm === 'org.admin' && roleId === m.role_id && grant === false) invalid('you cannot remove your own administration right');
  if (grant) { if (!role.permissions.includes(perm as string)) role.permissions = pgSort([...role.permissions, perm as string], collate); }
  else role.permissions = role.permissions.filter(x => x !== perm);
  log(tx, { org: role.org_id, actor: m.id, stage: 'admin', event: grant ? 'permission_granted' : 'permission_revoked',
    summary: `${role.name} ${grant ? 'granted' : 'lost'} "${perm}"`, entityType: 'role', entityId: role.id });
  return 'ok';
}

export function platformSetLevel(): never {
  return denied(NOT_IN_DEMO('platform access levels belong to the real sign-in accounts of the authenticated workspace, which the public demo does not have'));
}

// ---------------------------------------------------------------- scenarios
export function scenarioStart(tx: Tx, code: string | null): string {
  const sc = tx.db.scenarios.find(x => x.code === code);
  if (!sc) notFound('scenario');
  const scenario = sc as NonNullable<typeof sc>;
  const m = me(tx, scenario.org_id);
  requirePerm(tx, m, 'scenario.run', 'Starting a scenario');
  if (tx.db.scenario_runs.some(r => r.scenario_code === code && ['active', 'paused'].includes(r.status))) denied('this scenario is already running — complete or reset it first.');
  const runId = tx.uuid();
  tx.db.scenario_runs.push({ id: runId, scenario_code: scenario.code, org_id: scenario.org_id, status: 'active', started_by: m.id, started_at: nowTs(tx), ended_at: null });
  const seed = (scenario.steps[0]?.seed ?? {}) as JsonObject;
  const analyst = sortRows(roleHolders(tx, scenario.org_id, field(seed, 'assign_role')), [e => e.is_student, 'desc'])[0]?.id ?? null;
  const ref = nextRef(tx, 'INC');
  const inc = newIncident(tx, {
    org_id: scenario.org_id, ref, title: field(seed, 'title') as string, description: field(seed, 'description'), category: field(seed, 'category') as string,
    severity: toInt(field(seed, 'severity')) as number, source: 'simulated_detection_feed', assigned_to: analyst, risk_id: field(seed, 'risk_id'),
    asset_id: field(seed, 'asset_id'), financial_exposure: toNumeric(nullif(field(seed, 'financial_exposure'))), scenario_run_id: runId,
  });
  log(tx, { org: scenario.org_id, actor: m.id, stage: 'scenario', event: 'scenario_started', summary: `Scenario "${scenario.title}" started by ${m.full_name}`,
    entityType: 'scenario', entityId: runId, entityRef: scenario.code, next: 'active', risk: field(seed, 'risk_id'), incident: inc.id, asset: field(seed, 'asset_id'), run: runId });
  log(tx, { org: scenario.org_id, actor: null, stage: 'detect', event: 'incident_detected',
    summary: `${ref} detected by automated rule (simulated feed): ${s(field(seed, 'title'))}`, entityType: 'incident', entityId: inc.id, entityRef: ref, next: 'new',
    details: { detection_rule: field(seed, 'rule'), feed: 'SIMULATED' }, risk: field(seed, 'risk_id'), incident: inc.id, asset: field(seed, 'asset_id'), run: runId });
  notify(tx, scenario.org_id, analyst, 'incident_assigned', 'New incident to investigate: ' + ref, field(seed, 'title'), 'incident', inc.id);
  return runId;
}

export function scenarioReset(tx: Tx, runId: string | null, reason: string | null): string {
  const r = tx.db.scenario_runs.find(x => x.id === runId);
  if (!r) notFound();
  const run = r as NonNullable<typeof r>;
  const m = me(tx, run.org_id);
  requirePerm(tx, m, 'scenario.run', 'Resetting a scenario');
  if (run.status === 'reset') return 'reset';
  let nInc = 0, nAct = 0;
  for (const i of tx.db.incidents) if (i.scenario_run_id === run.id) { i.archived = true; nInc++; }
  const runActions = new Set<string>();
  for (const a of tx.db.actions) if (a.scenario_run_id === run.id) { a.archived = true; nAct++; runActions.add(a.id); }
  for (const ap of tx.db.approvals) if (['pending', 'waiting', 'info_requested'].includes(ap.status) && runActions.has(ap.action_id)) ap.status = 'superseded';
  for (const dc of tx.db.device_commands) if (dc.status === 'queued' && runActions.has(dc.action_id)) dc.status = 'cancelled';
  const before = run.status;
  run.status = 'reset'; run.ended_at = nowTs(tx);
  log(tx, { org: run.org_id, actor: m.id, stage: 'scenario', event: 'scenario_reset',
    summary: `Scenario ${run.scenario_code} reset by ${m.full_name} — ${nInc} incident(s) and ${nAct} action(s) archived read-only; audit history retained. Reason: ${reason === null || reason === '' ? 'demonstration reset' : reason}`,
    entityType: 'scenario', entityId: run.id, entityRef: run.scenario_code, prev: before, next: 'reset', run: run.id });
  return 'reset';
}

export function scenarioSetPaused(tx: Tx, runId: string | null, paused: boolean | null): string {
  const r = tx.db.scenario_runs.find(x => x.id === runId);
  if (!r) notFound();
  const run = r as NonNullable<typeof r>;
  const m = me(tx, run.org_id);
  requirePerm(tx, m, 'scenario.run', 'Pausing a scenario');
  if (!['active', 'paused'].includes(run.status)) denied(`run is ${run.status}`);
  const before = run.status;
  run.status = paused ? 'paused' : 'active';
  log(tx, { org: run.org_id, actor: m.id, stage: 'scenario', event: paused ? 'scenario_paused' : 'scenario_resumed',
    summary: `Scenario ${run.scenario_code} ${paused ? 'paused' : 'resumed'} by ${m.full_name}`, entityType: 'scenario', entityId: run.id, entityRef: run.scenario_code,
    prev: before, next: run.status, run: run.id });
  return run.status;
}

