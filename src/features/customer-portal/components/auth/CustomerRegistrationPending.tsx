/**
 * Prime PORTAL — Pending Registration Confirmation
 *
 * Public (unauthenticated) confirmation screen shown after a registration
 * request is accepted. Displays the ERP-issued request number and review
 * status, with optional status refresh and applicant cancellation.
 *
 * This screen NEVER creates a session: no tokens are read or written, the
 * auth context is not touched, and an approved request does NOT sign the
 * applicant in — credentials arrive separately through the
 * invitation/activation flow.
 *
 * Chrome comes from the shared auth kit (authTheme) — same mint theme as
 * the Welcome Back screen.
 */

import React, { useEffect, useState } from 'react';
 import { CheckCircle2, Clock3, Loader2, Search, XCircle } from 'lucide-react';
import { useHashRoute } from '../../router/useHashRoute';
import { ROUTES } from '../../router/routes';
import {
  RegistrationRequestError,
  cancelRegistrationRequest,
  clearPendingRegistration,
  getRegistrationRequestStatus,
  readPendingRegistration,
  writePendingRegistration,
  type PendingRegistrationInfo,
} from '../../services/registrationRequestService';
import { generateIdempotencyKey } from '../../utils/idempotency';
import {
  loadPendingReferralCode,
  clearPendingReferralCode,
} from '../../utils/referral';
import {
  AuthError,
  AuthHeading,
  AuthMintShell,
  authInputClass,
  authPrimaryButtonClass,
  authSecondaryButtonClass,
} from './authTheme';

type StatusTone = 'pending' | 'approved' | 'rejected' | 'cancelled';

function toneOf(status: string): StatusTone {
  const normalized = status.toLowerCase();
  if (normalized === 'approved' || normalized === 'rejected' || normalized === 'cancelled') {
    return normalized;
  }
  return 'pending';
}

function statusLabel(status: string): string {
  switch (toneOf(status)) {
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Pending Review';
  }
}

function StatusIcon({ status }: { status: string }) {
  const tone = toneOf(status);
  if (tone === 'approved') return <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />;
  if (tone === 'rejected' || tone === 'cancelled') {
    return <XCircle className="h-5 w-5 text-rose-500 shrink-0" />;
  }
  return <Clock3 className="h-5 w-5 text-amber-500 shrink-0" />;
}

/** Reads a `requestNumber`/`email` fallback from the hash query, if present. */
function readQueryFallback(): PendingRegistrationInfo | null {
  try {
    const hash = window.location.hash;
    const queryIndex = hash.indexOf('?');
    if (queryIndex < 0) return null;
    const params = new URLSearchParams(hash.slice(queryIndex + 1));
    const requestNumber = params.get('requestNumber')?.trim();
    if (!requestNumber) return null;
    return {
      requestNumber,
      email: params.get('email')?.trim() ?? '',
      status: 'pending',
      submittedAt: null,
    };
  } catch {
    return null;
  }
}

export function CustomerRegistrationPending() {
  const { navigate } = useHashRoute();

  const [pending, setPending] = useState<PendingRegistrationInfo | null>(null);
  const [email, setEmail] = useState('');
  const [lookupRequestNumber, setLookupRequestNumber] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [checking, setChecking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    const stored = readPendingRegistration() ?? readQueryFallback();
    if (stored) {
      setPending(stored);
      setEmail(stored.email);
    }
  }, []);

  const handleCheckStatus = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!pending || !email.trim()) {
      setMessage({ tone: 'error', text: 'Please enter the email address used for the request.' });
      return;
    }
    setMessage(null);
    setChecking(true);
    try {
      const result = await getRegistrationRequestStatus(pending.requestNumber, email.trim());
      const updated: PendingRegistrationInfo = {
        requestNumber: result.requestNumber,
        email: email.trim().toLowerCase(),
        status: result.status,
        submittedAt: result.submittedAt ?? pending.submittedAt,
      };
      setPending(updated);
      // Persist only the safe minimum (request number + email + status).
      writePendingRegistration({
        requestNumber: updated.requestNumber,
        email: updated.email,
        status: updated.status,
        submittedAt: updated.submittedAt,
      });
    } catch (err: unknown) {
      if (err instanceof RegistrationRequestError && err.kind === 'not-found') {
        // The backend deliberately masks email mismatch as 404 — preserved.
        setMessage({
          tone: 'error',
          text: 'No matching request found. Check the request number and email address.',
        });
      } else {
        setMessage({
          tone: 'error',
          text: err instanceof Error ? err.message : 'Could not check the request status.',
        });
      }
    } finally {
      setChecking(false);
    }
  };

  const handleCancel = async () => {
    if (!pending || !email.trim()) {
      setMessage({ tone: 'error', text: 'Please enter the email address used for the request.' });
      return;
    }
    setMessage(null);
    setCancelling(true);
    try {
      const result = await cancelRegistrationRequest(
        pending.requestNumber,
        email.trim(),
        generateIdempotencyKey()
      );
      setPending({
        requestNumber: result.requestNumber,
        email: email.trim().toLowerCase(),
        status: result.status,
        submittedAt: result.submittedAt ?? pending.submittedAt,
      });
      clearPendingRegistration();
      setConfirmingCancel(false);
    } catch (err: unknown) {
      setMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Could not cancel the request.',
      });
    } finally {
      setCancelling(false);
    }
  };

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (lookupRequestNumber.trim() && lookupEmail.trim()) {
      setPending({
        requestNumber: lookupRequestNumber.trim(),
        email: lookupEmail.trim(),
        status: 'pending',
        submittedAt: null,
      });
      setEmail(lookupEmail.trim());
    }
  };

  const tone = pending ? toneOf(pending.status) : 'pending';

  return (
    <AuthMintShell>
      <AuthHeading
        lead="Registration"
        accent="Submitted"
        description="Your registration request has been received and is pending review."
      />

      {pending ? (
        <div className="mt-6 space-y-4">
           {/* Request identity */}
           <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
             {loadPendingReferralCode() && (
               <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                 <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 mb-1">Referral Code Applied</p>
                 <p className="text-sm font-black text-emerald-900 font-mono">{loadPendingReferralCode()}</p>
               </div>
             )}
             <div>
              <p className="text-[13px] font-semibold text-slate-900">
                Request Number
              </p>
              <p className="mt-0.5 font-mono text-lg font-black tracking-wider text-slate-900">
                {pending.requestNumber}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <div>
                <p className="text-[13px] font-semibold text-slate-900">Status</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-slate-900">
                  <StatusIcon status={pending.status} />
                  {statusLabel(pending.status)}
                </p>
              </div>
              {pending.submittedAt && (
                <div className="text-right">
                  <p className="text-[13px] font-semibold text-slate-900">
                    Submitted
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-slate-600">
                    {new Date(pending.submittedAt).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          </div>

          {tone === 'pending' && (
            <p className="text-[13px] leading-relaxed text-slate-500">
              We will review your registration and contact you once your account is approved.
              You&apos;ll receive sign-in instructions after approval — there is nothing else
              you need to do right now.
            </p>
          )}
          {tone === 'approved' && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
              <p className="text-[13px] text-emerald-700 font-medium">
                Your registration was approved. Use the invitation details sent to your email to
                activate your account and set your password.
              </p>
              <button
                type="button"
                onClick={() => navigate(ROUTES.activate)}
                className="mt-2 min-h-[44px] text-[13px] font-bold text-emerald-700 hover:underline"
              >
                Go to Activate Account
              </button>
            </div>
          )}
          {tone === 'rejected' && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3">
              <p className="text-[13px] text-rose-600 font-medium">
                This registration request was not approved. Please contact support if you believe
                this is a mistake.
              </p>
            </div>
          )}
          {tone === 'cancelled' && (
            <div className="rounded-xl bg-white border border-slate-200 px-4 py-3">
              <p className="text-[13px] text-slate-600 font-medium">
                This registration request was cancelled. You can submit a new request at any time.
              </p>
              <button
                type="button"
                onClick={() => navigate(ROUTES.register)}
                className="mt-2 min-h-[44px] text-[13px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline"
              >
                Submit a new request
              </button>
            </div>
          )}

          {message && (
            message.tone === 'error' ? (
              <AuthError error={message.text} onDismiss={() => setMessage(null)} />
            ) : (
              <div role="status" className="mt-4 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
                <p className="text-[13px] text-blue-700 font-medium">{message.text}</p>
              </div>
            )
          )}

          {/* Status check */}
          {(tone === 'pending' || tone === 'approved') && (
            <form onSubmit={handleCheckStatus} className="space-y-3">
              <div>
                <label
                  className="mb-1.5 block text-[13px] font-semibold text-slate-900"
                  htmlFor="pending-email"
                >
                  Check registration status
                </label>
                <input
                  id="pending-email"
                  type="email"
                  autoComplete="email"
                  placeholder="Email used for the request"
                  className={authInputClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={checking || cancelling}
                />
              </div>
              <button type="submit" className={authSecondaryButtonClass} disabled={checking || cancelling}>
                {checking ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 text-emerald-600" />
                    Check Status
                  </>
                )}
              </button>
            </form>
          )}

          {/* Applicant cancellation (pending only, email-verified) */}
          {tone === 'pending' && !confirmingCancel && (
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              disabled={checking || cancelling}
              className="min-h-[44px] text-[13px] font-semibold text-slate-400 hover:text-rose-600 transition disabled:opacity-50"
            >
              Cancel this request
            </button>
          )}
          {tone === 'pending' && confirmingCancel && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3 space-y-3">
              <p className="text-[13px] font-medium text-rose-700">
                Cancel request {pending.requestNumber}? This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingCancel(false)}
                  disabled={cancelling}
                  className="flex-1 h-[52px] rounded-[16px] bg-white border border-slate-200 text-[14px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Keep Request
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1 h-[52px] rounded-[16px] bg-black text-[14px] font-bold text-white hover:bg-slate-900 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Yes, Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl bg-white border border-slate-200 px-4 py-3">
            <p className="text-[13px] text-slate-600 font-medium">
              No pending registration found on this device. Submit a request first, or check the
              status of an existing request below.
            </p>
          </div>
          <form onSubmit={handleLookup} className="space-y-3">
            <div>
              <label
                htmlFor="lookup-request-number"
                className="mb-1.5 block text-[13px] font-semibold text-slate-900"
              >
                Request Number
              </label>
              <input
                id="lookup-request-number"
                type="text"
                placeholder="Request number (e.g. CREG-2026-000001)"
                className={`${authInputClass} font-mono`}
                value={lookupRequestNumber}
                onChange={(e) => setLookupRequestNumber(e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="lookup-email"
                className="mb-1.5 block text-[13px] font-semibold text-slate-900"
              >
                Email Address
              </label>
              <input
                id="lookup-email"
                type="email"
                autoComplete="email"
                placeholder="Email used for the request"
                className={authInputClass}
                value={lookupEmail}
                onChange={(e) => setLookupEmail(e.target.value)}
              />
            </div>
            <button type="submit" className={authSecondaryButtonClass}>
              Look Up Request
            </button>
          </form>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between text-[13px]">
        <button
          type="button"
          onClick={() => navigate(ROUTES.login)}
          className="min-h-[44px] font-semibold text-slate-500 hover:text-slate-800 transition"
        >
          Back to Sign In
        </button>
        <button
          type="button"
          onClick={() => navigate(ROUTES.register)}
          className="min-h-[44px] font-semibold text-slate-500 hover:text-slate-800 transition"
        >
          New Request
        </button>
      </div>

    </AuthMintShell>
  );
}

export default CustomerRegistrationPending;
