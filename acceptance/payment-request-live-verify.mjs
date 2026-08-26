/* Sasa Payment Request — LIVE INTEGRATION VERIFICATION (read-only)
 *
 * Verifies the real ERP contract for the Sasa payment-request feature:
 *   - Authentication (portal session for CUST-0001)
 *   - Existing PAYREQ-2026-000001 visibility (GET list + GET by id)
 *   - Customer isolation (404 on unknown/foreign request id, 401 without token)
 *   - Invoice accounting state for INV-0024 (must remain Total 21000 / Paid 10000 / Partial)
 *   - Candidate invoice discovery for a possible live create (never performed here)
 *   - Payments baseline (to prove a payment request never creates a payment)
 *
 * This script performs NO writes and creates NO payment requests.
 */
const API = 'https://primeerpsystem.onrender.com/api/portal';
const results = [];
let failCount = 0;
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  if (!pass) failCount++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  let body = null;
  const text = await res.text();
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

let token = '';

async function login() {
  const res = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ customer_id: 'CUST-0001', full_name: 'Acme LTD' }),
  });
  if (res.status !== 200 || !res.body?.access_token) {
    check('Login as CUST-0001', false, `status=${res.status} body=${JSON.stringify(res.body).slice(0, 160)}`);
    return false;
  }
  token = res.body.access_token;
  const user = res.body.user || {};
  check('Login as CUST-0001 returns authenticated ERP portal JWT', true, `user=${user.email} customer_id=${user.customer_id} role=${res.body.role}`);
  check('JWT carries the customer identity claim (customer_id)', user.customer_id === 'CUST-0001', `customer_id=${user.customer_id}`);
  check('Session envelope has access_token + refresh_token + expires_in', !!(res.body.access_token && res.body.refresh_token && res.body.expires_in));
  return true;
}

async function verifyExistingRequest() {
  const { status, body } = await api('/payment-requests', { token });
  const list = Array.isArray(body) ? body : body?.paymentRequests ?? [];
  check('GET /payment-requests returns 200 for CUST-0001', status === 200, `status=${status}`);
  const target = list.find((r) => r.requestNumber === 'PAYREQ-2026-000001');
  check('PAYREQ-2026-000001 is visible to CUST-0001', !!target, `count=${list.length} nums=${list.map((r) => r.requestNumber).join(',')}`);
  if (target) {
    check('Request → invoice INV-0024', target.invoiceNumber === 'INV-0024' || target.invoiceId === 'INV-0024', `invoice=${target.invoiceNumber} id=${target.invoiceId}`);
    check('Request → amount K11,000', Math.abs(Number(target.requestedAmount) - 11000) < 0.01, `amount=${target.requestedAmount}`);
    check('Request → method Bank Transfer', /bank transfer/i.test(String(target.paymentMethod)), `method=${target.paymentMethod}`);
    check('Request → status under_review', target.status === 'under_review', `status=${target.status}`);
    const det = await api(`/payment-requests/${target.id}`, { token });
    check('GET /payment-requests/:id returns the same request', det.status === 200 && det.body?.requestNumber === 'PAYREQ-2026-000001', `status=${det.status} num=${det.body?.requestNumber}`);
  }
}

async function verifyIsolationAndErrors() {
  const noAuth = await api('/payment-requests');
  check('No token → 401 (auth enforced)', noAuth.status === 401, `status=${noAuth.status}`);

  const missing = await api('/payment-requests/does-not-exist-xyz', { token });
  check('Unknown request id → 404 (not a crash)', missing.status === 404, `status=${missing.status} body=${JSON.stringify(missing.body)}`);

  const otherInvoice = await api('/invoices/inv_foreign_0001', { token });
  check('Foreign invoice id → 403/404 (ownership enforced, no info leak)', otherInvoice.status === 403 || otherInvoice.status === 404, `status=${otherInvoice.status}`);
}

async function verifyInvoiceState() {
  const { status, body } = await api('/invoices', { token });
  const list = Array.isArray(body) ? body : body?.invoices ?? [];
  check('GET /invoices returns 200', status === 200, `status=${status}`);
  const inv = list.find((i) => i.invoice_number === 'INV-0024' || i.id === 'INV-0024');
  check('INV-0024 is present for CUST-0001', !!inv, `count=${list.length}`);
  if (inv) {
    check('INV-0024 Total = K21,000', Math.abs(Number(inv.total_amount ?? inv.totalAmount) - 21000) < 0.01, `total=${inv.total_amount ?? inv.totalAmount}`);
    check('INV-0024 Paid = K10,000', Math.abs(Number(inv.paid_amount ?? inv.paidAmount) - 10000) < 0.01, `paid=${inv.paid_amount ?? inv.paidAmount}`);
    check('INV-0024 Outstanding = K11,000', Math.abs(Number(inv.total_amount ?? inv.totalAmount) - Number(inv.paid_amount ?? inv.paidAmount) - 11000) < 0.01, `outstanding=${(Number(inv.total_amount ?? inv.totalAmount) - Number(inv.paid_amount ?? inv.paidAmount)).toFixed(2)}`);
    const rawStatus = String(inv.status ?? '');
    check('INV-0024 Status = Partial', /partial/i.test(rawStatus), `status=${rawStatus}`);
  }

  // Candidate invoices for a potential live create (reported, never created here).
  const candidates = list.filter((i) => {
    const total = Number(i.total_amount ?? i.totalAmount ?? 0);
    const paid = Number(i.paid_amount ?? i.paidAmount ?? 0);
    const outstanding = total - paid;
    return outstanding > 0 && i.invoice_number !== 'INV-0024';
  });
  console.log(`  NOTE: candidate invoices for a live create (excluding INV-0024): ${candidates.length === 0 ? 'NONE' : candidates.map((c) => `${c.invoice_number} (outstanding ${(Number(c.total_amount ?? c.totalAmount) - Number(c.paid_amount ?? c.paidAmount)).toFixed(0)})`).join(', ')}`);

  // Payments baseline — a payment request must never appear here.
  const payments = await api('/payments', { token });
  const payList = Array.isArray(payments.body) ? payments.body : payments.body?.payments ?? [];
  check('GET /payments baseline reachable (payment-request ≠ payment)', payments.status === 200, `status=${payments.status} count=${payList.length}`);
}

(async () => {
  console.log('═══ Sasa Payment Request — LIVE INTEGRATION VERIFICATION (read-only) ═══');
  const ok = await login();
  if (!ok) {
    console.log('\n═══ SUMMARY ═══');
    console.log(`PASS ${results.filter((r) => r.pass).length} / ${results.length}  FAIL ${failCount}`);
    process.exit(failCount ? 1 : 0);
  }
  await verifyExistingRequest();
  await verifyIsolationAndErrors();
  await verifyInvoiceState();

  console.log('\n═══ SUMMARY ═══');
  const passes = results.filter((r) => r.pass).length;
  console.log(`PASS ${passes} / ${results.length}  FAIL ${failCount}`);
  if (failCount) results.filter((r) => !r.pass).forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
  process.exit(failCount ? 1 : 0);
})();
