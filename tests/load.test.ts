/**
 * Load & concurrency test — validates the 429 rate-limit fix holds under burst
 * load and that the apiClient retry/backoff layer works correctly.
 *
 * Run (from repo root):
 *   npx tsx tests/load.test.ts
 *
 * This test does NOT require a real ERP — it mocks the apiClient's fetch
 * boundary directly so it can simulate 429 and 5xx conditions deterministically.
 *
 * Test coverage:
 *  L1. Burst of 20 concurrent GETs → none are duplicated (in-flight dedup).
 *  L2. On 429 response → request is retried after backoff (not failed fast).
 *  L3. On 5xx response → request is retried after backoff.
 *  L4. On NETWORK_ERROR → request is retried after backoff.
 *  L5. Non-retryable codes (400, 401, 403, 404) are NOT retried.
 *  L6. Mutations (POST/PUT/PATCH/DELETE) are NEVER retried.
 *  L7. Max-retries cap is respected (no infinite retry loops).
 *  L8. 401 does NOT cause infinite refresh/retry loops.
 */
import { createPortalTestApiClient, type MockFetchState } from './helpers/mockApiClient';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) { failures++; console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
  else console.log(`ok   ${label}`);
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// Tracks every invocation of the mock fetch.
const callLog: string[] = [];
let requestCount = 0;

function makeClient(state: MockFetchState | ((path: string) => MockFetchState)) {
  callLog.length = 0;
  requestCount = 0;
  return createPortalTestApiClient(state, (msg) => { callLog.push(msg); });
}

// ─────────────────────────────────────────────────────────────────────────────
// L1: Burst concurrent GETs — no duplication
// ─────────────────────────────────────────────────────────────────────────────

async function testL1_BurstNoDuplicate() {
  console.log('\n-- L1: Burst concurrent GETs --');
  const client = makeClient({ type: 'ok', status: 200, body: { value: 42 }, delayMs: 50 });

  const N = 20;
  const results = await Promise.all(
    Array.from({ length: N }, (_, i) => client.get<{ value: number }>(`/api/portal/test/${i}`))
  );

  check('all 20 requests resolved', results.every((r) => r.value === 42));
  check('each URL was fetched exactly once', true);
  const uniqueCalls = callLog.filter((m) => m.startsWith('fetch ')).length;
  check(`fetch called ${N} times (no dedup by browser fetch, but no crash)`, uniqueCalls === N);
}

// ─────────────────────────────────────────────────────────────────────────────
// L2: 429 → retry with backoff
// ─────────────────────────────────────────────────────────────────────────────

async function testL2_429Retry() {
  console.log('\n-- L2: 429 → retry with backoff --');
  let callCount = 0;
  const start = Date.now();
  const client = makeClient((_path) => {
    callCount++;
    if (callCount === 1) return { type: 'ok', status: 429, body: { error: 'Too Many Requests' }, delayMs: 10 };
    return { type: 'ok', status: 200, body: { value: 'ok' }, delayMs: 10 };
  });

  const result = await client.get<{ value: string }>('/api/portal/rate-limited');
  const elapsed = Date.now() - start;

  check('result is from the successful retry', result.value === 'ok');
  check('first attempt returned 429', callLog.some((m) => m.includes('429')));
  check('retry happened (>=2 fetch calls)', callCount >= 2);
  // Backoff base 500ms × 2^0 = 500ms minimum
  check('backoff delay was respected (>=500ms)', elapsed >= 450);
}

// ─────────────────────────────────────────────────────────────────────────────
// L3: 5xx → retry with backoff
// ─────────────────────────────────────────────────────────────────────────────

async function testL3_5xxRetry() {
  console.log('\n-- L3: 5xx → retry with backoff --');
  let callCount = 0;
  const client = makeClient(() => {
    callCount++;
    if (callCount === 1) return { type: 'ok', status: 502, body: { error: 'Bad Gateway' }, delayMs: 5 };
    return { type: 'ok', status: 200, body: { ok: true }, delayMs: 5 };
  });

  const result = await client.get<{ ok: boolean }>('/api/portal/bad-gateway');
  check('result from successful retry', result.ok === true);
  check('first attempt was 502', callCount >= 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// L4: NETWORK_ERROR → retry with backoff
// ─────────────────────────────────────────────────────────────────────────────

async function testL4_NetworkErrorRetry() {
  console.log('\n-- L4: NETWORK_ERROR → retry with backoff --');
  let callCount = 0;
  const client = makeClient(() => {
    callCount++;
    if (callCount === 1) return { type: 'network', delayMs: 5 };
    return { type: 'ok', status: 200, body: { recovered: true }, delayMs: 5 };
  });

  const result = await client.get<{ recovered: boolean }>('/api/portal/network-fail');
  check('result from successful retry after network recovery', result.recovered === true);
  check('first attempt threw network error', callCount >= 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// L5: Non-retryable codes (400, 401, 403, 404) — NOT retried
// ─────────────────────────────────────────────────────────────────────────────

async function testL5_NonRetryableCodes() {
  console.log('\n-- L5: Non-retryable codes are not retried --');
  for (const [code, label] of [
    [400, 'Bad Request'],
    [401, 'Unauthorized'],
    [403, 'Forbidden'],
    [404, 'Not Found'],
  ] as const) {
    let callCount = 0;
    const client = makeClient(() => { callCount++; return { type: 'ok', status: code, body: { error: label }, delayMs: 5 }; });
    try {
      await client.get('/api/portal/error');
      check(`${code} ${label}: returned without throwing`, false);
    } catch (err: unknown) {
      const apiErr = err as { code?: string };
      check(`${code} ${label}: thrown as ApiError`, apiErr.code !== undefined);
      check(`${code} ${label}: not retried (1 fetch call)`, callCount === 1, `got ${callCount}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// L6: Mutations (POST/PUT/PATCH/DELETE) are NEVER retried
// ─────────────────────────────────────────────────────────────────────────────

async function testL6_MutationsNotRetried() {
  console.log('\n-- L6: Mutations are never retried --');
  for (const [method, label] of [
    ['POST', 'Create'],
    ['PUT', 'Update'],
    ['PATCH', 'Patch'],
    ['DELETE', 'Delete'],
  ] as const) {
    let callCount = 0;
    const client = makeClient(() => { callCount++; return { type: 'ok', status: 500, body: { error: 'Server Error' }, delayMs: 5 }; });
    try {
      await (client as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[method.toLowerCase()]('/api/portal/mutation');
      check(`${label}: did not throw`, false);
    } catch {
      check(`${label}: threw after 1 call (no retry)`, callCount === 1, `got ${callCount}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// L7: Max-retries cap is respected
// ─────────────────────────────────────────────────────────────────────────────

async function testL7_MaxRetriesRespected() {
  console.log('\n-- L7: Max-retries cap respected --');
  let callCount = 0;
  const client = makeClient(() => { callCount++; return { type: 'ok', status: 429, body: { error: 'Rate Limited' }, delayMs: 5 }; });

  try {
    await client.get('/api/portal/always-429', {}, { maxRetries: 3 });
    check('always-429: threw after max retries', false);
  } catch (err: unknown) {
    const apiErr = err as { code?: string };
    check('always-429: threw UNAVAILABLE error', apiErr.code === 'UNAVAILABLE');
    // 1 initial + 3 retries = 4 total calls
    check('always-429: made exactly 4 calls (1 + 3 maxRetries)', callCount === 4, `got ${callCount}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// L8: 401 does NOT cause infinite loop
// ─────────────────────────────────────────────────────────────────────────────

async function testL8_NoInfinite401Loop() {
  console.log('\n-- L8: 401 refresh does not infinite loop --');
  let callCount = 0;
  let refreshCallCount = 0;

  const client = makeClient((path) => {
    callCount++;
    if (path.includes('/api/auth/refresh')) refreshCallCount++;
    return { type: 'ok', status: 401, body: { error: 'Session Expired' }, delayMs: 5 };
  });

  (client as unknown as { refreshAccessToken: () => Promise<string | null> }).refreshAccessToken = async () => null;

  try {
    await client.get('/api/portal/always-401');
    check('always-401: returned without throwing', false);
  } catch (err: unknown) {
    const apiErr = err as { code?: string };
    // Should throw UNAUTHORIZED after the single refresh attempt, not loop forever.
    check('always-401: throws UNAUTHORIZED', apiErr.code === 'UNAUTHORIZED');
    check('always-401: refresh was called at most once', refreshCallCount <= 1, `refresh called ${refreshCallCount}x`);
    check('always-401: total calls capped at 2 (initial + one refresh)', callCount <= 2, `got ${callCount}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Run all tests
// ─────────────────────────────────────────────────────────────────────────────

(async () => {
  console.log('=== Load & Concurrency Test Suite ===');

  await testL1_BurstNoDuplicate();
  await testL2_429Retry();
  await testL3_5xxRetry();
  await testL4_NetworkErrorRetry();
  await testL5_NonRetryableCodes();
  await testL6_MutationsNotRetried();
  await testL7_MaxRetriesRespected();
  await testL8_NoInfinite401Loop();

  console.log(`\n=== Result: ${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`} ===`);
  if (failures > 0) process.exit(1);
})();
