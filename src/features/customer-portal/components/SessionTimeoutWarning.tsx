import React, { useState, useEffect, useCallback } from 'react';
import { LogOut, Clock } from 'lucide-react';
import { useToast } from './ui/Toast';

const SESSION_TIMEOUT_MS = 25 * 60 * 1000;
const WARNING_BEFORE_MS = 2 * 60 * 1000;

export function SessionTimeoutWarning() {
  const [remaining, setRemaining] = useState(SESSION_TIMEOUT_MS);
  const [showWarning, setShowWarning] = useState(false);
  const { toast } = useToast();

  const resetTimer = useCallback(() => {
    setRemaining(SESSION_TIMEOUT_MS);
    setShowWarning(false);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1000;
        if (next <= WARNING_BEFORE_MS && next > 0) {
          setShowWarning(true);
        }
        if (next <= 0) {
          clearInterval(interval);
          toast({
            type: 'warning',
            title: 'Session expired',
            description: 'You have been signed out due to inactivity.',
            duration: 0,
          });
          try {
            sessionStorage.removeItem('portal_session');
          } catch {
            // ignore
          }
          window.location.hash = '/login';
          return 0;
        }
        return next;
      });
    }, 1000);

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    const handler = resetTimer;
    events.forEach((e) => window.addEventListener(e, handler));

    return () => {
      clearInterval(interval);
      events.forEach((e) => window.removeEventListener(e, handler));
    };
  }, [resetTimer, toast]);

  if (!showWarning) return null;

  const minutes = Math.ceil(remaining / 60000);
  const seconds = Math.ceil((remaining % 60000) / 1000);

  return (
    <div
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[8000] bg-white border border-amber-200 rounded-2xl shadow-xl p-4 max-w-xs w-full mx-4 animate-fade-in"
      role="alertdialog"
      aria-label="Session timeout warning"
    >
      <div className="flex items-start gap-3">
        <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900">Session expiring soon</p>
          <p className="text-xs text-slate-500 mt-1">
            Your session will expire in {minutes}m {seconds}s. Move your mouse or tap to stay signed in.
          </p>
        </div>
      </div>
    </div>
  );
}