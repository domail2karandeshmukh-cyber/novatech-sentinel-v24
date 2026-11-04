// npm run companion:build — builds the NOVATECH SwiftUI owner-approval companion on macOS.
//
// Builds native/macos/NovatechApprover with SwiftPM (`swift build -c release`), falling back to a
// single `swiftc` invocation, then installs it at native/macos/build/NovatechApprover and prints
// its SHA-256. Building enables nothing: the agents keep using the macOS dialog until you opt in.
// Options: --test   also run the core unit tests first (`swift test`; XCTest may need full Xcode).

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_APPROVER_PATH } from './mac-approval.mjs';

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = join(projectDir, 'native', 'macos', 'NovatechApprover');
const outputPath = DEFAULT_APPROVER_PATH;
const args = process.argv.slice(2);

function run(command, commandArgs, { capture = false } = {}) {
  return spawnSync(command, commandArgs, { cwd: projectDir, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
}

function swiftSources() {
  const files = [];
  for (const folder of ['Sources/ApproverCore', 'Sources/NovatechApprover']) {
    const dir = join(packageDir, folder);
    for (const name of readdirSync(dir).sort()) if (name.endsWith('.swift')) files.push(join(dir, name));
  }
  return files;
}

function buildWithSwiftPM() {
  console.log('\n> swift build -c release');
  const build = run('xcrun', ['swift', 'build', '-c', 'release', '--package-path', packageDir]);
  if (build.status !== 0) return null;
  const binPath = run('xcrun', ['swift', 'build', '-c', 'release', '--package-path', packageDir, '--show-bin-path'], { capture: true });
  const candidate = binPath.status === 0 ? join(binPath.stdout.trim(), 'NovatechApprover') : null;
  return candidate && existsSync(candidate) ? candidate : null;
}

function buildWithSwiftc(scratch) {
  console.log('\n> swiftc (single-module fallback)');
  const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  const output = join(scratch, 'NovatechApprover');
  const result = run('xcrun', [
    'swiftc', '-O', '-parse-as-library', '-swift-version', '5',
    '-target', `${arch}-apple-macos13.0`,
    '-module-name', 'NovatechApprover',
    '-o', output,
    ...swiftSources(),
  ]);
  return result.status === 0 && existsSync(output) ? output : null;
}

function ensureSigned(path) {
  // Apple silicon only runs signed code. The linker normally adds an ad-hoc signature already;
  // re-sign ad hoc only if verification fails. No certificate or Apple ID is involved.
  const verify = run('codesign', ['--verify', '--strict', path], { capture: true });
  if (verify.status === 0) return 'ad-hoc signature present (local build)';
  const sign = run('codesign', ['--force', '--sign', '-', path], { capture: true });
  return sign.status === 0 ? 'signed ad hoc for this Mac' : 'unsigned (codesign failed; macOS may refuse to run it)';
}

function main() {
  if (process.platform !== 'darwin') {
    console.error('The NOVATECH approval companion is a native macOS (SwiftUI) app, so it can only be built on a Mac.');
    console.error('Nothing was built. On other systems the agents keep using their existing, safe behaviour.');
    return 1;
  }

  const version = run('xcrun', ['swift', '--version'], { capture: true });
  if (version.error || version.status !== 0) {
    console.error('Swift was not found on this Mac.');
    console.error('Install Apple\'s free Command Line Tools first:  xcode-select --install');
    console.error('Then run:  npm run companion:build');
    return 1;
  }
  console.log('NOVATECH approval companion — build');
  console.log((version.stdout || version.stderr).trim().split('\n')[0]);

  if (args.includes('--test')) {
    console.log('\n> swift test (core unit tests)');
    const tests = run('xcrun', ['swift', 'test', '--package-path', packageDir]);
    if (tests.status !== 0) {
      console.error('\nThe core unit tests did not pass (or XCTest is unavailable — it ships with full Xcode). Nothing was installed.');
      return 1;
    }
  }

  const scratch = mkdtempSync(join(tmpdir(), 'novatech-approver-'));
  try {
    const built = buildWithSwiftPM() ?? buildWithSwiftc(scratch);
    if (!built) {
      console.error('\nThe build failed. Nothing was installed; the agents keep using the macOS dialog.');
      console.error('If Xcode was updated recently, open it once (or run: sudo xcodebuild -license accept) and try again.');
      return 1;
    }
    mkdirSync(dirname(outputPath), { recursive: true });
    const staging = `${outputPath}.tmp-${process.pid}`;
    copyFileSync(built, staging);
    chmodSync(staging, 0o755);
    renameSync(staging, outputPath);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const signature = ensureSigned(outputPath);
  const sha256 = createHash('sha256').update(readFileSync(outputPath)).digest('hex');
  console.log('\nBuilt the NOVATECH approval companion.');
  console.log(`  Location:  ${relative(projectDir, outputPath)}`);
  console.log(`  SHA-256:   ${sha256}`);
  console.log(`  Signature: ${signature}`);
  console.log('\nNothing has been enabled yet. Next steps:');
  console.log('  1. Safe test (never shuts down):     npm run companion:test-dialog');
  console.log('  2. Use it for Pavan\'s requests:      npm run remote:live -- --approver=swiftui');
  console.log('     Background agent instead:        npm run remote:install:live -- --approver=swiftui');
  console.log('  3. Roll back at any time:            run the same command without --approver=swiftui');
  console.log('See docs/NATIVE_COMPANION.md for the full guide.');
  return 0;
}

process.exitCode = main();
