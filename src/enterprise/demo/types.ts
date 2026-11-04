/**
 * Row types of the public-demo snapshot (fixtures/seed.json). Each type mirrors one table of the
 * NOVATECH Supabase schema (grc.* plus the legacy KRI tables), column for column, so the simulated
 * RPCs can reproduce `to_jsonb(row)` exactly. Auth user ids never appear: `has_login` replaces them.
 */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export type Org = { id: string; name: string; industry: string; kind: string; description: string | null; currency: string; created_at: string };
export type Department = { id: string; org_id: string; name: string; parent_id: string | null; description: string | null };
export type Role = { id: string; org_id: string; name: string; department_id: string | null; authority_level: number; reports_to: string | null; description: string | null; permissions: string[] };
export type Employee = {
  id: string; org_id: string; full_name: string; email: string | null; role_id: string; department_id: string | null; manager_id: string | null;
  active: boolean; is_student: boolean; note: string | null; created_at: string; has_login: boolean;
};
export type Asset = { id: string; org_id: string; name: string; asset_type: string; criticality: number; business_service: string | null; department_id: string | null; owner_role_id: string | null; description: string | null };
export type Criterion = { key: string; type: string; label: string; risk?: string };
export type ActionType = {
  org_id: string; code: string; name: string; domain: string; disruptive: boolean; assessor_role_id: string | null; executor_role_ids: string[];
  emergency_allowed: boolean; consulted_role_ids: string[]; default_criteria: Criterion[]; description: string | null;
};
export type ApprovalRule = {
  id: number; org_id: string; action_type: string; step: number; approver_role_id: string; min_severity: number; max_severity: number;
  min_asset_criticality: number; min_amount: number; in_emergency: string; rationale: string; active: boolean; updated_at: string;
};
export type PlatformAccess = { employee_id: string; level: string; granted_by: string | null; granted_at: string; note: string | null };
export type LegacyRisk = { likelihood: number | null; impact: number | null; treatment: string | null; residual_target_score: number | null; priority_rank: number | null };
export type Risk = {
  id: string; org_id: string; code: string; legacy_id: string | null; title: string; category: string; department_id: string | null; description: string | null;
  likelihood: number | null; impact: number | null; owner_id: string | null; treatment: string | null; residual_likelihood: number | null; residual_impact: number | null;
  origin: string; status: string; created_at: string; appetite_id: string | null; legacy: LegacyRisk | null;
};
export type Appetite = { id: string; org_id: string; category: string; statement: string; tolerance: string; max_annual_loss: number; max_score: number; sort: number };
export type Raci = { id: number; org_id: string; entity_type: string; entity_id: string; employee_id: string; raci: string };
export type KriDefinition = { id: string; risk_id: string; name: string; unit: string; direction: string; warning_threshold: number; critical_threshold: number; normal_target: number | null };
export type KriReading = { id: number; kri_id: string; value: number; source: string; note: string | null; recorded_at: string };
export type Alert = {
  id: number; risk_id: string; kri_id: string; reading_id: number; severity: string; status: string; message: string; fingerprint: string;
  created_at: string; acknowledged_at: string | null; resolved_at: string | null;
};
export type Action = {
  id: string; org_id: string; ref: string; action_type: string; title: string; proposed_action: string | null; justification: string | null;
  business_impact: string | null; business_process: string | null; treatment_strategy: string; priority: string; severity: number; amount: number | null;
  risk_id: string | null; incident_id: string | null; asset_id: string | null; status: string; emergency: boolean; emergency_reason: string | null;
  requested_by: string; responsible_id: string | null; accountable_id: string | null; executor_id: string | null; assessed_by: string | null;
  assessment: string | null; info_request: string | null; blocked_reason: string | null; budget: number | null; resources: string | null;
  start_date: string | null; deadline: string | null; depends_on: string[]; progress: number; execution_mode: string; scheduled_for: string | null;
  criteria: Criterion[]; residual_likelihood: number | null; residual_impact: number | null; scenario_run_id: string | null; archived: boolean;
  version: number; created_at: string; updated_at: string; completed_at: string | null;
};
export type Approval = {
  id: string; action_id: string; step: number; kind: string; approver_role_id: string; rule_id: number | null; rationale: string | null; status: string;
  decided_by: string | null; on_behalf_of: string | null; comment: string | null; created_at: string; decided_at: string | null;
};
export type Evidence = {
  id: string; action_id: string | null; incident_id: string | null; kind: string; summary: string; data: JsonObject; execution_label: string | null;
  submitted_by: string | null; created_at: string;
};
export type Incident = {
  id: string; org_id: string; ref: string; title: string; description: string | null; category: string; severity: number; status: string; source: string;
  reported_by: string | null; assigned_to: string | null; risk_id: string | null; asset_id: string | null; financial_exposure: number | null;
  security_assessment: JsonObject | null; financial_assessment: JsonObject | null; legacy_alert_id: number | null; scenario_run_id: string | null;
  archived: boolean; detected_at: string; closed_at: string | null; aware_at: string | null; regimes: string[]; personal_data: boolean; significant: boolean;
};
export type RegNotification = { id: number; incident_id: string; regime: string; stage: string; authority: string; due_at: string | null; sent_at: string | null; sent_by: string | null; reference: string | null };
export type ScenarioStep = { who: string; role: string; check: string; title: string; description: string; min?: number; seed?: JsonObject };
export type Scenario = { code: string; org_id: string; title: string; summary: string; steps: ScenarioStep[] };
export type ScenarioRun = { id: string; scenario_code: string; org_id: string; status: string; started_by: string | null; started_at: string; ended_at: string | null };
export type Notification = {
  id: number; org_id: string; recipient: string; kind: string; title: string; body: string | null; entity_type: string | null; entity_id: string | null;
  created_at: string; read_at: string | null; browser_shown_at: string | null;
};
export type Delegation = {
  id: string; org_id: string; from_employee: string; to_employee: string; role_id: string; reason: string; valid_from: string; valid_until: string;
  granted_by: string; revoked_at: string | null;
};
/** A ledger entry. `withheld` entries are sealed placeholders (another organisation, or excluded test data): only the hash link is kept. */
export type AuditEvent = {
  id: number; org_id: string | null; occurred_at?: string; actor_employee?: string | null; actor_name?: string; actor_role?: string | null; stage?: string;
  event_type?: string; entity_type?: string | null; entity_id?: string | null; entity_ref?: string | null; risk_id?: string | null; incident_id?: string | null;
  asset_id?: string | null; prev_status?: string | null; new_status?: string | null; outcome?: string | null; summary?: string; details?: JsonObject;
  scenario_run_id?: string | null; prev_hash: string | null; hash: string; withheld?: string;
};
export type Control = {
  id: string; org_id: string; code: string; title: string; description: string | null; domain: string | null; owner_role_id: string | null; control_type: string | null;
  automation: string | null; frequency: string | null; design_eff: string; operating_eff: string; monitor: string | null; last_tested: string | null;
  next_test: string | null; evidence: string | null; status: string;
};
export type ControlTest = { id: number; control_id: string; run_at: string; result: string; detail: string | null; source: string; tester: string | null; metrics: JsonObject | null };
export type Framework = { id: string; org_id: string; code: string; name: string; version: string | null; authority: string | null; applicability: string | null; description: string | null; sort: number };
export type Requirement = { id: string; framework_id: string; ref: string; title: string; domain: string | null; description: string | null; sort: number };
export type EbiosStudy = {
  id: string; org_id: string; title: string; scope: string | null; status: string; strategic_cycle_months: number | null; operational_cycle_months: number | null;
  owner_role_id: string | null; started_on: string | null; updated_at: string;
};
export type EbiosItem = { id: string; study_id: string; workshop: number; kind: string; ref: string | null; title: string; data: JsonObject; sort: number };
export type RiskQuant = {
  risk_id: string; tef_min: number; tef_ml: number; tef_max: number; vuln_min: number; vuln_ml: number; vuln_max: number;
  lm_min: number; lm_ml: number; lm_max: number; rationale: string | null; updated_at: string; updated_by: string | null;
};
export type Process = {
  id: string; org_id: string; name: string; description: string | null; owner_role_id: string | null; department_id: string | null; tier: number;
  rto_hours: number; rpo_hours: number; mtpd_hours: number | null; impact_per_day: number | null; impacts: JsonObject;
  dependencies: { assets?: string[]; vendors?: string[]; processes?: string[] }; plan_status: string; risk_id: string | null;
};
export type BcpTest = {
  id: number; process_id: string; tested_on: string; test_type: string | null; achieved_rto_hours: number | null; achieved_rpo_hours: number | null;
  result: string; notes: string | null; recorded_by: string | null;
};
export type Vendor = {
  id: string; org_id: string; name: string; service: string | null; category: string | null; tier: string; data_access: string | null; country: string | null;
  contract_start: string | null; contract_end: string | null; last_assessed: string | null; next_review: string | null; inherent_score: number | null;
  residual_score: number | null; status: string; ict_service: boolean; supports_critical_function: boolean; substitutability: string | null;
  exit_plan: boolean; certifications: string[]; subprocessors: string[]; owner_role_id: string | null; risk_id: string | null; notes: string | null;
  annual_spend: number | null;
};
export type VendorAssessment = { id: number; vendor_id: string; assessed_on: string; score: number; answers: JsonObject; findings: string | null; assessor: string | null; created_at: string };
export type Policy = {
  id: string; org_id: string; code: string; title: string; version: string; owner_role_id: string | null; approver_role_id: string | null; status: string;
  effective_date: string | null; review_date: string | null; summary: string | null; body: string | null; refs: string[]; audience: string;
};
export type PolicyAttestation = { policy_id: string; employee_id: string; version: string; attested_at: string };
export type Device = { id: string; asset_id: string | null; enabled: boolean };
export type DeviceCommand = { id: string; action_id: string; status: string };

export type Counters = {
  ref_seq: number; audit: number; notification: number; control_test: number; bcp_test: number; vendor_assessment: number; reg_notification: number;
  kri_reading: number; alert: number; raci: number; approval_rule: number;
};
export type SeedMeta = { version: string; snapshot_at: string; captured: string; org: string; counters: Counters; excluded: string };

/** The in-memory database of the demo world. Arrays keep production heap order so ties sort like Postgres. */
export type DemoTables = {
  org: Org;
  departments: Department[]; roles: Role[]; employees: Employee[]; assets: Asset[]; action_types: ActionType[]; approval_rules: ApprovalRule[];
  platform_access: PlatformAccess[]; risks: Risk[]; appetite: Appetite[]; raci: Raci[];
  kri_definitions: KriDefinition[]; kri_readings: KriReading[]; alerts: Alert[];
  actions: Action[]; approvals: Approval[]; evidence: Evidence[]; incidents: Incident[]; reg_notifications: RegNotification[];
  scenarios: Scenario[]; scenario_runs: ScenarioRun[]; notifications: Notification[]; delegations: Delegation[];
  devices: Device[]; device_commands: DeviceCommand[]; audit: AuditEvent[];
  controls: Control[]; control_tests: ControlTest[]; frameworks: Framework[]; requirements: Requirement[];
  control_requirements: [string, string][]; control_risks: [string, string, number][];
  ebios_studies: EbiosStudy[]; ebios_items: EbiosItem[]; risk_quant: RiskQuant[];
  processes: Process[]; bcp_tests: BcpTest[]; vendors: Vendor[]; vendor_assessments: VendorAssessment[];
  policies: Policy[]; policy_attestations: PolicyAttestation[];
};
export type Seed = DemoTables & { meta: SeedMeta };
export type DemoDb = DemoTables & { counters: Counters };

/** One person who can sign in to the NT organisation; the public demo lets a visitor act as any of them. */
export type DemoPersona = {
  employee_id: string; full_name: string; role: string; role_id: string; department: string | null; is_student: boolean; permissions: string[];
  authority_level: number; email: string | null; active: boolean;
};
