/**
 * Prime PORTAL — useAuth
 *
 * React binding over the AuthService singleton. The component tree reads
 * authentication state exclusively from this hook — there is no hardcoded
 * "authenticated" state anywhere in the UI.
 *
 * 2FA: login() returns a LoginOutcome — either a full session or a two-factor
 * challenge. The UI shows the 2FA step and completes with verifyTwoFactor(code).
 *
 * Session expiry: refresh failures dispatch the `portal-session-expired`
 * window event (ERP contract §4.4); this hook listens and clears the session.
 */

import { useCallback, useEffect, useState } from 'react';
import { authService, PORTAL_SESSION_EXPIRED_EVENT } from '../services';
import type { LoginOutcome } from '../services';
import type { AuthCredentials, AuthRegisterInput, AuthSession, PortalUser } from '../types';

export interface UseAuthResult {
  session: AuthSession | null;
  user: PortalUser | null;
  isAuthenticated: boolean;
  /** True while the persisted session is being restored on boot. */
  isRestoring: boolean;
  /** Returns a full session OR a two-factor challenge to complete with verifyTwoFactor. */
  login: (credentials: AuthCredentials) => Promise<LoginOutcome>;
  verifyTwoFactor: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (input: AuthRegisterInput) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, password: string) => Promise<void>;
}

export function useAuth(): UseAuthResult {
  const [session, setSession] = useState<AuthSession | null>(() => authService.getSession());
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    let active = true;
    // If a valid session already exists (e.g. just established by login or
    // already restored by CustomerAuthProvider), trust it immediately instead
    // of starting a redundant refresh. This avoids a race condition where a
    // second refresh call conflicts with in-flight data requests and
    // terminates the session before the data hooks finish loading.
    const existing = authService.getSession();
    if (existing) {
      setSession(existing);
      setIsRestoring(false);
    } else {
      authService
        .refreshSession()
        .then((restored) => {
          if (active) setSession(restored);
        })
        .catch(() => {
          if (active) setSession(null);
        })
        .finally(() => {
          if (active) setIsRestoring(false);
        });
    }
    return () => {
      active = false;
    };
  }, []);

  // The ERP session can die mid-use (refresh failure, revoked token, 2FA
  // re-enrollment). Any service that detects it dispatches this event.
  useEffect(() => {
    const onSessionExpired = () => setSession(null);
    window.addEventListener(PORTAL_SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(PORTAL_SESSION_EXPIRED_EVENT, onSessionExpired);
  }, []);

  const login = useCallback(async (credentials: AuthCredentials) => {
    const outcome = await authService.login(credentials);
    if (outcome.type === 'session') setSession(outcome.session);
    return outcome;
  }, []);

  const verifyTwoFactor = useCallback(async (code: string) => {
    const nextSession = await authService.verifyTwoFactor(code);
    setSession(nextSession);
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setSession(null);
  }, []);

  const register = useCallback(async (input: AuthRegisterInput) => {
    const nextSession = await authService.register(input);
    setSession(nextSession);
  }, []);

  const requestPasswordReset = useCallback((email: string) => authService.requestPasswordReset(email), []);

  const resetPassword = useCallback(
    (email: string, code: string, password: string) => authService.resetPassword(email, code, password),
    []
  );

  return {
    session,
    user: session?.user ?? null,
    isAuthenticated: session !== null,
    isRestoring,
    login,
    verifyTwoFactor,
    logout,
    register,
    requestPasswordReset,
    resetPassword,
  };
}
