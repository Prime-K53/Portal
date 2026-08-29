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
 * refetches from the ERP. Rare events — a full refetch is acceptable and keeps
 * the Portal consistent with the ERP of record.
 */
const invalidateListeners = new Set<() => void>();
export function invalidatePortalQueries(): void {
  invalidateListeners.forEach((listener) => listener());
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

  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!effectiveEnabled) {
      setIsLoading(false);
      setData(null);
      setError(null);
      setLastFetchedAt(null);
      return;
    }

    const isInitialFetch = lastFetchedAt === null;
    const isInvalidated = prevInvalidationCountRef.current !== invalidationCount;
    prevInvalidationCountRef.current = invalidationCount;

    const isStale = lastFetchedAt !== null && staleTimeMs > 0 && Date.now() - lastFetchedAt > staleTimeMs;
    const isExplicitRefetch = version > 0;

    if (!isInitialFetch && !isInvalidated && !isExplicitRefetch && !isStale) {
      return;
    }

    let active = true;
    setIsLoading(true);
    setError(null);
    Promise.resolve()
      .then(fetcher)
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
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, invalidationCount, effectiveEnabled, staleTimeMs, ...deps]);

  return { data, isLoading, error, refetch };
}