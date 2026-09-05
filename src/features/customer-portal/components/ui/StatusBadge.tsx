import React from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface StatusBadgeProps {
  status: string;
  label?: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
}

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; text: string; dot: string }> = {
  default:   { bg: 'bg-slate-100',  text: 'text-slate-700',  dot: 'bg-slate-500' },
  success:   { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  warning:   { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  danger:    { bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500' },
  info:      { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  neutral:   { bg: 'bg-slate-100',  text: 'text-slate-600',  dot: 'bg-slate-400' },
};

/** Resolves a raw status string to a semantic variant + human label. */
function resolveInvoiceStatus(status: string): { variant: BadgeVariant; label: string } {
  switch (status) {
    case 'paid':            return { variant: 'success', label: 'Paid' };
    case 'overdue':         return { variant: 'danger',  label: 'Overdue' };
    case 'unpaid':          return { variant: 'warning', label: 'Unpaid' };
    case 'partially_paid':  return { variant: 'info',   label: 'Partial' };
    case 'pending_verification': return { variant: 'info', label: 'Pending Verification' };
    case 'voided':          return { variant: 'neutral', label: 'Voided' };
    default:                 return { variant: 'neutral', label: status };
  }
}

function resolveDeliveryStatus(status: string): { variant: BadgeVariant; label: string } {
  switch (status) {
    case 'delivered':         return { variant: 'success', label: 'Delivered & Signed' };
    case 'out_for_delivery': return { variant: 'info',    label: 'Out for Delivery' };
    case 'dispatched':        return { variant: 'info',   label: 'Dispatched' };
    case 'processing':        return { variant: 'warning', label: 'Processing' };
    case 'delayed':           return { variant: 'danger',  label: 'Delayed' };
    case 'order_placed':      return { variant: 'neutral', label: 'Order Placed' };
    default:                   return { variant: 'neutral', label: status };
  }
}

function resolveQuoteStatus(status: string): { variant: BadgeVariant; label: string } {
  switch (status) {
    case 'accepted':            return { variant: 'success', label: 'Accepted' };
    case 'converted':           return { variant: 'success', label: 'Converted' };
    case 'quoted':              return { variant: 'info',   label: 'Ready to Review' };
    case 'pending_review':      return { variant: 'warning', label: 'In Review' };
    case 'revision_requested':  return { variant: 'warning', label: 'Revision Requested' };
    case 'declined':            return { variant: 'danger',  label: 'Declined' };
    case 'expired':            return { variant: 'neutral', label: 'Expired' };
    default:                    return { variant: 'neutral', label: status };
  }
}

function resolveReferralStatus(status: string): { variant: BadgeVariant; label: string } {
  switch (status) {
    case 'pending':    return { variant: 'neutral', label: 'Pending' };
    case 'registered': return { variant: 'info',    label: 'Registered' };
    case 'active':     return { variant: 'success', label: 'Active' };
    case 'qualified':  return { variant: 'info',    label: 'Qualified' };
    case 'rewarded':   return { variant: 'success', label: 'Rewarded' };
    case 'reversed':   return { variant: 'danger',  label: 'Reversed' };
    case 'converted':   return { variant: 'success', label: 'Converted' };
    case 'expired':    return { variant: 'warning', label: 'Expired' };
    case 'cancelled':  return { variant: 'neutral', label: 'Cancelled' };
    default:            return { variant: 'neutral', label: status };
  }
}

function resolveOrderStatus(status: string): { variant: BadgeVariant; label: string } {
  switch (status) {
    case 'fulfilled':   return { variant: 'success', label: 'Fulfilled' };
    case 'delivered':   return { variant: 'success', label: 'Delivered' };
    case 'confirmed':   return { variant: 'info',    label: 'Confirmed' };
    case 'shipped':     return { variant: 'info',    label: 'Shipped' };
    case 'processing':  return { variant: 'warning', label: 'Processing' };
    case 'pending':     return { variant: 'warning', label: 'Pending' };
    case 'cancelled':   return { variant: 'danger',  label: 'Cancelled' };
    case 'draft':       return { variant: 'neutral', label: 'Draft' };
    default:             return { variant: 'neutral', label: status };
  }
}

function resolveTicketStatus(status: string): { variant: BadgeVariant; label: string } {
  switch (status) {
    case 'resolved':     return { variant: 'success', label: 'Resolved' };
    case 'in_progress': return { variant: 'info',    label: 'In Progress' };
    case 'open':        return { variant: 'warning', label: 'Open' };
    case 'closed':      return { variant: 'neutral', label: 'Closed' };
    default:             return { variant: 'neutral', label: status };
  }
}

function resolveRewardStatus(status: string): { variant: BadgeVariant; label: string } {
  switch (status) {
    case 'pending':   return { variant: 'warning', label: 'Pending' };
    case 'approved': return { variant: 'success', label: 'Approved' };
    case 'paid':     return { variant: 'info',   label: 'Paid' };
    case 'cancelled': return { variant: 'neutral', label: 'Cancelled' };
    default:          return { variant: 'neutral', label: status };
  }
}

/**
 * Unified StatusBadge — replaces the three get*Badge helpers in formatters.ts.
 *
 * Usage:
 *   <StatusBadge status="overdue" type="invoice" />
 *   <StatusBadge status="delivered" type="delivery" />
 *   <StatusBadge status="accepted" type="quote" />
 */
export const StatusBadge: React.FC<StatusBadgeProps & { type?: 'invoice' | 'delivery' | 'quote' | 'order' | 'ticket' | 'referral' | 'reward' }> = ({
  status,
  label,
  variant,
  size = 'sm',
  dot = true,
  type,
}) => {
  const resolved = (() => {
    if (variant && label) return { variant, label };
    if (!type) {
      const v = resolveInvoiceStatus(status);
      return { variant: v.variant, label: label ?? v.label };
    }
    switch (type) {
      case 'invoice':  return { variant: resolveInvoiceStatus(status).variant,   label: label ?? resolveInvoiceStatus(status).label };
      case 'delivery': return { variant: resolveDeliveryStatus(status).variant, label: label ?? resolveDeliveryStatus(status).label };
      case 'quote':    return { variant: resolveQuoteStatus(status).variant,   label: label ?? resolveQuoteStatus(status).label };
      case 'order':    return { variant: resolveOrderStatus(status).variant,   label: label ?? resolveOrderStatus(status).label };
      case 'ticket':   return { variant: resolveTicketStatus(status).variant,  label: label ?? resolveTicketStatus(status).label };
      case 'referral': return { variant: resolveReferralStatus(status).variant,label: label ?? resolveReferralStatus(status).label };
      case 'reward':   return { variant: resolveRewardStatus(status).variant,  label: label ?? resolveRewardStatus(status).label };
      default:         return { variant: 'neutral' as BadgeVariant,            label: label ?? status };
    }
  })();

  const styles = VARIANT_STYLES[resolved.variant];
  const sizeClass = size === 'sm'
    ? 'text-[10px] font-bold px-2 py-0.5'
    : 'text-xs font-bold px-2.5 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-transparent font-black uppercase tracking-wide ${styles.bg} ${styles.text} ${sizeClass}`}
    >
      {dot && (
        <span className={`h-1.5 w-1.5 rounded-full ${styles.dot} shrink-0`} aria-hidden="true" />
      )}
      {resolved.label}
    </span>
  );
};
