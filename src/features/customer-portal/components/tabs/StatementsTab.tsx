import React, { useState } from 'react';
import { Calendar, ChevronRight, Download, Eye, FileSpreadsheet, FileText, Filter, Printer, Receipt, ShieldCheck } from 'lucide-react';
import { AccountProfile, StatementEntry } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportToCSV } from '../../utils/exportUtils';

interface StatementsTabProps {
  profile: AccountProfile;
  statements: StatementEntry[];
  onOpenStatementPrintModal: () => void;
  onSelectEntryDetail?: (entry: StatementEntry) => void;
}

export const StatementsTab: React.FC<StatementsTabProps> = ({
  profile,
  statements,
  onOpenStatementPrintModal,
  onSelectEntryDetail,
}) => {
  const [dateFilter, setDateFilter] = useState<'all' | '30days' | 'this_month' | 'custom'>('all');
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const todayISO = today.toISOString().split('T')[0];
  const [startDate, setStartDate] = useState<string>(firstOfMonth);
  const [endDate, setEndDate] = useState<string>(todayISO);

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

  const totalCredits = filteredStatements.reduce((sum, s) => sum + s.credit, 0);
  const totalDebits = filteredStatements.reduce((sum, s) => sum + s.debit, 0);

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
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200/80 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-emerald-700 text-white shadow-xs">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Account Financial Statements</h2>
            <p className="text-xs text-slate-500">Audit debit/credit transactions, filter ledger periods, and download official statements</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 font-extrabold text-xs shadow-2xs flex items-center gap-1.5 transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          <button
            onClick={onOpenStatementPrintModal}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-xs flex items-center gap-1.5 transition"
          >
            <Printer className="w-4 h-4" />
            <span>Print Statement</span>
          </button>
        </div>
      </div>

      {/* Account Credit & Balance Summary (Removed Credit Limit KPI as requested) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500 block">Net Balance Due</span>
          <div className="text-xl font-black text-slate-900 mt-0.5 tabular-nums">{formatCurrency(profile?.currentBalance || 0)}</div>
          <span className="text-xs font-medium text-slate-500 mt-1 block tabular-nums">Filtered Debits: +{formatCurrency(totalDebits)}</span>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500 block">Total Payments</span>
          <div className="text-xl font-black text-emerald-600 mt-0.5 tabular-nums">{formatCurrency(totalCredits)}</div>
          <span className="text-xs font-medium text-emerald-700 mt-1 block">Total Credits Received</span>
        </div>
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
            onClick={() => setDateFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              dateFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            All Time
          </button>
          <button
            onClick={() => setDateFilter('this_month')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              dateFilter === 'this_month'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            This Month ({today.toLocaleString('en-US', { month: 'short' })} {today.getFullYear()})
          </button>
          <button
            onClick={() => setDateFilter('30days')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              dateFilter === '30days'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            Last 30 Days
          </button>
          <button
            onClick={() => setDateFilter('custom')}
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
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium"
              />
            </div>
            <div>
              <label className="text-[11.5px] font-bold text-slate-500 block">To Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium"
              />
            </div>
          </div>
        )}
      </div>

      {/* Ledger List */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Statement Ledger Entries (Select to View Details)</h3>
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
                <span className="font-mono font-bold text-xs text-slate-900 group-hover:text-blue-600 transition-colors">
                  {st.reference}
                </span>
                <span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded ${
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
                <span>•</span>
                <span className="text-blue-600 font-bold flex items-center gap-0.5 group-hover:underline">
                  <Eye className="w-3 h-3" /> Tap to view detail & receipt
                </span>
              </div>
            </div>

            <div className="text-right shrink-0 flex items-center gap-2">
              <div className="text-right font-medium">
                {st.debit > 0 && <span className="text-xs font-black text-rose-600 block tabular-nums">+{formatCurrency(st.debit)}</span>}
                {st.credit > 0 && <span className="text-xs font-black text-emerald-600 block tabular-nums">-{formatCurrency(st.credit)}</span>}
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
