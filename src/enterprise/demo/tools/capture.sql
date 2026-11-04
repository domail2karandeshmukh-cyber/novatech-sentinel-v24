-- Capture queries of the public-demo snapshot (read-only).
--
-- Run each statement against the NOVATECH Supabase project (SQL editor, psql or the Supabase MCP
-- execute_sql tool) and save the JSON value of column "j" as the file named in its header, in one
-- capture directory. Every statement is a plain SELECT on grc.* / public.* tables: no function with
-- side effects is called and nothing is written. The md5 column lets you check that the saved file
-- is the exact jsonb text (node: md5 of pgText(JSON.parse(file)) must match).
--
-- Privacy: auth user ids never leave the database (employees.user_id becomes has_login; platform
-- access is keyed by employee id). Only organisation NT is read.
--
-- Then:  node src/enterprise/demo/tools/parity-sql.mjs <capture-dir> > parity.sql   (run it, save "manifest" as parity_manifest.json)
--        node src/enterprise/demo/tools/build-fixtures.mjs <capture-dir>
--        npm run test:enterprise

-- ===== a_core.json
with d as (select jsonb_build_object(
 'org', (select to_jsonb(o) from grc.organisations o where o.id = 'NT'),
 'departments', (select jsonb_agg(to_jsonb(x) order by x.id) from grc.departments x where x.org_id='NT'),
 'roles', (select jsonb_agg(to_jsonb(r) || jsonb_build_object('permissions', coalesce((select jsonb_agg(rp.permission order by rp.permission) from grc.role_permissions rp where rp.role_id = r.id and position('#' in rp.permission) = 0), '[]')) order by r.id) from grc.roles r where r.org_id='NT'),
 'employees', (select jsonb_agg((to_jsonb(e) - 'user_id') || jsonb_build_object('has_login', e.user_id is not null) order by e.full_name) from grc.employees e where e.org_id='NT'),
 'assets', (select jsonb_agg(to_jsonb(s) order by s.id) from grc.assets s where s.org_id='NT'),
 'action_types', (select jsonb_agg(to_jsonb(t) order by t.code) from grc.action_types t where t.org_id='NT'),
 'approval_rules', (select jsonb_agg(to_jsonb(r) order by r.id) from grc.approval_rules r where r.org_id='NT'),
 'platform_access', (select jsonb_agg(jsonb_build_object('employee_id', e.id, 'level', pa.level, 'granted_by', (select g.id from grc.employees g where g.user_id = pa.granted_by and g.org_id = 'NT'), 'granted_at', pa.granted_at, 'note', pa.note) order by e.full_name) from grc.platform_access pa join grc.employees e on e.user_id = pa.user_id and e.org_id = 'NT')
) as j)
select md5(j::text) as md5, length(j::text) as len, j from d;

-- ===== b_risks.json
with d as (select jsonb_build_object(
 'risks', (select jsonb_agg(to_jsonb(r) || jsonb_build_object('legacy', (select jsonb_build_object('likelihood', l.likelihood, 'impact', l.impact, 'treatment', l.treatment, 'residual_target_score', l.residual_target_score, 'priority_rank', l.priority_rank) from public.risks l where l.id = r.legacy_id)) order by r.id) from grc.risks r where r.org_id='NT'),
 'appetite', (select jsonb_agg(to_jsonb(a) order by a.sort) from grc.appetite a where a.org_id='NT'),
 'raci', (select jsonb_agg(jsonb_build_object('id', x.id, 'entity_type', x.entity_type, 'entity_id', x.entity_id, 'employee_id', x.employee_id, 'raci', x.raci) order by x.id) from grc.raci x where x.org_id='NT'),
 'kri_definitions', (select jsonb_agg(jsonb_build_object('id', k.id, 'risk_id', k.risk_id, 'name', k.name, 'unit', k.unit, 'direction', k.direction, 'warning_threshold', k.warning_threshold, 'critical_threshold', k.critical_threshold, 'normal_target', k.normal_target) order by k.risk_id) from public.kri_definitions k),
 'kri_readings', (select jsonb_agg(jsonb_build_object('id', rd.id, 'kri_id', rd.kri_id, 'value', rd.value, 'source', rd.source, 'note', rd.note, 'recorded_at', rd.recorded_at) order by rd.id) from (select r2.*, row_number() over (partition by r2.kri_id order by r2.recorded_at desc, r2.id desc) rn from public.kri_readings r2) rd where rd.rn <= 20),
 'alerts', (select jsonb_agg(to_jsonb(al) order by al.id) from public.alerts al where al.id in (select id from public.alerts order by created_at desc limit 25) or al.status in ('open','acknowledged'))
) as j)
select md5(j::text) as md5, length(j::text) as len, j from d;

-- ===== c_ops.json
with d as (select jsonb_build_object(
 'actions', (select jsonb_agg(to_jsonb(a) order by a.created_at, a.ref) from grc.actions a where a.org_id='NT'),
 'approvals', (select jsonb_agg(to_jsonb(x) order by x.created_at, x.step) from grc.approvals x join grc.actions a on a.id = x.action_id where a.org_id='NT'),
 'evidence', (select jsonb_agg(to_jsonb(ev) order by ev.created_at) from grc.evidence ev),
 'incidents', (select jsonb_agg(to_jsonb(i) order by i.detected_at) from grc.incidents i where i.org_id='NT'),
 'reg_notifications', coalesce((select jsonb_agg(to_jsonb(n)) from grc.reg_notifications n), '[]'),
 'scenario_runs', (select jsonb_agg(to_jsonb(r) order by r.started_at) from grc.scenario_runs r where r.org_id='NT'),
 'notifications', (select jsonb_agg(to_jsonb(n) order by n.id) from grc.notifications n where n.org_id='NT'),
 'delegations', coalesce((select jsonb_agg(to_jsonb(dl)) from grc.delegations dl where dl.org_id='NT'), '[]'),
 'devices', (select count(*) from grc.devices), 'device_commands', (select count(*) from grc.device_commands)
) as j)
select md5(j::text) as md5, length(j::text) as len, j from d;

-- ===== d_audit.json
with d as (select jsonb_build_object(
 'audit_events', (select jsonb_agg(to_jsonb(e) || jsonb_build_object('ts_hash', to_char(e.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')) order by e.id) from grc.audit_events e),
 'scenarios', (select jsonb_agg(to_jsonb(s) order by s.code) from grc.scenarios s where s.org_id = 'NT')
) as j)
select md5(j::text) as md5, length(j::text) as len, j from d;

-- ===== e_controls.json
with d as (select jsonb_build_object(
 'controls', (select jsonb_agg(to_jsonb(c) order by c.code) from grc.controls c where c.org_id='NT'),
 'control_tests', (select jsonb_agg(to_jsonb(t) order by t.id) from grc.control_tests t join grc.controls c on c.id = t.control_id where c.org_id='NT')
) as j)
select md5(j::text) as md5, length(j::text) as len, j from d;

-- ===== f_frameworks.json
with d as (select jsonb_build_object(
 'frameworks', (select jsonb_agg(to_jsonb(f) order by f.sort) from grc.frameworks f where f.org_id='NT'),
 'requirements', (select jsonb_agg(to_jsonb(r) order by r.framework_id, r.sort) from grc.requirements r join grc.frameworks f on f.id = r.framework_id where f.org_id='NT'),
 'control_requirements', (select jsonb_agg(jsonb_build_array(cr.control_id, cr.requirement_id) order by cr.control_id, cr.requirement_id) from grc.control_requirements cr join grc.controls c on c.id = cr.control_id where c.org_id='NT'),
 'control_risks', (select jsonb_agg(jsonb_build_array(cr.control_id, cr.risk_id, cr.reduction_pct) order by cr.control_id, cr.risk_id) from grc.control_risks cr join grc.controls c on c.id = cr.control_id where c.org_id='NT')
) as j)
select md5(j::text) as md5, length(j::text) as len, j from d;

-- ===== g_ebios.json
with d as (select jsonb_build_object(
 'ebios_studies', (select jsonb_agg(to_jsonb(s) order by s.updated_at desc) from grc.ebios_studies s where s.org_id='NT'),
 'ebios_items', (select jsonb_agg(to_jsonb(i) order by i.workshop, i.kind, i.sort, i.id) from grc.ebios_items i join grc.ebios_studies s on s.id = i.study_id where s.org_id='NT')
) as j)
select md5(j::text) as md5, length(j::text) as len, j from d;

-- ===== h_resilience.json
with d as (select jsonb_build_object(
 'risk_quant', (select jsonb_agg(to_jsonb(q) order by q.risk_id) from grc.risk_quant q join grc.risks r on r.id = q.risk_id where r.org_id='NT'),
 'processes', (select jsonb_agg(to_jsonb(p) order by p.id) from grc.processes p where p.org_id='NT'),
 'bcp_tests', (select jsonb_agg(to_jsonb(t) order by t.id) from grc.bcp_tests t join grc.processes p on p.id = t.process_id where p.org_id='NT'),
 'vendors', (select jsonb_agg(to_jsonb(v) order by v.id) from grc.vendors v where v.org_id='NT'),
 'vendor_assessments', coalesce((select jsonb_agg(to_jsonb(a)) from grc.vendor_assessments a), '[]'),
 'policy_attestations', coalesce((select jsonb_agg(to_jsonb(a)) from grc.policy_attestations a), '[]'),
 'policies_len', (select sum(length(body)) from grc.policies where org_id = 'NT')
) as j)
select md5(j::text) as md5, length(j::text) as len, j from d;

-- ===== i_policies.json
with d as (select jsonb_build_object(
 'policies', (select jsonb_agg(to_jsonb(p) order by p.code) from grc.policies p where p.org_id='NT')
) as j)
select md5(j::text) as md5, length(j::text) as len, j from d;

-- ===== heap_order.json
select jsonb_build_object(
 'actions', (select jsonb_agg(ref order by ctid) from grc.actions where org_id='NT'),
 'risks', (select jsonb_agg(id order by ctid) from grc.risks where org_id='NT'),
 'legacy_risks', (select jsonb_agg(id order by ctid) from public.risks),
 'raci', (select jsonb_agg(id order by ctid) from grc.raci where org_id='NT'),
 'employees', (select jsonb_agg(full_name order by ctid) from grc.employees where org_id='NT'),
 'policies', (select jsonb_agg(code order by ctid) from grc.policies where org_id='NT'),
 'controls', (select jsonb_agg(code order by ctid) from grc.controls where org_id='NT'),
 'processes', (select jsonb_agg(id order by ctid) from grc.processes where org_id='NT'),
 'vendors', (select jsonb_agg(id order by ctid) from grc.vendors where org_id='NT'),
 'assets', (select jsonb_agg(id order by ctid) from grc.assets where org_id='NT'),
 'incidents', (select jsonb_agg(ref order by ctid) from grc.incidents where org_id='NT'),
 'notifications', (select jsonb_agg(id order by ctid) from grc.notifications where org_id='NT'),
 'approvals', (select jsonb_agg(step order by ctid) from grc.approvals),
 'evidence', (select jsonb_agg(left(id::text, 8) order by ctid) from grc.evidence),
 'ebios_items', (select jsonb_agg(id order by ctid) from grc.ebios_items),
 'control_tests', (select jsonb_agg(id order by ctid) from grc.control_tests),
 'control_risks', (select jsonb_agg(control_id || '>' || risk_id order by ctid) from grc.control_risks),
 'control_requirements', (select count(*) from grc.control_requirements),
 'roles', (select jsonb_agg(id order by ctid) from grc.roles where org_id='NT'),
 'departments', (select jsonb_agg(id order by ctid) from grc.departments where org_id='NT'),
 'appetite', (select jsonb_agg(id order by ctid) from grc.appetite where org_id='NT'),
 'frameworks', (select jsonb_agg(id order by ctid) from grc.frameworks where org_id='NT'),
 'action_types', (select jsonb_agg(code order by ctid) from grc.action_types where org_id='NT'),
 'rules', (select jsonb_agg(id order by ctid) from grc.approval_rules where org_id='NT'),
 'scenario_runs', (select jsonb_agg(scenario_code order by ctid) from grc.scenario_runs),
 'bcp_tests', (select jsonb_agg(id order by ctid) from grc.bcp_tests),
 'risk_quant', (select jsonb_agg(risk_id order by ctid) from grc.risk_quant),
 'platform_access', (select jsonb_agg(level order by ctid) from grc.platform_access),
 'kri_definitions', (select jsonb_agg(risk_id order by ctid) from public.kri_definitions)
) as j;
