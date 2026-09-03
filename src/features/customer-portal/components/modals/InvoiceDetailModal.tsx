import React, { useId, useState } from 'react';
import { Calendar, Landmark, Mail, MapPin, Phone, Receipt, X } from 'lucide-react';
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

  const handleDownload = () => {
    officialDocument.download();
  };

  const openPreview = () => {
    if (!officialDocument.document) return;
    setPreviewOpen(true);
  };

  // Amount emphasis uses the ERP-authoritative fields as-is — never a
  // Portal-computed total.
  const isSettled = effectiveInvoice.amountRemaining <= 0;
  const heroLabel = isSettled ? 'Invoice Total' : 'Amount Due';
  const heroValue = isSettled ? effectiveInvoice.amount : effectiveInvoice.amountRemaining;
  const showPaidRow = effectiveInvoice.amountPaid > 0;

  const customerName = customer?.companyName || customer?.customerName || customer?.fullName;

  return (
    <DocumentSheet titleId={titleId} documentType="Invoice" onClose={onClose}>
      {/* ── Document identity ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Invoice</p>
        {/* Version information stays secondary metadata (only rendered when the
            ERP data reports a revision — invoices currently carry no version). */}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1
          id={titleId}
          className="font-mono text-[26px] font-black leading-none tracking-tight text-slate-900 sm:text-3xl"
        >
          {effectiveInvoice.invoiceNumber}
        </h1>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${statusInfo.bg}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
          {statusInfo.label}
        </span>
      </div>

      <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500">
        <li className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          Issued {formatDate(effectiveInvoice.issueDate)}
        </li>
        <li className="flex items-center gap-1.5">
          <Receipt className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          Due {formatDate(effectiveInvoice.dueDate)}
        </li>
        {effectiveInvoice.poNumber && (
          <li className="flex items-center gap-1.5">
            <span className="font-bold uppercase tracking-wide text-slate-400">PO</span>
            <span className="font-bold text-slate-600">{effectiveInvoice.poNumber}</span>
          </li>
        )}
      </ul>

      {/* ── Amount summary + primary action ──────────────────────────────── */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-2xs sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              {heroLabel}
            </p>
            <p className="mt-1 text-3xl font-black tracking-tight text-slate-900 currency-display sm:text-4xl">
              {formatCurrency(heroValue)}
            </p>
            {!isSettled && effectiveInvoice.amountPaid > 0 && (
              <p className="mt-1.5 text-[11.5px] font-medium text-slate-500">
                {formatCurrency(effectiveInvoice.amountPaid)} paid · invoice total{' '}
                {formatCurrency(effectiveInvoice.amount)}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-start sm:justify-end">
            {canRequestPayment(effectiveInvoice) ? (
              <button
                type="button"
                onClick={() => onRequestPayment(effectiveInvoice)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-xs font-extrabold text-white shadow-xs transition hover:bg-slate-800"
                title="Request to pay this invoice by bank transfer (not an immediate payment)"
              >
                <Landmark className="h-4 w-4" aria-hidden="true" />
                Request Payment
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-extrabold text-emerald-700">
                ✓ Fully Settled
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Customer ─────────────────────────────────────────────────────── */}
      {customerName && (
        <section aria-label="Customer" className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Customer</h2>
          <p className="mt-1.5 text-[15px] font-extrabold text-slate-900">{customerName}</p>
          <ul className="mt-2.5 space-y-1.5 text-xs font-medium text-slate-500">
            {customer?.address && (
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                <span>{customer.address}</span>
              </li>
            )}
            {customer?.email && (
              <li className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                <span>{customer.email}</span>
              </li>
            )}
            {customer?.phone && (
              <li className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                <span>{customer.phone}</span>
              </li>
            )}
          </ul>
        </section>
      )}

      {/* ── Line items ───────────────────────────────────────────────────── */}
      <div className="mt-6">
        <DocumentLineItems
          label="Invoice Items"
          items={effectiveInvoice.items}
          isLoading={isFetchingDetail}
          loadingMessage="Loading line items from the ERP…"
          emptyMessage="Line item detail is not available for this invoice."
        />
      </div>

      {/* ── Totals ───────────────────────────────────────────────────────── */}
      <div className="mt-6 flex justify-end">
        <dl className="w-full max-w-sm space-y-1.5 rounded-2xl border border-slate-200 bg-white p-4 text-xs sm:text-[13px]">
          <div className="flex items-baseline justify-between gap-4 text-slate-600">
            <dt className="font-medium">Invoice Total</dt>
            <dd className="font-bold text-slate-900 finance-nums">{formatCurrency(effectiveInvoice.amount)}</dd>
          </div>
          {showPaidRow && (
            <div className="flex items-baseline justify-between gap-4 text-emerald-700">
              <dt className="font-medium">Amount Paid</dt>
              <dd className="font-bold finance-nums">−{formatCurrency(effectiveInvoice.amountPaid)}</dd>
            </div>
          )}
          {showPaidRow && (
            <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-1.5 text-slate-900">
              <dt className="font-extrabold">{effectiveInvoice.amountRemaining > 0 ? 'Balance Due' : 'Balance'}</dt>
              <dd className="text-base font-black finance-nums">
                {formatCurrency(effectiveInvoice.amountRemaining)}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* ── Payment information (existing notes/terms, ERP data) ─────────── */}
      {effectiveInvoice.notes && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800">
            Payment Information
          </h2>
          <p className="mt-1.5 text-xs font-medium leading-relaxed text-amber-900">
            {effectiveInvoice.notes}
          </p>
        </div>
      )}

      {/* ── Official document (ERP PDF) ──────────────────────────────────── */}
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
