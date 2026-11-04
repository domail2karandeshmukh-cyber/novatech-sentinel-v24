import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import { createMacHelperServer, HELPER_PORT } from './mac-helper-core.mjs';
import { createLocalHelperShutdownExecutor, describeApprover, resolveApprover } from './mac-approval.mjs';

const live = process.argv.includes('--live');
if (live && process.platform !== 'darwin') {
  process.stderr.write('Real shutdown is only available on a Mac. Run without --live to test safely.\n');
  process.exitCode = 1;
} else {
  const token = randomBytes(24).toString('hex');
  // V2.4: optional SwiftUI owner approval (opt-in). Token, origin and phrase checks are unchanged
  // in mac-helper-core.mjs; with the default approver this runs the same macOS dialog as before.
  const approval = resolveApprover();
  const executeShutdown = createLocalHelperShutdownExecutor({ approver: approval.approver, binaryPath: approval.binaryPath, deviceName: hostname() });
  const server = createMacHelperServer({ token, live, executeShutdown });
  server.on('error', error => {
    process.stderr.write(`Could not launch the Mac Helper: ${error.message}\n`);
    process.exitCode = 1;
  });
  server.listen(HELPER_PORT, '127.0.0.1', () => {
    process.stdout.write(`\nNOVATECH MAC CONTROL HELPER\n${'='.repeat(27)}\n`);
    process.stdout.write(`Mode: ${live ? 'LIVE — can shut down this Mac with confirmation' : 'PREVIEW — safe test, cannot shut down anything'}\n`);
    process.stdout.write(`${describeApprover(approval)}\n  ${approval.reason}\n`);
    process.stdout.write(`Local address: http://127.0.0.1:${HELPER_PORT}\n`);
    process.stdout.write(`Temporary session code: ${token}\n`);
    process.stdout.write('Enter this code in NOVATECH Mac Control. Never publish or share it.\n');
    process.stdout.write('Press Control+C to stop the helper. Nothing starts automatically.\n\n');
  });
}
