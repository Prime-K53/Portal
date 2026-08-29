import React, { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, Layers, ShoppingBag, X } from 'lucide-react';
import { Product } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { useFocusTrap } from '../../utils/useFocusTrap';

interface VariantSelectModalProps {
  /** Product whose variants must be chosen. Null closes the picker. */
  product: Product | null;
  /** Quantity queued for this add (from the card/table stepper). */
  quantity: number;
  onClose: () => void;
  /** Fired ONLY after an explicit variant choice; receives the effective product. */
  onConfirm: (effectiveProduct: Product, quantity: number) => void;
}

/**
 * Mandatory variant chooser. Opens whenever "Add to Cart" is pressed on a
 * product that has variants; the confirm button stays disabled until the
 * customer explicitly picks one option, so a variant is never silently
 * defaulted. The confirmed product carries the SELECTED VARIANT'S OWN ERP
 * price (server re-prices authoritatively at submission).
 */
export const VariantSelectModal: React.FC<VariantSelectModalProps> = ({
  product,
  quantity,
  onClose,
  onConfirm,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(containerRef, { active: product !== null, onEscape: onClose });

  // Mandatory: start with NO selection on every open.
  const [selectedVariantId, setSelectedVariantId] = useState('');

  // Reset the choice whenever a different product opens.
  useEffect(() => {
    setSelectedVariantId('');
  }, [product?.id]);

  if (!product) return null;

  const variants = product.variants ?? [];
  const selectedVariant = variants.find((v) => v.id === selectedVariantId) || null;
  const effectivePrice = selectedVariant ? selectedVariant.sellingPrice : product.price;
  const canConfirm = Boolean(selectedVariant);

  const handleConfirm = () => {
    if (!selectedVariant) return;
    onConfirm(
      {
        ...product,
        price: selectedVariant.sellingPrice,
        sku: selectedVariant.sku || product.sku,
        selectedVariantId: selectedVariant.id,
      },
      quantity
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-slide-up"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2 min-w-0">
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
              <Layers className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 id={titleId} className="text-sm font-black text-slate-900 truncate">{product.name}</h3>
              <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                Choose an option to continue — required
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition shrink-0"
            aria-label="Close variant selector"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Variant options */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-2">
          {variants.map((variant) => {
            const isSelected = variant.id === selectedVariantId;
            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => setSelectedVariantId(variant.id)}
                className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-200'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span className="min-w-0">
                  <span className={`block text-[13px] font-extrabold truncate ${isSelected ? 'text-indigo-900' : 'text-slate-900'}`}>
                    {variant.name}
                  </span>
                  <span className="block text-[11px] text-slate-500 font-medium font-mono mt-0.5">
                    {variant.sku || product.sku}
                    {typeof variant.stock === 'number' ? ` • ${variant.stock} in stock` : ''}
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className={`text-sm font-black tabular-nums ${isSelected ? 'text-indigo-900' : 'text-slate-900'}`}>
                    {formatCurrency(variant.sellingPrice)}
                  </span>
                  {isSelected && <CheckCircle2 className="w-5 h-5 text-indigo-600" />}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-500">
              Quantity: <span className="font-black text-slate-900">{quantity}</span> {product.unit}
              {quantity > 1 ? 's' : ''}
            </span>
            {selectedVariant && (
              <span className="font-bold text-slate-500">
                Total:{' '}
                <span className="font-black text-slate-900 text-sm tabular-nums">
                  {formatCurrency(effectivePrice * quantity)}
                </span>
              </span>
            )}
          </div>

          {!selectedVariant && (
            <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              Select one of the options above to enable Add to Cart.
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs transition"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className={`px-6 py-2.5 rounded-xl font-extrabold text-xs text-white shadow-md flex items-center gap-2 transition ${
                canConfirm ? 'bg-slate-900 hover:bg-slate-800' : 'bg-slate-300 cursor-not-allowed'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Add {quantity} to Cart</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VariantSelectModal;
