import React, { useState } from 'react';
import {
  Calendar,
  Download,
  FileSpreadsheet,
  FileText,
  Landmark,
  Receipt,
  Search,
} from 'lucide-react';
import { Invoice } from '../../types';
import { formatCurrency, formatDate, getInvoiceStatusBadge } from '../../utils/formatters';
import { downloadOfficialDocument } from '../../utils/officialDocument';
import { exportToCSV } from '../../utils/exportUtils';
import { canRequestPayment } from '../../utils/paymentRequest';
import { getCachedInvoiceItems } from '../../hooks/usePortalData';

export type InvoiceFilter = 'all' | 'unpaid' | 'overdue' | 'paid';

interface InvoicesTabProps {
  invoices: Invoice[];
  /** Filter applied on mount — used when drilling in from a dashboard KPI. */
  initialFilter?: InvoiceFilter;
  onSelectInvoiceDetail: (invoice: Invoice) => void;
  onRequestPayment: (invoice: Invoice) => void;
}

export const InvoicesTab: React.FC<InvoicesTabProps> = ({
  invoices,
  initialFilter,
  onSelectInvoiceDetail,
  onRequestPayment,
}) => {
  const [filter, setFilter] = useState<InvoiceFilter>(initialFilter ?? 'unpaid');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredInvoices = invoices.filter((inv) => {
    const term = searchTerm.toLowerCase();
    const cachedItems = getCachedInvoiceItems(inv.id);
    // Merge list-time items (usually empty) with anything the detail modal
    // has populated so search hits the line-item text the customer remembers.
    const allItems = inv.items.length > 0 ? inv.items : cachedItems;
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(term) ||
      (inv.poNumber && inv.poNumber.toLowerCase().includes(term)) ||
      allItems.some((item) => item.description.toLowerCase().includes(term));

    if (!matchesSearch) return false;

    if (filter === 'unpaid') return inv.status === 'unpaid' || inv.status === 'overdue' || inv.status === 'partially_paid';
    if (filter === 'overdue') return inv.status === 'overdue';
    if (filter === 'paid') return inv.status === 'paid';
    return true;
  });

  const unpaidInvoices = invoices.filter((i) => i.status === 'unpaid' || i.status === 'overdue' || i.status === 'partially_paid');
  const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + i.amountRemaining, 0);

  const handleExportCSV = () => {
    exportToCSV(
      'Customer_Invoices_Report',
      filteredInvoices.map((inv) => ({
        InvoiceNumber: inv.invoiceNumber,
        PONumber: inv.poNumber || 'N/A',
        IssueDate: inv.issueDate,
        DueDate: inv.dueDate,
        TotalAmount: inv.amount,
        AmountPaid: inv.amountPaid,
        AmountRemaining: inv.amountRemaining,
        Status: inv.status,
      })),
      [
        { key: 'InvoiceNumber', label: 'Invoice #' },
        { key: 'PONumber', label: 'PO #' },
        { key: 'IssueDate', label: 'Issue Date' },
        { key: 'DueDate', label: 'Due Date' },
        { key: 'TotalAmount', label: 'Total Amount (K)' },
        { key: 'AmountPaid', label: 'Paid (K)' },
        { key: 'AmountRemaining', label: 'Balance Due (K)' },
        { key: 'Status', label: 'Status' },
      ]
    );
  };

  // Official ERP document download (authoritative PDF, customer-scoped).
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<{ id: string; message: string } | null>(null);

  const handleDownloadPDF = async (inv: Invoice) => {
    setDownloadError(null);
    setDownloadingId(inv.id);
    try {
      await downloadOfficialDocument('invoice', inv.id);
    } catch (err) {
      setDownloadError({ id: inv.id, message: err instanceof Error ? err.message : 'Download failed.' });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-4 pb-28 text-slate-900">
      {/* 1. Header & Summary Card */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-slate-900 text-white shadow-xs">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Invoices & Payments</h2>
              <p className="text-xs text-slate-500">Manage open bills, review payment terms, and clear pending receivables</p>
            </div>
          </div>
        </div>

        {/* Total Outstanding Balance KPI Card */}
        <div className="flex items-center justify-between p-3.5 sm:p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs">
          <div>
            <span className="text-xs font-semibold text-slate-500 block">Total Outstanding Balance</span>
            <span className="text-2xl font-black text-slate-900 tracking-tight mt-0.5 block tabular-nums">
              {formatCurrency(unpaidTotal)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-2xs">
            <Receipt className="w-5 h-5" />
          </div>
        </div>

        {/* 2. Search Bar & Export CSV */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search by invoice #, PO #, or line items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-xs font-normal text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900 shadow-2xs"
              />
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          </div>

          <button
            onClick={handleExportCSV}
            title="Export Invoices to CSV"
            className="px-3 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5 transition shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>

        {/* 3. Underline Tab Bar */}
        <div className="flex items-center gap-6 border-b border-slate-200/90 pt-1 pb-2 overflow-x-auto no-scrollbar">
          {[
            { key: 'unpaid', label: 'UNPAID' },
            { key: 'overdue', label: 'OVERDUE' },
            { key: 'paid', label: 'PAID' },
            { key: 'all', label: 'ALL' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key as any)}
              className={`text-xs font-extrabold tracking-wide relative transition ${
                filter === t.key ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {t.label}
              {filter === t.key && (
                <span className="absolute bottom-[-9px] left-0 right-0 h-0.5 bg-slate-900 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Invoice List */}
      <div className="space-y-3 pt-1">
        {filteredInvoices.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 text-slate-500 space-y-2">
            <FileText className="w-10 h-10 mx-auto stroke-1 text-slate-400" />
            <p className="font-bold text-sm text-slate-700">No invoices found</p>
            <p className="text-xs text-slate-500">Try adjusting your search query or selected tab filter.</p>
          </div>
        ) : (
          filteredInvoices.map((inv) => {
            const statusInfo = getInvoiceStatusBadge(inv.status);
            const isPayable = inv.status === 'unpaid' || inv.status === 'overdue' || inv.status === 'partially_paid';
            const isNew = (() => {
              const issued = new Date(inv.issueDate);
              const now = new Date();
              const diffDays = (now.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24);
              return diffDays <= 7;
            })();

            return (
              <div
                key={inv.id}
                onClick={() => onSelectInvoiceDetail(inv)}
                className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-slate-900 space-y-2.5 shadow-2xs cursor-pointer hover:border-indigo-300 hover:shadow-md transition"
              >
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-slate-900">{inv.invoiceNumber}</span>
                      {isNew && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-200">
                          NEW
                        </span>
                      )}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusInfo.bg}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="text-[12.5px] text-slate-500 mt-0.5">Issued on {formatDate(inv.issueDate)}</p>
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-medium text-slate-900 block finance-nums">{formatCurrency(inv.amount)}</span>
                    <span className="text-[11.5px] text-slate-400">Due {formatDate(inv.dueDate)}</span>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between gap-2">
                  <span className="text-[12.5px] text-slate-500 font-medium">
                    {inv.poNumber ? `PO: ${inv.poNumber}` : 'No PO reference'}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDownloadPDF(inv);
                      }}
                      disabled={downloadingId === inv.id}
                      title={downloadingId === inv.id ? 'Downloading official ERP document…' : 'Download official ERP invoice (PDF)'}
                      className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-extrabold text-xs shadow-xs flex items-center gap-1.5 transition"
                    >
                      {downloadingId === inv.id ? (
                        <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : (
                        <FileText className="w-3.5 h-3.5" />
                      )}
                      <span>PDF</span>
                    </button>

                    {isPayable && canRequestPayment(inv) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRequestPayment(inv);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-xs flex items-center gap-1.5 transition"
                      >
                        <Landmark className="w-3.5 h-3.5" />
                        <span>Request Payment</span>
                      </button>
                    )}
                  </div>
                </div>

                {downloadError?.id === inv.id && (
                  <p className="text-[11.5px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5">
                    {downloadError.message}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

    </div>
  );
};
