/**
 * Prime PORTAL — Centralized API Client
 *
 * Single HTTP boundary between Portal services and the ERP Portal API.
 * Supports GET / POST / PUT / PATCH / DELETE, JSON handling, bearer
 * authorization, timeouts, normalized errors, and 401 refresh/retry.
 *
 * The base URL is resolved from the environment: `${VITE_API_URL}/api` per the
 * Phase 3 ERP contract (the backend mounts the portal API at /api/portal and
 * the unified auth API at /api/auth under that prefix).
 *
 * The client NEVER falls back to mock data. When the ERP is unreachable the
 * caller receives a normalized ApiError.
 */

import { env } from '../config/env';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ApiErrorCode =
  | 'NOT_CONFIGURED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'SERVER_ERROR'
  | 'UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'UNKNOWN';

export class ApiError extends Error {
  readonly status: number | null;
  readonly code: ApiErrorCode;
  readonly details: unknown;
  readonly retryAfterMs: number | null;
  readonly correlationId: string | null;

  constructor(
    message: string,
    options?: { status?: number | null; code?: ApiErrorCode; details?: unknown; retryAfterMs?: number | null; correlationId?: string | null }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options?.status ?? null;
    this.code = options?.code ?? 'UNKNOWN';
    this.details = options?.details;
    this.retryAfterMs = options?.retryAfterMs ?? null;
    this.correlationId = options?.correlationId ?? null;
  }

  /** True when the session is invalid and refresh cannot restore it (401 only). */
  get isAuthError(): boolean {
    return this.code === 'UNAUTHORIZED';
  }

  /** True when the ERP service could not be reached. */
  get isNetworkError(): boolean {
    return this.code === 'NETWORK_ERROR' || this.code === 'TIMEOUT';
  }

  /** True when the feature is confirmed blocked until an ERP blocker clears. */
  get isUnavailable(): boolean {
    return this.code === 'UNAVAILABLE';
  }
}

export interface ApiRequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Do not attach the Authorization header (login/refresh endpoints). */
  skipAuth?: boolean;
  /**
   * Maximum retry attempts for transient errors (429 rate-limit, 5xx server
   * errors, network failures, timeouts). Only used for GET / HEAD / OPTIONS
   * requests — mutations are never retried automatically to avoid duplicate
   * operations. Set to 0 to disable retry for a specific call.
   * Default: 3.
   */
  maxRetries?: number;
}

export interface ApiClientDependencies {
  /**
   * ERP API base URL — MUST include the `/api` suffix
   * (composed by the service layer as `${VITE_API_URL}/api`).
   */
  baseUrl: string;
  /** Returns the current JWT access token (never the refresh token). */
  getAccessToken: () => string | null;
  /**
   * Attempts to rotate the session and returns a fresh access token, or null
   * when the session cannot be refreshed. Called at most once per 401 —
   * the caller retries the original request exactly once with the fresh token.
   */
  refreshAccessToken: () => Promise<string | null>;
  /**
   * Invoked when authentication fails and refresh cannot restore it. Receives
   * whether the failing call was a skipAuth endpoint (login/refresh) — those
   * failures are meaningful answers (bad credentials, stale refresh token),
   * NOT a reason to tear down an established session.
   */
  onAuthFailure?: (source: { skipAuth?: boolean }) => void;
  /**
   * Optional gate consulted BEFORE every request. Returning an ApiError fails
   * the request fast without touching the network — used by the auth layer so
   * requests queued during session recovery fail with the ORIGINAL stale-
   * session reason instead of racing out without a token and producing a
   * misleading secondary `401 No authentication token provided`.
   */
  requestGate?: () => ApiError | null;
}

export interface ApiClient {
  get<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T>;
  delete<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  request<T>(method: HttpMethod, path: string, options?: ApiRequestOptions): Promise<T>;
}

function joinUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return baseUrl.endsWith('/') ? `${baseUrl.slice(0, -1)}${normalizedPath}` : `${baseUrl}${normalizedPath}`;
}

function isAbortTimeout(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TimeoutError';
}

async function normalizeError(response: Response): Promise<ApiError> {
  let message: string | undefined;
  let details: unknown;
  let rawBody: unknown = null;

  try {
    const text = await response.text();
    if (text) {
      try {
        const payload = JSON.parse(text) as {
          message?: string;
          error?: string;
          errors?: unknown;
          details?: unknown;
          code?: string;
        };
        rawBody = payload;
        // ERP canonical error shape: { error: <title>, message: <human text> }.
        message = payload.message ?? payload.error;
        // Preserve validation arrays (e.g. { errors: [...] }) alongside details.
        details = payload.details ?? (payload as Record<string, unknown>).errors ?? payload.code ?? text.slice(0, 2000);
      } catch {
        rawBody = text.slice(0, 2000);
        message = undefined;
      }
    }
  } catch {
    // Non-JSON error body — fall back to status text.
  }

  const status = response.status;
  let code: ApiErrorCode;
  if (status === 401) code = 'UNAUTHORIZED';
  else if (status === 403) code = 'FORBIDDEN';
  else if (status === 404) code = 'NOT_FOUND';
  else if (status === 429) code = 'RATE_LIMITED';
  else if (status >= 400 && status < 500) code = 'BAD_REQUEST';
  else if (status >= 500) code = 'SERVER_ERROR';
  else code = 'UNKNOWN';

  // Honor server Retry-After (seconds or HTTP date) for 429/503.
  let retryAfterMs: number | null = null;
  try {
    const retryAfter = response.headers?.get?.('retry-after');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds)) retryAfterMs = Math.max(0, seconds * 1000);
      else {
        const dateMs = Date.parse(retryAfter);
        if (Number.isFinite(dateMs)) retryAfterMs = Math.max(0, dateMs - Date.now());
      }
    }
  } catch {
    // ignore
  }

  let correlationId: string | null = null;
  try {
    correlationId =
      response.headers?.get?.('x-request-id') ??
      response.headers?.get?.('x-correlation-id') ??
      (rawBody && typeof rawBody === 'object' ? (rawBody as Record<string, unknown>).requestId as string ?? null : null) ??
      null;
  } catch {
    // ignore
  }

  return new ApiError(message || `Request failed with status ${status} (${response.statusText}).`, {
    status,
    code,
    details,
    retryAfterMs,
    correlationId,
  });
}

export function createApiClient(deps: ApiClientDependencies): ApiClient {
  const { baseUrl } = deps;

  async function perform(
    method: HttpMethod,
    path: string,
    options: ApiRequestOptions,
    attempt: number
  ): Promise<Response> {
    const timeoutMs = options.timeoutMs ?? env.apiTimeoutMs;
    const controller = new AbortController();
    const safeSetTimeout =
      typeof window !== 'undefined' && typeof window.setTimeout === 'function'
        ? window.setTimeout.bind(window)
        : setTimeout;
    const safeClearTimeout =
      typeof window !== 'undefined' && typeof window.clearTimeout === 'function'
        ? window.clearTimeout.bind(window)
        : clearTimeout;
    const timer = safeSetTimeout(
      () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
      timeoutMs
    );

    const externalAbort = () => controller.abort();
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener('abort', externalAbort);
    }

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...options.headers,
      };
      const accessToken = deps.getAccessToken();
      if (accessToken && !options.skipAuth) headers.Authorization = `Bearer ${accessToken}`;
      const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
      // Never set Content-Type for FormData — the browser must set the boundary.
      // Drop any caller-supplied multipart header (it breaks uploads).
      if (isFormData) {
        for (const key of Object.keys(headers)) {
          if (key.toLowerCase() === 'content-type') delete headers[key];
        }
      } else if (options.body !== undefined) {
        headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
      }
      // Marks the retry after a 401 refresh (harmless client-controlled header
      // documented in the ERP contract §8).
      if (attempt > 1) headers['X-Refresh-Attempt'] = 'true';

      return await fetch(joinUrl(baseUrl, path), {
        method,
        headers,
        body: options.body !== undefined ? (isFormData ? (options.body as FormData) : JSON.stringify(options.body)) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      if (isAbortTimeout(error)) {
        throw new ApiError('The request timed out. Please try again.', { code: 'TIMEOUT', details: error });
      }
      throw new ApiError('Unable to reach the ERP Portal service. Check your network connection and try again.', {
        code: 'NETWORK_ERROR',
        details: error,
      });
    } finally {
      safeClearTimeout(timer);
      options.signal?.removeEventListener('abort', externalAbort);
    }
  }

  async function request<T>(method: HttpMethod, path: string, options: ApiRequestOptions = {}): Promise<T> {
    if (!baseUrl) {
      throw new ApiError(
        'The ERP Portal API is not configured yet (VITE_API_URL is unset). The Portal is not connected to the ERP.',
        { code: 'NOT_CONFIGURED' }
      );
    }

    const maxRetries = options.maxRetries ?? 3;
    // Only GET, HEAD, and OPTIONS are retryable without risk of duplication.
    // All other methods (POST/PUT/PATCH/DELETE) are fire-and-forget from the
    // portal's perspective — the ERP is the authoritative idempotency layer.
    const isIdempotent = ['GET', 'HEAD', 'OPTIONS'].includes(method);

    async function wait(ms: number): Promise<void> {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }

    function backoffWithJitter(attempt: number, retryAfterMs: number | null): number {
      // Honor server Retry-After when present (capped at 30s to avoid hangs).
      if (retryAfterMs !== null && Number.isFinite(retryAfterMs)) {
        return Math.min(Math.max(0, Math.round(retryAfterMs)), 30000);
      }
      // Exponential: 500ms base, doubling per attempt, capped at 4s.
      // ±25% jitter prevents thundering-herd synchronisation across tabs.
      const base = Math.min(500 * 2 ** attempt, 4000);
      const jitter = base * 0.25 * (Math.random() * 2 - 1);
      return Math.round(base + jitter);
    }

    function isRetryable(error: ApiError): boolean {
      return (
        isIdempotent &&
        maxRetries > 0 &&
        (error.code === 'RATE_LIMITED' ||
          error.code === 'UNAVAILABLE' ||
          error.code === 'SERVER_ERROR' ||
          error.code === 'NETWORK_ERROR' ||
          error.code === 'TIMEOUT')
      );
    }

    let lastError: ApiError | null = null;
    let lastRetryAfterMs: number | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Session-recovery gate — fails fast with the original stale-session
      // reason when the auth layer has concluded the session is unrecoverable.
      // Auth endpoints themselves (login/activate/refresh) are exempt: they are
      // exactly how the user RECOVERS from that state.
      // Checked on EVERY attempt (not just attempt 0) so retries cannot bypass
      // termination.
      const blocked = !options.skipAuth ? deps.requestGate?.() : null;
      if (blocked) throw blocked;

      try {
        let response = await perform(method, path, options, attempt + 1);

        // 401 → single-flight refresh → retry exactly once with the fresh token.
        // skipAuth calls (login/refresh) NEVER recurse — their 401 IS terminal.
        // Transient refresh failures (network/timeout) MUST NOT kill the
        // session — they throw and are handled below without onAuthFailure.
        if (response.status === 401 && !options.skipAuth) {
          let freshToken: string | null = null;
          try {
            freshToken = await deps.refreshAccessToken();
          } catch (refreshTransient) {
            // Refresh transport failed — session may still be valid. Do not
            // terminate; surface a retryable error for idempotent requests.
            const transient = refreshTransient instanceof ApiError
              ? refreshTransient
              : new ApiError('Session refresh failed due to a network problem.', { code: 'NETWORK_ERROR', details: refreshTransient });
            if (isRetryable(transient) && attempt < maxRetries) {
              lastError = transient;
              lastRetryAfterMs = transient.retryAfterMs;
              await wait(backoffWithJitter(attempt, lastRetryAfterMs));
              continue;
            }
            throw transient;
          }
          if (freshToken) {
            response = await perform(method, path, options, attempt + 2);
          }
        }

        if (!response.ok) {
          // Only terminate on 401 when refresh could not restore (null) AND
          // the gate confirms termination. Transient refresh failures never
          // reach here (handled above). 403 is authorization, not session
          // expiry — never terminate on it.
          if (response.status === 401) deps.onAuthFailure?.({ skipAuth: !!options.skipAuth });
          const terminated = !options.skipAuth ? deps.requestGate?.() : null;
          if (terminated) throw terminated;

          const error = await normalizeError(response);
          if (isRetryable(error) && attempt < maxRetries) {
            lastError = error;
            const delay = backoffWithJitter(attempt, error.retryAfterMs);
            await wait(delay);
            continue;
          }
          throw error;
        }

        if (response.status === 204) return undefined as T;
        try {
          return (await response.json()) as T;
        } catch {
          return undefined as T;
        }
      } catch (error) {
        // Network / timeout errors from `perform` are ApiErrors.
        if (error instanceof ApiError) {
          if (isRetryable(error) && attempt < maxRetries) {
            lastError = error;
            const delay = backoffWithJitter(attempt, error.retryAfterMs);
            await wait(delay);
            continue;
          }
          throw error;
        }
        // Non-ApiError from perform (should not happen, but defensive).
        throw error;
      }
    }

    // All retries exhausted — surface the last error encountered.
    throw lastError ?? new ApiError('Maximum retry attempts exceeded.', { code: 'UNAVAILABLE' });
  }

  return {
    get<T>(path: string, options?: ApiRequestOptions) {
      return request<T>('GET', path, options);
    },
    post<T>(path: string, body?: unknown, options?: ApiRequestOptions) {
      return request<T>('POST', path, { ...options, body });
    },
    put<T>(path: string, body?: unknown, options?: ApiRequestOptions) {
      return request<T>('PUT', path, { ...options, body });
    },
    patch<T>(path: string, body?: unknown, options?: ApiRequestOptions) {
      return request<T>('PATCH', path, { ...options, body });
    },
    delete<T>(path: string, options?: ApiRequestOptions) {
      return request<T>('DELETE', path, options);
    },
    request<T>(method: HttpMethod, path: string, options?: ApiRequestOptions) {
      return request<T>(method, path, options);
    },
  };
}
