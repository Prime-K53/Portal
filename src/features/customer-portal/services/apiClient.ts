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
  | 'UNKNOWN';

export class ApiError extends Error {
  readonly status: number | null;
  readonly code: ApiErrorCode;
  readonly details: unknown;

  constructor(
    message: string,
    options?: { status?: number | null; code?: ApiErrorCode; details?: unknown }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options?.status ?? null;
    this.code = options?.code ?? 'UNKNOWN';
    this.details = options?.details;
  }

  /** True when the request was rejected because the session is invalid. */
  get isAuthError(): boolean {
    return this.code === 'UNAUTHORIZED' || this.code === 'FORBIDDEN';
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
  /** Invoked when authentication fails and refresh cannot restore it. */
  onAuthFailure?: () => void;
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

  try {
    const payload = (await response.json()) as {
      message?: string;
      error?: string;
      details?: unknown;
      code?: string;
    };
    // ERP canonical error shape: { error: <title>, message: <human text> }.
    message = payload.message ?? payload.error;
    details = payload.details ?? payload.code;
  } catch {
    // Non-JSON error body — fall back to status text.
  }

  const status = response.status;
  let code: ApiErrorCode;
  if (status === 401) code = 'UNAUTHORIZED';
  else if (status === 403) code = 'FORBIDDEN';
  else if (status === 404) code = 'NOT_FOUND';
  else if (status === 429) code = 'BAD_REQUEST';
  else if (status >= 400 && status < 500) code = 'BAD_REQUEST';
  else if (status >= 500) code = 'SERVER_ERROR';
  else code = 'UNKNOWN';

  return new ApiError(message || `Request failed with status ${status} (${response.statusText}).`, {
    status,
    code,
    details,
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
    const timer = window.setTimeout(
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
      if (options.body !== undefined) headers['Content-Type'] = 'application/json';
      // Marks the retry after a 401 refresh (harmless client-controlled header
      // documented in the ERP contract §8).
      if (attempt > 1) headers['X-Refresh-Attempt'] = 'true';

      return await fetch(joinUrl(baseUrl, path), {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
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
      window.clearTimeout(timer);
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

    let response = await perform(method, path, options, 1);

    // 401 → single-flight refresh (deps.refreshAccessToken) → retry exactly once.
    if (response.status === 401) {
      const freshToken = await deps.refreshAccessToken();
      if (freshToken) {
        response = await perform(method, path, options, 2);
      }
    }

    if (!response.ok) {
      if (response.status === 401) deps.onAuthFailure?.();
      throw await normalizeError(response);
    }

    if (response.status === 204) return undefined as T;
    try {
      return (await response.json()) as T;
    } catch {
      return undefined as T;
    }
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
