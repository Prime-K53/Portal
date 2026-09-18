/**
 * Prime PORTAL — Authentication Service (VERIFIED ERP contract)
 *
 * Verified from the PrimeERPsystem source (backend/routes/portalAuth.cjs):
 *
 *   login       POST /api/portal/auth/login-password   { email, password, two_factor_code? }
 *   refresh     POST /api/portal/auth/refresh          { refresh_token }  (rotation — one-time use)
 *   logout      POST /api/portal/auth/logout           Bearer + { refresh_token } (revokes ALL sessions)
 *   forgot      POST /api/portal/auth/forgot-password  { email }
 *   reset       POST /api/portal/auth/reset-password   { email, code, password }
 *   activate    POST /api/portal/auth/activate         { customer_id, code, password }
 *
 * IMPORTANT: the unified POST /api/auth/login (used by earlier Sasa phases)
 * STRIPS `two_factor_code` via its Zod schema, so TOTP customers could never
 * complete 2FA through it. The customer login with 2FA support is
 * /api/portal/auth/login-password — that is what Sasa uses.
 *
 * Session storage follows the ERP contract: sessionStorage key `portal_session`
 * = { access_token, refresh_token, expires_in, user }. Refresh tokens rotate on
 * every refresh and are NEVER exposed to application code. `expires_in` is the
 * string '30m' (never numeric seconds).
 *
 * 2FA: when the account has TOTP enabled the login response is a challenge
 * { requires_two_factor, pending_token, user }. The client re-POSTs the same
 * login with `two_factor_code`. Pending credentials live in memory only.
 *
 * Proactive refresh: mirrors the ERP client's 25-minute schedule. Refresh
 * failures dispatch the `portal-session-expired` window event → UI clears the
 * session and returns to login.
 */

import { env } from '../config/env';
import type {
  AuthCredentials,
  AuthRegisterInput,
  AuthSession,
  ErpLoginPayload,
  ErpLoginResponse,
  ErpLoginUser,
  ErpRefreshResponse,
  ErpStoredSession,
  ErpTwoFactorChallenge,
  PortalUser,
} from '../types';
import { createApiClient, ApiError, type ApiClient } from './apiClient';
import { tokenStore } from './tokenStore';

export type AuthErrorCode = 'NOT_CONNECTED' | 'INVALID_CREDENTIALS' | 'SESSION_EXPIRED' | 'UNAVAILABLE' | 'UNKNOWN';

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(message: string, code: AuthErrorCode) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

/** Outcome of the first login step — either a full session or a 2FA challenge. */
export type LoginOutcome =
  | { type: 'session'; session: AuthSession }
  | { type: 'two_factor'; user: { id: string; email: string } };

export interface AuthService {
  /**
   * Returns the shared ERP API client so other services (portal data, SSE)
   * reuse the SAME single-flight refresh pipeline.
   */
  getApiClient?(): ApiClient;
  login(credentials: AuthCredentials): Promise<LoginOutcome>;
  verifyTwoFactor(code: string): Promise<AuthSession>;
  logout(): Promise<void>;
  /** Restores/rotates the persisted session (returns null when none/none restored). */
  refreshSession(): Promise<AuthSession | null>;
  /** Single-flight refresh used by the API client on 401. Returns a fresh token or null. */
  refreshAccessToken(): Promise<string | null>;
  getCurrentUser(): Promise<PortalUser | null>;
  getSession(): AuthSession | null;
  isAuthenticated(): boolean;
  /**
   * @deprecated Legacy active-account registration (POST /portal/auth/register).
   * The public Create Account flow now submits approval-gated registration
   * REQUESTS via services/registrationRequestService.ts and must NOT call
   * this. Kept functional only because the ERP backend still exposes the
   * endpoint during the migration. No UI registration caller may use it.
   */
  register(input: AuthRegisterInput): Promise<AuthSession>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(email: string, code: string, password: string): Promise<void>;
  activate(customerId: string, code: string, password: string): Promise<AuthSession>;
  /** Authenticated password change (ERP `PUT /portal/profile/password`). */
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
}

/** ERP event dispatched when the session cannot be refreshed/restored. */
export const PORTAL_SESSION_EXPIRED_EVENT = 'portal-session-expired';

/**
 * Session-recovery hardening (frontend-only).
 *
 * When recovery concludes the persisted session is unrecoverable, the ORIGINAL
 * failure reason is recorded BEFORE the envelope is cleared and expiry is
 * broadcast once. The shared API client consults this via its `requestGate`
 * so queued/in-flight requests fail fast with that reason instead of racing
 * to the ERP without a token and surfacing a misleading secondary
 * `401 No authentication token provided` storm while the UI redirects.
 */
const STALE_SESSION_MESSAGE = 'Your session has expired. Please sign in again.';
const UNRECOVERABLE_SESSION_MESSAGE =
  'Your session could not be restored due to a connection problem. Please sign in again.';

export function dispatchSessionExpired(): void {
  try {
    window.dispatchEvent(new CustomEvent(PORTAL_SESSION_EXPIRED_EVENT));
  } catch {
    // Event dispatch failure is non-fatal.
  }
}

/** ERP portal JWT → Sasa PortalUser (identity claims are id/customer_id — no sub). */
function toPortalUser(loginUser: ErpLoginUser): PortalUser {
  return {
    id: loginUser.id,
    email: loginUser.email,
    fullName: loginUser.full_name ?? loginUser.email,
    customerId: loginUser.customer_id,
    roles: ['portal_customer'],
  };
}

function isTwoFactorChallenge(response: ErpLoginResponse): response is ErpTwoFactorChallenge {
  return (
    typeof response === 'object' &&
    response !== null &&
    'requires_two_factor' in response &&
    (response as ErpTwoFactorChallenge).requires_two_factor === true
  );
}

function assertStrongPassword(password: string): void {
  if (password.length < 8) {
    throw new AuthError('Password must be at least 8 characters.', 'INVALID_CREDENTIALS');
  }
}

/** True when a JWT access token is expired (with 60s clock skew tolerance). */
function isAccessTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false; // opaque token — cannot verify, assume valid
    const payloadJson = JSON.parse(
      typeof atob === 'function'
        ? atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
        : Buffer.from(parts[1], 'base64').toString('utf8')
    ) as { exp?: number };
    if (typeof payloadJson.exp !== 'number') return false;
    return payloadJson.exp * 1000 <= Date.now() - 60000;
  } catch {
    return false;
  }
}

export class ErpAuthService implements AuthService {
  private readonly client: ApiClient;
  /** Pending credentials held in memory between the login step and the 2FA step. */
  private pendingCredentials: { email: string; password: string; expiresAt: number } | null = null;
  /** Single-flight refresh lock — concurrent 401s share ONE rotation call. */
  private refreshInFlight: Promise<AuthSession | null> | null = null;
  /** Proactive refresh timer (ERP client refreshes at 25 minutes). */
  private refreshTimer: number | ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  /**
   * Set exactly once when recovery concludes the session is unrecoverable.
   * While set, the shared API client's requestGate fails new requests with
   * this reason instead of sending headerless/secondary requests.
   */
  private sessionTermination: { reason: string } | null = null;
  private broadcast: BroadcastChannel | null = null;

  constructor(baseUrl: string) {
    this.client = createApiClient({
      baseUrl,
      getAccessToken: () => tokenStore.getAccessToken(),
      refreshAccessToken: () => this.refreshAccessToken(),
      onAuthFailure: ({ skipAuth }) => {
        // Login/refresh endpoint failures are terminal answers for THAT call
        // (bad credentials, stale refresh token) — the rotation path itself
        // classifies and terminates. Only a failed AUTHENTICATED request
        // (data 401 after unrecoverable recovery) tears the session down.
        if (skipAuth) return;
        this.terminateSession(STALE_SESSION_MESSAGE);
      },
      requestGate: () =>
        this.sessionTermination
          ? new ApiError(this.sessionTermination.reason, {
              code: 'UNAUTHORIZED',
              details: { sessionExpired: true },
            })
          : null,
    });
    this.initCrossTabSync();
  }

  /**
   * Records the original failure reason (first one wins), clears the stored
   * envelope, and broadcasts the expiry event — in that order — so every part
   * of the UI observes ONE coherent stale-session story.
   */
  private terminateSession(reason: string): void {
    if (this.sessionTermination) return;
    this.sessionTermination = { reason };
    this.clearSession();
    this.broadcastState('session-expired');
    dispatchSessionExpired();
  }

  /** Cross-tab session sync: logout in one tab logs out all tabs; refresh in one updates others. */
  private initCrossTabSync(): void {
    try {
      // Browser-only: Node test runners provide a global BroadcastChannel that
      // would keep the event loop alive and hang `tsx --test`.
      if (typeof window === 'undefined') return;
      if (typeof BroadcastChannel === 'undefined') return;
      this.broadcast = new BroadcastChannel('portal_session');
      this.broadcast.onmessage = (event) => {
        const type = (event?.data as { type?: string })?.type;
        if (type === 'session-expired' || type === 'logout') {
          if (!this.sessionTermination) {
            this.sessionTermination = { reason: STALE_SESSION_MESSAGE };
          }
          this.clearSessionLocal();
          dispatchSessionExpired();
        } else if (type === 'session-updated') {
          // Another tab rotated tokens — clear termination so this tab retries
          // with the fresh envelope instead of failing fast.
          this.sessionTermination = null;
        }
      };
    } catch {
      this.broadcast = null;
    }
    try {
      if (typeof window !== 'undefined') {
        window.addEventListener('storage', (e) => {
          if (e.key === 'portal_session_terminated' && e.newValue) {
            if (!this.sessionTermination) {
              this.sessionTermination = { reason: STALE_SESSION_MESSAGE };
            }
            this.clearSessionLocal();
            dispatchSessionExpired();
          }
        });
      }
    } catch {
      // ignore
    }
  }

  private broadcastState(type: 'session-expired' | 'logout' | 'session-updated'): void {
    try {
      this.broadcast?.postMessage({ type });
    } catch {
      // ignore
    }
    try {
      if (typeof localStorage !== 'undefined' && (type === 'session-expired' || type === 'logout')) {
        localStorage.setItem('portal_session_terminated', String(Date.now()));
      }
      if (typeof localStorage !== 'undefined' && type === 'session-updated') {
        localStorage.removeItem('portal_session_terminated');
      }
    } catch {
      // ignore
    }
  }

  private clearSessionLocal(): void {
    this.pendingCredentials = null;
    this.clearProactiveTimer();
    tokenStore.clearEnvelope();
  }

  /** Shared API client — the single refresh pipeline for the whole Portal. */
  getApiClient(): ApiClient {
    return this.client;
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(credentials: AuthCredentials): Promise<LoginOutcome> {
    const email = credentials.email.trim().toLowerCase();
    if (!email || !credentials.password) {
      throw new AuthError('Please fill in both email and password.', 'INVALID_CREDENTIALS');
    }

    const response = await this.client.post<ErpLoginResponse>(
      '/portal/auth/login-password',
      { email, password: credentials.password },
      { skipAuth: true }
    );

    if (isTwoFactorChallenge(response)) {
      // Do NOT assume a token exists here — the ERP issues no tokens on a challenge.
      // Credentials live max 5 minutes in memory, then auto-expire.
      this.pendingCredentials = { email, password: credentials.password, expiresAt: Date.now() + 5 * 60 * 1000 };
      return { type: 'two_factor', user: response.user };
    }

    return { type: 'session', session: this.establishSession(response) };
  }

  async verifyTwoFactor(code: string): Promise<AuthSession> {
    const pending = this.pendingCredentials;
    if (!pending || Date.now() > pending.expiresAt) {
      this.pendingCredentials = null;
      throw new AuthError('Two-factor verification requires a pending login. Please sign in again.', 'INVALID_CREDENTIALS');
    }
    const trimmed = code.trim();
    if (!trimmed) {
      throw new AuthError('Please enter your verification code.', 'INVALID_CREDENTIALS');
    }

    const response = await this.client.post<ErpLoginResponse>(
      '/portal/auth/login-password',
      { email: pending.email, password: pending.password, two_factor_code: trimmed },
      { skipAuth: true }
    );

    if (isTwoFactorChallenge(response)) {
      throw new AuthError('Invalid verification code. Please try again.', 'INVALID_CREDENTIALS');
    }

    this.pendingCredentials = null;
    return this.establishSession(response);
  }

  private establishSession(payload: ErpLoginPayload): AuthSession {
    // A successful login/activation supersedes any prior termination state.
    this.sessionTermination = null;
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem('portal_session_terminated');
    } catch {
      // ignore
    }
    const user = toPortalUser(payload.user);
    const session: AuthSession = {
      accessToken: payload.access_token,
      user,
      authenticatedAt: new Date().toISOString(),
    };
    const envelope: ErpStoredSession = {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_in: payload.expires_in,
      user: payload.user,
    };
    tokenStore.writeEnvelope(envelope);
    this.broadcastState('session-updated');
    this.armProactiveRefresh();
    return session;
  }

  // ── Refresh (rotation + single-flight) ────────────────────────────────────

  async refreshAccessToken(): Promise<string | null> {
    const session = await this.refreshSession();
    return session?.accessToken ?? null;
  }

  async refreshSession(): Promise<AuthSession | null> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.performRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async performRefresh(): Promise<AuthSession | null> {
    if (this.disposed) return null;
    const refreshToken = tokenStore.getRefreshToken();
    // No refresh token = nothing to rotate. Return null WITHOUT terminating
    // here — the apiClient's onAuthFailure will terminate after classifying
    // the original 401. This keeps single responsibility: missing token is an
    // auth failure, not a transient.
    if (!refreshToken) return null;

    // Cross-tab single-flight via localStorage mutex (one-time refresh tokens
    // must not be consumed concurrently by two tabs). Best-effort: if lock
    // held by another tab, wait briefly then re-read the envelope (the other
    // tab may have already rotated).
    const lockAcquired = await this.acquireRefreshLock();
    if (!lockAcquired) {
      await new Promise((r) => setTimeout(r, 800));
      const afterWait = tokenStore.getAccessToken();
      if (afterWait) {
        const session = this.getSession();
        if (session) return session;
      }
      // Fall through to normal refresh if still no session.
    }

    try {
      const response = await this.client.post<ErpRefreshResponse>(
        '/portal/auth/refresh',
        { refresh_token: refreshToken },
        { skipAuth: true }
      );

      if (!response.access_token || !response.refresh_token) {
        // ERP answered but the rotation payload is incomplete — treat as stale.
        this.terminateSession(STALE_SESSION_MESSAGE);
        return null;
      }

      // Rotation: REPLACE the stored refresh token — the old one is now invalid.
      const previousUser = tokenStore.getUser();
      if (!previousUser) {
        this.terminateSession(STALE_SESSION_MESSAGE);
        return null;
      }
      const envelope: ErpStoredSession = {
        access_token: response.access_token,
        refresh_token: response.refresh_token,
        expires_in: response.expires_in,
        user: previousUser,
      };
      tokenStore.writeEnvelope(envelope);
      this.sessionTermination = null;
      this.broadcastState('session-updated');
      this.armProactiveRefresh();

      const session: AuthSession = {
        accessToken: response.access_token,
        user: toPortalUser(previousUser),
        authenticatedAt: new Date().toISOString(),
      };
      return session;
    } catch (error) {
      // Only terminate the session when the ERP explicitly rejects the refresh
      // token (4xx). Network errors, timeouts and 5xx are transient — the
      // session in sessionStorage may still be valid. Terminating on a
      // transient error destroys a valid session and triggers a "session
      // expired" storm in the UI. Transient failures THROW so the apiClient
      // knows NOT to call onAuthFailure.
      const authRejected =
        error instanceof ApiError &&
        error.status !== null &&
        error.status >= 400 &&
        error.status < 500;
      if (authRejected) {
        this.terminateSession(STALE_SESSION_MESSAGE);
        return null;
      }
      if (error instanceof ApiError) throw error;
      throw new ApiError('Session refresh failed due to a network problem.', {
        code: 'NETWORK_ERROR',
        details: error,
      });
    } finally {
      this.releaseRefreshLock();
    }
  }

  private async acquireRefreshLock(): Promise<boolean> {
    try {
      if (typeof localStorage === 'undefined') return true;
      const key = 'portal_refresh_lock';
      const now = Date.now();
      const existing = localStorage.getItem(key);
      if (existing) {
        const ts = Number(existing);
        // Lock younger than 10s = held by another tab.
        if (Number.isFinite(ts) && now - ts < 10000) return false;
      }
      localStorage.setItem(key, String(now));
      return true;
    } catch {
      return true;
    }
  }

  private releaseRefreshLock(): void {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem('portal_refresh_lock');
    } catch {
      // ignore
    }
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  async logout(): Promise<void> {
    const refreshToken = tokenStore.getRefreshToken();
    const accessToken = tokenStore.getAccessToken();
    // Best-effort revocation with bounded timeout — revocation failure is
    // surfaced in console but never blocks local logout.
    if (refreshToken && accessToken) {
      try {
        await this.client.post<{ message: string }>(
          '/portal/auth/logout',
          { refresh_token: refreshToken },
          { skipAuth: false, timeoutMs: 8000, maxRetries: 0 }
        );
      } catch (err) {
        try {
          console.warn('[prime-portal] Logout revocation failed (local session still cleared).', err);
        } catch {
          // ignore
        }
      }
    }
    this.sessionTermination = { reason: STALE_SESSION_MESSAGE };
    this.clearSession();
    this.broadcastState('logout');
  }

  private clearSession(): void {
    this.pendingCredentials = null;
    this.clearProactiveTimer();
    tokenStore.clearEnvelope();
  }

  // ── Session state ─────────────────────────────────────────────────────────

  getSession(): AuthSession | null {
    const envelope = tokenStore.readEnvelope();
    if (!envelope?.user?.customer_id) return null;
    if (!envelope.access_token) return null;
    // Expiry check: prefer JWT exp claim, fall back to written-at + 30m.
    // A stale token must never flash the portal shell.
    if (isAccessTokenExpired(envelope.access_token)) return null;
    return {
      accessToken: envelope.access_token,
      user: toPortalUser(envelope.user),
      authenticatedAt: new Date().toISOString(),
    };
  }

  isAuthenticated(): boolean {
    if (this.sessionTermination) return false;
    return this.getSession() !== null;
  }

  async getCurrentUser(): Promise<PortalUser | null> {
    return this.getSession()?.user ?? null;
  }

  // ── Proactive refresh (25-minute schedule per the ERP contract) ───────────

  private armProactiveRefresh(): void {
    this.clearProactiveTimer();
    if (this.disposed) return;
    try {
      if (typeof window === 'undefined' || typeof window.setTimeout !== 'function') return;
    } catch {
      return;
    }
    // The ERP live client refreshes 25 minutes after login/refresh
    // (access tokens live ~30 minutes). Also schedule a jittered retry check
    // so a reload at minute 29 still refreshes via expiry check on boot.
    this.refreshTimer = window.setTimeout(() => {
      void this.refreshSession().catch(() => undefined);
    }, 25 * 60 * 1000);
    // Avoid keeping Node processes alive in tests.
    try {
      (this.refreshTimer as unknown as { unref?: () => void }).unref?.();
    } catch {
      // ignore
    }
  }

  private clearProactiveTimer(): void {
    if (this.refreshTimer !== null) {
      try {
        if (typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
          window.clearTimeout(this.refreshTimer);
        } else {
          clearTimeout(this.refreshTimer);
        }
      } catch {
        // ignore
      }
      this.refreshTimer = null;
    }
  }

  // ── Password / account flows ──────────────────────────────────────────────

  async requestPasswordReset(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      throw new AuthError('Please enter your email address.', 'INVALID_CREDENTIALS');
    }
    await this.client.post<{ message: string }>(
      '/portal/auth/forgot-password',
      { email: normalized },
      { skipAuth: true }
    );
  }

  async resetPassword(email: string, code: string, password: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.trim();
    if (!normalizedEmail || !normalizedCode || !password) {
      throw new AuthError('Please fill in email, code and a new password.', 'INVALID_CREDENTIALS');
    }
    assertStrongPassword(password);
    await this.client.post<{ message: string }>(
      '/portal/auth/reset-password',
      { email: normalizedEmail, code: normalizedCode, password },
      { skipAuth: true }
    );
  }

  async activate(customerId: string, code: string, password: string): Promise<AuthSession> {
    const normalizedId = customerId.trim();
    const normalizedCode = code.trim();
    if (!normalizedId || !normalizedCode || !password) {
      throw new AuthError('Please fill in all activation fields.', 'INVALID_CREDENTIALS');
    }
    assertStrongPassword(password);
    const response = await this.client.post<ErpLoginPayload>(
      '/portal/auth/activate',
      { customer_id: normalizedId, code: normalizedCode, password },
      { skipAuth: true }
    );
    return this.establishSession(response);
  }

  /**
   * Authenticated password change — ERP `PUT /portal/profile/password`
   * `{ currentPassword, newPassword }` (Bearer; 30 req/hour rate limit).
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    if (!currentPassword || !newPassword) {
      throw new AuthError('Please fill in both your current and new password.', 'INVALID_CREDENTIALS');
    }
    assertStrongPassword(newPassword);
    if (currentPassword === newPassword) {
      throw new AuthError('New password must be different from the current one.', 'INVALID_CREDENTIALS');
    }
    await this.client.put<{ message: string }>(
      '/portal/profile/password',
      { currentPassword, newPassword },
      { skipAuth: false }
    );
  }

  async register(_input: AuthRegisterInput): Promise<AuthSession> {
    // Disabled: public registration is approval-gated via
    // registrationRequestService. The legacy POST /portal/auth/register
    // endpoint must not establish sessions from the Portal UI.
    throw new AuthError(
      'Direct registration is disabled. Please use Create Account — your request will be reviewed.',
      'INVALID_CREDENTIALS'
    );
  }
}

/** Composes the ERP API base from the environment: `${VITE_API_URL}/api`. */
export function erpApiBaseUrl(): string {
  const apiUrl = env.apiUrl.replace(/\/+$/, '');
  return apiUrl ? `${apiUrl}/api` : '';
}

/** Selects the active auth implementation from the environment configuration. */
export function createAuthService(): AuthService {
  const isProd = (() => {
    try {
      return Boolean((import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD);
    } catch {
      return false;
    }
  })();
  if (isProd && (env.enableMockApi || env.enableMockAuth)) {
    throw new Error('Mock auth/api is forbidden in production builds.');
  }
  if (!env.useRealBackend && env.enableMockAuth) {
    return new MockAuthService();
  }
  return new ErpAuthService(erpApiBaseUrl());
}

/** Application-wide auth service singleton. */
export const authService: AuthService = createAuthService();

/**
 * DEVELOPMENT ONLY — in-memory authentication used exclusively for local UI
 * development when VITE_ENABLE_MOCK_AUTH=true (and VITE_USE_REAL_BACKEND
 * is NOT 'true'). Accepts any non-empty credentials; the produced access
 * token is explicitly marked as a demo token and MUST NOT be treated as a
 * real ERP session.
 */
export class MockAuthService implements AuthService {
  constructor() {
    console.warn(
      '[prime-portal] MockAuthService is active (VITE_ENABLE_MOCK_AUTH=true). DEVELOPMENT ONLY — never enable in production.'
    );
  }

  private buildSession(email: string, options: { customerId?: string; fullName?: string; userId?: string } = {}): AuthSession {
    const user: PortalUser = {
      id: options.userId ?? 'mock_portal_user_001',
      email,
      fullName: options.fullName ?? email,
      customerId: options.customerId ?? 'cust_mock_001',
      roles: ['portal_customer'],
    };
    const session: AuthSession = {
      accessToken: `demo_access_token_${Date.now()}`,
      user,
      authenticatedAt: new Date().toISOString(),
    };
    tokenStore.writeEnvelope({
      access_token: session.accessToken,
      refresh_token: `demo_refresh_${Date.now()}`,
      expires_in: '30m',
      user: { id: user.id, customer_id: user.customerId, email, full_name: user.fullName },
    });
    return session;
  }

  async login(credentials: AuthCredentials): Promise<LoginOutcome> {
    const email = credentials.email.trim().toLowerCase();
    if (!email || !credentials.password) {
      throw new AuthError('Please fill in both email and password.', 'INVALID_CREDENTIALS');
    }
    return { type: 'session', session: this.buildSession(email) };
  }

  async verifyTwoFactor(): Promise<AuthSession> {
    throw new AuthError('Mock auth has no 2FA challenge.', 'INVALID_CREDENTIALS');
  }

  async logout(): Promise<void> {
    tokenStore.clearEnvelope();
  }

  async refreshSession(): Promise<AuthSession | null> {
    return this.getSession();
  }

  async refreshAccessToken(): Promise<string | null> {
    return this.getSession()?.accessToken ?? null;
  }

  getSession(): AuthSession | null {
    const envelope = tokenStore.readEnvelope();
    if (!envelope?.user?.customer_id) return null;
    return {
      accessToken: envelope.access_token,
      user: toPortalUser(envelope.user),
      authenticatedAt: new Date().toISOString(),
    };
  }

  isAuthenticated(): boolean {
    return this.getSession() !== null;
  }

  async getCurrentUser(): Promise<PortalUser | null> {
    return this.getSession()?.user ?? null;
  }

  async register(input: AuthRegisterInput): Promise<AuthSession> {
    if (!input.companyName || !input.email || !input.password) {
      throw new AuthError('Please fill in all required fields.', 'INVALID_CREDENTIALS');
    }
    const email = input.email.trim().toLowerCase();
    return this.buildSession(email, {
      fullName: input.contactName?.trim() || input.companyName.trim(),
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    if (!email.trim()) {
      throw new AuthError('Please enter your email address.', 'INVALID_CREDENTIALS');
    }
  }

  async resetPassword(): Promise<void> {
    // No-op in mock mode.
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    if (!currentPassword || !newPassword) {
      throw new AuthError('Please fill in both your current and new password.', 'INVALID_CREDENTIALS');
    }
    if (newPassword.length < 6) {
      throw new AuthError('New password must be at least 6 characters.', 'INVALID_CREDENTIALS');
    }
    if (currentPassword === newPassword) {
      throw new AuthError('New password must be different from the current one.', 'INVALID_CREDENTIALS');
    }
    // Mock mode is in-memory only — the persisted envelope cannot be
    // re-issued without a new login, and we do not want to silently
    // succeed. Surface the limitation honestly.
    throw new AuthError(
      'Password changes are not persisted in mock auth mode. Sign out and back in to re-issue a session.',
      'UNAVAILABLE'
    );
  }

  async activate(customerId: string, _code: string, _password: string): Promise<AuthSession> {
    const trimmedId = customerId.trim();
    return this.buildSession(`${trimmedId || 'mock'}@example.com`, {
      customerId: trimmedId || 'cust_mock_001',
      fullName: `Mock Customer ${trimmedId || ''}`.trim(),
    });
  }
}

export { ApiError };