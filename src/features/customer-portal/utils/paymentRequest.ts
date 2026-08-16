/**
 * Prime PORTAL — Payment Request Helpers
 *
 * Payment requests are NON-ACCOUNTING bank-transfer intentions (workflow data
 * only). These helpers mirror the ERP contract exactly:
 *
 *   - statuses: requested | under_review | confirmed | rejected | cancelled
 *   - ACTIVE statuses (block a duplicate request for the same invoice):
 *     requested, under_review  ← matches the ERP's ACTIVE_STATUSES
 *   - payment method: always 'Bank Transfer'
 *
 * The ERP remains the final authority for duplicate protection, amount
 * validation and invoice ownership. These helpers only drive honest UI
 * decisions (show the form, or show the existing request state instead).
 */

import type { Invoice, PaymentRequest, PaymentRequestStatus } from '../types';

/** The only payment-request method the ERP accepts. */
export const BANK_TRANSFER_METHOD_LABEL = 'Bank Transfer';

/**
 * Statuses that block a duplicate active request for the same invoice.
 * Mirrors the ERP ACTIVE_STATUSES (requested, under_review) — confirmed is a
 * terminal state from which the ERP allows a new request.
 */
export const PAYMENT_REQUEST_ACTIVE_STATUSES: readonly PaymentRequestStatus[] = ['requested', 'under_review'];

/** True for statuses that block a duplicate request (ERP-authoritative set). */
export function isActivePaymentRequestStatus(status: string): boolean {
  return (PAYMENT_REQUEST_ACTIVE_STATUSES as readonly string[]).includes(status);
}

/** Human-friendly label for a payment-request status (Phase 6). */
export function getPaymentRequestStatusLabel(status: string): string {
  switch (status) {
    case 'requested':
      return 'Requested';
    case 'under_review':
      return 'Under Review';
    case 'confirmed':
      return 'Confirmed';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  }
}

/** Tailwind badge styling for a payment-request status. */
export function getPaymentRequestStatusBadge(status: string): { label: string; bg: string } {
  const label = getPaymentRequestStatusLabel(status);
  switch (status) {
    case 'requested':
    case 'under_review':
      return { label, bg: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'confirmed':
      return { label, bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'rejected':
      return { label, bg: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'cancelled':
      return { label, bg: 'bg-slate-100 text-slate-600 border-slate-200' };
    default:
      return { label, bg: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
}

/**
 * The customer's active payment request for an invoice, if one exists.
 * Only ERP-active statuses (requested / under_review) block a new request —
 * rejected and cancelled requests are terminal and a new request is allowed.
 */
export function findActivePaymentRequestForInvoice(
  invoiceId: string,
  requests: PaymentRequest[]
): PaymentRequest | undefined {
  return requests.find((request) => request.invoiceId === invoiceId && isActivePaymentRequestStatus(request.status));
}

/** The most recent non-active request for an invoice (informational only). */
export function findLatestTerminalPaymentRequestForInvoice(
  invoiceId: string,
  requests: PaymentRequest[]
): PaymentRequest | undefined {
  return requests.find((request) => request.invoiceId === invoiceId && !isActivePaymentRequestStatus(request.status));
}

/**
 * Whether the invoice can accept a new bank-transfer payment request.
 * The displayed amount is always the authoritative ERP outstanding balance —
 * a request is never offered for an invoice with no outstanding balance.
 */
export function canRequestPayment(invoice: Invoice): boolean {
  return invoice.amountRemaining > 0;
}

/** Default request amount: the full outstanding balance (Phase 3). */
export function defaultPaymentRequestAmount(invoice: Invoice): number {
  return Math.max(0, invoice.amountRemaining);
}

/**
 * Client-side usability guard only — the ERP remains authoritative and
 * re-validates the outstanding balance on submit. Returns an error message or
 * null when the amount is acceptable.
 */
export function validateRequestedAmount(amount: number, invoice: Invoice): string | null {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Enter a positive amount to request.';
  }
  if (amount > invoice.amountRemaining) {
    return `The request cannot exceed the outstanding balance of ${invoice.amountRemaining}.`;
  }
  return null;
}
