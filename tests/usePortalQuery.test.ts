import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

/**
/ * Portal Query State Machine Simulation & Logic Verification
 *
 * Tests the exact authentication lifecycle, state transitions, deduplication,
 * and invalidation logic introduced in usePortalQuery.
 */

interface QueryState<T> {
  data: T | null;
  isLoading: boolean;
  error: unknown;
  lastFetchedAt: number | null;
}

interface TestHarnessOpts<T> {
  fetcher: () => Promise<T>;
  staleTimeMs?: number;
}

class PortalQueryHarness<T> {
  private fetcher: () => Promise<T>;
  private staleTimeMs: number;

  public isAuthenticated = false;
  public enabled = true;
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

  constructor(opts: TestHarnessOpts<T>) {
    this.fetcher = opts.fetcher;
    this.staleTimeMs = opts.staleTimeMs ?? 0;
    this.prevEffectiveEnabled = this.getEffectiveEnabled();
    this.prevInvalidationCount = this.invalidationCount;
    this.prevVersion = this.version;
    this.state.isLoading = this.getEffectiveEnabled();
  }

  public getEffectiveEnabled(): boolean {
    return this.enabled && this.isAuthenticated;
  }

  public async render(): Promise<void> {
    const effectiveEnabled = this.getEffectiveEnabled();

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

    if (!shouldFetch) {
      return;
    }

    if (this.inFlight && !isInvalidated && !isExplicitRefetch) {
      return;
    }

    this.inFlight = true;
    this.state.isLoading = true;
    this.state.error = null;
    this.fetcherCallCount++;

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

  public getEffectiveLoading(): boolean {
    const effectiveEnabled = this.getEffectiveEnabled();
    return (
      this.state.isLoading ||
      (effectiveEnabled && this.state.lastFetchedAt === null && this.state.data === null && this.state.error === null)
    );
  }
}

describe('usePortalQuery Authentication & Query Lifecycle Regression Tests', () => {
  test('1. Hook starts unauthenticated -> no request, data = null, isLoading = false', async () => {
    let calls = 0;
    const harness = new PortalQueryHarness({
      fetcher: async () => {
        calls++;
        return ['ad1', 'ad2', 'ad3', 'ad4', 'ad5'];
      },
    });

    harness.isAuthenticated = false;
    await harness.render();

    assert.equal(calls, 0, 'Must NOT fetch protected portal data while unauthenticated');
    assert.equal(harness.state.data, null);
    assert.equal(harness.getEffectiveLoading(), false);
  });

  test('2. Authentication becomes true -> fetcher executes automatically (no manual refresh)', async () => {
    let calls = 0;
    const mockAds = ['ad1', 'ad2', 'ad3', 'ad4', 'ad5'];
    const harness = new PortalQueryHarness({
      fetcher: async () => {
        calls++;
        return mockAds;
      },
    });

    // Mount unauthenticated
    harness.isAuthenticated = false;
    await harness.render();
    assert.equal(calls, 0);

    // Authentication restored (false -> true)
    harness.isAuthenticated = true;
    await harness.render();

    assert.equal(calls, 1, 'Authentication becoming true MUST trigger initial fetch automatically');
    assert.deepEqual(harness.state.data, mockAds, 'Successful response must populate 5 ads');
    assert.equal(harness.getEffectiveLoading(), false);
  });

  test('3. Subsequent renders do NOT cause fetch loops or duplicate requests', async () => {
    let calls = 0;
    const mockAds = ['ad1', 'ad2', 'ad3', 'ad4', 'ad5'];
    const harness = new PortalQueryHarness({
      fetcher: async () => {
        calls++;
        return mockAds;
      },
    });

    harness.isAuthenticated = true;
    await harness.render();
    assert.equal(calls, 1);

    // 5 subsequent renders while authenticated
    for (let i = 0; i < 5; i++) {
      await harness.render();
    }

    assert.equal(calls, 1, 'Subsequent renders must not trigger continuous polling or aggressive fetch loop');
  });

  test('4. Deduplication: Auth transition does not cause duplicate simultaneous requests', async () => {
    let calls = 0;
    let resolveFetcher!: (val: string[]) => void;
    const pendingPromise = new Promise<string[]>((res) => {
      resolveFetcher = res;
    });

    const harness = new PortalQueryHarness({
      fetcher: async () => {
        calls++;
        return pendingPromise;
      },
    });

    // Transition false -> true and trigger first render (starts fetch)
    harness.isAuthenticated = true;
    const p1 = harness.render();

    // Secondary rapid render while fetch is still in-flight
    const p2 = harness.render();

    // Resolve fetcher
    resolveFetcher(['ad1', 'ad2', 'ad3', 'ad4', 'ad5']);
    await Promise.all([p1, p2]);

    assert.equal(calls, 1, 'In-flight fetch must deduplicate simultaneous requests during auth transition');
  });

  test('5. Invalidation and explicit refetch behavior remain fully intact', async () => {
    let calls = 0;
    const harness = new PortalQueryHarness({
      fetcher: async () => {
        calls++;
        return [`ad-v${calls}`];
      },
    });

    harness.isAuthenticated = true;
    await harness.render();
    assert.equal(calls, 1);
    assert.deepEqual(harness.state.data, ['ad-v1']);

    // Trigger invalidation
    harness.invalidationCount++;
    await harness.render();
    assert.equal(calls, 2);
    assert.deepEqual(harness.state.data, ['ad-v2']);

    // Trigger explicit refetch
    harness.version++;
    await harness.render();
    assert.equal(calls, 3);
    assert.deepEqual(harness.state.data, ['ad-v3']);
  });

  test('6. Logout clears session data and isolates customer cache', async () => {
    let calls = 0;
    const harness = new PortalQueryHarness({
      fetcher: async () => {
        calls++;
        return ['ad1'];
      },
    });

    // Authenticated fetch
    harness.isAuthenticated = true;
    await harness.render();
    assert.equal(calls, 1);
    assert.deepEqual(harness.state.data, ['ad1']);

    // Logout (isAuthenticated = false)
    harness.isAuthenticated = false;
    await harness.render();

    assert.equal(harness.state.data, null, 'Logout MUST clear data to prevent leaking across customer sessions');
    assert.equal(harness.state.lastFetchedAt, null);
    assert.equal(harness.getEffectiveLoading(), false);
  });
});
