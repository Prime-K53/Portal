/**
 * Prime PORTAL — Dev Mode Banner
 *
 * Persistent ribbon shown when the in-memory mock services are active so a
 * developer can never mistake mock data for real ERP data. Rendered above
 * the portal shell, never inside the auth screens (those are reachable in
 * mock mode too, and the banner is equally useful there).
 */

import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { isMockModeActive } from '../config/env';

const STORAGE_KEY = 'portal-dev-banner-dismissed';

export function DevModeBanner(): React.ReactElement | null {
  const [dismissed, setDismissed] = React.useState<boolean>(() => {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (!isMockModeActive() || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-2 bg-amber-500 text-slate-950 px-3 py-1.5 text-[11.5px] font-bold border-b border-amber-600"
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">
          Development mode — mock services are active. Data shown is sample only; no live ERP connection.
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          try {
            window.sessionStorage.setItem(STORAGE_KEY, '1');
          } catch {
            /* private mode — ignore */
          }
          setDismissed(true);
        }}
        className="p-0.5 rounded hover:bg-amber-600/40 text-slate-950"
        aria-label="Dismiss dev mode banner"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
