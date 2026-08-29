import React, { useId, useRef } from 'react';
import { Calendar, FileText, X } from 'lucide-react';
import type { Quotation, QuoteRequest, QuotationItem, QuoteRequestItem } from '../../types';
import { formatCurrency, formatDate, getQuoteStatusBadge } from '../../utils/formatters';
import { useFocusTrap } from '../../utils/useFocusTrap';

interface QuotationDetailModalProps {
  quotation: Quotation | QuoteRequest | null;
  onClose: () => void;
}

function isQuotation(q: Quotation | QuoteRequest): q is Quotation {
  return 'quotationNumber' in q && 'issuedDate' in q && 'validUntil' in q;
}

function isQuotationItem(item: QuotationItem | QuoteRequestItem): item is QuotationItem {
  return 'description' in item && 'unitPrice' in item && 'total' in item;
}

export const QuotationDetailModal: React.FC<QuotationDetailModalProps> = ({
  quotation,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(containerRef, { active: quotation !== null, onEscape: onClose });

  if (!quotation) return null;

  const statusInfo = getQuoteStatusBadge(quotation.status);
  const number = isQuotation(quotation) ? quotation.quotationNumber : quotation.quoteNumber;
  const date = isQuotation(quotation) ? quotation.issuedDate : quotation.requestDate;
  const validOrRequiredDate = isQuotation(quotation) ? quotation.validUntil : quotation.requiredByDate;
  const total = isQuotation(quotation) ? quotation.total : (quotation.estimatedTotal ?? 0);
  const items = quotation.items;
  const subtotal = isQuotation(quotation) ? quotation.subtotal : total;
  const discount = isQuotation(quotation) ? quotation.discount : undefined;
  const tax = isQuotation(quotation) ? quotation.tax : undefined;
  const notes = isQuotation(quotation) ? quotation.notes : quotation.adminNotes;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg bg-white border border-slate-200 text-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-100 text-slate-800 rounded-xl border border-slate-200" aria-hidden="true">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id={titleId} className="font-extrabold text-base text-slate-900">{number}</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusInfo.bg}`}>
                  {statusInfo.label}
                </span>
              </div>
              <p className="text-xs text-slate-500">{isQuotation(quotation) ? 'Issued' : 'Requested'} on {formatDate(date)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
            aria-label="Close quotation details"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Summary Box */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex justify-between items-center shadow-2xs">
            <div>
              <span className="text-xs text-slate-500 font-bold block">
                {isQuotation(quotation) ? 'Valid Until' : 'Required By'}
              </span>
              <span className="font-extrabold text-sm text-slate-900 flex items-center gap-1 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-slate-600" />
                {formatDate(validOrRequiredDate)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 font-bold block">Total Amount</span>
              <span className="font-black text-xl text-slate-900">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Line Items Table */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              {isQuotation(quotation) ? 'Quotation' : 'Request'} Line Items
            </h4>
            <div className="bg-slate-50 rounded-2xl border border-slate-200/80 overflow-hidden text-xs shadow-2xs">
              <div className="grid grid-cols-12 bg-slate-100 p-2.5 font-bold text-slate-600 border-b border-slate-200">
                <div className="col-span-1 text-center">Qty</div>
                <div className="col-span-7">Description</div>
                <div className="col-span-2 text-right">Unit Price</div>
                <div className="col-span-2 text-right">Total</div>
              </div>
              <div className="divide-y divide-slate-200">
                {items.length === 0 ? (
                  <div className="p-3 text-slate-400 font-medium text-center">
                    No line items available.
                  </div>
                ) : (
                  items.map((item) => {
                    const description = isQuotationItem(item) ? item.description : item.name;
                    const unitPrice = isQuotationItem(item) ? item.unitPrice : (item.targetPrice ?? 0);
                    const lineTotal = isQuotationItem(item) ? item.total : unitPrice * item.quantity;

                    return (
                      <div key={item.id} className="grid grid-cols-12 p-3 text-slate-700">
                        <div className="col-span-1 text-center self-center text-slate-600 font-bold">{item.quantity}</div>
                        <div className="col-span-7 self-center">
                          <div className="font-extrabold text-slate-900">{description}</div>
                        </div>
                        <div className="col-span-2 text-right self-center font-medium text-slate-600">
                          {formatCurrency(unitPrice)}
                        </div>
                        <div className="col-span-2 text-right self-center font-black text-slate-900">
                          {formatCurrency(lineTotal)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-1">
            <div className="flex justify-between text-slate-500 font-medium">
              <span>Subtotal</span>
              <span className="finance-nums">{formatCurrency(subtotal)}</span>
            </div>
            {discount ? (
              <div className="flex justify-between text-slate-500 font-medium">
                <span>Discount</span>
                <span className="finance-nums">-{formatCurrency(discount)}</span>
              </div>
            ) : null}
            {tax ? (
              <div className="flex justify-between text-slate-500 font-medium">
                <span>Tax</span>
                <span className="finance-nums">{formatCurrency(tax)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1 mt-1">
              <span>Total</span>
              <span className="finance-nums">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Notes */}
          {notes && (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-900 leading-relaxed font-medium">
              <span className="font-bold text-blue-950 block mb-0.5">Notes:</span>
              {notes}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
