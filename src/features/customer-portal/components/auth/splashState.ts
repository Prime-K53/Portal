/**
 * Prime PORTAL — Splash state bridge
 *
 * Lets unauthenticated auth screens request the top-level brand splash
 * without prop-drilling through RouteGuard / CustomerPortalShell.
 */

type SplashListener = (visible: boolean) => void;

const listeners = new Set<SplashListener>();

export function setSplashVisible(visible: boolean): void {
  listeners.forEach((listener) => listener(visible));
}

export function onSplashChange(listener: SplashListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
