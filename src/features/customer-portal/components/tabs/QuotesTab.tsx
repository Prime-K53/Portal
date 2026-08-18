import React from 'react';
import {
  CheckCircle2,
  FileSpreadsheet,
  MessageSquareQuote,
  Plus,
  RefreshCcw,
  XCircle,
} from 'lucide-react';
import { Quotation } from '../../types';
import { formatCurrency, formatDate, getQuoteStatusBadge } from '../../utils/formatters';

interface QuotesTabProps {
  quotes: Quotation[];
  onCreateQuote: () => void;
  onAcceptQuotation: (quotationId: string) => void;
  onRejectQuotation: (quotationId: string) => void;
  onRequestRevision: (quotationId: string) => void;
}

export const QuotesTab: React.FC<QuotesTabProps> = ({
  quotes,
  onCreateQuote,
  onAcceptQuotation,
  onRejectQuotation,
  onRequestRevision,
}) => {
  return (
    <div className="space-y-4 pb-20 text-slate-900">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-2xl bg-indigo-600 text-white shadow-xs">
            <MessageSquareQuote className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Quotations</h2>
            <p className="text-xs text-slate-500">Commercial quotations issued by the ERP — review, accept, reject, or request a revision</p>
          </div>
        </div>
        <button
          onClick={onCreateQuote}
          className="shrink-0 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Quote
        </button>
      </div>

      {/* Quote List */}
      <div className="space-y-3">
        {[...quotes].sort((a, b) => new Date(b.issuedDate).getTime() - new Date(a.issuedDate).getTime()).map((q) => {
          const statusInfo = getQuoteStatusBadge(q.status);
          const isActionable = q.status === 'quoted';

          return (
            <div
              key={q.id}
              className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-slate-900 space-y-3 shadow-2xs"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-slate-900">{q.quotationNumber}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusInfo.bg}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-slate-500 mt-0.5">Issued on {formatDate(q.issuedDate)}</p>
                </div>

                <div className="text-right">
                  <span className="text-sm font-medium text-slate-900 block finance-nums">{formatCurrency(q.total)}</span>
                  <span className="text-[11.5px] text-slate-400">Valid until {q.validUntil ? formatDate(q.validUntil) : '—'}</span>
                </div>
              </div>

              {/* Line Items */}
              <div>
                <span className="text-[11.5px] text-slate-400 uppercase tracking-wider font-bold block mb-1.5">Line Items</span>
                <div className="divide-y divide-slate-200 bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {q.items.map((item, idx) => (
                    <div key={item.id ?? `qi_${idx}`} className="flex justify-between items-center gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900">{item.quantity}x {item.description}</span>
                      </div>
                        <div className="text-right shrink-0 pl-3">
                          <span className="text-slate-500 font-mono text-[12.5px] block finance-nums">{formatCurrency(item.unitPrice)} / unit</span>
                          <span className="text-slate-900 font-medium text-[12.5px] finance-nums">{formatCurrency(item.total)}</span>
                        </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between text-slate-500 font-medium">
                  <span>Subtotal</span>
                  <span className="finance-nums">{formatCurrency(q.subtotal)}</span>
                </div>
                {q.discount ? (
                  <div className="flex justify-between text-slate-500 font-medium">
                    <span>Discount</span>
                    <span className="finance-nums">-{formatCurrency(q.discount)}</span>
                  </div>
                ) : null}
                {q.tax ? (
                  <div className="flex justify-between text-slate-500 font-medium">
                    <span>Tax</span>
                    <span className="finance-nums">{formatCurrency(q.tax)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1 mt-1">
                  <span>Total</span>
                  <span className="finance-nums">{formatCurrency(q.total)}</span>
                </div>
              </div>

              {/* Terms & Notes */}
              {q.notes && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-900 leading-relaxed">
                  <span className="font-bold text-blue-950 block mb-0.5">Payment Terms:</span>
                  {q.notes}
                </div>
              )}

              {/* Actions */}
              {isActionable && (
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                  <span className="text-[12.5px] text-emerald-700 font-bold">Quote ready for your decision</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onRequestRevision(q.id)}
                      className="px-3 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-extrabold text-xs shadow-xs flex items-center gap-1.5 transition"
                      title="Request changes to this quotation"
                    >
                      <RefreshCcw className="w-3.5 h-3.5" />
                      <span>Request Revision</span>
                    </button>
                    <button
                      onClick={() => onRejectQuotation(q.id)}
                      className="px-3 py-2 rounded-xl border border-rose-300 text-rose-700 hover:bg-rose-50 font-extrabold text-xs shadow-xs flex items-center gap-1.5 transition"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Decline</span>
                    </button>
                    <button
                      onClick={() => onAcceptQuotation(q.id)}
                      className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-xs flex items-center gap-1.5 transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Accept</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};