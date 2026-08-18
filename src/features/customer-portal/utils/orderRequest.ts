/**
 * Prime PORTAL — Order Request Helpers
 *
 * Order REQUESTS (ODR-...) are the customer's submitted orders in the ERP
 * request pipeline. They are NOT official Sales Orders (SO-...) — an SO only
 * exists after the ERP converts the request. These helpers mirror the ERP
 * contract exactly (workflowEngine.cjs statuses + transitions):
 *
 *   - statuses: draft | submitted | assigned | under_review |
 *     waiting_for_customer | ready_for_conversion | converted | rejected |
 *     cancelled
 *   - cancellable (customer): draft, submitted, assigned, under_review,
 *     waiting_for_customer, ready_for_conversion — the ERP rejects cancellation
 *     of converted / rejected / cancelled requests
 *
 * The ERP remains the final authority for ownership, transitions and
 * idempotency. These helpers only drive honest UI decisions.
 */

import type { Order, OrderRequest, RequestStatus } from '../types';

/** Statuses from which the customer may cancel their own request (mirrors the ERP). */
export const CANCELABLE_REQUEST_STATUSES: readonly RequestStatus[] = [
  'draft',
  'submitted',
  'assigned',
  'under_review',
  'waiting_for_customer',
  'ready_for_conversion',
];

/** True for statuses the ERP accepts in POST /portal/requests/:id/cancel. */
export function canCancelOrderRequest(status: string): boolean {
  return (CANCELABLE_REQUEST_STATUSES as readonly string[]).includes(status);
}

/**
 * True when the ERP accepts POST /orders/:id/reorder for the order. Mirrors the
 * ERP rule: Draft and Cancelled official Sales Orders are not reorderable.
 */
export function canReorderOrder(order: Order): boolean {
  return order.status !== 'draft' && order.status !== 'cancelled';
}

/** Human-friendly label for an order-request status. */
export function getRequestStatusLabel(status: string): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'submitted':
      return 'Submitted';
    case 'assigned':
      return 'Assigned';
    case 'under_review':
      return 'Under Review';
    case 'waiting_for_customer':
      return 'Waiting for Customer';
    case 'ready_for_conversion':
      return 'Ready for Conversion';
    case 'converted':
      return 'Converted';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  }
}

/** Tailwind badge styling for an order-request status. */
export function getRequestStatusBadge(status: string): { label: string; bg: string } {
  const label = getRequestStatusLabel(status);
  switch (status) {
    case 'draft':
      return { label, bg: 'bg-slate-100 text-slate-600 border-slate-200' };
    case 'submitted':
      return { label, bg: 'bg-sky-50 text-sky-700 border-sky-200' };
    case 'assigned':
      return { label, bg: 'bg-violet-50 text-violet-700 border-violet-200' };
    case 'under_review':
      return { label, bg: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'waiting_for_customer':
      return { label, bg: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'ready_for_conversion':
      return { label, bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    case 'converted':
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
 * The official Sales Order number for a converted request, if the ERP actually
 * converted it. Sasa never fabricates an SO number — when the ERP has not
 * converted the request this is undefined and the UI shows the request state.
 */
export function officialOrderNumberFor(request: OrderRequest): string | undefined {
  return request.officialOrderNumber || undefined;
}
