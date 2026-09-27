import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { XCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastIdCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const toast = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = `toast_${++toastIdCounter}_${Date.now()}`;
      setToasts((prev) => [...prev, { ...t, id }]);
      const duration = t.duration ?? 4000;
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss, dismissAll }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toasts: [],
      toast: () => {},
      dismiss: () => {},
      dismissAll: () => {},
    };
  }
  return ctx;
}

const toastIcons: Record<ToastType, React.FC<{ className?: string }>> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const toastColors: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-600' },
  error: { bg: 'bg-rose-50', border: 'border-rose-200', icon: 'text-rose-600' },
  info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-600' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'text-amber-600' },
};

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[9999] space-y-2 max-w-sm w-full pointer-events-none"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => {
        const Icon = toastIcons[t.type];
        const colors = toastColors[t.type];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto ${colors.bg} border ${colors.border} rounded-xl p-4 shadow-lg flex items-start gap-3 animate-slide-in-right`}
            role="status"
          >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${colors.icon}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900">{t.title}</p>
              {t.description && (
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{t.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="shrink-0 text-slate-400 hover:text-slate-600 transition"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
