import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Landmark,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { Invoice, PaymentRequest } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  BANK_TRANSFER_METHOD_LABEL,
  canRequestPayment,
  defaultPaymentRequestAmount,
  findActivePaymentRequestForInvoice,
  findLatestTerminalPaymentRequestForInvoice,
  getPaymentRequestStatusBadge,
  validateRequestedAmount,
} from '../../utils/paymentRequest';
import { usePaymentRequestsData } from '../../hooks/usePortalData';

interface PaymentRequestModalProps {
  invoice: Invoice | null;
  onClose: () => void;
  /**
   * Submits a bank-transfer payment REQUEST to the ERP (POST
   * /api/portal/payment-requests). Resolves with the created request — never
   * with a payment. Rejects (ApiError) when the ERP refuses the request.
   */
  onSubmitPaymentRequest: (invoiceId: string, requestedAmount: number, note: string) => Promise<PaymentRequest>;
}

/**
 * Bank Transfer payment-request flow:
 *
 *   Invoice → Request Payment → Bank Transfer → Request Bank Payment → Confirmation
 *
 * A payment request is a NON-ACCOUNTING intention — it never marks the invoice
 * as paid, records a payment, or moves money. The ERP is authoritative for
 * customer identity, invoice ownership, amount validation and duplicate
 * protection; this modal only drives honest UI decisions.
 */
export const PaymentRequestModal: React.FC<PaymentRequestModalProps> = ({ invoice, onClose, onSubmitPaymentRequest }) => {
  // Phase 5: determine from the ERP whether an ACTIVE request already exists
  // for this invoice before presenting the new-request form. Only fetched
  // while the modal is open (no ERP call when invoice is null).
  const requestsQuery = usePaymentRequestsData(Boolean(invoice));
  const requests = requestsQuery.data ?? [];

  const [amountInput, setAmountInput] = useState<string>('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [createdRequest, setCreatedRequest] = useState<PaymentRequest | null>(null);

  const invoiceId = invoice?.id ?? null;

  // Reset local state whenever a different invoice is opened.
  useEffect(() => {
    setAmountInput(invoice ? String(defaultPaymentRequestAmount(invoice)) : '');
    setNote('');
    setIsSubmitting(false);
    setFormError('');
    setCreatedRequest(null);
  }, [invoiceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // True while the modal is open and the ERP list has not been fetched yet.
  // Derived (not just requestsQuery.isLoading) so the form can never flash
  // before the duplicate check completes on the first open.
  const checking = Boolean(invoice) && requestsQuery.data === null && !requestsQuery.error;

  const activeRequest = useMemo(
    () => (invoice ? findActivePaymentRequestForInvoice(invoice.id, requests) : undefined),
    [invoice, requests]
  );
  const terminalRequest = useMemo(
    () => (invoice ? findLatestTerminalPaymentRequestForInvoice(invoice.id, requests) : undefined),
    [invoice, requests]
  );

  if (!invoice) return null;

  const statusBadge = (request: PaymentRequest) => {
    const badge = getPaymentRequestStatusBadge(request.status);
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg}`}>{badge.label}</span>
    );
  };

  const handleSubmit = async () => {
    if (!invoice || isSubmitting) return;

    const amount = Number(amountInput);
    const validation = validateRequestedAmount(amount, invoice);
    if (validation) {
      setFormError(validation);
      return;
    }

    setIsSubmitting(true);
    setFormError('');
    try {
      const created = await onSubmitPaymentRequest(invoice.id, amount, note.trim());
      setCreatedRequest(created);
      // Phase 9: refresh the payment-request state from the ERP so a re-open
      // shows the active request instead of a misleading new-request form.
      requestsQuery.refetch();
    } catch (err) {
      // Real API failure — never a fake success. The ERP message (duplicate,
      // invalid amount, outstanding changed, invoice not found) is shown as-is.
      setFormError(err instanceof Error ? err.message : 'The payment request could not be submitted. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setCreatedRequest(null);
    setFormError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-white border border-slate-200 text-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-100 text-slate-800 rounded-xl border border-slate-200">
              <Landmark className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">Request Bank Transfer Payment</h3>
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-slate-400" /> Request to pay by bank transfer — not a payment
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {createdRequest ? (
            /* ── Success State (Phase 7) — "Bank Transfer Request Sent" ── */
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-200">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xl font-black text-slate-900">Bank Transfer Request Sent</h4>
                <p className="text-xs text-slate-600 font-medium leading-relaxed max-w-sm mx-auto">
                  Your request has been submitted for review. This request does not mark your invoice as paid.
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-left text-xs space-y-2.5 font-medium">
                <div className="flex justify-between items-center text-slate-500">
                  <span>Request Number:</span>
                  <strong className="text-slate-900 font-mono text-xs">{createdRequest.requestNumber}</strong>
                </div>
                <div className="flex justify-between items-center text-slate-500">
                  <span>Invoice Number:</span>
                  <strong className="text-slate-900 font-mono text-xs">{createdRequest.invoiceNumber ?? invoice.invoiceNumber}</strong>
                </div>
                <div className="flex justify-between items-center text-slate-500">
                  <span>Requested Amount:</span>
                  <span className="text-slate-900 font-black tabular-nums">{formatCurrency(createdRequest.requestedAmount)}</span>
                </div>
                <div className="flex justify-between items-center text-slate-500">
                  <span>Payment Method:</span>
                  <span className="text-slate-900 font-bold">{createdRequest.paymentMethod || BANK_TRANSFER_METHOD_LABEL}</span>
                </div>
                <div className="flex justify-between items-center text-slate-500 pt-2 border-t border-slate-200">
                  <span>Current Status:</span>
                  {statusBadge(createdRequest)}
                </div>
                <div className="flex justify-between items-center text-slate-500">
                  <span>Requested On:</span>
                  <span className="text-slate-700">{createdRequest.requestedAt ? formatDate(createdRequest.requestedAt) : new Date().toLocaleDateString()}</span>
                </div>
              </div>

              <div className="p-3 bg-amber-50/90 border border-amber-200/90 rounded-2xl text-amber-900 text-xs font-medium text-left flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  The invoice is not marked as paid. Once our team reviews your request and verifies the bank
                  transfer, the payment is recorded in the ERP ledger.
                </p>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleClose}
                  className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm shadow-xs transition"
                >
                  Return to Portal
                </button>
              </div>
            </div>
          ) : checking ? (
            /* ── Checking for an existing active request ── */
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-500">
              <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
              <p className="text-xs font-semibold tracking-wide">Checking for existing payment requests...</p>
            </div>
          ) : requestsQuery.error ? (
            /* ── Cannot verify duplicate state → never present a misleading form ── */
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="p-3 rounded-2xl border bg-amber-50 border-amber-100">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <h4 className="text-sm font-extrabold text-slate-700">Unable to check your payment requests</h4>
              <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                {requestsQuery.error instanceof Error
                  ? requestsQuery.error.message
                  : 'We could not verify whether you already have a pending request for this invoice.'}
              </p>
              <button
                type="button"
                onClick={requestsQuery.refetch}
                className="mt-1 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold rounded-xl transition"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                Try Again
              </button>
            </div>
          ) : activeRequest ? (
            /* ── Phase 5: an ACTIVE request exists → show its state, no new form ── */
            <div className="space-y-4">
              <div className="p-4 bg-amber-50/90 border border-amber-200/90 rounded-2xl text-amber-900 text-xs font-medium flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-extrabold text-amber-950 block text-xs">Request Already Submitted</span>
                  <p className="text-[12.5px] leading-relaxed">
                    You already have an active payment request for this invoice. It is under review by our team —
                    you cannot submit another request until it is resolved.
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-left text-xs space-y-2.5 font-medium">
                <div className="flex justify-between items-center text-slate-500">
                  <span>Request Number:</span>
                  <strong className="text-slate-900 font-mono text-xs">{activeRequest.requestNumber}</strong>
                </div>
                <div className="flex justify-between items-center text-slate-500">
                  <span>Invoice Number:</span>
                  <strong className="text-slate-900 font-mono text-xs">{activeRequest.invoiceNumber ?? invoice.invoiceNumber}</strong>
                </div>
                <div className="flex justify-between items-center text-slate-500">
                  <span>Requested Amount:</span>
                  <span className="text-slate-900 font-black tabular-nums">{formatCurrency(activeRequest.requestedAmount)}</span>
                </div>
                <div className="flex justify-between items-center text-slate-500">
                  <span>Payment Method:</span>
                  <span className="text-slate-900 font-bold">{activeRequest.paymentMethod || BANK_TRANSFER_METHOD_LABEL}</span>
                </div>
                <div className="flex justify-between items-center text-slate-500 pt-2 border-t border-slate-200">
                  <span>Current Status:</span>
                  {statusBadge(activeRequest)}
                </div>
                {activeRequest.note && (
                  <div className="flex justify-between items-start gap-3 text-slate-500">
                    <span className="shrink-0">Your Note:</span>
                    <span className="text-slate-700 text-right">{activeRequest.note}</span>
                  </div>
                )}
                {activeRequest.requestedAt && (
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Requested On:</span>
                    <span className="text-slate-700">{formatDate(activeRequest.requestedAt)}</span>
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button
                  onClick={handleClose}
                  className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm shadow-xs transition"
                >
                  Return to Portal
                </button>
              </div>
            </div>
          ) : !canRequestPayment(invoice) ? (
            /* ── No outstanding balance → no request is offered ── */
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs text-center font-bold">
              This invoice has no outstanding balance. There is nothing to request payment for.
            </div>
          ) : (
            /* ── The Bank Transfer request form ── */
            <>
              {/* Intention notice — this is a REQUEST, not an immediate payment */}
              <div className="p-3.5 bg-sky-50/90 border border-sky-200/90 rounded-2xl text-sky-900 text-xs font-medium flex items-start gap-3 shadow-2xs">
                <ShieldCheck className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                <p className="text-[12.5px] leading-relaxed">
                  Submit a request to pay this invoice by bank transfer. Your request will be reviewed by our team.
                  This does not mark the invoice as paid.
                </p>
              </div>

              {/* Invoice summary (authoritative ERP data) */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-left text-xs space-y-2.5 font-medium">
                <div className="flex justify-between items-center text-slate-500">
                  <span>Invoice:</span>
                  <strong className="text-slate-900 font-mono text-xs flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    {invoice.invoiceNumber}
                  </strong>
                </div>
                <div className="flex justify-between items-center text-slate-500">
                  <span>Invoice Total:</span>
                  <span className="text-slate-900 font-black tabular-nums">{formatCurrency(invoice.amount)}</span>
                </div>
                <div className="flex justify-between items-center text-slate-500">
                  <span>Outstanding Balance:</span>
                  <span className="text-slate-900 font-black tabular-nums text-sm">{formatCurrency(invoice.amountRemaining)}</span>
                </div>
              </div>

              {/* Requested amount */}
              <div>
                <label htmlFor="pr-amount" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Requested Amount (Bank Transfer)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">K</span>
                  <input
                    id="pr-amount"
                    type="number"
                    min="0.01"
                    max={invoice.amountRemaining}
                    step="0.01"
                    value={amountInput}
                    onChange={(e) => {
                      setAmountInput(e.target.value);
                      setFormError('');
                    }}
                    className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-8 pr-3 text-sm font-bold text-slate-900 tabular-nums focus:outline-none focus:border-slate-900 shadow-2xs"
                  />
                </div>
                <p className="text-[11.5px] text-slate-400 mt-1.5 font-medium">
                  Pre-filled with the full outstanding balance. The ERP re-validates the amount and invoice ownership
                  when you submit.
                </p>
              </div>

              {/* Optional customer note */}
              <div>
                <label htmlFor="pr-note" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Note (optional)
                </label>
                <textarea
                  id="pr-note"
                  rows={3}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note for the finance team (e.g. bank reference or expected transfer date)."
                  className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-normal text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900 shadow-2xs resize-none"
                />
              </div>

              {terminalRequest && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11.5px] text-slate-500 font-medium leading-relaxed">
                  A previous request ({terminalRequest.requestNumber}) for this invoice was{' '}
                  <strong className="text-slate-700">{getPaymentRequestStatusBadge(terminalRequest.status).label}</strong>.
                  You may submit a new request.
                </div>
              )}

              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium leading-relaxed">
                  {formError}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        {!createdRequest && !checking && !requestsQuery.error && !activeRequest && canRequestPayment(invoice) && (
          <div className="p-4 bg-white border-t border-slate-200 flex items-center gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              disabled={isSubmitting}
              onClick={handleSubmit}
              className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting Request...</span>
                </>
              ) : (
                <>
                  <Landmark className="w-4 h-4" />
                  <span>Request Bank Payment</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
