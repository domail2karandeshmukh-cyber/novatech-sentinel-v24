/**
 * Transaction context of the simulated backend. Every RPC runs against one Tx: a working copy of
 * the in-memory database plus the transaction clock. All stored timestamps are in snapshot
 * coordinates (the time line of the captured production data); the engine shifts them to the
 * visitor's clock on the way out (see engine.ts).
 */
import type { AuditEvent, DemoDb, Employee, JsonObject, Notification } from './types.ts';
import { pgText, pgTs, sha256Hex, hashTimestamp, tsMicros } from './pg.ts';

export type Tx = {
  db: DemoDb;
  /** now(): the transaction start time, microseconds since the epoch, snapshot coordinates. */
  now: number;
  /** current_date in snapshot coordinates (YYYY-MM-DD). */
  today: string;
  /** clock_timestamp(): strictly increasing within the transaction. */
  clock: () => number;
  /** Milliseconds to add to a stored timestamp to show it on the visitor's clock. */
  offsetMs: number;
  /** Whole days to add to a stored date to show it on the visitor's calendar. */
  dayShift: number;
  /** The employee the visitor is acting as (the demo counterpart of auth.uid()). */
  userEmployeeId: string | null;
  uuid: () => string;
  random: () => number;
};

// ---------------------------------------------------------------- errors (RpcError message convention)
export const denied = (msg: string): never => { throw new Error('DENIED: ' + msg); };
export const invalid = (msg: string): never => { throw new Error('VALIDATION: ' + msg); };
export const notFound = (msg?: string): never => { throw new Error(msg ? 'NOT_FOUND: ' + msg : 'NOT_FOUND'); };
export const authError = (msg: string): never => { throw new Error('AUTH: ' + msg); };
/** A plain database error (no prefix), e.g. a check constraint. */
export const dbError = (msg: string): never => { throw new Error(msg); };

/** A value as RAISE … '%' renders it (NULL becomes <NULL>; format('%s') renders it as an empty string instead). */
export const raiseText = (v: unknown): string => (v === null || v === undefined ? '<NULL>' : String(v));

/** The text of the DENIED error for writers the public demo does not simulate. */
export const NOT_IN_DEMO = (why: string) => `Not available in the public demo: ${why}. Use the authenticated workspace.`;

// ---------------------------------------------------------------- time
export const nowTs = (tx: Tx) => pgTs(tx.now);
export const clockTs = (tx: Tx) => pgTs(tx.clock());

// ---------------------------------------------------------------- lookups
export const employee = (tx: Tx, id: string | null | undefined): Employee | undefined => (id ? tx.db.employees.find(e => e.id === id) : undefined);
export const roleOf = (tx: Tx, id: string | null | undefined) => (id ? tx.db.roles.find(r => r.id === id) : undefined);

/** grc.me(p_org): the signed-in employee of an organisation. */
export function me(tx: Tx, org: string): Employee {
  if (!tx.userEmployeeId) authError('sign-in required');
  const e = tx.db.employees.find(x => x.id === tx.userEmployeeId && x.org_id === org && x.active);
  if (!e) authError(`you are not an active member of organisation ${raiseText(org)}`);
  return e as Employee;
}
/** The active employee record(s) of the signed-in visitor (any organisation). */
export function myEmployees(tx: Tx): Employee[] {
  return tx.db.employees.filter(x => x.id === tx.userEmployeeId);
}
export function requireSignedIn(tx: Tx): void {
  if (!tx.userEmployeeId || !tx.db.employees.some(x => x.id === tx.userEmployeeId && x.active)) authError('sign-in required');
}

// ---------------------------------------------------------------- audit ledger
/** The SHA-256 fingerprint of a ledger entry, field for field like grc.audit_hash_row. */
export function auditHash(ev: AuditEvent): string {
  return sha256Hex([
    ev.prev_hash ?? 'GENESIS', String(ev.id), ev.org_id ?? '', hashTimestamp(ev.occurred_at as string), ev.actor_employee ?? '',
    ev.actor_name, ev.actor_role ?? '', ev.stage, ev.event_type, ev.entity_type ?? '', ev.entity_id ?? '', ev.prev_status ?? '',
    ev.new_status ?? '', ev.outcome ?? '', ev.summary, pgText(ev.details ?? {}),
  ].join('|'));
}

export type LogInput = {
  org: string | null; actor: string | null; stage: string; event: string; summary: string;
  entityType?: string | null; entityId?: string | null; entityRef?: string | null; prev?: string | null; next?: string | null;
  outcome?: string | null; details?: JsonObject | null; risk?: string | null; incident?: string | null; asset?: string | null; run?: string | null;
};
/**
 * grc.log + the audit trigger: appends a hash-chained ledger entry. Entries written by the public
 * demo carry `simulated: true` in their details; the chain continues from the last production hash.
 */
export function log(tx: Tx, x: LogInput): AuditEvent {
  const e = x.actor ? employee(tx, x.actor) : undefined;
  const last = tx.db.audit.length ? tx.db.audit[tx.db.audit.length - 1] : null;
  const ev: AuditEvent = {
    id: tx.db.counters.audit++, org_id: x.org, occurred_at: clockTs(tx), actor_employee: x.actor ?? null,
    actor_name: e?.full_name ?? 'System', actor_role: e ? (roleOf(tx, e.role_id)?.name ?? null) : 'Automated control',
    stage: x.stage, event_type: x.event, entity_type: x.entityType ?? null, entity_id: x.entityId ?? null, entity_ref: x.entityRef ?? null,
    risk_id: x.risk ?? null, incident_id: x.incident ?? null, asset_id: x.asset ?? null, prev_status: x.prev ?? null, new_status: x.next ?? null,
    outcome: x.outcome ?? null, summary: x.summary, details: { ...(x.details ?? {}), simulated: true }, scenario_run_id: x.run ?? null,
    prev_hash: last ? last.hash : null, hash: '',
  };
  ev.hash = auditHash(ev);
  tx.db.audit.push(ev);
  return ev;
}

/** Recomputes the whole ledger. Sealed placeholders (other organisations, excluded test data) are trusted links. */
export function chainState(tx: Tx): { ok: boolean; checked: number; first_broken_id: number | null; head: string | null } {
  let prev: string | null = null, n = 0, broken: number | null = null;
  for (const ev of [...tx.db.audit].sort((a, b) => a.id - b.id)) {
    n++;
    if ((ev.prev_hash ?? null) !== prev || (!ev.withheld && ev.hash !== auditHash(ev))) { broken = ev.id; break; }
    prev = ev.hash;
  }
  return { ok: broken === null, checked: n, first_broken_id: broken, head: prev === null ? null : prev.slice(0, 16) };
}

// ---------------------------------------------------------------- notifications
export function insertNotification(tx: Tx, org: string, recipient: string, kind: string, title: string, body: string | null,
  entityType: string | null, entityId: string | null): Notification {
  const n: Notification = {
    id: tx.db.counters.notification++, org_id: org, recipient, kind, title, body, entity_type: entityType, entity_id: entityId,
    created_at: nowTs(tx), read_at: null, browser_shown_at: null,
  };
  tx.db.notifications.push(n);
  return n;
}
/** grc.notify: only to an existing, active employee. */
export function notify(tx: Tx, org: string, recipient: string | null | undefined, kind: string, title: string | null, body: string | null,
  entityType: string | null = null, entityId: string | null = null): void {
  if (!recipient || title === null) return;
  if (!tx.db.employees.some(e => e.id === recipient && e.active)) return;
  insertNotification(tx, org, recipient, kind, title, body, entityType, entityId);
}
/** Active delegations of a role to someone, at the transaction time. */
export function activeDelegations(tx: Tx) {
  return tx.db.delegations.filter(d => d.revoked_at === null && tsMicros(d.valid_from) <= tx.now && tx.now <= tsMicros(d.valid_until));
}

/** grc.notify_role: every active holder of the role, plus active delegates of it. Returns the number notified. */
export function notifyRole(tx: Tx, org: string, role: string | null, kind: string, title: string | null, body: string | null,
  entityType: string | null = null, entityId: string | null = null): number {
  if (!role || title === null) return 0;
  const ids = new Set<string>();
  for (const e of tx.db.employees) if (e.org_id === org && e.role_id === role && e.active) ids.add(e.id);
  for (const d of activeDelegations(tx)) {
    if (d.org_id === org && d.role_id === role && tx.db.employees.some(e => e.id === d.to_employee && e.active)) ids.add(d.to_employee);
  }
  for (const id of ids) insertNotification(tx, org, id, kind, title, body, entityType, entityId);
  return ids.size;
}
