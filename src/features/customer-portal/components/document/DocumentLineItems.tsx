import React from 'react';
import { Loader2 } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export interface DocumentLineItem {
  id: string;
  description: string;
  quantity: number;
  /** Unit price — rendered as an em dash when the line carries no price. */
  unitPrice?: number | null;
  total: number;
}

interface DocumentLineItemsProps {
  items: DocumentLineItem[];
  /** Accessible name of the line-item table. */
  label: string;
  /** Shown in place of the rows when the ERP has not supplied line items. */
  emptyMessage: string;
  /** Optional async-detail loading state (e.g. ERP invoice detail fetch). */
  isLoading?: boolean;
  loadingMessage?: string;
}

/**
 * Responsive line-item presentation for Portal documents.
 *
 * Desktop: proper semantic <table> (caption + scope columns). Mobile: each
 * line becomes its own readable block, so wide descriptions or currency
 * values can never force horizontal page overflow. Amounts always come from
 * the existing ERP-backed item data — nothing is recalculated here.
 */
export const DocumentLineItems: React.FC<DocumentLineItemsProps> = ({
  items,
  label,
  emptyMessage,
  isLoading = false,
  loadingMessage,
}) => {
  const busy = isLoading && items.length === 0;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{label}</h2>
        {isLoading && (
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-slate-400">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            {loadingMessage ?? 'Loading…'}
          </span>
        )}
      </div>

      {items.length === 0 && !busy ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-xs font-medium text-slate-400">
          {emptyMessage}
        </div>
      ) : busy ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-10 text-xs font-bold text-slate-500"
        >
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />
          {loadingMessage ?? 'Loading line items…'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Desktop: semantic table */}
          <div className="hidden md:block">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">{label}</caption>
              <thead>
                <tr className="bg-slate-50/80 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th scope="col" className="px-4 py-3">
                    Description
                  </th>
                  <th scope="col" className="w-20 px-3 py-3 text-right">
                    Qty
                  </th>
                  <th scope="col" className="w-32 px-3 py-3 text-right">
                    Unit
                  </th>
                  <th scope="col" className="w-40 px-4 py-3 text-right font-bold text-slate-700">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3.5">
                      <span className="block text-[13px] font-bold leading-snug text-slate-900">
                        {item.description}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-right text-xs font-bold text-slate-600 tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="px-3 py-3.5 text-right text-xs font-medium text-slate-500 finance-nums">
                      {item.unitPrice ? formatCurrency(item.unitPrice) : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right text-[13px] font-black text-slate-900 finance-nums">
                      {formatCurrency(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: readable stacked rows */}
          <ul className="divide-y divide-slate-100 md:hidden" aria-label={label}>
            {items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-4 px-4 py-3.5">
                <div className="min-w-0">
<p className="text-[13px] font-bold leading-snug text-slate-900">{item.description}</p>
                   <p className="mt-1 text-[11px] font-medium text-slate-500">
                     {item.unitPrice
                       ? `${item.quantity} × ${formatCurrency(item.unitPrice)}`
                       : `${item.quantity} unit${item.quantity !== 1 ? 's' : ''}`}
                   </p>
                </div>
                <p className="shrink-0 text-[13px] font-black text-slate-900 finance-nums">
                  {formatCurrency(item.total)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
