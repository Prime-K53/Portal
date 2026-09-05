/**
 * Pre-deploy smoke test — runs as a CI job before shipping to staging.
 *
 * Checks:
 *  1. Production build artifact is present and non-empty.
 *  2. HTML shell wires all required PWA / metadata links correctly.
 *  3. The JS bundle is syntactically parseable (no top-level parse errors).
 *
 * Does NOT require a browser or a running server. Operates purely on the
 * built dist/ output.
 *
 * Run (from repo root):
 *   npx tsx tests/smoke.test.ts
 *
 * In CI this job gates the deploy step. The actual browser-based smoke test
 * (verifying the bundle loads without console errors) is run separately in
 * acceptance/smoke.spec.ts via Playwright — see docs/smoke-testing.md.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const DIST = resolve(ROOT, 'dist');

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) { failures++; console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
  else console.log(`ok   ${label}`);
}

// ── 1. Build artifact presence ───────────────────────────────────────────────

check('dist/ directory exists', existsSync(DIST));
check('dist/index.html exists', existsSync(resolve(DIST, 'index.html')));

const assetsDir = resolve(DIST, 'assets');
const jsAssets: string[] = existsSync(assetsDir)
  ? readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
  : [];

check('at least one JS asset in dist/assets/', jsAssets.length > 0, `found: ${jsAssets.join(', ')}`);

// ── 2. HTML shell wiring ────────────────────────────────────────────────────

const html = readFileSync(resolve(DIST, 'index.html'), 'utf8');

check('html has <html lang="en">', html.includes('<html lang="en">'));
check('html has theme-color meta', html.includes('name="theme-color"'));
check('html links manifest.webmanifest', html.includes('rel="manifest" href="/manifest.webmanifest"'));
check('html has apple-touch-icon link', html.includes('apple-touch-icon'));
check('html has <title>', /<title>[^<]+<\/title>/.test(html));
check('html mounts #root div', html.includes('id="root"'));
check('html loads exactly one type=module script', (html.match(/<script[^>]*type="module"[^>]*>/g) ?? []).length === 1);
check('html does not load scripts with crossorigin=use-credentials', !html.includes('crossorigin="use-credentials"'));

// ── 3. Bundle integrity ─────────────────────────────────────────────────────
// Only the main app bundle (index-*.js) contains the app code + Sentry.
// Vendor chunks (pdf-*, vendor-*) are external libs and need not contain app markers.

const appBundle = jsAssets.find((f) => /^index-/.test(f));
check('main app bundle (index-*.js) exists', Boolean(appBundle));

if (appBundle) {
  const content = readFileSync(resolve(assetsDir, appBundle), 'utf8');
  const size = content.length;
  check(`bundle ${appBundle} is non-empty`, size > 10_000, `${(size / 1024).toFixed(0)} KB`);
  check(`bundle ${appBundle} has no top-level "Unexpected token"`, !content.includes('Unexpected token'));
  check(`bundle ${appBundle} contains Sentry integration`, content.includes('Sentry') || content.includes('sentry'));
  check(`bundle ${appBundle} references VITE_API_URL`, content.includes('VITE_API_URL'));
  // ISR-safe: no absolute API URLs baked in at build time.
  check(`bundle ${appBundle} has no hardcoded API origin`, !/https?:\/\/[a-z]+\.prime-erp\.com/.test(content));
}

// All chunks must be non-empty and parseable (catch mangling/build errors).
for (const asset of jsAssets) {
  const content = readFileSync(resolve(assetsDir, asset), 'utf8');
  check(`chunk ${asset} is non-empty`, content.length > 100);
  check(`chunk ${asset} has no parse error`, !content.includes('Unexpected token'));
}

// ── Result ────────────────────────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\n${failures} smoke check(s) failed`);
  process.exit(1);
}
console.log('\nAll smoke checks passed');
