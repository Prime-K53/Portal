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
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, Loader2, Search, XCircle } from 'lucide-react';
import { useHashRoute } from '../../router/useHashRoute';
import { ROUTES } from '../../router/routes';
import { AuthShell } from './AuthShell';
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

const buttonClass =
  'w-full h-11 rounded-xl bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] text-white text-sm font-bold shadow-lg shadow-blue-900/30 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 transition-all';

const secondaryButtonClass =
  'w-full h-11 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all';

const inputClass =
  'w-full h-11 px-4 bg-slate-50/80 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/60 transition';

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

  const tone = pending ? toneOf(pending.status) : 'pending';

  return (
    <AuthShell>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] shadow-lg shadow-blue-900/30">
          <StatusIcon status={pending?.status ?? 'pending'} />
        </div>
        <div>
          <h1 className="text-lg font-black tracking-tight text-slate-900">
            Prime <span className="text-[#2563eb]">PORTAL</span>
          </h1>
          <p className="text-xs font-medium text-slate-500">Smart. Simple. School Supplies.</p>
        </div>
      </div>

      <div className="mt-6 space-y-1">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
          Registration Submitted
        </h2>
        <p className="text-sm text-slate-500">
          Your registration request has been received and is pending review.
        </p>
      </div>

      {pending ? (
        <div className="mt-6 space-y-4">
          {/* Request identity */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Request Number
              </p>
              <p className="mt-0.5 font-mono text-lg font-black tracking-wider text-slate-900">
                {pending.requestNumber}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Status</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-slate-900">
                  <StatusIcon status={pending.status} />
                  {statusLabel(pending.status)}
                </p>
              </div>
              {pending.submittedAt && (
                <div className="text-right">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
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
            <p className="text-xs leading-relaxed text-slate-500">
              We will review your registration and contact you once your account is approved.
              You&apos;ll receive sign-in instructions after approval — there is nothing else
              you need to do right now.
            </p>
          )}
          {tone === 'approved' && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
              <p className="text-sm text-emerald-700 font-medium">
                Your registration was approved. Use the invitation details sent to your email to
                activate your account and set your password.
              </p>
              <button
                type="button"
                onClick={() => navigate(ROUTES.activate)}
                className="mt-2 text-sm font-bold text-emerald-700 hover:underline"
              >
                Go to Activate Account
              </button>
            </div>
          )}
          {tone === 'rejected' && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3">
              <p className="text-sm text-rose-600 font-medium">
                This registration request was not approved. Please contact support if you believe
                this is a mistake.
              </p>
            </div>
          )}
          {tone === 'cancelled' && (
            <div className="rounded-xl bg-slate-100 border border-slate-200 px-4 py-3">
              <p className="text-sm text-slate-600 font-medium">
                This registration request was cancelled. You can submit a new request at any time.
              </p>
              <button
                type="button"
                onClick={() => navigate(ROUTES.register)}
                className="mt-2 text-sm font-bold text-blue-600 hover:text-blue-700 hover:underline"
              >
                Submit a new request
              </button>
            </div>
          )}

          {message && (
            <div
              className={
                message.tone === 'error'
                  ? 'rounded-xl bg-red-50 border border-red-200 px-4 py-3'
                  : 'rounded-xl bg-blue-50 border border-blue-200 px-4 py-3'
              }
            >
              <p
                className={
                  message.tone === 'error'
                    ? 'text-sm text-red-600 font-medium'
                    : 'text-sm text-blue-700 font-medium'
                }
              >
                {message.text}
              </p>
            </div>
          )}

          {/* Status check */}
          {(tone === 'pending' || tone === 'approved') && (
            <form onSubmit={handleCheckStatus} className="space-y-3">
              <div>
                <label
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600"
                  htmlFor="pending-email"
                >
                  Check registration status
                </label>
                <input
                  id="pending-email"
                  type="email"
                  autoComplete="email"
                  placeholder="Email used for the request"
                  className={inputClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={checking || cancelling}
                />
              </div>
              <button type="submit" className={secondaryButtonClass} disabled={checking || cancelling}>
                {checking ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
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
              className="text-xs font-semibold text-slate-400 hover:text-rose-600 transition disabled:opacity-50"
            >
              Cancel this request
            </button>
          )}
          {tone === 'pending' && confirmingCancel && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3 space-y-3">
              <p className="text-xs font-medium text-rose-700">
                Cancel request {pending.requestNumber}? This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingCancel(false)}
                  disabled={cancelling}
                  className="flex-1 h-10 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Keep Request
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1 h-10 rounded-xl bg-rose-600 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50 flex items-center justify-center gap-1.5"
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
          <div className="rounded-xl bg-slate-100 border border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-600 font-medium">
              No pending registration found on this device. Submit a request first, or check the
              status of an existing request below.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const data = new FormData(form);
              const requestNumber = String(data.get('requestNumber') ?? '').trim();
              const lookupEmail = String(data.get('email') ?? '').trim();
              if (requestNumber && lookupEmail) {
                setPending({ requestNumber, email: lookupEmail, status: 'pending', submittedAt: null });
                setEmail(lookupEmail);
              }
            }}
            className="space-y-3"
          >
            <input
              name="requestNumber"
              type="text"
              placeholder="Request number (e.g. CREG-2026-000001)"
              className={`${inputClass} font-mono`}
            />
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="Email used for the request"
              className={inputClass}
            />
            <button type="submit" className={secondaryButtonClass}>
              Look Up Request
            </button>
          </form>
        </div>
      )}

      <div className="mt-6 border-t border-slate-100 pt-5 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => navigate(ROUTES.login)}
          className="font-semibold text-slate-500 hover:text-blue-700 transition"
        >
          Back to Sign In
        </button>
        <button
          type="button"
          onClick={() => navigate(ROUTES.register)}
          className="font-semibold text-slate-500 hover:text-blue-700 transition"
        >
          New Request
        </button>
      </div>
    </AuthShell>
  );
}

export default CustomerRegistrationPending;
