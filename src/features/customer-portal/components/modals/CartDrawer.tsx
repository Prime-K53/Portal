import React from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { CartItem } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  /** Places the order through the Portal service. Rejects with an explicit
   * error when the ERP cannot accept it (e.g. blocked request pipeline). */
  onPlaceOrder: (deliveryAddress: string, paymentTerms: string) => Promise<void>;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onPlaceOrder,
}) => {
  const [deliveryAddress, setDeliveryAddress] = React.useState('');
  const [paymentTerms, setPaymentTerms] = React.useState('Net 30 Credit Terms');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [orderError, setOrderError] = React.useState('');
  const [orderComplete, setOrderComplete] = React.useState(false);

  if (!isOpen) return null;

  const subtotal = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const totalSavings = cartItems.reduce((sum, item) => {
    if (item.product.originalPrice && item.product.originalPrice > item.product.price) {
      return sum + (item.product.originalPrice - item.product.price) * item.quantity;
    }
    return sum;
  }, 0);
  const grandTotal = subtotal;

  const handleCheckout = async () => {
    if (cartItems.length === 0) return;

    setIsSubmitting(true);
    setOrderError('');
    try {
      await onPlaceOrder(deliveryAddress, paymentTerms);
      setOrderComplete(true);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'The order could not be submitted.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseAndReset = () => {
    setOrderComplete(false);
    setIsSubmitting(false);
    setOrderError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-md bg-white border-l border-slate-200 text-slate-900 flex flex-col h-full shadow-2xl animate-slide-left">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-100 text-slate-800 rounded-xl border border-slate-200">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">Your Shopping Cart</h3>
              <p className="text-xs text-slate-500">{cartItems.length} item(s) selected</p>
            </div>
          </div>
          <button
            onClick={handleCloseAndReset}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {orderComplete ? (
            <div className="text-center py-12 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-200">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h4 className="text-xl font-black text-slate-900">Order Submitted!</h4>
              <p className="text-xs text-slate-600 leading-relaxed max-w-xs mx-auto font-medium">
                Your order has been submitted to the ERP and routed to logistics dispatch.
              </p>
              <button
                onClick={handleCloseAndReset}
                className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm shadow-xs transition"
              >
                Continue Shopping
              </button>
            </div>
          ) : cartItems.length === 0 ? (
            <div className="text-center py-16 text-slate-400 space-y-3">
              <ShoppingBag className="w-12 h-12 mx-auto stroke-1 text-slate-300" />
              <p className="font-bold text-sm text-slate-600">Your cart is empty</p>
              <p className="text-xs text-slate-400">Browse the product catalog to add industrial items to your cart.</p>
            </div>
          ) : (
            <>
              {/* Item List */}
              <div className="space-y-3">
                {cartItems.map(({ product, quantity }) => (
                  <div
                    key={product.id}
                    className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center gap-3 shadow-2xs"
                  >
                    <div className="flex-1 min-w-0">
                      <h5 className="font-extrabold text-xs text-slate-900 truncate">{product.name}</h5>
                      <div className="font-black text-xs text-slate-900 mt-1">
                        {formatCurrency(product.price * quantity)}
                      </div>
                    </div>

                    {/* Quantity Controls */}
                    <div className="flex flex-col items-end gap-1">
                      <button
                        onClick={() => onRemoveItem(product.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 transition"
                        title="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
                        <button
                          onClick={() => onUpdateQuantity(product.id, quantity - 1)}
                          className="p-1 hover:bg-slate-100 rounded-lg text-slate-600"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-extrabold text-slate-900 px-1">{quantity}</span>
                        <button
                          onClick={() => onUpdateQuantity(product.id, quantity + 1)}
                          className="p-1 hover:bg-slate-100 rounded-lg text-slate-600"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Delivery Address */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3 text-xs">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Delivery Address</label>
                  <input
                    type="text"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Enter the delivery address for this order"
                    className="w-full bg-white border border-slate-200 rounded-xl p-2 text-slate-900 font-bold focus:outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Billing Payment Terms</label>
                  <select
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2 text-slate-900 font-bold focus:outline-none"
                  >
                    <option value="Net 30 Credit Terms">Net 30 Credit Terms (On Account)</option>
                    <option value="Net 14 Credit Terms">Net 14 Credit Terms</option>
                    <option value="Corporate Credit Card">Corporate Credit Card</option>
                    <option value="Prepaid ACH Transfer">Prepaid ACH Transfer</option>
                  </select>
                </div>
              </div>

              {/* Order Calculation Breakdown */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2 text-xs text-slate-600 font-medium">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="text-slate-900 font-bold">{formatCurrency(subtotal)}</span>
                </div>
                {totalSavings > 0 && (
                  <div className="flex justify-between text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-200/80 font-extrabold text-xs">
                    <span>Promotional Savings</span>
                    <span>-{formatCurrency(totalSavings)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black text-slate-900 pt-2 border-t border-slate-200">
                  <span>Grand Total</span>
                  <span className="text-slate-900">{formatCurrency(grandTotal)}</span>
                </div>
              </div>

              {orderError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium leading-relaxed flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{orderError}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!orderComplete && cartItems.length > 0 && (
          <div className="p-4 bg-white border-t border-slate-200 space-y-2">
            <button
              disabled={isSubmitting}
              onClick={handleCheckout}
              className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm shadow-xs disabled:opacity-50 flex items-center justify-center gap-2 transition"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting Order...</span>
                </>
              ) : (
                <>
                  <span>Submit Order ({formatCurrency(grandTotal)})</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            <button
              onClick={onClearCart}
              className="w-full py-1.5 text-xs text-slate-400 hover:text-rose-600 font-bold transition"
            >
              Clear Cart
            </button>
          </div>
        )}
      </div>
    </div>
  );
};