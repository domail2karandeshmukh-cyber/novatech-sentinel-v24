# NOVATECH V2 — executive command centre demo

**V2.3 remote-presenter addition:** Pierre can request the final Mac shutdown from another laptop on the same Wi-Fi. For complete step-by-step setup, read the **V2.3 — Pierre's remote presenter workflow** section of [README.md](README.md). This uses a locally generated HTTPS controller with a five-minute pairing code, 30-minute session, and explicit Mac-side approval. It is not yet a shared multi-user risk dashboard. Test with `npm run remote:preview` before `npm run remote:live`; `npm run remote:install:preview` or `npm run remote:install:live` optionally installs a Mac background LaunchAgent.

This is a **new, isolated classroom rehearsal** inside the existing NOVATECH React application. All original routes, Supabase policies, and source files are preserved. The default scenario performs no physical operations. An optional separately started Mac Helper can request a real shutdown after the full rehearsal and explicit confirmations.

## Quick start (no Supabase account needed)

```bash
npm ci
npm run dev
```

Open the development address displayed by Vite (usually `http://localhost:5173`). With no environment keys present, V2 appears by default. The V2 experience is also available at `/v2-demo`, even when Supabase is configured. In a configured environment, the original application remains at `/`.

**Never put a Supabase secret/service-role key in a `VITE_` variable.** Only the public publishable key belongs in browser configuration. V2 needs no keys.

## Presentation flow (approximately 4–6 minutes)

1. Start with **Ransomware containment** selected. Explain that this is a fictional company and a synthetic event feed.
2. Click **Launch live scenario**. Show the critical risk score, exposure amount, incident clock and evidence stream.
3. Under **Decision workbench**, click **Fill from playbook**, then acknowledge the signal as Karan, Risk Lead.
4. Click **Assume demo role** when prompted. Nadia records the cybersecurity assessment; Sarah validates the financial impact.
5. Switch to the Director and review the authorization gate. You can choose **Return for revision** (sends work back to Nadia) or **Approve treatment** (advances to containment).
6. As IT Operations, check the explicit **simulation-only** consent and click **Simulate containment**. Explain that this stage cannot shut down the MacBook.
7. Switch to Independent Reviewer, verify evidence, then Risk Lead to close the incident.
8. Open **Evidence ledger** to inspect the actor-stamped history and **Export JSON**.
9. Optional final demonstration: open **Mac Control** at the bottom of the page after the rehearsal is closed. For the safe preview, follow the steps below. If you deliberately enable live mode on your own Mac, the device can shut down after separate operating-system confirmation.

## Mac shutdown control — two-Terminal walkthrough

### Safe preview (recommended first)

1. Keep Terminal 1 running `npm run dev` with the V2 web app at `http://localhost:5173/v2-demo`.
2. Open Terminal 2 in the **same project folder** and enter `npm run helper:mac`.
3. Keep the unique **Temporary session code** from Terminal 2 private.
4. Complete the seven-step ransomware response in the browser; after closing it, switch your simulation role to **IT Operations**.
5. Go to **Mac Control** and click **Check connection**. Paste the session code, type exactly `SHUT DOWN MY MAC` and tick the acknowledgement.
6. Click **Test request (no shutdown)**. Chrome asks for confirmation; then the helper reports success without calling macOS.

### Intentionally requesting an actual shutdown

1. **Save your work and presentation materials.** Be sure you intend to switch off your Mac.
2. Stop the preview helper in Terminal 2 with `Control+C`. Restart it explicitly using `npm run helper:mac:live`. A new session code is printed.
3. Paste the new code and complete the consent fields; click **Request REAL Mac shutdown**.
4. Confirm in Chrome, then in the **native macOS dialog**. The native dialog defaults to **Cancel** and automatically times out after 30 seconds. It will not proceed without clicking **Shut Down Mac**.
5. macOS may require Automation permission for Terminal to control System Events; applications with unsaved changes may also prevent shutdown. If so, do not bypass restrictions; show the teacher the approved request and explain the permission boundary.

The helper binds **only** to localhost, only allows the local Vite development origin, and requires a freshly generated session code. It does not work from `novatech-grc.vercel.app`. Normal browser role switching is a simulated training convenience, **not proof of identity or production authorization**. The helper was unit-tested with a fake shutdown executor; an actual power-off has not been run during development.

The **Decision chain** tab displays the ownership chain and status of all seven gates. The Mission Control dashboard also includes a **synthetic threat trajectory** and **department readiness** indicators (fictional teaching data, not production telemetry).

## NOVA Voice Studio

1. Click the **sliders/settings icon beside the speaker** in the upper-right toolbar, or **NOVA VOICE** in the left sidebar.
2. Set **English (India)** as the preferred accent. NOVA prefers a locally installed `en-IN` voice; when none is installed, it falls back to another available English voice. The available accent depends on your Mac and browser.
3. Select **Story mode** for warm, human-sounding handoffs, or **Executive mode** for short formal briefings. Adjust speed if needed.
4. Under **Pronounce Indian names naturally**, edit the spoken spellings for Karan Deshmukh, Nadia, Sarah, Victor, Pierre and NOVATECH. Click the speaker beside a name to hear the result.
5. Click **Test voice** for a full briefing sample. Close settings and enable the speaker button to narrate each new decision gate.

The microphone is **not** required for these spoken announcements. Speech uses the browser's installed voices, not a paid cloud TTS service; it cannot guarantee the same human-like output on every device. Settings are saved in local browser storage. All visible names and evidence records preserve their original spelling.

The **playbook suggestion** button fills a scenario-specific deterministic recommendation; it is not presented as AI-generated output.

Three selectable scenarios are included: ransomware, cloud service disruption, and supplier payment anomaly. Changing scenarios starts a fresh **local** rehearsal (confirmation appears if an active run has recorded decisions).

## Security and functional boundary

- Data persists only in this browser's `localStorage` under `novatech-v2-demo-run`.
- Role switching is intentionally easy for an individual presenter and is **not authentication or secure authorization**. In production, these rules would be enforced server-side.
- The evidence ledger is a local simulation and **not tamper-evident or legally auditable**.
- All scenario figures are fictional estimates for presentation purposes.
- No external API request is needed by V2. The production Supabase client is lazy-loaded only on original routes.
- The MacBook shutdown step during **Contain** remains simulation only. The independent optional Mac Helper has an explicitly launched live mode that requests real macOS shutdown after separate user confirmations.

## Verification commands

```bash
npm run build
npm run test:v2    # Node.js 22+ with TS stripping support
npm run test:mac   # Safe tests: native shutdown executor is mocked
npm run test:remote # Safe LAN pairing and HTTPS controller tests (native executor mocked)
npm run lint
```

## Existing application

The original React screens and SQL schema remain in `src/pages`, `src/components`, and `supabase/sql`. This is a safe extension: `src/main.tsx` chooses which entry point to load based on the URL and whether public Supabase configuration exists.
