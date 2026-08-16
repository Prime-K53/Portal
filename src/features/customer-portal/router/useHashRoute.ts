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
  const [path, setPath] = useState<string>(readHashPath);

  useEffect(() => {
    const onHashChange = () => setPath(readHashPath());
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