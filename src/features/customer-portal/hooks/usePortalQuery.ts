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
 * Global invalidation bus. Real-time events (ERP SSE §10) and cross-feature
 * mutations call invalidatePortalQueries() so every mounted feature hook
 * refetches from the ERP. Invalidations are coalesced within a short window
 * so an SSE burst does not trigger a refetch storm (and 429s).
 */
const invalidateListeners = new Set<() => void>();
let lastInvalidateAt = 0;
let pendingInvalidateTimer: ReturnType<typeof setTimeout> | null = null;
export function invalidatePortalQueries(): void {
  const now = Date.now();
  // Coalesce bursts: if called again within 250ms, debounce to one trigger.
  if (now - lastInvalidateAt < 250) {
    if (pendingInvalidateTimer) return;
    pendingInvalidateTimer = setTimeout(() => {
      pendingInvalidateTimer = null;
      lastInvalidateAt = Date.now();
      invalidateListeners.forEach((listener) => {
        try {
          listener();
        } catch {
          // One bad listener must not break the bus.
        }
      });
    }, 250);
    try {
      (pendingInvalidateTimer as unknown as { unref?: () => void }).unref?.();
    } catch {
      // ignore
    }
    return;
  }
  lastInvalidateAt = now;
  invalidateListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore
    }
  });
}

function usePortalInvalidations(): number {
  const [count, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    invalidateListeners.add(force);
    return () => {
      invalidateListeners.delete(force);
    };
  }, []);
  return count;
}

export function usePortalQuery<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
  enabled = true,
  staleTimeMs = 0
): PortalQueryResult<T> {
  const { isAuthenticated } = useCustomerAuth();
  const effectiveEnabled = enabled && isAuthenticated;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(effectiveEnabled);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const invalidationCount = usePortalInvalidations();
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  const prevInvalidationCountRef = useRef(invalidationCount);
  const prevEffectiveEnabledRef = useRef(effectiveEnabled);
  const prevVersionRef = useRef(version);
  const inFlightRef = useRef(false);
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

    if (!shouldFetch) {
      return;
    }

    // Never fire a duplicate while one is in flight — even on invalidation.
    // The in-flight response already reflects near-current ERP state; a second
    // concurrent fetch only risks 429s.
    if (inFlightRef.current) {
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
      });

    return () => {
      active = false;
    };
  }, [version, invalidationCount, effectiveEnabled, staleTimeMs, isAuthenticated, ...deps]);

  const effectiveLoading = isLoading || (effectiveEnabled && lastFetchedAt === null && data === null && error === null);

  return { data, isLoading: effectiveLoading, error, refetch };
}