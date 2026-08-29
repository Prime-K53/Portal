import React, { useId, useRef } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { CartItem, OrderRequest } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { generateIdempotencyKey } from '../../utils/idempotency';
import { getRequestStatusLabel } from '../../utils/orderRequest';
import { useFocusTrap } from '../../utils/useFocusTrap';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number, variantId?: string) => void;
  onRemoveItem: (productId: string, variantId?: string) => void;
  onClearCart: () => void;
  /** Submits the order REQUEST through the Portal service (POST /portal/requests,
   * requestType 'order'). Resolves with the ERP-created order request (ODR-...)
   * — an official Sales Order is only created later by the ERP. Rejects with an
   * explicit error when the ERP cannot accept it. `idempotencyKey` identifies
   * this logical submission attempt and is reused when the attempt is retried. */
  onPlaceOrder: (
    requestedDeliveryDate?: string,
    idempotencyKey?: string
  ) => Promise<OrderRequest>;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(containerRef, { active: isOpen, onEscape: onClose });

  const [requestedDeliveryDate, setRequestedDeliveryDate] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [orderError, setOrderError] = React.useState('');
  const [orderComplete, setOrderComplete] = React.useState(false);
  const [submittedRequest, setSubmittedRequest] = React.useState<OrderRequest | null>(null);

  // Idempotency key for the CURRENT logical submission attempt: generated on
  // the first attempt, reused while retrying the SAME attempt (the ERP replays
  // its stored response), cleared on success and whenever the submission
  // payload changes (a changed order is a NEW logical submission).
  const submissionKeyRef = React.useRef<string | null>(null);
  const payloadSignature = JSON.stringify([cartItems, requestedDeliveryDate]);
  const lastPayloadSignatureRef = React.useRef(payloadSignature);
  React.useEffect(() => {
    if (lastPayloadSignatureRef.current !== payloadSignature) {
      submissionKeyRef.current = null;
      lastPayloadSignatureRef.current = payloadSignature;
    }
  }, [payloadSignature]);

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

    // One key per logical submission attempt — kept across retries of THIS
    // attempt, cleared on success (and by the payload-signature effect).
    if (!submissionKeyRef.current) {
      submissionKeyRef.current = generateIdempotencyKey();
    }
    const idempotencyKey = submissionKeyRef.current;

    setIsSubmitting(true);
    setOrderError('');
    try {
      const created = await onPlaceOrder(requestedDeliveryDate, idempotencyKey);
      submissionKeyRef.current = null;
      setSubmittedRequest(created);
      setOrderComplete(true);
    } catch (err) {
      // Keep the key — a retry of the same attempt must reuse it.
      setOrderError(err instanceof Error ? err.message : 'The order could not be submitted.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseAndReset = () => {
    setOrderComplete(false);
    setIsSubmitting(false);
    setOrderError('');
    setSubmittedRequest(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md bg-white border-l border-slate-200 text-slate-900 flex flex-col h-full shadow-2xl animate-slide-left"
      >
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-100 text-slate-800 rounded-xl border border-slate-200">
              <ShoppingBag className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h3 id={titleId} className="font-extrabold text-base text-slate-900">Your Shopping Cart</h3>
              <p className="text-xs text-slate-500">{cartItems.length} item(s) selected</p>
            </div>
          </div>
          <button
            onClick={handleCloseAndReset}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
            aria-label="Close cart"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {orderComplete ? (
            <div className="text-center py-10 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-200">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h4 className="text-xl font-black text-slate-900">Order Request Submitted!</h4>
                <p className="text-xs text-slate-600 leading-relaxed max-w-xs mx-auto font-medium mt-1">
                  Your request has been sent to the ERP sales team for review. A confirmation
                  reference is shown below — the official Sales Order is created once the ERP
                  confirms the request.
                </p>
              </div>

              {submittedRequest && (
                <div className="max-w-xs mx-auto p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">Request</span>
                    <span className="font-mono font-bold text-slate-900">
                      {submittedRequest.requestNumber || 'Pending ERP reference'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">Request ID</span>
                    <span className="font-mono font-bold text-slate-700">{submittedRequest.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">Status</span>
                    <span className="font-bold text-sky-700 capitalize">
                      {getRequestStatusLabel(submittedRequest.status)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">Items</span>
                    <span className="font-bold text-slate-900">{submittedRequest.items.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">Subtotal</span>
                    <span className="font-bold text-slate-900 tabular-nums">
                      {formatCurrency(submittedRequest.subtotal)}
                    </span>
                  </div>
                  {submittedRequest.discountTotal ? (
                    <div className="flex justify-between text-emerald-700 font-extrabold">
                      <span>Promotion Applied</span>
                      <span>-{formatCurrency(submittedRequest.discountTotal)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between pt-2 border-t border-slate-200 font-black text-slate-900">
                    <span>Total</span>
                    <span>{formatCurrency(submittedRequest.total)}</span>
                  </div>
                </div>
              )}

              <button
                onClick={handleCloseAndReset}
                className="w-full max-w-xs py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm shadow-xs transition"
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
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {cartItems.map(({ product, quantity, variantId }, idx) => (
                  <div
                    key={`${product.id}-${variantId || ''}`}
                    className={`flex items-center gap-3 p-3 ${
                      idx > 0 ? 'border-t border-slate-100' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <h5 className="font-extrabold text-xs text-slate-900 truncate">{product.name}</h5>
                      {variantId && product.variants && (
                        <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                          {product.variants.find((v) => v.id === variantId)?.name || 'Variant'}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-slate-500">
                          {formatCurrency(product.price)} x {quantity}
                        </span>
                        <span className="text-[11px] font-black text-slate-900 tabular-nums">
                          {formatCurrency(product.price * quantity)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onUpdateQuantity(product.id, quantity - 1, variantId)}
                        disabled={quantity <= 1}
                        className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40 font-bold text-slate-700 flex items-center justify-center transition"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-extrabold text-slate-900 w-4 text-center">{quantity}</span>
                      <button
                        onClick={() => onUpdateQuantity(product.id, quantity + 1, variantId)}
                        className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center transition"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onRemoveItem(product.id, variantId)}
                        className="text-slate-400 hover:text-rose-600 p-1 transition ml-1"
                        title="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
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
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Final pricing is confirmed by the ERP on submission — any promotion discount or
                  price adjustment will be reflected in the request total.
                </p>
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
                  <span>Submit Order Request ({formatCurrency(grandTotal)})</span>
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