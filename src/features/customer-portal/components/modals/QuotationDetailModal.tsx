import React, { useId, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCcw,
  X,
  XCircle,
} from 'lucide-react';
import type {
  AccountProfile,
  Quotation,
  QuotationItem,
  QuoteRequest,
  QuoteRequestItem,
} from '../../types';
import { formatCurrency, formatDate, getQuoteStatusBadge } from '../../utils/formatters';
import { useOfficialDocument } from '../../hooks/useOfficialDocument';
import { OfficialDocumentPreview } from '../OfficialDocumentPreview';
import { DocumentSheet } from '../document/DocumentSheet';
import { DocumentLineItems, DocumentLineItem } from '../document/DocumentLineItems';
import { DocumentVersionBadge } from '../document/DocumentVersionBadge';
import { OfficialDocumentActions } from '../document/OfficialDocumentActions';

interface QuotationDetailModalProps {
  quotation: Quotation | QuoteRequest | null;
  onClose: () => void;
  /** Signed-in customer profile — used only for the read-only "Customer" card. */
  customer?: AccountProfile | null;
  /** Existing ERP quotation actions (identical handlers to the Quotes list). */
  onAcceptQuotation?: (quotationId: string) => Promise<void>;
  onRejectQuotation?: (quotationId: string) => Promise<void>;
  onRequestRevision?: (quotationId: string) => Promise<void>;
}

function isQuotation(q: Quotation | QuoteRequest): q is Quotation {
  return 'quotationNumber' in q && 'issuedDate' in q && 'validUntil' in q;
}

function isQuotationItem(item: QuotationItem | QuoteRequestItem): item is QuotationItem {
  return 'description' in item && 'unitPrice' in item && 'total' in item;
}

/** Statuses where the ERP already serves the official quotation PDF. */
const OFFICIAL_PDF_QUOTATION_STATUSES = new Set(['accepted', 'converted']);

export const QuotationDetailModal: React.FC<QuotationDetailModalProps> = ({
  quotation,
  onClose,
  customer,
  onAcceptQuotation,
  onRejectQuotation,
  onRequestRevision,
}) => {
  const titleId = useId();
  const [previewOpen, setPreviewOpen] = useState(false);
  // Mirrors the Quotes list behaviour: Accept needs a confirm tap.
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [busyAction, setBusyAction] = useState<'accept' | 'decline' | 'revision' | null>(null);

  const formalQuotation = quotation && isQuotation(quotation) ? quotation : null;
  const officialPdfAvailable =
    formalQuotation !== null && OFFICIAL_PDF_QUOTATION_STATUSES.has(formalQuotation.status);

  const officialDocument = useOfficialDocument(
    formalQuotation ? { kind: 'quotation', id: formalQuotation.id } : null,
    quotation !== null && officialPdfAvailable
  );

  if (!quotation) return null;

  const statusInfo = getQuoteStatusBadge(quotation.status);
  const number = isQuotation(quotation) ? quotation.quotationNumber : quotation.quoteNumber;
  const issuedLabel = isQuotation(quotation) ? 'Issued' : 'Requested';
  const issuedDate = isQuotation(quotation) ? quotation.issuedDate : quotation.requestDate;
  const validityLabel = isQuotation(quotation) ? 'Valid until' : 'Required by';
  const validityDate = isQuotation(quotation) ? quotation.validUntil : quotation.requiredByDate;
  const total = isQuotation(quotation) ? quotation.total : (quotation.estimatedTotal ?? 0);
  const subtotal = isQuotation(quotation) ? quotation.subtotal : undefined;
  const discount = isQuotation(quotation) ? quotation.discount : undefined;
  const tax = isQuotation(quotation) ? quotation.tax : undefined;
  const notes = isQuotation(quotation) ? quotation.notes : quotation.adminNotes;
  const items: DocumentLineItem[] = quotation.items.map((item) => {
    const description = isQuotationItem(item) ? item.description : item.name;
    const unitPrice = isQuotationItem(item) ? item.unitPrice : (item.targetPrice ?? null);
    const lineTotal = isQuotationItem(item) ? item.total : (item.targetPrice ?? 0) * item.quantity;
    return {
      id: item.id,
      description,
      quantity: item.quantity,
      unitPrice: unitPrice && unitPrice > 0 ? unitPrice : null,
      total: lineTotal,
    };
  });

  // Quotation decision actions are only offered for formal ERP quotations
  // awaiting a customer decision — exactly like the Quotes list.
  const actionable = Boolean(
    isQuotation(quotation) && quotation.status === 'quoted'
  );

  const customerName = customer?.companyName || customer?.customerName || customer?.fullName;

  const runQuotationAction = (action: 'accept' | 'decline' | 'revision') => {
    if (!formalQuotation || busyAction) return;
    const runner =
      action === 'accept'
        ? onAcceptQuotation
        : action === 'decline'
          ? onRejectQuotation
          : onRequestRevision;
    if (!runner) return;
    setBusyAction(action);
    setConfirmAccept(false);
    runner(formalQuotation.id)
      .then(() => onClose())
      .catch(() => {
        // The shared action-error banner (parent) already explains the failure.
      })
      .finally(() => setBusyAction(null));
  };

  return (
    <DocumentSheet titleId={titleId} documentType="Quotation" onClose={onClose}>
      {/* ── Document identity + version metadata ─────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
          {isQuotation(quotation) ? 'Quotation' : 'Quote Request'}
        </p>
        {/* Revision metadata stays secondary and only renders when the ERP
            data actually reports a revised document. */}
        <DocumentVersionBadge
          version={formalQuotation?.version}
          revisedAt={formalQuotation?.updatedAt}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1
          id={titleId}
          className="font-mono text-[26px] font-black leading-none tracking-tight text-slate-900 sm:text-3xl"
        >
          {number}
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
          {issuedLabel} {formatDate(issuedDate)}
        </li>
        {validityDate && (
          <li className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            {validityLabel} {formatDate(validityDate)}
          </li>
        )}
      </ul>

      {/* ── Amount summary + quotation actions ───────────────────────────── */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-2xs sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              {isQuotation(quotation) ? 'Quotation Total' : 'Estimated Total'}
            </p>
            <p className="mt-1 text-3xl font-black tracking-tight text-slate-900 currency-display sm:text-4xl">
              {formatCurrency(total)}
            </p>
          </div>

          {actionable && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmAccept(false);
                  runQuotationAction('revision');
                }}
                disabled={busyAction !== null}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-extrabold text-slate-700 shadow-xs transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                title="Request changes to this quotation"
              >
                {busyAction === 'revision' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Request Revision
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmAccept(false);
                  runQuotationAction('decline');
                }}
                disabled={busyAction !== null}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3.5 py-2.5 text-xs font-extrabold text-rose-700 shadow-xs transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyAction === 'decline' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Decline
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmAccept) {
                    runQuotationAction('accept');
                  } else {
                    setConfirmAccept(true);
                  }
                }}
                disabled={busyAction !== null}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold shadow-xs transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  confirmAccept
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {busyAction === 'accept' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2
                    className={`h-3.5 w-3.5 ${confirmAccept ? '' : 'text-emerald-400'}`}
                    aria-hidden="true"
                  />
                )}
                {confirmAccept ? 'Confirm Accept?' : 'Accept'}
              </button>
            </div>
          )}
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
          label={isQuotation(quotation) ? 'Quotation Items' : 'Requested Items'}
          items={items}
          emptyMessage={
            isQuotation(quotation)
              ? 'No line items are available for this quotation.'
              : 'No line items are available for this request.'
          }
        />
      </div>

      {/* ── Totals ───────────────────────────────────────────────────────── */}
      <div className="mt-6 flex justify-end">
        <dl className="w-full max-w-sm space-y-1.5 rounded-2xl border border-slate-200 bg-white p-4 text-xs sm:text-[13px]">
          {isQuotation(quotation) && (subtotal ?? 0) > 0 ? (
            <>
              <div className="flex items-baseline justify-between gap-4 text-slate-600">
                <dt className="font-medium">Subtotal</dt>
                <dd className="font-bold text-slate-900 finance-nums">{formatCurrency(subtotal ?? 0)}</dd>
              </div>
              {discount ? (
                <div className="flex items-baseline justify-between gap-4 text-slate-600">
                  <dt className="font-medium">Discount</dt>
                  <dd className="font-bold finance-nums">−{formatCurrency(discount)}</dd>
                </div>
              ) : null}
              {tax ? (
                <div className="flex items-baseline justify-between gap-4 text-slate-600">
                  <dt className="font-medium">Tax</dt>
                  <dd className="font-bold finance-nums">{formatCurrency(tax)}</dd>
                </div>
              ) : null}
            </>
          ) : null}
          <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-1.5 text-slate-900">
            <dt className="font-extrabold">
              {isQuotation(quotation) ? 'Total' : 'Estimated Total'}
            </dt>
            <dd className="text-base font-black finance-nums">{formatCurrency(total)}</dd>
          </div>
        </dl>
      </div>

      {/* ── Notes / payment terms (existing ERP data) ────────────────────── */}
      {notes && (
        <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-blue-800">
            {isQuotation(quotation) ? 'Payment Terms & Notes' : 'Notes'}
          </h2>
          <p className="mt-1.5 text-xs font-medium leading-relaxed text-blue-900">{notes}</p>
        </div>
      )}

      {/* ── Official document (ERP PDF) — offered for finalised quotations ── */}
      {officialPdfAvailable && (
        <div className="mt-6">
          <OfficialDocumentActions
            state={officialDocument}
            kindLabel="Quotation"
            onViewPdf={() => {
              if (!officialDocument.document) return;
              setPreviewOpen(true);
            }}
          />
        </div>
      )}

      {/* ── Official PDF preview overlay ─────────────────────────────────── */}
      {previewOpen && officialDocument.document && (
        <div className="fixed inset-0 z-[70] overflow-hidden bg-slate-900/70 backdrop-blur-xs animate-fade-in">
          <div className="mx-auto flex h-full w-full flex-col sm:my-5 sm:h-[calc(100dvh-2.5rem)] sm:max-w-5xl sm:overflow-hidden sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-2xl">
            <OfficialDocumentPreview
              blob={officialDocument.document.blob}
              filename={officialDocument.document.filename}
              title={`Official ERP Quotation ${number}`}
              subtitle="Tap a page to zoom · swipe to turn pages"
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
