/**
 * Prime PORTAL — Customer Forgot Password
 *
 * Email-only reset flow in the same mint visual family as CustomerLogin. On a
 * successful send it shows an inline success state plus a toast notification;
 * the server never reveals whether the address exists.
 */

import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { useHashRoute } from '../../router/useHashRoute';
import { ROUTES } from '../../router/routes';
import { authErrorMessage, useCustomerAuth } from './CustomerAuthContext';
import {
  AuthError,
  AuthHeading,
  AuthMintShell,
  authInputClass,
  authPrimaryButtonClass,
} from './authTheme';

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
    <AuthMintShell>
      {!submitted ? (
        <>
          <AuthHeading
            lead="Forgot"
            accent="Password"
            description="Enter your registered email and we'll send you password reset instructions."
          />

          {error && <AuthError error={error} onDismiss={() => setError(null)} />}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="forgot-email"
                className="mb-1.5 block text-[13px] font-semibold text-slate-900"
              >
                Email Address
              </label>
              <input
                id="forgot-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="quality@prime.mw"
                className={authInputClass}
              />
            </div>

            <button type="submit" disabled={submitting} className={authPrimaryButtonClass}>
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

          {/* Auxiliary navigation */}
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => navigate(ROUTES.login)}
              className="flex min-h-[44px] items-center gap-1.5 text-[13px] font-semibold text-slate-500 hover:text-slate-800 transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Sign In
            </button>
          </div>
        </>
      ) : (
        /* Success state — single primary action (no duplicate footer link). */
        <div className="mt-8 space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-emerald-200 bg-emerald-50">
            <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-[28px] font-extrabold tracking-tight text-slate-900">
              Check Your <span className="text-[#2563eb]">Email</span>
            </h2>
            <p className="text-[14px] font-medium leading-relaxed text-slate-500">
              If an account exists for <strong className="text-slate-700">{email}</strong>, we&apos;ve sent password
              reset instructions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(ROUTES.login)}
            className={`${authPrimaryButtonClass} mt-2`}
          >
            Back to Sign In
          </button>
        </div>
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </AuthMintShell>
  );
}

export default CustomerForgotPassword;
