/**
 * Prime PORTAL — Customer Login
 *
 * Handles password sign-in and the 6-digit two-factor challenge, and links to
 * account activation / forgot-password flows. Framed by AuthShell: centered
 * card on mobile & tablet portrait, split brand panel on desktop.
 */

import React, { useState } from 'react';
import { KeyRound, Loader2, Lock, Mail, Shield, X } from 'lucide-react';
import { useHashRoute } from '../../router/useHashRoute';
import { ROUTES } from '../../router/routes';
import { authErrorMessage, useCustomerAuth } from './CustomerAuthContext';
import { AuthShell } from './AuthShell';
import { setSplashVisible } from './splashState';

/** Shared input styling — consistent padding, focus ring, transition. */
const inputClass =
  'w-full h-11 pl-10 pr-4 bg-slate-50/80 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/60 transition';

const buttonClass =
  'w-full h-11 rounded-xl bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] text-white text-sm font-bold shadow-lg shadow-blue-900/30 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 transition-all';

export function CustomerLogin() {
  const { loginWithApi } = useCustomerAuth();
  const { navigate } = useHashRoute();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  /** Truthy while the ERP has issued a 2FA challenge — swaps in the code form. */
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Primary sign-in ────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter your email address and password.');
      return;
    }
    setError(null);
    setSubmitting(true);
    setSplashVisible(true);
    try {
      const result = await loginWithApi(email.trim(), password);
      if (result.requiresTwoFactor) {
        setPendingToken(result.pendingToken ?? 'pending');
        setTwoFactorCode('');
        setSplashVisible(false);
      } else {
        setSplashVisible(false);
        navigate(ROUTES.dashboard);
      }
    } catch (err) {
      setSplashVisible(false);
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Two-factor verification ───────────────────────────────────────────────
  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (twoFactorCode.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setError(null);
    setSubmitting(true);
    setSplashVisible(true);
    try {
      await loginWithApi(email.trim(), password, twoFactorCode);
      setPendingToken(null);
      setSplashVisible(false);
      navigate(ROUTES.dashboard);
    } catch (err) {
      setSplashVisible(false);
      setError(authErrorMessage(err));
      setTwoFactorCode('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      {/* Brand header */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] shadow-lg shadow-blue-900/30">
          <Lock className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-black tracking-tight text-slate-900">
            Prime <span className="text-[#2563eb]">PORTAL</span>
          </h1>
          <p className="text-xs font-medium text-slate-500">Smart. Simple. School Supplies.</p>
        </div>
      </div>

      {!pendingToken ? (
        <>
          {/* Welcome heading */}
          <div className="mt-6 space-y-1">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Welcome Back</h2>
            <p className="text-xs font-medium leading-relaxed text-slate-500">
              Sign in to manage your invoices, orders, quotations and billing — synchronized live with PrimeERP.
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium leading-relaxed text-rose-700">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="shrink-0 font-black text-rose-400 hover:text-rose-600"
                aria-label="Dismiss error"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Primary login form */}
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                Email Address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-email"
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

            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  className={inputClass}
                />
              </div>
            </div>

            <button type="submit" disabled={submitting} className={buttonClass}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>
        </>
      ) : (
        <>
          {/* Two-factor authentication view */}
          <div className="mt-6 space-y-1">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Two-Factor Authentication</h2>
            <p className="text-xs font-medium leading-relaxed text-slate-500">
              Enter the 6-digit code from your authenticator app to finish signing in.
            </p>
          </div>

          {error && (
            <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium leading-relaxed text-rose-700">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="shrink-0 font-black text-rose-400 hover:text-rose-600"
                aria-label="Dismiss error"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <form onSubmit={handleTwoFactorSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="login-2fa" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                Verification Code
              </label>
              <div className="relative">
                <Shield className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-2fa"
                  type="text"
                  required
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className={`${inputClass} text-center font-mono text-base tracking-[0.35em]`}
                />
              </div>
            </div>

            <button type="submit" disabled={submitting} className={buttonClass}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <span>Verify &amp; Sign In</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setPendingToken(null);
                setTwoFactorCode('');
                setError(null);
              }}
              className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
            >
              Back to sign in
            </button>
          </form>
        </>
      )}

      {/* Auxiliary navigation */}
      <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
        <button
          type="button"
          onClick={() => navigate(ROUTES.activate)}
          className="flex w-full items-center gap-2.5 text-xs font-semibold text-slate-600 hover:text-blue-700 transition"
        >
          <KeyRound className="h-4 w-4 text-slate-400" />
          <span>Activate your account</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">First time here?</span>
        </button>
        <button
          type="button"
          onClick={() => navigate(ROUTES.forgotPassword)}
          className="text-xs font-semibold text-slate-500 hover:text-blue-700 transition"
        >
          Forgot your password?
        </button>
      </div>
    </AuthShell>
  );
}

export default CustomerLogin;
