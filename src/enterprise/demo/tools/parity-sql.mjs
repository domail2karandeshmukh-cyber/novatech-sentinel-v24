#!/usr/bin/env node
/**
 * Prints the read-only SQL that fingerprints the production RPC results used by the parity test.
 *
 *   node src/enterprise/demo/tools/parity-sql.mjs <capture-dir> [persona …] > parity.sql
 *
 * (Optional persona codes restrict the statement, e.g. `karan victor`, to check a few personas.)
 *
 * Run the statement against the NOVATECH project and save the "manifest" value as
 * <capture-dir>/parity_manifest.json, then rebuild the fixtures (tools/build-fixtures.mjs).
 *
 * Each persona is evaluated in its own UNION ALL branch, impersonated with transaction-local JWT
 * claims (set_config(..., true)); only STABLE public.grc_* read functions are called. The sign-in
 * account of each persona is looked up from grc.employees by name, so no user id is written here.
 * (One branch per persona matters: inside a single multi-persona scan Postgres reuses the result of
 * the argument-less grc_session() for later rows.)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const capDir = process.argv[2];
if (!capDir) { console.error('usage: parity-sql.mjs <capture-dir>'); process.exit(1); }
const cap = name => JSON.parse(readFileSync(join(capDir, name), 'utf8'));
const c = cap('c_ops.json'), e = cap('e_controls.json'), f = cap('f_frameworks.json'), h = cap('h_resilience.json'), i = cap('i_policies.json');

const ALL_PERSONAS = [
  ['karan', 'Karan Deshmukh'], ['victor', 'Victor Bonnet'], ['vanessa', 'Vanessa Mallet'], ['nadia', 'Nadia Vasseur'], ['sarah', 'Sarah Perrin'],
  ['pierre', 'Pierre Sauvage'], ['lea', 'Léa Moreau'], ['thomas', 'Thomas Bernard'], ['camille', 'Camille Laurent'], ['julie', 'Julie Martin'],
  ['auditor', 'Internal Auditor (Professor access)'],
];
const only = process.argv.slice(3);
export const PERSONAS = only.length ? ALL_PERSONAS.filter(([code]) => only.includes(code)) : ALL_PERSONAS;
const q = s => (s === null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const calls = [];
const add = (key, expr) => calls.push([key, expr]);
// grc_session and grc_platform_access expose auth data: hash them with the same minimisation as the fixtures.
add('grc_session', `(select jsonb_set(jsonb_set(jsonb_set(r, '{user_id}', 'null'::jsonb), '{email}', to_jsonb((select e.email from grc.employees e where e.user_id = auth.uid() and e.org_id = 'NT' and s.c is not null))), '{memberships}', coalesce((select jsonb_agg(m order by o) from jsonb_array_elements(r->'memberships') with ordinality t(m, o) where m->>'org_id' = 'NT'), '[]'::jsonb)) from (select public.grc_session() r where s.c is not null) z)`);
add('grc_home', `public.grc_home('NT')`);
add('grc_my_work', `public.grc_my_work('NT')`);
add('grc_my_notifications|60', `public.grc_my_notifications(60)`);
add('grc_overview', `public.grc_overview('NT')`);
add('grc_org', `public.grc_org('NT')`);
add('grc_risks', `public.grc_risks('NT')`);
add('grc_actions|false', `public.grc_actions('NT', false)`);
add('grc_actions|true', `public.grc_actions('NT', true)`);
add('grc_incidents|false', `public.grc_incidents('NT', false)`);
add('grc_incidents|true', `public.grc_incidents('NT', true)`);
add('grc_controls', `public.grc_controls('NT')`);
add('grc_monitoring', `public.grc_monitoring('NT')`);
add('grc_compliance', `public.grc_compliance('NT')`);
add('grc_quant', `public.grc_quant('NT')`);
add('grc_ebios', `public.grc_ebios('NT')`);
add('grc_vendors', `public.grc_vendors('NT')`);
add('grc_continuity', `public.grc_continuity('NT')`);
add('grc_board', `(public.grc_board('NT') - 'generated_at')`);
add('grc_policies', `public.grc_policies('NT')`);
add('grc_audit|300', `public.grc_audit('NT', 300, null, null, null)`);
add('grc_audit|80', `public.grc_audit('NT', 80, null, null, null)`);
add('grc_audit|60|authorise', `public.grc_audit('NT', 60, null, 'authorise', null)`);
add('grc_audit|300|scenario', `public.grc_audit('NT', 300, null, 'scenario', null)`);
add('grc_audit|300|search:karan', `public.grc_audit('NT', 300, null, null, 'karan')`);
add('grc_audit|50|before:430', `public.grc_audit('NT', 50, 430, null, null)`);
add('grc_verify_audit_chain', `(public.grc_verify_audit_chain() - 'verified_at')`);
add('grc_scenarios', `public.grc_scenarios('NT')`);
add('grc_platform_access', `(select jsonb_set(r, '{users}', coalesce((select jsonb_agg(jsonb_set(jsonb_set(jsonb_set(u, '{user_id}', to_jsonb(e.id)), '{email}', to_jsonb(e.email)), '{last_sign_in}', 'null'::jsonb) order by o) from jsonb_array_elements(r->'users') with ordinality t(u, o) join grc.employees e on e.user_id = (u->>'user_id')::uuid and e.org_id = 'NT'), '[]'::jsonb)) from (select public.grc_platform_access() r where s.c is not null) z)`);
for (const a of c.actions) add(`grc_action|${a.ref}`, `public.grc_action(${q(a.id)})`);
for (const x of c.incidents) { add(`grc_incident|${x.ref}`, `public.grc_incident(${q(x.id)})`); add(`grc_incident_regulatory|${x.ref}`, `public.grc_incident_regulatory('NT', ${q(x.id)})`); }
for (const x of e.controls) add(`grc_control|${x.id}`, `public.grc_control('NT', ${q(x.id)})`);
for (const x of f.frameworks) add(`grc_framework|${x.id}`, `public.grc_framework('NT', ${q(x.id)})`);
for (const x of h.vendors) add(`grc_vendor|${x.id}`, `public.grc_vendor('NT', ${q(x.id)})`);
for (const x of i.policies) add(`grc_policy|${x.id}`, `public.grc_policy('NT', ${q(x.id)})`);
export const PREVIEWS = [
  ['payment_hold', 3, 'NT-AST-ERP', 184500], ['payment_hold', 3, 'NT-AST-ERP', 50000], ['server_shutdown', 4, 'NT-AST-APP01', null],
  ['disable_account', 3, 'NT-AST-IAM', null], ['treatment_task', 2, null, 15000], ['treatment_task', 2, null, null],
  ['lock_device', 2, 'NT-AST-LT07', null], ['endpoint_shutdown', 4, 'NT-AST-LT07', null], ['restore_backup', 3, 'NT-AST-BKP', null],
  ['activate_bcp', 4, null, null], ['firewall_change', 2, 'NT-AST-FW', null], ['isolate_endpoint', 3, 'NT-AST-LT07', null],
];
for (const [t, s, a, m] of PREVIEWS) add(`grc_policy_preview|${t}|${s}|${a}|${m}`, `public.grc_policy_preview('NT', ${q(t)}, ${s}, ${q(a)}, ${m === null ? 'null' : m})`);

const hashExpr = ex => `left(encode(sha256(convert_to((${ex})::text, 'UTF8')), 'hex'), 16)`;
// jsonb_build_object takes at most 100 arguments: build the map in chunks of 45 pairs.
const hashes = [];
for (let k = 0; k < calls.length; k += 45) hashes.push('jsonb_build_object(' + calls.slice(k, k + 45).map(([key, ex]) => `${q(key)}, ${hashExpr(ex)}`).join(',\n    ') + ')');
const branch = ([code, name]) => `  select ${q(code)} as code, x.j from
    (select set_config('request.jwt.claims', json_build_object('sub', (select e.user_id::text from grc.employees e where e.org_id = 'NT' and e.full_name = ${q(name)}), 'role', 'authenticated')::text, true) as c) s
    cross join lateral (select (${hashes.join(' ||\n    ')}) as j where s.c is not null) x`;
process.stdout.write(`-- Generated by src/enterprise/demo/tools/parity-sql.mjs (${calls.length} calls × ${PERSONAS.length} personas). Read-only.
with h as (
${PERSONAS.map(branch).join('\n  union all\n')}
), flat as (select h.code, k.key as call, k.value #>> '{}' as hash from h cross join lateral jsonb_each(h.j) k)
select jsonb_object_agg(call, g) as manifest, (select count(*) from flat) as calls
  from (select call, jsonb_object_agg(hash, codes) g from (select call, hash, jsonb_agg(code order by code) codes from flat group by call, hash) a group by call) b;
`);
