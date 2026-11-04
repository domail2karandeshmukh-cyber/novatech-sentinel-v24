// Run once on Karan's Mac. Copy the printed key into Vercel server-side env vars only.
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { CONFIG_PATH } from './cloud-relay-client.mjs';

const url = process.argv[2] || 'https://novatech-sentinel-v24.vercel.app';
try {
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash) throw new Error('Use a plain HTTPS URL.');
  if (existsSync(CONFIG_PATH)) throw new Error(`Configuration already exists: ${CONFIG_PATH}. Existing credentials were NOT overwritten.`);
  const deviceKey = randomBytes(32).toString('hex');
  mkdirSync(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_PATH, JSON.stringify({ url: target.origin, deviceKey }, null, 2), { mode: 0o600, flag: 'wx' });
  console.log('NOVATECH Mac cloud bridge configured locally.');
  console.log('Add this to Vercel Project Settings → Environment Variables (production and preview):');
  console.log('NOVATECH_CLOUD_DEVICE_KEY = ' + deviceKey);
  console.log('Keep this private; NEVER put it in VITE_ variables or Git.');
  console.log('Connect Upstash Redis to Vercel. The app recognizes KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN automatically.');
  console.log('Redeploy Vercel after setting environment variables.');
  console.log('Finally, from the updated downloaded NOVATECH source, run: npm run remote:install:live');
} catch (err) { console.error(err instanceof Error ? err.message : String(err)); process.exitCode = 1; }
