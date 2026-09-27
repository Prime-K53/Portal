/**
 * Prime PORTAL — Customer Account Activation
 *
 * First-time setup for invited customers: Customer ID + 6-digit invite code +
 * new password. On success the ERP returns a full session and the customer is
 * signed straight into the portal.
 *
 * Chrome comes from the shared auth kit (authTheme) — same mint theme as
 * the Welcome Back screen.
 */

import React, { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useHashRoute } from '../../router/useHashRoute';
import { ROUTES } from '../../router/routes';
import { useCustomerAuth } from './CustomerAuthContext';
import {
  AuthError,
  AuthHeading,
  AuthMintShell,
  authInputClass,
  authPrimaryButtonClass,
} from './authTheme';

const ACTIVATION_FAILED_MESSAGE =
  'Invalid customer ID or invite code. Codes expire after 30 minutes.';

export function CustomerActivate() {
  const { activateAccount } = useCustomerAuth();
  const { navigate } = useHashRoute();

  const [customerId, setCustomerId] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

  const renderPasswordToggle = (visible: boolean, onToggle: () => void, label: string) => (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-4 top-1/2 min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center text-slate-400 hover:text-slate-600 transition flex"
      aria-label={label}
    >
      {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
    </button>
  );

  return (
    <AuthMintShell>
      <AuthHeading
        lead="Activate Your"
        accent="Account"
        description="Use the customer ID and invite code from your welcome email to set up portal access."
      />

      {error && <AuthError error={error} onDismiss={() => setError(null)} />}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="activate-customer-id"
            className="mb-1.5 block text-[13px] font-semibold text-slate-900"
          >
            Customer ID
          </label>
          <input
            id="activate-customer-id"
            type="text"
            required
            autoComplete="username"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            placeholder="e.g. CUST-00142"
            className={authInputClass}
          />
        </div>

        <div>
          <label
            htmlFor="activate-code"
            className="mb-1.5 block text-[13px] font-semibold text-slate-900"
          >
            Invite Code
          </label>
          <input
            id="activate-code"
            type="text"
            required
            inputMode="numeric"
            maxLength={6}
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className={`${authInputClass} text-center font-mono text-base tracking-[0.35em]`}
          />
        </div>

        <div>
          <label
            htmlFor="activate-password"
            className="mb-1.5 block text-[13px] font-semibold text-slate-900"
          >
            New Password
          </label>
          <div className="relative">
            <input
              id="activate-password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className={`${authInputClass} pr-12`}
            />
            {renderPasswordToggle(showPassword, () => setShowPassword((v) => !v), showPassword ? 'Hide password' : 'Show password')}
          </div>
        </div>

        <div>
          <label
            htmlFor="activate-confirm"
            className="mb-1.5 block text-[13px] font-semibold text-slate-900"
          >
            Confirm Password
          </label>
          <div className="relative">
            <input
              id="activate-confirm"
              type={showConfirmPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              className={`${authInputClass} pr-12`}
            />
            {renderPasswordToggle(showConfirmPassword, () => setShowConfirmPassword((v) => !v), showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password')}
          </div>
        </div>

        <button type="submit" disabled={submitting} className={authPrimaryButtonClass}>
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
      <p className="mt-6 text-center text-[13px] text-slate-500">
        Already activated?{' '}
        <button
          type="button"
          onClick={() => navigate(ROUTES.login)}
          className="min-h-[44px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline underline-offset-2 transition"
        >
          Sign In
        </button>
      </p>
    </AuthMintShell>
  );
}

export default CustomerActivate;
