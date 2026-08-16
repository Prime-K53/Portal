/* Sasa Portal — UI-level acceptance via Playwright (playwright-core from the
 * ERP workspace, driving installed Chrome). Rate-limit friendly: boots the app
 * ONCE, then navigates tabs via hash change (no full page reloads), matching
 * real user behavior and keeping ERP requests well under the 200/15min limit.
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require(
  'D:/Duplicate/Prime ERP System/node_modules/.pnpm/playwright-core@1.62.0/node_modules/playwright-core'
);

const DEV_URL = 'http://127.0.0.1:3001';
const API = 'http://127.0.0.1:3000/api/portal';
const results = [];
let failCount = 0;
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  if (!pass) failCount++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function getRealSession() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_id: 'CUST-0001', full_name: 'Acme LTD' }),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error('could not obtain session');
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_in: body.expires_in,
    user: body.user,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('═══ Sasa Portal Acceptance — UI level (CUST-0001) ═══');
  const session = await getRealSession();
  check('Obtained real ERP session', true, `customer=${session.user.customer_id}`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 2000 } });

  const consoleErrors = [];
  const failedRequests = [];
  const seenUrls = new Set();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', (r) => failedRequests.push(r.url()));
  page.on('response', (r) => {
    if (r.status() >= 400 && !seenUrls.has(r.url())) {
      seenUrls.add(r.url());
      failedRequests.push(`HTTP ${r.status()} ${r.url()}`);
    }
  });

  // ── Boot unauthenticated ──────────────────────────────────────────────────
  await page.goto(`${DEV_URL}/#/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  let bodyText = await page.evaluate(() => document.body.innerText);
  check('Unauthenticated users land on the Sign In page', /Sign In to Portal/i.test(bodyText), 'login form rendered');

  // Login form error handling: bad credentials → friendly error, no crash.
  const inputs = await page.$$('input');
  if (inputs.length >= 2) {
    await inputs[0].fill('admin@primeportal.com');
    await inputs[1].fill('definitely-wrong-password');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3500);
    bodyText = await page.evaluate(() => document.body.innerText);
    const errShown = /incorrect|do not match|invalid|error/i.test(bodyText);
    check('Login form rejects bad credentials with a friendly error', errShown, (bodyText.match(/[^\n]*(incorrect|do not match|Invalid)[^\n]*/i)?.[0] ?? '').slice(0, 90));
    check('Portal not crashed after failed login', /Sign In to Portal/i.test(bodyText));
  } else {
    check('Login form inputs present', false, `inputs=${inputs.length}`);
  }

  // ── Inject the REAL ERP session envelope (ERP contract session restore) ──
  await page.evaluate((sess) => {
    sessionStorage.setItem('portal_session', JSON.stringify(sess));
  }, session);
  check('Session envelope injected into sessionStorage', true);

  // Full reload → app must restore the session and render the dashboard.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('Session restore: dashboard renders after reload', /Dashboard|Balance|Invoices|Deliveries|Outstanding/i.test(bodyText) && bodyText.length > 300, `chars=${bodyText.length}`);
  const restored = await page.evaluate(() => !!document.querySelector('main'));
  check('Portal shell rendered (main present)', restored);

  // ── Walk every route via hash navigation (SPA) ────────────────────────────
  const routes = [
    ['dashboard', '#/dashboard', /Dashboard|Balance|Outstanding|Invoices|Deliveries/i, 'Dashboard'],
    ['invoices', '#/invoices', /INV-|Invoice|unpaid|paid/i, 'Invoices'],
    ['orders', '#/orders', /Catalog|Order|SKU|Product/i, 'Orders/Catalog'],
    ['quotations', '#/quotations', /Quotation|Quote|No quotations/i, 'Quotations'],
    ['requests', '#/requests', /Quotation|Quote/i, 'Quote Requests'],
    ['deliveries', '#/deliveries', /Deliver|Shipment|No deliveries/i, 'Deliveries'],
    ['statements', '#/statements', /Statement|Balance|Ledger|Invoice/i, 'Statements'],
    ['referrals', '#/referrals', /Referral|Unavailable/i, 'Referrals'],
    ['account', '#/account', /Account|Profile|Credit|Acme LTD|Admin/i, 'Account'],
  ];

  for (const [name, hash, pattern, label] of routes) {
    const errBefore = consoleErrors.length;
    const reqBefore = failedRequests.length;
    await page.evaluate((h) => { window.location.hash = h; }, hash);
    await page.waitForTimeout(4000); // render + data settle
    bodyText = await page.evaluate(() => document.querySelector('main') ? document.querySelector('main').innerText : '');
    const hasContent = pattern.test(bodyText) && bodyText.length > 60;
    const isErrorState = /Failed to load|Something went wrong|Network error/i.test(bodyText);
    const newErrors = consoleErrors.slice(errBefore);
    const newReqs = failedRequests.slice(reqBefore);
    check(`${label} page loads with content`, hasContent && !isErrorState, `chars=${bodyText.length} errorState=${isErrorState}`);
    check(`${label} no new console errors`, newErrors.length === 0, newErrors.slice(0, 2).join(' | ').slice(0, 140));
    check(`${label} no failed requests`, newReqs.length === 0, newReqs.slice(0, 2).join(' | ').slice(0, 140));
  }

  // Referrals: intentional blocked state, never mock data.
  await page.evaluate(() => { window.location.hash = '#/referrals'; });
  await page.waitForTimeout(3500);
  bodyText = await page.evaluate(() => document.querySelector('main') ? document.querySelector('main').innerText : '');
  const refBlocked = /temporarily unavailable|not available|unavailable|coming soon|referral/i.test(bodyText);
  const noMockReferrals = !/David Sterling|Elena Rostova|Brian O'Connor|Samantha Wu/i.test(bodyText);
  check('Referrals shows intentional blocked/unavailable state', refBlocked, bodyText.replace(/\n+/g, ' ').slice(0, 110));
  check('Referrals shows NO mock referral data', noMockReferrals);

  // Error isolation: dashboard must still be usable after the blocked feature.
  await page.evaluate(() => { window.location.hash = '#/dashboard'; });
  await page.waitForTimeout(4000);
  bodyText = await page.evaluate(() => document.querySelector('main') ? document.querySelector('main').innerText : '');
  check('Dashboard still renders after visiting blocked referrals', bodyText.length > 300 && !/Failed to load/i.test(bodyText));

  // Final full reload: dashboard + session persist (notification state, etc.)
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  bodyText = await page.evaluate(() => document.body.innerText);
  check('Final reload: portal + dashboard still render', /Dashboard|Balance|Invoices/i.test(bodyText) && bodyText.length > 300);

  const fatalConsole = consoleErrors.filter((e) => !/favicon|404|401/i.test(e));
  check('No fatal console errors across whole session', fatalConsole.length === 0, fatalConsole.slice(0, 3).join(' | ').slice(0, 220));

  await browser.close();
  console.log('\n═══ UI SUMMARY ═══');
  const passes = results.filter((r) => r.pass).length;
  console.log(`PASS ${passes} / ${results.length}  FAIL ${failCount}`);
  results.filter((r) => !r.pass).forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
  process.exit(failCount ? 1 : 0);
}

main().catch((err) => {
  console.error('UI TEST FATAL:', err.message);
  process.exit(2);
});
