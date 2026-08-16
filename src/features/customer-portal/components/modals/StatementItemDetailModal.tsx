import React from 'react';
import {
  CheckCircle2,
  Download,
  FileText,
  Printer,
  Receipt,
  X,
} from 'lucide-react';
import { AccountProfile, StatementEntry } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface StatementItemDetailModalProps {
  entry: StatementEntry | null;
  profile?: AccountProfile;
  isOpen: boolean;
  onClose: () => void;
}

export const StatementItemDetailModal: React.FC<StatementItemDetailModalProps> = ({
  entry,
  profile,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !entry) return null;

  const companyName = profile?.companyName || 'Customer';
  const accountNumber = profile?.accountNumber;
  const email = profile?.email;

  const isPayment = entry.type === 'Payment';

  const handleDownload = () => {
    // Printable / Downloadable receipt view
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${entry.type} - ${entry.reference}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #0f172a; max-width: 800px; margin: 0 auto; }
            .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { font-size: 25.5px; font-weight: 900; color: #0f172a; }
            .badge { background: #f1f5f9; padding: 4px 12px; border-radius: 9999px; font-size: 13.5px; font-weight: 700; display: inline-block; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; }
            .info-label { font-size: 11.5px; text-transform: uppercase; color: #64748b; font-weight: 800; letter-spacing: 0.05em; }
            .info-val { font-size: 15.5px; font-weight: 700; color: #0f172a; margin-top: 2px; }
            table { width: 100%; border-collapse: collapse; margin: 30px 0; }
            th { text-align: left; padding: 12px; background: #f1f5f9; font-size: 12.5px; text-transform: uppercase; color: #475569; }
            td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14.5px; }
            .total-box { margin-left: auto; width: 280px; text-align: right; background: #f8fafc; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0; }
            .total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 15.5px; }
            .grand-total { font-size: 19.5px; font-weight: 900; color: #0f172a; border-top: 2px solid #0f172a; padding-top: 8px; margin-top: 6px; }
            .footer { margin-top: 50px; text-align: center; font-size: 12.5px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">Prime PORTAL</div>
              <div style="font-size: 13.5px; color: #64748b; margin-top: 4px;">B2B Customer Portal — ${entry.type} Record</div>
              <div style="font-size: 12.5px; color: #94a3b8; margin-top: 2px;">Produced from the PrimeERP system ledger</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 21.5px; font-weight: 800; color: #0f172a;">${entry.type.toUpperCase()}</div>
              <div style="font-size: 14.5px; font-family: monospace; font-weight: 700; color: #475569; margin-top: 2px;">${entry.reference}</div>
              <div style="font-size: 12.5px; color: #64748b; margin-top: 4px;">Date: ${formatDate(entry.date)}</div>
            </div>
          </div>

          <div class="info-grid">
            <div>
              <div class="info-label">Customer Details</div>
              <div class="info-val">${companyName}</div>
              ${accountNumber ? `<div style="font-size: 13.5px; color: #475569;">Account #${accountNumber}</div>` : ''}
              ${email ? `<div style="font-size: 13.5px; color: #475569;">${email}</div>` : ''}
            </div>
            <div>
              <div class="info-label">Transaction Summary</div>
              <div class="info-val">${entry.description}</div>
              <div style="font-size: 13.5px; color: #475569; margin-top: 4px;">
                Status: Verified & Recorded in Ledger
              </div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Transaction Reference</th>
                <th>Description</th>
                <th>Type</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="font-family: monospace; font-weight: 700;">${entry.reference}</td>
                <td>${entry.description}</td>
                <td>${entry.type}</td>
                <td style="text-align: right; font-weight: 800;">${formatCurrency(entry.debit || entry.credit)}</td>
              </tr>
            </tbody>
          </table>

          <div class="total-box">
            <div class="total-row">
              <span>Debit Charge:</span>
              <span>${formatCurrency(entry.debit)}</span>
            </div>
            <div class="total-row">
              <span>Credit Received:</span>
              <span>${formatCurrency(entry.credit)}</span>
            </div>
            <div class="total-row grand-total">
              <span>Ending Balance:</span>
              <span>${formatCurrency(entry.balance)}</span>
            </div>
          </div>

          <div class="footer">
            <p>Official record produced by the PrimeERP system ledger.</p>
            <p>For accounting or billing inquiries, contact your account manager.</p>
          </div>

          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-slide-up">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${isPayment ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-800'}`}>
              {isPayment ? <Receipt className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">{entry.type} Statement Record</h3>
              <p className="text-[12.5px] font-mono text-slate-500">{entry.reference}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
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
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs transition"
          >
            Close
          </button>

          <button
            onClick={handleDownload}
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-md flex items-center gap-2 transition"
          >
            <Download className="w-4 h-4" />
            <span>Download {isPayment ? 'Receipt' : 'Invoice'} PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
};
