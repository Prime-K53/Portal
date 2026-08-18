import React, { useState } from 'react';
import {
  AlertTriangle,
  Building,
  Building2,
  CheckCircle2,
  Landmark,
  Loader2,
  Lock,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { Invoice } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';

export type PaymentMethodType = 'national_bank' | 'first_capital_bank' | 'tnm_mpamba' | 'airtel_money';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoices: Invoice[];
  selectedInvoiceIds: string[];
  onToggleInvoiceSelection: (id: string) => void;
  /** Records the payment in the ERP ledger (POST /api/portal/payments). Resolves with the ERP payment id. */
  onCompletePayment: (paidInvoiceIds: string[], paymentMethod: string) => Promise<string>;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  invoices,
  selectedInvoiceIds,
  onToggleInvoiceSelection,
  onCompletePayment,
}) => {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [erpPaymentId, setErpPaymentId] = useState('');

  if (!isOpen) return null;

  const payableInvoices = invoices.filter(
    (i) => i.status === 'unpaid' || i.status === 'overdue' || i.status === 'partially_paid'
  );
  const selectedInvoices = invoices.filter((i) => selectedInvoiceIds.includes(i.id));
  const totalPaymentAmount = selectedInvoices.reduce((sum, inv) => sum + inv.amountRemaining, 0);

  const getPaymentMethodName = (method: PaymentMethodType | null) => {
    if (!method) return 'Not Selected';
    switch (method) {
      case 'national_bank':
        return 'National Bank';
      case 'first_capital_bank':
        return 'First Capital Bank';
      case 'tnm_mpamba':
        return 'TNM Mpamba';
      case 'airtel_money':
        return 'Airtel Money';
      default:
        return method;
    }
  };

  const handlePayNow = async () => {
    if (selectedInvoiceIds.length === 0 || !paymentMethod) return;

    setIsProcessing(true);
    setPaymentError('');
    try {
      const paymentId = await onCompletePayment(selectedInvoiceIds, paymentMethod);
      setErpPaymentId(paymentId);
      setPaymentSuccess(true);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'The payment could not be recorded by the ERP.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCloseAndReset = () => {
    setPaymentSuccess(false);
    setIsProcessing(false);
    setPaymentError('');
    setPaymentMethod(null);
    setErpPaymentId('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-white border border-slate-200 text-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-100 text-slate-800 rounded-xl border border-slate-200">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">Invoice Payment</h3>
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Lock className="w-3 h-3 text-emerald-600" /> Recorded directly in the ERP ledger
              </p>
            </div>
          </div>
          <button
            onClick={handleCloseAndReset}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {paymentSuccess ? (
            /* Success State — ERP Payment Recorded */
            <div className="text-center py-5 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-200">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xl font-black text-slate-900">Payment Recorded</h4>
                <p className="text-xs text-slate-600 font-medium leading-relaxed max-w-sm mx-auto">
                  The payment has been recorded in the ERP ledger. Invoice statuses will update as finance verifies
                  the transaction.
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-left text-xs space-y-2.5 font-medium">
                <div className="flex justify-between items-center text-slate-500">
                  <span>ERP Payment ID:</span>
                  <strong className="text-slate-900 font-mono text-xs">{erpPaymentId}</strong>
                </div>
                <div className="flex justify-between items-center text-slate-500">
                  <span>Payment Method:</span>
                  <span className="text-slate-900 font-extrabold">{getPaymentMethodName(paymentMethod)}</span>
                </div>
                <div className="flex justify-between items-center text-slate-500">
                  <span>Invoices Paid ({selectedInvoices.length}):</span>
                  <span className="text-slate-900 font-bold">{selectedInvoices.map((i) => i.invoiceNumber).join(', ')}</span>
                </div>
                <div className="flex justify-between items-center text-slate-500">
                  <span>Total Amount Paid:</span>
                  <span className="text-slate-900 font-black tabular-nums text-sm">{formatCurrency(totalPaymentAmount)}</span>
                </div>
                <div className="flex justify-between items-center text-slate-500 pt-2 border-t border-slate-200">
                  <span>ERP Ledger Status:</span>
                  <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-bold text-[10px]">
                    Payment Recorded
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-500">
                  <span>Timestamp:</span>
                  <span className="text-slate-700">{new Date().toLocaleString()}</span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleCloseAndReset}
                  className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm shadow-xs transition"
                >
                  Return to Portal
                </button>
              </div>
            </div>
          ) : (
            /* Payment Flow */
            <>
              {/* Real Payment Notice */}
              <div className="p-3.5 bg-amber-50/90 border border-amber-200/90 rounded-2xl text-amber-900 text-xs font-medium flex items-start gap-3 shadow-2xs">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-extrabold text-amber-950 block text-xs">Real Payment Notice</span>
                  <p className="text-[12.5px] leading-relaxed text-amber-900">
                    Submitting records a real payment against these invoices in the PrimeERP ledger for finance
                    verification. Only proceed if you have transferred the funds.
                  </p>
                </div>
              </div>

              {/* Invoice Selection Accordion */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Select Invoices to Pay ({payableInvoices.length} Outstanding)
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {payableInvoices.length === 0 ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs text-center font-bold">
                      No outstanding unpaid invoices! Your account balance is up to date.
                    </div>
                  ) : (
                    payableInvoices.map((inv) => {
                      const isChecked = selectedInvoiceIds.includes(inv.id);
                      return (
                        <div
                          key={inv.id}
                          onClick={() => onToggleInvoiceSelection(inv.id)}
                          className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition ${
                            isChecked
                              ? 'bg-slate-100 border-slate-900 text-slate-900 shadow-2xs'
                              : 'bg-slate-50/50 border-slate-200/80 text-slate-600 hover:bg-slate-100/50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="w-4 h-4 rounded text-slate-900 focus:ring-slate-900 bg-white border-slate-300"
                            />
                            <div>
                              <div className="font-extrabold text-xs text-slate-900">{inv.invoiceNumber}</div>
                              <div className="text-[11.5px] text-slate-400 font-medium">Due: {formatDate(inv.dueDate)}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-black text-xs text-slate-900">{formatCurrency(inv.amountRemaining)}</div>
                            {inv.status === 'overdue' && (
                              <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded-full font-bold">Overdue</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Payment Summary */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between shadow-2xs">
                <div>
                  <span className="text-xs text-slate-500 font-bold block">Total Amount Selected</span>
                  <span className="text-xl font-black text-slate-900 tabular-nums">{formatCurrency(totalPaymentAmount)}</span>
                </div>
                <div className="text-right text-[12.5px] text-slate-500 font-bold">
                  <span>{selectedInvoices.length} invoice(s) selected</span>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Select Payment Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod(paymentMethod === 'national_bank' ? null : 'national_bank')}
                    className={`p-2.5 rounded-xl border text-xs font-extrabold flex items-center gap-2 transition ${
                      paymentMethod === 'national_bank'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Building className="w-4 h-4 text-emerald-500" />
                    <span className="truncate">National Bank</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod(paymentMethod === 'first_capital_bank' ? null : 'first_capital_bank')}
                    className={`p-2.5 rounded-xl border text-xs font-extrabold flex items-center gap-2 transition ${
                      paymentMethod === 'first_capital_bank'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Building2 className="w-4 h-4 text-blue-500" />
                    <span className="truncate">First Capital Bank</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod(paymentMethod === 'tnm_mpamba' ? null : 'tnm_mpamba')}
                    className={`p-2.5 rounded-xl border text-xs font-extrabold flex items-center gap-2 transition ${
                      paymentMethod === 'tnm_mpamba'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    <span className="truncate">TNM Mpamba</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod(paymentMethod === 'airtel_money' ? null : 'airtel_money')}
                    className={`p-2.5 rounded-xl border text-xs font-extrabold flex items-center gap-2 transition ${
                      paymentMethod === 'airtel_money'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-rose-500" />
                    <span className="truncate">Airtel Money</span>
                  </button>
                </div>
              </div>

              {paymentMethod === null && (
                <div className="p-3 bg-slate-50/70 border border-dashed border-slate-200 rounded-2xl text-center text-xs text-slate-400 font-medium">
                  Select a payment method above. The payment is recorded in the ERP ledger with the selected method.
                </div>
              )}

              {paymentMethod !== null && (
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs space-y-2">
                  <p className="text-slate-900 font-bold flex items-center gap-1.5">
                    <Landmark className="w-4 h-4 text-emerald-600" />
                    <span>{getPaymentMethodName(paymentMethod)} — Payment Details</span>
                  </p>
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200 space-y-1 text-[12.5px] text-slate-600 font-medium">
                    <p>
                      Reference: <strong className="font-mono text-slate-900">{selectedInvoices.map((i) => i.invoiceNumber).join('/') || 'INV-REF'}</strong>
                    </p>
                    <p>
                      Amount: <strong className="font-mono text-slate-900">{formatCurrency(totalPaymentAmount)}</strong>
                    </p>
                    <p className="text-[11.5px] text-slate-400">
                      Transfer the funds via {getPaymentMethodName(paymentMethod)} using the reference above, then submit.
                      The ERP finance team verifies the transaction and updates the invoice status.
                    </p>
                  </div>
                </div>
              )}

              {paymentError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium leading-relaxed">
                  {paymentError}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        {!paymentSuccess && (
          <div className="p-4 bg-white border-t border-slate-200 flex items-center gap-3">
            <button
              onClick={handleCloseAndReset}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              disabled={selectedInvoiceIds.length === 0 || !paymentMethod || isProcessing}
              onClick={handlePayNow}
              className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Recording Payment in ERP...</span>
                </>
              ) : !paymentMethod ? (
                <span>Select a Payment Method</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="tabular-nums">Record Payment ({formatCurrency(totalPaymentAmount)})</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
