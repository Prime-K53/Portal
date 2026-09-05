/**
 * Prime PORTAL — Banner Aspect-Ratio UI Verification
 *
 * Run with:   npx tsx acceptance/banner-aspect-ratio-ui.test.mjs
 *
 * Verifies the dashboard banner:
 *   - container is exactly 3:1 at desktop / laptop / tablet widths and 7:2
 *     (3.5:1) on mobile — the mobile-specific aspect ratio is tighter to
 *     reduce vertical space on small screens.
 *   - artwork fills the container without distortion (cover for >= 4:1,
 *     contain for legacy taller images like squares)
 *   - no layout shift while a slow image loads (container height reserved)
 *   - failed/missing image falls back to the gradient — no broken icon,
 *     no dashboard breakage
 *   - CTA / carousel behavior still works
 *
 * ALL ERP API calls are INTERCEPTED with controlled payloads (and the banner
 * images with real generated PNGs), so the test is deterministic and makes
 * zero real ERP requests.
 */
import { createRequire } from 'module';
import { deflateSync } from 'zlib';

const require = createRequire(import.meta.url);
const { chromium } = require(
  'D:/Duplicate/Prime ERP System/node_modules/.pnpm/playwright-core@1.62.0/node_modules/playwright-core'
);

const DEV_URL = 'http://127.0.0.1:3001';

const results = [];
let failCount = 0;
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  if (!pass) failCount++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Tiny PNG encoder (solid color, exact declared dimensions) ───────────────
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function solidPng(width, height, [r, g, b]) {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.alloc((1 + width * 3) * height);
  for (let y = 0; y < height; y++) row.copy(raw, y * (1 + width * 3));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: truecolor
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Controlled banners & images ─────────────────────────────────────────────
const IMG = 'https://banner.test/';
const banners = {
  correct: { id: 'ad_correct', title: '4:1 Correct Banner', imageUrl: `${IMG}correct-1600x400.png`, ctaTarget: '/portal/orders', ctaLabel: 'View', badge: 'PROMO' },
  legacy:  { id: 'ad_legacy',  title: 'Legacy 568x140',     imageUrl: `${IMG}legacy-568x140.png`,   ctaTarget: null },
  wide:    { id: 'ad_wide',    title: 'Very Wide 3200x400', imageUrl: `${IMG}wide-3200x400.png`,    ctaTarget: null },
  square:  { id: 'ad_square',  title: 'Square 400x400',     imageUrl: `${IMG}square-400x400.png`,   ctaTarget: null },
  missing: { id: 'ad_missing', title: 'Missing Image',      imageUrl: `${IMG}missing.png`,          ctaTarget: null },
};
const pngs = {
  'correct-1600x400.png': solidPng(1600, 400, [120, 80, 200]),
  'legacy-568x140.png':   solidPng(568, 140, [40, 120, 90]),
  'wide-3200x400.png':    solidPng(3200, 400, [200, 120, 40]),
  'square-400x400.png':   solidPng(400, 400, [40, 90, 180]),
};

// Mobile uses 7:2 (~3.5:1); everything ≥sm uses 3:1. We use the same
// "aspect-[...]" attribute selector — both values match.
const BANNER_SELECTOR = 'main [class*="aspect-[7/2]"], main [class*="aspect-[3/1]"]';

async function bannerMetrics(page) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const img = el.querySelector('img');
    const sibling = el.parentElement
      ? Array.from(el.parentElement.children).find((c) => c !== el)
      : null;
    return {
      width: r.width,
      height: r.height,
      ratio: r.width / r.height,
      hasImg: !!img,
      imgNatural: img ? { w: img.naturalWidth, h: img.naturalHeight } : null,
      objectFit: img ? getComputedStyle(img).objectFit : null,
      nextTop: sibling ? sibling.getBoundingClientRect().top : null,
    };
  }, BANNER_SELECTOR);
}

// ── ERP API interception (no real ERP calls) ────────────────────────────────
function fakeSession() {
  return {
    access_token: 'test-banner-token',
    refresh_token: 'test-refresh',
    expires_in: 3600,
    user: {
      id: 'CUST-0001',
      customer_id: 'CUST-0001',
      full_name: 'Acme LTD',
      email: 'acme@test.local',
      role: 'customer',
    },
  };
}

function erpPayload(path, slide, imageDelayMs) {
  if (path.includes('/portal/auth/refresh')) {
    return { access_token: 'test-banner-token-2', refresh_token: 'test-refresh-2', expires_in: 3600, user: null };
  }
  if (path.includes('/portal/ads')) {
    return [{ ...slide, subtitle: 'Intercepted test banner', gradient: null, emoji: null, endsAt: null }];
  }
  if (path.includes('/portal/profile')) {
    return { id: 'CUST-0001', full_name: 'Acme LTD', email: 'acme@test.local', phone: '+1 555 000 0000', address: '1 Test Way', city: 'Chicago', state: 'IL', zip: '60601', country: 'US', creditLimit: 10000, balance: 4320 };
  }
  if (path.includes('/portal/loyalty')) return { tier: 'STANDARD' };
  if (path.includes('/portal/invoices')) return { invoices: [] };
  if (path.includes('/portal/orders')) return { orders: [] };
  if (path.includes('/portal/quotations')) return { quotations: [] };
  if (path.includes('/portal/requests')) return { requests: [] };
  if (path.includes('/portal/catalog')) return { catalog: [] };
  if (path.includes('/portal/statements')) return { transactions: [] };
  if (path.includes('/portal/shipments')) return { shipments: [] };
  if (path.includes('/portal/notifications')) {
    return path.includes('unread-count') ? { count: 0 } : { notifications: [] };
  }
  if (path.includes('/portal/events-ticket')) return { ticket: 'test-ticket', expiresIn: 60 };
  return null; // unknown endpoint — handled below
}

function interceptErp(page, slide, imageDelayMs = 0) {
  page.route('**/api/portal/**', async (route) => {
    const url = route.request().url();
    const path = new URL(url).pathname;
    if (path.includes('/portal/events')) {
      // SSE stream: correct MIME keeps the browser quiet; the stream closes
      // and reconnects silently.
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: ': connected\n\n',
      });
      return;
    }
    const payload = erpPayload(path, slide, imageDelayMs);
    if (payload !== null) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
      return;
    }
    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'not mocked for banner test' }),
    });
  });
  page.route('https://banner.test/**', async (route) => {
    const name = route.request().url().split('/').pop();
    if (imageDelayMs > 0) await sleep(imageDelayMs);
    if (pngs[name]) {
      await route.fulfill({ status: 200, contentType: 'image/png', body: pngs[name] });
    } else {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing' });
    }
  });
}

async function openDashboard(browser, slide, viewport, imageDelayMs = 0) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  const imgRequests = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));
  page.on('request', (r) => {
    if (r.url().includes('banner.test')) imgRequests.push(r.url());
  });
  interceptErp(page, slide, imageDelayMs);
  await page.goto(`${DEV_URL}/#/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((sess) => sessionStorage.setItem('portal_session', JSON.stringify(sess)), fakeSession());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(BANNER_SELECTOR, { timeout: 30000 });
  return { context, page, consoleErrors, imgRequests };
}

async function main() {
  console.log('═══ Banner Aspect-Ratio Verification (fully intercepted — no ERP calls) ═══');
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });

  // ── 1. Correct banner across four viewports ─────────────────────────────
  // Desktop / laptop / tablet use 3:1; mobile uses 7:2 (~3.5:1).
  for (const [label, viewport, expectedRatio] of [
    ['desktop', { width: 1920, height: 1080 }, 3],
    ['laptop',  { width: 1440, height: 900 }, 3],
    ['tablet',  { width: 768, height: 1024 }, 3],
    ['mobile',  { width: 390, height: 844 }, 3.5],
  ]) {
    const { context, page, consoleErrors } = await openDashboard(browser, banners.correct, viewport);
    await page.waitForSelector(`${BANNER_SELECTOR} img[src*="correct-1600x400"]`, { timeout: 20000 });
    const m = await bannerMetrics(page);
    check(`${label}: banner container is ${expectedRatio}:1`, m && Math.abs(m.ratio - expectedRatio) < 0.01, `w=${m?.width.toFixed(1)} h=${m?.height.toFixed(1)} ratio=${m?.ratio.toFixed(4)}`);
    check(`${label}: 1600x400 artwork loaded at natural ratio`, m?.hasImg && m.imgNatural.w === 1600 && m.imgNatural.h === 400, m?.hasImg ? `natural=${m.imgNatural.w}x${m.imgNatural.h}` : 'no img');
    check(`${label}: artwork fills without distortion (object-fit: cover)`, m?.objectFit === 'cover', `fit=${m?.objectFit}`);
    check(`${label}: no console errors`, consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ── 2. Legacy / unusual banners (laptop 1440) ────────────────────────────
  {
    const { context, page, consoleErrors } = await openDashboard(browser, banners.legacy, { width: 1440, height: 900 });
    await page.waitForSelector(`${BANNER_SELECTOR} img[src*="legacy-568x140"]`, { timeout: 20000 });
    const m = await bannerMetrics(page);
    check('Legacy 568x140 (4.06:1): container still 3:1', m && Math.abs(m.ratio - 3) < 0.01, `ratio=${m?.ratio.toFixed(4)}`);
    check('Legacy 568x140: fills with object-cover (no stretch, no crop)', m?.objectFit === 'cover', `fit=${m?.objectFit}`);
    check('Legacy 568x140: no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    await context.close();
  }

  {
    const { context, page, consoleErrors } = await openDashboard(browser, banners.wide, { width: 1440, height: 900 });
    await page.waitForSelector(`${BANNER_SELECTOR} img[src*="wide-3200x400"]`, { timeout: 20000 });
    const m = await bannerMetrics(page);
    check('Very wide 3200x400 (8:1): container still 3:1', m && Math.abs(m.ratio - 3) < 0.01, `ratio=${m?.ratio.toFixed(4)}`);
    check('Very wide 3200x400: fills with object-cover (no stretch)', m?.objectFit === 'cover', `fit=${m?.objectFit}`);
    check('Very wide 3200x400: no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    await context.close();
  }

  {
    const { context, page, consoleErrors } = await openDashboard(browser, banners.square, { width: 1440, height: 900 });
    await page.waitForSelector(`${BANNER_SELECTOR} img[src*="square-400x400"]`, { timeout: 20000 });
    const m = await bannerMetrics(page);
    check('Square 400x400 (legacy): container still 3:1', m && Math.abs(m.ratio - 3) < 0.01, `ratio=${m?.ratio.toFixed(4)}`);
    check('Square 400x400: object-contain — full image visible, NEVER cropped', m?.objectFit === 'contain', `fit=${m?.objectFit}`);
    check('Square 400x400: no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ── 3. Missing / failed image → graceful gradient fallback ──────────────
  {
    const { context, page, consoleErrors } = await openDashboard(browser, banners.missing, { width: 1440, height: 900 });
    await page.waitForTimeout(13000); // let the missing img fail and carousel settle
    const m = await bannerMetrics(page);
    const dashboardOk = await page.evaluate(
      () => document.body.innerText.length > 300 && !/Failed to load|Something went wrong/i.test(document.body.innerText)
    );
    check('Missing image: banner container intact at 3:1', m && Math.abs(m.ratio - 3) < 0.01, `ratio=${m?.ratio?.toFixed(4)}`);
    check('Missing image: broken <img> removed — gradient fallback shown', m?.hasImg === false);
    check('Missing image: dashboard unaffected', dashboardOk);
    const unexpected = consoleErrors.filter((e) => !/404|banner\.test/i.test(e));
    check('Missing image: no unexpected console errors', unexpected.length === 0, unexpected.slice(0, 2).join(' | '));
    await context.close();
  }

  // ── 4. Slow image load → no layout shift (height reserved pre-load) ─────
  {
    const { context, page, consoleErrors, imgRequests } = await openDashboard(browser, banners.correct, { width: 1440, height: 900 }, 2500);
    await page.waitForFunction(
      () => document.querySelector('[class*="aspect-[3/1]"] img, [class*="aspect-[7/2]"] img') !== null,
      { timeout: 20000 }
    );
    // The img element is in the DOM but its response is still pending (2.5s delay).
    await page.waitForTimeout(400);
    const before = await bannerMetrics(page);
    await page.waitForFunction(() => {
      const img = document.querySelector('[class*="aspect-[3/1]"] img, [class*="aspect-[7/2]"] img');
      return img && img.complete && img.naturalWidth > 0;
    }, { timeout: 20000 });
    await page.waitForTimeout(300);
    const after = await bannerMetrics(page);
    check('Slow image: height reserved BEFORE load (no layout jump)', before && after && Math.abs(before.height - after.height) < 1, `before h=${before?.height.toFixed(1)} after h=${after?.height.toFixed(1)}`);
    check('Slow image: content below banner did not shift', before && after && before.nextTop !== null && Math.abs(before.nextTop - after.nextTop) < 1, `before top=${before?.nextTop?.toFixed(1)} after top=${after?.nextTop?.toFixed(1)}`);
    check('Slow image: final render is 3:1', after && Math.abs(after.ratio - 3) < 0.01, `ratio=${after?.ratio.toFixed(4)}`);
    check('Slow image: no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ── 5. CTA still works (ad with ctaTarget → Orders tab) ─────────────────
  {
    const { context, page, consoleErrors } = await openDashboard(browser, banners.correct, { width: 1440, height: 900 });
    await page.waitForSelector(`${BANNER_SELECTOR} img[src*="correct-1600x400"]`, { timeout: 20000 });
    const clicked = await page.evaluate((sel) => {
      const btn = document.querySelector(`${sel} button`);
      if (!btn) return false;
      btn.click();
      return true;
    }, BANNER_SELECTOR);
    check('CTA button present on ad slide', clicked);
    await page.waitForTimeout(1500);
    const hash = await page.evaluate(() => window.location.hash);
    check('CTA click navigates to Orders tab', hash.includes('orders'), `hash=${hash}`);
    check('CTA flow: no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    await context.close();
  }

  await browser.close();
  console.log('\n═══ BANNER VERIFICATION SUMMARY ═══');
  const passes = results.filter((r) => r.pass).length;
  console.log(`PASS ${passes} / ${results.length}  FAIL ${failCount}`);
  results.filter((r) => !r.pass).forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
  process.exit(failCount ? 1 : 0);
}

main().catch((err) => {
  console.error('BANNER TEST FATAL:', err.message);
  process.exit(2);
});