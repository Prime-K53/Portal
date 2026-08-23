/**
 * PWA plumbing: service-worker registration + install capability.
 *
 * The service worker is registered ONLY in production builds — dev server
 * HMR and the SW cache would fight each other during development.
 */

/** True when the app is running as an installed/standalone PWA. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    nav.standalone === true
  );
}

export function isServiceWorkerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/** Registers /sw.js in production builds. Safe to call multiple times. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !isServiceWorkerSupported()) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      // Non-fatal: the app keeps working as a normal web page.
      console.warn('[PWA] Service worker registration failed:', err);
    });
  });
}

/** Minimal shape of the non-standard beforeinstallprompt event. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/**
 * Module-scope capture of the deferred install prompt.
 *
 * beforeinstallprompt is single-use per page load and can fire BEFORE React
 * mounts (and therefore before any useEffect subscribes). Without this early
 * capture the event would be lost and an install offer would never show.
 * Registered as soon as this module is evaluated — import it from main.tsx.
 */
let capturedInstallPrompt: BeforeInstallPromptEvent | null = null;

export function getCapturedInstallPrompt(): BeforeInstallPromptEvent | null {
  return capturedInstallPrompt;
}

export function clearCapturedInstallPrompt(): void {
  capturedInstallPrompt = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep our own UI in control of the prompt
    capturedInstallPrompt = e as BeforeInstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    capturedInstallPrompt = null;
  });
}

/**
 * Subscribes to install-capability events.
 * Returns an unsubscribe function.
 */
export function watchInstallCapability(handlers: {
  onAvailable: (event: BeforeInstallPromptEvent) => void;
  onInstalled: () => void;
  onStandaloneChange?: (standalone: boolean) => void;
}): () => void {
  const onBeforeInstall = (e: Event) => {
    e.preventDefault(); // keep our own UI in control of the prompt
    handlers.onAvailable(e as BeforeInstallPromptEvent);
  };
  const onInstalled = () => handlers.onInstalled();
  window.addEventListener('beforeinstallprompt', onBeforeInstall);
  window.addEventListener('appinstalled', onInstalled);

  let mql: MediaQueryList | undefined;
  const onMqlChange = () => handlers.onStandaloneChange?.(isStandaloneDisplay());
  if (typeof window.matchMedia === 'function') {
    mql = window.matchMedia('(display-mode: standalone)');
    mql.addEventListener?.('change', onMqlChange);
    if (isStandaloneDisplay()) handlers.onStandaloneChange?.(true);
  }

  return () => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    window.removeEventListener('appinstalled', onInstalled);
    mql?.removeEventListener?.('change', onMqlChange);
  };
}
