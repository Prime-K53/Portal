/**
 * Prime PORTAL — Hash Router Hook
 *
 * Zero-dependency hash-based routing: window.location.hash holds the current
 * route (e.g. "#/invoices"). Works in static hosting and when the Portal is
 * embedded inside the ERP application.
 */

import { useCallback, useEffect, useState } from 'react';

function readHashPath(): string {
  const hash = window.location.hash;
  return hash.startsWith('#') ? hash.slice(1) : hash;
}

export interface HashRoute {
  path: string;
  navigate: (to: string) => void;
}

export function useHashRoute(): HashRoute {
  const [path, setPath] = useState<string>(() => {
    const initial = readHashPath();
    // Boot with no hash → initialize to dashboard instead of flashing a guard redirect.
    if (!initial || initial === '/') {
      try {
        window.location.hash = '/dashboard';
      } catch {
        // ignore
      }
      return '/dashboard';
    }
    return initial;
  });

  useEffect(() => {
    const onHashChange = () => {
      setPath(readHashPath());
      // Router UX: reset scroll + move focus to main for screen readers.
      try {
        window.scrollTo({ top: 0 });
      } catch {
        try {
          window.scrollTo(0, 0);
        } catch {
          // ignore
        }
      }
      try {
        document.querySelector('main')?.setAttribute('tabindex', '-1');
        (document.querySelector('main') as HTMLElement | null)?.focus?.({ preventScroll: true });
      } catch {
        // ignore
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((to: string) => {
    const target = to.startsWith('/') ? to : `/${to}`;
    if (readHashPath() === target) return;
    window.location.hash = target;
  }, []);

  return { path, navigate };
}