/**
 * Prime PORTAL — Loading / Error / Empty State Components
 *
 * Every production data screen renders through PortalDataBoundary so it can
 * represent: loading, successful data, empty data, authentication failure,
 * authorization failure, network failure and server error. API failures are
 * NEVER silently replaced with mock data.
 */

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { AlertTriangle, Inbox, Loader2, Lock, RefreshCcw, WifiOff } from 'lucide-react';
import { ApiError } from '../../services/apiClient';
import { AuthError, PORTAL_SESSION_EXPIRED_EVENT } from '../../services/authService';
import { isMockModeActive } from '../../config/env';

/**
 * True once the auth layer has broadcast `portal-session-expired` — i.e. the
 * session is being torn down and the route guard is about to redirect to the
 * login screen. Data boundaries use this to avoid painting a misleading,
 * persistent "session expired" error card over that transition.
 */
function useSessionExpiring(): boolean {
  const [expiring, setExpiring] = useState(false);
  useEffect(() => {
    const onExpired = () => setExpiring(true);
    window.addEventListener(PORTAL_SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(PORTAL_SESSION_EXPIRED_EVENT, onExpired);
  }, []);
  return expiring;
}

function resolveErrorMessage(error: unknown): { message: string; kind: 'auth' | 'network' | 'forbidden' | 'notConfigured' | 'unknown' } {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'UNAUTHORIZED':
        return { message: 'Your session has expired or is invalid. Please sign in again.', kind: 'auth' };
      case 'FORBIDDEN':
        return { message: 'You do not have permission to view this data.', kind: 'forbidden' };
      case 'NOT_CONFIGURED':
        return { message: error.message, kind: 'notConfigured' };
      case 'NETWORK_ERROR':
      case 'TIMEOUT':
        return { message: error.message, kind: 'network' };
      default:
        return { message: error.message || 'The server reported an error.', kind: 'unknown' };
    }
  }
  if (error instanceof AuthError) {
    return { message: error.message, kind: 'auth' };
  }
  return {
    message: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
    kind: 'unknown',
  };
}

export function LoadingState({ label = 'Loading...', fullScreen = false }: { label?: string; fullScreen?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-slate-500 ${
        fullScreen ? 'min-h-screen bg-slate-100/70' : 'py-16'
      }`}
    >
      <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
      <p className="text-xs font-semibold tracking-wide">{label}</p>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="p-3 rounded-2xl bg-slate-100 border border-slate-200">
        <Inbox className="w-6 h-6 text-slate-400" />
      </div>
      <h3 className="text-sm font-extrabold text-slate-700">{title}</h3>
      {description && <p className="text-xs text-slate-500 max-w-sm leading-relaxed">{description}</p>}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  fullScreen = false,
}: {
  error: unknown;
  onRetry?: () => void;
  fullScreen?: boolean;
}) {
  const { message, kind } = resolveErrorMessage(error);
  const sessionExpiring = useSessionExpiring();

  // The session was intentionally torn down and the guard is redirecting to
  // sign-in — show a neutral transition instead of a stale data-error card.
  if (sessionExpiring && (kind === 'auth' || kind === 'forbidden')) {
    return <LoadingState label="Signing you out..." fullScreen={fullScreen} />;
  }

  const Icon = kind === 'network' ? WifiOff : kind === 'auth' || kind === 'forbidden' ? Lock : AlertTriangle;
  const iconClass =
    kind === 'network' ? 'text-rose-500 bg-rose-50 border-rose-100'
    : kind === 'auth' || kind === 'forbidden' ? 'text-amber-600 bg-amber-50 border-amber-100'
    : 'text-amber-600 bg-amber-50 border-amber-100';

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-16 px-4 text-center ${
        fullScreen ? 'min-h-screen bg-slate-100/70' : ''
      }`}
    >
      <div className={`p-3 rounded-2xl border ${iconClass}`}>
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-extrabold text-slate-700">Unable to load this data</h3>
      <p className="text-xs text-slate-500 max-w-md leading-relaxed">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold rounded-xl transition"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          Try Again
        </button>
      )}
      {isMockModeActive() && kind === 'notConfigured' && (
        <p className="text-[11.5px] text-slate-400 max-w-md leading-relaxed">
          Development note: start the dev server with VITE_ENABLE_MOCK_API=true (and VITE_ENABLE_MOCK_AUTH=true) to
          preview with sample data.
        </p>
      )}
    </div>
  );
}

export interface PortalDataBoundaryProps {
  isLoading: boolean;
  error: unknown;
  /** When true, renders the empty state (only when there is no error). */
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
  /** Optional skeleton component to render during initial load (full-screen layout skeleton
   *  instead of the generic spinner). */
  skeleton?: ReactNode;
  children: ReactNode;
}

/**
 * Skeleton block that mimics the dashboard layout during initial data load.
 * Uses rounded pulse bars instead of spinners for a less jarring transition.
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading dashboard">
      {/* Header bar */}
      <div className="h-8 w-48 rounded-xl bg-slate-200" />
      {/* KPI cards row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-slate-100 border border-slate-200 p-4 flex flex-col gap-2">
            <div className="h-3 w-16 rounded-full bg-slate-200" />
            <div className="h-5 w-20 rounded-full bg-slate-200" />
          </div>
        ))}
      </div>
      {/* Chart area */}
      <div className="h-56 rounded-2xl bg-slate-100 border border-slate-200" />
      {/* Bottom 2-col grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="h-48 rounded-2xl bg-slate-100 border border-slate-200" />
        <div className="h-48 rounded-2xl bg-slate-100 border border-slate-200" />
      </div>
    </div>
  );
}

/**
 * Wraps a production data screen and renders the appropriate state:
 * loading (skeleton or spinner) → error → empty → content.
 */
export function PortalDataBoundary({
  isLoading,
  error,
  isEmpty = false,
  emptyTitle = 'No data available',
  emptyDescription,
  onRetry,
  skeleton,
  children,
}: PortalDataBoundaryProps) {
  if (isLoading) return skeleton ? <>{skeleton}</> : <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (isEmpty) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return <>{children}</>;
}

export interface CombinedQueryState {
  isLoading: boolean;
  error: unknown;
}

/** Merges several query results into a single boundary state. */
export function combineQueryStates(queries: Array<{ isLoading: boolean; error: unknown }>): CombinedQueryState {
  return {
    isLoading: queries.some((q) => q.isLoading),
    error: queries.find((q) => q.error)?.error ?? null,
  };
}