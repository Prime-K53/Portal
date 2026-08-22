/**
 * Prime PORTAL — Customer Forgot Password
 *
 * Email-only reset flow in the same visual family as CustomerLogin. On a
 * successful send it shows an inline success state plus a toast notification;
 * the server never reveals whether the address exists.
 */

import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, Lock, Mail } from 'lucide-react';
import { useHashRoute } from '../../router/useHashRoute';
import { ROUTES } from '../../router/routes';
import { authErrorMessage, useCustomerAuth } from './CustomerAuthContext';
import { AuthShell } from './AuthShell';

const inputClass =
  'w-full h-11 pl-10 pr-4 bg-slate-50/80 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500/60 transition';

const buttonClass =
  'w-full h-11 rounded-xl bg-gradient-to-r from-[#146b60] to-[#0f544c] text-white text-sm font-bold shadow-lg shadow-teal-900/30 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 transition-all';

/** Minimal self-contained toast — auto-dismisses after 4 seconds. */
function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 4000);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 px-4 animate-fade-in">
      <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-xl">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        <p className="text-xs font-semibold text-emerald-800">{message}</p>
      </div>
    </div>
  );
}

export function CustomerForgotPassword() {
  const { requestPasswordReset } = useCustomerAuth();
  const { navigate } = useHashRoute();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const addToast = (_type: 'success', message: string) => setToast(message);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your registered email address.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setSubmitted(true);
      addToast('success', 'Password reset instructions sent.');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      {/* Brand header */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#146b60] to-[#0f544c] shadow-lg shadow-teal-900/30">
          <Lock className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-black tracking-tight text-slate-900">
            Prime<span className="text-amber-500">PORTAL</span>
          </h1>
          <p className="text-xs font-medium text-slate-500">Customer Portal</p>
        </div>
      </div>

      {!submitted ? (
        <>
          <div className="mt-6 space-y-1">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Forgot Password</h2>
            <p className="text-xs font-medium leading-relaxed text-slate-500">
              Enter your registered email and we'll send you password reset instructions.
            </p>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium leading-relaxed text-rose-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="forgot-email" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                Email Address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="forgot-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="accounts@company.mw"
                  className={inputClass}
                />
              </div>
            </div>

            <button type="submit" disabled={submitting} className={buttonClass}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <span>Send Reset Instructions</span>
              )}
            </button>
          </form>
        </>
      ) : (
        /* Success state */
        <div className="mt-8 space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-emerald-200 bg-emerald-50">
            <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Check Your Email</h2>
            <p className="text-xs font-medium leading-relaxed text-slate-500">
              If an account exists for <strong className="text-slate-700">{email}</strong>, we've sent password
              reset instructions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(ROUTES.login)}
            className={`${buttonClass} mt-2`}
          >
            Back to Sign In
          </button>
        </div>
      )}

      {/* Auxiliary navigation */}
      <div className="mt-6 border-t border-slate-100 pt-5">
        <button
          type="button"
          onClick={() => navigate(ROUTES.login)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-teal-800 transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Sign In
        </button>
      </div>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </AuthShell>
  );
}

export default CustomerForgotPassword;
