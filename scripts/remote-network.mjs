import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { networkInterfaces, homedir } from 'node:os';
import { join } from 'node:path';

export function privateLanAddress(networks = networkInterfaces()) {
  const candidates = [];
  for (const [device, records] of Object.entries(networks)) {
    for (const iface of records ?? []) {
      const ip = iface.address;
      if (iface.internal || iface.family !== 'IPv4') continue;
      const parts = ip.split('.').map(Number);
      const privateLan = parts[0] === 10 || parts[0] === 192 && parts[1] === 168 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
      if (privateLan) candidates.push({ ip, score: device === 'en0' ? 0 : device === 'en1' ? 1 : device.startsWith('en') ? 2 : 4 });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]?.ip ?? null;
}

export function certificateMaterial(address, dataDir = join(homedir(), 'Library', 'Application Support', 'NOVATECH Remote Agent')) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) throw new Error('A local IPv4 address is required.');
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  chmodSync(dataDir, 0o700);
  const keyPath = join(dataDir, 'lan-server.key');
  const certPath = join(dataDir, 'lan-server.crt');
  let valid = false;
  if (existsSync(keyPath) && existsSync(certPath)) {
    try {
      const info = new X509Certificate(readFileSync(certPath));
      valid = Date.parse(info.validTo) > Date.now() + 24 * 60 * 60 * 1000 && info.subjectAltName?.includes(address);
    } catch { /* A new certificate will be generated. */ }
  }
  if (!valid) {
    const configPath = join(dataDir, 'openssl-local.cnf');
    writeFileSync(configPath, `[req]\nprompt = no\ndistinguished_name = dn\nx509_extensions = extensions\n[dn]\nCN = NOVATECH Classroom Remote Agent\n[extensions]\nsubjectAltName = @alts\nkeyUsage = digitalSignature, keyEncipherment\nextendedKeyUsage = serverAuth\n[alts]\nIP.1 = ${address}\nDNS.1 = localhost\n`, { mode: 0o600 });
    execFileSync('openssl', ['req', '-x509', '-nodes', '-newkey', 'rsa:2048', '-sha256', '-days', '7', '-keyout', keyPath, '-out', certPath, '-config', configPath, '-extensions', 'extensions'], { stdio: ['ignore', 'ignore', 'pipe'] });
    chmodSync(keyPath, 0o600);
    chmodSync(certPath, 0o600);
  }
  const key = readFileSync(keyPath);
  const cert = readFileSync(certPath);
  const fingerprint = new X509Certificate(cert).fingerprint256;
  return { key, cert, fingerprint };
}
