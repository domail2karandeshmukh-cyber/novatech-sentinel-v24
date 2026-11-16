# Enterprise demo data: the public-demo backend

When a build has no Supabase settings (`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`), every
original enterprise page (`src/pages`, `src/components`, `src/lib`) still works. Its `rpc('grc_…', args)`
calls are answered in the browser by a simulated backend in `src/enterprise/demo`. That backend holds a
snapshot of the real NOVATECH (NT) data and applies the same rules as the production SQL functions. When
both settings are present, nothing changes: the client is created lazily and `rpc()` calls Supabase as
before.

## What was captured

| | |
|---|---|
| Snapshot | `nt-2026-10-27`, taken on 2026-10-27 between 21:52 and 22:07 UTC and pinned to **2026-10-27T22:00:00Z**. Nothing was written to the database during that window: the ledger stayed at entry #436 and the notifications at #336. |
| Source | The NOVATECH Supabase project (PostgreSQL 17, en_US.UTF-8), read with plain `SELECT`s on `grc.*` and the legacy `public` KRI tables. Production fingerprints came only from STABLE `public.grc_*` read functions, called under transaction-local impersonation. No writer, volatile function or DDL was run. |
| Organisation | NT (NOVATECH SERVICES) only. The BK template organisation is dropped, so the demo never offers an organisation switcher. Its single ledger entry stays as a sealed hash link (see below). |
| Personas | The 11 NT people who have a sign-in account: Karan Deshmukh (Project Manager / Risk Coordinator, the default), Victor Bonnet (RSSI / CISO), Vanessa Mallet (CEO), Nadia Vasseur (security analyst), Sarah Perrin (Finance Director, CFO / DAF), Pierre Sauvage (IT operations), Léa Moreau (accounts payable), Thomas Bernard (systems administrator), Camille Laurent (HR), Julie Martin (delivery) and the Internal Auditor, who is read-only. Marc Dubois and Sophie Girard appear as directory records with no sign-in, as they do in production. |
| Tables | organisation, 11 departments, 13 roles with their permissions, 13 employees, 7 assets, 10 action types, 15 approval rules, platform access levels, 8 risks (with the legacy R1–R6 likelihood, impact and treatment), 6 appetite statements, 42 RACI rows, 6 KRIs (the last 20 readings each, 29 rows), 28 legacy alerts (the last 25 plus every open one), 5 actions, 3 incidents, 3 scenarios and their runs, 3 notifications, the audit ledger, 25 controls with 20 tests, 4 frameworks with 53 requirements and their control mappings, the EBIOS RM study (47 items), 8 loss estimates, 6 business processes with 4 continuity tests, 10 vendors and 10 policies. |
| Files | `src/enterprise/demo/fixtures/seed.json` (157 KB, 29 KB gzipped) is the data. `excluded.json` holds the removed test data and their heap positions. `parity.json` holds the production fingerprints. `src/enterprise/demo/personaBaseline.ts` is generated from the seed. |

**Privacy and minimisation.** Auth user ids never leave the database. `employees.user_id` becomes
`has_login` and platform access is keyed by employee id. There are no tokens or keys and no last
sign-in times. All e-mail addresses are the fictional `@novatech.example` directory addresses. The
publishable key is not embedded anywhere. The tests check all of this.

**Hygiene: what was removed.** Production contained a rehearsal of Scenario D, typed with placeholder
content (scenario run `e2fd1d6c…`, reset). It is excluded and listed in `excluded.json`:

- action ACT-1057, whose title, proposal, justification and assessment were all "TEST";
- incident INC-1056, whose security assessment was "TEST";
- 2 approvals, 7 evidence records, 6 RACI rows and 12 notifications;
- the 17 ledger entries of that rehearsal. They remain only as sealed hash links (id, previous hash, hash), so the chain still verifies;
- the residual score L4 × I4 and the "treating" status that the TEST verification wrote onto risk NT-R2. NT-R2 is back to "open" with no residual.

## How faithful it is

Reads are not replayed. Each one is computed from the data by a clause-by-clause port of its SQL
function (`reads.ts`, `model.ts`). The port keeps SQL null logic, the production collation (calibrated
against the database: punctuation sorts before digits, digits before letters, then accents, then case)
and Postgres' own in-memory sort, so even rows with equal sort keys come out in the same order.

The tests rebuild the production world (the seed plus the excluded rows, in heap order) and check
**104 calls × 11 personas = 1,144 results**. Every one matches production byte for byte (a SHA-256
prefix over the `jsonb::text` form). The calls cover every read RPC, every action, incident, control,
framework, vendor and policy detail, 12 policy previews and 6 ledger queries.

## The simulated backend

| File | Role |
|---|---|
| `demoBackend.ts` | `demoRpc(fn, args)`, persistence, reset, overlays and handlers. It loads the fixture on its first call through `import('./fixtures/seed.json?raw')`. |
| `demoSession.ts` | Persona choice and the event bus. It is small and never loads the fixture. |
| `engine.ts` | The table of every `grc_*` function (PostgREST parameter names, types and defaults), transactional writes and the time model. |
| `reads.ts`, `writes.ts`, `model.ts` | Ports of the read RPCs, the writer RPCs and the `grc.*` helpers (check_op, next_step, routing, criteria, JSON builders). |
| `store.ts`, `cast.ts`, `pg.ts` | The transaction context, ledger and notifications; Postgres casts and their error texts; jsonb text form, pure-JS SHA-256, timestamps, collation and the Postgres sort. |
| `tools/` | `capture.sql`, `parity-sql.mjs` and `build-fixtures.mjs`, used to refresh the snapshot. |

**Mode integration.** `src/lib/supabase.ts` exports `isSupabaseConfigured()`, `getSupabase()` (which
creates the client lazily) and `supabase`. In demo mode `supabase` is a proxy: `supabase.auth.*`
answers locally (sign-in returns an explanatory error) and anything else throws. `rpc()` imports the
demo backend dynamically, so the public landing page never downloads the backend or the fixtures.
Errors keep the `RpcError` convention.

`src/lib/session.tsx` picks a provider at start-up. In demo mode the session is a token-less stand-in
for the persona, `memberships` come from the persona's own `grc_session` (so they reflect role edits),
`setOrg` is a no-op (there is only NT) and `signOut()` goes to `/`. Any demo event (persona switch,
simulated write, reset) increments `refreshKey`, so every `useRpc` reloads; `poll` works in both modes.
The context gains four fields, additively: `demo`, `persona`, `personas` and `setPersona`.

**Time.** The data are stored in snapshot time. Before the visitor writes anything, each call rebases
the snapshot so that 22:00:00Z on 27 October reads as "now" and that day as "today": the data always
look freshly captured. The first write pins the offset, so what the visitor did keeps its age.
Outgoing ISO timestamps shift by the offset, to the microsecond, and calendar dates by whole days.
Timestamps and dates sent by pages shift back. Ledger summaries that quote a time (scheduling,
delegation) show the time the visitor chose.

**Persistence.** Simulated changes are stored in `localStorage` under `novatech.enterprise-demo.data.v1`,
and other tabs follow through the `storage` event. The persona is stored under
`novatech.enterprise-demo.persona.v1`. Every storage access is guarded: with storage blocked the demo
keeps working in memory for the page. `resetDemoData()` forgets every change for every persona.

## Writers: simulated or refused

Simulated, with the production rules (40 writers):

- **Actions:** `grc_propose_action`, `grc_submit_action`, `grc_assess_action`, `grc_decide` (approve, reject, request_info, escalate), `grc_respond_info`, `grc_invoke_emergency`, `grc_schedule_action`, `grc_start_execution`, `grc_record_execution`, `grc_verify_action`, `grc_reopen_action`, `grc_cancel_action`, `grc_reassign_action`, `grc_add_note`
- **Incidents:** `grc_create_incident`, `grc_incident_transition`, `grc_assess_incident`, `grc_incident_from_alert`, `grc_incident_regulatory_set`, `grc_reg_mark_sent` (NIS2 / GDPR / DORA clocks)
- **Register and assurance:** `grc_risk_save`, `grc_set_raci`, `grc_record_kri` (with the legacy alert pipeline: alerts open, resolve and recover, and are routed to the risk owner and oversight roles), `grc_monitor_run` (all control monitors, including ledger recomputation), `grc_control_test_record`, `grc_ebios_item_save`, `grc_quant_save`, `grc_vendor_assess`, `grc_bcp_test_record`, `grc_policy_attest`
- **People:** `grc_delegate`, `grc_revoke_delegation`, `grc_notifications_mark`, `grc_admin_employee_save`, `grc_admin_rule_save`, `grc_admin_set_active`, `grc_admin_set_permission`
- **Scenarios:** `grc_scenario_start`, `grc_scenario_set_paused`, `grc_scenario_reset`

The rules are exactly those of `check_op` and the writers:

- permissions come from the persona's role, or from an active delegation;
- the requester cannot assess or approve their own request;
- each approval step needs a different person (dual control);
- whoever approved cannot execute, and only eligible executor roles can;
- the executor cannot verify their own work, and verification needs the `action.verify` permission and its criteria (evidence, independence, attestations, KRI state, post-emergency reviews);
- routing follows the approval rules, so a payment hold of €100,000 or more adds the CEO as step 2 after the CFO;
- emergency authority converts eligible steps into post-emergency reviews;
- an incident cannot close while it has open actions.

Refused with `DENIED: Not available in the public demo: <why>. Use the authenticated workspace.`:

- `grc_platform_set_level`, because platform access levels belong to the real sign-in accounts;
- any RPC the simulated backend does not know, such as the device-agent functions (enrolled devices only exist in the authenticated workspace).

There is no silent no-op.

## The audit ledger

Every simulated write appends entries shaped like production ones: stage, event type, actor name and
role, entity, previous and new status, outcome, summary and details. The details carry
`simulated: true`. Each entry is chained with SHA-256 over the same fields as `grc.audit_hash_row`, in
pure JS. The pure-JS SHA-256 reproduces all 30 production hashes, and the first simulated entry links
to the hash of production entry #436.

`grc_verify_audit_chain` recomputes the whole chain and returns the production shape: `ok`, `checked`,
`first_broken_id`, `head` and `verified_at`. Sealed placeholders (the BK entry and the excluded test
entries) are a trusted baseline: their links are checked, their content cannot be. Editing any stored
entry, simulated or from production, breaks verification at that entry, and the C-11 monitor reports it.

## API for other demo layers

```ts
// Light: no engine, no fixtures.
import { demoPersonas, getDemoPersona, setDemoPersona, subscribeDemo } from '../enterprise/demo/demoSession.ts';
// Full backend: the fixtures load on the first call.
import { demoRpc, resetDemoData, emitDemoChange, registerDemoOverlay, registerDemoHandler,
         getDemoSnapshotInfo, demoRpcNames, demoDeniedRpcs } from '../enterprise/demo/demoBackend.ts';

setDemoPersona(employeeId);                       // act as someone else; useSession() reloads
const off = subscribeDemo(e => console.log(e.type, e.personaId));   // 'persona' | 'data' | 'reset'
registerDemoOverlay('grc_home', (result, args, ctx) => ({ ...result, banner: 'Demo' }));
registerDemoHandler('grc_custom_feed', async (args, ctx) => ctx.call('grc_risks', { p_org: 'NT' }));
emitDemoChange();                                 // after changing state outside demoRpc
await resetDemoData();                            // back to the snapshot
```

In React, `useSession()` exposes `demo`, `persona`, `personas` and `setPersona(employeeId)`.

`DemoContext` gives a handler or overlay the RPC name, the persona, the visitor's clock, the snapshot
time, the display offset, `call(fn, args)` (a built-in RPC as the current persona) and `emitChange()`.
`configureDemoBackend({ seed, now, storage, uuid, random })` replaces the data source, clock and storage,
for tests and tools.

## Limitations

- **No real sign-in.** The demo session always exists, so the original `Gate` goes straight to the app and never shows Landing or Login. If the login form is reached, it explains that sign-in is unavailable. A persona switcher replaces sign-in.
- **One visitor's world.** Changes stay in the visitor's browser (shared across its tabs). Other visitors and the real database never see them. There is no e-mail, push or browser-notification delivery beyond what the pages do themselves.
- **No devices or remote execution.** NT has no enrolled devices, so actions in device mode are blocked by the production rule.
- **Not simulated.** Platform access levels; legacy side tables that no page reads (`public.audit_log`, `notification_deliveries`, the push webhook).
- **Rebased timestamps.** Hashes are computed over stored snapshot-time values, so recomputing a hash from the displayed, shifted timestamps would not match. In-page verification is unaffected.
- **"Never" for last sign-in.** `last_sign_in` is always null in the demo, so the Access page shows "Never".
- **Approximations that only matter outside the snapshot.** The text ordering covers Latin text, digits and common punctuation; rows keep their position when updated, where Postgres might move them on disk.

## Refreshing the snapshot

1. Run the ten statements in `src/enterprise/demo/tools/capture.sql` against the NOVATECH project. They are read-only. Save each `j` value as the file named in its header, in one capture directory outside the repository.
2. `node src/enterprise/demo/tools/parity-sql.mjs <capture-dir> > parity.sql`, then run it and save the `manifest` value as `<capture-dir>/parity_manifest.json`. It impersonates each persona with transaction-local claims and calls only STABLE read functions. Run it in the same quiet window as step 1.
3. In `tools/build-fixtures.mjs`, update `SNAPSHOT_AT`, `SNAPSHOT_VERSION`, the `JUNK` list (test data to exclude) and the next sequence values. A new version invalidates visitors' stored changes. Then run `node src/enterprise/demo/tools/build-fixtures.mjs <capture-dir>`. It verifies every captured ledger hash, separates the test data, checks privacy, and writes the fixtures and `personaBaseline.ts`.
4. `npm run test:enterprise`. The parity test must report 0 differences. If the schema changed, port the changed SQL functions first.

## Tests

`npm run test:enterprise` runs `tests/enterprise-demo.test.mjs`, 15 tests in about 2 s under Node 22
`--experimental-strip-types`. They cover:

- every `grc_*` name used in `src/**` is answered, and the refused writer is explicit;
- the 1,144 production parity checks;
- the fixture privacy and hygiene checks, and lazy loading;
- a session and work queue for each persona;
- the payment-hold lifecycle: the requester cannot approve; the CEO is added at €100,000; delegation; dual control; executor and verifier rules; the monitors;
- a run of every writer;
- incident transitions and risk saves;
- ledger chaining and tamper detection;
- persistence and reset, blocked storage, time rebasing in both directions, and the extension hooks.
