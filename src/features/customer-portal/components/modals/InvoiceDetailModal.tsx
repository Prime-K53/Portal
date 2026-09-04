import React, { useId, useState } from 'react';
import { Calendar, Download, Landmark, Mail, MapPin, Phone, Receipt, X } from 'lucide-react';
import { Invoice, AccountProfile } from '../../types';
import { formatCurrency, formatDate, getInvoiceStatusBadge } from '../../utils/formatters';
import { canRequestPayment } from '../../utils/paymentRequest';
import { useInvoiceDetailData } from '../../hooks/usePortalData';
import { useOfficialDocument } from '../../hooks/useOfficialDocument';
import { OfficialDocumentPreview } from '../OfficialDocumentPreview';
import { DocumentSheet } from '../document/DocumentSheet';
import { DocumentLineItems } from '../document/DocumentLineItems';
import { OfficialDocumentActions } from '../document/OfficialDocumentActions';

interface InvoiceDetailModalProps {
  invoice: Invoice | null;
  onClose: () => void;
  /** Opens the Bank Transfer payment-REQUEST flow (workflow data only — never a payment). */
  onRequestPayment: (invoice: Invoice) => void;
  /** Signed-in customer profile — used only for the read-only "Customer" card. */
  customer?: AccountProfile | null;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  invoice,
  onClose,
  onRequestPayment,
  customer,
}) => {
  const titleId = useId();
  // Fetch the ERP invoice detail (line items) when the modal is open.
  // Falls back to the list data if the detail endpoint fails.
  const detailQuery = useInvoiceDetailData(invoice?.id ?? null);
  const detail = detailQuery.data;

  const officialDocument = useOfficialDocument(
    invoice ? { kind: 'invoice', id: invoice.id } : null,
    invoice !== null
  );
  const [previewOpen, setPreviewOpen] = useState(false);

  if (!invoice) return null;

  const effectiveInvoice: Invoice = detail ?? invoice;
  const statusInfo = getInvoiceStatusBadge(effectiveInvoice.status);
  const isFetchingDetail = Boolean(invoice && detailQuery.isLoading);
  const detailDone = !detailQuery.isLoading && (detailQuery.data !== undefined || detailQuery.error !== null);
  const itemsMissing = detailDone && effectiveInvoice.items.length === 0;

  const handleDownload = () => {
    officialDocument.download();
  };

  const openPreview = () => {
    if (!officialDocument.document) return;
    setPreviewOpen(true);
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') window.print();
  };

  // Amount emphasis uses the ERP-authoritative fields as-is — never a
  // Portal-computed total.
  const isSettled = effectiveInvoice.amountRemaining <= 0;
  const heroLabel = isSettled ? 'Invoice Total' : 'Amount Due';
  const heroValue = isSettled ? effectiveInvoice.amount : effectiveInvoice.amountRemaining;
  const showPaidRow = effectiveInvoice.amountPaid > 0;

  const customerName = customer?.companyName || customer?.customerName || customer?.fullName;

  return (
    <DocumentSheet
      titleId={titleId}
      documentType="Invoice"
      onClose={onClose}
      onPrint={handlePrint}
      printRegionId="invoice-print-region"
    >
      {/* ── Document identity ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-[11px] font-black uppercase tracking-wider text-slate-500">INVOICE</h1>
          <div className="mt-1 flex items-center gap-2">
            <h2
              id={titleId}
              className="text-[28px] font-black leading-none tracking-tight text-slate-900 sm:text-[32px]"
            >
              #{effectiveInvoice.invoiceNumber}
            </h2>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-extrabold ${statusInfo.bg}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
              {statusInfo.label}
            </span>
          </div>
        </div>
        {/* Version information stays secondary metadata (only rendered when the
            ERP data reports a revision — invoices currently carry no version). */}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-slate-500">
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          Issued {formatDate(effectiveInvoice.issueDate)}
        </div>
        <div className="flex items-center gap-1.5">
          <Receipt className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          Due {formatDate(effectiveInvoice.dueDate)}
        </div>
        {effectiveInvoice.poNumber && (
          <div className="flex items-center gap-1.5">
            <span className="font-bold uppercase tracking-wide text-slate-400">PO</span>
            <span className="font-bold text-slate-600">{effectiveInvoice.poNumber}</span>
          </div>
        )}
      </div>

      {/* ── Payment Summary ─────────────────────────────────────────────── */}
      <div className="mt-6 avoid-break rounded-xl border border-slate-200 bg-white p-5 shadow-sm" data-print-region="amount-summary">
        <div className="text-center sm:text-left">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
            BALANCE DUE
          </p>
          <p className="text-[32px] font-black tracking-tight text-slate-900 currency-display sm:text-[36px]">
            {formatCurrency(effectiveInvoice.amountRemaining)}
          </p>
          {!isSettled && effectiveInvoice.amountPaid > 0 && (
            <p className="mt-2 text-sm font-medium text-slate-500">
              {formatCurrency(effectiveInvoice.amountPaid)} paid of {formatCurrency(effectiveInvoice.amount)}
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-center sm:justify-end">
          {canRequestPayment(effectiveInvoice) ? (
            <button
              type="button"
              onClick={() => onRequestPayment(effectiveInvoice)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-slate-800"
              title="Request to pay this invoice by bank transfer (not an immediate payment)"
            >
              <Landmark className="h-4 w-4" aria-hidden="true" />
              Request Payment
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-extrabold text-emerald-700">
              ✓ Fully Settled
            </span>
          )}
        </div>
      </div>

      {/* ── Bill To ─────────────────────────────────────────────────────── */}
      {customerName && (
        <section aria-label="Customer" className="mt-6 avoid-break" data-print-region="customer">
          <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">BILL TO</h2>
          <div className="text-sm">
            <p className="font-bold text-slate-900">{customerName}</p>
            {customer?.address && (
              <p className="mt-1 text-slate-600">{customer.address}</p>
            )}
            {customer?.email && (
              <p className="mt-1 text-slate-600">{customer.email}</p>
            )}
            {customer?.phone && (
              <p className="mt-1 text-slate-600">{customer.phone}</p>
            )}
          </div>
        </section>
      )}

      {/* ── Invoice Items ────────────────────────────────────────────────── */}
      <div className="mt-6">
        {itemsMissing && (
          <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-700">Line items are not available for this invoice.</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {effectiveInvoice.status === 'unpaid' || effectiveInvoice.status === 'overdue'
                  ? 'Items are released after payment is recorded. Download the official PDF for full details.'
                  : 'The ERP has not returned line item details for this invoice. Download the official PDF for full details.'}
              </p>
            </div>
            {officialDocument.document && (
              <button
                type="button"
                onClick={handleDownload}
                className="shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition shadow-sm"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Download PDF
              </button>
            )}
          </div>
        )}
        <DocumentLineItems
          label="INVOICE ITEMS"
          items={effectiveInvoice.items}
          isLoading={isFetchingDetail}
          loadingMessage="Loading line items from the ERP…"
          emptyMessage="No line items on this invoice."
        />
      </div>

      {/* ── Totals ───────────────────────────────────────────────────────── */}
      <div className="mt-6" data-print-region="totals">
        <dl className="text-sm space-y-2 border-t border-slate-200 pt-4">
          <div className="flex justify-between">
            <dt className="font-medium text-slate-600">Invoice Total</dt>
            <dd className="font-bold text-slate-900 finance-nums">{formatCurrency(effectiveInvoice.amount)}</dd>
          </div>
          {showPaidRow && (
            <div className="flex justify-between text-emerald-700">
              <dt className="font-medium">Amount Paid</dt>
              <dd className="font-bold finance-nums">−{formatCurrency(effectiveInvoice.amountPaid)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-2">
            <dt className="font-extrabold text-slate-900">Balance Due</dt>
            <dd className="text-lg font-black text-slate-900 finance-nums">
              {formatCurrency(effectiveInvoice.amountRemaining)}
            </dd>
          </div>
        </dl>
      </div>

      {/* ── Payment Information ─────────────────────────────────────────── */}
      {effectiveInvoice.notes && (
        <div className="mt-6">
          <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">PAYMENT INFORMATION</h2>
          <div className="text-sm text-slate-600 leading-relaxed">
            {effectiveInvoice.notes}
          </div>
        </div>
      )}

      {/* ── Official Document ───────────────────────────────────────────── */}
      <div className="mt-6">
        <OfficialDocumentActions
          state={officialDocument}
          kindLabel="Invoice"
          onViewPdf={openPreview}
        />
      </div>

      {/* ── Official PDF preview overlay ─────────────────────────────────── */}
      {previewOpen && officialDocument.document && (
        <div className="fixed inset-0 z-[70] overflow-hidden bg-slate-900/70 backdrop-blur-xs animate-fade-in">
          <div className="mx-auto flex h-full w-full flex-col sm:my-5 sm:h-[calc(100dvh-2.5rem)] sm:max-w-5xl sm:overflow-hidden sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-2xl">
            <OfficialDocumentPreview
              blob={officialDocument.document.blob}
              filename={officialDocument.document.filename}
              title={`Official ERP Invoice ${effectiveInvoice.invoiceNumber}`}
              subtitle="Tap a page to zoom · swipe to turn pages"
              onDownload={handleDownload}
            />
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="absolute bottom-4 right-4 z-10 rounded-full border border-slate-200 bg-white p-2 text-slate-700 shadow-md transition hover:bg-white"
              aria-label="Close PDF preview"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </DocumentSheet>
  );
};
