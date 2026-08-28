export const formatCurrency = (amount: number): string => {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return 'K 0.00';
  }
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `K ${formatted}`;
};

/**
 * Compact currency formatter for dashboard KPI cards.
 * Renders whole numbers without trailing decimals (e.g. `K 200,000` instead
 * of `K 200,000.00`). Use ONLY where the two-decimal precision is not
 * needed at a glance — full-precision totals still use `formatCurrency`.
 */
export const formatCurrencyCompact = (amount: number): string => {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return 'K 0';
  }
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
  return `K ${formatted}`;
};

export const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

export const formatDateTime = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

export const getInvoiceStatusBadge = (status: string) => {
  switch (status) {
    case 'paid':
      return {
        label: 'Paid',
        bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
      };
    case 'overdue':
      return {
        label: 'Overdue',
        bg: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-800',
      };
    case 'unpaid':
      return {
        label: 'Unpaid',
        bg: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800',
      };
    case 'partially_paid':
      return {
        label: 'Partial',
        bg: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 border-sky-200 dark:border-sky-800',
      };
    case 'pending_verification':
      return {
        label: 'Pending Verification',
        bg: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border-purple-200 dark:border-purple-800',
      };
    default:
      return {
        label: status,
        bg: 'bg-slate-100 text-slate-700 border-slate-200',
      };
  }
};

export const getDeliveryStatusBadge = (status: string) => {
  switch (status) {
    case 'delivered':
      return {
        label: 'Delivered',
        bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
      };
    case 'out_for_delivery':
      return {
        label: 'Out for Delivery',
        bg: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-800',
      };
    case 'dispatched':
      return {
        label: 'Dispatched',
        bg: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
      };
    case 'processing':
      return {
        label: 'Processing',
        bg: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800',
      };
    case 'delayed':
      return {
        label: 'Delayed',
        bg: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-800',
      };
    default:
      return {
        label: 'Order Placed',
        bg: 'bg-slate-100 text-slate-700 border-slate-200',
      };
  }
};

export const getQuoteStatusBadge = (status: string) => {
  switch (status) {
    case 'accepted':
      return {
        label: 'Accepted',
        bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
      };
    case 'quoted':
      return {
        label: 'Ready to Review',
        bg: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
      };
    case 'pending_review':
      return {
        label: 'In Review',
        bg: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800',
      };
    case 'declined':
      return {
        label: 'Declined',
        bg: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-800',
      };
    case 'revision_requested':
      return {
        label: 'Revision Requested',
        bg: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800',
      };
    case 'converted':
      return {
        label: 'Converted',
        bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
      };
    case 'expired':
      return {
        label: 'Expired',
        bg: 'bg-slate-100 text-slate-600 border-slate-200',
      };
    default:
      return {
        label: status,
        bg: 'bg-slate-100 text-slate-700 border-slate-200',
      };
  }
};
