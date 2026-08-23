import { useCallback, useEffect, useState } from 'react';
import {
  BeforeInstallPromptEvent,
  clearCapturedInstallPrompt,
  getCapturedInstallPrompt,
  isStandaloneDisplay,
  watchInstallCapability,
} from '../pwa/pwa';

const DISMISS_KEY = 'pwa-install-dismissed-at';
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // re-offer after a week

function wasRecentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return at > 0 && Date.now() - at < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ }
}

export interface PwaInstallState {
  /** The browser can install the app right now (beforeinstallprompt captured). */
  canInstall: boolean;
  /** Already running as an installed/standalone app. */
  installed: boolean;
  /** True while the native prompt is open. */
  prompting: boolean;
  /** Outcome of the last prompt attempt ('accepted' | 'dismissed' | 'error'). */
  outcome: 'accepted' | 'dismissed' | 'error' | null;
  /** Whether the chip should be visible. */
  shouldOffer: boolean;
  promptInstall: () => Promise<void>;
  dismiss: () => void;
}

/**
 * Captures the browser install capability and exposes a controlled
 * promptInstall(). The offer is suppressed when already installed/standalone
 * or recently dismissed by the user.
 */
export function usePwaInstall(): PwaInstallState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(() => getCapturedInstallPrompt());
  const [installed, setInstalled] = useState<boolean>(() => isStandaloneDisplay());
  const [prompting, setPrompting] = useState(false);
  const [outcome, setOutcome] = useState<PwaInstallState['outcome']>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(() =>
    wasRecentlyDismissed() ? Date.now() : null
  );

  useEffect(() => {
    // Pick up any prompt that arrived between initial render and this effect.
    const captured = getCapturedInstallPrompt();
    if (captured) {
      setDeferred(captured);
      clearCapturedInstallPrompt();
    }
    return watchInstallCapability({
      onAvailable: (event) => {
        clearCapturedInstallPrompt();
        setDeferred(event);
      },
      onInstalled: () => {
        setInstalled(true);
        setDeferred(null);
        clearCapturedInstallPrompt();
        markDismissed();
      },
      onStandaloneChange: (standalone) => {
        if (standalone) setInstalled(true);
      },
    });
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return;
    setPrompting(true);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setOutcome(choice.outcome);
      if (choice.outcome === 'accepted') markDismissed();
      // The event is single-use per browser spec.
      setDeferred(null);
      clearCapturedInstallPrompt();
    } catch {
      setOutcome('error');
    } finally {
      setPrompting(false);
    }
  }, [deferred]);

  const dismiss = useCallback(() => {
    markDismissed();
    setDismissedAt(Date.now());
  }, []);

  const canInstall = Boolean(deferred);
  const shouldOffer =
    !installed && !prompting && (canInstall ? !(dismissedAt && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) : false);

  return { canInstall, installed, prompting, outcome, shouldOffer, promptInstall, dismiss };
}
