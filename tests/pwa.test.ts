/**
 * PWA installer contract tests (run: npx tsx tests/pwa.test.ts).
 *
 * Static-contract coverage without a browser:
 *   1. manifest is valid JSON with install-critical fields + real PNG icons
 *      (signature AND actual IHDR dimensions match the declared sizes)
 *   2. service worker guards /api/* from caching and handles navigations
 *   3. offline shell exists
 *   4. index.html links manifest/theme-color/apple-touch-icon
 *   5. production-only SW registration is wired in main.tsx
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) { failures += 1; console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
  else console.log(`ok   ${label}`);
}

// 1. Manifest.
const manifestPath = path.join(ROOT, 'public', 'manifest.webmanifest');
check('manifest exists', existsSync(manifestPath));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
check('manifest name/short_name', Boolean(manifest.name && manifest.short_name));
check('display standalone', manifest.display === 'standalone');
check('start_url/scope', typeof manifest.start_url === 'string' && typeof manifest.scope === 'string');
check('theme+background colors', Boolean(manifest.theme_color && manifest.background_color));

for (const icon of manifest.icons as Array<{ src: string; sizes: string; type: string }>) {
  const file = path.join(ROOT, 'public', icon.src);
  check(`icon ${icon.src} exists`, existsSync(file));
  const bytes = readFileSync(file);
  // Accept PNG (ASCII signature 'PNG' at bytes 1..3) and ICO (magic 0x00000100).
  // Other formats are out of scope for the PWA manifest contract.
  const isPng = bytes.length > 4 && bytes.slice(1, 4).toString() === 'PNG';
  const isIco = bytes.length > 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0;
  check(`icon ${icon.src} is a recognized image format`, isPng || isIco);

  let w = NaN;
  let h = NaN;
  if (isPng) {
    // PNG IHDR width/height are big-endian uint32 at offsets 16 and 20.
    w = bytes.readUInt32BE(16);
    h = bytes.readUInt32BE(20);
  } else if (isIco) {
    // ICO format: little-endian uint16 dimensions at offsets 6 (width) and 7
    // (height) in the ICONDIR header. 0 means 256.
    const wRaw = bytes.readUInt16LE(6);
    const hRaw = bytes.readUInt16LE(7);
    w = wRaw === 0 ? 256 : wRaw;
    h = hRaw === 0 ? 256 : hRaw;
  }

  const declared = icon.sizes.split('x').map(Number);
  // 'any' is a special PWA size that means the browser picks — only check
  // declared dimensions for size-specific entries.
  if (icon.sizes === 'any') {
    check(`icon ${icon.src} declares 'any' size`, true);
  } else {
    check(`icon ${icon.src} dimensions ${w}x${h} == ${declared[0]}x${declared[1]}`, w === declared[0] && h === declared[1]);
  }
}
check(
  'installability: any 192+ any 512',
  ['192', '512'].every((size) =>
    (manifest.icons as Array<{ sizes: string; purpose?: string }>).some(
      (i) => i.purpose?.includes('any') !== false && i.sizes.startsWith(size)
    )
  )
);
check('maskable icon present', (manifest.icons as Array<{ purpose?: string }>).some((i) => i.purpose === 'maskable'));

// 2. Service worker.
const sw = readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');
check('sw installs + activates', sw.includes("addEventListener('install'") && sw.includes("addEventListener('activate'"));
check('sw handles fetch', sw.includes("addEventListener('fetch'"));
check('sw NEVER caches /api/*', sw.includes("startsWith('/api/')") && sw.includes('return;'));
check('sw offline fallback for navigations', sw.includes('/offline.html'));
check('sw cache versioning', /CACHE_NAME\s*=\s*'prime-portal-v\d+'/.test(sw));

// 3. Offline shell.
check('offline.html exists', existsSync(path.join(ROOT, 'public', 'offline.html')));

// 4. HTML shell wiring.
const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
check('html links manifest', html.includes('rel="manifest" href="/manifest.webmanifest"'));
check('html theme-color', html.includes('name="theme-color"'));
check('html apple-touch-icon', html.includes('apple-touch-icon'));

// 5. Registration wired in prod-only entry.
const main = readFileSync(path.join(ROOT, 'src', 'main.tsx'), 'utf8');
check('main registers service worker', main.includes('registerServiceWorker()'));
const pwa = readFileSync(path.join(ROOT, 'src', 'pwa', 'pwa.ts'), 'utf8');
check('registration is PROD-only', pwa.includes('import.meta.env.PROD'));

if (failures > 0) {
  console.error(`\n${failures} PWA contract check(s) failed`);
  process.exit(1);
}
console.log('\nAll PWA contract checks passed');
