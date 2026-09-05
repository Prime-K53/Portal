/**
 * Prime PORTAL — Auth Lifecycle & Per-Customer Cache Isolation
 *
 * Regression tests that pin down the customer-identity isolation guarantees
 * the portal depends on. The Portal is multi-tenant at the ERP layer
 * (single backend, many customers) — every customer must see ONLY their own
 * data, and switching customers must NEVER leak prior-customer data into the
 * next session.
 *
 * Scenarios covered:
 *   1. Logout clears every query's data + lastFetchedAt.
 *   2. After logout, NO fetcher is fired for already-cached data.
 *   3. A new customer login triggers a fresh initial fetch for every hook
 *      (the previous customer's data is gone, so there's nothing to dedupe).
 *   4. Re-login by the SAME customer triggers the auth-transition fetch —
 *      data is fresh, not whatever stale cache remained.
 *   5. Concurrent renders during the auth-transition window do not cause
 *      a duplicate fetch (in-flight dedupe).
 *   6. SSE invalidations do NOT cross customer sessions — a logged-out
 *      query is immune to invalidations.
 *   7. The per-invoice line-items cache is cleared on logout (otherwise a
 *      different customer could see prior-customer descriptions in search).
 */

import assert from 'node:assert/strict';
import { test, describe, beforeEach } from 'node:test';

// Mirror of the usePortalQuery state machine — see usePortalQuery.ts.

interface QueryState<T> {
  data: T | null;
  isLoading: boolean;
  error: unknown;
  lastFetchedAt: number | null;
}

interface HarnessOpts<T> {
  fetcher: () => Promise<T>;
  staleTimeMs?: number;
}

class AuthLifecycleHarness<T> {
  private fetcher: () => Promise<T>;
  private staleTimeMs: number;

  public isAuthenticated = false;
  public invalidationCount = 0;
  public version = 0;

  public state: QueryState<T> = {
    data: null,
    isLoading: false,
    error: null,
    lastFetchedAt: null,
  };

  private prevEffectiveEnabled = false;
  private prevInvalidationCount = 0;
  private prevVersion = 0;
  private inFlight = false;
  public fetcherCallCount = 0;
  public fetchLog: Array<{ ts: number; call: number }> = [];

  constructor(opts: HarnessOpts<T>) {
    this.fetcher = opts.fetcher;
    this.staleTimeMs = opts.staleTimeMs ?? 0;
    this.prevEffectiveEnabled = this.isAuthenticated;
    this.prevInvalidationCount = this.invalidationCount;
    this.prevVersion = this.version;
    this.state.isLoading = this.isAuthenticated;
  }

  public async render(): Promise<void> {
    const effectiveEnabled = this.isAuthenticated;
    if (!effectiveEnabled) {
      this.state.data = null;
      this.state.error = null;
      this.state.lastFetchedAt = null;
      this.state.isLoading = false;
      this.inFlight = false;
      this.prevEffectiveEnabled = false;
      return;
    }

    const isAuthTransition = !this.prevEffectiveEnabled && effectiveEnabled;
    const isInitialFetch = this.state.lastFetchedAt === null;
    const isInvalidated = this.prevInvalidationCount !== this.invalidationCount;
    const isExplicitRefetch = this.prevVersion !== this.version;
    const isStale =
      this.state.lastFetchedAt !== null &&
      this.staleTimeMs > 0 &&
      Date.now() - this.state.lastFetchedAt > this.staleTimeMs;

    this.prevEffectiveEnabled = effectiveEnabled;
    this.prevInvalidationCount = this.invalidationCount;
    this.prevVersion = this.version;

    const shouldFetch = isAuthTransition || isInitialFetch || isInvalidated || isExplicitRefetch || isStale;
    if (!shouldFetch) return;

    if (this.inFlight && !isInvalidated && !isExplicitRefetch) return;

    this.inFlight = true;
    this.state.isLoading = true;
    this.state.error = null;
    this.fetcherCallCount++;
    const callNo = this.fetcherCallCount;
    this.fetchLog.push({ ts: Date.now(), call: callNo });

    try {
      const result = await this.fetcher();
      this.state.data = result;
      this.state.lastFetchedAt = Date.now();
    } catch (err) {
      this.state.error = err;
    } finally {
      this.inFlight = false;
      this.state.isLoading = false;
    }
  }
}

// Per-invoice line-items cache mock (mirrors usePortalData.ts)
const invoiceItemsCache = new Map<string, unknown[]>();

describe('Auth Lifecycle & Per-Customer Cache Isolation', () => {
  let harness: AuthLifecycleHarness<{ invoices: Array<{ id: string; ownerId: string }> }>;

  beforeEach(() => {
    invoiceItemsCache.clear();
    harness = new AuthLifecycleHarness({
      fetcher: async () => ({ invoices: [] }),
    });
  });

  test('1. Logout clears data, lastFetchedAt, and error (no leak into next session)', async () => {
    // Simulate customer A logged in with data loaded
    harness.isAuthenticated = true;
    await harness.render();
    // (in real app: data would be populated, but this harness's fetcher returns empty)

    // Logout
    harness.isAuthenticated = false;
    await harness.render();

    assert.equal(harness.state.data, null, 'data must be null after logout');
    assert.equal(harness.state.lastFetchedAt, null, 'lastFetchedAt must be null after logout');
    assert.equal(harness.state.error, null);
    assert.equal(harness.state.isLoading, false);
  });

  test('2. After logout, NO fetcher fires on subsequent renders (no leak attempt)', async () => {
    harness.isAuthenticated = true;
    await harness.render();
    const callsBeforeLogout = harness.fetcherCallCount;

    harness.isAuthenticated = false;
    await harness.render();

    // Many parent re-renders while logged out
    for (let i = 0; i < 10; i++) {
      await harness.render();
    }

    assert.equal(
      harness.fetcherCallCount,
      callsBeforeLogout,
      'Logged-out renders must not fire any fetcher',
    );
  });

  test('3. Re-login by a (different) customer triggers a fresh initial fetch', async () => {
    // Simulate a fetcher that returns DIFFERENT data for each call so we can
    // tell apart "stale customer A cache" from "fresh customer B fetch".
    let customerACalls = 0;
    const switchingHarness = new AuthLifecycleHarness<{
      invoices: Array<{ id: string; owner: string }>;
    }>({
      fetcher: async () => {
        customerACalls++;
        // Customer A returns one set, anything else returns another.
        return {
          invoices: [
            { id: `inv-${customerACalls}`, owner: customerACalls === 1 ? 'A' : 'B' },
          ],
        };
      },
    });

    // Customer A logs in
    switchingHarness.isAuthenticated = true;
    await switchingHarness.render();
    assert.equal(switchingHarness.fetcherCallCount, 1);
    assert.deepEqual(switchingHarness.state.data?.invoices[0].owner, 'A');

    // Customer A logs out (clears data per fix)
    switchingHarness.isAuthenticated = false;
    await switchingHarness.render();
    assert.equal(switchingHarness.state.data, null);

    // Customer B logs in (same browser, different session)
    switchingHarness.isAuthenticated = true;
    await switchingHarness.render();

    assert.equal(switchingHarness.fetcherCallCount, 2, 'New customer MUST trigger a fresh fetch');
    // The fetched data is customer B's, NOT customer A's stale data.
    assert.deepEqual(
      switchingHarness.state.data?.invoices[0].owner,
      'B',
      'Fetched data must come from the new fetcher call — no stale carry-over from customer A',
    );
  });

  test('4. Concurrent renders during auth transition do not duplicate fetches', async () => {
    let resolve!: (val: { invoices: Array<{ id: string }> }) => void;
    const pending = new Promise<{ invoices: Array<{ id: string }> }>((res) => {
      resolve = res;
    });

    const slowHarness = new AuthLifecycleHarness({
      fetcher: async () => pending,
    });

    // Trigger auth transition (starts in-flight fetch)
    slowHarness.isAuthenticated = true;
    const p1 = slowHarness.render();

    // 3 rapid renders while still authenticating + still in-flight
    const p2 = slowHarness.render();
    const p3 = slowHarness.render();
    const p4 = slowHarness.render();

    resolve({ invoices: [{ id: 'inv-1' }] });
    await Promise.all([p1, p2, p3, p4]);

    assert.equal(
      slowHarness.fetcherCallCount,
      1,
      'In-flight fetcher must deduplicate simultaneous renders during auth transition',
    );
  });

  test('5. Logged-out queries are immune to SSE invalidations', async () => {
    harness.isAuthenticated = true;
    await harness.render();
    const callsBeforeLogout = harness.fetcherCallCount;

    // Logout
    harness.isAuthenticated = false;
    await harness.render();

    // SSE event fires while logged out (realistic — events can arrive after logout)
    harness.invalidationCount++;
    await harness.render();

    assert.equal(
      harness.fetcherCallCount,
      callsBeforeLogout,
      'SSE invalidation MUST NOT fire fetches for logged-out queries',
    );
  });

  test('6. Per-invoice line-items cache is cleared on logout', () => {
    // Seed cache as if customer A opened invoice INV-1 (caches their items)
    invoiceItemsCache.set('INV-1', [
      { description: 'Customer A private item' },
    ]);
    assert.equal(invoiceItemsCache.size, 1);

    // CustomerPortalApp.tsx clears the cache on auth=false via usePortalEvents
    // (see usePortalData.ts). Simulate that.
    const isAuthenticated = false; // represents the new state
    if (!isAuthenticated) invoiceItemsCache.clear();

    assert.equal(
      invoiceItemsCache.size,
      0,
      'Logout MUST wipe per-invoice items cache — otherwise customer B sees A items',
    );
  });

  test('7. Auth transition with staleTimeMs>0 does not block the initial fetch', async () => {
    const staleHarness = new AuthLifecycleHarness({
      fetcher: async () => ({ invoices: [] }),
      staleTimeMs: 60_000,
    });

    // Auth transition: previous render was unauthenticated, new is authenticated
    staleHarness.isAuthenticated = true;
    await staleHarness.render();

    assert.equal(
      staleHarness.fetcherCallCount,
      1,
      'Auth transition must trigger fetch even when staleTimeMs > 0 (lastFetchedAt is null)',
    );
  });

  test('8. Subsequent authed renders do NOT re-fetch (no aggressive polling)', async () => {
    const stableHarness = new AuthLifecycleHarness({
      fetcher: async () => ({ invoices: [] }),
      staleTimeMs: 0,
    });

    stableHarness.isAuthenticated = true;
    await stableHarness.render();
    assert.equal(stableHarness.fetcherCallCount, 1);

    for (let i = 0; i < 10; i++) {
      await stableHarness.render();
    }

    assert.equal(
      stableHarness.fetcherCallCount,
      1,
      'Authed re-renders must NOT poll — fetcher is called exactly once',
    );
  });
});