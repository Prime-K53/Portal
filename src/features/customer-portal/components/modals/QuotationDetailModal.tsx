import React from 'react';
import { Calendar, FileText, X } from 'lucide-react';
import { Quotation } from '../../types';
import { formatCurrency, formatDate, getQuoteStatusBadge } from '../../utils/formatters';

interface QuotationDetailModalProps {
  quotation: Quotation | null;
  onClose: () => void;
}

export const QuotationDetailModal: React.FC<QuotationDetailModalProps> = ({
  quotation,
  onClose,
}) => {
  if (!quotation) return null;

  const statusInfo = getQuoteStatusBadge(quotation.status);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-white border border-slate-200 text-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-100 text-slate-800 rounded-xl border border-slate-200">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-slate-900">{quotation.quotationNumber}</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusInfo.bg}`}>
                  {statusInfo.label}
                </span>
              </div>
              <p className="text-xs text-slate-500">Issued on {formatDate(quotation.issuedDate)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Summary Box */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex justify-between items-center shadow-2xs">
            <div>
              <span className="text-xs text-slate-500 font-bold block">Valid Until</span>
              <span className="font-extrabold text-sm text-slate-900 flex items-center gap-1 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-slate-600" />
                {formatDate(quotation.validUntil)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 font-bold block">Total Amount</span>
              <span className="font-black text-xl text-slate-900">{formatCurrency(quotation.total)}</span>
            </div>
          </div>

          {/* Line Items Table */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Quotation Line Items
            </h4>
            <div className="bg-slate-50 rounded-2xl border border-slate-200/80 overflow-hidden text-xs shadow-2xs">
              <div className="grid grid-cols-12 bg-slate-100 p-2.5 font-bold text-slate-600 border-b border-slate-200">
                <div className="col-span-1 text-center">Qty</div>
                <div className="col-span-7">Description</div>
                <div className="col-span-2 text-right">Unit Price</div>
                <div className="col-span-2 text-right">Total</div>
              </div>
              <div className="divide-y divide-slate-200">
                {quotation.items.length === 0 ? (
                  <div className="p-3 text-slate-400 font-medium text-center">
                    No line items available for this quotation.
                  </div>
                ) : (
                  quotation.items.map((item) => (
                    <div key={item.id} className="grid grid-cols-12 p-3 text-slate-700">
                      <div className="col-span-1 text-center self-center text-slate-600 font-bold">{item.quantity}</div>
                      <div className="col-span-7 self-center">
                        <div className="font-extrabold text-slate-900">{item.description}</div>
                      </div>
                      <div className="col-span-2 text-right self-center font-medium text-slate-600">
                        {formatCurrency(item.unitPrice)}
                      </div>
                      <div className="col-span-2 text-right self-center font-black text-slate-900">
                        {formatCurrency(item.total)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-1">
            <div className="flex justify-between text-slate-500 font-medium">
              <span>Subtotal</span>
              <span className="finance-nums">{formatCurrency(quotation.subtotal)}</span>
            </div>
            {quotation.discount ? (
              <div className="flex justify-between text-slate-500 font-medium">
                <span>Discount</span>
                <span className="finance-nums">-{formatCurrency(quotation.discount)}</span>
              </div>
            ) : null}
            {quotation.tax ? (
              <div className="flex justify-between text-slate-500 font-medium">
                <span>Tax</span>
                <span className="finance-nums">{formatCurrency(quotation.tax)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1 mt-1">
              <span>Total</span>
              <span className="finance-nums">{formatCurrency(quotation.total)}</span>
            </div>
          </div>

          {/* Notes */}
          {quotation.notes && (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-900 leading-relaxed font-medium">
              <span className="font-bold text-blue-950 block mb-0.5">Payment Terms:</span>
              {quotation.notes}
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
