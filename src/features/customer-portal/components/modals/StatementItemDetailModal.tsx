import React, { useId, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileText,
  Printer,
  Receipt,
  X,
} from 'lucide-react';
import { AccountProfile, Invoice, Payment, StatementEntry } from '../../types';
import { useFocusTrap } from '../../utils/useFocusTrap';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { downloadOfficialDocument, findPaymentForStatementEntry } from '../../utils/officialDocument';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(containerRef, { active: isOpen && entry !== null, onEscape: onClose });

  // Official-document download state (ERP-authoritative PDF).
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (!isOpen || !entry) return null;

  const companyName = profile?.companyName || 'Customer';
  const accountNumber = profile?.accountNumber;
  const email = profile?.email;

  const isPayment = entry.type === 'Payment';

  const handleDownload = async () => {
    setDownloadError(null);
    if (isPayment) {
      // Resolve the ERP customer_payments record this ledger row refers to,
      // then stream the OFFICIAL receipt PDF from the ERP.
      const payment = findPaymentForStatementEntry(entry, payments ?? []);
      if (!payment) {
        setDownloadError(
          'We could not match this entry to a recorded payment. Please contact support.'
        );
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
    if (entry.type !== 'Invoice') {
      setDownloadError(
        'The ERP does not yet issue an official document for this statement entry type.'
      );
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-slide-up"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${isPayment ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-800'}`} aria-hidden="true">
              {isPayment ? <Receipt className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
            <div>
              <h3 id={titleId} className="font-extrabold text-base text-slate-900">{entry.type} Statement Record</h3>
              <p className="text-[12.5px] font-mono text-slate-500">{entry.reference}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
            aria-label="Close statement record"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Status Badge & Primary Amount Banner */}
          <div className={`p-4 rounded-2xl border flex items-center justify-between ${
            isPayment
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
              : 'bg-slate-50 border-slate-200 text-slate-900'
          }`}>
            <div>
              <span className="text-[11.5px] font-extrabold uppercase tracking-wider block opacity-70">
                {isPayment ? 'Credit Applied' : 'Debit Invoiced'}
              </span>
              <div className="text-2xl font-black mt-0.5">
                {formatCurrency(entry.credit || entry.debit)}
              </div>
            </div>

            <div className="text-right">
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                isPayment
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : 'bg-slate-200 text-slate-800 border-slate-300'
              }`}>
                {entry.type}
              </span>
              <span className="text-[11.5px] text-slate-500 block font-medium mt-1">
                {formatDate(entry.date)}
              </span>
            </div>
          </div>

          {/* Transaction Metadata */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Transaction Breakdown</h4>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2.5 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Description</span>
                <span className="font-bold text-slate-900">{entry.description}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Customer Account</span>
                <span className="font-bold text-slate-900">{companyName}{accountNumber ? ` (${accountNumber})` : ''}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Statement Reference</span>
                <span className="font-mono font-bold text-slate-900">{entry.reference}</span>
              </div>

              {entry.debit > 0 && (
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Debit Amount</span>
                  <span className="font-extrabold text-rose-600">+{formatCurrency(entry.debit)}</span>
                </div>
              )}

              {entry.credit > 0 && (
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Credit Amount</span>
                  <span className="font-extrabold text-emerald-600">-{formatCurrency(entry.credit)}</span>
                </div>
              )}

              <div className="flex justify-between items-center pt-1 font-bold">
                <span className="text-slate-700">Resulting Ledger Balance</span>
                <span className="font-black text-slate-900 text-sm">{formatCurrency(entry.balance)}</span>
              </div>
            </div>
          </div>

          {/* Audit Verification */}
          <div className="flex items-center gap-2 p-3 bg-blue-50/60 rounded-2xl border border-blue-100 text-blue-900 text-xs font-medium">
            <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Audited entry signed by the PrimeERP Financial Ledger System.</span>
          </div>
        </div>

        {/* Modal Footer with Download / Print Button */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 space-y-2">
          {downloadError && (
            <p className="text-[11.5px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5">
              {downloadError}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs transition"
            >
              Close
            </button>

            <button
              onClick={() => { void handleDownload(); }}
              disabled={downloading}
              title={downloading ? 'Downloading official ERP document…' : 'Download official ERP document (PDF)'}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-extrabold text-xs shadow-md flex items-center gap-2 transition"
            >
              {downloading ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>Download {isPayment ? 'Receipt' : 'Invoice'} PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
