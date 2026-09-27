import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  /** Server correlation ID so support can trace the failure. */
  correlationId?: string | null;
  onDismiss?: () => void;
  onRetry?: () => void;
  className?: string;
}

/**
 * Shared top-of-page action-error banner: announced assertively, shows the
 * server correlation ID when present, with optional retry + dismiss.
 */
export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  message,
  correlationId,
  onDismiss,
  onRetry,
  className = '',
}) => {
  return (
    <div className={`max-w-7xl w-full mx-auto px-3 sm:px-4 lg:px-6 pt-4 ${className}`}>
      <div
        role="alert"
        aria-live="assertive"
        className="flex items-start gap-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700"
      >
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-relaxed">{message}</p>
          {correlationId && (
            <p className="mt-0.5 font-mono text-[11px] text-rose-500">Ref: {correlationId}</p>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-1.5 min-h-[44px] text-xs font-extrabold text-rose-700 hover:text-rose-900 underline underline-offset-2"
            >
              Try Again
            </button>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-rose-400 hover:text-rose-600 font-black shrink-0"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
