/**
 * Ports of the grc.* helper functions of the NOVATECH Supabase schema (check_op, next_step,
 * action_row, evaluate_criteria, route helpers, JSON builders...). Each function mirrors its SQL
 * counterpart clause for clause, including SQL null semantics, so the simulated RPCs return what
 * production returns for the same data.
 */
import type { Action, Approval, Control, Criterion, Employee, Incident, Json, JsonObject, Policy, Risk, Vendor, ActionType } from './types.ts';
import type { Tx } from './store.ts';
import { activeDelegations, employee } from './store.ts';
import { and3, collate, dayNumber, lt3, pgSort, sortRows, tsMicros, type Bool3 } from './pg.ts';

/** SQL format('%s', v): NULL renders as an empty string. */
export const s = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'number' ? numText(v) : String(v));
/** numeric::text for the values the demo handles. */
export function numText(n: number): string {
  if (Number.isInteger(n) || !/e/i.test(String(n))) return String(n);
  return n.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
}
/** string_agg(x, sep) without ORDER BY: input order, NULL when there is nothing to aggregate. */
export const agg = (items: (string | null | undefined)[], sep = ', '): string | null => {
  const v = items.filter((x): x is string => x !== null && x !== undefined);
  return v.length ? v.join(sep) : null;
};
export const ts = (iso: string | null | undefined): number | null => (iso ? tsMicros(iso) : null);
export const day = (date: string | null | undefined): number | null => (date ? dayNumber(date) : null);
export const CLOSED = ['completed', 'cancelled', 'rejected'];

// ---------------------------------------------------------------- people and roles
export const roleName = (tx: Tx, id: string | null | undefined): string | null => (id ? tx.db.roles.find(r => r.id === id)?.name ?? null : null);
export const empName = (tx: Tx, id: string | null | undefined): string | null => employee(tx, id)?.full_name ?? null;
export const deptName = (tx: Tx, id: string | null | undefined): string | null => (id ? tx.db.departments.find(d => d.id === id)?.name ?? null : null);

/** grc.emp_json */
export function empJson(tx: Tx, id: string | null | undefined): JsonObject | null {
  const e = employee(tx, id);
  if (!e) return null;
  return { id: e.id, name: e.full_name, role: roleName(tx, e.role_id), role_id: e.role_id, department: deptName(tx, e.department_id), is_student: e.is_student, active: e.active };
}
export const rolePermissions = (tx: Tx, roleId: string | null | undefined): string[] => (roleId ? tx.db.roles.find(r => r.id === roleId)?.permissions ?? [] : []);
/** grc.has_perm: an active employee whose role holds the permission. */
export function hasPerm(tx: Tx, empId: string | null | undefined, perm: string): boolean {
  const e = employee(tx, empId);
  return !!e && e.active && rolePermissions(tx, e.role_id).includes(perm);
}
/** Active employees of an organisation whose role holds a permission (heap order). */
export const holders = (tx: Tx, org: string, perm: string): Employee[] =>
  tx.db.employees.filter(e => e.org_id === org && e.active && rolePermissions(tx, e.role_id).includes(perm));
/** Active holders of a role (heap order). */
export const roleHolders = (tx: Tx, org: string, roleId: string | null | undefined): Employee[] =>
  tx.db.employees.filter(e => e.org_id === org && e.role_id === roleId && e.active);
/** grc.authority_via: the employee whose authority p_emp exercises for p_role (themselves, or a delegator). */
export function authorityVia(tx: Tx, empId: string | null | undefined, roleId: string | null | undefined): string | null {
  if (!empId || !roleId) return null;
  const e = employee(tx, empId);
  if (e && e.active && e.role_id === roleId) return e.id;
  const d = activeDelegations(tx).find(x => x.to_employee === empId && x.role_id === roleId && !!employee(tx, x.from_employee));
  return d ? d.from_employee : null;
}

// ---------------------------------------------------------------- risks
export type VRisk = {
  id: string; org_id: string; code: string; legacy_id: string | null; title: string; category: string; department_id: string | null; description: string | null;
  likelihood: number | null; impact: number | null; score: number | null; owner_id: string | null; treatment: string | null;
  residual_likelihood: number | null; residual_impact: number | null; residual_target_score: number | null; priority_rank: number | null;
  origin: string; status: string;
};
/** One row of the grc.v_risks view (the legacy register supplies likelihood and impact where linked). */
export function vRisk(r: Risk): VRisk {
  const l = r.legacy_id ? r.legacy : null;
  const likelihood = l?.likelihood ?? r.likelihood, impact = l?.impact ?? r.impact;
  return {
    id: r.id, org_id: r.org_id, code: r.code, legacy_id: r.legacy_id, title: r.title, category: r.category, department_id: r.department_id,
    description: r.description, likelihood, impact, score: likelihood !== null && impact !== null ? likelihood * impact : null, owner_id: r.owner_id,
    treatment: r.treatment ?? l?.treatment ?? null, residual_likelihood: r.residual_likelihood, residual_impact: r.residual_impact,
    residual_target_score: l?.residual_target_score ?? null, priority_rank: l?.priority_rank ?? null, origin: r.origin, status: r.status,
  };
}
/**
 * grc.v_risks rows. Filtered by organisation, Postgres reads them through the unique (org_id, code)
 * index, so they arrive in code order; that input order decides how ties sort, so it is kept here.
 */
export const vRisks = (tx: Tx, org?: string): VRisk[] => {
  const rows = tx.db.risks.filter(r => !org || r.org_id === org).map(vRisk);
  return org ? pgSort(rows, (a, b) => collate(a.code, b.code)) : rows;
};
export const vRiskById = (tx: Tx, id: string | null | undefined): VRisk | null => {
  const r = id ? tx.db.risks.find(x => x.id === id) : undefined;
  return r ? vRisk(r) : null;
};
/** grc.score_level (no STRICT: a NULL score is "Low"). */
export function scoreLevel(score: number | null): string {
  if (score === null) return 'Low';
  return score >= 12 ? 'Critical' : score >= 8 ? 'High' : score >= 4 ? 'Moderate' : 'Low';
}

// ---------------------------------------------------------------- KRIs
/** public.classify_kri_value */
export function classifyKri(direction: string, value: number | null, warning: number | null, critical: number | null): string {
  const ge = (a: number | null, b: number | null) => a !== null && b !== null && a >= b;
  const le = (a: number | null, b: number | null) => a !== null && b !== null && a <= b;
  if (direction === 'higher_is_worse' && ge(value, critical)) return 'critical';
  if (direction === 'higher_is_worse' && ge(value, warning)) return 'warning';
  if (direction === 'lower_is_worse' && le(value, critical)) return 'critical';
  if (direction === 'lower_is_worse' && le(value, warning)) return 'warning';
  return 'normal';
}
/** The latest reading of a KRI (recorded_at desc, id desc). */
export function latestReading(tx: Tx, kriId: string) {
  const rows = tx.db.kri_readings.filter(r => r.kri_id === kriId);
  return rows.length ? sortRows(rows, [r => ts(r.recorded_at), 'desc'], [r => r.id, 'desc'])[0] : undefined;
}
/** grc.kri_state */
export function kriState(tx: Tx, legacy: string | null | undefined): JsonObject | null {
  if (!legacy) return null;
  const k = tx.db.kri_definitions.find(x => x.risk_id === legacy);
  if (!k) return null;
  const rd = latestReading(tx, k.id);
  const value = rd ? rd.value : null;
  return {
    kri: k.name, unit: k.unit, value, warning: k.warning_threshold, critical: k.critical_threshold, direction: k.direction,
    recorded_at: rd ? rd.recorded_at : null, level: classifyKri(k.direction, value, k.warning_threshold, k.critical_threshold),
  };
}
/** grc.kri_list */
export function kriList(tx: Tx, org: string): Json[] {
  const rows = vRisks(tx, org).filter(v => v.legacy_id !== null && kriState(tx, v.legacy_id) !== null);
  return sortRows(rows, [v => v.code]).map(v => ({ risk_id: v.id, code: v.code, title: v.title, ...(kriState(tx, v.legacy_id) ?? {}) }));
}
/** grc.appetite_view */
export function appetiteView(tx: Tx, org: string): Json[] {
  return sortRows(tx.db.appetite.filter(a => a.org_id === org), [a => a.sort]).map(a => {
    const risks = tx.db.risks.filter(r => r.appetite_id === a.id).map(vRisk);
    return {
      ...a,
      risks: sortRows(risks, [v => v.score, 'desc']).map(v => ({ id: v.id, code: v.code, title: v.title, score: v.score, breach: v.score === null ? null : v.score > a.max_score })),
    };
  });
}

// ---------------------------------------------------------------- controls, compliance
export function controlLastTest(tx: Tx, controlId: string): JsonObject | null {
  const rows = tx.db.control_tests.filter(t => t.control_id === controlId);
  if (!rows.length) return null;
  const t = sortRows(rows, [x => ts(x.run_at), 'desc'], [x => x.id, 'desc'])[0];
  return { result: t.result, run_at: t.run_at, detail: t.detail, source: t.source, metrics: t.metrics, tester: empName(tx, t.tester) };
}
export function controlJson(tx: Tx, c: Control): JsonObject {
  const reqs = tx.db.control_requirements.filter(([cid]) => cid === c.id).flatMap(([, rid]) => {
    const r = tx.db.requirements.find(x => x.id === rid);
    const f = r ? tx.db.frameworks.find(x => x.id === r.framework_id) : undefined;
    return r && f ? [{ r, f }] : [];
  });
  const risks = tx.db.control_risks.filter(([cid]) => cid === c.id).flatMap(([, rid, pct]) => {
    const v = vRiskById(tx, rid);
    return v ? [{ v, pct }] : [];
  });
  return {
    ...c,
    owner_role: roleName(tx, c.owner_role_id),
    owner: agg(roleHolders(tx, c.org_id, c.owner_role_id).map(e => e.full_name)),
    requirements: sortRows(reqs, [x => x.f.sort], [x => x.r.sort]).map(({ r, f }) => ({ id: r.id, ref: r.ref, title: r.title, framework: f.code })),
    risks: sortRows(risks, [x => x.v.code]).map(({ v, pct }) => ({ id: v.id, code: v.code, title: v.title, score: v.score, reduction: pct })),
    last_test: controlLastTest(tx, c.id),
  };
}
/** grc.req_status */
export function reqStatus(tx: Tx, reqId: string): string {
  const controls = tx.db.control_requirements.filter(([, rid]) => rid === reqId).flatMap(([cid]) => tx.db.controls.filter(c => c.id === cid));
  if (controls.some(c => c.status === 'implemented' && c.operating_eff === 'effective')) return 'met';
  if (controls.some(c => ['implemented', 'in_progress'].includes(c.status) && (['partial', 'not_assessed'].includes(c.operating_eff) || c.design_eff === 'effective'))) return 'partial';
  return 'gap';
}
export const effFactor = (p: string) => (p === 'effective' ? 1 : p === 'partial' ? 0.5 : p === 'not_assessed' ? 0.25 : 0);

// ---------------------------------------------------------------- vendors, policies
export function vendorJson(tx: Tx, v: Vendor): JsonObject {
  const r = vRiskById(tx, v.risk_id);
  const today = dayNumber(tx.today);
  return {
    ...v,
    owner_role: roleName(tx, v.owner_role_id),
    owner: agg(roleHolders(tx, v.org_id, v.owner_role_id).map(e => e.full_name)),
    risk: r ? { id: r.id, code: r.code, title: r.title, score: r.score } : null,
    review_overdue: v.next_review !== null && dayNumber(v.next_review) < today,
    contract_expired: v.contract_end !== null && dayNumber(v.contract_end) < today,
    processes: tx.db.processes.filter(p => (p.dependencies?.vendors ?? []).includes(v.id)).map(p => ({ id: p.id, name: p.name, tier: p.tier })),
  };
}
/** grc.policy_audience: active employees with a sign-in account in the audience. */
export function policyAudience(tx: Tx, org: string, aud: string): string[] {
  return tx.db.employees.filter(e => {
    if (e.org_id !== org || !e.active || !e.has_login) return false;
    const level = tx.db.roles.find(r => r.id === e.role_id)?.authority_level ?? 0;
    return aud === 'all' || (aud === 'finance' && e.department_id === org + '-FIN') || (aud === 'managers' && level >= 3)
      || (aud === 'it' && [org + '-IT', org + '-CYB', org + '-SOC'].includes(e.department_id ?? ''));
  }).map(e => e.id);
}
export function policyJson(tx: Tx, p: Policy, meId: string | null): JsonObject {
  const audience = policyAudience(tx, p.org_id, p.audience);
  const atts = tx.db.policy_attestations.filter(a => a.policy_id === p.id && a.version === p.version);
  const mine = atts.find(a => a.employee_id === meId);
  const rest: JsonObject = { ...p };
  delete rest.body;
  return {
    ...rest,
    owner_role: roleName(tx, p.owner_role_id), approver_role: roleName(tx, p.approver_role_id),
    audience_size: audience.length,
    attested: atts.filter(a => audience.includes(a.employee_id)).length,
    in_audience: meId === null ? (audience.length ? null : false) : audience.includes(meId),
    my_attestation: mine ? mine.attested_at : null,
    review_overdue: p.review_date === null ? null : dayNumber(p.review_date) < dayNumber(tx.today),
  };
}

// ---------------------------------------------------------------- incidents, regulatory clocks
export function regJson(tx: Tx, incidentId: string): JsonObject | null {
  const i = tx.db.incidents.find(x => x.id === incidentId);
  if (!i) return null;
  const rows = tx.db.reg_notifications.filter(n => n.incident_id === i.id);
  return {
    aware_at: i.aware_at, regimes: i.regimes, personal_data: i.personal_data, significant: i.significant,
    notifications: sortRows(rows, [n => n.regime], [n => n.stage]).map(n => ({
      id: n.id, regime: n.regime, stage: n.stage, authority: n.authority, due_at: n.due_at, sent_at: n.sent_at, sent_by: empName(tx, n.sent_by), reference: n.reference,
    })),
  };
}

// ---------------------------------------------------------------- actions
export const actionType = (tx: Tx, org: string, code: string): ActionType | undefined => tx.db.action_types.find(t => t.org_id === org && t.code === code);
export const approvalsOf = (tx: Tx, actionId: string): Approval[] => tx.db.approvals.filter(x => x.action_id === actionId);
/** The approval a decision would act on: pending, pre-approvals first, lowest step. */
export function pendingApproval(tx: Tx, a: Action, forDecision: boolean): Approval | undefined {
  const rows = approvalsOf(tx, a.id).filter(x => x.status === 'pending'
    && (!forDecision || (x.kind === 'pre' && ['awaiting_approval', 'escalated'].includes(a.status)) || x.kind === 'post_review'));
  return sortRows(rows, [x => x.kind === 'pre', 'desc'], [x => x.step])[0];
}

/** grc.is_executor_eligible */
export function isExecutorEligible(tx: Tx, a: Action, empId: string): boolean {
  if (a.executor_id !== null) return a.executor_id === empId;
  const t = actionType(tx, a.org_id, a.action_type);
  const e = employee(tx, empId);
  if (!t || !e || !e.active) return false;
  return (t.executor_role_ids.length === 0 && a.responsible_id === empId) || t.executor_role_ids.includes(e.role_id);
}

/** grc.check_op: why an employee may not perform an operation on an action (null when allowed). */
export function checkOp(tx: Tx, a: Action, empId: string, op: string): string | null {
  const e = employee(tx, empId);
  const t = actionType(tx, a.org_id, a.action_type);
  if (a.archived) return 'This action belongs to a reset scenario run and is read-only.';
  if (tx.db.scenario_runs.some(r => r.id === a.scenario_run_id && r.status === 'paused')) return 'The scenario is paused by the coordinator.';
  const has = (perm: string) => hasPerm(tx, empId, perm);

  if (op === 'submit') {
    if (!['draft', 'reopened'].includes(a.status)) return 'Only draft or reopened actions can be submitted.';
    if (empId !== a.requested_by && !has('action.manage_all')) return 'Only the requester or the Risk Coordinator can submit.';
    return null;
  }
  if (op === 'respond_info') {
    if (a.status !== 'submitted' || a.info_request === null) return 'No information request is open.';
    if (empId !== a.requested_by) return 'Only the requester can respond to the information request.';
    return null;
  }
  if (op === 'cancel') {
    if (!['draft', 'submitted', 'under_review', 'awaiting_approval', 'approved', 'scheduled', 'escalated', 'blocked', 'reopened'].includes(a.status)) {
      return 'Actions cannot be cancelled once execution has started or after closure.';
    }
    if (empId !== a.requested_by && empId !== a.accountable_id && !has('action.reassign')) return 'Only the requester, the accountable manager or the Risk Coordinator can cancel.';
    return null;
  }
  if (op === 'assess') {
    if (a.status !== 'under_review') return 'The action is not awaiting assessment.';
    if (!t?.assessor_role_id || authorityVia(tx, empId, t.assessor_role_id) === null) return `Assessment is reserved for the ${s(roleName(tx, t?.assessor_role_id))}.`;
    if (empId === a.requested_by) return 'The requester cannot assess their own request.';
    return null;
  }
  if (['approve', 'reject', 'request_info', 'escalate'].includes(op)) {
    const ap = pendingApproval(tx, a, true);
    if (!ap) {
      if (a.status === 'under_review') return `Waiting for assessment by the ${s(roleName(tx, t?.assessor_role_id))} before approval.`;
      return 'No approval decision is pending on this action.';
    }
    if (authorityVia(tx, empId, ap.approver_role_id) === null) {
      return `Policy requires the ${s(roleName(tx, ap.approver_role_id))} for this decision. Your role (${s(roleName(tx, e?.role_id))}) has no approval authority here.`;
    }
    if (empId === a.requested_by) return 'Separation of duties: you requested this action and cannot approve it.';
    if (empId === a.executor_id) return 'Separation of duties: the designated executor cannot approve.';
    if (approvalsOf(tx, a.id).some(x => x.decided_by === empId && x.status === 'approved' && x.id !== ap.id)) return 'Dual control: a different person must approve this step.';
    if (op === 'escalate' && !tx.db.roles.find(r => r.id === ap.approver_role_id)?.reports_to) return 'This authority has no higher level to escalate to.';
    return null;
  }
  if (op === 'emergency') {
    if (!['submitted', 'under_review', 'awaiting_approval', 'escalated'].includes(a.status)) return 'Emergency authorisation is only possible before approval is complete.';
    if (!t?.emergency_allowed) return `Company policy does not allow emergency execution of "${s(t?.name)}".`;
    if (!has('action.emergency')) return 'Only roles holding emergency authority (RSSI, CEO) can invoke the emergency procedure.';
    return null;
  }
  if (op === 'schedule' || op === 'start') {
    if (op === 'schedule' && a.status !== 'approved') return 'Only approved actions can be scheduled.';
    if (op === 'start' && !['approved', 'scheduled'].includes(a.status)) {
      const waiting = sortRows(approvalsOf(tx, a.id).filter(x => x.kind === 'pre' && ['pending', 'waiting', 'info_requested', 'escalated'].includes(x.status)), [x => x.step]);
      if (waiting.length) return 'Execution blocked: approval still required from ' + waiting.map(x => `${s(roleName(tx, x.approver_role_id))} (step ${x.step})`).join(', ') + '.';
      return `Execution is not possible while the action is "${a.status}".`;
    }
    if (!isExecutorEligible(tx, a, empId)) {
      if (a.executor_id !== null) return `Only the assigned executor (${s(empName(tx, a.executor_id))}) can carry out this action.`;
      const roles = agg((t?.executor_role_ids ?? []).map(r => roleName(tx, r)), ' or ');
      return `Only ${roles ?? 'the responsible employee'} can execute "${s(t?.name)}".`;
    }
    if (approvalsOf(tx, a.id).some(x => x.decided_by === empId && x.status === 'approved')) return 'Separation of duties: you approved this action, so another authorised person must execute it.';
    const open = tx.db.actions.filter(d => a.depends_on.includes(d.id) && d.status !== 'completed').length;
    if (open > 0) return `Blocked by ${open} unfinished dependency action(s).`;
    if (a.execution_mode === 'device' && !tx.db.devices.some(dv => dv.asset_id === a.asset_id && dv.enabled)) return 'Device execution requested but the target device is not enrolled and enabled.';
    return null;
  }
  if (op === 'record_execution') {
    if (a.status !== 'in_progress') return 'Execution has not started.';
    if (empId !== a.executor_id) return 'Only the executor who started the work can record its result.';
    return null;
  }
  if (op === 'verify') {
    if (a.status !== 'awaiting_verification') return 'The action is not awaiting verification.';
    if (!has('action.verify')) return 'Your role cannot perform verification.';
    if (empId === a.executor_id) return 'Independence: the person who executed the action cannot verify it.';
    return null;
  }
  if (op === 'reopen') {
    if (!['completed', 'failed', 'rejected'].includes(a.status)) return 'Only completed, failed or rejected actions can be reopened.';
    if (empId !== a.accountable_id && !has('action.reassign')) return 'Only the accountable manager or the Risk Coordinator can reopen.';
    return null;
  }
  if (op === 'reassign') {
    if (['completed', 'cancelled'].includes(a.status)) return 'Closed actions cannot be reassigned.';
    if (!has('action.reassign')) return 'Only the Risk Coordinator (or a role with reassignment authority) can reassign.';
    return null;
  }
  return 'Unknown operation.';
}
/** grc.assert_op */
export function assertOp(tx: Tx, a: Action, empId: string, op: string): void {
  const reason = checkOp(tx, a, empId, op);
  if (reason !== null) throw new Error('DENIED: ' + reason);
}
export const OPS = ['submit', 'respond_info', 'cancel', 'assess', 'approve', 'reject', 'request_info', 'escalate', 'emergency', 'schedule', 'start', 'record_execution', 'verify', 'reopen', 'reassign'];
/** grc.ops_for */
export function opsFor(tx: Tx, a: Action, empId: string): JsonObject {
  const out: JsonObject = {};
  for (const op of OPS) { const reason = checkOp(tx, a, empId, op); out[op] = { allowed: reason === null, reason }; }
  return out;
}

/** grc.next_step */
export function nextStep(tx: Tx, a: Action): JsonObject {
  const t = actionType(tx, a.org_id, a.action_type);
  const ap = pendingApproval(tx, a, false);
  const names = (roleId: string | null | undefined) => agg(roleHolders(tx, a.org_id, roleId).map(e => e.full_name));
  const who = ap ? names(ap.approver_role_id) : null;
  const step = (stage: string, title: string | null, actor: string | null): JsonObject => ({ stage, title, actor });
  switch (a.status) {
    case 'draft': return step('assess', 'Submit for review', empName(tx, a.requested_by));
    case 'reopened': return step('assess', 'Revise and resubmit', empName(tx, a.requested_by));
    case 'submitted': return step('authorise', a.info_request !== null ? 'Provide the requested information' : 'Awaiting routing', empName(tx, a.requested_by));
    case 'under_review': {
      const rn = roleName(tx, t?.assessor_role_id);
      return step('assess', rn === null ? null : 'Assessment by ' + rn, names(t?.assessor_role_id));
    }
    case 'awaiting_approval': return step('authorise', `Approval by ${s(roleName(tx, ap?.approver_role_id))} (step ${s(ap?.step)})`, who);
    case 'escalated': return step('authorise', `Escalated decision: ${s(roleName(tx, ap?.approver_role_id))}`, who);
    case 'approved': {
      const execs = agg(tx.db.employees.filter(e => e.org_id === a.org_id && (t?.executor_role_ids ?? []).includes(e.role_id) && e.active).map(e => e.full_name));
      return step('execute', 'Ready for execution', empName(tx, a.executor_id) ?? execs);
    }
    case 'scheduled': return step('execute', 'Scheduled — start execution', empName(tx, a.executor_id));
    case 'in_progress': return step('execute', 'Record the execution result', empName(tx, a.executor_id));
    case 'awaiting_verification': {
      const names2 = [...new Set(holders(tx, a.org_id, 'action.verify').filter(e => e.id !== a.executor_id).map(e => e.full_name))];
      return step('verify', 'Independent verification', agg(pgSort(names2, collate)));
    }
    case 'completed':
      if (ap && ap.kind === 'post_review') {
        const rn = roleName(tx, ap.approver_role_id);
        return step('verify', rn === null ? null : 'Post-emergency review by ' + rn, who);
      }
      return step('done', 'Completed and verified', null);
    case 'failed': return step('execute', 'Execution failed — reopen or escalate', empName(tx, a.accountable_id));
    case 'rejected': return step('done', 'Rejected — no execution permitted', null);
    case 'cancelled': return step('done', 'Cancelled', null);
    case 'blocked': return step('execute', a.blocked_reason ?? 'Blocked', empName(tx, a.accountable_id));
    default: return step('assess', a.status, null);
  }
}

/** grc.action_row */
export function actionRow(tx: Tx, a: Action): JsonObject {
  const t = actionType(tx, a.org_id, a.action_type);
  const r = a.risk_id ? tx.db.risks.find(x => x.id === a.risk_id) : undefined;
  const i = a.incident_id ? tx.db.incidents.find(x => x.id === a.incident_id) : undefined;
  const asset = a.asset_id ? tx.db.assets.find(x => x.id === a.asset_id) : undefined;
  const overdue: Bool3 = and3(lt3(ts(a.deadline), tx.now), !CLOSED.includes(a.status));
  return {
    id: a.id, ref: a.ref, title: a.title, action_type: a.action_type, type_name: t?.name ?? null, domain: t?.domain ?? null,
    status: a.status, priority: a.priority, severity: a.severity, amount: a.amount, emergency: a.emergency,
    risk_id: a.risk_id, risk_code: r?.code ?? null, incident_id: a.incident_id, incident_ref: i?.ref ?? null, asset: asset?.name ?? null,
    department: deptName(tx, r?.department_id), deadline: a.deadline, progress: a.progress, execution_mode: a.execution_mode, archived: a.archived,
    requested_by: empName(tx, a.requested_by), accountable: empName(tx, a.accountable_id), executor: empName(tx, a.executor_id),
    next: nextStep(tx, a), updated_at: a.updated_at, overdue,
  };
}

/** grc.evaluate_criteria */
export function evaluateCriteria(tx: Tx, a: Action, verifier: string | null, confirmations: JsonObject = {}): JsonObject[] {
  const out: JsonObject[] = [];
  for (const c of (Array.isArray(a.criteria) ? a.criteria : []) as Criterion[]) {
    let ok: Bool3 = false, detail: string | null = null;
    switch (c.type) {
      case 'execution_evidence':
        ok = tx.db.evidence.some(ev => ev.action_id === a.id && ['execution_record', 'device_report'].includes(ev.kind) && (ev.data as JsonObject)?.outcome === 'success');
        detail = ok ? 'Execution record with a successful outcome is on file.' : 'No successful execution record.';
        break;
      case 'independent_verifier':
        ok = (verifier ?? null) !== (a.executor_id ?? null);
        detail = `Executor: ${s(empName(tx, a.executor_id))} · Verifier: ${s(empName(tx, verifier))}`;
        break;
      case 'kri_normal': {
        const st = kriState(tx, c.risk ?? null);
        ok = st === null ? null : st.level === 'normal';
        detail = `${s(st?.kri)} latest value ${s(st?.value)} ${s(st?.unit)} (warning ${s(st?.warning)}) → ${String(st?.level ?? 'no data').toUpperCase()}`;
        break;
      }
      case 'post_reviews_approved':
        ok = !approvalsOf(tx, a.id).some(x => x.kind === 'post_review' && x.status !== 'approved');
        detail = !a.emergency ? 'Not an emergency action — no post-review needed.' : ok ? 'Post-emergency review approved.' : 'Post-emergency review still outstanding.';
        if (!a.emergency) ok = true;
        break;
      case 'device_ack': {
        const dc = tx.db.device_commands.find(d => d.action_id === a.id);
        ok = dc ? dc.status === 'executed' : null;
        detail = dc ? 'Device command status: ' + dc.status : 'No command was sent to an enrolled device.';
        break;
      }
      case 'attestation': {
        const v = c.key === undefined ? undefined : confirmations[c.key];
        ok = v === true || (typeof v === 'string' && ['true', 't', 'yes', 'y', 'on', '1'].includes(v.trim().toLowerCase()));
        detail = ok ? 'Confirmed by verifier.' : 'Not confirmed by verifier.';
        break;
      }
      default: detail = 'Unknown criterion type.';
    }
    out.push({ key: c.key ?? null, label: c.label ?? null, type: c.type ?? null, passed: ok, detail });
  }
  return out;
}

/** grc.matching_rules (step, id order) */
export function matchingRules(tx: Tx, org: string, type: string, severity: number | null, assetCrit: number | null, amount: number | null) {
  const rows = tx.db.approval_rules.filter(r => r.org_id === org && r.action_type === type && r.active && severity !== null
    && severity >= r.min_severity && severity <= r.max_severity && (assetCrit ?? 1) >= r.min_asset_criticality && (amount ?? 0) >= r.min_amount);
  return sortRows(rows, [r => r.step], [r => r.id]);
}

export const incidentById = (tx: Tx, id: string | null | undefined): Incident | undefined => (id ? tx.db.incidents.find(i => i.id === id) : undefined);
