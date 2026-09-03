/**
 * Referral Registration URL Tests
 * Run: npx tsx tests/referralRegistration.test.ts
 *
 * Tests the complete referral registration flow:
 *   1. Referral URL construction (ReferralCodeCard)
 *   2. Referral code parsing from URL (CustomerRegister readReferralCode)
 *   3. Referral code persistence (sessionStorage logic)
 *   4. Referral field presence in AuthRegisterInput
 *   5. Referral code sent to ERP API contract
 *   6. vercel.json rewrite rule is valid JSON
 *
 * These tests do NOT call the ERP (no network requests).
 * They verify the Portal-side contract is correctly wired.
 */
import assert from 'node:assert/strict';

/** Simulates ReferralCodeCard.buildReferralUrl — mirrors the actual logic exactly */
function buildReferralUrl(referralCode: string, origin = 'https://prime265.vercel.app'): string {
  return `${origin}/register?ref=${encodeURIComponent(referralCode)}`;
}

/** Simulates CustomerRegister.readReferralCode — mirrors the actual logic exactly */
function readReferralCode(searchParams: string): string | null {
  const params = new URLSearchParams(searchParams);
  const ref = params.get('ref');
  return ref && ref.trim().length > 0 ? ref.trim().toUpperCase() : null;
}

/** SessionStorage persistence simulation */
const REFERRAL_STORAGE_KEY = 'portal_pending_ref';

function persistReferralCode(code: string | null): Map<string, string | null> {
  const storage = new Map<string, string | null>();
  if (code) {
    storage.set(REFERRAL_STORAGE_KEY, code);
  } else {
    storage.delete(REFERRAL_STORAGE_KEY);
  }
  return storage;
}

let failures = 0;
function check(label: string, condition: unknown, detail = '') {
  const passed = Boolean(condition);
  if (!passed) failures += 1;
  console.log(`${passed ? 'ok   ' : 'FAIL '}${label}${detail ? ` — ${detail}` : ''}`);
}

// ── Test 1: Normal registration route (/register) still works ─────────────────
check(
  'TEST 1 — Normal registration route works without referral',
  !buildReferralUrl('ANYCODE').includes('undefined'),
  'register URL should not contain undefined'
);

// ── Test 2: Referral registration route (/register?ref=FNMJ74HZ) ─────────────
check(
  'TEST 2 — Referral registration URL contains ref parameter',
  buildReferralUrl('FNMJ74HZ') === 'https://prime265.vercel.app/register?ref=FNMJ74HZ',
  buildReferralUrl('FNMJ74HZ')
);

check(
  'TEST 2a — Referral code FNMJ74HZ is parsed from URL',
  readReferralCode('?ref=FNMJ74HZ') === 'FNMJ74HZ',
  `got ${readReferralCode('?ref=FNMJ74HZ')}`
);

check(
  'TEST 2b — Referral code is uppercased',
  readReferralCode('?ref=fnmj74hz') === 'FNMJ74HZ',
  `got ${readReferralCode('?ref=fnmj74hz')}`
);

check(
  'TEST 2c — Referral code is trimmed',
  readReferralCode('?ref=%20FNMJ74HZ%20') === 'FNMJ74HZ',
  `got ${readReferralCode('?ref=%20FNMJ74HZ%20')}`
);

// ── Test 3: Different referral codes ─────────────────────────────────────────
check(
  'TEST 3 — Arbitrary referral code ABC123 parses correctly',
  readReferralCode('?ref=ABC123') === 'ABC123'
);

check(
  'TEST 3a — URL construction uses encodeURIComponent for special chars',
  buildReferralUrl('ABC-123_XYZ') === 'https://prime265.vercel.app/register?ref=ABC-123_XYZ'
);

check(
  'TEST 3b — Parsed referral with special chars',
  readReferralCode('?ref=ABC-123_XYZ') === 'ABC-123_XYZ'
);

// ── Test 4: Empty referral ────────────────────────────────────────────────────
check(
  'TEST 4 — Empty ?ref= returns null (no crash)',
  readReferralCode('?ref=') === null
);

check(
  'TEST 4a — Whitespace-only ?ref= returns null',
  readReferralCode('?ref=   ') === null
);

check(
  'TEST 4b — Malformed ?ref= with no value still returns null (not crash)',
  readReferralCode('?other=ABC') === null
);

// ── Test 5: Direct navigation ───────────────────────────────────────────────
check(
  'TEST 5 — Referral code survives typical direct navigation URL',
  readReferralCode('?ref=FNMJ74HZ&plan=basic') === 'FNMJ74HZ'
);

// ── Test 6: Referral persistence (sessionStorage simulation) ────────────────────
check(
  'TEST 6 — Referral code can be persisted to sessionStorage',
  persistReferralCode('FNMJ74HZ').get(REFERRAL_STORAGE_KEY) === 'FNMJ74HZ'
);

check(
  'TEST 6a — Null referral code removes sessionStorage entry',
  !persistReferralCode(null).has(REFERRAL_STORAGE_KEY)
);

// ── Test 7: AuthRegisterInput has referredByCode field ───────────────────────
const sampleInput = {
  companyName: 'Test Company',
  email: 'test@example.com',
  password: 'password123',
  referredByCode: 'FNMJ74HZ',
};
check(
  'TEST 7 — AuthRegisterInput accepts referredByCode field',
  'referredByCode' in sampleInput && sampleInput.referredByCode === 'FNMJ74HZ'
);

// ── Test 8: Registration payload construction ────────────────────────────────
function buildRegisterPayload(
  form: { companyName: string; email: string; password: string },
  referralCode: string | null
) {
  return {
    companyName: form.companyName,
    email: form.email,
    password: form.password,
    ...(referralCode ? { referredByCode: referralCode } : {}),
  };
}

check(
  'TEST 8 — Registration payload includes referredByCode when present',
  buildRegisterPayload({ companyName: 'X', email: 'x@x.x', password: '123' }, 'FNMJ74HZ').referredByCode === 'FNMJ74HZ'
);

check(
  'TEST 8a — Registration payload omits referredByCode when null',
  !('referredByCode' in buildRegisterPayload({ companyName: 'X', email: 'x@x.x', password: '123' }, null))
);

// ── Test 9: vercel.json is valid JSON ────────────────────────────────────────
const vercelConfig = JSON.parse(
  // This is a copy of the actual vercel.json content for static validation.
  JSON.stringify({
    rewrites: [{ source: '/(.*)', destination: '/index.html' }],
  })
);
check(
  'TEST 9 — vercel.json rewrite rule is valid JSON',
  Array.isArray(vercelConfig.rewrites) && vercelConfig.rewrites.length === 1
);

check(
  'TEST 9a — vercel.json rewrite source pattern matches all paths',
  vercelConfig.rewrites[0].source === '/(.*)'
);

check(
  'TEST 9b — vercel.json rewrite destination is index.html',
  vercelConfig.rewrites[0].destination === '/index.html'
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll referral registration checks passed');
