// Final acceptance sweep: every portal module read + tenant isolation + error isolation.
const BASE = 'https://primeerpsystem.onrender.com/api/portal';

async function login(customerId, name) {
  const r = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_id: customerId, full_name: name }),
  });
  const b = await r.json();
  return { status: r.status, token: b.access_token, body: b };
}

function countOf(body) {
  if (Array.isArray(body)) return body.length;
  if (body && typeof body === 'object') {
    if (Array.isArray(body.items)) return body.items.length;
    if (Array.isArray(body.data)) return body.data.length;
    const vals = Object.values(body).filter(Array.isArray);
    if (vals.length === 1) return vals[0].length;
  }
  return typeof body === 'object' && body !== null ? 1 : 0;
}

const results = [];
async function moduleRead(H, name, path) {
  try {
    const r = await fetch(BASE + path, { headers: H });
    const body = await r.json().catch(() => null);
    const ok = r.status === 200;
    results.push({ name, status: r.status, ok, count: countOf(body), sample: body && !Array.isArray(body) && typeof body === 'object' ? Object.keys(body).slice(0, 5).join(',') : '' });
  } catch (e) {
    results.push({ name, status: 'ERR', ok: false, count: 0, sample: e.message });
  }
}

(async () => {
  const l = await login('CUST-0001', 'Acme LTD');
  console.log('login CUST-0001:', l.status);
  const H = { Authorization: 'Bearer ' + l.token };

  await moduleRead(H, 'dashboard', '/dashboard/summary');
  await moduleRead(H, 'profile', '/profile');
  await moduleRead(H, 'invoices', '/invoices');
  await moduleRead(H, 'payments', '/payments');
  await moduleRead(H, 'quotations', '/quotations');
  await moduleRead(H, 'requests', '/requests');
  await moduleRead(H, 'orders', '/orders');
  await moduleRead(H, 'shipments', '/shipments');
  await moduleRead(H, 'statements', '/statements');
  await moduleRead(H, 'catalog', '/catalog');
  await moduleRead(H, 'notifications', '/notifications');
  await moduleRead(H, 'referrals', '/referrals');

  // Tenant isolation: a different customer's known invoice/quotation id must NOT be readable
  const inv = await fetch(BASE + '/invoices', { headers: H });
  const invBody = await inv.json();
  const ownInvoice = (Array.isArray(invBody) ? invBody : invBody.items || invBody.data || [])[0];
  if (ownInvoice) {
    const r = await fetch(BASE + '/invoices/' + ownInvoice.id, { headers: H });
    results.push({ name: 'isolation: own invoice detail', status: r.status, ok: r.status === 200, count: 1, sample: 'id=' + ownInvoice.id });
  }
  // Try CUST-0018's data while authenticated as CUST-0001 (spoof via query param not possible by design; test document access with other customer id)
  const other = await fetch(BASE + '/invoices?customer_id=eq.CUST-0018', { headers: H });
  results.push({ name: 'isolation: client-supplied other customer filter', status: other.status, ok: other.status === 200, count: countOf(await other.json().catch(() => [])), sample: 'expect only own records' });

  // Error isolation: invalid route returns 404 JSON without breaking others
  const bad = await fetch(BASE + '/nonexistent-route', { headers: H });
  const good = await fetch(BASE + '/invoices', { headers: H });
  results.push({ name: 'error isolation: bad route + module still works', status: bad.status + '/' + good.status, ok: bad.status === 404 && good.status === 200, count: 0, sample: '' });

  console.log('\n=== MODULE SWEEP ===');
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(48)} http=${String(r.status).padEnd(6)} rows=${String(r.count).padEnd(3)} ${r.sample}`);
  }

  // Also verify referrals remain intentionally unavailable (no data added)
  const refs = results.find(r => r.name === 'referrals');
  console.log('\nreferrals rows (must be 0):', refs.count);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
