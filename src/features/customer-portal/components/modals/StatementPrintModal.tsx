import React from 'react';
import { Download, Printer, Receipt, ShieldCheck, X } from 'lucide-react';
import { AccountProfile, StatementEntry } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface StatementPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: AccountProfile;
  statements: StatementEntry[];
}

export const StatementPrintModal: React.FC<StatementPrintModalProps> = ({
  isOpen,
  onClose,
  profile,
  statements,
}) => {
  if (!isOpen) return null;

  const totalDebits = statements.reduce((sum, s) => sum + s.debit, 0);
  const totalCredits = statements.reduce((sum, s) => sum + s.credit, 0);
  const currentBalance = statements.length > 0 ? statements[statements.length - 1].balance : 0;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="w-full max-w-2xl bg-white border border-slate-200 text-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-100 text-slate-800 rounded-xl border border-slate-200">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">Official Account Statement</h3>
              <p className="text-xs text-slate-500">Statement of Account Ledger</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs flex items-center gap-1.5 transition shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Statement Document View */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 bg-slate-50 space-y-6 text-slate-800" id="printable-statement">
          {/* Company & Customer Banner */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 pb-6 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2 text-slate-900 font-black text-lg">
                <ShieldCheck className="w-5 h-5 text-slate-700" />
                <span>Prime PORTAL — Account Statement</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 font-medium">Statement of account produced from the PrimeERP system ledger</p>
            </div>
            <div className="text-left sm:text-right text-xs space-y-1">
              <div className="font-black text-slate-900 text-sm">STATEMENT OF ACCOUNT</div>
              <div className="text-slate-500 font-medium">Date: <strong className="text-slate-900 font-bold">{formatDate(new Date().toISOString())}</strong></div>
              {profile?.accountNumber && (
                <div className="text-slate-500 font-medium">Acct #: <strong className="text-slate-900 font-mono font-bold">{profile.accountNumber}</strong></div>
              )}
            </div>
          </div>

          {/* Customer Address Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 text-xs shadow-2xs">
            <div>
              <span className="text-slate-400 block font-bold uppercase text-[11.5px] tracking-wider mb-1">Account Holder</span>
              <strong className="text-sm font-extrabold text-slate-900 block">{profile?.companyName || 'Customer'}</strong>
              {profile?.customerName && <span className="text-slate-700 block font-bold">{profile.customerName}</span>}
              {profile?.address && <span className="text-slate-500 block font-medium">{profile.address}</span>}
            </div>
            <div className="sm:text-right space-y-1 font-medium">
              <span className="text-slate-400 block font-bold uppercase text-[11.5px] tracking-wider mb-1">Summary Snapshot</span>
              <div className="flex justify-between sm:justify-end gap-3 text-slate-600">
                <span>Credit Limit:</span>
                <strong className="text-slate-900 font-bold">{formatCurrency(profile?.creditLimit || 0)}</strong>
              </div>
              <div className="flex justify-between sm:justify-end gap-3 text-slate-600">
                <span>Total Invoiced:</span>
                <strong className="text-slate-900 font-bold">{formatCurrency(totalDebits)}</strong>
              </div>
              <div className="flex justify-between sm:justify-end gap-3 text-slate-600">
                <span>Total Payments Received:</span>
                <strong className="text-emerald-700 font-bold">{formatCurrency(totalCredits)}</strong>
              </div>
              <div className="flex justify-between sm:justify-end gap-3 text-sm font-black pt-1 border-t border-slate-200">
                <span className="text-slate-900">Current Balance Due:</span>
                <strong className="text-slate-900">{formatCurrency(currentBalance)}</strong>
              </div>
            </div>
          </div>

          {/* Ledger Table */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Statement Ledger Transactions</h4>
            <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden text-xs shadow-2xs">
              <div className="grid grid-cols-12 bg-slate-100 p-2.5 font-bold text-slate-600 border-b border-slate-200">
                <div className="col-span-2">Date</div>
                <div className="col-span-3">Reference</div>
                <div className="col-span-3">Type</div>
                <div className="col-span-2 text-right">Debit / Credit</div>
                <div className="col-span-2 text-right">Balance</div>
              </div>
              <div className="divide-y divide-slate-200">
                {statements.map((st) => (
                  <div key={st.id} className="grid grid-cols-12 p-2.5 text-slate-700 font-medium">
                    <div className="col-span-2 text-slate-400 text-[12.5px] self-center">{formatDate(st.date)}</div>
                    <div className="col-span-3 font-mono text-slate-900 font-bold self-center">{st.reference}</div>
                    <div className="col-span-3 self-center">
                       <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        st.type === 'Payment'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-800 border border-slate-200'
                      }`}>
                        {st.type}
                      </span>
                    </div>
                    <div className="col-span-2 text-right self-center font-bold">
                      {st.debit > 0 && <span className="text-rose-700">+{formatCurrency(st.debit)}</span>}
                      {st.credit > 0 && <span className="text-emerald-700">-{formatCurrency(st.credit)}</span>}
                    </div>
                    <div className="col-span-2 text-right self-center font-black text-slate-900">
                      {formatCurrency(st.balance)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Statement Footer */}
          <div className="pt-4 border-t border-slate-200 text-[12.5px] text-slate-500 font-medium flex flex-col sm:flex-row justify-between gap-2">
            <p>Payments are recorded via the Portal — contact your account manager for remittance details.</p>
            <p className="text-slate-400">Page 1 of 1 • System Generated</p>
          </div>
        </div>
      </div>
    </div>
  );
};
