import { useEffect, useState } from 'react';

const STORAGE_KEY = 'prime-portal-dark-mode';

/**
 * Manages dark mode preference.
 * - Reads `prefers-color-scheme` on first visit (no stored preference).
 * - Persists user choice in localStorage.
 * - Syncs `html` class and `document.documentElement` class immediately
 *   on mount to avoid flash of wrong theme.
 */
export function useDarkMode() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    // SSR guard.
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEY, String(isDark));
  }, [isDark]);

  // Listen for OS-level preference changes only when the user hasn't set a preference.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return; // user has a preference — don't override
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggle = () => setIsDark((prev) => !prev);
  return { isDark, toggle };
}
