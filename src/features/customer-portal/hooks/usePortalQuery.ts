/**
 * Prime PORTAL — usePortalQuery
 *
 * Generic data-fetching hook used by feature hooks. Always yields the four
 * production states: loading, data, error and a refetch trigger.
 */

import { useCallback, useEffect, useReducer, useState } from 'react';

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

function usePortalInvalidations(): void {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    invalidateListeners.add(force);
    return () => {
      invalidateListeners.delete(force);
    };
  }, []);
}

export function usePortalQuery<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
  enabled = true
): PortalQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  usePortalInvalidations();

  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setIsLoading(true);
    setError(null);
    // Route through Promise.resolve so a fetcher that throws SYNCHRONOUSLY
    // (e.g. a feature blocked with an explicit ApiError) becomes the query's
    // error state instead of an uncaught exception that unmounts the app.
    Promise.resolve()
      .then(fetcher)
      .then((result) => {
        if (active) setData(result);
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
  }, [version, ...deps, enabled]);

  return { data, isLoading, error, refetch };
}