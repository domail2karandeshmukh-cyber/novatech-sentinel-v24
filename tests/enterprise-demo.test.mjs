// Public-demo backend tests: the simulated grc_* RPCs of src/enterprise/demo, run in Node with
// in-memory storage. Nothing here talks to a network or a real backend.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
  key(i) { return [...this.map.keys()][i] ?? null; }
  get length() { return this.map.size; }
}
class BlockedStorage {
  getItem() { throw new Error('SecurityError: storage is disabled'); }
  setItem() { throw new Error('SecurityError: storage is disabled'); }
  removeItem() { throw new Error('SecurityError: storage is disabled'); }
}
globalThis.localStorage = new MemoryStorage();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = name => JSON.parse(readFileSync(join(root, 'src/enterprise/demo/fixtures', name), 'utf8'));
const SEED = fixture('seed.json');
const EXCLUDED = fixture('excluded.json');
const PARITY = fixture('parity.json');

const backend = await import('../src/enterprise/demo/demoBackend.ts');
const demoSession = await import('../src/enterprise/demo/demoSession.ts');
const { RPC, callRpc, worldFromSeed } = await import('../src/enterprise/demo/engine.ts');
const { pgText, sha256Hex } = await import('../src/enterprise/demo/pg.ts');

const SNAPSHOT_MS = Date.parse(SEED.meta.snapshot_at);
const DAY = 86400000;
let clock = SNAPSHOT_MS;

/** A fresh demo world (the snapshot), private storage, Karan as the persona. */
function setup({ storage = new MemoryStorage(), at = SNAPSHOT_MS + 11 * 3600e3 } = {}) {
  clock = at;
  globalThis.localStorage = new MemoryStorage();
  demoSession.resetDemoPersonaMemory();
  backend.configureDemoBackend({ seed: SEED, now: () => clock, storage });
  return storage;
}
const emp = first => {
  const e = SEED.employees.find(x => x.full_name.split(' ')[0] === first || x.full_name === first);
  if (!e) throw new Error('no employee ' + first);
  return e.id;
};
async function as(first, fn, args = {}) {
  backend.setDemoPersona(emp(first));
  return backend.demoRpc(fn, args);
}
async function rejects(promise, prefix, pattern) {
  await assert.rejects(promise, e => {
    assert.ok(e.message.startsWith(prefix + ': '), `expected ${prefix}: …, got "${e.message}"`);
    if (pattern) assert.match(e.message, pattern);
    return true;
  });
}
const actionByRef = async ref => (await as('Karan', 'grc_actions', { p_org: 'NT', p_include_archived: true })).find(a => a.ref === ref);

// ---------------------------------------------------------------------------------------------- coverage
function sourceFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'fixtures' ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}
const SRC_RPCS = [...new Set(sourceFiles(join(root, 'src')).flatMap(f => [...readFileSync(f, 'utf8').matchAll(/['"`](grc_[a-z_]+)['"`]/g)].map(m => m[1])))].sort();

const READ_ARGS = {
  grc_session: {}, grc_verify_audit_chain: {}, grc_platform_access: {}, grc_my_notifications: { p_limit: 60 },
  grc_home: 'org', grc_my_work: 'org', grc_overview: 'org', grc_org: 'org', grc_risks: 'org', grc_controls: 'org', grc_monitoring: 'org',
  grc_compliance: 'org', grc_quant: 'org', grc_ebios: 'org', grc_vendors: 'org', grc_continuity: 'org', grc_board: 'org', grc_policies: 'org', grc_scenarios: 'org',
  grc_actions: { p_org: 'NT', p_include_archived: false }, grc_incidents: { p_org: 'NT', p_include_archived: true },
  grc_audit: { p_org: 'NT', p_limit: 300, p_stage: null, p_search: null },
  grc_action: { p_id: SEED.actions[0].id }, grc_incident: { p_id: SEED.incidents[0].id },
  grc_incident_regulatory: { p_org: 'NT', p_incident: SEED.incidents[0].id },
  grc_control: { p_org: 'NT', p_id: 'NT-C01' }, grc_framework: { p_org: 'NT', p_id: 'NT-ISO27001' }, grc_vendor: { p_org: 'NT', p_id: 'NT-V01' },
  grc_policy: { p_org: 'NT', p_id: 'NT-POL01' },
  grc_policy_preview: { p_org: 'NT', p_action_type: 'payment_hold', p_severity: 3, p_asset: 'NT-AST-ERP', p_amount: 184500 },
};

test('every RPC referenced in src/** is answered in demo mode', async () => {
  setup();
  assert.ok(SRC_RPCS.length >= 60, 'found the RPC names used by the pages');
  const names = backend.demoRpcNames();
  for (const fn of SRC_RPCS) assert.ok(names.includes(fn), `${fn} is simulated`);
  for (const fn of SRC_RPCS.filter(f => !RPC[f].write)) {
    assert.ok(fn in READ_ARGS, `read ${fn} has test arguments`);
    const args = READ_ARGS[fn] === 'org' ? { p_org: 'NT' } : READ_ARGS[fn];
    for (const who of ['Karan', 'Internal Auditor (Professor access)']) {
      const r = await as(who, fn, args);
      assert.ok(r !== null && r !== undefined, `${fn} returns data for ${who}`);
    }
  }
  // Writers: wrong calls fail like PostgREST would, never silently.
  for (const fn of SRC_RPCS.filter(f => RPC[f].write)) await assert.rejects(backend.demoRpc(fn, {}), /Could not find the function/);
  // The one writer that is not simulated explains why.
  assert.deepEqual(backend.demoDeniedRpcs(), ['grc_platform_set_level']);
  await rejects(as('Karan', 'grc_platform_set_level', { p_user: emp('Vijay'), p_level: 'member' }), 'DENIED', /Not available in the public demo: .+\. Use the authenticated workspace\./);
  await rejects(backend.demoRpc('grc_devices', {}), 'DENIED', /Not available in the public demo: grc_devices is not part of the simulated backend/);
});

// ---------------------------------------------------------------------------------------------- production parity
/** The production world as captured: seed + the excluded test data, in production heap order. */
function productionWorld() {
  const world = worldFromSeed(SEED);
  const db = world.db;
  for (const [table, positions] of Object.entries(EXCLUDED.positions)) positions.forEach((pos, k) => db[table].splice(pos, 0, structuredClone(EXCLUDED[table][k])));
  const full = new Map(EXCLUDED.audit.map(e => [e.id, e]));
  db.audit = db.audit.map(e => (e.withheld === 'test_data' ? structuredClone(full.get(e.id)) : e));
  for (const p of EXCLUDED.risk_patches) Object.assign(db.risks.find(r => r.id === p.id), p);
  world.offsetMs = 0; world.dayShift = 0;
  return world;
}
const PERSONA_CODES = { karan: 'Karan', vijay: 'Vijay', vandana: 'Vandana', nandini: 'Nandini', srija: 'Srija', pavan: 'Pavan', lea: 'Léa', thomas: 'Thomas',
  camille: 'Camille', julie: 'Julie', auditor: 'Internal Auditor (Professor access)' };

test('the simulated reads reproduce every captured production result byte for byte', () => {
  const world = productionWorld();
  const id = (table, ref) => world.db[table].find(x => x.ref === ref).id;
  const argsFor = key => {
    const [fn, ...rest] = key.split('|');
    const org = { p_org: 'NT' };
    switch (fn) {
      case 'grc_session': case 'grc_verify_audit_chain': case 'grc_platform_access': return [fn, {}];
      case 'grc_my_notifications': return [fn, { p_limit: Number(rest[0]) }];
      case 'grc_actions': case 'grc_incidents': return [fn, { ...org, p_include_archived: rest[0] === 'true' }];
      case 'grc_audit': {
        const a = { ...org, p_limit: Number(rest[0]), p_before: null, p_stage: null, p_search: null };
        for (const r of rest.slice(1)) {
          if (r.startsWith('search:')) a.p_search = r.slice(7); else if (r.startsWith('before:')) a.p_before = Number(r.slice(7)); else a.p_stage = r;
        }
        return [fn, a];
      }
      case 'grc_action': return [fn, { p_id: id('actions', rest[0]) }];
      case 'grc_incident': return [fn, { p_id: id('incidents', rest[0]) }];
      case 'grc_incident_regulatory': return [fn, { ...org, p_incident: id('incidents', rest[0]) }];
      case 'grc_control': case 'grc_framework': case 'grc_vendor': case 'grc_policy': return [fn, { ...org, p_id: rest[0] }];
      case 'grc_policy_preview': return [fn, { ...org, p_action_type: rest[0], p_severity: Number(rest[1]), p_asset: rest[2] === 'null' ? null : rest[2], p_amount: rest[3] === 'null' ? null : Number(rest[3]) }];
      default: return [fn, org];
    }
  };
  let checked = 0;
  const differences = [];
  for (const [key, hashes] of Object.entries(PARITY.calls)) {
    for (const [hash, personas] of Object.entries(hashes)) {
      for (const code of personas) {
        const [fn, args] = argsFor(key);
        const value = callRpc(world, fn, args, { userEmployeeId: emp(PERSONA_CODES[code]), now: SNAPSHOT_MS }).value;
        if (fn === 'grc_board') delete value.generated_at;
        if (fn === 'grc_verify_audit_chain') delete value.verified_at;
        checked++;
        if (sha256Hex(pgText(value)).slice(0, 16) !== hash) differences.push(`${key} as ${code}`);
      }
    }
  }
  assert.equal(checked, 1144);
  assert.deepEqual(differences, []);
});

// ---------------------------------------------------------------------------------------------- fixtures
test('fixtures: NT only, no auth user ids or tokens, test data excluded, snapshot time recorded', () => {
  const text = readFileSync(join(root, 'src/enterprise/demo/fixtures/seed.json'), 'utf8');
  assert.equal(SEED.meta.snapshot_at, '2026-10-27T22:00:00.000Z');
  assert.doesNotMatch(text, /"user_id"/);
  assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'no JWT');
  assert.doesNotMatch(text, /sb_publishable|sb_secret|service_role|supabase\.co/i);
  assert.doesNotMatch(text, /"TEST"/);
  for (const e of SEED.employees) { assert.equal(e.org_id, 'NT'); if (e.email) assert.match(e.email, /@novatech\.example$/); }
  const walk = (v, path) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') {
      if ('org_id' in v && v.org_id !== 'NT') {
        assert.ok(path.startsWith('audit') && v.withheld === 'other_organisation', `${path} belongs to another organisation`);
        assert.deepEqual(Object.keys(v).sort(), ['hash', 'id', 'org_id', 'prev_hash', 'withheld']);
      }
      for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
    }
  };
  walk(Object.fromEntries(Object.entries(SEED).filter(([k]) => k !== 'meta')), '');
  assert.ok(EXCLUDED.actions.some(a => a.ref === 'ACT-1057'), 'the TEST rehearsal is listed as excluded');
});

test('fixtures are loaded lazily: only the demo backend imports them, dynamically', () => {
  const files = sourceFiles(join(root, 'src'));
  const importers = files.filter(f => /(import\s*\(|from\s+)['"][^'"]*fixtures\/[^'"]+\.json/.test(readFileSync(f, 'utf8'))).map(f => relative(root, f));
  assert.deepEqual(importers, ['src/enterprise/demo/demoBackend.ts']);
  assert.match(readFileSync(join(root, 'src/enterprise/demo/demoBackend.ts'), 'utf8'), /await import\('\.\/fixtures\/seed\.json\?raw'\)/);
  const supabaseTs = readFileSync(join(root, 'src/lib/supabase.ts'), 'utf8');
  assert.match(supabaseTs, /await import\('\.\.\/enterprise\/demo\/demoBackend\.ts'\)/);
  assert.doesNotMatch(supabaseTs, /^import .*demoBackend/m);
  assert.doesNotMatch(supabaseTs, /^export const supabase = createClient/m, 'no client is created at import time');
});

// ---------------------------------------------------------------------------------------------- personas
test('each persona gets its own NT session, work queue and permissions', async () => {
  setup();
  const personas = backend.demoPersonas();
  assert.equal(personas.length, 11);
  assert.equal(backend.getDemoPersona().full_name, 'Karan Deshmukh');
  const seen = [];
  const off = backend.subscribeDemo(e => seen.push(e.type));
  for (const p of personas) {
    backend.setDemoPersona(p.employee_id);
    const s = await backend.demoRpc('grc_session');
    assert.equal(s.user_id, null);
    assert.equal(s.email, p.email);
    assert.equal(s.memberships.length, 1);
    const m = s.memberships[0];
    assert.equal(m.org_id, 'NT');
    assert.equal(m.employee_id, p.employee_id);
    assert.equal(m.role, p.role);
    assert.deepEqual([...m.permissions].sort(), [...p.permissions].sort());
    const work = await backend.demoRpc('grc_my_work', { p_org: 'NT' });
    assert.equal(work.me.id, p.employee_id);
    const home = await backend.demoRpc('grc_home', { p_org: 'NT' });
    assert.equal(home.me.name, p.full_name);
  }
  off();
  assert.equal(seen.filter(t => t === 'persona').length, 10, 'one event per actual switch (Karan was already current)');
  assert.throws(() => backend.setDemoPersona('00000000-0000-0000-0000-000000000000'), /NOT_FOUND/);
  // The choice is remembered.
  backend.setDemoPersona(emp('Vijay'));
  demoSession.resetDemoPersonaMemory();
  assert.equal(backend.getDemoPersona().full_name, 'Vijay Bhosale');
  // Only Karan (owner) and Vijay (admin) carry elevated platform roles; the auditor is read-only.
  assert.equal((await as('Karan', 'grc_platform_access')).me, 'owner');
  const auditorPerms = (await as('Internal Auditor (Professor access)', 'grc_session')).memberships[0].permissions;
  assert.deepEqual(auditorPerms, ['audit.view']);
  await rejects(as('Internal Auditor (Professor access)', 'grc_propose_action', { p_org: 'NT', p: { action_type: 'treatment_task', title: 'x' } }), 'DENIED', /requires permission "action.propose"/);
});

// ---------------------------------------------------------------------------------------------- action lifecycle
test('payment hold ≥ €100,000: requester cannot approve, the CEO is added, dual control, executor, verification', async () => {
  setup();
  const id = await as('Srija', 'grc_propose_action', { p_org: 'NT', p: {
    action_type: 'payment_hold', title: 'Hold supplier payment of €184,500 pending call-back', amount: 184500, asset_id: 'NT-AST-ERP', risk_id: 'NT-R7', severity: 3,
    justification: 'Bank details changed after a risky sign-in.',
  } });
  let a = await as('Srija', 'grc_action', { p_id: id });
  assert.equal(a.ref, 'ACT-1059');
  assert.equal(a.status, 'draft');
  assert.deepEqual(a.policy.matched_rules.map(r => r.role), ['Finance Director (CFO / DAF)', 'Chief Executive Officer (CEO)']);

  // The CFO requested it and holds the assessor role: assessment is recorded, routing starts.
  assert.equal(await as('Srija', 'grc_submit_action', { p_id: id }), 'awaiting_approval');
  a = await as('Srija', 'grc_action', { p_id: id });
  assert.deepEqual(a.approvals.map(x => [x.step, x.role, x.status]), [[1, 'Finance Director (CFO / DAF)', 'pending'], [2, 'Chief Executive Officer (CEO)', 'waiting']]);
  await rejects(as('Srija', 'grc_decide', { p_id: id, p_decision: 'approve' }), 'DENIED', /you requested this action and cannot approve it/);
  await rejects(as('Vijay', 'grc_decide', { p_id: id, p_decision: 'approve' }), 'DENIED', /Policy requires the Finance Director \(CFO \/ DAF\) for this decision/);
  assert.equal(a.ops.approve.allowed, false);

  // Srija delegates her CFO authority to Karan, who approves step 1 on her behalf.
  await as('Srija', 'grc_delegate', { p_org: 'NT', p_to: emp('Karan'), p_until: new Date(clock + 2 * DAY).toISOString(), p_reason: 'Annual leave' });
  assert.equal(await as('Karan', 'grc_decide', { p_id: id, p_decision: 'approve', p_comment: 'Call-back pending; hold is proportionate.' }), 'awaiting_approval');
  a = await as('Karan', 'grc_action', { p_id: id });
  assert.equal(a.approvals[0].status, 'approved');
  assert.equal(a.approvals[0].on_behalf_of.name, 'Srija Poudapally');
  assert.equal(a.approvals[1].status, 'pending');
  assert.match(a.timeline.at(-1).summary, /approved by Karan Deshmukh on behalf of Srija Poudapally \(delegation\) \(step 1: Finance Director \(CFO \/ DAF\)\)/);

  // ≥ €100,000: the CEO's own queue and notifications now hold the decision.
  const work = await as('Vandana', 'grc_my_work', { p_org: 'NT' });
  assert.equal(work.tasks.find(t => t.id === id)?.task, 'approve');
  const notes = await as('Vandana', 'grc_my_notifications', { p_limit: 20 });
  assert.match(notes.items[0].title, /^Approval required: ACT-1059$/);
  assert.match(notes.items[0].body, /step 2 — previous step approved by Karan Deshmukh/);

  // Dual control: even with the CEO's delegated authority, Karan cannot approve a second step.
  await as('Vandana', 'grc_delegate', { p_org: 'NT', p_to: emp('Karan'), p_until: new Date(clock + DAY).toISOString(), p_reason: 'Travelling' });
  await rejects(as('Karan', 'grc_decide', { p_id: id, p_decision: 'approve' }), 'DENIED', /Dual control: a different person must approve this step/);
  assert.equal(await as('Vandana', 'grc_decide', { p_id: id, p_decision: 'approve', p_comment: 'Approved.' }), 'approved');
  assert.ok((await as('Léa', 'grc_my_notifications', { p_limit: 5 })).items.some(n => n.kind === 'execution_ready' && n.entity_id === id));

  // Only Accounts Payable executes; approvers never do.
  await rejects(as('Karan', 'grc_start_execution', { p_id: id }), 'DENIED', /Only Accounts Payable Officer can execute "Hold \/ restrict a supplier payment"/);
  assert.equal(await as('Léa', 'grc_start_execution', { p_id: id }), 'in_progress');
  await rejects(as('Léa', 'grc_record_execution', { p_id: id, p_outcome: 'success', p_notes: '' }), 'VALIDATION', /notes are required/);
  assert.equal(await as('Léa', 'grc_record_execution', { p_id: id, p_outcome: 'success', p_notes: 'Hold placed in the ERP.' }), 'awaiting_verification');
  await rejects(as('Léa', 'grc_verify_action', { p_id: id }), 'DENIED', /Your role cannot perform verification/);

  // Verification by the CFO: the call-back attestation is required.
  let v = await as('Srija', 'grc_verify_action', { p_id: id, p_confirmations: {} });
  assert.equal(v.passed, false);
  v = await as('Srija', 'grc_verify_action', { p_id: id, p_confirmations: { callback: true }, p_notes: 'Supplier confirmed by phone.', p_residual_likelihood: 2, p_residual_impact: 3 });
  assert.equal(v.passed, true);
  a = await as('Karan', 'grc_action', { p_id: id });
  assert.equal(a.status, 'completed');
  assert.equal(a.next.stage, 'done');
  assert.deepEqual(a.timeline.map(t => t.event), ['action_proposed', 'action_submitted', 'approval_requested', 'approval_granted', 'approval_granted', 'action_authorised',
    'execution_started', 'execution_completed', 'verification_failed', 'verification_passed']);
  const r7 = (await as('Karan', 'grc_risks', { p_org: 'NT' })).find(r => r.id === 'NT-R7');
  assert.equal(r7.residual_score, 6);
  assert.equal(r7.status, 'treating');

  // The dual-control monitor sees one €100k+ decision with two distinct approvers.
  const run = await as('Karan', 'grc_monitor_run', { p_org: 'NT' });
  assert.deepEqual(run.find(r => r.code === 'C-08'), { code: 'C-08', result: 'pass', detail: '1 authorised payment decisions of €100,000 or more; 0 without two distinct approvers.' });
  assert.equal(run.find(r => r.code === 'C-02').result, 'pass');
});

test('below €100,000 the CFO alone decides; an executor never verifies their own work', async () => {
  setup();
  const small = await as('Nandini', 'grc_policy_preview', { p_org: 'NT', p_action_type: 'payment_hold', p_severity: 3, p_asset: 'NT-AST-ERP', p_amount: 50000 });
  assert.deepEqual(small.approvals.map(x => x.role), ['Finance Director (CFO / DAF)']);
  const big = await as('Nandini', 'grc_policy_preview', { p_org: 'NT', p_action_type: 'payment_hold', p_severity: 3, p_asset: 'NT-AST-ERP', p_amount: 184500 });
  assert.deepEqual(big.approvals.map(x => x.role), ['Finance Director (CFO / DAF)', 'Chief Executive Officer (CEO)']);

  // A treatment task without budget is authorised by policy; Julie (responsible) executes it.
  const id = await as('Karan', 'grc_propose_action', { p_org: 'NT', p: { action_type: 'treatment_task', title: 'Update the delivery runbook', responsible_id: emp('Julie'), accountable_id: emp('Julie') } });
  assert.equal(await as('Karan', 'grc_submit_action', { p_id: id }), 'approved');
  await rejects(as('Karan', 'grc_start_execution', { p_id: id }), 'DENIED', /Only the responsible employee can execute/);
  assert.equal(await as('Julie', 'grc_start_execution', { p_id: id }), 'in_progress');
  assert.equal(await as('Julie', 'grc_record_execution', { p_id: id, p_outcome: 'success', p_notes: 'Runbook v2 published.' }), 'awaiting_verification');
  await rejects(as('Julie', 'grc_verify_action', { p_id: id }), 'DENIED', /Independence: the person who executed the action cannot verify it/);
  assert.equal((await as('Karan', 'grc_verify_action', { p_id: id })).passed, true);

  // A requester cannot assess their own request.
  const fw = await as('Vijay', 'grc_propose_action', { p_org: 'NT', p: { action_type: 'firewall_change', title: 'Block outbound C2 range', asset_id: 'NT-AST-FW', severity: 3 } });
  assert.equal(await as('Vijay', 'grc_submit_action', { p_id: fw }), 'awaiting_approval', 'the RSSI holds the assessor role, so routing starts');
  await rejects(as('Vijay', 'grc_decide', { p_id: fw, p_decision: 'approve' }), 'DENIED', /you requested this action/);
  const iso = await as('Nandini', 'grc_propose_action', { p_org: 'NT', p: { action_type: 'isolate_endpoint', title: 'Isolate LT-07', asset_id: 'NT-AST-LT07', severity: 3 } });
  assert.equal(await as('Nandini', 'grc_submit_action', { p_id: iso }), 'under_review');
  await rejects(as('Nandini', 'grc_assess_action', { p_id: iso, p_assessment: 'ok', p_recommend: true }), 'DENIED', /Assessment is reserved for the RSSI/);
});

// ---------------------------------------------------------------------------------------------- every writer
test('every writer used by the pages runs against the simulated backend', async () => {
  setup();
  const called = new Set();
  const call = async (who, fn, args) => { called.add(fn); return as(who, fn, args); };
  const org = { p_org: 'NT' };
  // Action lifecycle, including notes, RACI, reassignment, scheduling, reopening and cancelling.
  const t1 = await call('Karan', 'grc_propose_action', { ...org, p: { action_type: 'treatment_task', title: 'Patch the build agents', accountable_id: emp('Julie') } });
  assert.equal(await call('Karan', 'grc_add_note', { p_entity_type: 'action', p_id: t1, p_note: 'Coordinate with delivery.' }), 'ok');
  assert.equal(await call('Karan', 'grc_set_raci', { ...org, p_entity_type: 'action', p_entity_id: t1, p_employee: emp('Camille'), p_raci: 'C', p_on: true }), 'ok');
  assert.equal(await call('Karan', 'grc_set_raci', { ...org, p_entity_type: 'action', p_entity_id: t1, p_employee: emp('Camille'), p_raci: 'C', p_on: false }), 'ok');
  assert.equal(await call('Karan', 'grc_reassign_action', { p_id: t1, p_field: 'responsible', p_employee: emp('Julie'), p_reason: 'Owner of the build platform' }), 'ok');
  assert.equal(await call('Karan', 'grc_submit_action', { p_id: t1 }), 'approved');
  assert.equal(await call('Julie', 'grc_schedule_action', { p_id: t1, p_when: new Date(clock + 3600e3).toISOString() }), 'scheduled');
  assert.equal(await call('Julie', 'grc_start_execution', { p_id: t1 }), 'in_progress');
  assert.equal(await call('Julie', 'grc_record_execution', { p_id: t1, p_outcome: 'failed', p_notes: 'Agent 3 unreachable.' }), 'failed');
  assert.equal(await call('Karan', 'grc_reopen_action', { p_id: t1, p_reason: 'Retry after network fix' }), 'reopened');
  assert.equal(await call('Karan', 'grc_cancel_action', { p_id: t1, p_reason: 'Superseded by the platform migration' }), 'cancelled');
  assert.equal(await call('Karan', 'grc_verify_action', { p_id: t1 }).catch(e => e.message), 'DENIED: The action is not awaiting verification.');
  // Assessment, information request, emergency.
  const iso = await call('Nandini', 'grc_propose_action', { ...org, p: { action_type: 'isolate_endpoint', title: 'Isolate LT-07', asset_id: 'NT-AST-LT07', severity: 3 } });
  assert.equal(await call('Nandini', 'grc_submit_action', { p_id: iso }), 'under_review');
  assert.equal(await call('Vijay', 'grc_assess_action', { p_id: iso, p_assessment: 'Confirmed beaconing; isolate.', p_recommend: true, p_severity: 4 }), 'awaiting_approval');
  assert.equal(await call('Vijay', 'grc_decide', { p_id: iso, p_decision: 'request_info', p_comment: 'Which VLAN?' }), 'submitted');
  assert.equal(await call('Nandini', 'grc_respond_info', { p_id: iso, p_response: 'Corporate VLAN 20.' }), 'awaiting_approval');
  assert.equal(await call('Vijay', 'grc_invoke_emergency', { p_id: iso, p_reason: 'Active exfiltration in progress' }), 'approved');
  assert.equal((await as('Vijay', 'grc_action', { p_id: iso })).emergency, true);
  // Rejection and escalation.
  const lock = await call('Nandini', 'grc_propose_action', { ...org, p: { action_type: 'lock_device', title: 'Lock LT-07', asset_id: 'NT-AST-LT07', severity: 2 } });
  assert.equal(await call('Nandini', 'grc_submit_action', { p_id: lock }), 'awaiting_approval');
  assert.equal(await call('Pavan', 'grc_decide', { p_id: lock, p_decision: 'reject', p_comment: 'Already isolated.' }), 'rejected');
  const lock2 = await call('Nandini', 'grc_propose_action', { ...org, p: { action_type: 'lock_device', title: 'Lock LT-09', asset_id: 'NT-AST-LT07', severity: 3 } });
  await call('Nandini', 'grc_submit_action', { p_id: lock2 });
  assert.equal(await call('Vijay', 'grc_decide', { p_id: lock2, p_decision: 'escalate', p_comment: 'Executive device.' }), 'escalated');
  assert.equal((await as('Vandana', 'grc_my_work', org)).tasks.find(t => t.id === lock2)?.task, 'approve');
  // Incidents and regulatory clocks.
  const inc = await call('Karan', 'grc_create_incident', { ...org, p: { title: 'Phishing wave on finance', severity: 3, category: 'Phishing', assigned_to: emp('Nandini'), risk_id: 'NT-R2' } });
  assert.equal(await call('Nandini', 'grc_incident_transition', { p_id: inc, p_status: 'investigating', p_note: 'Triage started.' }), 'investigating');
  assert.equal(await call('Vijay', 'grc_assess_incident', { p_id: inc, p_kind: 'security', p_summary: 'Credential theft attempt', p_severity: 3, p_recommendation: 'Reset passwords' }), 'ok');
  assert.equal(await call('Srija', 'grc_assess_incident', { p_id: inc, p_kind: 'financial', p_summary: 'No payment released', p_severity: 2, p_recommendation: 'Monitor' }), 'ok');
  const reg = await call('Karan', 'grc_incident_regulatory_set', { ...org, p_incident: inc, p: { regimes: ['NIS2', 'GDPR'], personal_data: true, significant: true, aware_at: new Date(clock - 3600e3).toISOString() } });
  assert.deepEqual(reg.notifications.map(n => `${n.regime} ${n.stage}`), ['GDPR 1 · Notify the CNIL', 'GDPR 2 · Inform data subjects (if high risk)', 'NIS2 1 · Early warning', 'NIS2 2 · Incident notification', 'NIS2 3 · Final report']);
  assert.equal(Date.parse(reg.notifications[2].due_at), clock - 3600e3 + DAY, 'the NIS2 early warning is due 24 h after awareness');
  const sent = await call('Karan', 'grc_reg_mark_sent', { ...org, p_id: reg.notifications[2].id, p_reference: 'ANSSI-2026-117' });
  assert.ok(sent.notifications[2].sent_at);
  // Monitoring: a KRI breach opens an alert, which can open an incident.
  const st = await call('Karan', 'grc_record_kri', { ...org, p_legacy_risk: 'R1', p_value: 99.2, p_note: 'Zone B degraded' });
  assert.equal(st.level, 'critical');
  const alert = (await as('Karan', 'grc_monitoring', org)).alerts[0];
  assert.equal(alert.message, 'R1: Cloud availability reached 99.2. Critical threshold reached.');
  const fromAlert = await call('Karan', 'grc_incident_from_alert', { ...org, p_alert_id: alert.id });
  assert.equal((await as('Karan', 'grc_monitoring', org)).alerts[0].incident.id, fromAlert);
  assert.ok((await as('Pavan', 'grc_my_notifications', { p_limit: 10 })).items.some(n => n.kind === 'kri_critical'), 'the risk owner is alerted');
  // Register, controls, EBIOS, quantification, vendors, continuity, policies.
  assert.equal(await call('Karan', 'grc_risk_save', { ...org, p: { id: 'NT-R8', likelihood: 2, impact: 4, owner_id: emp('Srija') } }), 'NT-R8');
  assert.ok((await call('Karan', 'grc_monitor_run', org)).length >= 10);
  assert.equal((await call('Karan', 'grc_control_test_record', { ...org, p_control: 'NT-C01', p_result: 'pass', p_detail: 'Policy set approved by the CEO on file.' })).result, 'pass');
  const item = await call('Karan', 'grc_ebios_item_save', { ...org, p_id: null, p: { workshop: 4, kind: 'operational_scenario', ref: 'SO4', title: 'Supplier portal takeover', data: { likelihood: 2 } } });
  assert.match(item.id, /^EB-[0-9A-F]{6}$/);
  assert.equal((await call('Karan', 'grc_ebios_item_save', { ...org, p_id: item.id, p: { title: 'Supplier portal takeover (revised)' } })).title, 'Supplier portal takeover (revised)');
  assert.deepEqual(await call('Karan', 'grc_quant_save', { ...org, p_risk: 'NT-R7', p: { tef_min: 0.5, tef_ml: 1, tef_max: 3, vuln_min: 0.1, vuln_ml: 0.3, vuln_max: 0.6, lm_min: 20000, lm_ml: 120000, lm_max: 400000, rationale: 'Revised after INC review' } }), { ok: true });
  const answers = Object.fromEntries(['cert', 'mfa', 'encryption', 'incident_notice', 'subprocessors', 'bcp_tested', 'vuln_mgmt', 'eu_data', 'audit_right', 'exit_clause'].map((k, i) => [k, i % 3 === 0 ? 'yes' : i % 3 === 1 ? 'partial' : 'no']));
  const va = await call('Karan', 'grc_vendor_assess', { ...org, p_vendor: 'NT-V01', p_answers: answers, p_findings: 'Exit plan untested.' });
  assert.deepEqual(Object.keys(va).sort(), ['residual', 'score']);
  assert.deepEqual(await call('Karan', 'grc_bcp_test_record', { ...org, p_process: 'NT-P1', p: { result: 'partial', test_type: 'Tabletop exercise', achieved_rto_hours: 5, notes: 'Failover took 5 h.' } }), { ok: true });
  const policy = (await as('Karan', 'grc_policies', org)).find(p => p.status === 'approved' && p.in_audience);
  assert.deepEqual(await call('Karan', 'grc_policy_attest', { ...org, p_policy: policy.id }), { ok: true });
  assert.ok((await as('Karan', 'grc_policy', { ...org, p_id: policy.id })).my_attestation);
  // Delegation and notifications.
  const del = await call('Vandana', 'grc_delegate', { ...org, p_to: emp('Srija'), p_until: new Date(clock + 3 * DAY).toISOString(), p_reason: 'Board travel' });
  assert.equal((await as('Srija', 'grc_session')).memberships[0].delegated_roles[0].role, 'Chief Executive Officer (CEO)');
  assert.equal(await call('Vandana', 'grc_revoke_delegation', { p_id: del }), 'revoked');
  assert.ok(await call('Karan', 'grc_notifications_mark', { p_ids: null, p_mode: 'read' }) > 0);
  assert.equal((await as('Karan', 'grc_my_notifications', { p_limit: 50 })).unread, 0);
  // Administration.
  const newEmp = await call('Karan', 'grc_admin_employee_save', { ...org, p: { full_name: 'Hugo Petit', role_id: 'NT-analyst', email: 'hugo.petit@novatech.example' } });
  assert.equal(await call('Karan', 'grc_admin_employee_save', { ...org, p: { id: newEmp, role_id: 'NT-sysadmin' } }), newEmp);
  const rule = await call('Karan', 'grc_admin_rule_save', { ...org, p: { action_type: 'restore_backup', step: 3, approver_role_id: 'NT-cfo', min_amount: 50000, rationale: 'Costly restores need the CFO.' } });
  assert.equal(await call('Karan', 'grc_admin_rule_save', { ...org, p: { id: rule, approver_role_id: 'NT-cfo', active: false, rationale: 'Paused pending review.' } }), rule);
  assert.deepEqual((await call('Karan', 'grc_admin_set_active', { p_emp: newEmp, p_active: false, p_reason: 'Left the company' })).open_items, []);
  assert.equal(await call('Karan', 'grc_admin_set_permission', { p_role: 'NT-hr', p_perm: 'kri.record', p_grant: true }), 'ok');
  assert.ok((await as('Camille', 'grc_session')).memberships[0].permissions.includes('kri.record'));
  assert.equal(await call('Karan', 'grc_admin_set_permission', { p_role: 'NT-hr', p_perm: 'kri.record', p_grant: false }), 'ok');
  await rejects(as('Karan', 'grc_admin_set_permission', { p_role: 'NT-riskco', p_perm: 'org.admin', p_grant: false }), 'VALIDATION', /cannot remove your own administration right/);
  // Guided scenarios.
  await rejects(as('Karan', 'grc_scenario_start', { p_code: 'A' }), 'DENIED', /already running/);
  const runB = await call('Karan', 'grc_scenario_start', { p_code: 'B' });
  assert.equal(await call('Karan', 'grc_scenario_set_paused', { p_run: runB, p_paused: true }), 'paused');
  assert.equal(await call('Karan', 'grc_scenario_set_paused', { p_run: runB, p_paused: false }), 'active');
  assert.equal(await call('Karan', 'grc_scenario_reset', { p_run: runB, p_reason: 'Rehearsal done' }), 'reset');
  assert.equal((await as('Karan', 'grc_scenarios', org)).find(s => s.code === 'B').run.status, 'reset');

  const writers = SRC_RPCS.filter(f => RPC[f].write && !backend.demoDeniedRpcs().includes(f));
  assert.deepEqual(writers.filter(f => !called.has(f)), [], 'every writer was exercised');
  const chain = await as('Karan', 'grc_verify_audit_chain');
  assert.equal(chain.ok, true);
});

// ---------------------------------------------------------------------------------------------- incidents and risks
test('incident transitions follow investigator and closing rules', async () => {
  setup();
  const inc = SEED.incidents.find(i => i.ref === 'INC-1058');
  await rejects(as('Thomas', 'grc_incident_transition', { p_id: inc.id, p_status: 'investigating', p_note: 'x' }), 'DENIED', /only the assigned investigator or a security role/);
  assert.equal(await as('Nandini', 'grc_incident_transition', { p_id: inc.id, p_status: 'investigating', p_note: 'Correlated with the SIEM alert.' }), 'investigating');
  await rejects(as('Nandini', 'grc_incident_transition', { p_id: inc.id, p_status: 'investigating', p_note: 'again' }), 'DENIED', /investigation has already started/);
  const act = await as('Nandini', 'grc_propose_action', { p_org: 'NT', p: { action_type: 'payment_hold', title: 'Hold payment', incident_id: inc.id, amount: 184500 } });
  await rejects(as('Vijay', 'grc_incident_transition', { p_id: inc.id, p_status: 'closed', p_note: 'done' }), 'DENIED', /1 linked action\(s\) are not completed or cancelled/);
  await as('Nandini', 'grc_cancel_action', { p_id: act, p_reason: 'Duplicate' });
  assert.equal(await as('Vijay', 'grc_incident_transition', { p_id: inc.id, p_status: 'closed', p_note: 'Contained and verified.' }), 'closed');
  const detail = await as('Karan', 'grc_incident', { p_id: inc.id });
  assert.equal(detail.status, 'closed');
  assert.deepEqual(detail.timeline.slice(-2).map(e => e.event), ['action_cancelled', 'incident_closed']);
  assert.ok((await as('Vandana', 'grc_my_notifications', { p_limit: 5 })).items.some(n => n.kind === 'incident_closed'));
  const scen = (await as('Karan', 'grc_scenarios', { p_org: 'NT' })).find(s => s.code === 'A');
  assert.equal(scen.steps.find(s => s.check === 'investigating').done, true);
  assert.equal(scen.steps.find(s => s.check === 'closed').done, true);
});

test('risk register saves update scores, owners and the ledger', async () => {
  setup();
  await rejects(as('Thomas', 'grc_risk_save', { p_org: 'NT', p: { id: 'NT-R7', likelihood: 4, owner_id: emp('Srija') } }), 'DENIED', /Managing the risk register requires permission "risk.manage"/);
  assert.equal(await as('Karan', 'grc_risk_save', { p_org: 'NT', p: { id: 'NT-R7', likelihood: 4, impact: 4, owner_id: emp('Vijay') } }), 'NT-R7');
  const r7 = (await as('Karan', 'grc_risks', { p_org: 'NT' })).find(r => r.id === 'NT-R7');
  assert.deepEqual([r7.score, r7.level, r7.owner.name], [16, 'Critical', 'Vijay Bhosale']);
  assert.deepEqual(r7.raci.filter(x => x.raci === 'A').map(x => x.employee.name), ['Vijay Bhosale']);
  // A legacy-linked risk keeps its scores in the legacy register.
  await as('Karan', 'grc_risk_save', { p_org: 'NT', p: { id: 'NT-R1', likelihood: 2, owner_id: emp('Pavan') } });
  assert.equal((await as('Karan', 'grc_risks', { p_org: 'NT' })).find(r => r.id === 'NT-R1').score, 8);
  // New risk: id from the shared reference sequence, owner notified.
  const id = await as('Karan', 'grc_risk_save', { p_org: 'NT', p: { title: 'Key supplier insolvency', likelihood: 2, impact: 3, owner_id: emp('Pavan'), category: 'Third party' } });
  assert.equal(id, 'NT-R1059');
  const created = (await as('Pavan', 'grc_risks', { p_org: 'NT' })).find(r => r.id === id);
  assert.deepEqual([created.code, created.score, created.origin], ['R1059', 6, 'governance_upgrade']);
  assert.ok((await as('Pavan', 'grc_my_notifications', { p_limit: 5 })).items.some(n => n.kind === 'risk_assigned' && n.entity_id === id));
  await rejects(as('Karan', 'grc_risk_save', { p_org: 'NT', p: { title: 'Bad scale', likelihood: 5, impact: 2, owner_id: emp('Pavan') } }), 'VALIDATION', /1–4 scale/);
  const audit = await as('Karan', 'grc_audit', { p_org: 'NT', p_limit: 3 });
  assert.deepEqual(audit.items.map(e => e.event), ['risk_identified', 'risk_updated', 'risk_updated']);
});

// ---------------------------------------------------------------------------------------------- ledger
test('the ledger chains new entries from the last production hash, verifies, and detects tampering', async () => {
  const storage = setup();
  const before = await as('Karan', 'grc_verify_audit_chain');
  assert.deepEqual([before.ok, before.checked, before.first_broken_id], [true, SEED.audit.length, null]);
  const last = SEED.audit[SEED.audit.length - 1];
  assert.equal(before.head, last.hash.slice(0, 16));

  await as('Karan', 'grc_add_note', { p_entity_type: 'incident', p_id: SEED.incidents[1].id, p_note: 'Ledger test note' });
  await as('Karan', 'grc_control_test_record', { p_org: 'NT', p_control: 'NT-C11', p_result: 'pass', p_detail: 'Chain recomputed.' });
  const items = (await as('Karan', 'grc_audit', { p_org: 'NT', p_limit: 2 })).items;
  assert.equal(items[1].prev_hash, last.hash, 'the first simulated entry links to the last production entry');
  assert.equal(items[0].prev_hash, items[1].hash);
  assert.equal(items[1].id, last.id + 1);
  for (const e of items) { assert.equal(e.details.simulated, true); assert.match(e.hash, /^[0-9a-f]{64}$/); }
  assert.equal(items[1].actor, 'Karan Deshmukh');
  assert.equal(items[1].role, 'Project Manager / Risk Coordinator');
  const after = await as('Karan', 'grc_verify_audit_chain');
  assert.deepEqual([after.ok, after.checked], [true, SEED.audit.length + 2]);

  // Tamper with a stored entry: verification fails at that entry.
  const saved = JSON.parse(storage.getItem(backend.DEMO_STORAGE_KEY));
  const victim = saved.db.audit.find(e => e.id === items[1].id);
  victim.summary += ' (edited afterwards)';
  storage.setItem(backend.DEMO_STORAGE_KEY, JSON.stringify(saved));
  backend.configureDemoBackend({ seed: SEED, now: () => clock, storage });
  const broken = await as('Karan', 'grc_verify_audit_chain');
  assert.deepEqual([broken.ok, broken.first_broken_id], [false, items[1].id]);
  const monitor = await as('Karan', 'grc_monitor_run', { p_org: 'NT' });
  assert.deepEqual(monitor.find(r => r.code === 'C-11'), { code: 'C-11', result: 'fail', detail: `Chain broken at entry #${items[1].id}.` });
  // A tampered production entry is detected as well.
  const saved2 = JSON.parse(storage.getItem(backend.DEMO_STORAGE_KEY));
  saved2.db.audit = saved2.db.audit.filter(e => e.id <= last.id);
  saved2.db.audit.find(e => e.id === 330).summary += ' (edited)';
  storage.setItem(backend.DEMO_STORAGE_KEY, JSON.stringify(saved2));
  backend.configureDemoBackend({ seed: SEED, now: () => clock, storage });
  assert.equal((await as('Karan', 'grc_verify_audit_chain')).first_broken_id, 330);
});

// ---------------------------------------------------------------------------------------------- persistence and reset
test('changes persist across reloads and reset restores the snapshot', async () => {
  const storage = setup();
  const pristine = await as('Karan', 'grc_actions', { p_org: 'NT', p_include_archived: true });
  const id = await as('Karan', 'grc_propose_action', { p_org: 'NT', p: { action_type: 'treatment_task', title: 'Persisted action', accountable_id: emp('Julie') } });
  assert.ok(storage.getItem(backend.DEMO_STORAGE_KEY));
  backend.configureDemoBackend({ seed: SEED, now: () => clock, storage });
  assert.ok((await as('Karan', 'grc_actions', { p_org: 'NT' })).some(a => a.id === id), 'reloaded from storage');

  const events = [];
  const off = backend.subscribeDemo(e => events.push(e.type));
  await backend.resetDemoData();
  off();
  assert.deepEqual(events, ['reset']);
  assert.equal(storage.getItem(backend.DEMO_STORAGE_KEY), null);
  assert.deepEqual(await as('Karan', 'grc_actions', { p_org: 'NT', p_include_archived: true }), pristine);
  assert.equal((await as('Karan', 'grc_verify_audit_chain')).checked, SEED.audit.length);
  assert.equal((await as('Karan', 'grc_audit', { p_org: 'NT', p_limit: 500 })).total, SEED.audit.filter(e => e.org_id === 'NT' && !e.withheld).length);
});

test('the demo works when browser storage is blocked', async () => {
  setup({ storage: new BlockedStorage() });
  globalThis.localStorage = new BlockedStorage();
  demoSession.resetDemoPersonaMemory();
  assert.equal(backend.getDemoPersona().full_name, 'Karan Deshmukh');
  backend.setDemoPersona(emp('Srija'));
  assert.equal(backend.getDemoPersona().full_name, 'Srija Poudapally');
  const id = await backend.demoRpc('grc_propose_action', { p_org: 'NT', p: { action_type: 'treatment_task', title: 'In-memory only', accountable_id: emp('Julie') } });
  assert.ok((await backend.demoRpc('grc_actions', { p_org: 'NT' })).some(a => a.id === id));
  await backend.resetDemoData();
  assert.ok(!(await backend.demoRpc('grc_actions', { p_org: 'NT' })).some(a => a.id === id));
});

// ---------------------------------------------------------------------------------------------- time
test('timestamps and dates are rebased onto the visitor clock, consistently in and out', async () => {
  setup({ at: SNAPSHOT_MS + 10 * DAY });
  const lastEvent = SEED.audit[SEED.audit.length - 1];
  const audit = await as('Karan', 'grc_audit', { p_org: 'NT', p_limit: 1 });
  assert.equal(Date.parse(audit.items[0].at), Date.parse(lastEvent.occurred_at) + 10 * DAY);
  const c01 = SEED.controls.find(c => c.id === 'NT-C01');
  const ctl = await as('Karan', 'grc_control', { p_org: 'NT', p_id: 'NT-C01' });
  assert.equal(ctl.next_test, new Date(Date.parse(c01.next_test) + 10 * DAY).toISOString().slice(0, 10));
  const act = await as('Karan', 'grc_action', { p_id: SEED.actions[0].id });
  assert.equal(Date.parse(act.deadline), Date.parse(SEED.actions[0].deadline) + 10 * DAY);
  assert.equal(act.overdue, false);
  // Microsecond precision survives the shift.
  assert.equal(act.updated_at.slice(19), SEED.actions[0].updated_at.slice(19));

  // Writing pins the offset: later, what happened keeps its age, and the snapshot does not move again.
  const written = clock;
  const id = await as('Karan', 'grc_propose_action', { p_org: 'NT', p: { action_type: 'treatment_task', title: 'Time test', accountable_id: emp('Julie'), responsible_id: emp('Julie'), deadline: new Date(written + 3 * DAY).toISOString() } });
  clock += 5 * 3600e3;
  const a = await as('Karan', 'grc_action', { p_id: id });
  assert.equal(Date.parse(a.created_at), written);
  assert.equal(Date.parse(a.deadline), written + 3 * DAY, 'incoming timestamps are shifted back, outgoing forward');
  assert.equal(Date.parse((await as('Karan', 'grc_audit', { p_org: 'NT', p_limit: 2 })).items[1].at), Date.parse(lastEvent.occurred_at) + 10 * DAY);
  await as('Karan', 'grc_submit_action', { p_id: id });
  const when = new Date(clock + 2 * 3600e3).toISOString();
  await as('Julie', 'grc_schedule_action', { p_id: id, p_when: when });
  const scheduled = await as('Julie', 'grc_action', { p_id: id });
  assert.equal(Date.parse(scheduled.scheduled_for), Date.parse(when));
  const paris = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(when));
  assert.ok(scheduled.timeline.at(-1).summary.endsWith(paris), 'the ledger text shows the time the visitor chose');
  // Dates written by the demo are the visitor's today.
  await as('Karan', 'grc_control_test_record', { p_org: 'NT', p_control: 'NT-C01', p_result: 'pass', p_detail: 'Annual review done.' });
  assert.equal((await as('Karan', 'grc_control', { p_org: 'NT', p_id: 'NT-C01' })).last_tested, new Date(clock).toISOString().slice(0, 10));
});

// ---------------------------------------------------------------------------------------------- extension hooks
test('overlays, handlers and change events extend the demo backend', async () => {
  setup();
  const offOverlay = backend.registerDemoOverlay('grc_home', (r, args, ctx) => ({ ...r, demo_note: `${ctx.persona.full_name} · ${args.p_org}` }));
  assert.equal((await as('Vijay', 'grc_home', { p_org: 'NT' })).demo_note, 'Vijay Bhosale · NT');
  offOverlay();
  assert.equal((await as('Vijay', 'grc_home', { p_org: 'NT' })).demo_note, undefined);

  const offHandler = backend.registerDemoHandler('grc_sentinel_status', async (args, ctx) => ({ ok: true, who: ctx.persona.employee_id, risks: (await ctx.call('grc_risks', { p_org: 'NT' })).length, args }));
  const r = await as('Karan', 'grc_sentinel_status', { x: 1 });
  assert.deepEqual(r, { ok: true, who: emp('Karan'), risks: 8, args: { x: 1 } });
  offHandler();
  await rejects(backend.demoRpc('grc_sentinel_status', {}), 'DENIED', /Not available in the public demo/);

  const events = [];
  const off = backend.subscribeDemo(e => events.push(e.type));
  backend.emitDemoChange();
  await as('Karan', 'grc_add_note', { p_entity_type: 'action', p_id: SEED.actions[0].id, p_note: 'event test' });
  await as('Karan', 'grc_risks', { p_org: 'NT' });
  off();
  assert.deepEqual(events, ['data', 'data']);
  const info = await backend.getDemoSnapshotInfo();
  assert.deepEqual([info.version, info.snapshotAt, info.pristine], ['nt-2026-10-27', '2026-10-27T22:00:00.000Z', false]);
});
