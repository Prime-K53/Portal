/**
 * Prime PORTAL — Customer Auth Context
 *
 * React context over the verified ERP auth service. Exposes the page-level
 * API used by CustomerLogin / CustomerActivate / CustomerForgotPassword:
 *
 *   loginWithApi(email, password, twoFactorCode?) → LoginResult
 *   activateAccount(customerId, code, password)   → PortalUser
 *   requestPasswordReset(email)                   → void
 *   logout()                                      → void
 *
 * Session management (sessionStorage envelope `portal_session`, 25-minute
 * proactive token refresh, portal-session-expired event handling) is owned by
 * the ErpAuthService singleton — this context mirrors its state into React.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  authService,
  AuthError,
  PORTAL_SESSION_EXPIRED_EVENT,
} from '../../services/authService';
import type { PortalUser } from '../../types';

/** Result of a login attempt — `requiresTwoFactor` swaps the login form for the 2FA form. */
export interface LoginResult {
  requiresTwoFactor: boolean;
  /** Truthy marker while a 2FA challenge is pending (the ERP issues no real token here). */
  pendingToken?: string | null;
}

export interface CustomerAuthContextValue {
  user: PortalUser | null;
  isAuthenticated: boolean;
  /** True while the persisted session is being restored on boot. */
  isRestoring: boolean;
  loginWithApi: (email: string, password: string, twoFactorCode?: string) => Promise<LoginResult>;
  activateAccount: (customerId: string, code: string, password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

function toMessage(error: unknown): string {
  if (error instanceof AuthError) return error.message;
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PortalUser | null>(() => authService.getSession()?.user ?? null);
  const [isRestoring, setIsRestoring] = useState(true);

  // Session validation on load: rotate any stored session through the server.
  useEffect(() => {
    let active = true;
    authService
      .refreshSession()
      .then((restored) => {
        if (active) setUser(restored?.user ?? null);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setIsRestoring(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Expired/revoked sessions (refresh failure mid-use) force logout in the UI.
  useEffect(() => {
    const onSessionExpired = () => setUser(null);
    window.addEventListener(PORTAL_SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(PORTAL_SESSION_EXPIRED_EVENT, onSessionExpired);
  }, []);

  const syncFromStore = useCallback(() => {
    setUser(authService.getSession()?.user ?? null);
  }, []);

  const loginWithApi = useCallback(
    async (email: string, password: string, twoFactorCode?: string): Promise<LoginResult> => {
      if (twoFactorCode) {
        await authService.verifyTwoFactor(twoFactorCode);
        syncFromStore();
        return { requiresTwoFactor: false };
      }
      const outcome = await authService.login({ email, password, rememberMe: true });
      if (outcome.type === 'two_factor') {
        return { requiresTwoFactor: true, pendingToken: 'pending' };
      }
      setUser(outcome.session.user);
      return { requiresTwoFactor: false };
    },
    [syncFromStore]
  );

  const activateAccount = useCallback(
    async (customerId: string, code: string, password: string): Promise<void> => {
      await authService.activate(customerId.trim(), code.trim(), password);
      syncFromStore();
    },
    [syncFromStore]
  );

  const requestPasswordReset = useCallback(async (email: string): Promise<void> => {
    await authService.requestPasswordReset(email);
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    await authService.logout();
    setUser(null);
  }, []);

  const value = useMemo<CustomerAuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isRestoring,
      loginWithApi,
      activateAccount,
      requestPasswordReset,
      logout,
    }),
    [user, isRestoring, loginWithApi, activateAccount, requestPasswordReset, logout]
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth(): CustomerAuthContextValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth must be used within a CustomerAuthProvider');
  return ctx;
}

export { toMessage as authErrorMessage };
