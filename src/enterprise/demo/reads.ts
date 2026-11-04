/**
 * The read RPCs (the STABLE public.grc_* functions), ported from their SQL definitions. Ordering
 * follows the SQL ORDER BY clauses; rows without one keep production heap order.
 */
import type { Action, AuditEvent, Json, JsonObject } from './types.ts';
import type { Tx } from './store.ts';
import { chainState, employee, invalid, me, myEmployees, notFound, nowTs, requireSignedIn, authError } from './store.ts';
import {
  CLOSED, actionRow, actionType, agg, appetiteView, approvalsOf, checkOp, controlJson, controlLastTest, day, deptName, effFactor, empJson, empName,
  evaluateCriteria, hasPerm, kriList, kriState, matchingRules, opsFor, policyAudience, policyJson, regJson, reqStatus, roleHolders, roleName,
  rolePermissions, scoreLevel, ts, vRisk, vRiskById, vRisks, vendorJson,
} from './model.ts';
import { and3, collate, dayNumber, eq3, likeToRegExp, lt3, or3, pgRound, pgSort, sortRows, tsMicros } from './pg.ts';

const sum = (xs: (number | null | undefined)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null && x !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};
const max = (xs: (number | null | undefined)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null && x !== undefined);
  return v.length ? Math.max(...v) : null;
};
/** max(timestamptz) returning the original text of the latest value. */
const maxTs = (xs: (string | null | undefined)[]): string | null => {
  let best: string | null = null, bestUs = -Infinity;
  for (const x of xs) if (x) { const us = tsMicros(x); if (us > bestUs) { best = x; bestUs = us; } }
  return best;
};
/** Ledger entries of an organisation that the demo shows (sealed placeholders are only part of the chain). */
export const visibleEvents = (tx: Tx, org?: string): AuditEvent[] => tx.db.audit.filter(e => !e.withheld && (org === undefined || e.org_id === org));

export function platformLevel(tx: Tx, empId: string | null | undefined): string {
  return (empId ? tx.db.platform_access.find(p => p.employee_id === empId)?.level : undefined) ?? 'member';
}

// ---------------------------------------------------------------- session and personal views
export function grcSession(tx: Tx): JsonObject {
  const mine = myEmployees(tx);
  const level = platformLevel(tx, tx.userEmployeeId);
  const memberships = mine.filter(e => e.active).flatMap(e => {
    const o = tx.db.org.id === e.org_id ? tx.db.org : null;
    const r = tx.db.roles.find(x => x.id === e.role_id);
    if (!o || !r) return [];
    const delegated = tx.db.delegations.filter(dl => dl.to_employee === e.id && dl.revoked_at === null && tsMicros(dl.valid_from) <= tx.now && tx.now <= tsMicros(dl.valid_until));
    return [{
      org_id: o.id, org_name: o.name, industry: o.industry, kind: o.kind, currency: o.currency, employee_id: e.id, full_name: e.full_name,
      role_id: e.role_id, role: r.name, authority_level: r.authority_level, department: deptName(tx, e.department_id), is_student: e.is_student,
      platform_role: level, permissions: pgSort(rolePermissions(tx, e.role_id).filter(p => !p.includes('#')), collate),
      delegated_roles: delegated.map(dl => ({ role: roleName(tx, dl.role_id), from: empName(tx, dl.from_employee), until: dl.valid_until })),
    }];
  });
  return { user_id: null, email: mine.find(e => e.org_id === tx.db.org.id)?.email ?? null, platform_role: level, memberships };
}

export function grcMyWork(tx: Tx, org: string): JsonObject {
  const m = me(tx, org);
  const tasks: JsonObject[] = [];
  for (const a of tx.db.actions) {
    if (a.org_id !== org || a.archived || ['cancelled', 'rejected'].includes(a.status)) continue;
    const ok = (op: string) => checkOp(tx, a, m.id, op) === null;
    let task: string | null = null;
    if (ok('approve')) {
      task = approvalsOf(tx, a.id).some(p => p.kind === 'post_review' && p.status === 'pending') && !['awaiting_approval', 'escalated'].includes(a.status) ? 'post_review' : 'approve';
    } else if (ok('assess')) task = 'assess';
    else if (ok('respond_info')) task = 'respond_info';
    else if (ok('record_execution')) task = 'record_execution';
    else if (ok('start')) task = 'execute';
    else if (ok('verify') && (a.accountable_id === m.id
      || tx.db.raci.some(rc => rc.entity_type === 'action' && rc.entity_id === a.id && rc.employee_id === m.id)
      || tx.db.action_types.some(t => t.org_id === a.org_id && t.code === a.action_type && t.assessor_role_id === m.role_id))) task = 'verify';
    else if (ok('submit')) task = 'submit';
    if (task !== null) tasks.push({ ...actionRow(tx, a), task });
  }
  const canSec = hasPerm(tx, m.id, 'incident.assess.security'), canFin = hasPerm(tx, m.id, 'incident.assess.financial');
  const incidents = tx.db.incidents.filter(i => i.org_id === org && !i.archived && i.status !== 'closed' && (i.assigned_to === m.id
    || (i.security_assessment === null && canSec && i.status !== 'new')
    || (i.financial_assessment === null && i.financial_exposure !== null && canFin && i.status !== 'new')));
  const now = tx.now;
  return {
    me: empJson(tx, m.id),
    tasks,
    incidents: sortRows(incidents, [i => ts(i.detected_at), 'desc']).map(i => ({
      id: i.id, ref: i.ref, title: i.title, severity: i.severity, status: i.status,
      task: i.status === 'new' ? 'investigate' : i.security_assessment === null && canSec ? 'assess_security'
        : i.financial_assessment === null && i.financial_exposure !== null && canFin ? 'assess_financial' : 'follow_up',
    })),
    owned_risks: sortRows(vRisks(tx, org).filter(v => v.owner_id === m.id), [v => v.score, 'desc']).map(v => ({
      id: v.id, code: v.code, title: v.title, score: v.score, level: scoreLevel(v.score), kri: v.legacy_id !== null ? kriState(tx, v.legacy_id) : null,
    })),
    delegations_in: tx.db.delegations.filter(d => d.to_employee === m.id && d.revoked_at === null && tsMicros(d.valid_from) <= now && now <= tsMicros(d.valid_until))
      .map(d => ({ id: d.id, from: empName(tx, d.from_employee), role: roleName(tx, d.role_id), until: d.valid_until, reason: d.reason })),
    delegations_out: tx.db.delegations.filter(d => d.from_employee === m.id && d.revoked_at === null && tsMicros(d.valid_until) > now)
      .map(d => ({ id: d.id, to: empName(tx, d.to_employee), role: roleName(tx, d.role_id), until: d.valid_until, reason: d.reason })),
  };
}

export function grcMyNotifications(tx: Tx, limit: number | null): JsonObject {
  const ids = new Set(myEmployees(tx).map(e => e.id));
  const mine = tx.db.notifications.filter(n => ids.has(n.recipient));
  const n = limit === null ? 200 : Math.min(limit, 200);
  if (n < 0) throw new Error('LIMIT must not be negative');
  const byIndex = sortRows(mine, [x => ts(x.created_at), 'desc'], [x => x.id]);
  const page = pgSort(byIndex, (a, b) => tsMicros(b.created_at) - tsMicros(a.created_at)).slice(0, n);
  return {
    unread: mine.filter(x => x.read_at === null).length,
    items: page.map(x => ({ id: x.id, org_id: x.org_id, kind: x.kind, title: x.title, body: x.body, entity_type: x.entity_type, entity_id: x.entity_id,
      created_at: x.created_at, read_at: x.read_at, browser_shown_at: x.browser_shown_at })),
  };
}

// ---------------------------------------------------------------- dashboards
export function grcCompliance(tx: Tx, org: string): JsonObject {
  const m = me(tx, org);
  const frameworks = tx.db.frameworks.filter(f => f.org_id === org).map(f => {
    const reqs = tx.db.requirements.filter(r => r.framework_id === f.id);
    const st = reqs.map(r => reqStatus(tx, r.id));
    const reqIds = new Set(reqs.map(r => r.id));
    return {
      ...f, total: reqs.length, met: st.filter(x => x === 'met').length, partial: st.filter(x => x === 'partial').length, gap: st.filter(x => x === 'gap').length,
      controls: new Set(tx.db.control_requirements.filter(([, rid]) => reqIds.has(rid)).map(([cid]) => cid)).size,
    };
  });
  const controls = tx.db.controls.filter(c => c.org_id === org);
  const orgControls = new Set(controls.map(c => c.id));
  return {
    frameworks: sortRows(frameworks, [f => f.sort]),
    controls: {
      total: controls.length, effective: controls.filter(c => c.operating_eff === 'effective').length, partial: controls.filter(c => c.operating_eff === 'partial').length,
      ineffective: controls.filter(c => c.operating_eff === 'ineffective').length, not_assessed: controls.filter(c => c.operating_eff === 'not_assessed').length,
      automated: controls.filter(c => c.automation === 'automated').length, monitored: controls.filter(c => c.monitor !== null).length,
    },
    last_monitor_run: maxTs(tx.db.control_tests.filter(t => orgControls.has(t.control_id) && t.source === 'platform_monitor').map(t => t.run_at)),
    failing: controls.flatMap(c => {
      const lt = controlLastTest(tx, c.id);
      return lt && ['fail', 'warn'].includes(lt.result as string) ? [{ id: c.id, code: c.code, title: c.title, last_test: lt }] : [];
    }),
    can_test: hasPerm(tx, m.id, 'control.test'), can_manage: hasPerm(tx, m.id, 'compliance.manage'),
  };
}

export function grcHome(tx: Tx, org: string): JsonObject {
  const m = me(tx, org);
  const comp = grcCompliance(tx, org);
  const incidents = tx.db.incidents.filter(i => i.org_id === org && !i.archived);
  const openInc = incidents.filter(i => i.status !== 'closed');
  const vendors = tx.db.vendors.filter(v => v.org_id === org);
  const today = dayNumber(tx.today);
  const policies = tx.db.policies.filter(p => p.org_id === org);
  const processes = tx.db.processes.filter(p => p.org_id === org);
  const study = sortRows(tx.db.ebios_studies.filter(x => x.org_id === org), [x => ts(x.updated_at), 'desc'])[0];
  const items = study ? tx.db.ebios_items.filter(i => i.study_id === study.id) : [];
  const actions = tx.db.actions.filter(a => a.org_id === org && !a.archived);
  const events = visibleEvents(tx, org);
  const regDue = tx.db.reg_notifications.flatMap(n => {
    const i = tx.db.incidents.find(x => x.id === n.incident_id);
    return i && i.org_id === org && n.sent_at === null && n.due_at !== null && !i.archived ? [{ n, i }] : [];
  });
  return {
    me: { name: m.full_name, role: roleName(tx, m.role_id) },
    frameworks: comp.frameworks, controls: comp.controls, failing: comp.failing, last_monitor_run: comp.last_monitor_run,
    appetite: appetiteView(tx, org),
    kri: kriList(tx, org),
    risks: sortRows(vRisks(tx, org), [v => v.score, 'desc', 'last']).map(v => ({
      id: v.id, code: v.code, title: v.title, score: v.score, likelihood: v.likelihood, impact: v.impact, residual_target: v.residual_target_score, category: v.category,
    })),
    incidents: { open: openInc.length, critical: openInc.filter(i => i.severity >= 4).length, exposure: sum(openInc.map(i => i.financial_exposure)) ?? 0 },
    reg_due: sortRows(regDue, [x => ts(x.n.due_at)]).map(({ n, i }) => ({ id: n.id, incident_id: i.id, ref: i.ref, regime: n.regime, stage: n.stage, due_at: n.due_at })),
    vendors: {
      total: vendors.length, critical: vendors.filter(v => v.tier === 'critical').length,
      review_overdue: vendors.filter(v => v.next_review !== null && dayNumber(v.next_review) < today).length,
      contract_expired: vendors.filter(v => v.contract_end !== null && dayNumber(v.contract_end) < today).length,
      no_exit_plan_critical: vendors.filter(v => v.tier === 'critical' && !v.exit_plan).length,
    },
    policies: {
      total: policies.length, approved: policies.filter(p => p.status === 'approved').length,
      to_attest: policies.filter(p => p.status === 'approved' && policyAudience(tx, p.org_id, p.audience).includes(m.id)
        && !tx.db.policy_attestations.some(a => a.policy_id === p.id && a.version === p.version && a.employee_id === m.id))
        .map(p => ({ id: p.id, code: p.code, title: p.title })),
    },
    continuity: {
      processes: processes.length, tier1: processes.filter(p => p.tier === 1).length,
      rto_missed: processes.filter(p => {
        const tests = tx.db.bcp_tests.filter(t => t.process_id === p.id);
        const last = max(tests.map(t => dayNumber(t.tested_on)));
        return tests.some(t => dayNumber(t.tested_on) === last && t.achieved_rto_hours !== null && t.achieved_rto_hours > p.rto_hours);
      }).length,
      untested: processes.filter(p => !tx.db.bcp_tests.some(t => t.process_id === p.id)).length,
    },
    ebios: study ? {
      title: study.title, status: study.status, measures: items.filter(i => i.kind === 'measure').length,
      measures_done: items.filter(i => i.kind === 'measure' && (i.data as JsonObject).status === 'done').length,
      pending_acceptance: items.filter(i => i.kind === 'residual' && (i.data as JsonObject).status === 'pending_acceptance').length,
    } : null,
    actions: {
      open: actions.filter(a => !CLOSED.includes(a.status)).length,
      overdue: actions.filter(a => lt3(ts(a.deadline), tx.now) === true && !CLOSED.includes(a.status)).length,
      awaiting_approval: actions.filter(a => ['awaiting_approval', 'escalated'].includes(a.status)).length,
      completed: actions.filter(a => a.status === 'completed').length,
    },
    chain: { entries: events.length, last_at: maxTs(events.map(e => e.occurred_at)) },
  };
}

export function grcOverview(tx: Tx, org: string): JsonObject {
  me(tx, org);
  const o = tx.db.org;
  const risks = vRisks(tx, org);
  const caseRisks = risks.filter(v => v.origin === 'case');
  const top5 = sortRows(caseRisks, [v => v.score, 'desc']).slice(0, 5);
  const incidents = tx.db.incidents.filter(i => i.org_id === org && !i.archived);
  const openInc = incidents.filter(i => i.status !== 'closed');
  const actions = tx.db.actions.filter(a => a.org_id === org && !a.archived);
  const byStatus: JsonObject = {};
  for (const a of actions) byStatus[a.status] = ((byStatus[a.status] as number) ?? 0) + 1;
  const work = grcMyWork(tx, org);
  const scored = risks.filter(v => v.score !== null) as (ReturnType<typeof vRisk> & { score: number })[];
  return {
    org: o.id === org ? { id: o.id, name: o.name, industry: o.industry, kind: o.kind, description: o.description } : null,
    register: {
      case_total: sum(caseRisks.map(v => v.score)), case_top5: sum(top5.map(v => v.score)), case_count: caseRisks.length, total_count: risks.length,
      critical: scored.filter(v => v.score >= 12).length, high: scored.filter(v => v.score >= 8 && v.score <= 11).length,
      moderate: scored.filter(v => v.score >= 4 && v.score <= 7).length, low: scored.filter(v => v.score < 4).length,
    },
    matrix: risks.map(v => ({ code: v.code, l: v.likelihood, i: v.impact, score: v.score, title: v.title, id: v.id })),
    kri: sortRows(risks.filter(v => v.legacy_id !== null), [v => v.code]).map(v => ({ risk: v.code, risk_id: v.id, state: kriState(tx, v.legacy_id) })),
    incidents: { open: openInc.length, sev4: openInc.filter(i => i.severity === 4).length, exposure: sum(openInc.map(i => i.financial_exposure)) ?? 0 },
    actions: {
      by_status: byStatus,
      awaiting_approval: actions.filter(a => ['awaiting_approval', 'escalated'].includes(a.status)).length,
      in_execution: actions.filter(a => ['approved', 'scheduled', 'in_progress'].includes(a.status)).length,
      awaiting_verification: actions.filter(a => a.status === 'awaiting_verification').length,
      completed: actions.filter(a => a.status === 'completed').length,
      overdue: actions.filter(a => lt3(ts(a.deadline), tx.now) === true && !CLOSED.includes(a.status)).length,
      emergency_open_reviews: tx.db.approvals.filter(ap => ap.kind === 'post_review' && ap.status === 'pending'
        && actions.some(a2 => a2.id === ap.action_id)).length,
    },
    departments: sortRows(tx.db.departments.filter(d => d.org_id === org && d.parent_id === null), [d => d.name]).map(d => {
      const dr = tx.db.risks.filter(r => r.department_id === d.id).map(vRisk);
      return {
        id: d.id, name: d.name, risks: dr.length, max_score: max(dr.map(v => v.score)),
        open_actions: tx.db.actions.filter(a => !a.archived && !CLOSED.includes(a.status) && tx.db.risks.some(r => r.id === a.risk_id && r.department_id === d.id)).length,
      };
    }),
    recent: sortRows(visibleEvents(tx, org), [e => e.id, 'desc']).slice(0, 8).map(e => ({
      id: e.id, at: e.occurred_at ?? null, stage: e.stage ?? null, actor: e.actor_name ?? null, role: e.actor_role ?? null, summary: e.summary ?? null,
    })),
    my_task_count: (work.tasks as Json[]).length + (work.incidents as Json[]).length,
  };
}

export function grcOrg(tx: Tx, org: string): JsonObject {
  const m = me(tx, org);
  const o = tx.db.org.id === org ? tx.db.org : null;
  const now = tx.now;
  return {
    org: o ? { ...o } : null,
    departments: sortRows(tx.db.departments.filter(d => d.org_id === org), [d => d.name]).map(d => ({ id: d.id, name: d.name, parent_id: d.parent_id, description: d.description })),
    roles: sortRows(tx.db.roles.filter(r => r.org_id === org), [r => r.authority_level, 'desc'], [r => r.name]).map(r => ({
      id: r.id, name: r.name, department: deptName(tx, r.department_id), authority_level: r.authority_level, reports_to: r.reports_to,
      reports_to_name: roleName(tx, r.reports_to), description: r.description,
      permissions: pgSort(r.permissions.filter(p => !p.includes('#')), collate),
      holders: roleHolders(tx, org, r.id).map(e => e.full_name),
    })),
    employees: sortRows(tx.db.employees.filter(e => e.org_id === org), [e => e.active, 'desc'], [e => e.is_student, 'desc'], [e => e.full_name]).map(e => ({
      id: e.id, name: e.full_name, email: e.email, role_id: e.role_id, role: roleName(tx, e.role_id), department: deptName(tx, e.department_id),
      manager: empName(tx, e.manager_id), active: e.active, is_student: e.is_student, has_login: e.has_login, note: e.note,
    })),
    action_types: sortRows(tx.db.action_types.filter(t => t.org_id === org), [t => t.domain], [t => t.name]).map(t => ({
      code: t.code, name: t.name, domain: t.domain, disruptive: t.disruptive, assessor: roleName(tx, t.assessor_role_id),
      executors: t.executor_role_ids.map(x => roleName(tx, x)), executor_role_ids: t.executor_role_ids,
      consulted: t.consulted_role_ids.map(x => roleName(tx, x)), emergency_allowed: t.emergency_allowed, description: t.description, criteria: t.default_criteria,
    })),
    rules: sortRows(tx.db.approval_rules.filter(r => r.org_id === org), [r => r.action_type], [r => r.step], [r => r.min_amount], [r => r.id]).map(r => ({
      id: r.id, action_type: r.action_type, step: r.step, approver_role_id: r.approver_role_id, approver: roleName(tx, r.approver_role_id),
      min_severity: r.min_severity, max_severity: r.max_severity, min_asset_criticality: r.min_asset_criticality, min_amount: r.min_amount,
      in_emergency: r.in_emergency, rationale: r.rationale, active: r.active, updated_at: r.updated_at,
    })),
    assets: sortRows(tx.db.assets.filter(s => s.org_id === org), [s => s.criticality, 'desc'], [s => s.name]).map(s => ({
      id: s.id, name: s.name, type: s.asset_type, criticality: s.criticality, service: s.business_service, department: deptName(tx, s.department_id),
      owner_role: roleName(tx, s.owner_role_id), device: null, description: s.description,
    })),
    delegations: sortRows(tx.db.delegations.filter(d => d.org_id === org), [d => ts(d.valid_from), 'desc']).map(d => ({
      id: d.id, from: empName(tx, d.from_employee), to: empName(tx, d.to_employee), role: roleName(tx, d.role_id), reason: d.reason,
      valid_until: d.valid_until, revoked_at: d.revoked_at, active: d.revoked_at === null && tsMicros(d.valid_from) <= now && now <= tsMicros(d.valid_until),
    })),
    me: { employee_id: m.id, is_admin: hasPerm(tx, m.id, 'org.admin'), can_delegate: hasPerm(tx, m.id, 'authority.delegate') },
  };
}

export function grcRisks(tx: Tx, org: string): Json[] {
  me(tx, org);
  return sortRows(vRisks(tx, org), [v => v.score, 'desc', 'last'], [v => v.code]).map(v => ({
    id: v.id, code: v.code, legacy_id: v.legacy_id, title: v.title, category: v.category, description: v.description,
    department: deptName(tx, v.department_id), department_id: v.department_id, likelihood: v.likelihood, impact: v.impact, score: v.score,
    level: scoreLevel(v.score), priority_rank: v.priority_rank, treatment: v.treatment, origin: v.origin, status: v.status,
    residual_likelihood: v.residual_likelihood, residual_impact: v.residual_impact,
    residual_score: v.residual_likelihood !== null && v.residual_impact !== null ? v.residual_likelihood * v.residual_impact : null,
    residual_target_score: v.residual_target_score, owner: empJson(tx, v.owner_id),
    kri: v.legacy_id !== null ? kriState(tx, v.legacy_id) : null,
    raci: sortRows(tx.db.raci.filter(x => x.entity_type === 'risk' && x.entity_id === v.id), [x => x.raci]).map(x => ({ raci: x.raci, employee: empJson(tx, x.employee_id) })),
    open_actions: tx.db.actions.filter(a => a.risk_id === v.id && !a.archived && !CLOSED.includes(a.status)).length,
    completed_actions: tx.db.actions.filter(a => a.risk_id === v.id && !a.archived && a.status === 'completed').length,
  }));
}

export function grcActions(tx: Tx, org: string, includeArchived: boolean): Json[] {
  me(tx, org);
  const rows = tx.db.actions.filter(a => a.org_id === org && (includeArchived || !a.archived));
  return sortRows(rows, [a => a.archived], [a => ts(a.updated_at), 'desc']).map(a => actionRow(tx, a));
}

export function grcIncidents(tx: Tx, org: string, includeArchived: boolean): Json[] {
  me(tx, org);
  const rows = tx.db.incidents.filter(i => i.org_id === org && (includeArchived || !i.archived));
  return sortRows(rows, [i => i.archived], [i => ts(i.detected_at), 'desc']).map(i => ({
    id: i.id, ref: i.ref, title: i.title, category: i.category, severity: i.severity, status: i.status, source: i.source,
    assigned_to: empJson(tx, i.assigned_to), risk_code: tx.db.risks.find(r => r.id === i.risk_id)?.code ?? null,
    asset: tx.db.assets.find(s => s.id === i.asset_id)?.name ?? null, financial_exposure: i.financial_exposure, detected_at: i.detected_at,
    archived: i.archived, scenario_run_id: i.scenario_run_id, has_security_assessment: i.security_assessment !== null,
    has_financial_assessment: i.financial_assessment !== null, actions: tx.db.actions.filter(a => a.incident_id === i.id).length,
    open_actions: tx.db.actions.filter(a => a.incident_id === i.id && !CLOSED.includes(a.status)).length,
  }));
}

export function grcControls(tx: Tx, org: string): Json[] {
  me(tx, org);
  return sortRows(tx.db.controls.filter(c => c.org_id === org), [c => c.code]).map(c => controlJson(tx, c));
}

export function grcMonitoring(tx: Tx, org: string): JsonObject {
  const m = me(tx, org);
  const orgLegacy = new Set(tx.db.risks.filter(r => r.org_id === org && r.legacy_id !== null).map(r => r.legacy_id as string));
  const alerts = sortRows(tx.db.alerts.filter(al => orgLegacy.has(al.risk_id)), [al => ts(al.created_at), 'desc']).slice(0, 25);
  return {
    kris: sortRows(vRisks(tx, org).filter(v => v.legacy_id !== null), [v => v.code]).map(v => {
      const kriIds = new Set(tx.db.kri_definitions.filter(k => k.risk_id === v.legacy_id).map(k => k.id));
      const last = sortRows(tx.db.kri_readings.filter(r => kriIds.has(r.kri_id)), [r => ts(r.recorded_at), 'desc']).slice(0, 20);
      return {
        risk_id: v.id, code: v.code, title: v.title, legacy_id: v.legacy_id, owner: empName(tx, v.owner_id), state: kriState(tx, v.legacy_id),
        history: sortRows(last, [r => ts(r.recorded_at)]).map(r => ({ v: r.value, at: r.recorded_at })),
      };
    }),
    alerts: sortRows(alerts, [al => ts(al.created_at), 'desc']).map(al => {
      const inc = tx.db.incidents.find(i => i.legacy_alert_id === al.id && i.org_id === org && !i.archived);
      return { id: al.id, risk: al.risk_id, severity: al.severity, status: al.status, message: al.message, created_at: al.created_at, incident: inc ? { id: inc.id, ref: inc.ref } : null };
    }),
    can_record: hasPerm(tx, m.id, 'kri.record'), can_open_incident: hasPerm(tx, m.id, 'incident.create'),
  };
}

export function grcQuant(tx: Tx, org: string): JsonObject {
  const m = me(tx, org);
  const risks = tx.db.risks.filter(r => r.org_id === org && r.status !== 'closed');
  return {
    appetite: sortRows(tx.db.appetite.filter(a => a.org_id === org), [a => a.sort]).map(a => ({ ...a })),
    risks: sortRows(risks.map(r => ({ r, v: vRisk(r) })), [x => x.v.score, 'desc', 'last'], [x => x.v.code]).map(({ r, v }) => {
      const q = tx.db.risk_quant.find(x => x.risk_id === v.id);
      let quant: JsonObject | null = null;
      if (q) { const rest: JsonObject = { ...q }; delete rest.risk_id; quant = { ...rest, updated_by_name: empName(tx, q.updated_by) }; }
      const links = tx.db.control_risks.filter(([, rid]) => rid === v.id).flatMap(([cid, , pct]) => {
        const c = tx.db.controls.find(x => x.id === cid);
        return c ? [{ c, pct }] : [];
      });
      return {
        id: v.id, code: v.code, title: v.title, category: v.category, score: v.score, likelihood: v.likelihood, impact: v.impact, appetite_id: r.appetite_id,
        quant,
        controls: sortRows(links, [x => x.pct, 'desc']).map(({ c, pct }) => ({
          id: c.id, code: c.code, title: c.title, reduction: pct, operating_eff: c.operating_eff, effective_reduction: pgRound(pct * effFactor(c.operating_eff)),
        })),
      };
    }),
    can_manage: hasPerm(tx, m.id, 'quant.manage'),
  };
}

export function grcEbios(tx: Tx, org: string): JsonObject {
  const m = me(tx, org);
  const study = sortRows(tx.db.ebios_studies.filter(x => x.org_id === org), [x => ts(x.updated_at), 'desc'])[0];
  if (!study) return { study: null, can_manage: hasPerm(tx, m.id, 'ebios.manage') };
  return {
    study: { ...study, owner_role: roleName(tx, study.owner_role_id) },
    items: sortRows(tx.db.ebios_items.filter(i => i.study_id === study.id), [i => i.workshop], [i => i.kind], [i => i.sort]).map(i => {
      const rest: JsonObject = { ...i };
      delete rest.study_id;
      return rest;
    }),
    risks: vRisks(tx, org).map(v => ({ id: v.id, code: v.code, title: v.title, score: v.score })),
    controls: tx.db.controls.filter(c => c.org_id === org).map(c => ({ id: c.id, code: c.code, title: c.title, operating_eff: c.operating_eff })),
    can_manage: hasPerm(tx, m.id, 'ebios.manage'),
  };
}

const TIER_RANK: Record<string, number> = { critical: 1, high: 2, medium: 3 };
export function grcVendors(tx: Tx, org: string): JsonObject {
  const m = me(tx, org);
  return {
    vendors: sortRows(tx.db.vendors.filter(v => v.org_id === org), [v => TIER_RANK[v.tier] ?? 4], [v => v.residual_score, 'desc']).map(v => vendorJson(tx, v)),
    can_manage: hasPerm(tx, m.id, 'vendor.manage'),
  };
}

export function grcContinuity(tx: Tx, org: string): JsonObject {
  const m = me(tx, org);
  return {
    processes: sortRows(tx.db.processes.filter(p => p.org_id === org), [p => p.tier], [p => p.rto_hours]).map(p => {
      const r = vRiskById(tx, p.risk_id);
      const deps = p.dependencies ?? {};
      return {
        ...p,
        owner_role: roleName(tx, p.owner_role_id), owner: agg(roleHolders(tx, p.org_id, p.owner_role_id).map(e => e.full_name)),
        department: deptName(tx, p.department_id),
        risk: r ? { id: r.id, code: r.code, title: r.title, score: r.score } : null,
        assets: tx.db.assets.filter(a => (deps.assets ?? []).includes(a.id)).map(a => ({ id: a.id, name: a.name, criticality: a.criticality })),
        vendors: tx.db.vendors.filter(v => (deps.vendors ?? []).includes(v.id)).map(v => ({ id: v.id, name: v.name, tier: v.tier, exit_plan: v.exit_plan })),
        upstream: tx.db.processes.filter(q => (deps.processes ?? []).includes(q.id)).map(q => ({ id: q.id, name: q.name })),
        tests: sortRows(tx.db.bcp_tests.filter(t => t.process_id === p.id), [t => day(t.tested_on), 'desc']).map(t => ({
          id: t.id, tested_on: t.tested_on, test_type: t.test_type, achieved_rto_hours: t.achieved_rto_hours, achieved_rpo_hours: t.achieved_rpo_hours,
          result: t.result, notes: t.notes, recorded_by: empName(tx, t.recorded_by),
        })),
      };
    }),
    can_manage: hasPerm(tx, m.id, 'bcm.manage'),
  };
}

export function grcBoard(tx: Tx, org: string): JsonObject {
  const m = me(tx, org);
  const home = grcHome(tx, org);
  const study = sortRows(tx.db.ebios_studies.filter(x => x.org_id === org), [x => ts(x.updated_at), 'desc']);
  const studyIds = new Set(study.map(x => x.id));
  const today = dayNumber(tx.today);
  const since = tx.now - 90 * 86400 * 1000000;
  const cs = chainState(tx);
  return {
    ...home,
    org: tx.db.org.id === org ? { ...tx.db.org } : null,
    generated_at: nowTs(tx), generated_by: m.full_name, generated_role: roleName(tx, m.role_id),
    quant: grcQuant(tx, org),
    chain_state: { ok: cs.ok, checked: cs.checked, first_broken_id: cs.first_broken_id },
    vendor_list: sortRows(tx.db.vendors.filter(v => v.org_id === org && ['critical', 'high'].includes(v.tier)), [v => v.residual_score, 'desc']).map(v => ({
      name: v.name, tier: v.tier, residual: v.residual_score, next_review: v.next_review,
      review_overdue: v.next_review === null ? null : dayNumber(v.next_review) < today, exit_plan: v.exit_plan,
    })),
    incident_list: sortRows(tx.db.incidents.filter(i => i.org_id === org && tsMicros(i.detected_at) > since), [i => ts(i.detected_at), 'desc']).map(i => ({
      ref: i.ref, title: i.title, severity: i.severity, status: i.status, detected_at: i.detected_at, exposure: i.financial_exposure,
    })),
    residuals: sortRows(tx.db.ebios_items.filter(i => studyIds.has(i.study_id) && i.kind === 'residual'), [i => i.sort]).map(i => ({ ref: i.ref, title: i.title, ...i.data })),
    processes: sortRows(tx.db.processes.filter(p => p.org_id === org && p.tier <= 2), [p => p.tier], [p => p.rto_hours]).map(p => {
      const t = sortRows(tx.db.bcp_tests.filter(x => x.process_id === p.id), [x => day(x.tested_on), 'desc'])[0];
      return { name: p.name, tier: p.tier, rto: p.rto_hours, rpo: p.rpo_hours, last_test: t ? { on: t.tested_on, rto: t.achieved_rto_hours, result: t.result } : null };
    }),
  };
}

export function grcPolicies(tx: Tx, org: string): Json[] {
  const m = me(tx, org);
  return sortRows(tx.db.policies.filter(p => p.org_id === org), [p => p.code]).map(p => policyJson(tx, p, m.id));
}

export function grcAudit(tx: Tx, org: string, limit: number | null, before: number | null, stage: string | null, search: string | null): JsonObject {
  me(tx, org);
  const events = visibleEvents(tx, org);
  const like = search === null ? null : likeToRegExp('%' + search + '%', true);
  const hits = events.filter(e => (before === null || e.id < before) && (stage === null || e.stage === stage)
    && (like === null || like.test(e.summary ?? '') || like.test(e.actor_name ?? '') || (e.entity_ref !== null && e.entity_ref !== undefined && like.test(e.entity_ref))));
  const n = Math.min(limit ?? 100, 500);
  if (n < 0) throw new Error('LIMIT must not be negative');
  return {
    items: sortRows(hits, [e => e.id, 'desc']).slice(0, n).map(e => ({
      id: e.id, at: e.occurred_at ?? null, stage: e.stage ?? null, event: e.event_type ?? null, actor: e.actor_name ?? null, role: e.actor_role ?? null,
      entity_type: e.entity_type ?? null, entity_id: e.entity_id ?? null, entity_ref: e.entity_ref ?? null, risk_id: e.risk_id ?? null,
      incident_id: e.incident_id ?? null, asset_id: e.asset_id ?? null, prev_status: e.prev_status ?? null, new_status: e.new_status ?? null,
      outcome: e.outcome ?? null, summary: e.summary ?? null, details: e.details ?? {}, scenario_run_id: e.scenario_run_id ?? null, prev_hash: e.prev_hash, hash: e.hash,
    })),
    total: events.length,
  };
}

export function grcVerifyAuditChain(tx: Tx): JsonObject {
  requireSignedIn(tx);
  return { ...chainState(tx), verified_at: nowTs(tx) };
}

export function grcScenarios(tx: Tx, org: string): Json[] {
  const m = me(tx, org);
  const out: Json[] = [];
  for (const s of sortRows(tx.db.scenarios.filter(x => x.org_id === org), [x => x.code])) {
    const r = sortRows(tx.db.scenario_runs.filter(x => x.scenario_code === s.code), [x => ts(x.started_at), 'desc'])[0];
    const inc = r ? sortRows(tx.db.incidents.filter(i => i.scenario_run_id === r.id), [i => ts(i.detected_at)])[0] : undefined;
    const runActions = r ? tx.db.actions.filter(a => a.scenario_run_id === r.id) : [];
    const steps: JsonObject[] = [];
    s.steps.forEach((st, idx) => {
      let done: boolean | null = false;
      if (r) {
        const ofRun = (pred: (a: Action) => boolean) => runActions.some(pred);
        switch (st.check) {
          case 'started': done = true; break;
          case 'investigating': done = inc ? inc.status !== 'new' : null; break;
          case 'security_assessed': done = inc ? inc.security_assessment !== null : false; break;
          case 'financial_assessed': done = inc ? inc.financial_assessment !== null : false; break;
          case 'actions_submitted': done = runActions.filter(a => a.status !== 'draft').length >= (st.min ?? 1); break;
          case 'authorised': done = runActions.length > 0 && !ofRun(a => ['draft', 'submitted', 'under_review', 'awaiting_approval', 'escalated'].includes(a.status)); break;
          case 'executed': done = runActions.length > 0 && !ofRun(a => ['draft', 'submitted', 'under_review', 'awaiting_approval', 'escalated', 'approved', 'scheduled', 'in_progress'].includes(a.status)); break;
          case 'verified': done = ofRun(a => a.status === 'completed') && !ofRun(a => !CLOSED.includes(a.status)); break;
          case 'post_review': done = !tx.db.approvals.some(ap => ap.kind === 'post_review' && ap.status !== 'approved' && runActions.some(a => a.id === ap.action_id)); break;
          case 'closed': done = inc ? inc.status === 'closed' : null; break;
          default: done = false;
        }
      }
      const rest: JsonObject = { ...st };
      delete rest.seed;
      steps.push({ ...rest, n: idx + 1, done: done ?? false, people: roleHolders(tx, org, st.role).map(e => e.full_name) });
    });
    const open = steps.filter(x => !x.done).map(x => x.n as number);
    out.push({
      code: s.code, title: s.title, summary: s.summary, org_id: s.org_id,
      run: r ? { id: r.id, status: r.status, started_at: r.started_at, ended_at: r.ended_at, started_by: empName(tx, r.started_by) } : null,
      incident: inc ? { id: inc.id, ref: inc.ref, status: inc.status, archived: inc.archived } : null,
      actions: sortRows(runActions, [a => ts(a.created_at)]).map(a => actionRow(tx, a)),
      steps,
      current_step: open.length ? Math.min(...open) : null,
      can_run: hasPerm(tx, m.id, 'scenario.run'),
    });
  }
  return out;
}

const LEVEL_RANK: Record<string, number> = { owner: 1, admin: 2 };
export function grcPlatformAccess(tx: Tx): JsonObject {
  requireSignedIn(tx);
  const users = tx.db.employees.filter(e => e.has_login && e.active && e.org_id === tx.db.org.id).map(e => {
    const pa = tx.db.platform_access.find(p => p.employee_id === e.id);
    return {
      user_id: e.id, email: e.email, name: e.full_name, business_role: roleName(tx, e.role_id), is_student: e.is_student,
      level: platformLevel(tx, e.id), granted_at: pa ? pa.granted_at : null, granted_by: pa?.granted_by ? empName(tx, pa.granted_by) : null,
      note: pa ? pa.note : null, last_sign_in: null,
    };
  });
  return { me: platformLevel(tx, tx.userEmployeeId), users: sortRows(users, [u => LEVEL_RANK[u.level] ?? 3], [u => u.name]) };
}

// ---------------------------------------------------------------- detail views
export function grcAction(tx: Tx, id: string): JsonObject {
  const a = tx.db.actions.find(x => x.id === id);
  if (!a) notFound('action');
  const act = a as Action;
  const m = me(tx, act.org_id);
  const t = actionType(tx, act.org_id, act.action_type);
  const asset = act.asset_id ? tx.db.assets.find(s => s.id === act.asset_id) : undefined;
  const crit = asset ? asset.criticality : null;
  const v = vRiskById(tx, act.risk_id);
  const inc = act.incident_id ? tx.db.incidents.find(i => i.id === act.incident_id) : undefined;
  return {
    ...actionRow(tx, act),
    proposed_action: act.proposed_action, justification: act.justification, business_impact: act.business_impact, business_process: act.business_process,
    treatment_strategy: act.treatment_strategy, budget: act.budget, resources: act.resources, start_date: act.start_date, scheduled_for: act.scheduled_for,
    emergency_reason: act.emergency_reason, info_request: act.info_request, blocked_reason: act.blocked_reason, assessment: act.assessment,
    assessed_by: empJson(tx, act.assessed_by), created_at: act.created_at, completed_at: act.completed_at, version: act.version,
    residual_likelihood: act.residual_likelihood, residual_impact: act.residual_impact,
    type: {
      code: t?.code ?? null, name: t?.name ?? null, domain: t?.domain ?? null, disruptive: t?.disruptive ?? null, description: t?.description ?? null,
      emergency_allowed: t?.emergency_allowed ?? null, assessor: roleName(tx, t?.assessor_role_id), executors: (t?.executor_role_ids ?? []).map(r => roleName(tx, r)),
    },
    people: { requested_by: empJson(tx, act.requested_by), responsible: empJson(tx, act.responsible_id), accountable: empJson(tx, act.accountable_id), executor: empJson(tx, act.executor_id) },
    risk: v ? { id: v.id, code: v.code, title: v.title, score: v.score, level: scoreLevel(v.score), likelihood: v.likelihood, impact: v.impact, legacy_id: v.legacy_id } : null,
    incident: inc ? { id: inc.id, ref: inc.ref, title: inc.title, severity: inc.severity, status: inc.status } : null,
    asset: asset ? { id: asset.id, name: asset.name, type: asset.asset_type, criticality: asset.criticality, service: asset.business_service } : null,
    approvals: sortRows(approvalsOf(tx, act.id).filter(x => x.status !== 'superseded'), [x => x.kind], [x => x.step]).map(x => ({
      id: x.id, step: x.step, kind: x.kind, role: roleName(tx, x.approver_role_id), status: x.status, rationale: x.rationale, rule_id: x.rule_id,
      decided_by: empJson(tx, x.decided_by), on_behalf_of: empJson(tx, x.on_behalf_of), comment: x.comment, decided_at: x.decided_at,
      eligible: roleHolders(tx, act.org_id, x.approver_role_id).map(e => e.full_name),
    })),
    evidence: sortRows(tx.db.evidence.filter(ev => ev.action_id === act.id), [ev => ts(ev.created_at)]).map(ev => ({
      id: ev.id, kind: ev.kind, summary: ev.summary, data: ev.data, label: ev.execution_label, by: empJson(tx, ev.submitted_by), at: ev.created_at,
    })),
    raci: sortRows(tx.db.raci.filter(x => x.entity_type === 'action' && x.entity_id === act.id), [x => x.raci]).map(x => ({ raci: x.raci, employee: empJson(tx, x.employee_id) })),
    criteria: act.criteria,
    criteria_preview: ['awaiting_verification', 'completed'].includes(act.status) ? evaluateCriteria(tx, act, m.id, {}) : null,
    device_command: null,
    timeline: sortRows(visibleEvents(tx).filter(e => e.entity_type === 'action' && e.entity_id === act.id), [e => e.id]).map(e => ({
      id: e.id, at: e.occurred_at ?? null, stage: e.stage ?? null, event: e.event_type ?? null, actor: e.actor_name ?? null, role: e.actor_role ?? null,
      summary: e.summary ?? null, from: e.prev_status ?? null, to: e.new_status ?? null, outcome: e.outcome ?? null, hash: e.hash.slice(0, 12),
    })),
    policy: {
      asset_criticality: crit,
      matched_rules: matchingRules(tx, act.org_id, act.action_type, act.severity, crit, act.amount).map(r => ({
        step: r.step, role: roleName(tx, r.approver_role_id), rationale: r.rationale, in_emergency: r.in_emergency,
      })),
    },
    ops: opsFor(tx, act, m.id),
    me: { employee_id: m.id, role: roleName(tx, m.role_id) },
  };
}

export function grcIncident(tx: Tx, id: string): JsonObject {
  const found = tx.db.incidents.find(x => x.id === id);
  if (!found) notFound('incident');
  const i = found as NonNullable<typeof found>;
  const m = me(tx, i.org_id);
  const v = vRiskById(tx, i.risk_id);
  const s = i.asset_id ? tx.db.assets.find(x => x.id === i.asset_id) : undefined;
  const actionIds = new Set(tx.db.actions.filter(a => a.incident_id === i.id).map(a => a.id));
  const has = (p: string) => hasPerm(tx, m.id, p);
  const live = !i.archived && i.status !== 'closed';
  return {
    id: i.id, ref: i.ref, title: i.title, description: i.description, category: i.category, severity: i.severity, status: i.status, source: i.source,
    financial_exposure: i.financial_exposure, detected_at: i.detected_at, closed_at: i.closed_at, archived: i.archived, scenario_run_id: i.scenario_run_id,
    legacy_alert_id: i.legacy_alert_id, reported_by: empJson(tx, i.reported_by), assigned_to: empJson(tx, i.assigned_to),
    risk: v ? { id: v.id, code: v.code, title: v.title, score: v.score, level: scoreLevel(v.score), owner: empJson(tx, v.owner_id) } : null,
    asset: s ? { id: s.id, name: s.name, type: s.asset_type, criticality: s.criticality, service: s.business_service, department: deptName(tx, s.department_id) } : null,
    security_assessment: i.security_assessment, financial_assessment: i.financial_assessment,
    actions: sortRows(tx.db.actions.filter(a => a.incident_id === i.id), [a => ts(a.created_at)]).map(a => actionRow(tx, a)),
    evidence: sortRows(tx.db.evidence.filter(ev => ev.incident_id === i.id), [ev => ts(ev.created_at)]).map(ev => ({
      id: ev.id, kind: ev.kind, summary: ev.summary, data: ev.data, by: empJson(tx, ev.submitted_by), at: ev.created_at,
    })),
    timeline: sortRows(visibleEvents(tx).filter(e => e.incident_id === i.id || (e.entity_type === 'action' && e.entity_id !== null && e.entity_id !== undefined && actionIds.has(e.entity_id))), [e => e.id]).map(e => ({
      id: e.id, at: e.occurred_at ?? null, stage: e.stage ?? null, event: e.event_type ?? null, actor: e.actor_name ?? null, role: e.actor_role ?? null,
      summary: e.summary ?? null, entity_ref: e.entity_ref ?? null,
    })),
    can: {
      investigate: and3(i.status === 'new', !i.archived, or3(eq3(i.assigned_to, m.id), has('incident.investigate'))),
      assess_security: live && has('incident.assess.security'),
      assess_financial: live && has('incident.assess.financial'),
      change_status: !i.archived && !['new', 'closed'].includes(i.status) && has('incident.investigate'),
      close: live && has('incident.close'),
      propose_action: live && has('action.propose'),
    },
  };
}

export function grcIncidentRegulatory(tx: Tx, org: string, incidentId: string): JsonObject {
  const m = me(tx, org);
  if (!tx.db.incidents.some(i => i.id === incidentId && i.org_id === org)) notFound('incident');
  return { ...(regJson(tx, incidentId) ?? {}), can_manage: hasPerm(tx, m.id, 'incident.regulatory') };
}

export function grcControl(tx: Tx, org: string, id: string): JsonObject {
  const m = me(tx, org);
  const c = tx.db.controls.find(x => x.id === id && x.org_id === org);
  if (!c) notFound('control');
  const ctl = c as NonNullable<typeof c>;
  const last40 = sortRows(tx.db.control_tests.filter(t => t.control_id === ctl.id), [t => ts(t.run_at), 'desc']).slice(0, 40);
  return {
    ...controlJson(tx, ctl),
    tests: sortRows(last40, [t => ts(t.run_at), 'desc']).map(t => ({ id: t.id, run_at: t.run_at, result: t.result, detail: t.detail, source: t.source, metrics: t.metrics, tester: empName(tx, t.tester) })),
    can_test: hasPerm(tx, m.id, 'control.test'), can_manage: hasPerm(tx, m.id, 'compliance.manage'),
  };
}

export function grcFramework(tx: Tx, org: string, id: string): JsonObject {
  me(tx, org);
  const f = tx.db.frameworks.find(x => x.id === id && x.org_id === org);
  if (!f) notFound('framework');
  const fw = f as NonNullable<typeof f>;
  return {
    ...fw,
    requirements: sortRows(tx.db.requirements.filter(r => r.framework_id === fw.id), [r => r.sort]).map(r => {
      const controls = tx.db.control_requirements.filter(([, rid]) => rid === r.id).flatMap(([cid]) => tx.db.controls.filter(c => c.id === cid));
      return {
        id: r.id, ref: r.ref, title: r.title, domain: r.domain, status: reqStatus(tx, r.id),
        controls: sortRows(controls, [c => c.code]).map(c => ({ id: c.id, code: c.code, title: c.title, design_eff: c.design_eff, operating_eff: c.operating_eff, status: c.status, owner_role: roleName(tx, c.owner_role_id) })),
      };
    }),
  };
}

export function grcVendor(tx: Tx, org: string, id: string): JsonObject {
  const m = me(tx, org);
  const v = tx.db.vendors.find(x => x.id === id && x.org_id === org);
  if (!v) notFound('vendor');
  const ven = v as NonNullable<typeof v>;
  return {
    ...vendorJson(tx, ven),
    assessments: sortRows(tx.db.vendor_assessments.filter(a => a.vendor_id === ven.id), [a => ts(a.created_at), 'desc']).map(a => ({
      id: a.id, assessed_on: a.assessed_on, score: a.score, answers: a.answers, findings: a.findings, assessor: empName(tx, a.assessor),
    })),
    can_manage: hasPerm(tx, m.id, 'vendor.manage'),
  };
}

export function grcPolicy(tx: Tx, org: string, id: string): JsonObject {
  const m = me(tx, org);
  const p = tx.db.policies.find(x => x.id === id && x.org_id === org);
  if (!p) notFound('policy');
  const pol = p as NonNullable<typeof p>;
  const atts = tx.db.policy_attestations.filter(a => a.policy_id === pol.id && a.version === pol.version);
  const audience = new Set(policyAudience(tx, pol.org_id, pol.audience));
  return {
    ...policyJson(tx, pol, m.id),
    body: pol.body,
    attestations: sortRows(atts.flatMap(a => { const e = employee(tx, a.employee_id); return e ? [{ a, e }] : []; }), [x => ts(x.a.attested_at), 'desc'])
      .map(({ a, e }) => ({ name: e.full_name, role: roleName(tx, e.role_id), attested_at: a.attested_at })),
    pending: sortRows(tx.db.employees.filter(e => audience.has(e.id) && !atts.some(a => a.employee_id === e.id)), [e => e.full_name])
      .map(e => ({ name: e.full_name, role: roleName(tx, e.role_id) })),
  };
}

export function grcPolicyPreview(tx: Tx, org: string, type: string, severity: number | null, asset: string | null, amount: number | null): JsonObject {
  me(tx, org);
  const t = actionType(tx, org, type);
  if (!t) notFound('action type');
  const at = t as NonNullable<typeof t>;
  const crit = asset ? tx.db.assets.find(s => s.id === asset && s.org_id === org)?.criticality ?? null : null;
  const people = (roleId: string | null) => roleHolders(tx, org, roleId).map(e => e.full_name);
  const emergencyRoles = [...new Set(tx.db.employees.filter(e => e.org_id === org && rolePermissions(tx, e.role_id).includes('action.emergency')).map(e => roleName(tx, e.role_id)))];
  return {
    action_type: at.name, domain: at.domain, asset_criticality: crit, severity, amount,
    assessor: at.assessor_role_id === null ? null : { role: roleName(tx, at.assessor_role_id), people: people(at.assessor_role_id) },
    approvals: matchingRules(tx, org, type, severity, crit, amount).map((r, k) => ({
      step: k + 1, role: roleName(tx, r.approver_role_id), rationale: r.rationale, in_emergency: r.in_emergency, rule_id: r.id, people: people(r.approver_role_id),
    })),
    executors: at.executor_role_ids.map(x => ({ role: roleName(tx, x), people: people(x) })),
    consulted: at.consulted_role_ids.map(x => roleName(tx, x)),
    emergency_allowed: at.emergency_allowed,
    emergency_roles: pgSort(emergencyRoles.filter((x): x is string => x !== null), collate).concat(emergencyRoles.includes(null) ? [null as unknown as string] : []),
    verification: at.default_criteria,
    separation_of_duties: ['The requester cannot approve their own request.', 'Each approval step must be decided by a different person.',
      'Whoever approved an action cannot execute it.', 'Whoever executed an action cannot verify it.'],
  };
}

/** Raised for calls whose organisation argument is missing (PostgREST would not find the function). */
export function requireOrg(org: unknown): string {
  if (typeof org !== 'string' || !org) invalid('organisation is required');
  return org as string;
}
export { authError };
