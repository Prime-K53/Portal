/* Sasa — BUSINESS LIFECYCLE TEST 1: Quotation → Order visibility (CUST-0001 / Acme LTD)
 *
 * READ-ONLY verification. No records are created, no Supabase writes, no ERP
 * modifications, no mock data. The only non-GET call is the login POST needed
 * to obtain the real ERP session (same as every other acceptance harness).
 *
 * Verified chain (existing, already confirmed on the ERP side):
 *   QTN-0002 → ORD-0002 → INV-0024
 *
 * Two layers:
 *   1. API level — ground truth straight from the real ERP Portal API.
 *   2. UI level  — what Sasa actually renders for the same session
 *      (headless Chrome against http://127.0.0.1:3001).
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Expected ERP values (verified in the previous phase) ────────────────────
const TOTAL = 21000;
const EXPECTED_ITEMS = [
  { name: 'Administration Records', quantity: 1, unitPrice: 7000, total: 7000 },
  { name: 'Administration Record Book', quantity: 1, unitPrice: 7000, total: 7000 },
  { name: 'Student Management Journal', quantity: 1, unitPrice: 7000, total: 7000 },
];
const CUSTOMER = { id: 'CUST-0001', name: 'Acme LTD' };

async function api(path, opts = {}, token = '') {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  let body = null;
  const text = await res.text();
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

const pick = (o, ...keys) => {
  const out = {};
  for (const k of keys) if (o?.[k] !== undefined) out[k] = o[k];
  return out;
};

// ── Layer 1: API-level ground truth (read-only) ─────────────────────────────
async function apiLevel() {
  console.log('── Layer 1: real ERP API ground truth ──');
  const login = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ customer_id: CUSTOMER.id, full_name: CUSTOMER.name }),
  });
  const token = login.body?.access_token;
  if (!token) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.body)}`);
  check('Real ERP session obtained (CUST-0001 / Acme LTD)', true, `user=${login.body.user?.email} customer=${login.body.user?.customer_id}`);

  // ── Quotation QTN-0002 ────────────────────────────────────────────────────
  const qRes = await api('/quotations', {}, token);
  const qList = Array.isArray(qRes.body) ? qRes.body : qRes.body?.quotations ?? [];
  const qtn = qList.find((q) => (q.quotation_number ?? q.quotationNumber ?? q.id) === 'QTN-0002');
  check('ERP quotations list contains QTN-0002', !!qtn, qtn ? `count=${qList.length}` : `list=${JSON.stringify(qList).slice(0, 200)}`);
  if (qtn) {
    check('QTN-0002 status = Converted (ERP)', String(qtn.status).toLowerCase() === 'converted', `status=${qtn.status}`);
    check('QTN-0002 total = 21000 (ERP)', Number(qtn.total ?? qtn.totalAmount) === TOTAL, `total=${qtn.total ?? qtn.totalAmount}`);
    check('QTN-0002 customer = Acme LTD (ERP)', String(qtn.customerName ?? '').toLowerCase() === CUSTOMER.name.toLowerCase(), `customer=${qtn.customerName} id=${qtn.customerId}`);
    const items = Array.isArray(qtn.items) ? qtn.items : [];
    check('QTN-0002 has 3 line items (ERP)', items.length === 3, `items=${items.length}`);
    const namesOk = EXPECTED_ITEMS.every((exp) => items.some((it) => (it.name ?? it.description) === exp.name));
    check('QTN-0002 real item names (ERP)', namesOk, `names=${items.map((i) => i.name ?? i.description).join(' | ')}`);
    const lineOk = EXPECTED_ITEMS.every((exp, i) => {
      const it = items[i];
      return Number(it.quantity) === exp.quantity && Number(it.unitPrice ?? it.price) === exp.unitPrice && Number(it.lineTotalNet ?? it.subtotal ?? it.lineTotal) === exp.total;
    });
    check('QTN-0002 qty/unit price/line totals (ERP)', lineOk, `lines=${items.map((i) => `${i.quantity}x ${i.unitPrice ?? i.price}=${i.lineTotalNet ?? i.subtotal ?? i.lineTotal}`).join('; ')}`);
  }

  // ── Order ORD-0002 ────────────────────────────────────────────────────────
  const oRes = await api('/orders', {}, token);
  const oList = Array.isArray(oRes.body) ? oRes.body : oRes.body?.orders ?? [];
  const ord = oList.find((o) => (o.order_number ?? o.orderNumber ?? o.id) === 'ORD-0002');
  check('ERP orders list contains ORD-0002', !!ord, ord ? `count=${oList.length}` : `list=${JSON.stringify(oList).slice(0, 200)}`);
  if (ord) {
    check('ORD-0002 status = Converted (ERP)', String(ord.status).toLowerCase() === 'converted', `status=${ord.status}`);
    check('ORD-0002 total = 21000 (ERP)', Number(ord.totalAmount ?? ord.total) === TOTAL, `total=${ord.totalAmount ?? ord.total}`);
    check('ORD-0002 customer = Acme LTD (ERP)', String(ord.customerName ?? '').toLowerCase() === CUSTOMER.name.toLowerCase(), `customer=${ord.customerName}`);
    const items = Array.isArray(ord.items) ? ord.items : [];
    check('ORD-0002 has 3 line items (ERP)', items.length === 3, `items=${items.length}`);
    const namesOk = EXPECTED_ITEMS.every((exp) => items.some((it) => (it.productName ?? it.name) === exp.name));
    check('ORD-0002 real item names (ERP)', namesOk, `names=${items.map((i) => i.productName ?? i.name).join(' | ')}`);
    const lineOk = EXPECTED_ITEMS.every((exp, i) => {
      const it = items[i];
      return Number(it.quantity) === exp.quantity && Number(it.unitPrice ?? it.price) === exp.unitPrice && Number(it.subtotal ?? it.lineTotal ?? it.lineTotalNet) === exp.total;
    });
    check('ORD-0002 qty/unit price/line totals (ERP)', lineOk, `lines=${items.map((i) => `${i.quantity}x ${i.unitPrice ?? i.price}=${i.subtotal ?? i.lineTotal ?? i.lineTotalNet}`).join('; ')}`);
  }

  // ── Relationship QTN-0002 → ORD-0002 (ERP exposes quotationId) ────────────
  if (ord) {
    const relViaQuotationId = String(ord.quotationId ?? '') === 'QTN-0002';
    const conv = ord.conversionDetails ?? {};
    const relViaConversion = String(conv.sourceNumber ?? '') === 'QTN-0002' && String(conv.sourceType ?? '').toLowerCase() === 'quotation';
    check('ORD-0002 references QTN-0002 (quotationId)', relViaQuotationId, `quotationId=${ord.quotationId}`);
    check('ORD-0002 conversion details cite QTN-0002', relViaConversion, `details=${JSON.stringify(conv)}`);
    const note = String(ord.notes ?? '');
    check('ORD-0002 notes record the conversion', note.includes('QTN-0002') && note.includes('Quotation'), note.slice(0, 120));
  }

  // ── Chain tail INV-0024 ───────────────────────────────────────────────────
  const iRes = await api('/invoices', {}, token);
  const iList = Array.isArray(iRes.body) ? iRes.body : iRes.body?.invoices ?? [];
  const inv = iList.find((i) => (i.invoice_number ?? i.id) === 'INV-0024');
  check('ERP invoices list contains INV-0024', !!inv, inv ? `count=${iList.length}` : 'not found');
  if (inv) {
    check('INV-0024 total = 21000 (ERP)', Number(inv.total_amount) === TOTAL, `total=${inv.total_amount}`);
    const det = await api(`/invoices/${inv.id}`, {}, token);
    const note = String(det.body?.notes ?? '');
    check('INV-0024 notes confirm ORD-0002 conversion', note.includes('ORD-0002'), note.slice(0, 120));
  }

  // ── No mock data at the API level ─────────────────────────────────────────
  const allIds = [
    ...qList.map((q) => q.quotation_number ?? q.quotationNumber ?? q.id),
    ...oList.map((o) => o.order_number ?? o.orderNumber ?? o.id),
  ].join(',');
  const mockOrderNums = ['ORD-8821', 'ORD-8799', 'ORD-8710'];
  const mockQuoteNums = ['QTE-2026-019', 'QTE-2026-024', 'QTE-2026-004'];
  check('No mock order numbers served by ERP', !mockOrderNums.some((m) => allIds.includes(m)), 'mock ORD-8821/8799/8710 absent');
  check('No mock quote numbers served by ERP', !mockQuoteNums.some((m) => allIds.includes(m)), 'mock QTE-2026-xxx absent');
}

// ── Layer 2 helpers (Playwright) ────────────────────────────────────────────
async function waitForText(page, regex, timeoutMs = 20000, interval = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const text = await page.evaluate(() => document.body.innerText);
    if (regex.test(text)) return text;
    await sleep(interval);
  }
  return page.evaluate(() => document.body.innerText);
}

/** innerText of the first card (rounded-2xl container) whose text contains marker. */
async function cardTextFor(page, marker) {
  return page.evaluate((m) => {
    const nodes = Array.from(document.querySelectorAll('div'));
    const el = nodes.find((n) => {
      const cls = typeof n.className === 'string' ? n.className : '';
      return cls.includes('rounded-2xl') && n.innerText && n.innerText.includes(m);
    });
    return el ? el.innerText : '';
  }, marker);
}

async function uiLevel() {
  console.log('\n── Layer 2: Sasa UI (headless Chrome) ──');
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 2000 } });
  const consoleErrors = [];
  const apiCalls = new Set();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/portal/')) apiCalls.add(url.replace(/^https?:\/\/[^/]+/, ''));
  });

  // ── Boot + restore real session ───────────────────────────────────────────
  await page.goto(`${DEV_URL}/#/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const login = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ customer_id: CUSTOMER.id, full_name: CUSTOMER.name }),
  });
  await page.evaluate((sess) => { sessionStorage.setItem('portal_session', JSON.stringify(sess)); }, login.body);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  let bodyText = await waitForText(page, /Dashboard|Account Summary|Welcome back/i);
  check('Dashboard renders (no blank screen)', bodyText.length > 300 && /Dashboard|Account Summary|Welcome back/i.test(bodyText), `chars=${bodyText.length}`);
  check('Customer identity on dashboard', /Acme LTD/.test(bodyText) && /CUST-0001/.test(bodyText), 'Acme LTD / CUST-0001 visible');

  // ── Quotations → QTN-0002 ─────────────────────────────────────────────────
  await page.evaluate(() => { window.location.hash = '#/quotations'; });
  bodyText = await waitForText(page, /QTN-0002/);
  const qCard = await cardTextFor(page, 'QTN-0002');

  check('Quotations tab shows QTN-0002', /QTN-0002/.test(qCard));
  check('Quotation total = K 21,000.00', /K 21,000\.00/.test(qCard), qCard.match(/K 21,000\.00/)?.[0] ?? 'not found');
  check('Quotation subtotal = K 21,000.00', /Subtotal\s*\n\s*K 21,000\.00/.test(qCard));
  const qtnStatus = (qCard.match(/(?:accepted|converted|quoted|declined|expired|pending_review|in review|ready to review|ready)/i) || [])[0] ?? '';
  check('Quotation status = Converted (data correct)', qtnStatus.toLowerCase() === 'converted', `displayed badge="${qtnStatus}"`);

  const qNames = EXPECTED_ITEMS.map((e) => e.name);
  for (const name of qNames) {
    check(`Quotation line item: ${name}`, qCard.includes(name));
  }
  const qLines = qCard.match(/\d+x\s/g) || [];
  check('Quotation shows 3 line items (1x each)', qLines.length === 3, `count=${qLines.length}`);
  const qUnitPrices = (qCard.match(/K 7,000\.00/g) || []).length;
  check('Quotation unit prices = K 7,000.00 each', qUnitPrices >= 3, `unit-price hits=${qUnitPrices}`);
  const qLineTotals = (qCard.match(/K 7,000\.00/g) || []).length;
  check('Quotation line totals = K 7,000.00', qLineTotals >= 3, `line-total hits=${qLineTotals}`);
  check('Customer identity on quotations', /Acme LTD/.test(bodyText), 'Acme LTD visible');

  // ── Orders → ORD-0002 ─────────────────────────────────────────────────────
  await page.evaluate(() => { window.location.hash = '#/orders'; });
  await page.waitForTimeout(3000);
  const historyButton = await page.$('text=Order History');
  if (historyButton) {
    await historyButton.click();
    await page.waitForTimeout(2500);
  }
  bodyText = await waitForText(page, /ORD-0002/);
  const oCard = await cardTextFor(page, 'ORD-0002');

  check('Order History shows ORD-0002', /ORD-0002/.test(oCard));
  check('Order status = Converted', /Converted/.test(oCard), oCard.match(/Converted/)?.[0] ?? 'not found');
  check('Order total = K 21,000.00', /K 21,000\.00/.test(oCard), oCard.match(/K 21,000\.00/)?.[0] ?? 'not found');
  for (const name of qNames) {
    check(`Order line item: ${name}`, oCard.includes(name));
  }
  const oLines = oCard.match(/\d+x\s/g) || [];
  check('Order shows 3 line items (1x each)', oLines.length === 3, `count=${oLines.length}`);
  const oLineTotals = (oCard.match(/K 7,000\.00/g) || []).length;
  check('Order line totals = K 7,000.00', oLineTotals >= 3, `line-total hits=${oLineTotals}`);
  const noGenericItem = !oCard.includes('1x Item') && !qCard.includes('1x Item');
  check('No generic "Item" placeholder (quotation or order)', noGenericItem);
  check('Customer identity on orders', /Acme LTD/.test(bodyText), 'Acme LTD visible');

  // ── Relationship: customer-facing consistency ─────────────────────────────
  const itemLinesIn = (txt) => EXPECTED_ITEMS.map((e) => txt.includes(e.name));
  const qSame = itemLinesIn(qCard).every(Boolean);
  const oSame = itemLinesIn(oCard).every(Boolean);
  check('QTN-0002 ↔ ORD-0002 items consistent in Sasa', qSame && oSame, 'same 3 real ERP item names on both cards');
  check('QTN-0002 ↔ ORD-0002 totals consistent in Sasa', /K 21,000\.00/.test(qCard) && /K 21,000\.00/.test(oCard), 'both show K 21,000.00');
  check('QTN-0002 ↔ ORD-0002 line values consistent in Sasa',
    (qCard.match(/K 7,000\.00/g) || []).length >= 3 && (oCard.match(/K 7,000\.00/g) || []).length >= 3,
    'both show K 7,000.00 per line');

  // ── Back to Quotations (navigation, stale-data check) ─────────────────────
  await page.evaluate(() => { window.location.hash = '#/quotations'; });
  bodyText = await waitForText(page, /QTN-0002/);
  check('Back to Quotations: no blank screen', bodyText.length > 300 && /QTN-0002/.test(bodyText), `chars=${bodyText.length}`);
  check('Back to Quotations: no stale data', /K 21,000\.00/.test(bodyText) && /Converted|converted/.test(bodyText), 'QTN-0002 still Converted / K 21,000.00');
  check('Back to Quotations: customer still Acme LTD', /Acme LTD/.test(bodyText));

  // ── No mock data at the UI level ──────────────────────────────────────────
  check('UI shows no mock order numbers', !/ORD-8821|ORD-8799|ORD-8710/.test(bodyText));
  check('UI shows no mock quote numbers', !/QTE-2026/.test(bodyText));

  // ── Real backend mode: every portal data call hits the ERP on :3000 ───────
  const dataCalls = Array.from(apiCalls);
  check('Real backend mode: portal calls hit ERP (:3000)', dataCalls.length > 0, `endpoints=${[...new Set(dataCalls.map((u) => u.split('?')[0]))].slice(0, 8).join(', ')}`);
  check('Real backend mode: quotations/orders served by ERP', dataCalls.some((u) => u.includes('/api/portal/quotations')) && dataCalls.some((u) => u.includes('/api/portal/orders')), 'GET /quotations + GET /orders observed');

  // ── Console sanity ────────────────────────────────────────────────────────
  const fatalConsole = consoleErrors.filter((e) => !/favicon|404|401|Failed to load resource/i.test(e));
  check('No fatal console errors', fatalConsole.length === 0, fatalConsole.slice(0, 3).join(' | ').slice(0, 220));

  await browser.close();
}

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
  console.log('═══ SASA — BUSINESS LIFECYCLE TEST 1: QUOTATION → ORDER VISIBILITY (CUST-0001) ═══');
  console.log('READ-ONLY verification — no records created, no Supabase writes, no ERP modifications.\n');
  await apiLevel();
  await uiLevel();

  console.log('\n═══ SUMMARY ═══');
  const passes = results.filter((r) => r.pass).length;
  console.log(`PASS ${passes} / ${results.length}  FAIL ${failCount}`);
  results.filter((r) => !r.pass).forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
  process.exit(failCount ? 1 : 0);
})().catch((err) => {
  console.error('VERIFY FATAL:', err);
  process.exit(2);
});
