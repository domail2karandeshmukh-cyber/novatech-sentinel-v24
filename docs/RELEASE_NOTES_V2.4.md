# NOVATECH Sentinel V2.4 release notes

One application: the Sentinel command experience, the original NOVATECH IRM enterprise workspace and the
V2.3 rehearsal (kept at `/v2-demo`). Everything the audience sees is fictional case data and labelled
SIMULATED where it isn't a real record.

## What changed since V2.3

- **Landing and atlas.** The enterprise nervous system: Angers, Nantes, and Rennes, the EU cloud regions, the
  bank, the ERP, the subcontracted developers, client clusters and 34 teleworker homes on real Natural Earth
  geography. Offices appear within half a second; static and complete under reduced motion.
- **Seven governed gates** for three distinct scenarios (ransomware NT-SEC-041, cloud outage NT-OPS-018,
  supplier payment fraud NT-FIN-027): owner per gate, separation of duties, policy-routed approvals
  (CISO + CEO, or CEO alone when the CFO is the requester), return for revision, time-boxed delegation,
  simulated execution with consent, verification independent of the execution, closure with residual risk.
- **ATTENTION overlay** in three readable beats, with its own sound for critical and high severity.
- **Presenter Mode**: nine shows × 2/5/8/12 minutes, private console + projector window kept in sync, single
  screen mode, phone script, Q&A that resumes at the same scene, labelled fast-forward, proof-receipt end card.
- **NOVA**: on-device voices with Indian-English first, editable pronunciations, story, or executive style,
  captions with word highlight, timed-caption fallback. Costs of a cloud voice in `docs/VOICE.md`.
- **Enterprise workspace inside the same shell** (the “case workspace”): 24 original pages on a simulated copy
  of the NT case data when no database is configured, with Sentinel’s page heads, cards and buttons.
- **Mac endpoint**: governance record sent with pairing; opt-in SwiftUI approval window with Reject as default;
  the proven macOS dialog stays the default.

## Quality pass after an independent review (28 October 2026)

A separate reviewer audited every route and flow against the brief. Fixed:

- **Presenter traps.** A clicker press on the end card no longer discards the closed run or fires a new alarm
  (it opens questions; “Start again” needs a second click). “Do it for me” actions are disabled when they do
  not apply, and selecting a scenario can never reset a run in progress. One-screen mode has Resume and a
  question picker during Q&A.
- **Header** never scrolls sideways (checked from 320 to 1920 px; it tightens below 1440 px and folds into
  the menu below 1240 px). Phone fixes for the alert overlay, wide tables, badges, and grids.
- **Two-window robustness.** Silence, Pause, and voice settings in the console now reach the projector, and
  lines the console asks for are spoken there. A reloaded projector rejoins the running show. The console
  says when projector sound is still locked and offers a sound check.
- **Nothing private on the projector**: the pairing code, controller link, and fingerprint stay on Karan’s
  screen; the projector shows status only.
- **Projector readability**: larger base type and projector contrast in the audience window; spotlight
  captions placed where they never cover the spotlighted content; sound captions in the top band; a two-second
  card names each new speaker and the question their part answers.
- **Fair speaking time** in the 8-minute show: Karan 142 s (introduction and finale), Nadia 86 s, Victor,
  Sarah, Vanessa and Pierre 63 s each. The title card lists the people who actually speak in the chosen show.
- **New in the console**: drive the simulated Mac rehearsal on the projector; **Challenge the controls** during
  questions—CEO unavailable, CEO sends it back, the executor or the requester tries to approve—answered by
  the engine on a private copy, never recorded.
- **Honest wording.** The public workspace no longer claims “live” or “real platform records”; it's labelled
  the case workspace, separate from the incident rehearsal. Verification is described as independent of the
  execution, and when the verifier also approved, the gate and the report disclose it. The difference between
  the workspace’s standing approval rules and the incident’s dual-control rule is explained where both appear.
- **Bug fixed in NOVA**: when speech synthesis failed, the fallback captions never appeared.
- Smaller fixes: the CISO’s deputy order (security analyst, then CEO), “four risks in three areas” on the
  workspace home, alert route wording, landing team cards, unreadable light-theme card on the decision flow
  page, labels for the original IRM case view and the archived V2.3 rehearsal.

## Presenter feedback round (28 October 2026)

What the team asked for, and what changed:

- **20- and 30-minute versions** of every show. The complete show runs 21 scenes at 20 minutes and 28 at 30
  minutes. The extra scenes put the case workspace on the projector with a spotlight: risk register, compliance,
  quantification, board view and continuity (20 and 30 minutes), plus EBIOS RM, controls and vendors (30
  minutes). Speaking time stays fair: between 156 s and 284 s each at 20 minutes, between 243 s and 375 s at 30
  (8 minutes: Karan 105 s, Victor 83 s, Nadia 83 s, Pierre 78 s, Sarah 69 s, Vanessa 61 s).
  Scripts: `docs/DEMO_SCRIPT_20.md`, `docs/DEMO_SCRIPT_30.md`.
- **Hand-offs are signed forms, not a submit button.** Severity (Critical, P1, to Low, P4) at detection and
  assessment; confidence, spread, MITRE ATT&CK techniques, indicators and an evidence checklist at assessment;
  a low / likely / maximum range with the cost drivers that add up to the exposure at financial impact;
  conditions and validity on each approval; the change ticket, steps and device state at execution; method,
  result and evidence references at verification; residual risk, decision, register entries and follow-ups at
  closure. Each form shows what was received and from whom, who it goes to next and when that part is due
  (inbox, e-mail and mobile push are labelled simulated). Signing stays disabled until the form is complete.
  The signed form is sealed in the ledger: the hash covers it, so changing or removing one field breaks the
  chain, while ledgers from before this change still verify. Evidence shows each signed form; the report
  states the approval conditions.
- **Do it for me** in the console fills the form visibly on the projector for about two seconds, then signs it.
- **Cinematic ATTENTION overlay**: bloom, scan lines, a pulsing frame, hazard tape, the live clock, and an
  escalation meter, with a synthesized two-tone klaxon (no recorded or copyrighted sound). NOVA speaks after
  the klaxon, not over it.
- **The final step is the power-off, and the story explains why.** The workstation stays powered on and
  isolated until its memory is imaged (a condition the CISO attaches); verification confirms the image; closure
  hands Pierre the follow-up “Power off and re-image FIN-WS-07”. The complete show (5 to 30 minutes) now ends on
  that step: Pierre requests the power-off from Windows and Karan decides on the device. On approval the
  projector shows “Powered off by its owner”, labelled REHEARSAL, SIMULATED or PREVIEW. Nothing powers off
  automatically: Reject is the default, a timeout cancels, and only the local setup on Karan’s Mac can power it
  off. The console suggests taking questions before the last scene.
- **Sound and voice reliability.** One **Start the projector** select in the projector window gives full screen,
  sound, and NOVA’s voice; if sound is still locked, a small pill on the projector says so. NOVA speaks sentence
  by sentence with start and stall watchdogs and one retry; when the browser refuses speech, captions continue
  and the line replays after the click; a failing voice is dropped. Voices are ranked by quality (natural, then
  enhanced, then accent), and the console and Settings show the quality with advice. In Microsoft Edge NOVA
  uses the free Natural neural voices (Neerja, Prabhat).
- **The eleven professor questions** each have an owner, a short answer, and the page that proves it, in the
  console and on the phone script; the projector’s lower third shows who answers.
- **Who needs what—nobody logs in**, on the Present page: Karan’s Mac runs the console and the projector,
  phones are optional for the script, Pierre’s Windows laptop sends the real request at the end, and the
  projector shows the audience view only.

## Tests that ran (in the build container, 27–28 October 2026)

| Suite | Result |
| --- | --- |
| `npm run test:sentinel` (engine, ledger, SoD, delegation, signed forms, shows, pairing record, Mac rehearsal rules, what-ifs) | 44 / 44 pass |
| `npm run test:enterprise` (demo backend parity with production, 1,144 fingerprints) | 15 / 15 pass |
| `npm run test:v2` (V2.3 regression) | 10 / 10 pass |
| `npm run test:mac` (same-Mac helper) | 6 / 6 pass |
| `npm run test:remote` (remote pairing agent) | 8 / 8 pass |
| `npm run test:companion` (SwiftUI companion, Node side, real processes, fail-closed cases) | 55 / 55 pass |
| Swift `ApproverCore` tests (Swift 5.10 on Linux; the AppKit/SwiftUI window itself wasn't compiled) | 27 / 27 pass |
| `npm run build` (`tsc -b` + Vite) | passes |
| ESLint on new code (`src/sentinel`, `src/enterprise`, `src/main.tsx`) | 0 errors (react-refresh warnings only) |

Browser checks of the presenter feedback round (headless Chromium, Playwright, 28 October 2026):

- All three scenarios through all seven gates with the signed forms, by clicking the real UI: signing blocked
  on a blank form, a value changed by hand is what gets signed, the CEO sends the cloud case back once, every
  hand-off names the next person, the chain verifies, every signed form opens on Evidence, the report states
  the conditions: 25 / 25.
- Complete show at 20 and 30 minutes with console + projector: one-click projector start, cinematic alert,
  case-workspace pages with spotlights, signed forms in the ledger, power-off ending, who answers: 18 / 18 each.
- Accessibility (axe-core, WCAG 2.1 AA): 0 violations on all 39 routes in the dark theme; in the light theme 38
  of 39 on the first pass—the classic IRM view showed white ink on its light-blue active role (3.0:1). Fixed
  (dark ink in both themes) and re-checked: 0 violations in both themes. Presenter states (title card, scene,
  console, what-if, questions): 0 in both themes. Gate forms, alert, and power-off screen: 0 at 1440 and 390 px
  in both themes.
- Toasts moved to the top right so they never sit under NOVA’s caption bar; checked at 1440 and 390 px, and the
  projector window never shows them.
- Hash-routed preview build: landing, Command Center, alert, gate 1 signed, presenter windows, V2.3 fallback
  and seven workspace pages—no application errors.

Browser checks of the earlier rounds:

- All three scenarios through all seven gates by clicking the real UI—no console errors.
- Presenter Mode with console + projector windows: 11 acceptance checks (alert, acknowledge, skipped scenes
  never sign a gate, labelled fast-forward, Q&A resume, back navigation, end card, no private text): 11 / 11.
- Review traps: sound-lock warning, cross-window Silence, projector reload, end-card clicker, scenario reset,
  nothing private on the projector, one-screen Q&A: 16 / 16.
- Spotlight captions and the console-driven Mac rehearsal (request, Reject, 30-second timeout, ledger entries
  labelled simulated) at 1920×1080 and 1280×720–11 / 11 each; captions never cover spotlighted text.
- Accessibility (axe-core, WCAG 2.1 AA): 0 violations on all 39 routes in the dark and light themes, and on the
  presenter states (title card, scene with spotlight, speaker card, what-if, console).
- No page scrolls sideways at 320, 390, 768, 1280, 1366, or 1920 px.

## Known limitations

- **Vercel preview not published yet**: the build session's automatic permission check blocked both routes it
  tried (pushing to the new `novatech-sentinel-v24` GitHub repository and creating a Vercel project). The source
  deploys as a separate project with two commands (README, “Publish the preview”); a clean `npm ci` and build
  of this exact source passed on Node 22.
- **Interim preview in Claude** (hash-routed build of the same code): the viewer allows no second window,
  printing, or downloads; use one-screen Presenter Mode there.
- **Not tested on real hardware yet**: Pierre’s Windows laptop requesting over the classroom Wi-Fi, and the
  SwiftUI approval window (never compiled against the Apple SDK). The macOS dialog path that Karan already used
  is unchanged and remains the default.
- **Real final step needs the local copy**: present from `http://localhost:5173` on Karan’s Mac when the
  physical power-off is part of the show (run sheet in `docs/DEMO_SCRIPT.md`). On the public site it's always
  a labelled simulation.
- **20- and 30-minute timings** are the scenes’ planned lengths; on the day the console shows the presentation
  time against the plan and the time left in each scene.
- **Projector sound** needs one click in the projector window (browser rule): **Start the projector** on the
  title card. The console and a pill on the projector show when it's still locked.
- **Presenter sync** works between windows of the same browser on the same computer only.
- **Two data sets**: the incident rehearsal and the case workspace are separate and labelled as such. The
  workspace’s approval queue is empty for every persona in the snapshot; its standing approval rules differ
  from the incident’s dual-control rule (explained on both pages). The workspace keeps changes in one browser;
  **Reset** restores it.
- **Production’s three newest “Home map” commits** aren't in the received ZIP, so the workspace home is the
  ZIP version.
- **Voices depend on the browser and device.** The smoothest free voices are Microsoft Edge’s Natural voices
  (they need Edge to be online); Chrome and Safari use the voices installed on the computer. No pre-recorded,
  downloadable, or cloud voice is bundled: installing an external voice model wasn't permitted in the build
  session. iPhone needs one tap before NOVA can speak.
- **ReleasePilot audio** wasn't available, so nothing is copied from it; all sounds are synthesized here.
- The persona switcher is a presentation convenience, not authentication.

## Production check

`novatech-grc` production on Vercel is still deployment `dpl_5up11uVK96zRW8ZnToTiWHqiSWzA` (commit `291ec8e`),
checked read-only on 28 October 2026. Nothing in this work deploys to it, and the production database was only
read (STABLE functions), never written.
