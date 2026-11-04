#!/usr/bin/env node
/**
 * Builds the public-demo fixtures from a read-only capture of the NOVATECH Supabase backend.
 *
 *   node src/enterprise/demo/tools/build-fixtures.mjs <capture-dir>
 *
 * <capture-dir> holds the JSON results of the queries in capture.sql (a_core.json … i_policies.json,
 * heap_order.json, parity_manifest.json). The script:
 *   1. verifies every captured audit hash (SHA-256 over the same fields as grc.audit_hash_row),
 *   2. separates obvious test data (see JUNK below) into excluded.json,
 *   3. writes seed.json (runtime data, NT only, no auth user ids, no real e-mail addresses)
 *      and parity.json (SHA-256 prefixes of the production RPC outputs, used by the tests).
 * Nothing here talks to the network.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'fixtures');
const capDir = process.argv[2];
if (!capDir) { console.error('usage: build-fixtures.mjs <capture-dir>'); process.exit(1); }
const cap = name => JSON.parse(readFileSync(join(capDir, name), 'utf8'));

/** The moment the capture window is pinned to (all captures were taken between 21:52 and 22:07 UTC, no writes in between). */
const SNAPSHOT_AT = '2026-10-27T22:00:00.000Z';
const SNAPSHOT_VERSION = 'nt-2026-10-27';

/** Obvious test data in production: the Scenario D rehearsal whose action and assessment were typed as "TEST". */
const JUNK = {
  scenarioRuns: ['e2fd1d6c-bea2-48c1-ae62-729b34a2b2d5'],
  reason: 'Scenario D rehearsal run (reset) with placeholder "TEST" content: ACT-1057 (title, proposal, justification, assessment = "TEST"), INC-1056 security assessment "TEST", their approvals, evidence, RACI rows, notifications and ledger entries.',
};

const a = cap('a_core.json'), b = cap('b_risks.json'), c = cap('c_ops.json'), d = cap('d_audit.json');
const e = cap('e_controls.json'), f = cap('f_frameworks.json'), g = cap('g_ebios.json'), h = cap('h_resilience.json'), i = cap('i_policies.json');
const heap = cap('heap_order.json');
const manifest = cap('parity_manifest.json');

// ---------- jsonb::text canonical form (same as src/enterprise/demo/pg.ts) ----------
const enc = new TextEncoder();
function cmpKeys(x, y) {
  const xb = enc.encode(x), yb = enc.encode(y);
  if (xb.length !== yb.length) return xb.length - yb.length;
  for (let k = 0; k < xb.length; k++) if (xb[k] !== yb[k]) return xb[k] - yb[k];
  return 0;
}
function pgStr(s) {
  let o = '"';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (ch === '"') o += '\\"'; else if (ch === '\\') o += '\\\\';
    else if (cp === 8) o += '\\b'; else if (cp === 12) o += '\\f'; else if (cp === 10) o += '\\n';
    else if (cp === 13) o += '\\r'; else if (cp === 9) o += '\\t';
    else if (cp < 32) o += '\\u' + cp.toString(16).padStart(4, '0');
    else o += ch;
  }
  return o + '"';
}
function pgText(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return pgStr(v);
  if (Array.isArray(v)) return '[' + v.map(pgText).join(', ') + ']';
  const keys = Object.keys(v).filter(k => v[k] !== undefined).sort(cmpKeys);
  return '{' + keys.map(k => pgStr(k) + ': ' + pgText(v[k])).join(', ') + '}';
}
const tsHash = iso => {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d+))?(?:Z|[+-]00(?::?00)?)$/.exec(iso);
  if (!m) throw new Error('unexpected timestamp ' + iso);
  return `${m[1]}T${m[2]}.${(m[3] ?? '').padEnd(6, '0').slice(0, 6)}`;
};
const auditHash = ev => createHash('sha256').update([ev.prev_hash ?? 'GENESIS', String(ev.id), ev.org_id ?? '', tsHash(ev.occurred_at), ev.actor_employee ?? '',
  ev.actor_name, ev.actor_role ?? '', ev.stage, ev.event_type, ev.entity_type ?? '', ev.entity_id ?? '', ev.prev_status ?? '', ev.new_status ?? '',
  ev.outcome ?? '', ev.summary, pgText(ev.details)].join('|'), 'utf8').digest('hex');

// ---------- helpers ----------
const byHeap = (rows, order, key) => {
  const pos = new Map(order.map((k, n) => [String(k), n]));
  return [...rows].sort((x, y) => (pos.get(String(key(x))) ?? 1e9) - (pos.get(String(key(y))) ?? 1e9));
};
const fail = msg => { console.error('FAIL: ' + msg); process.exit(1); };

// ---------- audit ledger checks ----------
let prev = null;
for (const ev of d.audit_events) {
  if (tsHash(ev.occurred_at) !== ev.ts_hash) fail(`ts derivation for event ${ev.id}`);
  if (ev.prev_hash !== prev) fail(`chain link before event ${ev.id}`);
  if (auditHash(ev) !== ev.hash) fail(`hash of event ${ev.id}`);
  prev = ev.hash;
}
console.log(`audit: ${d.audit_events.length} production hashes recomputed and verified`);

// ---------- raw world (production as captured, NT only) ----------
const raw = {
  org: a.org,
  departments: byHeap(a.departments, heap.departments, x => x.id),
  roles: byHeap(a.roles, heap.roles, x => x.id),
  employees: byHeap(a.employees.map(x => ({ ...x })), heap.employees, x => x.full_name),
  assets: byHeap(a.assets, heap.assets, x => x.id),
  action_types: byHeap(a.action_types, heap.action_types, x => x.code),
  approval_rules: byHeap(a.approval_rules, heap.rules, x => x.id),
  platform_access: a.platform_access,
  risks: byHeap(b.risks, heap.risks, x => x.id),
  appetite: byHeap(b.appetite, heap.appetite, x => x.id),
  raci: byHeap(b.raci.map(x => ({ ...x, org_id: 'NT' })), heap.raci, x => x.id),
  kri_definitions: byHeap(b.kri_definitions, heap.kri_definitions, x => x.risk_id),
  kri_readings: b.kri_readings,
  alerts: b.alerts,
  actions: byHeap(c.actions, heap.actions, x => x.ref),
  approvals: c.approvals,
  evidence: byHeap(c.evidence, heap.evidence, x => x.id.slice(0, 8)),
  incidents: byHeap(c.incidents, heap.incidents, x => x.ref),
  reg_notifications: c.reg_notifications,
  scenarios: d.scenarios,
  scenario_runs: c.scenario_runs,
  notifications: byHeap(c.notifications, heap.notifications, x => x.id),
  delegations: c.delegations,
  devices: [], device_commands: [],
  audit: d.audit_events.map(({ ts_hash, ...ev }) => (void ts_hash, ev)),
  controls: byHeap(e.controls, heap.controls, x => x.code),
  control_tests: byHeap(e.control_tests, heap.control_tests, x => x.id),
  frameworks: byHeap(f.frameworks, heap.frameworks, x => x.id),
  requirements: f.requirements,
  control_requirements: f.control_requirements,
  control_risks: byHeap(f.control_risks, heap.control_risks, x => `${x[0]}>${x[1]}`),
  ebios_studies: g.ebios_studies,
  ebios_items: byHeap(g.ebios_items, heap.ebios_items, x => x.id),
  risk_quant: byHeap(h.risk_quant, heap.risk_quant, x => x.risk_id),
  processes: byHeap(h.processes, heap.processes, x => x.id),
  bcp_tests: byHeap(h.bcp_tests, heap.bcp_tests, x => x.id),
  vendors: byHeap(h.vendors, heap.vendors, x => x.id),
  vendor_assessments: h.vendor_assessments,
  policies: byHeap(i.policies, heap.policies, x => x.code),
  policy_attestations: h.policy_attestations,
};

// Privacy: no auth user ids anywhere, no real addresses. Employee e-mails are fictional (@novatech.example) and kept.
for (const emp of raw.employees) {
  if ('user_id' in emp) fail('user_id leaked');
  if (emp.email && !/@novatech\.example$/.test(emp.email)) fail('non-fictional e-mail for ' + emp.full_name);
}

// ---------- split test junk ----------
const junkRuns = new Set(JUNK.scenarioRuns);
const junkIncidents = new Set(raw.incidents.filter(x => junkRuns.has(x.scenario_run_id)).map(x => x.id));
const junkActions = new Set(raw.actions.filter(x => junkRuns.has(x.scenario_run_id) || junkIncidents.has(x.incident_id)).map(x => x.id));
const junkEntity = id => id != null && (junkIncidents.has(id) || junkActions.has(id) || junkRuns.has(id));
const isJunkEvent = ev => ev.org_id === 'NT' && (junkEntity(ev.entity_id) || junkEntity(ev.incident_id) || junkRuns.has(ev.scenario_run_id));
const excluded = { reason: JUNK.reason, positions: {}, scenario_runs: [], incidents: [], actions: [], approvals: [], evidence: [], raci: [], notifications: [], audit: [], risk_patches: [] };
// Keeps the heap position of every excluded row so the tests can rebuild the production world exactly.
const split = (table, isJunk) => {
  const rows = raw[table];
  excluded.positions[table] = rows.map((x, i) => (isJunk(x) ? i : -1)).filter(i => i >= 0);
  return [rows.filter(x => !isJunk(x)), rows.filter(isJunk)];
};
const seed = { ...raw };
[seed.scenario_runs, excluded.scenario_runs] = split('scenario_runs', x => junkRuns.has(x.id));
[seed.incidents, excluded.incidents] = split('incidents', x => junkIncidents.has(x.id));
[seed.actions, excluded.actions] = split('actions', x => junkActions.has(x.id));
[seed.approvals, excluded.approvals] = split('approvals', x => junkActions.has(x.action_id));
[seed.evidence, excluded.evidence] = split('evidence', x => junkActions.has(x.action_id) || junkIncidents.has(x.incident_id));
[seed.raci, excluded.raci] = split('raci', x => x.entity_type === 'action' && junkActions.has(x.entity_id));
[seed.notifications, excluded.notifications] = split('notifications', x => junkEntity(x.entity_id));
// Ledger: junk and other-organisation entries become sealed placeholders so the hash chain stays verifiable.
seed.audit = raw.audit.map(ev => {
  if (ev.org_id !== 'NT') return { id: ev.id, org_id: ev.org_id, prev_hash: ev.prev_hash, hash: ev.hash, withheld: 'other_organisation' };
  if (isJunkEvent(ev)) { excluded.audit.push(ev); return { id: ev.id, org_id: ev.org_id, prev_hash: ev.prev_hash, hash: ev.hash, withheld: 'test_data' }; }
  return ev;
});
// The ACT-1057 verification also wrote a residual of L4 × I4 onto R2 and set it to "treating"; restore the pre-test values.
seed.risks = raw.risks.map(r => {
  if (r.id !== 'NT-R2' || r.residual_likelihood !== 4) return r;
  excluded.risk_patches.push({ id: r.id, status: r.status, residual_likelihood: r.residual_likelihood, residual_impact: r.residual_impact });
  return { ...r, status: 'open', residual_likelihood: null, residual_impact: null };
});
// Nothing in the clean seed may reference excluded rows.
const seedText = JSON.stringify(seed);
for (const id of [...junkActions, ...junkIncidents, ...junkRuns]) if (seedText.includes(id)) fail('junk reference left: ' + id);
if (/"TEST"/.test(seedText)) fail('placeholder text left in seed');

// Next values of the production sequences (grc.ref_seq last_value was 1058, is_called = true).
const counters = {
  ref_seq: 1059,
  audit: Math.max(...raw.audit.map(x => x.id)) + 1,
  notification: Math.max(...raw.notifications.map(x => x.id)) + 1,
  control_test: Math.max(...raw.control_tests.map(x => x.id)) + 1,
  bcp_test: Math.max(...raw.bcp_tests.map(x => x.id)) + 1,
  vendor_assessment: 1,
  reg_notification: 1,
  kri_reading: 75,
  alert: 59,
  raci: Math.max(...raw.raci.map(x => x.id)) + 1,
  approval_rule: Math.max(...raw.approval_rules.map(x => x.id)) + 1,
};

const meta = {
  version: SNAPSHOT_VERSION,
  snapshot_at: SNAPSHOT_AT,
  captured: '2026-10-27T21:52Z–22:07Z (read-only SELECTs and STABLE grc_* functions; no writes observed during the window)',
  org: 'NT',
  counters,
  excluded: JUNK.reason,
};

// ---------- write ----------
function rowsJson(obj) {
  const parts = Object.entries(obj).map(([k, v]) => {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') return `${JSON.stringify(k)}: [\n${v.map(r => '  ' + JSON.stringify(r)).join(',\n')}\n]`;
    return `${JSON.stringify(k)}: ${JSON.stringify(v)}`;
  });
  return '{\n' + parts.join(',\n') + '\n}\n';
}
writeFileSync(join(outDir, 'seed.json'), rowsJson({ meta, ...seed }));
writeFileSync(join(outDir, 'excluded.json'), rowsJson({ ...excluded, positions: JSON.stringify(excluded.positions) }).replace(/"positions": "(.*)",\n/, (_, j) => `"positions": ${j.replace(/\\"/g, '"')},\n`));
writeFileSync(join(outDir, 'parity.json'), rowsJson({
  meta: { snapshot_at: SNAPSHOT_AT, hash: 'first 16 hex chars of SHA-256 over jsonb::text of each RPC result (production, before test-data exclusion)',
    notes: 'grc_session is hashed per persona in independent statements (one multi-persona statement reuses the memberships of the first persona).',
    transforms: { grc_session: 'user_id → null, email → employee e-mail, memberships → NT only', grc_platform_access: 'user_id → NT employee id, email → employee e-mail, last_sign_in → null',
      grc_board: 'generated_at removed', grc_verify_audit_chain: 'verified_at removed' } },
  calls: manifest,
}));
// Persona baseline: the people who can sign in to NT, available synchronously (no fixture download needed).
const PERSONA_ORDER = ['Karan Deshmukh', 'Vijay Bhosale', 'Vandana Madem', 'Nandini Vadlamudi', 'Srija Poudapally', 'Pavan Sanam',
  'Léa Moreau', 'Thomas Bernard', 'Camille Laurent', 'Julie Martin', 'Internal Auditor (Professor access)'];
const personas = seed.employees.filter(x => x.has_login && x.active)
  .sort((x, y) => PERSONA_ORDER.indexOf(x.full_name) - PERSONA_ORDER.indexOf(y.full_name))
  .map(x => {
    const role = seed.roles.find(r => r.id === x.role_id);
    return { employee_id: x.id, full_name: x.full_name, role: role.name, role_id: x.role_id, department: seed.departments.find(dd => dd.id === x.department_id)?.name ?? null,
      is_student: x.is_student, permissions: role.permissions, authority_level: role.authority_level, email: x.email, active: x.active };
  });
if (personas.length !== 11) fail('expected 11 personas, got ' + personas.length);
writeFileSync(join(here, '..', 'personaBaseline.ts'), `// Generated by tools/build-fixtures.mjs from the ${SNAPSHOT_VERSION} snapshot. Do not edit by hand.
import type { DemoPersona } from './types.ts';

/** The eleven NT people with a sign-in account, as of the snapshot (live data replaces this once the demo backend has loaded). */
export const BASELINE_PERSONAS: readonly DemoPersona[] = ${JSON.stringify(personas, null, 2)};

/** Karan Deshmukh, Project Manager / Risk Coordinator. */
export const DEFAULT_PERSONA_ID = '${personas[0].employee_id}';
`);

console.log('seed:', Object.fromEntries(Object.entries(seed).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length])));
console.log('excluded:', Object.fromEntries(Object.entries(excluded).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length])));
