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

function parseBoolFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
}

function parseTimeoutMs(value: string | undefined): number {
  const DEFAULT = 15000;
  if (value === undefined || value === null || String(value).trim() === '') return DEFAULT;
  const parsed = Number(String(value).trim());
  if (!Number.isFinite(parsed) || parsed < 1000 || parsed > 120000) return DEFAULT;
  return Math.round(parsed);
}

function warnOnUnrecognizedFlag(name: string, value: string | undefined): void {
  if (value === undefined || value === '') return;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === 'false' || normalized === '1' || normalized === '0') return;
  try {
    console.warn(`[prime-portal] ${name} has unrecognized value "${value}" — treating as false. Use 'true'/'false'.`);
  } catch {
    // ignore
  }
}

warnOnUnrecognizedFlag('VITE_USE_REAL_BACKEND', metaEnv.VITE_USE_REAL_BACKEND);
warnOnUnrecognizedFlag('VITE_ENABLE_MOCK_API', metaEnv.VITE_ENABLE_MOCK_API);
warnOnUnrecognizedFlag('VITE_ENABLE_MOCK_AUTH', metaEnv.VITE_ENABLE_MOCK_AUTH);

export const env: AppEnv = {
  apiUrl: (metaEnv.VITE_API_URL ?? '').trim().replace(/\/+$/, ''),
  apiTimeoutMs: parseTimeoutMs(metaEnv.VITE_API_TIMEOUT_MS),
  useRealBackend: parseBoolFlag(metaEnv.VITE_USE_REAL_BACKEND),
  enableMockApi: parseBoolFlag(metaEnv.VITE_ENABLE_MOCK_API),
  enableMockAuth: parseBoolFlag(metaEnv.VITE_ENABLE_MOCK_AUTH),
  sessionStorageKey: 'portal_session',
  sentryDsn: metaEnv.VITE_SENTRY_DSN?.trim() || undefined,
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

/**
 * Fail-fast environment validation. Returns human-readable issues.
 * Call at boot (and in build validation) so misconfiguration surfaces
 * immediately instead of as a storm of NOT_CONFIGURED / TIMEOUT errors.
 */
export function getEnvIssues(options: { isProd?: boolean } = {}): string[] {
  const issues: string[] = [];
  const isProd = options.isProd ?? ((): boolean => {
    try {
      return Boolean((import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD);
    } catch {
      return false;
    }
  })();

  if (!env.apiUrl && env.useRealBackend) {
    issues.push('VITE_API_URL is empty — all ERP requests will fail with NOT_CONFIGURED.');
  }
  if (env.apiUrl && !/^https?:\/\//i.test(env.apiUrl)) {
    issues.push(`VITE_API_URL "${env.apiUrl}" must start with http(s)://.`);
  }
  if (isProd && /^http:\/\//i.test(env.apiUrl)) {
    issues.push('VITE_API_URL uses http:// in production — use https://.');
  }
  if (isProd && !env.useRealBackend) {
    issues.push('VITE_USE_REAL_BACKEND must be true in production.');
  }
  if (isProd && (env.enableMockApi || env.enableMockAuth)) {
    issues.push('Mock flags (VITE_ENABLE_MOCK_API / VITE_ENABLE_MOCK_AUTH) must be false in production.');
  }
  if (!env.sentryDsn && isProd) {
    issues.push('VITE_SENTRY_DSN is missing — production will run blind (no error tracking).');
  }
  return issues;
}

/** Logs env issues once at boot; throws in production when fatal. */
export function assertEnvAtBoot(): void {
  const issues = getEnvIssues();
  if (issues.length === 0) return;
  const isProd = (() => {
    try {
      return Boolean((import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD);
    } catch {
      return false;
    }
  })();
  try {
    console.warn(`[prime-portal] Environment issues:\n- ${issues.join('\n- ')}`);
  } catch {
    // ignore
  }
  const fatal = issues.some((i) => i.includes('must be true in production') || i.includes('must be false in production'));
  if (isProd && fatal) {
    throw new Error(`Invalid production environment: ${issues.join('; ')}`);
  }
}