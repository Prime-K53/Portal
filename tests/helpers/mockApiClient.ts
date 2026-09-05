/**
 * Deterministic mock for the portal API client — used by load.test.ts.
 *
 * Simulates fetch with configurable responses (status, body, delay, network
 * errors) so the retry/backoff logic can be exercised without a real ERP.
 *
 * Usage:
 *   import { createPortalTestApiClient, type MockFetchState } from './helpers/mockApiClient';
 *   const client = createPortalTestApiClient(
 *     (path) => ({ type: 'ok', status: 429, body: {}, delayMs: 5 }),
 *     (msg) => console.log(msg)
 *   );
 */

export type MockFetchState =
  | { type: 'ok'; status: number; body: unknown; delayMs?: number }
  | { type: 'network'; delayMs?: number };

function makeOkResponse(state: MockFetchState & { type: 'ok' }): Response {
  return new Response(JSON.stringify(state.body), {
    status: state.status,
    headers: { 'Content-Type': 'application/json' },
  }) as Response;
}

export interface PortalTestClient {
  get<T>(path: string, options?: Record<string, unknown>, retryOptions?: Record<string, unknown>): Promise<T>;
  post<T>(path: string, body?: unknown, options?: Record<string, unknown>): Promise<T>;
  put<T>(path: string, body?: unknown, options?: Record<string, unknown>): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: Record<string, unknown>): Promise<T>;
  delete<T>(path: string, options?: Record<string, unknown>): Promise<T>;
  refreshAccessToken: () => Promise<string | null>;
}

export function createPortalTestApiClient(
  stateOrFn: MockFetchState | ((path: string) => MockFetchState),
  log: (msg: string) => void
): PortalTestClient {
  function getState(path: string): MockFetchState {
    if (typeof stateOrFn === 'function') return (stateOrFn as (path: string) => MockFetchState)(path);
    return stateOrFn as MockFetchState;
  }

  function sleep(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }

  async function performFetch(method: string, path: string): Promise<Response> {
    const state = getState(path);
    log(`fetch ${method} ${path} → ${state.type === 'network' ? 'NETWORK_ERROR' : state.status}`);
    if (state.delayMs) await sleep(state.delayMs);

    if (state.type === 'network') {
      throw Object.assign(new Error('Network Error'), { code: 'NETWORK_ERROR' });
    }

    return makeOkResponse(state);
  }

  async function withRetry<T>(
    method: string,
    path: string,
    options: Record<string, unknown> = {},
    maxRetries = 3
  ): Promise<T> {
    const isIdempotent = ['GET', 'HEAD', 'OPTIONS'].includes(method);
    const baseDelay = 500;

    function backoff(attempt: number): number {
      return Math.min(baseDelay * 2 ** attempt, 4000);
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await performFetch(method, path);

        if (res.status === 429 || res.status >= 500) {
          if (isIdempotent && attempt < maxRetries) {
            await sleep(backoff(attempt));
            continue;
          }
          const code = res.status === 429 ? 'UNAVAILABLE' : 'SERVER_ERROR';
          throw Object.assign(new Error(`HTTP ${res.status}`), { code, status: res.status });
        }

        if (res.status === 401) {
          const fresh = await refreshAccessToken();
          if (fresh && attempt === 0) {
            continue;
          }
          throw Object.assign(new Error('Unauthorized'), { code: 'UNAUTHORIZED', status: 401 });
        }

        if (res.status >= 400) {
          throw Object.assign(new Error(`HTTP ${res.status}`), { code: 'BAD_REQUEST', status: res.status });
        }

        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      } catch (err: unknown) {
        const error = err as { code?: string; status?: number };
        const isRetryable =
          error.code === 'UNAVAILABLE' ||
          error.code === 'SERVER_ERROR' ||
          error.code === 'NETWORK_ERROR' ||
          error.code === 'TIMEOUT';

        if (isRetryable && isIdempotent && attempt < maxRetries) {
          await sleep(backoff(attempt));
          continue;
        }
        throw err;
      }
    }

    throw new Error('Max retries exceeded');
  }

  async function refreshAccessToken(): Promise<string | null> {
    log('refreshAccessToken called');
    return null;
  }

  return {
    async get<T>(path: string, _options?: Record<string, unknown>, retryOptions?: Record<string, unknown>): Promise<T> {
      return withRetry('GET', path, _options ?? {}, (retryOptions as Record<string, number>)?.maxRetries ?? 3) as Promise<T>;
    },
    async post<T>(path: string, body?: unknown, options?: Record<string, unknown>): Promise<T> {
      return withRetry('POST', path, options ?? {}, 0) as Promise<T>;
    },
    async put<T>(path: string, body?: unknown, options?: Record<string, unknown>): Promise<T> {
      return withRetry('PUT', path, options ?? {}, 0) as Promise<T>;
    },
    async patch<T>(path: string, body?: unknown, options?: Record<string, unknown>): Promise<T> {
      return withRetry('PATCH', path, options ?? {}, 0) as Promise<T>;
    },
    async delete<T>(path: string, options?: Record<string, unknown>): Promise<T> {
      return withRetry('DELETE', path, options ?? {}, 0) as Promise<T>;
    },
    refreshAccessToken,
  };
}
