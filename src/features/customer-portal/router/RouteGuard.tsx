/**
 * Prime PORTAL — Route Guards
 *
 * Protected-route architecture: unauthenticated users always reach the login
 * screen; authenticated users reach the Portal shell. Authentication state
 * comes exclusively from the AuthService — guards can never be bypassed by
 * fake/hardcoded sessions.
 */

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { isAuthOnlyRoute, isPublicRoute, tabFromPath } from './routes';
import { LoadingState } from '../components/state/PortalDataBoundary';

interface RouteGuardProps {
  path: string;
  navigate: (to: string) => void;
  isAuthenticated: boolean;
  isRestoring: boolean;
  /** Route to land on when the hash is empty or unknown. */
  defaultPath: string;
  children: ReactNode;
  onUnauthenticated: () => ReactNode;
  /** Max ms to show restoring spinner before offering escape. Default 15000. */
  restoreTimeoutMs?: number;
  /** Called when session restore times out (e.g. force logout). */
  onRestoreTimeout?: () => void;
}

const POST_LOGIN_REDIRECT_KEY = 'portal_post_login_redirect';

export function rememberPostLoginRedirect(path: string): void {
  try {
    // Only remember deep links to real tabs — never auth screens.
    if (tabFromPath(path) && !isPublicRoute(path)) {
      sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, path);
    }
  } catch {
    // ignore
  }
}

export function consumePostLoginRedirect(): string | null {
  try {
    const stored = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
    sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    return stored;
  } catch {
    return null;
  }
}

export function RouteGuard({
  path,
  navigate,
  isAuthenticated,
  isRestoring,
  defaultPath,
  children,
  onUnauthenticated,
  restoreTimeoutMs = 15000,
  onRestoreTimeout,
}: RouteGuardProps) {
  const [restoreTimedOut, setRestoreTimedOut] = useState(false);

  useEffect(() => {
    if (!isRestoring) {
      setRestoreTimedOut(false);
      return;
    }
    setRestoreTimedOut(false);
    const timer = setTimeout(() => setRestoreTimedOut(true), restoreTimeoutMs);
    return () => clearTimeout(timer);
  }, [isRestoring, restoreTimeoutMs]);

  // Remember deep links while logged out so post-login can return there.
  useEffect(() => {
    if (!isRestoring && !isAuthenticated && tabFromPath(path) && !isPublicRoute(path)) {
      rememberPostLoginRedirect(path);
    }
  }, [path, isAuthenticated, isRestoring]);

  useEffect(() => {
    if (isRestoring || !isAuthenticated) return;
    // Authenticated users on auth-only screens go to their deep link or default.
    if (isAuthOnlyRoute(path)) {
      const redirect = consumePostLoginRedirect();
      navigate(redirect ?? defaultPath);
      return;
    }
    // Empty hash → default (no flash: navigate once).
    if (!path || path === '/') {
      navigate(defaultPath);
    }
    // Unknown non-public non-tab paths render 404 below — never silently hijack.
  }, [path, isAuthenticated, isRestoring, defaultPath, navigate]);

  // Accessibility: announce route changes + set title per tab.
  useEffect(() => {
    try {
      const tab = tabFromPath(path);
      document.title = tab ? `Prime Portal — ${tab[0].toUpperCase()}${tab.slice(1)}` : 'Prime Portal';
    } catch {
      // ignore
    }
  }, [path]);

  if (isRestoring) {
    if (restoreTimedOut) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
          <div className="max-w-sm w-full text-center space-y-4 p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Session restore is taking too long</p>
            <p className="text-xs text-slate-500">Check your connection, then retry or return to sign in.</p>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    sessionStorage.removeItem('portal_session');
                  } catch {
                    // ignore
                  }
                  onRestoreTimeout?.();
                  navigate('/login');
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700"
              >
                Sign in
              </button>
            </div>
          </div>
        </div>
      );
    }
    return <LoadingState label="Restoring your session..." fullScreen />;
  }

  if (!isAuthenticated) {
    return <>{onUnauthenticated()}</>;
  }

  const isKnown = Boolean(tabFromPath(path)) || isPublicRoute(path) || !path || path === '/';
  if (!isKnown) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" role="alert">
        <div className="max-w-sm w-full text-center space-y-4 p-6 bg-white dark:bg-slate-900 rounded-2xl border">
          <p className="text-sm font-semibold">Page not found</p>
          <p className="text-xs text-slate-500 break-all">{path}</p>
          <button
            type="button"
            onClick={() => navigate(defaultPath)}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}