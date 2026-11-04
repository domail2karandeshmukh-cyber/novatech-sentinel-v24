> **About this file.** This is the original developer README from the V2.4 source package
> (`NOVATECH_Sentinel_V2.4_Full_Source.zip`), kept for reference when the repository's
> [main README](../README.md) was rewritten for academic submission on 4 November 2026. Its content is
> unchanged except that relative links were updated for its new location in `docs/`. Commit references
> below (for example `6b05ed7`) belong to the earlier development history and are not part of this
> GitHub repository.

# NOVATECH Sentinel V2.4

One web application for the fictional NOVATECH Services case (ESAIP MSc, Risk Management, Group 1):
the original NOVATECH IRM enterprise app, the V2.3 classroom rehearsal and the new **Sentinel** command
experience, merged. Every incident, telemetry value and money figure is simulated and labelled.

**Live classroom application:** https://novatech-sentinel-v24.vercel.app/

The public deployment is a risk-management demonstration using simulated data. Device shutdown requires a separately authorized local helper and is not available through the public website.

> **Production is untouched.** This source deploys to a *separate* Vercel project. The original
> `novatech-grc.vercel.app` keeps running from its own repository and database.

## Start

```bash
npm ci
npm run dev          # http://localhost:5173
```

No environment variables are needed. Without Supabase settings, the enterprise pages run on a labelled,
simulated copy of the NT case data (snapshot of 27 October 2026, see
[docs/ENTERPRISE_DEMO_DATA.md](ENTERPRISE_DEMO_DATA.md)): the same rules as the database decide every
approval, writes stay in the visitor's browser and **Reset workspace data** restores the snapshot. The one
persona switcher in the header decides who the visitor acts as everywhere. To use the real database, copy
`.env.example` to `.env.development` and set only the Supabase URL and the **publishable** key — never a
`service_role` or secret key in a `VITE_` variable.

## Publish the preview (separate Vercel project)

From this folder, on a computer with Node 22 or newer:

```bash
npx vercel@latest login
npx vercel@latest deploy --prod --yes
```

`--yes` creates a new Vercel project named after this folder (`novatech-sentinel-v24`), detects Vite
(`npm run build`, output `dist`) and applies `vercel.json` (page routes and security headers). It never
touches the `novatech-grc` project. Add no environment variables: without them the case workspace runs on
its simulated data, and the Mac action stays simulated on the public site. Builds use Node 22, the version
the tests ran on (`engines` in `package.json`). Share the project's short `.vercel.app` address; the long
per-deployment address can ask visitors to log in to Vercel.

## What is where

| Route | What it is |
| --- | --- |
| `/` | Landing: the enterprise atlas (Angers, Nantes, Rennes, cloud, bank, suppliers, clients) |
| `/command` | Command Center: next authorized decision, exposure, top five risks, heatmap, KRIs, tasks, readiness |
| `/incident` | The live seven-gate incident: Detect → Cyber assessment → Financial impact → Executive authorization → IT action → Independent verification → Risk closure |
| `/soc`, `/response`, `/team` | Security operations, department action plans and RACI, authority map and delegation |
| `/evidence`, `/report` | Hash-chained local ledger (verify, tamper test, export) and the after-action report |
| `/endpoint` | The final step: Pavan requests the power-off for re-imaging from Windows, Karan decides on the Mac (simulated on the public site) |
| `/present` | Presenter Mode: nine shows × 2/5/8/12/20/30 minutes, console + audience windows, phone script, Q&A |
| `/settings` | NOVA voice lab, pronunciations, sound cues, theme, projector contrast, reduced motion, reset |
| `/home`, `/risks`, `/ebios`, `/quant`, `/compliance`, `/controls`, `/policies`, `/incidents`, `/actions`, `/approvals`, `/vendors`, `/continuity`, `/board`, `/audit`, `/reports`, `/scenarios`, `/access`, `/organisation`, `/assets`, `/departments`, `/workspace`, `/live`, `/briefing` | The **case workspace**: the original NOVATECH IRM pages inside the same shell. Each menu lists them under “Case workspace”, separate from the incident rehearsal |
| `/handbook`, `/present/classic` | The original guide and the original IRM case view of a workspace scenario (moved from `/guide` and `/present`) |
| `/v2-demo` | The untouched V2.3 rehearsal (fallback) |

The six people and their authority are the same everywhere (UI, voice, RACI, tasks, presenter, report):
Karan Deshmukh — Project Manager / Risk Coordinator · Vijay Bhosale — RSSI / CISO · Vandana Madem — Chief
Executive Officer · Nandini Vadlamudi — Cybersecurity Analyst · Srija Poudapally — Finance Director
(CFO / DAF) · Pavan Sanam — IT Operations Manager.

## Presenting

Read [docs/DEMO_SCRIPT.md](DEMO_SCRIPT.md) (8 minutes), [docs/DEMO_SCRIPT_20.md](DEMO_SCRIPT_20.md)
or [docs/DEMO_SCRIPT_30.md](DEMO_SCRIPT_30.md), generated from the same scenes as the console
(`npm run script:export -- full 20`). In short: open the site in **Microsoft Edge** (its free “Natural” voices
are the smoothest) → projector as an extended display → Presenter Mode → pick the show and length →
**Open audience window + console** → click **Start the projector** once on the projector (full screen, sound
and voice) → **Start presentation**. The console and the phone script are private; the projector never shows
notes. Skipped gates never complete on their own; the console offers a labelled fast-forward. Voice details
and costs: [docs/VOICE.md](VOICE.md).

Nobody logs in. Karan's Mac runs the console and the projector window; everyone else reads their part on their
phone (`/present/script`); Pavan's Windows laptop is needed only to send the real power-off request at the end.
The header persona switcher is a presentation convenience, not authentication.

Every hand-off is a signed form, not a bare submit button: severity (Critical — P1 to Low — P4), evidence and
MITRE techniques at assessment, a low / likely / maximum range at financial impact, conditions and validity on
each approval, the change ticket at execution, the method and result at verification, residual risk and
follow-ups at closure. Each form shows what was received, who it goes to next and when that part is due. The
signed form is sealed in the ledger (the hash covers it) and can be opened on Evidence. In the console,
**Do it for me** fills the form visibly on the projector for two seconds, then signs it.

The 20- and 30-minute versions add the case workspace on the projector (risk register, compliance,
quantification, board view, continuity; at 30 minutes also EBIOS RM, controls and vendors). Every show that
reaches the end finishes with the final step: the workstation stayed powered on and isolated until its memory
was imaged, then Pavan requests the power-off for re-imaging and Karan decides on the device. Nothing powers
off automatically.

What the projector does on its own: frames each spotlight above the lower third with a caption placed where
it covers no text, shows a two-second card when the speaker changes, captions every sound in the top band,
and ends on a proof receipt (who signed each gate, with the ledger fingerprint). From the console you can
silence NOVA on the projector, run a projector sound check, drive the simulated Mac rehearsal and, during
questions, **challenge the controls**: a what-if (CEO unavailable, CEO sends it back, the executor or the
requester tries to approve) answered by the engine on a private copy — nothing is recorded. A stray clicker
press on the end card opens questions instead of restarting.

## The real Mac action (optional)

The public site only simulates it. The real request needs the local agent on Karan's Mac and the steps below
(unchanged from V2.3). For the classroom, present the **whole show from the local copy on Karan's Mac**
(`http://localhost:5173/present`) so the closed incident and the pairing card live in the same browser; the
run sheet is in [docs/DEMO_SCRIPT.md](DEMO_SCRIPT.md). The projector shows the pairing status only —
never the code, the controller link or the fingerprint. The SwiftUI approval window is **opt-in**; the proven macOS dialog stays the default:
see [docs/NATIVE_COMPANION.md](NATIVE_COMPANION.md). Pavan's Windows-to-Mac LAN test and the SwiftUI
window have **not yet been run on real hardware**.

## Tests

```bash
npm test                 # all suites below
npm run test:sentinel    # incident engine, separation of duties, ledger, signed forms, shows, pairing record, Mac rehearsal, what-ifs
npm run test:enterprise  # enterprise demo data layer
npm run test:v2          # V2.3 regression
npm run test:mac         # same-Mac helper
npm run test:remote      # remote pairing agent
npm run test:companion   # SwiftUI approval companion (node side)
npm run build
```

No automated test can shut down a machine: the real shutdown and approval paths refuse to run inside the
Node test runner.

## Rollback

- V2.3 stays inside this build at `/v2-demo`.
- The original V2.3 source is commit `6b05ed7` in this repository.
- Production is a different Vercel project; nothing here deploys to it.

## V2.3 remote presenter workflow (unchanged)

### Pavan's remote presenter workflow

**This uses the same local risk demonstration, with a separate remote controller for the final shutdown request.** It is *not* yet a synchronized, multi-user risk dashboard. Pavan can request shutdown only after Karan completes and authorizes the seven-stage classroom rehearsal on the Mac.

Both laptops must be on the same reachable **private Wi-Fi/LAN**. The remote controller is never exposed through Vercel or a public server. Don't port-forward it to the internet.

### A. Rehearse without shutting anything down

1. On Karan's Mac, run `npm run dev` and open `http://localhost:5173/v2-demo`.
2. In a second Terminal in the project folder, start `npm run remote:preview`. This starts the local pairing service and the **HTTPS** remote controller but **never sends a native shutdown command**.
3. Complete all seven ransomware gates, switch to the simulated **IT Operations** role, open **Remote Presenter** (near the bottom), and click **Enable remote pairing**. Keep the displayed six-digit code private. It expires after **five minutes** if unused.
4. On Pavan's laptop (connected to the *same Wi-Fi*), open the exact HTTPS URL shown on Karan's page, for example `https://192.168.x.x:43872`.
5. The agent uses a newly generated **self-signed certificate** for encrypted LAN communication. Chrome may warn that it is not publicly trusted. Before proceeding, compare the certificate's SHA-256 fingerprint in Chrome's certificate details against the fingerprint on Karan's screen, ideally in person. **Do not proceed if the fingerprints differ or cannot be verified.**
6. Pavan enters the six-digit code. Only five incorrect attempts are allowed. A successful pairing lasts **30 minutes**, after which Pavan must pair again.
7. Pavan checks the acknowledgement and clicks **Request shutdown from Mac**. In PREVIEW mode the dashboard should report success without any shutdown or macOS dialog.

### B. Explicitly enable a real shutdown

1. Stop the foreground preview agent (`Control+C`) and restart with `npm run remote:live` on **Karan's Mac**. This requires macOS.
2. On Karan's NOVATECH page, click **Refresh status**, create a **new pairing code**, and let Pavan pair again. The old pairing does not survive a restart.
3. Karan saves work. Pavan clicks **Request shutdown from Mac** and confirms in his browser.
4. Karan's **Mac itself** displays the AppleScript/macOS shutdown confirmation. **Cancel is the default** and it times out after 30 seconds. Only if Karan clicks **Shut Down Mac** will the agent ask macOS to shut down; macOS may still require permissions or close-blocking apps to be resolved. Pavan cannot bypass this on-device approval.

### C. Optional Mac background agent (no Terminal left open)

Once the safe foreground preview works, on Karan's Mac use:

```bash
npm run remote:install:preview
```

This installs a **per-user macOS LaunchAgent** to run at login in safe PREVIEW mode. Stop any existing foreground remote agent first to avoid a port conflict. macOS may prompt to allow background items.

To deliberately arm the background agent for **real** remotely requested shutdown, use:

```bash
npm run remote:install:live
```

This explicitly replaces the NOVATECH LaunchAgent with its LIVE mode. Mac owner confirmation still applies to every remote shutdown attempt. If you no longer need remote control:

```bash
npm run remote:uninstall
```

The background service stores its locally generated TLS private key in your macOS user Application Support folder with restricted file permissions. No permanent presenter access token is stored; pairing ends after 30 minutes or immediately when you click **Revoke access**. The background agent does **not** automatically reopen the React website after restart. If the Mac changes Wi-Fi networks or IP addresses, restart the agent and obtain a new controller URL. This has been tested with simulated HTTPS requests, but **actual LaunchAgent display permissions and cross-device Wi-Fi behavior still need verification on Karan's Mac**.

**Security scope:** This is a controlled classroom prototype. The browser's role changes and audit trail are simulations, not independently verified identities. For a real enterprise deployment, use managed-device authentication, certificate provisioning, identity-aware access control and a production audit backend.

## Optional Mac Control Helper

**Safety first: save your work. A confirmed live request can power off the Mac.** Run only on the Mac you own or have explicit permission to manage. The helper is never started by `npm run dev`, never deployed to Vercel, and only listens on `127.0.0.1`.

Keep the normal Vite app running in Terminal 1. Open **Terminal 2**, navigate to the same extracted project folder and start the safe preview:

```bash
npm run helper:mac
```

Terminal 2 prints a unique temporary session code. In NOVATECH, finish all seven ransomware response gates, switch to **IT Operations**, open **Mac Control**, click **Check connection**, and paste the code. Enter `SHUT DOWN MY MAC`, check the save-your-work acknowledgement and press **Test request (no shutdown)**. The helper will return `Preview passed`; no native command is run.

When you intentionally want to test a real shutdown on your Mac, **stop the preview helper with Control+C** in Terminal 2 and launch:

```bash
npm run helper:mac:live
```

Copy the **new** temporary session code, repeat the on-screen checks and click **Request REAL Mac shutdown**. First confirm in Chrome; then macOS presents a separate confirmation dialog with **Cancel selected by default** and a 30-second timeout. Only selecting **Shut Down Mac** there asks macOS to shut down. macOS may request Automation access for Terminal/System Events, or block shutdown when apps have unsaved documents. If you cancel or permission is denied, your Mac stays on.

No real shutdown has been run or verified in this development container. The browser roles and records are a classroom simulation, not real access controls; the helper relies on local-only network restrictions, an unpredictable session code and explicit macOS confirmation.

For the exact demonstration sequence and security boundary, read [V2_DEMO_GUIDE.md](../V2_DEMO_GUIDE.md).


## Quality checks

```bash
npm run build
npm test
npx eslint src/sentinel src/main.tsx
```

The inherited full-project ESLint configuration reports errors in the original pages (mostly `any`
types). New code is checked separately without rewriting the original application.

## Project layout (V2.4 additions)

- `src/sentinel/` — the Sentinel application: `data/` (team, company, register, scenarios, geography),
  `engine/` (incident engine, SHA-256 ledger, governance record), `audio/` (NOVA voice, sound cues, lines),
  `presenter/` (shows, controller, console, stage, phone script), `components/`, `pages/`, `styles/`
- `src/enterprise/demo/` — offline data layer for the original enterprise pages (snapshot of the case data)
- `native/macos/NovatechApprover/` — opt-in SwiftUI owner-approval companion; `scripts/mac-approval.mjs`
- `docs/` — design system, voice, demo script, native companion, enterprise demo data
- `tests/sentinel-*.test.mjs`, `tests/enterprise-demo.test.mjs`, `tests/mac-approval.test.mjs`

## Project layout (V2.3)

- `src/v2/DemoApp.tsx` — V2 interface and browser interactions
- `src/v2/demo.css` — isolated dark command-centre visual system
- `src/v2/demoEngine.ts` — scenario data and deterministic, role-gated state transitions
- `src/v2/mission.css` — Mission Control visual refinements and analytics panels
- `src/v2/VoiceStudio.tsx`, `src/v2/voice.css`, `src/v2/useVoiceStudio.ts`, `src/v2/voiceEngine.ts` — narration controls, pronunciation and browser speech
- `src/v2/MacControlCard.tsx`, `src/v2/macPowerPolicy.ts`, `src/v2/mac-control.css` — local-device closeout controls and demo-level sequencing
- `scripts/mac-control-helper.mjs`, `scripts/mac-helper-core.mjs` — standalone preview/live macOS helper with native confirmation; never bundled into the website
- `tests/mac-helper.test.mjs` — origin, session code, consent, safe preview, mocked live execution and workflow tests
- `src/v2/RemotePairingCard.tsx`, `src/v2/remote-pairing.css` — owner-controlled classroom pairing, expiry and access revocation
- `scripts/remote-pairing.mjs`, `scripts/remote-helper-servers.mjs`, `scripts/remote-agent.mjs` — 30-minute paired HTTPS remote presenter with local-only owner controls
- `scripts/remote-agent-launch.mjs` — optional macOS per-user background LaunchAgent setup and removal
- `scripts/remote-ui.html`, `scripts/remote-ui.css`, `scripts/remote-ui.js` — isolated presenter-side dashboard served by the Mac, not Vercel
- `tests/remote-pairing.test.mjs` — pairing, timeouts, revocation, HTTPS controller and mocked shutdown tests
- `tests/v2-engine.test.mjs` — logic and persistence tests
- `src/main.tsx` — route-aware entry point; lazy-loads V2 or original app
- `src/pages`, `src/components`, `src/lib` — preserved original application
- `supabase/sql` — preserved original database schema

## Scope and integrity

V2 is a front-end classroom simulation. Role switching is **not** secure authentication, the evidence history is **not** tamper-evident, and scenario values are fictional. The original application has database-backed security; do not represent the new simulation as its production controls. To make V2 a production multi-user workflow, integrate explicit server-side authorization, audit storage, and verified infrastructure connectors in a separate deployment and test database.
