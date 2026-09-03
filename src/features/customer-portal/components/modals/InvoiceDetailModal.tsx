import React, { useId, useRef, useState } from 'react';
import { Calendar, Download, FileText, Landmark, Loader2, X } from 'lucide-react';
import { Invoice } from '../../types';
import { formatCurrency, formatDate, getInvoiceStatusBadge } from '../../utils/formatters';
import { canRequestPayment } from '../../utils/paymentRequest';
import { useInvoiceDetailData } from '../../hooks/usePortalData';
import { useOfficialDocument } from '../../hooks/useOfficialDocument';
import { useFocusTrap } from '../../utils/useFocusTrap';
import { OfficialDocumentPreview } from '../OfficialDocumentPreview';

interface InvoiceDetailModalProps {
  invoice: Invoice | null;
  onClose: () => void;
  /** Opens the Bank Transfer payment-REQUEST flow (workflow data only — never a payment). */
  onRequestPayment: (invoice: Invoice) => void;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  invoice,
  onClose,
  onRequestPayment,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(containerRef, { active: invoice !== null, onEscape: onClose });
  // Fetch the ERP invoice detail (line items) when the modal is open.
  // Falls back to the list data if the detail endpoint fails.
  const detailQuery = useInvoiceDetailData(invoice?.id ?? null);
  const detail = detailQuery.data;

  const officialDocument = useOfficialDocument(
    invoice ? { kind: 'invoice', id: invoice.id } : null,
    invoice !== null
  );
  const [documentActionError, setDocumentActionError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  if (!invoice) return null;

  const effectiveInvoice: Invoice = detail ?? invoice;
  const statusInfo = getInvoiceStatusBadge(effectiveInvoice.status);
  const isFetchingDetail = Boolean(invoice && detailQuery.isLoading);

  const handleDownload = () => {
    setDocumentActionError(null);
    officialDocument.download();
  };

  const openPreview = () => {
    if (!officialDocument.document) {
      setDocumentActionError('The official PDF is still loading. Please try again shortly.');
      return;
    }
    setDocumentActionError(null);
    setPreviewOpen(true);
  };

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
                <h3 id={titleId} className="font-extrabold text-base text-slate-900">{effectiveInvoice.invoiceNumber}</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusInfo.bg}`}>
                  {statusInfo.label}
                </span>
              </div>
              <p className="text-xs text-slate-500">Issued on {formatDate(effectiveInvoice.issueDate)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
            aria-label="Close invoice details"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Summary Box */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex justify-between items-center shadow-2xs">
            <div>
              <span className="text-xs text-slate-500 font-bold block">Due Date</span>
              <span className="font-extrabold text-sm text-slate-900 flex items-center gap-1 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-slate-600" />
                {formatDate(effectiveInvoice.dueDate)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 font-bold block">Amount Remaining</span>
              <span className="font-black text-xl text-slate-900">{formatCurrency(effectiveInvoice.amountRemaining)}</span>
            </div>
          </div>

          {effectiveInvoice.poNumber && (
            <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 flex justify-between font-medium">
              <span>Purchase Order Ref:</span>
              <strong className="text-slate-900 font-mono">{effectiveInvoice.poNumber}</strong>
            </div>
          )}

          {/* Line Items Table */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Invoice Item Breakdown
              {isFetchingDetail && (
                <span className="ml-2 inline-flex items-center gap-1 text-slate-400 font-bold normal-case">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading ERP detail...
                </span>
              )}
            </h4>
            <div className="bg-slate-50 rounded-2xl border border-slate-200/80 overflow-hidden text-xs shadow-2xs">
              <div className="grid grid-cols-12 bg-slate-100 p-2.5 font-bold text-slate-600 border-b border-slate-200">
                <div className="col-span-6">Description</div>
                <div className="col-span-2 text-center">Qty</div>
                <div className="col-span-4 text-right">Total</div>
              </div>
              <div className="divide-y divide-slate-200">
                {effectiveInvoice.items.length === 0 && !isFetchingDetail ? (
                  <div className="p-3 text-slate-400 font-medium text-center">
                    Line item detail is not available for this invoice.
                  </div>
                ) : (
                  effectiveInvoice.items.map((item) => (
                    <div key={item.id} className="grid grid-cols-12 p-3 text-slate-700">
                      <div className="col-span-6">
                        <div className="font-extrabold text-slate-900">{item.description}</div>
                        <div className="text-[11.5px] text-slate-400">{formatCurrency(item.unitPrice)} / unit</div>
                      </div>
                      <div className="col-span-2 text-center self-center text-slate-600 font-bold">{item.quantity}</div>
                      <div className="col-span-4 text-right self-center font-black text-slate-900">
                        {formatCurrency(item.total)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          {effectiveInvoice.notes && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed font-medium">
              <span className="font-bold text-amber-950 block mb-0.5">Notes & Terms:</span>
              {effectiveInvoice.notes}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white border-t border-slate-200 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={openPreview}
                disabled={!officialDocument.document || officialDocument.isLoading}
                className="p-2.5 rounded-xl border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed text-xs font-bold flex items-center gap-1.5 transition"
                title="Open the official ERP invoice PDF preview"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>View PDF</span>
              </button>
              <button
                onClick={handleDownload}
                disabled={!officialDocument.document || officialDocument.isLoading}
                className="p-2.5 rounded-xl border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed text-xs font-bold flex items-center gap-1.5 transition"
                title={officialDocument.isLoading ? 'Loading official ERP document…' : 'Download official ERP invoice (PDF)'}
              >
                {officialDocument.isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">Download</span>
              </button>
            </div>

            {canRequestPayment(effectiveInvoice) ? (
              <button
                onClick={() => {
                  onClose();
                  onRequestPayment(effectiveInvoice);
                }}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-xs flex items-center gap-1.5 transition"
                title="Request to pay this invoice by bank transfer (not an immediate payment)"
              >
                <Landmark className="w-3.5 h-3.5" />
                <span>Request Payment</span>
              </button>
            ) : (
              <div className="px-4 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-bold text-xs">
                ✓ Fully Settled
              </div>
            )}
          </div>

          {(officialDocument.error || documentActionError) && (
            <div className="flex items-center justify-between gap-2 text-[11.5px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5">
              <p>{officialDocument.error || documentActionError}</p>
              {officialDocument.error && (
                <button onClick={officialDocument.retry} className="underline shrink-0">Retry</button>
              )}
            </div>
          )}
        </div>
      </div>

      {previewOpen && officialDocument.document && (
        <div className="fixed inset-0 z-[60] overflow-hidden bg-slate-900/70 backdrop-blur-xs flex items-stretch justify-center animate-fade-in">
          <div className="w-full max-w-5xl bg-white border border-slate-200 text-slate-900 shadow-2xl flex flex-col h-full sm:h-[95vh] sm:my-auto sm:rounded-2xl overflow-hidden">
            <OfficialDocumentPreview
              blob={officialDocument.document.blob}
              filename={officialDocument.document.filename}
              title={`Official ERP Invoice ${effectiveInvoice.invoiceNumber}`}
              subtitle="Tap a page to zoom · swipe to turn pages"
            />
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="absolute top-3 right-3 p-2 rounded-full bg-white/90 border border-slate-200 text-slate-700 hover:bg-white shadow-md z-10"
              aria-label="Close preview"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
