import React, { useState } from 'react';
import {
  Building2,
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Eye,
  EyeOff,
  KeyRound,
  Info,
  ShieldAlert,
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

  const submitLabel = isSubmitting ? 'Please wait...' : 'Sign In to Portal';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-blue-600 selection:text-white font-sans relative overflow-hidden">
      {/* Background Decorative Gradients & Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -right-40 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <header className="relative z-10 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center font-black text-xl shadow-lg shadow-blue-500/20 shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-lg tracking-tight text-white">Prime</span>
              <span className="font-black text-xs uppercase tracking-widest text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded-md border border-blue-800/60">
                PORTAL
              </span>
            </div>
            <p className="text-[11.5px] text-slate-400 font-medium">Corporate B2B Client Management</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 hidden sm:inline-block">Need help?</span>
          <a
            href="mailto:support@primeportal.mw"
            className="text-xs font-bold text-blue-400 hover:text-blue-300 transition px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800"
          >
            Support
          </a>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 my-auto py-8 px-4 sm:px-6 lg:px-8 max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Side: Branding Banner */}
        <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/80 border border-blue-800/50 text-blue-300 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Secure Corporate B2B Account Access</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
            Welcome to <br />
            <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-blue-200 bg-clip-text text-transparent">
              Prime PORTAL
            </span>
          </h1>

          <p className="text-sm text-slate-400 max-w-md mx-auto lg:mx-0 leading-relaxed font-normal">
            Manage your invoices, track live shipment deliveries, review commercial quotes, and review account ledgers in real-time — synchronized with the PrimeERP system.
          </p>

          <div className="pt-2 space-y-3 max-w-md mx-auto lg:mx-0 text-left">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-slate-200">ERP Synchronized Security</h4>
                <p className="text-[12.5px] text-slate-400">Direct integration with corporate accounting & dispatch systems.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-slate-200">Instant Payment Verification</h4>
                <p className="text-[12.5px] text-slate-400">Payments are recorded directly in the ERP ledger for finance verification.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Auth Form Card */}
        <div className="lg:col-span-6 w-full max-w-md mx-auto">
          <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-blue-950/40 relative">
            {errorMessage && (
              <div className="mb-4 p-3 bg-rose-950/80 border border-rose-800/80 rounded-xl text-rose-300 text-xs font-medium leading-relaxed">
                {errorMessage}
              </div>
            )}

            {/* SIGN IN FORM */}
            {mode === 'signin' && (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-extrabold text-lg text-white">Sign in to your account</h3>
                  <p className="text-xs text-slate-400">Authenticate with your ERP-registered corporate email.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. accounts@company.mw"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-300">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-[12.5px] text-blue-400 hover:text-blue-300 font-medium transition"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0 cursor-pointer"
                    />
                    <span>Remember my session</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 transition"
                >
                  <span>{submitLabel}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* TWO-FACTOR AUTHENTICATION FORM */}
            {mode === 'two_factor' && (
              <form onSubmit={handleTwoFactor} className="space-y-4">
                <div className="flex items-center gap-2 text-blue-400">
                  <ShieldAlert className="w-5 h-5" />
                  <h3 className="font-extrabold text-sm text-white">Two-Factor Authentication Required</h3>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  Enter the verification code from your authenticator app to complete sign-in for{' '}
                  <strong className="text-slate-200">{twoFactorEmail || 'your account'}</strong>.
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Verification Code
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      autoFocus
                      inputMode="numeric"
                      maxLength={8}
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value)}
                      placeholder="000000"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition tracking-widest font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl transition"
                  >
                    {isSubmitting ? 'Verifying...' : 'Verify & Sign In'}
                  </button>
                </div>
              </form>
            )}

            {/* FORGOT PASSWORD FORM */}
            {mode === 'forgot' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-blue-400">
                  <KeyRound className="w-5 h-5" />
                  <h3 className="font-extrabold text-sm text-white">Reset Account Password</h3>
                </div>

                {forgotSubmitted ? (
                  <div className="p-4 bg-emerald-950/80 border border-emerald-800/80 rounded-2xl space-y-2 text-emerald-200 text-xs">
                    <p className="font-bold flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" /> Reset Link Dispatched
                    </p>
                    <p className="leading-relaxed text-[12.5px] text-emerald-300">
                      We have sent a password reset link to <strong>{email}</strong>. Please check your inbox or contact ERP support.
                    </p>
                    <button
                      type="button"
                      onClick={() => switchMode('signin')}
                      className="mt-2 text-xs font-extrabold text-white underline hover:text-emerald-100"
                    >
                      Return to Sign In
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotSubmit} className="space-y-4">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Enter your corporate account email to receive password recovery instructions.
                    </p>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">
                        Registered Email
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="accounts@company.mw"
                        className="w-full px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => switchMode('signin')}
                        className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-extrabold text-xs rounded-xl transition"
                      >
                        {isSubmitting ? 'Sending...' : 'Send Reset Link'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* ERP SECURITY NOTE */}
            <div className="mt-6 pt-5 border-t border-slate-800/80 space-y-2.5">
              <span className="block text-[11.5px] font-black uppercase tracking-wider text-slate-500 text-center">
                Secure Session
              </span>
              <div className="flex items-start gap-2.5 p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-[12.5px] text-slate-400 leading-relaxed">
                <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <p>
                  Authentication is handled by the PrimeERP system. Sessions are stored in this browser's session
                  storage only and are rotated every 30 minutes. Your credentials are never stored on this device.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center text-slate-500 text-[12.5px] border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p>© {new Date().getFullYear()} Prime PORTAL. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <a href="#" className="hover:text-slate-300 transition">Privacy Policy</a>
          <a href="#" className="hover:text-slate-300 transition">Terms of Service</a>
          <a href="#" className="hover:text-slate-300 transition">ERP System Status</a>
        </div>
      </footer>
    </div>
  );
};
