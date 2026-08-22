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
  register(input: AuthRegisterInput): Promise<AuthSession>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(email: string, code: string, password: string): Promise<void>;
  activate(customerId: string, code: string, password: string): Promise<AuthSession>;
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

export class ErpAuthService implements AuthService {
  private readonly client: ApiClient;
  /** Pending credentials held in memory between the login step and the 2FA step. */
  private pendingCredentials: { email: string; password: string } | null = null;
  /** Single-flight refresh lock — concurrent 401s share ONE rotation call. */
  private refreshInFlight: Promise<AuthSession | null> | null = null;
  /** Proactive refresh timer (ERP client refreshes at 25 minutes). */
  private refreshTimer: number | null = null;
  private disposed = false;
  /**
   * Set exactly once when recovery concludes the session is unrecoverable.
   * While set, the shared API client's requestGate fails new requests with
   * this reason instead of sending headerless/secondary requests.
   */
  private sessionTermination: { reason: string } | null = null;

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
    dispatchSessionExpired();
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
      this.pendingCredentials = { email, password: credentials.password };
      return { type: 'two_factor', user: response.user };
    }

    return { type: 'session', session: this.establishSession(response) };
  }

  async verifyTwoFactor(code: string): Promise<AuthSession> {
    const pending = this.pendingCredentials;
    if (!pending) {
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
    if (!refreshToken) return null;

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
      this.armProactiveRefresh();

      const session: AuthSession = {
        accessToken: response.access_token,
        user: toPortalUser(previousUser),
        authenticatedAt: new Date().toISOString(),
      };
      return session;
    } catch (error) {
      // Classify BEFORE clearing so the UI can tell a genuinely stale session
      // apart from a transient recovery problem.
      const authRejected =
        error instanceof ApiError &&
        error.status !== null &&
        error.status >= 400 &&
        error.status < 500;
      this.terminateSession(authRejected ? STALE_SESSION_MESSAGE : UNRECOVERABLE_SESSION_MESSAGE);
      return null;
    }
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  async logout(): Promise<void> {
    const refreshToken = tokenStore.getRefreshToken();
    const accessToken = tokenStore.getAccessToken();
    // Fire-and-forget session revocation (matches the ERP client behavior).
    if (refreshToken && accessToken) {
      try {
        await this.client.post<{ message: string }>(
          '/portal/auth/logout',
          { refresh_token: refreshToken },
          { skipAuth: false }
        );
      } catch {
        // Local logout proceeds even when the ERP is unreachable.
      }
    }
    this.clearSession();
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

  // ── Proactive refresh (25-minute schedule per the ERP contract) ───────────

  private armProactiveRefresh(): void {
    this.clearProactiveTimer();
    // The ERP live client refreshes 25 minutes after login/refresh
    // (access tokens live ~30 minutes).
    this.refreshTimer = window.setTimeout(() => {
      void this.refreshSession();
    }, 25 * 60 * 1000);
  }

  private clearProactiveTimer(): void {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // ── Password / account flows ──────────────────────────────────────────────

  async requestPasswordReset(email: string): Promise<void> {
    if (!email.trim()) {
      throw new AuthError('Please enter your email address.', 'INVALID_CREDENTIALS');
    }
    await this.client.post<{ message: string }>(
      '/portal/auth/forgot-password',
      { email: email.trim() },
      { skipAuth: true }
    );
  }

  async resetPassword(email: string, code: string, password: string): Promise<void> {
    await this.client.post<{ message: string }>(
      '/portal/auth/reset-password',
      { email, code, password },
      { skipAuth: true }
    );
  }

  async activate(customerId: string, code: string, password: string): Promise<AuthSession> {
    const response = await this.client.post<ErpLoginPayload>(
      '/portal/auth/activate',
      { customer_id: customerId, code, password },
      { skipAuth: true }
    );
    return this.establishSession(response);
  }

  register(): Promise<AuthSession> {
    throw new AuthError(
      'Portal self-registration is not available: the ERP creates customer accounts by invitation. Contact PrimeERP support to activate your account.',
      'UNAVAILABLE'
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

  private buildSession(email: string): AuthSession {
    const user: PortalUser = {
      id: 'mock_portal_user_001',
      email,
      fullName: 'Mock Portal Customer',
      customerId: 'cust_mock_001',
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
    return { type: 'session', session: this.buildSession(input.email) }.session;
  }

  async requestPasswordReset(email: string): Promise<void> {
    if (!email.trim()) {
      throw new AuthError('Please enter your email address.', 'INVALID_CREDENTIALS');
    }
  }

  async resetPassword(): Promise<void> {
    // No-op in mock mode.
  }

  async activate(): Promise<AuthSession> {
    return this.buildSession('mock@example.com');
  }
}

export { ApiError };