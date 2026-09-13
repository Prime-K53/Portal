/**
 * Prime PORTAL — Customer Registration Request
 *
 * Public request-submission form for new customers. A successful submission
 * creates ONLY a PENDING Customer Registration Request (CREG-YYYY-######)
 * via POST /api/portal/registration-requests — it NEVER creates an ERP
 * customer, portal user, password hash, JWT, refresh token, or session, and
 * it NEVER signs the applicant in. The applicant stays anonymous until an
 * ERP administrator approves the request.
 *
 * No password is collected here: credentials are set later through the
 * secure invitation/activation flow after approval. No credential material
 * is sent, stored, or logged at any point.
 *
 * Optional referral code via the `ref` parameter. The Portal uses hash
 * routing (`#/register?ref=CODE`) while shared links use the path form
 * (`/register?ref=CODE`) — both are parsed (see utils/referral.ts). The
 * pending referral is cleared ONLY after the backend accepts the request.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Link2, Loader2, ShieldCheck, UserPlus } from 'lucide-react';
import { useHashRoute } from '../../router/useHashRoute';
import { ROUTES } from '../../router/routes';
import { AuthShell } from './AuthShell';
import {
  RegistrationRequestError,
  submitRegistrationRequest,
  writePendingRegistration,
} from '../../services/registrationRequestService';
import {
  clearPendingReferralCode,
  loadPendingReferralCode,
  persistPendingReferralCode,
  readRegistrationReferralCode,
} from '../../utils/referral';
import { generateIdempotencyKey } from '../../utils/idempotency';
import type { RegistrationRequestInput, RegistrationRequestTier } from '../../types';

const inputClass =
  'w-full h-11 px-4 bg-slate-50/80 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/60 transition';

const selectClass =
  'w-full h-11 px-4 bg-slate-50/80 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/60 transition appearance-none';

const buttonClass =
  'w-full h-11 rounded-xl bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] text-white text-sm font-bold shadow-lg shadow-blue-900/30 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 transition-all';

interface Notice {
  message: string;
  existingRequestNumber?: string | null;
}

function fingerprintOf(payload: RegistrationRequestInput): string {
  return JSON.stringify([
    payload.companyName.trim().toLowerCase(),
    payload.contactName.trim().toLowerCase(),
    payload.email.trim().toLowerCase(),
    (payload.phone ?? '').trim(),
    payload.tier ?? '',
    payload.referredByCode ?? '',
  ]);
}

export function CustomerRegister() {
  const { navigate } = useHashRoute();

  const [form, setForm] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    tier: '' as RegistrationRequestTier | '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  /**
   * ONE Idempotency-Key per logical submission attempt. Reused for retries
   * of the SAME attempt (same applicant details) so a network timeout can
   * never create a duplicate request. Rotated only when the applicant edits
   * identifying details — a changed email/phone/company is a NEW attempt,
   * and reusing the old key would replay the previous applicant's row.
   */
  const idempotencyRef = useRef<{ key: string; fingerprint: string } | null>(null);

  /* ── Load referral code from URL (hash- or path-form) or sessionStorage ── */
  useEffect(() => {
    const urlCode = readRegistrationReferralCode();
    if (urlCode) {
      setReferralCode(urlCode);
      persistPendingReferralCode(urlCode);
    } else {
      const stored = loadPendingReferralCode();
      if (stored) setReferralCode(stored);
    }
    // NOTE: no unmount cleanup — the pending referral must survive
    // validation failures, network failures, and form abandonment. It is
    // cleared ONLY after the backend accepts the registration request.
  }, []);

  const setField = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setNotice(null);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.companyName.trim() || form.companyName.trim().length < 2) {
      errs.companyName = 'Business name must be at least 2 characters';
    }
    if (!form.contactName.trim() || form.contactName.trim().length < 2) {
      errs.contactName = 'Contact name must be at least 2 characters';
    }
    if (!form.email.trim()) {
      errs.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = 'Please enter a valid email address';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setNotice(null);
    setSubmitting(true);

    const payload: RegistrationRequestInput = {
      companyName: form.companyName.trim(),
      contactName: form.contactName.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || undefined,
      tier: form.tier || undefined,
      ...(referralCode ? { referredByCode: referralCode } : {}),
    };

    const fingerprint = fingerprintOf(payload);
    if (!idempotencyRef.current || idempotencyRef.current.fingerprint !== fingerprint) {
      idempotencyRef.current = { key: generateIdempotencyKey(), fingerprint };
    }

    try {
      const response = await submitRegistrationRequest(payload, idempotencyRef.current.key);
      // The backend accepted the request — the referral is now resolved and
      // stored server-side. Only NOW may the temporary referral be cleared.
      // Persist the safe pending minimum (request number + email + status)
      // so the confirmation screen survives a browser refresh.
      clearPendingReferralCode();
      idempotencyRef.current = null;
      writePendingRegistration({
        requestNumber: response.requestNumber,
        email: payload.email,
        status: response.status,
        submittedAt: response.submittedAt,
      });
      // The applicant remains anonymous: no session, no tokens, no dashboard.
      navigate(ROUTES.registerPending);
    } catch (err: unknown) {
      if (err instanceof RegistrationRequestError) {
        switch (err.kind) {
          case 'duplicate-pending':
            setNotice({
              message:
                'A registration request with these details is already pending review. ' +
                'There is no need to submit again.',
              existingRequestNumber: err.existingRequestNumber,
            });
            break;
          case 'duplicate-customer':
            setNotice({
              message: 'An account with these details already exists. Please sign in instead.',
            });
            break;
          case 'invalid-referral':
            // Keep the code visible (do NOT clear it) so the applicant can
            // correct it or remove it and resubmit.
            setNotice({ message: err.message });
            break;
          case 'validation': {
            const msg = err.message.toLowerCase();
            if (msg.includes('company')) {
              setErrors({ companyName: err.message });
            } else if (msg.includes('contact')) {
              setErrors({ contactName: err.message });
            } else if (msg.includes('email')) {
              setErrors({ email: err.message });
            } else {
              setNotice({ message: err.message });
            }
            break;
          }
          case 'rate-limited':
          case 'network':
            // Retrying is safe: the same Idempotency-Key is reused, so the
            // backend replays the stored request instead of duplicating it.
            setNotice({ message: err.message });
            break;
          default:
            setNotice({ message: 'Registration request failed. Please try again or contact support.' });
            break;
        }
      } else {
        setNotice({ message: 'Registration request failed. Please try again or contact support.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const viewExistingRequest = () => {
    if (!notice?.existingRequestNumber) return;
    writePendingRegistration({
      requestNumber: notice.existingRequestNumber,
      email: form.email.trim().toLowerCase(),
      status: 'pending',
      submittedAt: null,
    });
    navigate(ROUTES.registerPending);
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
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Request an Account</h2>
        {referralCode ? (
          <p className="text-sm text-emerald-600 font-medium flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            You&apos;re requesting through a Prime referral.
          </p>
        ) : (
          <p className="text-sm text-slate-500">
            Submit a registration request — our team will review it and contact you once approved.
          </p>
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
            Contact Name <span className="text-red-500">*</span>
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
          {errors.contactName && <p className="mt-1 text-xs text-red-500">{errors.contactName}</p>}
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
              <option value="Individual">Individual</option>
              <option value="School Account">School Account</option>
              <option value="Institution">Institution</option>
              <option value="Government">Government</option>
            </select>
          </div>
        </div>

        {/* No password is collected: credentials are set after administrator
            approval through the secure invitation/activation flow. */}

        {/* Notice */}
        {notice && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <p className="text-sm text-amber-700 font-medium">{notice.message}</p>
            {notice.existingRequestNumber && (
              <button
                type="button"
                onClick={viewExistingRequest}
                className="mt-2 text-sm font-bold text-blue-600 hover:text-blue-700 hover:underline"
              >
                View pending request {notice.existingRequestNumber}
              </button>
            )}
          </div>
        )}

        {/* Submit */}
        <button type="submit" className={buttonClass} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting request...
            </>
          ) : (
            'Submit Request'
          )}
        </button>

        <p className="text-xs leading-relaxed text-slate-400">
          No password is needed yet. Your request will be reviewed by our team, and you&apos;ll
          receive sign-in instructions once your account is approved.
        </p>
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
