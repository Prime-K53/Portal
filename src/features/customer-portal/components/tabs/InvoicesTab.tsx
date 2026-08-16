import React, { useState } from 'react';
import {
  Calendar,
  CheckSquare,
  Download,
  FileSpreadsheet,
  FileText,
  Lock,
  Receipt,
  Search,
  Square,
} from 'lucide-react';
import { Invoice } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportToCSV } from '../../utils/exportUtils';

interface InvoicesTabProps {
  invoices: Invoice[];
  selectedInvoiceIds: string[];
  onToggleInvoiceSelection: (id: string) => void;
  onSelectAllUnpaid: () => void;
  onClearSelection: () => void;
  onOpenPaymentModal: () => void;
  onSelectInvoiceDetail: (invoice: Invoice) => void;
}

export const InvoicesTab: React.FC<InvoicesTabProps> = ({
  invoices,
  selectedInvoiceIds,
  onToggleInvoiceSelection,
  onSelectAllUnpaid,
  onClearSelection,
  onOpenPaymentModal,
  onSelectInvoiceDetail,
}) => {
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'overdue' | 'paid'>('unpaid');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.poNumber && inv.poNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
      inv.items.some((item) => item.description.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (filter === 'unpaid') return inv.status === 'unpaid' || inv.status === 'overdue' || inv.status === 'partially_paid';
    if (filter === 'overdue') return inv.status === 'overdue';
    if (filter === 'paid') return inv.status === 'paid';
    return true;
  });

  const unpaidInvoices = invoices.filter((i) => i.status === 'unpaid' || i.status === 'overdue' || i.status === 'partially_paid');
  const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + i.amountRemaining, 0);
  const selectedInvoices = invoices.filter((i) => selectedInvoiceIds.includes(i.id));
  const selectedTotal = selectedInvoices.reduce((sum, i) => sum + i.amountRemaining, 0);

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

  const handleDownloadPDF = (inv: Invoice) => {
    const content = `INVOICE ${inv.invoiceNumber}\nDate: ${inv.issueDate}\nDue Date: ${inv.dueDate}\nStatus: ${inv.status.toUpperCase()}\nAmount: K ${inv.amount.toFixed(2)}\nRemaining: K ${inv.amountRemaining.toFixed(2)}\n\nItems:\n` +
      inv.items.map(i => `- ${i.description} (${i.quantity}x @ K ${i.unitPrice.toFixed(2)})`).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${inv.invoiceNumber}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
            const isPayable = inv.status === 'unpaid' || inv.status === 'overdue' || inv.status === 'partially_paid';
            const isChecked = selectedInvoiceIds.includes(inv.id);

            return (
              <div
                key={inv.id}
                onClick={() => onSelectInvoiceDetail(inv)}
                className={`p-4 rounded-2xl border transition-all duration-200 bg-white cursor-pointer hover:shadow-xs ${
                  isChecked
                    ? 'border-blue-500 ring-2 ring-blue-500/40 bg-blue-50/30'
                    : 'border-slate-200/90'
                }`}
              >
                {/* Invoice Header Line */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isPayable && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleInvoiceSelection(inv.id);
                        }}
                        className="text-slate-400 hover:text-slate-900 transition"
                      >
                        {isChecked ? (
                          <CheckSquare className="w-4.5 h-4.5 text-blue-600" />
                        ) : (
                          <Square className="w-4.5 h-4.5 text-slate-300" />
                        )}
                      </button>
                    )}
                    <h3 className="font-mono font-bold text-sm text-slate-500">{inv.invoiceNumber}</h3>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md tracking-wider ${
                      inv.status === 'overdue'
                        ? 'bg-rose-100 text-rose-800'
                        : inv.status === 'paid'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-emerald-100/90 text-emerald-800'
                    }`}
                  >
                    {inv.status === 'overdue' ? 'OVERDUE' : inv.status === 'paid' ? 'PAID' : 'UNPAID'}
                  </span>
                </div>

                {/* Dates line */}
                <p className="text-xs text-slate-500 font-normal mt-1">
                  Issue Date: {inv.issueDate} <span className="text-slate-300">|</span> Due: {inv.dueDate}
                </p>

                {/* Description & Note */}
                <div className="mt-2 space-y-0.5">
                  <p className="text-sm font-normal text-slate-800 line-clamp-1">
                    {inv.items.map((i) => `${i.quantity}x ${i.description}`).join(', ')}
                  </p>
                  {inv.notes && (
                    <p className="text-xs text-slate-500 line-clamp-1">{inv.notes}</p>
                  )}
                </div>

                {/* Footer Action Row */}
                <div className="flex items-center justify-between gap-3 pt-3 mt-3 border-t border-slate-100">
                  <span className="text-base font-medium text-slate-900 finance-nums">
                    {formatCurrency(inv.amount)}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadPDF(inv);
                      }}
                      className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-600" />
                      <span>PDF</span>
                    </button>

                    {isPayable && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenPaymentModal();
                        }}
                        className="px-3.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-2xs transition"
                      >
                        Pay Now
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Sticky Bottom Multi-Payment Action Bar */}
      {selectedInvoiceIds.length > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-20 p-3 bg-white/95 border-t border-slate-200 backdrop-blur-md shadow-lg animate-slide-up">
          <div className="max-w-md mx-auto flex items-center justify-between gap-3">
            <div>
              <span className="text-[11.5px] text-slate-500 block font-bold">Selected ({selectedInvoiceIds.length})</span>
              <span className="text-lg font-black text-slate-900">{formatCurrency(selectedTotal)}</span>
            </div>
            <button
              onClick={onOpenPaymentModal}
              className="px-6 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-extrabold text-sm shadow-md flex items-center gap-2 transition"
            >
              <Lock className="w-4 h-4" />
              <span>Pay Selected</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
