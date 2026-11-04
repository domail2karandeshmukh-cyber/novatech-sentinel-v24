# NOVATECH Sentinel V2.4: native approval window (SwiftUI companion)

This guide is for Karan, the owner of the demonstration Mac. It explains an **optional** new approval window: what it is, how to build it, how to test it safely, how to switch it on, and how to switch it off again.

> **Nothing changes until you switch it on.** If you do nothing, NOVATECH keeps using the plain macOS dialog you have already tested, with **Cancel** as the default and a 30-second limit.

---

## 1. What it is

At the moment, when Pavan asks your Mac to shut down, macOS shows a small grey AppleScript dialog. The **SwiftUI companion** is a small Mac app that replaces that dialog with a full NOVATECH-styled approval window. The window shows:

- **NOVATECH SENTINEL · ENDPOINT ACTION AUTHORIZATION** at the top, and a **LIVE · REAL SHUTDOWN** badge (or **PREVIEW · NO SHUTDOWN** during tests).
- A two-step status line: **Remote request received**, then **Owner approval pending**.
- A red countdown ring (30 seconds by default).
- Your Mac's name and you as the owner.
- Who is asking (for example *Pavan Sanam*), with a yellow note: *"Paired LAN session — identity is the name entered at pairing, not enterprise SSO"*. The name is whatever was typed when pairing was set up. It is not proof of who someone is.
- The incident (*NT-SEC-041*), the scenario and the reason.
- The governance chain (Detect → Cyber assessment → … → Closure), clearly marked **"Classroom governance record — simulated"**.
- A red consequence box: **"Shuts down this Mac. Open apps will close — save your work first."**
- The connection: paired LAN session, TLS-encrypted, and the time the session ends.
- A large teal **Reject** button and, set well apart from it, a red **Authorize Shutdown** button.

### What the window never does

The companion is **only a question on screen**. It does not run commands, it does not use the network, and it cannot shut anything down. It shows the request, waits for your answer and reports that answer to the NOVATECH agent. The agent asks macOS to shut down only after a valid **Authorize**, and in exactly the same way as before.

---

## 2. How a request flows (and every way it stays ON)

```
Pavan clicks "Request shutdown"  →  Remote request received
                                  →  Owner approval pending (window + countdown on your Mac)
                                  →  your answer:
                                       Reject / Return / Esc / close window  → Mac stays ON
                                       Do nothing until the countdown ends   → Mac stays ON (timeout)
                                       Authorize Shutdown (after 1.5 s)      → macOS is asked to shut down
                                  →  Pavan's page shows the result
```

The design is **fail closed**. The Mac only shuts down after a clear, deliberate **Authorize**. In every one of these cases it stays on:

| Situation | Result |
|---|---|
| You click **Reject**, press **Return**, press **Esc** or close the window | Rejected, Mac stays on |
| Nobody answers before the countdown ends | Timeout, Mac stays on |
| You click **Revoke access** in NOVATECH while the window is open | Window closes, Mac stays on |
| Pavan's 30-minute session ends while the window is open | Window closes, Mac stays on |
| The companion is missing, crashes, freezes or prints anything unexpected | Error, Mac stays on |
| The companion's answer does not match this exact request | Error, Mac stays on |
| The agent hears nothing for 35 seconds (30 s + 5 s safety margin) | Agent closes the window: timeout, Mac stays on |

Extra protections:

- **Authorize Shutdown** stays locked for **1.5 seconds** after the window appears, and again every time you click back into the window. A click or key press meant for another app cannot approve anything.
- Authorize is **never** the default button, and the keyboard can only say no (Return and Esc both reject).
- The window floats above other windows, appears in the middle of the main screen and on every desktop (Space). It is sized to fit small projector screens; if the screen is very small, the middle section scrolls while the buttons stay visible.
- It works with VoiceOver: every button and the countdown have spoken labels, and the time left is announced at 20, 10 and 5 seconds. If **Reduce Motion** is on (System Settings → Accessibility → Display), the countdown is plain text with no animation. The window plays no sounds.

---

## 3. What you need

- Your Mac with **macOS 13 Ventura or newer** (your MacBook Air M4 qualifies).
- Apple's free **Command Line Tools** (they include Swift). To check, open Terminal and type `swift --version`. If you see a version number, you already have them. If not, type:

  ```bash
  xcode-select --install
  ```

  Click **Install** in the window that appears and wait for it to finish (it can take 10–20 minutes).
- The NOVATECH project folder with `npm ci` already done, which you have already set up.

---

## 4. Build the companion (one time, about 1–3 minutes)

1. Open Terminal in the NOVATECH project folder.
2. Type:

   ```bash
   npm run companion:build
   ```

3. When it finishes, you see **"Built the NOVATECH approval companion."**, its location (`native/macos/build/NovatechApprover`) and a **SHA-256** fingerprint. Building **does not switch anything on**.

If the build fails, nothing changes: NOVATECH keeps using the macOS dialog. Copy the error text and send it to the developer. Warnings during the build are fine; only errors matter.

*Optional:* `npm run companion:build -- --test` also runs the companion's own logic tests first. These may need the full Xcode app; if they cannot run, nothing is installed.

---

## 5. Test it safely (it can never shut down)

```bash
npm run companion:test-dialog
```

This opens the real window with sample data (incident NT-SEC-041, requester Pavan Sanam, owner Karan Deshmukh and the full governance chain). The window is in **PREVIEW** mode and says that nothing will shut down. Terminal confirms: *"This test NEVER shuts down your Mac."* The test script contains no shutdown code at all.

Run it several times and check each answer. Terminal prints the result each time:

- [ ] Press **Return**: Terminal shows `reject`.
- [ ] Press **Esc**: `reject`.
- [ ] Click the window's **close button** (top left): `reject`.
- [ ] Click **Reject**: `reject`.
- [ ] Do nothing for 30 seconds: `timeout`.
- [ ] Try **Authorize Shutdown** straight away. It is locked (dashed red outline, "Unlocks in …").
- [ ] Wait until it unlocks, then click it: `approve`. Your Mac does **not** shut down.
- [ ] Click another app, then click back into the window: Authorize locks again for 1.5 s.

To rehearse the exact wording of the real window, run:

```bash
npm run companion:test-dialog -- --live-look
```

The window now says **LIVE · REAL SHUTDOWN**, but this is still only a test and nothing shuts down. Add `--timeout=15` to shorten the countdown.

---

## 6. Switch it on for Pavan's remote requests

The companion is used only when you **ask for it** and it has been **built**. Otherwise the agent automatically keeps the macOS dialog.

### Option A: foreground agent (Terminal stays open)

```bash
npm run remote:live -- --approver=swiftui
```

Check the start-up text. It must say:

```
Owner approval: SwiftUI companion
```

If it says `Owner approval: macOS dialog (default)`, the line below it explains why (for example, *"not built yet"*). In that case the proven macOS dialog is used, and nothing breaks.

To test without any shutdown first, use `npm run remote:preview -- --approver=swiftui`. In preview mode **no window appears at all**, and Pavan's page simply reports "Preview passed".

### Option B: background agent (LaunchAgent, no Terminal needed)

```bash
npm run remote:install:live -- --approver=swiftui
```

The installer confirms *"Owner approval: SwiftUI companion (opt-in)"*. The agent's start-up text, including the "Owner approval" line, is written to `~/Library/Application Support/NOVATECH Remote Agent/agent.log`.

### Option C: Mac Control on this Mac (no Pavan)

```bash
npm run helper:mac:live -- --approver=swiftui
```

The window then says **Local request received** and **Same-Mac helper · 127.0.0.1 only**.

*Advanced:* the setting `NOVATECH_APPROVER=swiftui` does the same as `--approver=swiftui`, and `NOVATECH_APPROVER_PATH` can point to a companion stored somewhere else.

---

## 7. Go back to the macOS dialog (roll back)

Any one of these brings back the original dialog:

1. **Foreground:** stop the agent (Control+C) and start it **without** the flag: `npm run remote:live`.
2. **Background:** re-install **without** the flag: `npm run remote:install:live` (or `npm run remote:uninstall` to remove it).
3. **Force it for one run:** `npm run remote:live -- --approver=applescript`. This wins even if `NOVATECH_APPROVER=swiftui` is set.
4. **Remove the companion completely:** delete the folder `native/macos/build`. The agent then falls back to the macOS dialog by itself.

The original macOS dialog code has not been changed in any way.

---

## 8. Rehearse before class (in this order)

1. [ ] `npm run companion:test-dialog`: complete the whole checklist in section 5.
2. [ ] Start your presentation **full screen** (browser or Keynote), then run the test dialog again from Terminal. Confirm the window appears **on top** of the full-screen presentation.
3. [ ] Connect the **projector** (mirrored and extended, if you use both). Confirm the window is centred and fully visible, and that both buttons are on screen.
4. [ ] *(Optional)* Turn on VoiceOver (Command+F5) and listen to the countdown and button labels. Turn it off again.
5. [ ] With Pavan: `npm run remote:live -- --approver=swiftui`, then pair as usual. Pavan requests a shutdown and you click **Reject**. His page must say the request was rejected and your Mac stays on.
6. [ ] Pavan requests again and you **do nothing**: the window times out and your Mac stays on.
7. [ ] Pavan requests again and, while the window is open, you click **Revoke access** in NOVATECH: the window disappears and your Mac stays on.
8. [ ] Only when you are ready to really shut down: **save everything**, then click **Authorize Shutdown** once it unlocks.

If anything looks wrong at any step, roll back (section 7). The macOS dialog you have already tested is always available.

---

## 9. If something goes wrong

| What you see | What to do |
|---|---|
| Agent says `Owner approval: macOS dialog (default)` although you added the flag | Read the line below it. Usually the companion is not built yet: run `npm run companion:build`. |
| The window opens behind other windows, or keys do nothing | Click once inside the window. Authorize unlocks 1.5 s after the click. Return and Esc work once the window is selected. |
| `swift --version` shows an error (for example `xcrun: error: invalid active developer path`) or an install prompt, or the build fails | Install the Command Line Tools (section 3) and try again. Until then, the macOS dialog is used. |
| You click Authorize, but macOS asks for permission ("…wants to control System Events") | This is the same permission as the original dialog. Allow it, or click Don't Allow to keep the Mac on. |
| macOS does not finish shutting down | An app with unsaved work may be blocking it. Save or close that app. |

---

## 10. What has been verified so far (honest status)

| Item | Status |
|---|---|
| Companion **core logic**: reading and limiting the request, countdown, 1.5 s lock, time-out rules, answer format | Built and tested automatically (27 tests) with Swift 5.10.1 **on Linux**, not yet on a Mac |
| Companion **window** (SwiftUI look, buttons, keyboard, VoiceOver, floating over full-screen apps, Spaces, projector) | **Not built and not run anywhere yet.** SwiftUI can only be built on a Mac, so the first real build will be on your Mac |
| NOVATECH agent integration (choosing the companion, strict reading of its answer, fail-closed cases, revocation, governance record) | 53 automated tests with simulated companions, plus a check with real processes on Linux. No real window, no osascript and no shutdown were involved |
| A **real shutdown** approved through the SwiftUI window | **Not tested** |
| Background LaunchAgent with `--approver=swiftui` | **Not tested** (needs macOS) |
| Original macOS dialog path | Unchanged. You reported that a real shutdown through it worked |
| **Pavan's real Windows → Mac test over the classroom Wi-Fi** | **Still pending**, for both the macOS dialog and the companion |

Until you complete section 8 on your own Mac, treat the SwiftUI window as **unverified** and keep the macOS dialog as your plan for class.

---

## 11. Note for the web app developer

When the web app opens pairing (`POST http://127.0.0.1:43873/pair`), it may add an optional `governance` object next to the existing fields:

```json
{
  "workflowClosed": true, "approved": true, "scenarioId": "ransomware", "controllerName": "Pavan Sanam",
  "governance": {
    "incidentId": "NT-SEC-041",
    "scenario": "Ransomware on a finance workstation",
    "reason": "Final classroom step after the closed response",
    "approvals": [{ "gate": "Detect", "person": "Karan Deshmukh", "role": "Risk Coordinator", "decision": "Acknowledged" }]
  }
}
```

The rules for this object are:

- Every text field may be at most **120 characters**. A longer or non-text value is dropped, not shortened.
- There may be at most **10 approvals**. Each approval needs a `gate` and a `person`; `role` and `decision` are optional.
- An invalid record is ignored silently; it never blocks pairing.
- When a record is accepted, `GET /state` and the `/pair` response include it as `governance`. When no record was sent, the response shape is exactly as before.
- The admin server accepts request bodies up to 16 KB (the LAN controller keeps its 2 KB limit).
