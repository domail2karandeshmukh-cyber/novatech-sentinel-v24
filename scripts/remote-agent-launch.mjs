import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveApprover } from './mac-approval.mjs';

const LABEL = 'com.novatech.classroom-remote-agent';
const folder = join(homedir(), 'Library', 'LaunchAgents');
const plist = join(folder, `${LABEL}.plist`);
const mode = process.argv[2];
if (process.platform !== 'darwin') {
  console.error('Background LaunchAgent installation is supported only on macOS.');
  process.exitCode = 1;
} else if (!['install-preview', 'install-live', 'uninstall'].includes(mode)) {
  console.error('Usage: install-preview | install-live | uninstall');
  process.exitCode = 1;
} else {
  const existing = existsSync(plist) ? readFileSync(plist, 'utf8') : null;
  if (existing && !existing.includes(`<string>${LABEL}</string>`)) {
    console.error('The existing launch item is not NOVATECH-owned; it was not changed.');
    process.exitCode = 1;
  } else {
    const gui = `gui/${process.getuid()}`;
    if (existing) spawnSync('/bin/launchctl', ['bootout', gui, plist], { stdio: 'ignore' });
    if (mode === 'uninstall') {
      if (existing) unlinkSync(plist);
      console.log('NOVATECH background helper removed. It will no longer start at login.');
    } else {
      const script = join(dirname(fileURLToPath(import.meta.url)), 'remote-agent.mjs');
      const node = process.execPath;
      const workdir = dirname(dirname(script));
      const escapeXml = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
      mkdirSync(folder, { recursive: true });
      // V2.4 (opt-in): carry an explicit SwiftUI approver choice (--approver=swiftui or
      // NOVATECH_APPROVER=swiftui at install time) into the LaunchAgent. Without it the plist is
      // exactly as before, so re-installing without the flag rolls back to the macOS dialog.
      const approval = resolveApprover();
      const approverArgs = approval.requested ? ['--approver=swiftui'] : [];
      const approverEnv = approval.requested
        ? `<key>EnvironmentVariables</key><dict><key>NOVATECH_APPROVER</key><string>swiftui</string>${process.env.NOVATECH_APPROVER_PATH?.trim() ? `<key>NOVATECH_APPROVER_PATH</key><string>${escapeXml(approval.binaryPath)}</string>` : ''}</dict>\n`
        : '';
      const args = [node, script, ...(mode === 'install-live' ? ['--live'] : []), ...approverArgs];
      const dataDir = join(homedir(), 'Library', 'Application Support', 'NOVATECH Remote Agent');
      mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      const logs = join(dataDir, 'agent.log');
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>${LABEL}</string>\n<key>ProgramArguments</key><array>${args.map(a => `<string>${escapeXml(a)}</string>`).join('')}</array>\n<key>WorkingDirectory</key><string>${escapeXml(workdir)}</string>\n${approverEnv}<key>RunAtLoad</key><true/>\n<key>KeepAlive</key><true/>\n<key>StandardOutPath</key><string>${escapeXml(logs)}</string>\n<key>StandardErrorPath</key><string>${escapeXml(logs)}</string>\n</dict></plist>\n`;
      writeFileSync(plist, xml, { mode: 0o600 });
      try {
        execFileSync('/bin/launchctl', ['bootstrap', gui, plist], { stdio: ['ignore', 'pipe', 'pipe'] });
        console.log(`NOVATECH ${mode === 'install-live' ? 'LIVE' : 'PREVIEW'} agent installed. It starts in the background at login.`);
        if (approval.requested) {
          console.log(approval.approver === 'swiftui'
            ? 'Owner approval: SwiftUI companion (opt-in). Re-install without --approver=swiftui to return to the macOS dialog.'
            : `Owner approval: ${approval.reason} The background agent checks again every time it starts.`);
        }
        console.log('Open NOVATECH on this Mac and use Remote Presenter Pairing to create a new 30-minute session.');
      } catch (error) {
        console.error('macOS did not start the helper. Check System Settings > General > Login Items & Extensions.');
        console.error(error instanceof Error ? error.message : 'LaunchAgent error');
        process.exitCode = 1;
      }
    }
  }
}
