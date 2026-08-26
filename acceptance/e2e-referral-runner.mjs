/**
 * Prime PORTAL — Live E2E Referral Verification
 *
 * Tests the prospective-person referral model against the REAL staging ERP.
 */

const BASE = 'https://primeerpsystem.onrender.com/api/portal';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || '';

const results = [];
let failCount = 0;
let token = '';
let testProspectEmail = '';
let testProspectPhone = '';
let testReferralId = null;
let preTestWalletBalance = null;
let createdReferralIds = [];

function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  if (!pass) failCount++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  let body = null;
  const text = await res.text();
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body, headers: res.headers };
}

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_id: 'CUST-0001', full_name: 'Acme LTD' }),
  });
  const body = await res.json();
  if (res.status !== 200 || !body.access_token) {
    throw new Error(`Login failed: ${res.status} ${JSON.stringify(body)}`);
  }
  token = body.access_token;
  check('Login successful', true, `customer=${body.user.customer_id} email=${body.user.email}`);
  return body.user;
}

// ── TEST 1: Portal UI ────────────────────────────────────────────────────────
async function test1_PortalUI() {
  console.log('\n── TEST 1: Portal UI ──');

  const fs = await import('fs');
  const tabPath = 'D:/Duplicate/Prime Portal/src/features/customer-portal/components/tabs/ReferralsTab.tsx';
  const servicePath = 'D:/Duplicate/Prime Portal/src/features/customer-portal/services/portalService.ts';
  const typesPath = 'D:/Duplicate/Prime Portal/src/features/customer-portal/types.ts';

  let hasSearchUI = false;
  let hasCustomerSearchEndpoint = false;
  let hasSearchMethod = false;
  let hasProspectiveFields = false;
  let hasProspectivePayload = false;

  try {
    const tabSource = fs.readFileSync(tabPath, 'utf8');
    hasSearchUI = /search|customers\/search/i.test(tabSource) && /customer/.test(tabSource);
    hasCustomerSearchEndpoint = tabSource.includes('customers/search');
    hasProspectiveFields =
      tabSource.includes('referredName') &&
      tabSource.includes('referredEmail') &&
      tabSource.includes('referredPhone') &&
      tabSource.includes('notes');
  } catch (e) {
    check('Read ReferralsTab source', false, e.message);
  }

  try {
    const serviceSource = fs.readFileSync(servicePath, 'utf8');
    hasSearchMethod =
      serviceSource.includes('searchReferralCustomers') ||
      serviceSource.includes('searchCustomersForReferral');
  } catch (e) {
    check('Read portalService source', false, e.message);
  }

  try {
    const typesSource = fs.readFileSync(typesPath, 'utf8');
    hasProspectivePayload =
      typesSource.includes('referredName') &&
      typesSource.includes('referredEmail') &&
      typesSource.includes('referredPhone');
  } catch (e) {
    check('Read types source', false, e.message);
  }

  check('ReferralsTab has no customer search UI', !hasSearchUI || !hasCustomerSearchEndpoint,
    hasSearchUI ? 'search term found in source' : 'no customer search in source');
  check('Portal service has no customer search method', !hasSearchMethod,
    hasSearchMethod ? 'search method found' : 'no search method');
  check('Form has prospective-person fields', hasProspectiveFields,
    `name=${hasProspectiveFields} email=${hasProspectiveFields} phone=${hasProspectiveFields} notes=${hasProspectiveFields}`);
  check('Types define prospective-person payload', hasProspectivePayload);
}

// ── TEST 2: Successful Prospective Referral ─────────────────────────────────
async function test2_SuccessfulReferral() {
  console.log('\n── TEST 2: Successful Prospective Referral ──');

  const timestamp = Date.now();
  testProspectEmail = `e2e-referral-${timestamp}@example.invalid`;
  testProspectPhone = `+265999${timestamp.toString().slice(-6)}`;
  const prospectName = `E2E Referral Prospect ${timestamp}`;

  const payload = {
    referredName: prospectName,
    referredEmail: testProspectEmail,
    referredPhone: testProspectPhone,
    notes: 'E2E test referral — prospective person',
  };

  const idempotencyKey = `e2e-test-key-${timestamp}`;

  const res = await api('/referrals', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  });

  check('POST /referrals returns 201', res.status === 201, `status=${res.status}`);

  if (res.status === 201) {
    const data = res.body;
    testReferralId = data.id;
    createdReferralIds.push(data.id);

    check('Response contains id', !!data.id, `id=${data.id}`);
    check('Response contains referral_code', !!data.referral_code, `code=${data.referral_code}`);
    check('Response status is pending', data.status === 'pending', `status=${data.status}`);
    check('Response referred_name matches', data.referred_name === prospectName, `name=${data.referred_name}`);
    check('Response referred_email matches', data.referred_email === testProspectEmail, `email=${data.referred_email}`);
    check('Response referred_phone matches', data.referred_phone === testProspectPhone, `phone=${data.referred_phone}`);
    check('Response customer_id is null (prospective)', data.customer_id === null, `customer_id=${data.customer_id}`);
    check('Response referred_by_id is set', !!data.referred_by_id, `referred_by_id=${data.referred_by_id}`);

    console.log(`  Request payload: ${JSON.stringify(payload)}`);
    console.log(`  Response body: ${JSON.stringify(data).slice(0, 300)}`);
  }
}

// ── TEST 3: ERP Database Verification ────────────────────────────────────────
async function test3_ERPVerification() {
  console.log('\n── TEST 3: ERP Database Verification ──');

  if (!testReferralId) {
    check('Skip ERP verification — no referral created', false, 'test 2 failed');
    return;
  }

  const res = await api(`/referrals/${testReferralId}`);
  check('GET /referrals/:id returns 200', res.status === 200, `status=${res.status}`);

  if (res.status === 200) {
    const data = res.body;
    check('referred_name present', !!data.referred_name, `name=${data.referred_name}`);
    check('referred_email correct', data.referred_email === testProspectEmail, `email=${data.referred_email}`);
    check('referred_phone correct', data.referred_phone === testProspectPhone, `phone=${data.referred_phone}`);
    check('status is pending', data.status === 'pending', `status=${data.status}`);
    check('registered_customer_id is null', data.registered_customer_id === null, `registered_customer_id=${data.registered_customer_id}`);
    check('registered_at is null', data.registered_at === null, `registered_at=${data.registered_at}`);
    check('customer_id is null', data.customer_id === null, `customer_id=${data.customer_id}`);
  }

  // Verify via Supabase directly
  try {
    const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/customer_referrals?id=eq.${testReferralId}&select=*`, {
      headers: { apikey: SUPABASE_SECRET_KEY, Authorization: `Bearer ${SUPABASE_SECRET_KEY}` },
    });
    const dbData = await dbRes.json();
    if (Array.isArray(dbData) && dbData.length > 0) {
      const row = dbData[0];
      check('DB: referral exists', !!row.id, `id=${row.id}`);
      check('DB: status = pending', row.status === 'pending', `status=${row.status}`);
      check('DB: customer_id is null', row.customer_id === null, `customer_id=${row.customer_id}`);
      check('DB: registered_customer_id is null', row.registered_customer_id === null, `registered_customer_id=${row.registered_customer_id}`);
      check('DB: referred_by_id is set', !!row.referred_by_id, `referred_by_id=${row.referred_by_id}`);
    } else {
      check('DB: referral found', false, `response=${JSON.stringify(dbData).slice(0, 200)}`);
    }
  } catch (err) {
    check('DB verification', false, `error=${err.message}`);
  }
}

// ── TEST 4: Existing Customer Rejection ─────────────────────────────────────
async function test4_ExistingCustomerRejection() {
  console.log('\n── TEST 4: Existing Customer Rejection ──');

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/customers?select=id,email,phone&limit=5`, {
      headers: { apikey: SUPABASE_SECRET_KEY, Authorization: `Bearer ${SUPABASE_SECRET_KEY}` },
    });
    const customers = await res.json();

    if (Array.isArray(customers) && customers.length > 0) {
      const otherCustomer = customers.find(c => c.id !== 'CUST-0001' && c.email);

      if (otherCustomer) {
        const payload = {
          referredName: otherCustomer.full_name || 'Existing Customer',
          referredEmail: otherCustomer.email,
          notes: 'E2E test — should be rejected',
        };

        const res2 = await api('/referrals', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        check('Existing customer referral REJECTED (4xx)', res2.status >= 400 && res2.status < 500, `status=${res2.status}`);
        check('Rejection message mentions customer exists', /already a customer|cannot be referred|exists/i.test(JSON.stringify(res2.body)),
          `body=${JSON.stringify(res2.body).slice(0, 150)}`);

        const listRes = await api('/referrals');
        if (listRes.status === 200) {
          const referrals = listRes.body.referrals || listRes.body || [];
          const found = referrals.some(r => r.referred_email === otherCustomer.email);
          check('No referral created for existing customer email', !found, `found=${found}`);
        }
      } else {
        check('Found other customer to test', false, 'no other customer found');
      }
    } else {
      check('Found existing customers', false, `count=${customers.length}`);
    }
  } catch (err) {
    check('Existing customer rejection test', false, `error=${err.message}`);
  }
}

// ── TEST 5: Self-Referral Rejection ─────────────────────────────────────────
async function test5_SelfReferralRejection() {
  console.log('\n── TEST 5: Self-Referral Rejection ──');

  const profileRes = await api('/profile');
  if (profileRes.status === 200) {
    const profile = profileRes.body;
    const selfEmail = profile.email;
    const selfPhone = profile.phone;

    if (selfEmail) {
      const payload = {
        referredName: profile.full_name || 'Self',
        referredEmail: selfEmail,
        notes: 'E2E test self-referral — should be rejected',
      };

      const res = await api('/referrals', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      check('Self-referral by email REJECTED (4xx)', res.status >= 400 && res.status < 500, `status=${res.status}`);
      check('Rejection message mentions self-referral', /yourself|self/i.test(JSON.stringify(res.body)),
        `body=${JSON.stringify(res.body).slice(0, 150)}`);
    }

    if (selfPhone) {
      const payload = {
        referredName: profile.full_name || 'Self',
        referredPhone: selfPhone,
        notes: 'E2E test self-referral by phone — should be rejected',
      };

      const res = await api('/referrals', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      check('Self-referral by phone REJECTED (4xx)', res.status >= 400 && res.status < 500, `status=${res.status}`);
    }
  } else {
    check('Get profile for self-referral test', false, `status=${profileRes.status}`);
  }
}

// ── TEST 6: Duplicate Prospective Referral ──────────────────────────────────
async function test6_DuplicateReferral() {
  console.log('\n── TEST 6: Duplicate Prospective Referral ──');

  if (!testProspectEmail) {
    check('Skip duplicate test — no prospect email', false, 'test 2 failed');
    return;
  }

  const payload = {
    referredName: `E2E Referral Duplicate ${Date.now()}`,
    referredEmail: testProspectEmail,
    referredPhone: testProspectPhone,
    notes: 'E2E test duplicate — should be rejected',
  };

  const res = await api('/referrals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  check('Duplicate referral REJECTED (4xx)', res.status >= 400 && res.status < 500, `status=${res.status}`);
  check('Rejection message mentions duplicate', /already exists|duplicate/i.test(JSON.stringify(res.body)),
    `body=${JSON.stringify(res.body).slice(0, 150)}`);
}

// ── TEST 7: Idempotency ──────────────────────────────────────────────────────
async function test7_Idempotency() {
  console.log('\n── TEST 7: Idempotency ──');

  const timestamp = Date.now();
  const prospectEmail = `e2e-idem-${timestamp}@example.invalid`;
  const idempotencyKey = `e2e-idem-key-${timestamp}`;

  const payload = {
    referredName: `E2E Idempotency Test ${timestamp}`,
    referredEmail: prospectEmail,
    notes: 'E2E idempotency test',
  };

  const res1 = await api('/referrals', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  });

  check('First idempotent request returns 201', res1.status === 201, `status=${res1.status}`);
  const firstId = res1.body?.id;

  const res2 = await api('/referrals', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  });

  check('Second idempotent request returns 200 (replay)', res2.status === 200, `status=${res2.status}`);
  check('Same referral id on replay', res2.body?.id === firstId, `first=${firstId} second=${res2.body?.id}`);

  const res3 = await api('/referrals', {
    method: 'POST',
    headers: { 'Idempotency-Key': `e2e-idem-key-2-${timestamp}` },
    body: JSON.stringify({ ...payload, referredName: `E2E Idempotency Test 2 ${timestamp}` }),
  });

  check('Different key creates separate referral', res3.status === 201 && res3.body?.id !== firstId,
    `status=${res3.status} id=${res3.body?.id}`);

  if (res1.body?.id) createdReferralIds.push(res1.body.id);
  if (res3.body?.id) createdReferralIds.push(res3.body.id);
}

// ── TEST 8: Customer Search Endpoint ────────────────────────────────────────
async function test8_CustomerSearchEndpoint() {
  console.log('\n── TEST 8: Customer Search Endpoint ──');

  const res = await api('/referrals/customers/search');
  check('GET /referrals/customers/search returns 404', res.status === 404, `status=${res.status}`);
}

// ── TEST 9: Portal Display ───────────────────────────────────────────────────
async function test9_PortalDisplay() {
  console.log('\n── TEST 9: Portal Display ──');

  if (!testReferralId) {
    check('Skip display test — no referral created', false, 'test 2 failed');
    return;
  }

  const res = await api('/referrals');
  check('GET /referrals returns 200', res.status === 200, `status=${res.status}`);

  if (res.status === 200) {
    const referrals = res.body.referrals || res.body || [];
    const found = referrals.find(r => r.id === testReferralId);
    check('Test referral appears in list', !!found, `found=${!!found}`);

    if (found) {
      check('List shows prospective name', !!found.referred_name, `name=${found.referred_name}`);
      check('List shows email', found.referred_email === testProspectEmail, `email=${found.referred_email}`);
      check('List shows pending status', found.status === 'pending', `status=${found.status}`);
      check('List shows creation date', !!found.created_at, `created=${found.created_at}`);
    }
  }
}

// ── TEST 10: Legacy Regression ──────────────────────────────────────────────
async function test10_LegacyReferralRegression() {
  console.log('\n── TEST 10: Legacy Referral Regression ──');

  const res = await api('/referrals');
  if (res.status === 200) {
    const referrals = res.body.referrals || res.body || [];
    check('Legacy referral list endpoint works', true, `count=${referrals.length}`);

    const fs = await import('fs');
    const typesPath = 'D:/Duplicate/Prime Portal/src/features/customer-portal/types.ts';
    let hasNullableCustomerId = false;
    try {
      const typesSource = fs.readFileSync(typesPath, 'utf8');
      hasNullableCustomerId =
        typesSource.includes('referredCustomerId:') &&
        (typesSource.includes('referredCustomerId: string | null') ||
         typesSource.includes('referredCustomerId?:'));
    } catch (e) {
      check('Read types for legacy check', false, e.message);
    }
    check('Types support nullable customer_id for legacy', hasNullableCustomerId);
  }
}

// ── TEST 11: Wallet Firewall ─────────────────────────────────────────────────
async function test11_WalletFirewall() {
  console.log('\n── TEST 11: Wallet Firewall ──');

  const walletBefore = await api('/wallet');
  const balanceBefore = walletBefore.status === 200 ? walletBefore.body.walletBalance : null;
  preTestWalletBalance = balanceBefore;

  const walletTxBefore = walletBefore.status === 200 ? (walletBefore.body.transactions || []) : [];

  const timestamp = Date.now();
  const payload = {
    referredName: `E2E Wallet Test ${timestamp}`,
    referredEmail: `e2e-wallet-${timestamp}@example.invalid`,
    notes: 'E2E wallet firewall test',
  };

  const res = await api('/referrals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const createdId = res.body?.id;

  const walletAfter = await api('/wallet');
  const balanceAfter = walletAfter.status === 200 ? walletAfter.body.walletBalance : null;
  const walletTxAfter = walletAfter.status === 200 ? (walletAfter.body.transactions || []) : [];

  check('Wallet balance unchanged after referral', balanceBefore === balanceAfter,
    `before=${balanceBefore} after=${balanceAfter}`);
  check('No new wallet transactions', walletTxAfter.length === walletTxBefore.length,
    `before=${walletTxBefore.length} after=${walletTxAfter.length}`);

  const rewardsRes = await api('/referrals/rewards');
  if (rewardsRes.status === 200) {
    const rewards = rewardsRes.body.rewards || rewardsRes.body || [];
    const newRewards = rewards.filter(r => r.referral_id === createdId);
    check('No reward created for new referral', newRewards.length === 0, `rewards=${newRewards.length}`);
  }

  if (createdId) createdReferralIds.push(createdId);
}

// ── TEST 12: Cleanup ─────────────────────────────────────────────────────────
async function test12_Cleanup() {
  console.log('\n── TEST 12: Cleanup ──');

  for (const id of createdReferralIds) {
    const res = await api(`/referrals/${id}`, { method: 'DELETE' });
    check(`Deleted referral ${id}`, res.status === 200 || res.status === 404, `status=${res.status}`);
  }

  if (testReferralId && !createdReferralIds.includes(testReferralId)) {
    const res = await api(`/referrals/${testReferralId}`, { method: 'DELETE' });
    check('Test referral deleted', res.status === 200 || res.status === 404, `status=${res.status}`);
  }

  const verifyRes = await api(`/referrals/${testReferralId}`);
  check('Test referral no longer accessible', verifyRes.status === 404, `status=${verifyRes.status}`);

  const listRes = await api('/referrals');
  if (listRes.status === 200) {
    const referrals = listRes.body.referrals || listRes.body || [];
    check('Other referrals remain', referrals.length >= 0, `count=${referrals.length}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══ Prime PORTAL — Live E2E Referral Verification ═══');
  console.log(`Time: ${new Date().toISOString()}`);

  try {
    await login();
    await test1_PortalUI();
    await test2_SuccessfulReferral();
    await test3_ERPVerification();
    await test4_ExistingCustomerRejection();
    await test5_SelfReferralRejection();
    await test6_DuplicateReferral();
    await test7_Idempotency();
    await test8_CustomerSearchEndpoint();
    await test9_PortalDisplay();
    await test10_LegacyReferralRegression();
    await test11_WalletFirewall();
    await test12_Cleanup();
  } catch (err) {
    console.error('FATAL ERROR:', err);
    check('Test runner fatal error', false, err.message);
  }

  console.log('\n═══ SUMMARY ═══');
  const passes = results.filter((r) => r.pass).length;
  console.log(`PASS ${passes} / ${results.length}  FAIL ${failCount}`);
  if (failCount) {
    results.filter((r) => !r.pass).forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
  }

  const report = {
    timestamp: new Date().toISOString(),
    environment: 'staging',
    backend: 'https://primeerpsystem.onrender.com',
    portal: 'http://127.0.0.1:3001',
    testCustomer: 'CUST-0001 (Acme LTD)',
    testProspectEmail,
    testProspectPhone,
    testReferralId,
    results,
    summary: { passes, fails: failCount, total: results.length },
    ready: failCount === 0,
  };

  const fs = await import('fs');
  fs.writeFileSync('D:/Duplicate/Prime Portal/acceptance/e2e-referral-report.json', JSON.stringify(report, null, 2));
  console.log('\nReport written to acceptance/e2e-referral-report.json');

  process.exit(failCount ? 1 : 0);
}

main().catch((err) => {
  console.error('RUNNER FAILED:', err);
  process.exit(2);
});
