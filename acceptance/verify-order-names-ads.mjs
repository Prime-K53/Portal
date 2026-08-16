/* Sasa — Final read-side fix verification (UI level, CUST-0001).
 * Verifies:
 *   1. Order History shows REAL ERP item names for ORD-0002
 *      (Administration Records / Record Book / Student Management Journal,
 *      not "Item"), with correct qty/price/total.
 *   2. Dashboard carousel shows the REAL ERP advertisements served by
 *      GET /portal/ads (welcome slide + ads + live delivery slide).
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
  if (!body.access_token) throw new Error(`could not obtain session: ${res.status} ${JSON.stringify(body)}`);
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_in: body.expires_in,
    user: body.user,
  };
}

// The ERP ad titles that MUST appear (served by GET /portal/ads).
const ERP_AD_TITLES = ['Get 10 percent off', '5% OFF your first order'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('═══ Sasa Final Read-Side Fix — UI verification (CUST-0001) ═══');
  const session = await getRealSession();
  check('Obtained real ERP session', true, `customer=${session.user.customer_id}`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 2000 } });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));

  // ── Boot + restore real session ───────────────────────────────────────────
  await page.goto(`${DEV_URL}/#/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.evaluate((sess) => { sessionStorage.setItem('portal_session', JSON.stringify(sess)); }, session);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  let bodyText = await page.evaluate(() => document.body.innerText);
  check('Dashboard renders after session restore', /Dashboard|Account Summary|Quick Actions/i.test(bodyText) && bodyText.length > 300, `chars=${bodyText.length}`);
  check('Dashboard shows real customer identity', /Acme LTD|CUST-0001/.test(bodyText), 'Acme LTD / CUST-0001 visible');

  // ── ERP advertisements in the carousel ────────────────────────────────────
  // Slides auto-rotate every 4.5s; sample over ~24s to capture every slide.
  const sampledTexts = [];
  for (let i = 0; i < 9; i++) {
    sampledTexts.push(await page.evaluate(() => document.body.innerText));
    await sleep(2600);
  }
  const allText = sampledTexts.join('\n---\n');
  const adTitlesFound = ERP_AD_TITLES.filter((t) => allText.includes(t));
  check('ERP advertisements appear on dashboard', adTitlesFound.length === ERP_AD_TITLES.length, `found=${adTitlesFound.join(' | ') || 'none'}`);
  const welcomeFound = /WELCOME BACK/.test(allText);
  check('Welcome slide still works', welcomeFound);
  const deliverySlideFound = /LIVE SHIPMENT UPDATE/.test(allText);
  check('Live delivery slide still works', deliverySlideFound, deliverySlideFound ? '' : '(no live shipments for CUST-0001 right now)');
  const noUnsplash = !/images\.unsplash\.com/.test(allText);
  check('No hardcoded/demo ad images', noUnsplash);

  // ── Order History: real item names on ORD-0002 ───────────────────────────
  await page.evaluate(() => { window.location.hash = '#/orders'; });
  await page.waitForTimeout(5000);
  // Switch from Product Catalog to Order History subtab.
  const historyButton = await page.$('text=Order History');
  if (historyButton) {
    await historyButton.click();
    await page.waitForTimeout(2500);
  }
  bodyText = await page.evaluate(() => document.body.innerText);

  check('Order History shows ORD-0002', /ORD-0002/.test(bodyText));
  check('Order status = Converted', /Converted/.test(bodyText));
  check('Order total = K 21,000.00', /K 21,000\.00/.test(bodyText), bodyText.match(/K 21,000\.00/)?.[0] ?? 'not found');

  const nameChecks = [
    ['Administration Records', /Administration Records/.test(bodyText)],
    ['Record Book', /Record Book/.test(bodyText)],
    ['Student Management Journal', /Student Management Journal/.test(bodyText)],
  ];
  for (const [name, found] of nameChecks) {
    check(`Order line item shows real ERP name: ${name}`, found);
  }
  const noGenericItem = !/(^|\n)1x Item(\n|$)/.test(bodyText) && !bodyText.includes('1x Item');
  check('No generic "Item" placeholder in order history', noGenericItem);

  const lineCount = (bodyText.match(/1x /g) || []).length;
  check('Order line items have quantity 1x', lineCount >= 3, `count=${lineCount}`);

  // ── Console sanity ────────────────────────────────────────────────────────
  const fatalConsole = consoleErrors.filter((e) => !/favicon|404|401/i.test(e));
  check('No fatal console errors', fatalConsole.length === 0, fatalConsole.slice(0, 3).join(' | ').slice(0, 220));

  await browser.close();
  console.log('\n═══ SUMMARY ═══');
  const passes = results.filter((r) => r.pass).length;
  console.log(`PASS ${passes} / ${results.length}  FAIL ${failCount}`);
  results.filter((r) => !r.pass).forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
  process.exit(failCount ? 1 : 0);
}

main().catch((err) => {
  console.error('VERIFY FATAL:', err.message);
  process.exit(2);
});
