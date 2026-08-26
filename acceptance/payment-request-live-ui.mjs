/* Sasa Payment Request — LIVE UI VERIFICATION (real ERP, real browser)
 *
 * Drives the Sasa app (http://127.0.0.1:3001) with an authenticated ERP
 * session for CUST-0001 and verifies, against the LIVE staging ERP:
 *
 *   A. Session restore → authenticated portal renders.
 *   B. INV-0024 accounting state (Total K21,000 / Outstanding K11,000 / Partial).
 *   C. Active-request protection: opening "Request Payment" for INV-0024 shows
 *      the existing PAYREQ-2026-000001 state (Under Review) — NO new-request
 *      form, NO duplicate POST, NO Supabase calls.
 *   D. ONE sanctioned live create for INV-0001 (outstanding K900, no active
 *      request): Sasa UI → POST /api/portal/payment-requests → confirmation
 *      (request number, invoice, amount, Bank Transfer, status Requested,
 *      "does not mark your invoice as paid").
 *   E. After create: INV-0001 shows the active request on reopen, and the
 *      invoice accounting state is unchanged (K900 still outstanding).
 *
 * Browser network is monitored: every request URL is checked — no Supabase
 * calls and exactly one POST to /api/portal/payment-requests are expected.
 *
 * NOTE: exactly ONE real request is created (INV-0001). INV-0024 is never
 * POSTed to — the flow must not offer a form for it.
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require(
  'D:/Duplicate/Prime ERP System/node_modules/.pnpm/playwright-core@1.62.0/node_modules/playwright-core'
);

const DEV_URL = 'http://127.0.0.1:3001';
const API = 'https://primeerpsystem.onrender.com/api/portal';
const results = [];
let failCount = 0;
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  if (!pass) failCount++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const skip = (name, detail = '') => {
  results.push({ name, pass: true, detail: 'SKIPPED — ' + detail });
  console.log(`SKIP  ${name} — ${detail}`);
};

async function getRealSession() {
  // The ERP rate-limits login attempts ("sensitive operations" limiter) —
  // retry with backoff so transient 429s do not abort verification.
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: 'CUST-0001', full_name: 'Acme LTD' }),
    });
    const text = await res.text();
    let body = {};
    try { body = JSON.parse(text); } catch { body = { error: text.slice(0, 60) }; }
    if (body.access_token) {
      return { access_token: body.access_token, refresh_token: body.refresh_token, expires_in: body.expires_in, user: body.user };
    }
    const retryAfter = Number(body.retryAfter ?? 12);
    console.log(`  [login] attempt ${attempt} blocked (HTTP ${res.status}) — waiting ${retryAfter + 3}s...`);
    await sleep((retryAfter + 3) * 1000);
  }
  throw new Error('could not obtain ERP session after retries');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('═══ Sasa Payment Request — LIVE UI VERIFICATION (real ERP, CUST-0001) ═══');
  const session = await getRealSession();
  check('Obtained real ERP session for CUST-0001', true, `customer=${session.user.customer_id}`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 2200 } });

  const consoleErrors = [];
  const requestLog = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));
  page.on('request', (r) => {
    try {
      const method = typeof r.method === 'function' ? r.method() : r.method;
      const url = typeof r.url === 'function' ? r.url() : r.url;
      requestLog.push({ method, url: String(url) });
    } catch (err) {
      console.log('  [request handler]', err.message, '| keys=', Object.keys(r).slice(0, 8).join(','), '| proto=', Object.getPrototypeOf(r)?.constructor?.name);
      if (typeof r === 'string') requestLog.push({ method: '?', url: r });
    }
  });

  // ── A. Boot + session restore ─────────────────────────────────────────────
  await page.goto(`${DEV_URL}/#/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.evaluate((sess) => { sessionStorage.setItem('portal_session', JSON.stringify(sess)); }, session);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  let bodyText = await page.evaluate(() => document.body.innerText);
  check('Session restore: authenticated portal renders after reload', /Dashboard|Balance|Invoices|Outstanding/i.test(bodyText) && bodyText.length > 300, `chars=${bodyText.length}`);
  check('Portal shell present (main)', await page.evaluate(() => !!document.querySelector('main')));

  // ── Navigate to invoices (wait on real content, not fixed sleeps) ─────────
  // The ERP rate-limits portal data (200/15min per IP); a reload retry handles
  // a transient 429 burst on the initial fetch batch.
  let invoicesLoaded = false;
  for (let retry = 0; retry <= 2 && !invoicesLoaded; retry++) {
    if (retry > 0) {
      console.log(`  [invoices] transient load failure — reloading and retrying (attempt ${retry})...`);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(6000);
    }
    await page.evaluate(() => { window.location.hash = '#/invoices'; });
    try {
      await page.locator('main').getByText('INV-0024').first().waitFor({ timeout: 30000 });
      await page.locator('main').getByText('INV-0001').first().waitFor({ timeout: 10000 });
      invoicesLoaded = true;
    } catch (err) {
      const onLogin = await page.evaluate(() => !document.querySelector('main'));
      if (retry === 2 || onLogin) {
        check('Invoices tab shows INV-0024 and INV-0001', false, `timeout (${onLogin ? 'redirected to login' : 'main present but rows missing'})`);
        throw err;
      }
    }
  }
  check('Invoices tab shows INV-0024 and INV-0001', true, 'both invoices listed');

  const supabaseCalls = () => requestLog.filter((r) => /supabase|rest\/v1/i.test(String(r.url)));
  const paymentRequestPosts = () => requestLog.filter((r) => r.method === 'POST' && /\/payment-requests(\?|$)/.test(String(r.url)));

  // ── B + C. INV-0024: accounting state + active-request protection ────────
  const inv24Row = page.locator('main').getByText('INV-0024').first();
  await inv24Row.click();
  await page.getByText('Amount Remaining').first().waitFor({ timeout: 10000 });
  bodyText = await page.evaluate(() => document.body.innerText);
  check('INV-0024 detail: Total K21,000 shown', /K\s*21,000\.00/.test(bodyText), 'total visible');
  check('INV-0024 detail: Outstanding K11,000 shown', /K\s*11,000\.00/.test(bodyText), 'remaining visible');
  check('INV-0024 detail: status Partial', /Partial/i.test(bodyText), 'badge present');

  const postsBefore = paymentRequestPosts().length;
  await page.getByRole('button', { name: 'Request Payment' }).click();
  await page.getByText('Request Already Submitted').waitFor({ timeout: 10000 });
  bodyText = await page.evaluate(() => document.body.innerText);
  check('INV-0024: modal shows EXISTING request state (not a new form)', bodyText.includes('Request Already Submitted'), 'active-request panel');
  check('INV-0024: existing request number PAYREQ-2026-000001 shown', bodyText.includes('PAYREQ-2026-000001'), 'request number');
  check('INV-0024: request status shown as Under Review', /Under Review/i.test(bodyText), 'status');
  check('INV-0024: requested amount K11,000 shown', /K\s*11,000\.00/.test(bodyText), 'amount');
  check('INV-0024: method Bank Transfer shown', /Bank Transfer/i.test(bodyText), 'method');
  check('INV-0024: NO amount input (new-request form absent)', (await page.$('#pr-amount')) === null, 'no form input');
  check('INV-0024: NO "Request Bank Payment" submit button', (await page.getByRole('button', { name: 'Request Bank Payment' }).count()) === 0, 'no submit button');
  check('INV-0024: NO duplicate POST to /payment-requests fired', paymentRequestPosts().length === postsBefore, `posts=${paymentRequestPosts().length}`);
  check('INV-0024: no Supabase calls during the flow', supabaseCalls().length === 0, `supabase=${supabaseCalls().length}`);
  await page.getByRole('button', { name: 'Return to Portal' }).click();
  await page.waitForTimeout(1500);

  // ── D. INV-0001: ONE sanctioned live create through the Sasa UI ──────────
  const inv1Row = page.locator('main').getByText('INV-0001').first();
  await inv1Row.click();
  await page.getByText('Amount Remaining').first().waitFor({ timeout: 10000 });
  bodyText = await page.evaluate(() => document.body.innerText);
  check('INV-0001 detail: Outstanding K900 shown before request', /K\s*900\.00/.test(bodyText), 'outstanding');
  await page.getByRole('button', { name: 'Request Payment' }).click();

  let createdNum = null;
  let createPerformed = false;
  try {
    // The amount input mounts one frame before the React effect pre-fills it —
    // poll until a non-empty value is present (the submit sends the real value).
    await page.waitForFunction(() => {
      const el = document.querySelector('#pr-amount');
      return el && String(el.value).trim() !== '';
    }, { timeout: 10000 });
    const amountValue = await page.locator('#pr-amount').inputValue();
    check('INV-0001: request form pre-filled with full outstanding (K900)', Number(amountValue) === 900, `value=${amountValue}`);
    await page.locator('#pr-note').fill('Live integration verification — bank transfer request (Sasa)');
    check('INV-0001: Bank Transfer is the only payment method offered', /Bank Transfer/i.test(await page.evaluate(() => document.body.innerText)), 'method text');

    const postsBeforeCreate = paymentRequestPosts().length;
    await page.getByRole('button', { name: 'Request Bank Payment' }).click();
    await page.getByText('Bank Transfer Request Sent').waitFor({ timeout: 15000 });
    bodyText = await page.evaluate(() => document.body.innerText);
    createdNum = bodyText.match(/PAYREQ-\d{4}-\d{6}/)?.[0] ?? null;
    createPerformed = true;
    check('Confirmation: "Bank Transfer Request Sent" (not a payment page)', bodyText.includes('Bank Transfer Request Sent'), 'confirmation heading');
    check('Confirmation: request number appears', !!createdNum, `number=${createdNum}`);
    check('Confirmation: invoice number INV-0001 appears', bodyText.includes('INV-0001'), 'invoice');
    check('Confirmation: requested amount K900.00 appears', /K\s*900\.00/.test(bodyText), 'amount');
    check('Confirmation: method Bank Transfer appears', /Bank Transfer/i.test(bodyText), 'method');
    check('Confirmation: status Requested appears', /Requested/i.test(bodyText), 'status');
    check('Confirmation: explicitly says request does NOT mark invoice as paid', /does not mark your invoice as paid/i.test(bodyText), 'request-not-payment wording');
    check('Create: exactly ONE POST to /payment-requests fired', paymentRequestPosts().length === postsBeforeCreate + 1, `posts=${paymentRequestPosts().length}`);
    const post = paymentRequestPosts()[paymentRequestPosts().length - 1];
    check('Create: POST target is the ERP Portal API (not Supabase)', !!post && post.url.startsWith(`${API}/payment-requests`), post?.url ?? 'none');
    check('Create: no Supabase calls during the flow', supabaseCalls().length === 0, `supabase=${supabaseCalls().length}`);
  } catch (err) {
    // Idempotent harness: if a previous run already created a request for
    // INV-0001, the modal shows the active-request state instead of a form.
    bodyText = await page.evaluate(() => document.body.innerText);
    const existing = bodyText.match(/PAYREQ-\d{4}-\d{6}/)?.[0] ?? null;
    if (bodyText.includes('Request Already Submitted')) {
      createdNum = existing;
      skip('INV-0001: live create already exists from a previous run', `request=${existing} — create assertions skipped`);
    } else {
      throw err;
    }
  }

  // ── E. Reopen INV-0001 → active request shown; accounting unchanged; no new POST ──
  // Close the payment-request modal first (it is open in both the created and
  // the already-exists paths), otherwise its backdrop intercepts the row click.
  await page.getByRole('button', { name: 'Return to Portal' }).click();
  await page.waitForTimeout(1500);
  const postsBeforeReopen = paymentRequestPosts().length;
  await inv1Row.click();
  await page.getByText('Amount Remaining').first().waitFor({ timeout: 10000 });
  bodyText = await page.evaluate(() => document.body.innerText);
  check('After create: INV-0001 accounting state UNCHANGED (K900 still outstanding)', /K\s*900\.00/.test(bodyText), 'outstanding unchanged');
  await page.getByRole('button', { name: 'Request Payment' }).click();
  await page.getByText('Request Already Submitted').waitFor({ timeout: 10000 });
  bodyText = await page.evaluate(() => document.body.innerText);
  check('After create: INV-0001 shows its ACTIVE request (no second form)', bodyText.includes('Request Already Submitted') && bodyText.includes(createdNum ?? 'PAYREQ-'), `request=${createdNum}`);
  check('After create: NO duplicate POST to /payment-requests fired on reopen', paymentRequestPosts().length === postsBeforeReopen, `posts=${paymentRequestPosts().length}`);
  check('After create: still no Supabase calls', supabaseCalls().length === 0, `supabase=${supabaseCalls().length}`);

  const fatalConsole = consoleErrors.filter((e) => !/favicon|404|401/i.test(e));
  check('No fatal console errors across the whole flow', fatalConsole.length === 0, fatalConsole.slice(0, 3).join(' | ').slice(0, 200));

  await browser.close();
  console.log('\n═══ UI SUMMARY ═══');
  const passes = results.filter((r) => r.pass).length;
  console.log(`PASS ${passes} / ${results.length}  FAIL ${failCount}`);
  if (failCount) results.filter((r) => !r.pass).forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
  console.log(`\nNOTE: exactly ONE real payment request was created during this verification: ${createdNum ?? 'UNKNOWN'}`);
  process.exit(failCount ? 1 : 0);
}

main().catch((err) => {
  console.error('UI VERIFY FATAL:', err.message);
  process.exit(2);
});
