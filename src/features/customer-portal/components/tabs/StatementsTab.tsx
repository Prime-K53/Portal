import React from 'react';
import { Calendar, ChevronRight, Clock, FileSpreadsheet, FileText, Receipt } from 'lucide-react';
import { AccountProfile, StatementEntry } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportToCSV } from '../../utils/exportUtils';
import { KpiCard, SectionHeader } from '../ui';

interface StatementsTabProps {
  profile: AccountProfile;
  statements: StatementEntry[];
  dateFilter: 'all' | '30days' | 'this_month' | 'custom';
  startDate: string;
  endDate: string;
  onDateFilterChange: (filter: 'all' | '30days' | 'this_month' | 'custom') => void;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onOpenStatementPrintModal: () => void;
  onSelectEntryDetail?: (entry: StatementEntry) => void;
}

export const StatementsTab: React.FC<StatementsTabProps> = ({
  profile,
  statements,
  dateFilter,
  startDate,
  endDate,
  onDateFilterChange,
  onStartDateChange,
  onEndDateChange,
  onOpenStatementPrintModal,
  onSelectEntryDetail,
}) => {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const todayISO = today.toISOString().split('T')[0];

  const filteredStatements = statements.filter((st) => {
    const stDate = new Date(st.date);
    if (dateFilter === '30days') {
      const now = new Date();
      const diffDays = (now.getTime() - stDate.getTime()) / (1000 * 3600 * 24);
      return diffDays <= 30;
    }
    if (dateFilter === 'this_month') {
      return stDate.getMonth() === today.getMonth() && stDate.getFullYear() === today.getFullYear();
    }
    if (dateFilter === 'custom') {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59);
      return stDate >= start && stDate <= end;
    }
    return true;
  });

  // Outstanding balance is the ERP's running account balance — NEVER derived
  // from the (date-filtered) ledger, which can truncate payments inside the
  // window. The profile field is authoritative; we fall back to the most
  // recent unfiltered ledger row only when the ERP does not provide it.
  const outstandingBalance =
    profile.outstandingBalance ??
    (statements.length > 0
      ? statements[statements.length - 1].balance
      : 0);

  // Total payment is always all-time so it matches the dashboard widget.
  const totalPayment = statements.reduce((sum, s) => sum + s.credit, 0);

  const isFullyPaid = outstandingBalance === 0;

  const handleExportCSV = () => {
    exportToCSV(
      `Statement_Ledger_${profile?.accountNumber || 'statement'}`,
      filteredStatements.map((st) => ({
        Date: st.date,
        Type: st.type,
        Reference: st.reference,
        Description: st.description,
        Debit: st.debit > 0 ? st.debit : 0,
        Credit: st.credit > 0 ? st.credit : 0,
        RunningBalance: st.balance,
      })),
      [
        { key: 'Date', label: 'Date' },
        { key: 'Type', label: 'Type' },
        { key: 'Reference', label: 'Reference' },
        { key: 'Description', label: 'Description' },
        { key: 'Debit', label: 'Debit (K)' },
        { key: 'Credit', label: 'Credit (K)' },
        { key: 'RunningBalance', label: 'Balance (K)' },
      ]
    );
  };

  return (
    <div className="space-y-4 pb-20 text-slate-900">
      <SectionHeader
        icon={FileText}
        iconBg="bg-emerald-700"
        title="Account Financial Statements"
        subtitle="Audit debit/credit transactions, filter ledger periods, and download official statements"
        action={
          <>
            <button
              onClick={handleExportCSV}
              className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 font-extrabold text-xs shadow-card flex items-center gap-1.5 transition"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
            <button
              onClick={onOpenStatementPrintModal}
              className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-extrabold text-xs shadow-card flex items-center gap-1.5 transition"
            >
              <Receipt className="w-4 h-4" />
              <span>Print / Save PDF</span>
            </button>
          </>
        }
      />

      {/* Outstanding & Total Payment KPI */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label="OUTSTANDING"
          value={formatCurrency(outstandingBalance)}
          hint={isFullyPaid ? 'Fully Settled' : 'Has Outstanding Balance'}
          variant={isFullyPaid ? 'success' : 'danger'}
          icon={Clock}
        />
        <KpiCard
          label="TOTAL PAYMENT"
          value={formatCurrency(totalPayment)}
          hint="All time"
          icon={Receipt}
        />
      </div>

      {/* Date Range Selection Bar */}
      <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            Date Range Filter
          </span>
          <span className="text-[12.5px] font-mono text-slate-500">
            {filteredStatements.length} entry/entries
          </span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => onDateFilterChange('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              dateFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            All Time
          </button>
          <button
            onClick={() => onDateFilterChange('this_month')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              dateFilter === 'this_month'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            This Month ({today.toLocaleString('en-US', { month: 'short' })} {today.getFullYear()})
          </button>
          <button
            onClick={() => onDateFilterChange('30days')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              dateFilter === '30days'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            Last 30 Days
          </button>
          <button
            onClick={() => onDateFilterChange('custom')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              dateFilter === 'custom'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            Custom Range
          </button>
        </div>

        {/* Custom Date Inputs if Custom Selected */}
        {dateFilter === 'custom' && (
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 animate-fade-in">
            <div>
              <label className="text-[11.5px] font-bold text-slate-500 block">From Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium"
              />
            </div>
            <div>
              <label className="text-[11.5px] font-bold text-slate-500 block">To Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium"
              />
            </div>
          </div>
        )}
      </div>

      {/* Ledger List */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Statement Ledger Entries</h3>
        <div className="bg-white rounded-2xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden shadow-2xs">
        {[...filteredStatements]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .map((st) => (
          <div
            key={st.id}
            onClick={() => onSelectEntryDetail && onSelectEntryDetail(st)}
            className="px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-all cursor-pointer group"
          >
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  st.type === 'Payment'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-200 text-slate-700'
                }`}>
                  {st.type}
                </span>
              </div>
              <p className="text-xs text-slate-600 font-medium">{st.description}</p>
              <div className="flex items-center gap-2 text-[11.5px] text-slate-400">
                <span>{formatDate(st.date)}</span>
              </div>
            </div>

            <div className="text-right shrink-0 flex items-center gap-2">
              <div className="text-right font-medium">
                {st.debit > 0 && <span className="text-xs font-black text-rose-600 block tabular-nums">−{formatCurrency(st.debit)}</span>}
                {st.credit > 0 && <span className="text-xs font-black text-emerald-600 block tabular-nums">+{formatCurrency(st.credit)}</span>}
                <span className="text-[12.5px] text-slate-500 block font-medium tabular-nums">Bal: {formatCurrency(st.balance)}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
};
