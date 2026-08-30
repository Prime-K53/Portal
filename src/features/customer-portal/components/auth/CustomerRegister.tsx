/**
 * Prime PORTAL — Self-Service Customer Registration
 *
 * Self-service registration for new customers. Optional referral code via
 * ?ref=CODE query parameter. The referral code is validated server-side.
 * On success the ERP returns a full session and the customer is signed in.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Link2, Loader2, ShieldCheck, UserPlus } from 'lucide-react';
import { useHashRoute } from '../../router/useHashRoute';
import { ROUTES } from '../../router/routes';
import { useCustomerAuth } from './CustomerAuthContext';
import { AuthShell } from './AuthShell';
import { AuthRegisterInput } from '../../types';

const REFERRAL_STORAGE_KEY = 'portal_pending_ref';

const inputClass =
  'w-full h-11 px-4 bg-slate-50/80 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/60 transition';

const selectClass =
  'w-full h-11 px-4 bg-slate-50/80 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/60 transition appearance-none';

const buttonClass =
  'w-full h-11 rounded-xl bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] text-white text-sm font-bold shadow-lg shadow-blue-900/30 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 transition-all';

function readReferralCode(): string | null {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  return ref && ref.trim().length > 0 ? ref.trim().toUpperCase() : null;
}

function persistReferralCode(code: string | null): void {
  try {
    if (code) {
      sessionStorage.setItem(REFERRAL_STORAGE_KEY, code);
    } else {
      sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
    }
  } catch {
    // sessionStorage unavailable — ignore
  }
}

function loadPersistedReferralCode(): string | null {
  try {
    return sessionStorage.getItem(REFERRAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function CustomerRegister() {
  const { registerWithApi } = useCustomerAuth();
  const { navigate } = useHashRoute();

  const [form, setForm] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    tier: '' as AuthRegisterInput['tier'] | '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const mountedRef = useRef(false);

  /* ── Load referral code from URL or sessionStorage ── */
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    const urlCode = readReferralCode();
    if (urlCode) {
      setReferralCode(urlCode);
      persistReferralCode(urlCode);
    } else {
      const stored = loadPersistedReferralCode();
      if (stored) setReferralCode(stored);
    }
  }, []);

  /* ── Clean up on unmount ── */
  useEffect(() => {
    return () => {
      if (!submitting) {
        persistReferralCode(null);
      }
    };
  }, [submitting]);

  const setField = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setGlobalError(null);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.companyName.trim()) errs.companyName = 'Business name is required';
    if (!form.email.trim()) {
      errs.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = 'Please enter a valid email address';
    }
    if (!form.password) {
      errs.password = 'Password is required';
    } else if (form.password.length < 8) {
      errs.password = 'Password must be at least 8 characters';
    }
    if (form.password !== form.confirmPassword) {
      errs.confirmPassword = 'Passwords do not match';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setGlobalError(null);
    setSubmitting(true);

    const payload: AuthRegisterInput = {
      companyName: form.companyName.trim(),
      contactName: form.contactName.trim() || undefined,
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || undefined,
      password: form.password,
      tier: form.tier as AuthRegisterInput['tier'] || undefined,
      ...(referralCode ? { referredByCode: referralCode } : {}),
    };

    try {
      await registerWithApi(payload);
      persistReferralCode(null);
      navigate(ROUTES.dashboard);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('unavailable')) {
        setGlobalError(
          'Self-service registration is not currently available. Please contact PrimeERP support to activate your account.'
        );
      } else if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('exists')) {
        setGlobalError('An account with this email address already exists.');
      } else if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('code')) {
        setGlobalError('The referral code is invalid or has expired.');
      } else if (msg.toLowerCase().includes('self-referral')) {
        setGlobalError('You cannot use your own referral code.');
      } else {
        setGlobalError('Registration failed. Please try again or contact support.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      {/* Brand header */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] shadow-lg shadow-blue-900/30">
          <UserPlus className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-black tracking-tight text-slate-900">
            Prime <span className="text-[#2563eb]">PORTAL</span>
          </h1>
          <p className="text-xs font-medium text-slate-500">Smart. Simple. School Supplies.</p>
        </div>
      </div>

      {/* Heading */}
      <div className="mt-6 space-y-1">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Create Account</h2>
        {referralCode ? (
          <p className="text-sm text-emerald-600 font-medium flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            You're signing up through a Prime referral.
          </p>
        ) : (
          <p className="text-sm text-slate-500">Join Prime Printing for school stationery &amp; printing.</p>
        )}
      </div>

      {/* Referral badge */}
      {referralCode && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5">
          <Link2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="text-xs font-bold text-emerald-700">
            Referral Code:{' '}
            <span className="font-mono tracking-widest">{referralCode}</span>
          </span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        {/* Business name */}
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600" htmlFor="reg-company">
            Business Name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="reg-company"
              type="text"
              autoComplete="organization"
              placeholder="Prime School Supplies"
              className={inputClass}
              value={form.companyName}
              onChange={setField('companyName')}
              disabled={submitting}
            />
          </div>
          {errors.companyName && <p className="mt-1 text-xs text-red-500">{errors.companyName}</p>}
        </div>

        {/* Contact name */}
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600" htmlFor="reg-contact">
            Contact Name
          </label>
          <input
            id="reg-contact"
            type="text"
            autoComplete="name"
            placeholder="Jane Smith"
            className={inputClass}
            value={form.contactName}
            onChange={setField('contactName')}
            disabled={submitting}
          />
        </div>

        {/* Email */}
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600" htmlFor="reg-email">
            Email Address <span className="text-red-500">*</span>
          </label>
          <input
            id="reg-email"
            type="email"
            autoComplete="email"
            placeholder="jane@primeschool.co.za"
            className={inputClass}
            value={form.email}
            onChange={setField('email')}
            disabled={submitting}
          />
          {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
        </div>

        {/* Phone */}
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600" htmlFor="reg-phone">
            Phone Number
          </label>
          <input
            id="reg-phone"
            type="tel"
            autoComplete="tel"
            placeholder="+27 11 123 4567"
            className={inputClass}
            value={form.phone}
            onChange={setField('phone')}
            disabled={submitting}
          />
        </div>

        {/* Tier */}
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600" htmlFor="reg-tier">
            Account Type
          </label>
          <div className="relative">
            <select
              id="reg-tier"
              className={selectClass}
              value={form.tier}
              onChange={setField('tier')}
              disabled={submitting}
            >
              <option value="">Select account type...</option>
              <option value="Platinum Preferred">Platinum Preferred</option>
              <option value="Gold Partner">Gold Partner</option>
              <option value="Silver Member">Silver Member</option>
            </select>
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600" htmlFor="reg-password">
            Password <span className="text-red-500">*</span>
          </label>
          <input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            placeholder="Minimum 8 characters"
            className={inputClass}
            value={form.password}
            onChange={setField('password')}
            disabled={submitting}
          />
          {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}
        </div>

        {/* Confirm password */}
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600" htmlFor="reg-confirm">
            Confirm Password <span className="text-red-500">*</span>
          </label>
          <input
            id="reg-confirm"
            type="password"
            autoComplete="new-password"
            placeholder="Repeat your password"
            className={inputClass}
            value={form.confirmPassword}
            onChange={setField('confirmPassword')}
            disabled={submitting}
          />
          {errors.confirmPassword && <p className="mt-1 text-xs text-red-500">{errors.confirmPassword}</p>}
        </div>

        {/* Global error */}
        {globalError && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-600 font-medium">{globalError}</p>
          </div>
        )}

        {/* Submit */}
        <button type="submit" className={buttonClass} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating account...
            </>
          ) : (
            'Create Account'
          )}
        </button>
      </form>

      {/* Footer links */}
      <div className="mt-5 flex items-center justify-between text-xs">
        <p className="text-slate-400">
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => navigate(ROUTES.login)}
            className="font-bold text-blue-600 hover:text-blue-700 hover:underline"
          >
            Sign in
          </button>
        </p>
        <p className="text-slate-400">
          Have an invite code?{' '}
          <button
            type="button"
            onClick={() => navigate(ROUTES.activate)}
            className="font-bold text-blue-600 hover:text-blue-700 hover:underline"
          >
            Activate
          </button>
        </p>
      </div>
    </AuthShell>
  );
}
