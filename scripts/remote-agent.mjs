import { hostname } from 'node:os';
import { createRemoteShutdownExecutor, describeApprover, resolveApprover } from './mac-approval.mjs';
import { RemotePairing } from './remote-pairing.mjs';
import { createLocalPairingServer, createRemoteControllerServer, REMOTE_ADMIN_PORT, REMOTE_CONTROLLER_PORT } from './remote-helper-servers.mjs';
import { certificateMaterial, privateLanAddress } from './remote-network.mjs';

const live = process.argv.includes('--live');
// V2.4: resolved once at startup. The SwiftUI companion is opt-in (NOVATECH_APPROVER=swiftui or
// --approver=swiftui) and needs the built binary; otherwise the proven macOS dialog is used.
const approval = resolveApprover();

async function main() {
  if (live && process.platform !== 'darwin') throw new Error('Live remote shutdown can only run on a Mac. Use preview mode for other systems.');
  // Background launch agents may start before Wi-Fi acquires an IP address.
  let address = privateLanAddress();
  for (let attempt = 0; !address && attempt < 24; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    address = privateLanAddress();
  }
  if (!address) throw new Error('Connect your Mac to classroom Wi-Fi or a private LAN first. No private-network IPv4 address was found.');
  const { key, cert, fingerprint } = certificateMaterial(address);
  const pairing = new RemotePairing();
  // Live executor: requester name, governance and session expiry come from the paired session.
  // With the default approver this delegates to the unchanged requestNativeShutdown({ signal }).
  const executor = createRemoteShutdownExecutor({ pairing, approver: approval.approver, binaryPath: approval.binaryPath, deviceName: hostname() });
  const local = createLocalPairingServer({ pairing, address, fingerprint, live });
  const remote = createRemoteControllerServer({ key, cert, pairing, address, live, executor });
  const listen = (server, port, host) => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  await listen(local, REMOTE_ADMIN_PORT, '127.0.0.1');
  try { await listen(remote, REMOTE_CONTROLLER_PORT, address); }
  catch (error) { local.close(); throw error; }
  console.log(`NOVATECH V2.3 Remote Agent — ${live ? 'LIVE / OS CONFIRMATION REQUIRED' : 'PREVIEW / NO SHUTDOWN'}`);
  console.log(`Local pairing: http://127.0.0.1:${REMOTE_ADMIN_PORT}`);
  console.log(`Presenter page: https://${address}:${REMOTE_CONTROLLER_PORT}`);
  console.log(`Certificate SHA256 fingerprint: ${fingerprint}`);
  console.log(describeApprover(approval));
  console.log(`  ${approval.reason}`);
  if (!live) console.log('  Preview mode never opens an approval window and never shuts down.');
  console.log('Pairing opens only after the Mac owner enables it inside NOVATECH. Pairing expires after 30 minutes.');
  console.log('Do not forward the controller port to the internet. Control+C stops this foreground agent.');
  const close = () => { local.close(); remote.close(); };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}

main().catch(error => { console.error(`Remote Agent could not start: ${error.message}`); process.exitCode = 1; });
