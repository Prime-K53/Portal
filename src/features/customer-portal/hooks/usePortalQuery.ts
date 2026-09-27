/**
 * Prime PORTAL — usePortalQuery
 *
 * Generic data-fetching hook used by feature hooks. Always yields the four
 * production states: loading, data, error and a refetch trigger.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useCustomerAuth } from '../components/auth/CustomerAuthContext';

export interface PortalQueryResult<T> {
  data: T | null;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

/**
 * Scoped invalidation tags. A query subscribes to the scopes it reads; an
 * event invalidates only matching scopes so one ERP `entity_changed` ping
 * no longer refetches every mounted query (the old refetch-everything
 * behavior caused the ERP 429 storms). `undefined` scope = global, matches all.
 */
export type PortalQueryScope =
  | 'customer'
  | 'invoices'
  | 'orders'
  | 'order-requests'
  | 'quotations'
  | 'quote-requests'
  | 'deliveries'
  | 'statements'
  | 'payments'
  | 'payment-requests'
  | 'referrals'
  | 'wallet'
  | 'catalog'
  | 'notifications'
  | 'support'
  | 'articles'
  | 'ads'
  | 'company-contact'
  | 'loyalty';

/**
 * Global invalidation bus. Real-time events (ERP SSE §10) and cross-feature
 * mutations call invalidatePortalQueries() so matching feature hooks refetch
 * from the ERP. Invalidations are coalesced within a short window so an SSE
 * burst does not trigger a refetch storm (and 429s).
 */
interface InvalidationListener {
  scopes: ReadonlySet<PortalQueryScope> | null;
  notify: () => void;
}

const invalidateListeners = new Set<InvalidationListener>();
let lastInvalidateAt = 0;
let pendingInvalidateTimer: ReturnType<typeof setTimeout> | null = null;
function fireInvalidations(scopes?: readonly PortalQueryScope[]): void {
  invalidateListeners.forEach((listener) => {
    try {
      if (!scopes || listener.scopes === null || scopes.some((s) => listener.scopes?.has(s))) {
        listener.notify();
      }
    } catch {
      // One bad listener must not break the bus.
    }
  });
}
export function invalidatePortalQueries(scopes?: PortalQueryScope | readonly PortalQueryScope[]): void {
  const normalized = scopes === undefined ? undefined : Array.isArray(scopes) ? scopes : [scopes];
  const now = Date.now();
  // Coalesce bursts: if called again within 250ms, debounce to one trigger.
  if (now - lastInvalidateAt < 250) {
    if (pendingInvalidateTimer) return;
    pendingInvalidateTimer = setTimeout(() => {
      pendingInvalidateTimer = null;
      lastInvalidateAt = Date.now();
      fireInvalidations(normalized);
    }, 250);
    try {
      (pendingInvalidateTimer as unknown as { unref?: () => void }).unref?.();
    } catch {
      // ignore
    }
    return;
  }
  lastInvalidateAt = now;
  fireInvalidations(normalized);
}

function usePortalInvalidations(scopes: readonly PortalQueryScope[]): number {
  const [count, force] = useReducer((x: number) => x + 1, 0);
  // Subscribe once per scope-set identity — callers pass module-level arrays.
  const scopesKey = scopes.join('|');
  useEffect(() => {
    const listener: InvalidationListener = {
      scopes: scopes.length === 0 ? null : new Set(scopes),
      notify: force,
    };
    invalidateListeners.add(listener);
    return () => {
      invalidateListeners.delete(listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopesKey]);
  return count;
}

export function usePortalQuery<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
  enabled = true,
  staleTimeMs = 0,
  scopes: readonly PortalQueryScope[] = []
): PortalQueryResult<T> {
  const { isAuthenticated } = useCustomerAuth();
  const effectiveEnabled = enabled && isAuthenticated;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(effectiveEnabled);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const invalidationCount = usePortalInvalidations(scopes);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  const prevInvalidationCountRef = useRef(invalidationCount);
  const prevEffectiveEnabledRef = useRef(effectiveEnabled);
  const prevVersionRef = useRef(version);
  const inFlightRef = useRef(false);
  // An invalidation/explicit refetch that arrives mid-flight must not be
  // dropped: the in-flight response predates it, so one follow-up fetch runs
  // when the flight lands.
  const needsRefetchRef = useRef(false);
  // Always call the latest fetcher — avoids stale closures without forcing
  // callers to memoize (the old eslint-disable hid this bug).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!effectiveEnabled) {
      // Keep cached data when a tab is merely disabled (tab switch) so the UI
      // doesn't flicker + refetch. Only wipe on full logout.
      setIsLoading(false);
      inFlightRef.current = false;
      if (!isAuthenticated) {
        setData(null);
        setError(null);
        setLastFetchedAt(null);
      }
      prevEffectiveEnabledRef.current = false;
      return;
    }

    const isAuthTransition = !prevEffectiveEnabledRef.current && effectiveEnabled;
    const isInitialFetch = lastFetchedAt === null;
    const isInvalidated = prevInvalidationCountRef.current !== invalidationCount;
    const isExplicitRefetch = prevVersionRef.current !== version;
    const isStale = lastFetchedAt !== null && staleTimeMs > 0 && Date.now() - lastFetchedAt > staleTimeMs;

    prevEffectiveEnabledRef.current = effectiveEnabled;
    prevInvalidationCountRef.current = invalidationCount;
    prevVersionRef.current = version;

    const shouldFetch = isAuthTransition || isInitialFetch || isInvalidated || isExplicitRefetch || isStale;

    // Never fire a duplicate while one is in flight — even on invalidation.
    // The in-flight response already reflects near-current ERP state; a second
    // concurrent fetch only risks 429s. But the trigger is recorded so the
    // follow-up runs when the flight lands instead of being silently lost.
    if (inFlightRef.current) {
      if (isInvalidated || isExplicitRefetch) needsRefetchRef.current = true;
      return;
    }

    if (!shouldFetch) {
      return;
    }

    let active = true;
    inFlightRef.current = true;
    setIsLoading(true);
    setError(null);

    Promise.resolve()
      .then(() => fetcherRef.current())
      .then((result) => {
        if (active) {
          setData(result);
          setLastFetchedAt(Date.now());
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err);
      })
      .finally(() => {
        inFlightRef.current = false;
        if (active) setIsLoading(false);
        // A trigger that arrived mid-flight earns exactly one follow-up fetch.
        if (needsRefetchRef.current) {
          needsRefetchRef.current = false;
          setVersion((v) => v + 1);
        }
      });

    return () => {
      active = false;
    };
  }, [version, invalidationCount, effectiveEnabled, staleTimeMs, isAuthenticated, ...deps]);

  const effectiveLoading = isLoading || (effectiveEnabled && lastFetchedAt === null && data === null && error === null);

  return { data, isLoading: effectiveLoading, error, refetch };
}