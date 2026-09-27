/**
 * Prime PORTAL — Customer Login (Welcome Back)
 *
 * Mint-green welcome screen matching the Prime Printing sign-in mock:
 * centered brand mark, SECURE SIGN-IN eyebrow, "Welcome Back" heading,
 * email + password form, black pill submit, "or continue with" divider
 * leading to account activation (replaces the Google option), and a
 * Sign-up footer. Still handles the 6-digit two-factor challenge.
 *
 * Chrome comes from the shared auth kit (authTheme) so every auth screen
 * renders one visual language.
 */

import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { useHashRoute } from '../../router/useHashRoute';
import { ROUTES } from '../../router/routes';
import { authErrorMessage, useCustomerAuth } from './CustomerAuthContext';
import {
  AuthError,
  AuthHeading,
  AuthMintShell,
  authInputClass,
  authPrimaryButtonClass,
  authSecondaryButtonClass,
} from './authTheme';

export function CustomerLogin() {
  const { loginWithApi } = useCustomerAuth();
  const { navigate } = useHashRoute();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    try {
      const result = await loginWithApi(email.trim(), password);
      if (result.requiresTwoFactor) {
        setPendingToken(result.pendingToken ?? 'pending');
        setTwoFactorCode('');
      } else {
        navigate(ROUTES.dashboard);
      }
    } catch (err) {
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
    try {
      await loginWithApi(email.trim(), password, twoFactorCode);
      setPendingToken(null);
      navigate(ROUTES.dashboard);
    } catch (err) {
      setError(authErrorMessage(err));
      setTwoFactorCode('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthMintShell>
      {!pendingToken ? (
        <>
          <AuthHeading
            lead="Welcome"
            accent="Back"
            description="To get started, please sign in using your username and password."
          />

          {error && <AuthError error={error} onDismiss={() => setError(null)} />}

          <form onSubmit={handleSubmit} className="mt-4 space-y-3 animate-rise" style={{ animationDelay: '140ms' }}>
            <div>
              <label
                htmlFor="login-email"
                className="mb-1.5 block text-[13px] font-semibold text-slate-900"
              >
                Email
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="quality@prime.mw"
                className={authInputClass}
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-1.5 block text-[13px] font-semibold text-slate-900"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  className={`${authInputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center text-slate-400 hover:text-slate-600 transition flex"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => navigate(ROUTES.forgotPassword)}
                className="min-h-[44px] text-[13px] font-bold text-amber-700 hover:text-amber-800 transition"
              >
                Forget Password?
              </button>
            </div>

            <button type="submit" disabled={submitting} className={authPrimaryButtonClass}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <span>Log in</span>
              )}
            </button>
          </form>

          {/* Secondary action — replaces the Google option */}
          <div className="mt-4 animate-rise" style={{ animationDelay: '200ms' }}>
            <div className="flex items-center gap-3" aria-hidden="true">
              <div className="h-px flex-1 bg-slate-300/60" />
              <span className="text-xs font-medium text-slate-400">or continue with</span>
              <div className="h-px flex-1 bg-slate-300/60" />
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => navigate(ROUTES.activate)}
                className={authSecondaryButtonClass}
                aria-label="Activate your account with invite code"
              >
                <KeyRound className="h-4 w-4 text-emerald-600" />
                <span>Activate your account</span>
              </button>
            </div>
          </div>

          <p className="mt-4 text-center text-[13px] text-slate-500 animate-rise" style={{ animationDelay: '260ms' }}>
            Are you new user?{' '}
            <button
              type="button"
              onClick={() => navigate(ROUTES.register)}
              className="min-h-[44px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline underline-offset-2 transition"
            >
              Sign up
            </button>
          </p>
        </>
      ) : (
        <>
          <AuthHeading
            lead="Check"
            accent="Authenticator"
            description="Enter the 6-digit code from your authenticator app to finish signing in."
          />

          {error && <AuthError error={error} onDismiss={() => setError(null)} />}

          <form onSubmit={handleTwoFactorSubmit} className="mt-4 space-y-3 animate-rise" style={{ animationDelay: '140ms' }}>
            <div>
              <label
                htmlFor="login-2fa"
                className="mb-1.5 block text-[13px] font-semibold text-slate-900"
              >
                Verification Code
              </label>
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
                className={`${authInputClass} text-center font-mono text-base tracking-[0.35em]`}
              />
            </div>

            <button type="submit" disabled={submitting} className={authPrimaryButtonClass}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <span>Verify &amp; Log in</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setPendingToken(null);
                setTwoFactorCode('');
                setError(null);
              }}
              className="min-h-[44px] w-full text-center text-[13px] font-semibold text-slate-500 hover:text-slate-800 transition"
            >
              Back to sign in
            </button>
          </form>
        </>
      )}
    </AuthMintShell>
  );
}

export default CustomerLogin;
