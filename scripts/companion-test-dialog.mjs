// npm run companion:test-dialog — shows the SwiftUI approval window with realistic sample data and
// prints the decision. This script NEVER shuts the Mac down: it only imports the function that
// opens the approval window, and no shutdown code is called whatever you click.
// Options:
//   --live-look   show the LIVE wording ("Shuts down this Mac") to rehearse the real window.
//                 Still a test: nothing is shut down.
//   --timeout=N   countdown length in seconds (10–60, default 30).

import { hostname } from 'node:os';
import { APPROVER_SWIFTUI, requestOwnerApproval, resolveApprover } from './mac-approval.mjs';

const SAMPLE_GOVERNANCE = [
  { gate: 'Detect', person: 'Karan Deshmukh', role: 'Risk Coordinator', decision: 'Acknowledged' },
  { gate: 'Cyber assessment', person: 'Nandini Vadlamudi', role: 'Cybersecurity Analyst', decision: 'Isolation proposed' },
  { gate: 'Financial impact', person: 'Srija Poudapally', role: 'CFO / DAF', decision: 'Exposure validated' },
  { gate: 'Security authorization', person: 'Vijay Bhosale', role: 'RSSI / CISO', decision: 'Authorized' },
  { gate: 'Executive authorization', person: 'Vandana Madem', role: 'Chief Executive Officer', decision: 'Authorized' },
  { gate: 'IT action', person: 'Pavan Sanam', role: 'IT Operations Manager', decision: 'Executed (simulated)' },
  { gate: 'Verification', person: 'Vijay Bhosale', role: 'RSSI / CISO', decision: 'Independently verified' },
  { gate: 'Closure', person: 'Karan Deshmukh', role: 'Risk Coordinator', decision: 'Closed' },
];

function option(name) {
  const flag = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return flag ? flag.slice(name.length + 3) : undefined;
}

async function main() {
  console.log('NOVATECH SENTINEL — SwiftUI approval window TEST');
  console.log('This test NEVER shuts down your Mac. No shutdown code is called, whatever you click.\n');

  if (process.platform !== 'darwin') {
    console.error('The SwiftUI approval window can only be shown on macOS. Nothing was run.');
    return 1;
  }

  // Check the built binary directly; this does not depend on NOVATECH_APPROVER being enabled.
  const check = resolveApprover({ env: { ...process.env, NOVATECH_APPROVER: APPROVER_SWIFTUI }, argv: [] });
  if (check.approver !== APPROVER_SWIFTUI) {
    console.error(check.reason);
    console.error('Build it first:  npm run companion:build');
    return 1;
  }

  const liveLook = process.argv.includes('--live-look');
  const timeoutSeconds = Number(option('timeout') ?? 30);
  const meta = {
    ownerName: 'Karan Deshmukh',
    requesterName: 'Pavan Sanam',
    requesterContext: 'Paired LAN session — identity is the name entered at pairing, not enterprise SSO',
    incidentId: 'NT-SEC-041',
    scenario: 'Ransomware on a finance workstation (FIN-WS-07)',
    reason: 'Final classroom step after the closed NT-SEC-041 response: governed shutdown of the demo Mac.',
    governance: SAMPLE_GOVERNANCE,
    mode: liveLook ? 'LIVE' : 'PREVIEW',
    channel: 'LAN_TLS',
    sessionExpiresAt: Date.now() + 30 * 60 * 1000,
    deviceName: hostname(),
    timeoutSeconds,
  };

  console.log(`Companion:   ${check.binaryPath}`);
  console.log(liveLook
    ? 'Window mode: LIVE look — the window will SAY it shuts down this Mac. This test still never shuts down.'
    : 'Window mode: PREVIEW — the window itself says that nothing will shut down.');
  console.log('Try: Return or Esc (reject), the close button (reject), waiting (timeout), and Authorize after 1.5 s.');
  console.log('Waiting for your decision…\n');

  const result = await requestOwnerApproval(meta, { binaryPath: check.binaryPath });

  console.log(`Decision:    ${result.decision}  (reason: ${result.reason})`);
  console.log(`Detail:      ${result.detail}`);
  console.log(`Request ID:  ${result.requestId}`);
  if (result.decidedAt) console.log(`Decided at:  ${result.decidedAt}`);
  console.log('\nResult: TEST ONLY — your Mac was not shut down and no shutdown code was called.');
  return result.decision === 'error' ? 1 : 0;
}

process.exitCode = await main();
