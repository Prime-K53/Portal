/**
 * Prime PORTAL — Customer Account Activation
 *
 * First-time setup for invited customers: Customer ID + 6-digit invite code +
 * new password. On success the ERP returns a full session and the customer is
 * signed straight into the portal.
 */

import React, { useState } from 'react';
import { BadgeCheck, KeyRound, Loader2, Lock } from 'lucide-react';
import { useHashRoute } from '../../router/useHashRoute';
import { ROUTES } from '../../router/routes';
import { useCustomerAuth } from './CustomerAuthContext';
import { AuthShell } from './AuthShell';

const inputClass =
  'w-full h-11 pl-10 pr-4 bg-slate-50/80 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/60 transition';

const buttonClass =
  'w-full h-11 rounded-xl bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] text-white text-sm font-bold shadow-lg shadow-blue-900/30 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 transition-all';

const ACTIVATION_FAILED_MESSAGE =
  'Invalid customer ID or invite code. Codes expire after 30 minutes.';

export function CustomerActivate() {
  const { activateAccount } = useCustomerAuth();
  const { navigate } = useHashRoute();

  const [customerId, setCustomerId] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId.trim() || !inviteCode.trim()) {
      setError('Please enter your customer ID and invite code.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await activateAccount(customerId, inviteCode, password);
      navigate(ROUTES.dashboard);
    } catch {
      // The ERP deliberately does not distinguish unknown IDs from bad codes.
      setError(ACTIVATION_FAILED_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      {/* Brand header */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] shadow-lg shadow-blue-900/30">
          <BadgeCheck className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-black tracking-tight text-slate-900">
            Prime <span className="text-[#2563eb]">PORTAL</span>
          </h1>
          <p className="text-xs font-medium text-slate-500">Smart. Simple. School Supplies.</p>
        </div>
      </div>

      {/* Welcome heading */}
      <div className="mt-6 space-y-1">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Activate Your Account</h2>
        <p className="text-xs font-medium leading-relaxed text-slate-500">
          Use the customer ID and invite code from your welcome email to set up portal access.
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium leading-relaxed text-rose-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div>
          <label htmlFor="activate-customer-id" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
            Customer ID
          </label>
          <div className="relative">
            <BadgeCheck className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="activate-customer-id"
              type="text"
              required
              autoComplete="username"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="e.g. CUST-00142"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="activate-code" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
            Invite Code
          </label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="activate-code"
              type="text"
              required
              inputMode="numeric"
              maxLength={6}
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className={`${inputClass} font-mono tracking-[0.35em]`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="activate-password" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
            New Password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="activate-password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="activate-confirm" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
            Confirm Password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="activate-confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              className={inputClass}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className={`${buttonClass} mt-2`}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Activating...</span>
            </>
          ) : (
            <span>Activate Account</span>
          )}
        </button>
      </form>

      {/* Auxiliary navigation */}
      <div className="mt-6 border-t border-slate-100 pt-5">
        <button
          type="button"
          onClick={() => navigate(ROUTES.login)}
          className="text-xs font-semibold text-slate-500 hover:text-blue-700 transition"
        >
          Already activated? Sign In
        </button>
      </div>
    </AuthShell>
  );
}

export default CustomerActivate;
