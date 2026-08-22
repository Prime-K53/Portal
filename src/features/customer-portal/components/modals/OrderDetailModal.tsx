import React from 'react';
import { Calendar, Package, X } from 'lucide-react';
import { Order } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { canReorderOrder } from '../../utils/orderRequest';

interface OrderDetailModalProps {
  order: Order | null;
  onClose: () => void;
  onReorder?: (order: Order) => Promise<Order>;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  order,
  onClose,
  onReorder,
}) => {
  if (!order) return null;

  const statusLabel = order.status.charAt(0).toUpperCase() + order.status.slice(1);
  const reorderable = canReorderOrder(order);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-white border border-slate-200 text-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-100 text-slate-800 rounded-xl border border-slate-200">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-slate-900">{order.orderNumber}</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-blue-100 text-blue-800 border-blue-200">
                  {statusLabel}
                </span>
              </div>
              <p className="text-xs text-slate-500">Placed on {formatDate(order.date)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Summary Box */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex justify-between items-center shadow-2xs">
            <div>
              <span className="text-xs text-slate-500 font-bold block">Total Amount</span>
              <span className="font-black text-xl text-slate-900">{formatCurrency(order.totalAmount)}</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 font-bold block">Est. Delivery</span>
              <span className="font-extrabold text-sm text-slate-900 flex items-center gap-1 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-slate-600" />
                {formatDate(order.estimatedDelivery)}
              </span>
            </div>
          </div>

          {/* Delivery Address */}
          <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 flex justify-between font-medium">
            <span>Delivery Address:</span>
            <strong className="text-slate-900 font-normal text-right max-w-[60%]">{order.deliveryAddress}</strong>
          </div>

          {/* Line Items Table */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Order Line Items
            </h4>
            <div className="bg-slate-50 rounded-2xl border border-slate-200/80 overflow-hidden text-xs shadow-2xs">
              <div className="grid grid-cols-12 bg-slate-100 p-2.5 font-bold text-slate-600 border-b border-slate-200">
                <div className="col-span-1 text-center">Qty</div>
                <div className="col-span-7">Product</div>
                <div className="col-span-2 text-right">Unit Price</div>
                <div className="col-span-2 text-right">Total</div>
              </div>
              <div className="divide-y divide-slate-200">
                {order.items.length === 0 ? (
                  <div className="p-3 text-slate-400 font-medium text-center">
                    No line items available for this order.
                  </div>
                ) : (
                  order.items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 p-3 text-slate-700">
                      <div className="col-span-1 text-center self-center text-slate-600 font-bold">{item.quantity}</div>
                      <div className="col-span-7 self-center">
                        <div className="font-extrabold text-slate-900">{item.productName}</div>
                      </div>
                      <div className="col-span-2 text-right self-center font-medium text-slate-600">
                        {formatCurrency(item.unitPrice)}
                      </div>
                      <div className="col-span-2 text-right self-center font-black text-slate-900">
                        {formatCurrency(item.total)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-1">
            <div className="flex justify-between text-slate-500 font-medium">
              <span>Payment Method</span>
              <span className="font-bold text-slate-900">{order.paymentMethod}</span>
            </div>
            <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1 mt-1">
              <span>Total</span>
              <span className="finance-nums">{formatCurrency(order.totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition"
          >
            Close
          </button>
          {onReorder && reorderable && (
            <button
              onClick={() => onReorder(order).then(() => onClose())}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-xs flex items-center gap-1.5 transition"
            >
              Reorder 1-Click
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
