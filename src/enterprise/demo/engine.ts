/**
 * The simulated backend core: one entry per public.grc_* function (exact PostgREST parameter names,
 * types and defaults), transactional writes, and the time model.
 *
 * Time model: the database is stored in snapshot coordinates (the time line of the captured
 * production data). While the world is pristine, every call rebases it so the snapshot looks
 * captured "just now" (offset = now − snapshotAt). The first write pins that offset, so what the
 * visitor did keeps its age. Outgoing ISO timestamps are shifted by the offset and calendar dates
 * by the same number of whole days; incoming timestamps and dates are shifted back.
 */
import type { DemoDb, JsonObject, Seed } from './types.ts';
import type { Tx } from './store.ts';
import { NOT_IN_DEMO } from './store.ts';
import { O, P, asObject, coerceArgs, type Param } from './cast.ts';
import { DATE_RE, DAY_MS, addDays, clone, isTimestamp, pgTs, tsMicros, utcDate, uuid as randomUuid } from './pg.ts';
import * as R from './reads.ts';
import * as W from './writes.ts';

type A = Record<string, unknown>;
type Def = { params: Param[]; write: boolean; run: (tx: Tx, a: A) => unknown };
const t = (v: unknown) => v as string;
const tn = (v: unknown) => (v ?? null) as string | null;
const n = (v: unknown) => (v ?? null) as number | null;
const b = (v: unknown) => (v ?? null) as boolean | null;
const obj = (v: unknown) => asObject(v);
const ORG = P('p_org', 'text');
const read = (params: Param[], run: Def['run']): Def => ({ params, write: false, run });
const write = (params: Param[], run: Def['run']): Def => ({ params, write: true, run });

/** Every RPC the original enterprise pages call, with the signature of its SQL function. */
export const RPC: Record<string, Def> = {
  // ---------------------------------------------------------------- reads (STABLE)
  grc_session: read([], tx => R.grcSession(tx)),
  grc_home: read([ORG], (tx, a) => R.grcHome(tx, t(a.p_org))),
  grc_my_work: read([ORG], (tx, a) => R.grcMyWork(tx, t(a.p_org))),
  grc_my_notifications: read([O('p_limit', 'int', 40)], (tx, a) => R.grcMyNotifications(tx, n(a.p_limit))),
  grc_overview: read([ORG], (tx, a) => R.grcOverview(tx, t(a.p_org))),
  grc_org: read([ORG], (tx, a) => R.grcOrg(tx, t(a.p_org))),
  grc_risks: read([ORG], (tx, a) => R.grcRisks(tx, t(a.p_org))),
  grc_actions: read([ORG, O('p_include_archived', 'bool', false)], (tx, a) => R.grcActions(tx, t(a.p_org), a.p_include_archived === true)),
  grc_incidents: read([ORG, O('p_include_archived', 'bool', false)], (tx, a) => R.grcIncidents(tx, t(a.p_org), a.p_include_archived === true)),
  grc_controls: read([ORG], (tx, a) => R.grcControls(tx, t(a.p_org))),
  grc_monitoring: read([ORG], (tx, a) => R.grcMonitoring(tx, t(a.p_org))),
  grc_compliance: read([ORG], (tx, a) => R.grcCompliance(tx, t(a.p_org))),
  grc_quant: read([ORG], (tx, a) => R.grcQuant(tx, t(a.p_org))),
  grc_ebios: read([ORG], (tx, a) => R.grcEbios(tx, t(a.p_org))),
  grc_vendors: read([ORG], (tx, a) => R.grcVendors(tx, t(a.p_org))),
  grc_continuity: read([ORG], (tx, a) => R.grcContinuity(tx, t(a.p_org))),
  grc_board: read([ORG], (tx, a) => R.grcBoard(tx, t(a.p_org))),
  grc_policies: read([ORG], (tx, a) => R.grcPolicies(tx, t(a.p_org))),
  grc_audit: read([ORG, O('p_limit', 'int', 100), O('p_before', 'bigint'), O('p_stage', 'text'), O('p_search', 'text')],
    (tx, a) => R.grcAudit(tx, t(a.p_org), n(a.p_limit), n(a.p_before), tn(a.p_stage), tn(a.p_search))),
  grc_verify_audit_chain: read([], tx => R.grcVerifyAuditChain(tx)),
  grc_scenarios: read([ORG], (tx, a) => R.grcScenarios(tx, t(a.p_org))),
  grc_platform_access: read([], tx => R.grcPlatformAccess(tx)),
  grc_action: read([P('p_id', 'uuid')], (tx, a) => R.grcAction(tx, t(a.p_id))),
  grc_incident: read([P('p_id', 'uuid')], (tx, a) => R.grcIncident(tx, t(a.p_id))),
  grc_incident_regulatory: read([ORG, P('p_incident', 'uuid')], (tx, a) => R.grcIncidentRegulatory(tx, t(a.p_org), t(a.p_incident))),
  grc_control: read([ORG, P('p_id', 'text')], (tx, a) => R.grcControl(tx, t(a.p_org), t(a.p_id))),
  grc_framework: read([ORG, P('p_id', 'text')], (tx, a) => R.grcFramework(tx, t(a.p_org), t(a.p_id))),
  grc_vendor: read([ORG, P('p_id', 'text')], (tx, a) => R.grcVendor(tx, t(a.p_org), t(a.p_id))),
  grc_policy: read([ORG, P('p_id', 'text')], (tx, a) => R.grcPolicy(tx, t(a.p_org), t(a.p_id))),
  grc_policy_preview: read([ORG, P('p_action_type', 'text'), P('p_severity', 'int'), P('p_asset', 'text'), P('p_amount', 'numeric'), O('p_requester', 'uuid')],
    (tx, a) => R.grcPolicyPreview(tx, t(a.p_org), t(a.p_action_type), n(a.p_severity), tn(a.p_asset), n(a.p_amount))),

  // ---------------------------------------------------------------- action lifecycle
  grc_propose_action: write([ORG, P('p', 'jsonb')], (tx, a) => W.proposeAction(tx, t(a.p_org), obj(a.p))),
  grc_submit_action: write([P('p_id', 'uuid')], (tx, a) => W.submitAction(tx, t(a.p_id))),
  grc_assess_action: write([P('p_id', 'uuid'), P('p_assessment', 'text'), P('p_recommend', 'bool'), O('p_severity', 'int')],
    (tx, a) => W.assessAction(tx, t(a.p_id), tn(a.p_assessment), b(a.p_recommend), n(a.p_severity))),
  grc_decide: write([P('p_id', 'uuid'), P('p_decision', 'text'), O('p_comment', 'text')], (tx, a) => W.decide(tx, t(a.p_id), tn(a.p_decision), tn(a.p_comment))),
  grc_respond_info: write([P('p_id', 'uuid'), P('p_response', 'text')], (tx, a) => W.respondInfo(tx, t(a.p_id), tn(a.p_response))),
  grc_invoke_emergency: write([P('p_id', 'uuid'), P('p_reason', 'text')], (tx, a) => W.invokeEmergency(tx, t(a.p_id), tn(a.p_reason))),
  grc_schedule_action: write([P('p_id', 'uuid'), P('p_when', 'timestamptz')], (tx, a) => W.scheduleAction(tx, t(a.p_id), n(a.p_when))),
  grc_start_execution: write([P('p_id', 'uuid')], (tx, a) => W.startExecution(tx, t(a.p_id))),
  grc_record_execution: write([P('p_id', 'uuid'), P('p_outcome', 'text'), P('p_notes', 'text')], (tx, a) => W.recordExecution(tx, t(a.p_id), tn(a.p_outcome), tn(a.p_notes))),
  grc_verify_action: write([P('p_id', 'uuid'), O('p_confirmations', 'jsonb', {}), O('p_notes', 'text'), O('p_residual_likelihood', 'int'), O('p_residual_impact', 'int')],
    (tx, a) => W.verifyAction(tx, t(a.p_id), a.p_confirmations === null ? null : obj(a.p_confirmations), tn(a.p_notes), n(a.p_residual_likelihood), n(a.p_residual_impact))),
  grc_reopen_action: write([P('p_id', 'uuid'), P('p_reason', 'text')], (tx, a) => W.reopenAction(tx, t(a.p_id), tn(a.p_reason))),
  grc_cancel_action: write([P('p_id', 'uuid'), P('p_reason', 'text')], (tx, a) => W.cancelAction(tx, t(a.p_id), tn(a.p_reason))),
  grc_reassign_action: write([P('p_id', 'uuid'), P('p_field', 'text'), P('p_employee', 'uuid'), P('p_reason', 'text')],
    (tx, a) => W.reassignAction(tx, t(a.p_id), tn(a.p_field), tn(a.p_employee), tn(a.p_reason))),
  grc_add_note: write([P('p_entity_type', 'text'), P('p_id', 'uuid'), P('p_note', 'text')], (tx, a) => W.addNote(tx, tn(a.p_entity_type), tn(a.p_id), tn(a.p_note))),

  // ---------------------------------------------------------------- incidents
  grc_create_incident: write([ORG, P('p', 'jsonb')], (tx, a) => W.createIncident(tx, t(a.p_org), obj(a.p))),
  grc_incident_transition: write([P('p_id', 'uuid'), P('p_status', 'text'), P('p_note', 'text')], (tx, a) => W.incidentTransition(tx, t(a.p_id), tn(a.p_status), tn(a.p_note))),
  grc_assess_incident: write([P('p_id', 'uuid'), P('p_kind', 'text'), P('p_summary', 'text'), P('p_severity', 'int'), P('p_recommendation', 'text')],
    (tx, a) => W.assessIncident(tx, t(a.p_id), tn(a.p_kind), tn(a.p_summary), n(a.p_severity), tn(a.p_recommendation))),
  grc_incident_from_alert: write([ORG, P('p_alert_id', 'bigint')], (tx, a) => W.incidentFromAlert(tx, t(a.p_org), n(a.p_alert_id))),
  grc_incident_regulatory_set: write([ORG, P('p_incident', 'uuid'), P('p', 'jsonb')], (tx, a) => W.incidentRegulatorySet(tx, t(a.p_org), tn(a.p_incident), obj(a.p))),
  grc_reg_mark_sent: write([ORG, P('p_id', 'bigint'), P('p_reference', 'text')], (tx, a) => W.regMarkSent(tx, t(a.p_org), n(a.p_id), tn(a.p_reference))),

  // ---------------------------------------------------------------- register, monitoring, assurance
  grc_set_raci: write([ORG, P('p_entity_type', 'text'), P('p_entity_id', 'text'), P('p_employee', 'uuid'), P('p_raci', 'text'), P('p_on', 'bool')],
    (tx, a) => W.setRaci(tx, t(a.p_org), tn(a.p_entity_type), tn(a.p_entity_id), tn(a.p_employee), tn(a.p_raci), b(a.p_on))),
  grc_risk_save: write([ORG, P('p', 'jsonb')], (tx, a) => W.riskSave(tx, t(a.p_org), obj(a.p))),
  grc_record_kri: write([ORG, P('p_legacy_risk', 'text'), P('p_value', 'numeric'), P('p_note', 'text')], (tx, a) => W.recordKri(tx, t(a.p_org), tn(a.p_legacy_risk), n(a.p_value), tn(a.p_note))),
  grc_monitor_run: write([ORG], (tx, a) => W.monitorRunRpc(tx, t(a.p_org))),
  grc_control_test_record: write([ORG, P('p_control', 'text'), P('p_result', 'text'), P('p_detail', 'text')],
    (tx, a) => W.controlTestRecord(tx, t(a.p_org), tn(a.p_control), tn(a.p_result), tn(a.p_detail))),
  grc_ebios_item_save: write([ORG, P('p_id', 'text'), P('p', 'jsonb')], (tx, a) => W.ebiosItemSave(tx, t(a.p_org), tn(a.p_id), obj(a.p))),
  grc_quant_save: write([ORG, P('p_risk', 'text'), P('p', 'jsonb')], (tx, a) => W.quantSave(tx, t(a.p_org), tn(a.p_risk), obj(a.p))),
  grc_vendor_assess: write([ORG, P('p_vendor', 'text'), P('p_answers', 'jsonb'), P('p_findings', 'text')],
    (tx, a) => W.vendorAssess(tx, t(a.p_org), tn(a.p_vendor), a.p_answers === null ? null : obj(a.p_answers), tn(a.p_findings))),
  grc_bcp_test_record: write([ORG, P('p_process', 'text'), P('p', 'jsonb')], (tx, a) => W.bcpTestRecord(tx, t(a.p_org), tn(a.p_process), obj(a.p))),
  grc_policy_attest: write([ORG, P('p_policy', 'text')], (tx, a) => W.policyAttest(tx, t(a.p_org), tn(a.p_policy))),

  // ---------------------------------------------------------------- people, authority, notifications
  grc_delegate: write([ORG, P('p_to', 'uuid'), P('p_until', 'timestamptz'), P('p_reason', 'text')], (tx, a) => W.delegate(tx, t(a.p_org), tn(a.p_to), n(a.p_until), tn(a.p_reason))),
  grc_revoke_delegation: write([P('p_id', 'uuid')], (tx, a) => W.revokeDelegation(tx, tn(a.p_id))),
  grc_notifications_mark: write([P('p_ids', 'bigint[]'), P('p_mode', 'text')], (tx, a) => W.notificationsMark(tx, (a.p_ids ?? null) as (number | null)[] | null, tn(a.p_mode))),
  grc_admin_employee_save: write([ORG, P('p', 'jsonb')], (tx, a) => W.adminEmployeeSave(tx, t(a.p_org), obj(a.p))),
  grc_admin_rule_save: write([ORG, P('p', 'jsonb')], (tx, a) => W.adminRuleSave(tx, t(a.p_org), obj(a.p))),
  grc_admin_set_active: write([P('p_emp', 'uuid'), P('p_active', 'bool'), P('p_reason', 'text')], (tx, a) => W.adminSetActive(tx, tn(a.p_emp), b(a.p_active), tn(a.p_reason))),
  grc_admin_set_permission: write([P('p_role', 'text'), P('p_perm', 'text'), P('p_grant', 'bool')], (tx, a) => W.adminSetPermission(tx, tn(a.p_role), tn(a.p_perm), b(a.p_grant))),
  grc_platform_set_level: write([P('p_user', 'uuid'), P('p_level', 'text')], () => W.platformSetLevel()),

  // ---------------------------------------------------------------- guided scenarios
  grc_scenario_start: write([P('p_code', 'text')], (tx, a) => W.scenarioStart(tx, tn(a.p_code))),
  grc_scenario_reset: write([P('p_run', 'uuid'), P('p_reason', 'text')], (tx, a) => W.scenarioReset(tx, tn(a.p_run), tn(a.p_reason))),
  grc_scenario_set_paused: write([P('p_run', 'uuid'), P('p_paused', 'bool')], (tx, a) => W.scenarioSetPaused(tx, tn(a.p_run), b(a.p_paused))),
};

/** Writers that exist in the backend but are deliberately not simulated (they throw a DENIED explanation). */
export const DENIED_IN_DEMO = ['grc_platform_set_level'];

// ---------------------------------------------------------------- world and time
export type World = {
  db: DemoDb;
  /** The capture time of the snapshot (ms since the epoch). */
  snapshotAtMs: number;
  /** Display offset in ms; null while nothing was written (the snapshot is then rebased on every call). */
  offsetMs: number | null;
  /** Calendar days added to stored dates for display; pinned together with offsetMs. */
  dayShift: number | null;
};
export type TimeShift = { offsetMs: number; dayShift: number };
export type CallOptions = { userEmployeeId: string | null; now: number; uuid?: () => string; random?: () => number };

export function worldFromSeed(seed: Seed): World {
  const copy = clone(seed);
  const { meta, ...tables } = copy;
  return { db: { ...tables, counters: { ...meta.counters } }, snapshotAtMs: Date.parse(meta.snapshot_at), offsetMs: null, dayShift: null };
}
/**
 * The shift between stored (snapshot) time and the visitor's clock. While the world is pristine it
 * is recomputed on every call: the snapshot instant maps to "now" and the snapshot day to "today".
 */
export function timeShift(world: World, now: number): TimeShift {
  if (world.offsetMs !== null && world.dayShift !== null) return { offsetMs: world.offsetMs, dayShift: world.dayShift };
  const days = Math.round((Date.parse(utcDate(now)) - Date.parse(utcDate(world.snapshotAtMs))) / DAY_MS);
  return { offsetMs: now - world.snapshotAtMs, dayShift: days };
}

/** Shifts every ISO timestamp by `ms` and every calendar date by `days` (returns a deep copy). */
export function shiftTimes(v: unknown, ms: number, days: number): unknown {
  if (typeof v === 'string') {
    if (isTimestamp(v)) return pgTs(tsMicros(v) + ms * 1000);
    if (DATE_RE.test(v)) return days === 0 ? v : addDays(v, days);
    return v;
  }
  if (Array.isArray(v)) return v.map(x => shiftTimes(x, ms, days));
  if (v !== null && typeof v === 'object') {
    const out: JsonObject = {};
    for (const [k, x] of Object.entries(v as JsonObject)) out[k] = shiftTimes(x, ms, days) as JsonObject[string];
    return out;
  }
  return v;
}

export function isKnownRpc(fn: string): boolean {
  return Object.prototype.hasOwnProperty.call(RPC, fn);
}

/**
 * Runs one RPC against the world. Reads see the current state; a write runs on a copy that
 * replaces the state only if the whole function succeeds (like a database transaction).
 */
export function callRpc(world: World, fn: string, rawArgs: Record<string, unknown>, opts: CallOptions): { value: unknown; wrote: boolean } {
  const def = isKnownRpc(fn) ? RPC[fn] : undefined;
  if (!def) throw new Error('DENIED: ' + NOT_IN_DEMO(`${fn} is not part of the simulated backend`));
  const { offsetMs, dayShift } = timeShift(world, opts.now);
  const args = coerceArgs(fn, def.params, shiftTimes(rawArgs ?? {}, -offsetMs, -dayShift) as Record<string, unknown>);
  const nowUs = (opts.now - offsetMs) * 1000;
  let tick = 0;
  const db = def.write ? clone(world.db) : world.db;
  const tx: Tx = {
    db, now: nowUs, today: addDays(utcDate(opts.now), -dayShift), clock: () => nowUs + (++tick) * 7, offsetMs, dayShift,
    userEmployeeId: opts.userEmployeeId, uuid: opts.uuid ?? randomUuid, random: opts.random ?? Math.random,
  };
  const value = def.run(tx, args);
  if (def.write) {
    world.db = db;
    if (world.offsetMs === null || world.dayShift === null) { world.offsetMs = offsetMs; world.dayShift = dayShift; }
  }
  return { value: shiftTimes(value === undefined ? null : value, offsetMs, dayShift), wrote: def.write };
}
