# NOVATECH public-site real Mac request — activation guide

This version has two completely separate flows:

1. **Browser simulation**: always safe, never sends a real device instruction.
2. **Real cloud request**: Pierre on Windows pairs through the public Vercel website; the Mac helper polls a Redis-backed HTTPS queue; macOS asks Karan to approve. The server cannot shut down a computer by itself.

## One-time setup (owner / administrator)

1. In the **NOVATECH Sentinel V2.4 Vercel project**, connect a managed **Upstash Redis** store using Vercel Marketplace (check pricing). The relay automatically recognizes either `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` or the Marketplace-provided `KV_REST_API_URL`/`KV_REST_API_TOKEN`. This is not the V2.3 website.
2. On Karan's Mac, extract the **updated** NOVATECH source. In that folder run `npm install` and `npm run remote:cloud:setup`. The script creates a strong unique device secret in the Mac's user-only application support folder. It prints the matching `NOVATECH_CLOUD_DEVICE_KEY` value **once**.
3. Add `NOVATECH_CLOUD_DEVICE_KEY` to Vercel's **server-side** environment variables; never use a `VITE_` prefix and never upload the `cloud.json` secret. Redeploy the updated source after provisioning the variables.
4. On the Mac, run `npm run remote:install:live` from the updated source. This replaces the earlier NOVATECH-owned launch item so it starts in the background at login. The existing private LAN controller remains available.
5. On the same Mac, visit `http://127.0.0.1:43873/` using a browser. After completing the actual classroom incident response gates, confirm that completion, then press **Generate five-minute code**. The Mac needs internet access to register its code with the relay. Only share the short-lived code privately with Pierre.
6. On Pierre's **Windows** browser, visit the public site `/endpoint` and use **Real cloud pairing**. Enter the code, pair, tick the real shutdown acknowledgment, and choose **Request REAL Mac shutdown**.
7. Karan must physically click **Shut Down Mac** in the native macOS dialog within 30 seconds. Cancel, timeout, revocation, a lost connection, or a missing helper must never authorize shutdown.

## Verify / diagnose

- `https://novatech-sentinel-v24.vercel.app/api/remote?action=health` should return `{ "service": "novatech-cloud-relay", "available": true, ... }` **after** adding all three server variables and redeploying.
- If `available` is `false`, real control is deliberately disabled. Check Vercel settings; do **not** disable browser security or reveal secrets.
- The helper runs outbound HTTPS to the relay; no router port forwarding, tunneling, or certificate exceptions are needed.
- The Mac owner's local helper status is at `http://127.0.0.1:43873/state` when requested from the local NOVATECH page or the local owner page.
- The public browser may say “delivered” while Karan is deciding; it must not claim success before the Mac acknowledges. If the Mac shuts down very quickly, its last status message may never reach the cloud; confirm physically.
- Only Karan's Mac can execute the real action. Pierre's Windows laptop stays on; it is the controller, not the target.
- A 30-minute token is not permanent authority. On Karan's Mac, use **Revoke remote access** to end the session. The real control endpoint does not offer remote command execution, file access, or remote approval.

## Security boundary

The cloud Redis queue is an integration component, not the macOS approval authority. A local Mac-controlled six-digit code is limited to five attempts and five minutes, and an authenticated session expires after 30 minutes. The browser receives a short-lived random bearer token that stays in memory. The server accepts only the exact request type; no arbitrary commands are supported. The default native dialog is cancel-first with a 30-second timeout. Do not use the real flow in the classroom before testing with Karan physically at the Mac and all open work saved.

## Limits

- Before Upstash and the secret are provisioned, the public website cannot deliver a request: the real panel deliberately says **Relay not configured**. This is honest; no public static website alone can do it.
- This implementation is a single-Mac classroom demonstrator, not a fleet endpoint-management system. It is not enterprise-certified or independently penetration-tested.
- The Mac-owning page takes Karan's explicit attestation that the director-approved workflow is complete; it cannot cryptographically verify actions completed on an entirely separate, simulated Vercel browser.
- Because the serverless relay is designed around **one owner Mac**, multiple classroom computers require additional distinct device registrations and stronger tenant isolation.
