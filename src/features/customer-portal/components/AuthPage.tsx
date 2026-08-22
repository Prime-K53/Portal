import React, { useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Landmark,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import type { AuthCredentials } from '../types';
import { AuthError } from '../services/authService';
import type { LoginOutcome } from '../services/authService';

interface AuthPageProps {
  /** Submits real credentials to the ERP auth service. Resolves to a full
   * session or a 2FA challenge that must be completed with onVerifyTwoFactor. */
  onLogin: (credentials: AuthCredentials) => Promise<LoginOutcome>;
  onVerifyTwoFactor: (code: string) => Promise<void>;
  onRequestPasswordReset: (email: string) => Promise<void>;
}

function toFriendlyAuthError(error: unknown): string {
  if (error instanceof AuthError) {
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

const HIGHLIGHTS = [
  {
    icon: FileText,
    title: 'Invoices & Statements',
    text: 'Live balances straight from the ERP ledger.',
  },
  {
    icon: Truck,
    title: 'Shipment Tracking',
    text: 'Real-time dispatch updates as they happen.',
  },
  {
    icon: Landmark,
    title: 'Payment Requests',
    text: 'Submit bank transfers for finance verification.',
  },
];

export const AuthPage: React.FC<AuthPageProps> = ({ onLogin, onVerifyTwoFactor, onRequestPasswordReset }) => {
  const [mode, setMode] = useState<'signin' | 'two_factor' | 'forgot'>('signin');
  const [showPassword, setShowPassword] = useState(false);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorEmail, setTwoFactorEmail] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const switchMode = (next: 'signin' | 'two_factor' | 'forgot') => {
    setMode(next);
    setErrorMessage('');
    setForgotSubmitted(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Please fill in both email and password.');
      return;
    }
    setErrorMessage('');
    setIsSubmitting(true);
    try {
      const outcome = await onLogin({ email, password, rememberMe });
      if (outcome.type === 'two_factor') {
        setTwoFactorEmail(outcome.user.email || email);
        setMode('two_factor');
      }
    } catch (err) {
      setErrorMessage(toFriendlyAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorCode.trim()) {
      setErrorMessage('Please enter your verification code.');
      return;
    }
    setErrorMessage('');
    setIsSubmitting(true);
    try {
      await onVerifyTwoFactor(twoFactorCode.trim());
    } catch (err) {
      setErrorMessage(toFriendlyAuthError(err));
      setTwoFactorCode('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMessage('Please enter your email address.');
      return;
    }
    setErrorMessage('');
    setIsSubmitting(true);
    try {
      await onRequestPasswordReset(email);
      setForgotSubmitted(true);
    } catch (err) {
      setErrorMessage(toFriendlyAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen lg:h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row selection:bg-blue-600 selection:text-white font-sans">
      {/* ── Left Brand Showcase Panel (desktop) ─────────────────────────────── */}
      <aside className="hidden lg:flex relative w-[46%] xl:w-[44%] h-full bg-slate-950 overflow-hidden shrink-0">
        {/* Ambient background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(37,99,235,0.25),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(16,185,129,0.14),transparent_50%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:2.75rem_2.75rem] [mask-image:radial-gradient(ellipse_70%_60%_at_40%_35%,#000_60%,transparent_100%)]" />

        {/* Panel content */}
        <div className="relative z-10 flex flex-col justify-between w-full p-10 xl:p-14 animate-fade-in">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Building2 className="w-5.5 h-5.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-lg tracking-tight text-white">Prime</span>
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-300 bg-blue-950 border border-blue-800/60 px-2 py-0.5 rounded-md">
                  PORTAL
                </span>
              </div>
              <p className="text-[11.5px] text-slate-400 font-medium mt-0.5">Corporate B2B Client Management</p>
            </div>
          </div>

          {/* Headline */}
          <div className="max-w-md space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-blue-200 text-xs font-semibold backdrop-blur-sm">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Secure ERP-connected access
            </div>

            <h1 className="text-4xl xl:text-5xl font-black text-white tracking-tight leading-[1.08]">
              Your business,
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-emerald-200 bg-clip-text text-transparent">
                in perfect sync.
              </span>
            </h1>

            <p className="text-sm text-slate-400 leading-relaxed max-w-sm">
              One portal for invoicing, deliveries, quotations and payments — synchronized live with PrimeERP.
            </p>

            {/* Feature highlights */}
            <div className="space-y-3 pt-2">
              {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
                <div
                  key={title}
                  className="flex items-center gap-3.5 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.07] backdrop-blur-sm hover:bg-white/[0.07] transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-blue-300" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-100">{title}</h3>
                    <p className="text-[12px] text-slate-400 font-medium">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom trust line */}
          <p className="text-[11.5px] text-slate-500 font-medium">
            © {new Date().getFullYear()} Prime Printing Services · Powered by PrimeERP
          </p>
        </div>
      </aside>

      {/* ── Right Form Panel ────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-h-screen lg:min-h-0">
        {/* Mobile brand header */}
        <header className="lg:hidden px-6 pt-7 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                <Building2 className="w-4.5 h-4.5" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-base tracking-tight text-slate-900">Prime</span>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                  PORTAL
                </span>
              </div>
            </div>
            <a
              href="mailto:support@primeportal.mw"
              className="text-xs font-semibold text-slate-500 hover:text-slate-900 transition"
            >
              Support
            </a>
          </div>
        </header>

        {/* Desktop top bar */}
        <div className="hidden lg:flex items-center justify-end px-12 pt-8">
          <a
            href="mailto:support@primeportal.mw"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 transition px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:border-slate-300 shadow-2xs"
          >
            <Mail className="w-3.5 h-3.5" />
            Need help? Contact support
          </a>
        </div>

        {/* Form area */}
        <div className="flex-1 flex items-center justify-center px-6 py-10 lg:py-0">
          <div className="w-full max-w-[26rem] animate-fade-in">
            {errorMessage && (
              <div className="mb-5 flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium leading-relaxed">
                <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* SIGN IN FORM */}
            {mode === 'signin' && (
              <form onSubmit={handleSignIn} className="space-y-5">
                <div className="space-y-1.5">
                  <h1 className="text-[1.75rem] leading-tight font-black text-slate-900 tracking-tight">
                    Welcome back
                  </h1>
                  <p className="text-sm text-slate-500">
                    Sign in with your ERP-registered corporate email.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="auth-email" className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                      Email Address
                    </label>
                    <div className="relative group">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="auth-email"
                        type="text"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="accounts@company.mw"
                        className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="auth-password" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="text-xs text-blue-600 hover:text-blue-700 font-semibold hover:underline underline-offset-2 transition"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative group">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="auth-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••"
                        className="w-full pl-10 pr-11 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded-md transition"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-500/30 cursor-pointer"
                  />
                  <span className="text-xs font-medium text-slate-600">Keep me signed in on this device</span>
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="group w-full py-3.5 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-slate-900/15 flex items-center justify-center gap-2 transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Please wait...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In to Portal</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* TWO-FACTOR AUTHENTICATION FORM */}
            {mode === 'two_factor' && (
              <form onSubmit={handleTwoFactor} className="space-y-5">
                <div className="space-y-1.5">
                  <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center mb-3">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <h1 className="text-[1.75rem] leading-tight font-black text-slate-900 tracking-tight">
                    Two-factor verification
                  </h1>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Enter the code from your authenticator app to finish signing in{' '}
                    <strong className="text-slate-700 font-semibold">{twoFactorEmail || 'your account'}</strong>.
                  </p>
                </div>

                <div>
                  <label htmlFor="auth-2fa" className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                    Verification Code
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="auth-2fa"
                      type="text"
                      required
                      autoFocus
                      inputMode="numeric"
                      maxLength={8}
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value)}
                      placeholder="000000"
                      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-base text-slate-900 placeholder-slate-300 shadow-2xs focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition tracking-[0.35em] font-mono text-center"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="py-3 px-5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-sm rounded-xl shadow-lg shadow-slate-900/15 flex items-center justify-center gap-2 transition"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <span>Verify &amp; Sign In</span>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* FORGOT PASSWORD FORM */}
            {mode === 'forgot' && (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <div className="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center mb-3">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <h1 className="text-[1.75rem] leading-tight font-black text-slate-900 tracking-tight">
                    Reset your password
                  </h1>
                  <p className="text-sm text-slate-500">
                    We'll send recovery instructions to your corporate email.
                  </p>
                </div>

                {forgotSubmitted ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2.5">
                    <p className="text-sm font-bold text-emerald-700 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Reset link dispatched
                    </p>
                    <p className="text-xs text-emerald-700 leading-relaxed">
                      A password reset link was sent to <strong>{email}</strong>. Check your inbox, or contact ERP support if it doesn't arrive shortly.
                    </p>
                    <button
                      type="button"
                      onClick={() => switchMode('signin')}
                      className="pt-1 inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-800 hover:text-emerald-900 hover:underline underline-offset-2"
                    >
                      Return to sign in
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="auth-reset-email" className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                        Registered Email
                      </label>
                      <input
                        id="auth-reset-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="accounts@company.mw"
                        className="w-full px-3.5 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition"
                      />
                    </div>
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => switchMode('signin')}
                        className="py-3 px-5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-sm rounded-xl shadow-lg shadow-slate-900/15 flex items-center justify-center gap-2 transition"
                      >
                        {isSubmitting ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Sending...</span>
                          </>
                        ) : (
                          <span>Send Reset Link</span>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* ERP SECURITY NOTE */}
            <div className="mt-8 pt-5 border-t border-slate-200/80 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-[11.5px] text-slate-400 leading-relaxed">
                Authentication is handled by the PrimeERP system. Sessions are stored in this browser's session
                storage only and are rotated every 30 minutes. Your credentials are never stored on this device.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="px-6 pb-6 lg:px-12 lg:pb-8">
          <div className="max-w-[64rem] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[11.5px] text-slate-400 font-medium">
            <p className="lg:hidden">© {new Date().getFullYear()} Prime PORTAL. All rights reserved.</p>
            <p className="hidden lg:block">Prime PORTAL v2 · All systems operational</p>
            <div className="flex items-center gap-4">
              <a href="#" className="hover:text-slate-600 transition">Privacy Policy</a>
              <a href="#" className="hover:text-slate-600 transition">Terms of Service</a>
              <a href="#" className="hover:text-slate-600 transition">System Status</a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
};
