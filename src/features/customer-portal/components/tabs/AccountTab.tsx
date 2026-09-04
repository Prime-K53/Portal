import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  Headphones,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  ShieldCheck,
  User,
  XCircle,
} from 'lucide-react';
import { AccountProfile } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { authService, AuthError } from '../../services/authService';

interface AccountTabProps {
  profile: AccountProfile;
  onSignOut?: () => void;
  /** Re-fetches the customer profile from the ERP (used by the freshness button). */
  onRefreshProfile?: () => void;
  /** True while a profile refetch is in flight (disables the refresh button). */
  isRefreshingProfile?: boolean;
}

/** Human-friendly relative time for the data-freshness indicator. */
function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/** Maps auth-service failures to human-friendly copy. */
function passwordChangeErrorMessage(error: unknown): string {
  if (error instanceof AuthError) return error.message;
  if (error instanceof Error && error.message.includes('Current password')) {
    return 'Your current password is incorrect.';
  }
  return error instanceof Error ? error.message : 'Could not change your password. Please try again.';
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  autoComplete: string;
  onChange: (value: string) => void;
}

const PasswordField: React.FC<PasswordFieldProps> = ({ id, label, value, placeholder, autoComplete, onChange }) => {
  const [visible, setVisible] = useState(false);
  return (
    <label htmlFor={id} className="block space-y-1">
      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{label}</span>
      <span className="relative block">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 pr-9 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 placeholder:text-slate-300 font-medium focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 transition"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </span>
    </label>
  );
};

export const AccountTab: React.FC<AccountTabProps> = ({
  profile,
  onSignOut,
  onRefreshProfile,
  isRefreshingProfile = false,
}) => {
  const hasAccountManager = Boolean(profile.accountManager?.name);

  // Data freshness indicator — re-anchors to "now" after every successful refetch.
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  useEffect(() => {
    // Keep the relative label ticking without waiting for user interaction.
    const timer = window.setInterval(() => setLastRefreshed((d) => new Date(d)), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const handleRefreshClick = () => {
    if (!onRefreshProfile || isRefreshingProfile) return;
    onRefreshProfile();
    setLastRefreshed(new Date());
  };

  // Change password state.
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const canSubmitPassword =
    currentPassword.trim().length > 0 &&
    newPassword.length >= 6 &&
    confirmPassword.trim().length > 0 &&
    !isChangingPassword;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);

    if (!currentPassword.trim() || !newPassword || !confirmPassword.trim()) {
      setPasswordFeedback({ kind: 'error', message: 'Please fill in all three password fields.' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordFeedback({ kind: 'error', message: 'New password must be at least 6 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ kind: 'error', message: 'New password and confirmation do not match.' });
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordFeedback({ kind: 'error', message: 'New password must be different from the current one.' });
      return;
    }

    setIsChangingPassword(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordFeedback({ kind: 'success', message: 'Your password has been changed successfully.' });
    } catch (error) {
      setPasswordFeedback({ kind: 'error', message: passwordChangeErrorMessage(error) });
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="space-y-4 pb-20 text-slate-900">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-slate-900 text-white shadow-xs">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Account & Company Profile</h2>
            <p className="text-xs text-slate-500">Company credentials, assigned account manager, and payment terms configuration</p>
          </div>
        </div>

        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 rounded-xl font-bold text-xs flex items-center gap-2 transition shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        )}
      </div>

      {/* Data freshness indicator */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-[10px] text-slate-400 font-medium">
          Updated {formatTimeAgo(lastRefreshed)}
        </span>
        <button
          type="button"
          onClick={handleRefreshClick}
          disabled={!onRefreshProfile || isRefreshingProfile}
          className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Refresh profile data"
          title={onRefreshProfile ? 'Reload profile from ERP' : 'Profile refresh unavailable'}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isRefreshingProfile ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {/* Profile Header Card */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center font-black text-lg text-white shadow-xs">
            {(profile?.companyName || 'P').charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-base text-slate-900">{profile?.companyName || 'Customer'}</h3>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            {profile?.accountNumber && (
              <p className="text-xs text-slate-500 font-mono font-bold">Account #: {profile.accountNumber}</p>
            )}
            {profile?.tier ? (
              <span className="inline-block mt-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                {profile.tier}
              </span>
            ) : (
              <span className="inline-block mt-1 text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-bold">
                Tier not assigned
              </span>
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
          {profile?.customerName && (
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Contact: {profile.customerName}</span>
            </div>
          )}
          {profile?.email && (
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-slate-400 shrink-0" />
              <span>{profile.email}</span>
            </div>
          )}
          {profile?.phone && (
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-slate-400 shrink-0" />
              <span>{profile.phone}</span>
            </div>
          )}
          {profile?.address && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="truncate">{profile.address}</span>
            </div>
          )}
        </div>
      </div>

      {/* Credit Terms Overview */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3 shadow-2xs">
        <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-emerald-600" />
          <span>Approved Credit Line & Billing Terms</span>
        </h3>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-white rounded-xl border border-slate-200">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Approved Credit</span>
            <strong className="text-base font-black text-slate-900">{formatCurrency(profile.creditLimit)}</strong>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Current Drawn Balance</span>
            <strong className="text-base font-black text-orange-600">{formatCurrency(profile.currentBalance)}</strong>
          </div>
        </div>

        <p className="text-[11.5px] text-slate-500 font-medium leading-relaxed">
          Standard commercial terms apply. For current discount terms and any custom arrangements,
          contact your account manager.
        </p>
      </div>

      {/* Security — Change Password */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3 shadow-2xs">
        <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-indigo-600" />
          <span>Change Password</span>
        </h3>

        <form onSubmit={handleChangePassword} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <PasswordField
              id="current-password"
              label="Current Password"
              value={currentPassword}
              placeholder="Enter current password"
              autoComplete="current-password"
              onChange={setCurrentPassword}
            />
            <PasswordField
              id="new-password"
              label="New Password"
              value={newPassword}
              placeholder="Min. 6 characters"
              autoComplete="new-password"
              onChange={setNewPassword}
            />
            <PasswordField
              id="confirm-password"
              label="Confirm New Password"
              value={confirmPassword}
              placeholder="Repeat new password"
              autoComplete="new-password"
              onChange={setConfirmPassword}
            />
          </div>

          {passwordFeedback && (
            <div
              role={passwordFeedback.kind === 'success' ? 'status' : 'alert'}
              className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-xs font-bold ${
                passwordFeedback.kind === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {passwordFeedback.kind === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0 mt-px" />
              )}
              <span>{passwordFeedback.message}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[11px] text-slate-400 font-medium">
              Changing your password signs you out of all other devices.
            </span>
            <button
              type="submit"
              disabled={!canSubmitPassword}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-extrabold text-xs shadow-xs transition cursor-pointer disabled:cursor-not-allowed"
            >
              {isChangingPassword ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Updating…</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Update Password</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Account Manager Box — hidden when the ERP profile carries no manager data */}
      {hasAccountManager && (
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3 shadow-2xs">
          <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
            <Headphones className="w-4 h-4 text-slate-700" />
            <span>Dedicated Corporate Account Manager</span>
          </h3>

          <div className="flex items-center gap-3">
            {profile.accountManager.avatar ? (
              <img
                src={profile.accountManager.avatar}
                alt={profile.accountManager.name}
                className="w-12 h-12 rounded-full object-cover border-2 border-slate-300"
                onError={(e) => {
                  // Fall back to initials if the avatar URL fails to load.
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                  const sibling = (e.currentTarget as HTMLImageElement).nextElementSibling;
                  if (sibling instanceof HTMLElement) sibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className="w-12 h-12 rounded-full bg-slate-900 text-white items-center justify-center font-black text-sm border-2 border-slate-300"
              style={{ display: profile.accountManager.avatar ? 'none' : 'flex' }}
              aria-hidden={profile.accountManager.avatar ? 'true' : undefined}
            >
              {(profile.accountManager.name || 'AM').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h4 className="font-extrabold text-sm text-slate-900">{profile.accountManager.name}</h4>
              <p className="text-xs text-slate-500">{profile.accountManager.email}</p>
              <p className="text-xs text-slate-900 font-mono font-bold mt-0.5">{profile.accountManager.phone}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
