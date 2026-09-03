import React, { useId, useState } from 'react';
import { CheckCircle2, Download, Loader2 } from 'lucide-react';
import { AccountProfile, Invoice, Payment, StatementEntry } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { downloadOfficialDocument, findPaymentForStatementEntry } from '../../utils/officialDocument';
import { DocumentSheet } from '../document/DocumentSheet';
import { DocumentOfficialStrip } from '../document/DocumentOfficialStrip';

interface StatementItemDetailModalProps {
  entry: StatementEntry | null;
  profile?: AccountProfile;
  /** Loaded customer invoices — used to resolve official ERP documents by number. */
  invoices?: Invoice[];
  /** Loaded ERP payments — used to resolve official receipts for payment rows. */
  payments?: Payment[];
  isOpen: boolean;
  onClose: () => void;
}

export const StatementItemDetailModal: React.FC<StatementItemDetailModalProps> = ({
  entry,
  profile,
  invoices,
  payments,
  isOpen,
  onClose,
}) => {
  const titleId = useId();

  // Official-document download state (ERP-authoritative PDF).
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (!isOpen || !entry) return null;

  const companyName = profile?.companyName || profile?.customerName || 'Customer';
  const accountNumber = profile?.accountNumber;
  const email = profile?.email;

  const isPayment = entry.type === 'Payment';
  const isInvoice = entry.type === 'Invoice';
  const supportsOfficialPdf = isPayment || isInvoice;

  const entryPillClass = isPayment
    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
    : isInvoice
      ? 'bg-sky-100 text-sky-800 border-sky-300'
      : 'bg-slate-200 text-slate-700 border-slate-300';

  const amountLabel = isPayment
    ? 'Credit Applied'
    : isInvoice
      ? 'Debit Invoiced'
      : entry.type === 'Adjustment'
        ? 'Ledger Adjustment'
        : 'Credit Applied';

  const handleDownload = async () => {
    setDownloadError(null);
    if (isPayment) {
      // Resolve the ERP customer_payments record this ledger row refers to,
      // then stream the OFFICIAL receipt PDF from the ERP.
      const payment = findPaymentForStatementEntry(entry, payments ?? []);
      if (!payment) {
        setDownloadError('We could not match this entry to a recorded payment. Please contact support.');
        return;
      }
      setDownloading(true);
      try {
        await downloadOfficialDocument('receipt', payment.id);
      } catch (err) {
        setDownloadError(err instanceof Error ? err.message : 'Download failed.');
      } finally {
        setDownloading(false);
      }
      return;
    }
    const invoice = (invoices || []).find(
      (i) => i.invoiceNumber === entry.reference || i.id === entry.reference
    );
    if (!invoice) {
      setDownloadError('This invoice was not found in your account documents.');
      return;
    }
    setDownloading(true);
    try {
      await downloadOfficialDocument('invoice', invoice.id);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <DocumentSheet titleId={titleId} documentType="Statement" onClose={onClose}>
      {/* ── Document identity ─────────────────────────────────────────────── */}
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
        Statement Entry · {entry.type}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1
          id={titleId}
          className="font-mono text-[26px] font-black leading-none tracking-tight text-slate-900 sm:text-3xl"
        >
          {entry.reference}
        </h1>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${entryPillClass}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
          {entry.type}
        </span>
      </div>

      <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500">
        <li>Posted {formatDate(entry.date)}</li>
        {email && <li className="text-slate-400">Account email · {email}</li>}
      </ul>

      {/* ── Amount summary ───────────────────────────────────────────────── */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-2xs sm:p-5">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
            {amountLabel}
          </p>
          <p className="mt-1 text-3xl font-black tracking-tight text-slate-900 currency-display sm:text-4xl">
            {formatCurrency(entry.credit || entry.debit)}
          </p>
          <p className="mt-1.5 text-[11.5px] font-medium text-slate-500">{entry.description}</p>
        </div>
      </div>

      {/* ── Transaction breakdown ────────────────────────────────────────── */}
      <div className="mt-6">
        <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
          Transaction Breakdown
        </h2>
        <dl className="mt-2 space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4 text-xs sm:text-[13px]">
          <div className="flex items-baseline justify-between gap-6 py-1">
            <dt className="font-medium text-slate-500">Description</dt>
            <dd className="text-right font-bold text-slate-900">{entry.description}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-6 border-t border-slate-100 py-1">
            <dt className="font-medium text-slate-500">Customer Account</dt>
            <dd className="text-right font-bold text-slate-900">
              {companyName}
              {accountNumber ? ` (${accountNumber})` : ''}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-6 border-t border-slate-100 py-1">
            <dt className="font-medium text-slate-500">Statement Reference</dt>
            <dd className="font-mono text-right font-bold text-slate-900">{entry.reference}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-6 border-t border-slate-100 py-1">
            <dt className="font-medium text-slate-500">Posted Date</dt>
            <dd className="text-right font-bold text-slate-900">{formatDate(entry.date)}</dd>
          </div>
          {entry.debit > 0 && (
            <div className="flex items-baseline justify-between gap-6 border-t border-slate-100 py-1">
              <dt className="font-medium text-slate-500">Debit Amount</dt>
              <dd className="text-right font-extrabold text-rose-600 finance-nums">
                +{formatCurrency(entry.debit)}
              </dd>
            </div>
          )}
          {entry.credit > 0 && (
            <div className="flex items-baseline justify-between gap-6 border-t border-slate-100 py-1">
              <dt className="font-medium text-slate-500">Credit Amount</dt>
              <dd className="text-right font-extrabold text-emerald-600 finance-nums">
                −{formatCurrency(entry.credit)}
              </dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-6 border-t border-slate-200 pt-2">
            <dt className="font-extrabold text-slate-700">Resulting Ledger Balance</dt>
            <dd className="text-sm font-black text-slate-900 finance-nums">
              {formatCurrency(entry.balance)}
            </dd>
          </div>
        </dl>
      </div>

      {/* ── Audit verification ───────────────────────────────────────────── */}
      <div className="mt-5 flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50/60 p-3 text-xs font-medium text-blue-900">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
        <span>Audited entry signed by the PrimeERP Financial Ledger System.</span>
      </div>

      {/* ── Official document (ERP PDF) ──────────────────────────────────── */}
      <div className="mt-6">
        {supportsOfficialPdf ? (
          <DocumentOfficialStrip
            kindLabel={isPayment ? 'Receipt' : 'Invoice'}
            description={
              isPayment
                ? 'Official receipt PDF issued by Prime ERP for this recorded payment.'
                : 'Official invoice PDF issued by Prime ERP for this statement entry.'
            }
            notice={
              downloadError ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[11.5px] font-bold text-rose-700">
                  <p className="min-w-0">{downloadError}</p>
                </div>
              ) : undefined
            }
            controls={
              <button
                type="button"
                onClick={() => {
                  void handleDownload();
                }}
                disabled={downloading}
                title={
                  downloading
                    ? 'Downloading official ERP document…'
                    : `Download the official ERP ${isPayment ? 'receipt' : 'invoice'} (PDF)`
                }
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-extrabold text-white shadow-xs transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {downloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>Download Official {isPayment ? 'Receipt' : 'Invoice'}</span>
              </button>
            }
          />
        ) : (
          <DocumentOfficialStrip
            kindLabel={entry.type}
            description="Prime ERP does not issue an official document for this statement entry type. The ledger row above is your online record."
            controls={
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-400">
                No official document
              </span>
            }
          />
        )}
      </div>
    </DocumentSheet>
  );
};
