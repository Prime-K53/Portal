/**
 * Prime PORTAL — Centralized Environment & Configuration Layer
 *
 * All runtime configuration is resolved from Vite environment variables HERE.
 * No application code reads `import.meta.env` directly.
 *
 * Environment variables:
 *   VITE_API_URL             Backend origin WITHOUT the /api suffix. The API
 *                            client composes `${VITE_API_URL}/api` per the
 *                            Phase 3 ERP contract. Development, staging and
 *                            production may each supply their own value.
 *   VITE_API_TIMEOUT_MS      Request timeout in milliseconds (default 15000).
 *   VITE_USE_REAL_BACKEND    Sasa flag: 'true' forces the REAL ERP backend and
 *                            disables every mock implementation. Production
 *                            MUST set this to 'true' — API failures stay
 *                            failures, they are never replaced with mock data.
 *   VITE_ENABLE_MOCK_API     DEVELOPMENT ONLY — set to 'true' to serve the
 *                            in-memory mock PortalService. Ignored when
 *                            VITE_USE_REAL_BACKEND=true.
 *   VITE_ENABLE_MOCK_AUTH    DEVELOPMENT ONLY — set to 'true' to enable the
 *                            in-memory mock AuthService. Ignored when
 *                            VITE_USE_REAL_BACKEND=true.
 *   VITE_SENTRY_DSN          Sentry Data Source Name for error tracking. When
 *                            absent Sentry is not initialised (safe for local
 *                            dev where npm run dev has no network). Set only
 *                            in the production Vite environment.
 *
 * Session storage follows the ERP contract: sessionStorage key `portal_session`
 * holds the ERP envelope { access_token, refresh_token, expires_in, user }.
 */

export interface AppEnv {
  /** ERP backend origin, no `/api` suffix (from VITE_API_URL). */
  readonly apiUrl: string;
  /** Per-request timeout in milliseconds. */
  readonly apiTimeoutMs: number;
  /** 'true' forces the real ERP backend and disables all mocks. */
  readonly useRealBackend: boolean;
  /** DEVELOPMENT ONLY flag — routes data access through the mock PortalService. */
  readonly enableMockApi: boolean;
  /** DEVELOPMENT ONLY flag — routes authentication through the mock AuthService. */
  readonly enableMockAuth: boolean;
  /** Sentry DSN — absent means error tracking is disabled. */
  readonly sentryDsn: string | undefined;
  /** sessionStorage key for the ERP portal session envelope. */
  readonly sessionStorageKey: string;
}

const metaEnv = (import.meta.env ?? {}) as Record<string, string | undefined>;

export const env: AppEnv = {
  apiUrl: (metaEnv.VITE_API_URL ?? '').trim(),
  apiTimeoutMs: Number(metaEnv.VITE_API_TIMEOUT_MS ?? 15000),
  useRealBackend: metaEnv.VITE_USE_REAL_BACKEND === 'true',
  enableMockApi: metaEnv.VITE_ENABLE_MOCK_API === 'true',
  enableMockAuth: metaEnv.VITE_ENABLE_MOCK_AUTH === 'true',
  sessionStorageKey: 'portal_session',
  sentryDsn: metaEnv.VITE_SENTRY_DSN,
};

/**
 * True when any development-only mock implementation is active.
 * VITE_USE_REAL_BACKEND=true always wins — mocks are never active in a
 * real-backend build.
 */
export function isMockModeActive(): boolean {
  if (env.useRealBackend) return false;
  return env.enableMockApi || env.enableMockAuth;
}