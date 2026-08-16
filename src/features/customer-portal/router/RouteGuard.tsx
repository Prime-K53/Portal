/**
 * Prime PORTAL — Route Guards
 *
 * Protected-route architecture: unauthenticated users always reach the login
 * screen; authenticated users reach the Portal shell. Authentication state
 * comes exclusively from the AuthService — guards can never be bypassed by
 * fake/hardcoded sessions.
 */

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { isPublicRoute, tabFromPath } from './routes';
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
}

export function RouteGuard({
  path,
  navigate,
  isAuthenticated,
  isRestoring,
  defaultPath,
  children,
  onUnauthenticated,
}: RouteGuardProps) {
  useEffect(() => {
    if (isRestoring || !isAuthenticated) return;
    if (!tabFromPath(path) || isPublicRoute(path)) {
      navigate(defaultPath);
    }
  }, [path, isAuthenticated, isRestoring, defaultPath, navigate]);

  if (isRestoring) {
    return <LoadingState label="Restoring your session..." fullScreen />;
  }

  if (!isAuthenticated) {
    return <>{onUnauthenticated()}</>;
  }

  return <>{children}</>;
}