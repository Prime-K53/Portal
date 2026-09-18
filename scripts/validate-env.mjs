#!/usr/bin/env node
/**
 * Build-time environment guard. Fails the build when production would ship
 * mock auth/api or missing API URL. Reads .env, .env.production (if present)
 * without dependencies.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function parseEnvFile(path) {
  const out = {};
  try {
    if (!existsSync(path)) return out;
    const text = readFileSync(path, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      let key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key.startsWith('export ')) key = key.slice(7).trim();
      out[key] = val;
    }
  } catch {
    // ignore
  }
  return out;
}

const root = process.cwd();
const base = parseEnvFile(resolve(root, '.env'));
const prod = parseEnvFile(resolve(root, '.env.production'));
// Real env (CI secrets) wins over files.
const env = { ...base, ...prod, ...process.env };

const asBool = (v) => String(v ?? '').trim().toLowerCase() === 'true' || String(v ?? '').trim() === '1';
const mode = process.env.NODE_ENV || 'production';
const isProdBuild = mode === 'production' || process.argv.includes('--prod');

if (!isProdBuild) {
  console.log('[validate-env] Skipping (non-production build).');
  process.exit(0);
}

const errors = [];
if (asBool(env.VITE_ENABLE_MOCK_API) || asBool(env.VITE_ENABLE_MOCK_AUTH)) {
  errors.push('Mock flags must be false in production (VITE_ENABLE_MOCK_API / VITE_ENABLE_MOCK_AUTH).');
}
if (!asBool(env.VITE_USE_REAL_BACKEND)) {
  errors.push('VITE_USE_REAL_BACKEND must be true in production.');
}
if (!String(env.VITE_API_URL ?? '').trim()) {
  errors.push('VITE_API_URL is empty — production build would fail all ERP requests.');
} else if (!/^https?:\/\//i.test(String(env.VITE_API_URL).trim())) {
  errors.push(`VITE_API_URL "${env.VITE_API_URL}" must start with http(s)://.`);
} else if (/^http:\/\//i.test(String(env.VITE_API_URL).trim())) {
  errors.push('VITE_API_URL uses http:// in production — use https://.');
}

if (errors.length > 0) {
  console.error('[validate-env] Production environment invalid:');
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log('[validate-env] OK.');
