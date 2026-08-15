import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Package,
  ShieldCheck,
  ShoppingBag,
  Star,
  Truck,
  X,
} from 'lucide-react';
import { Product } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface ProductDetailModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  isOpen,
  onClose,
  onAddToCart,
}) => {
  const [qty, setQty] = useState(product?.minOrderQty || 1);
  const [added, setAdded] = useState(false);

  if (!isOpen || !product) return null;

  const handleAdd = () => {
    onAddToCart(product, qty);
    setAdded(true);
    setTimeout(() => {
      setAdded(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-slide-up">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] bg-slate-200 text-slate-800 font-mono font-bold px-2 py-0.5 rounded-md border border-slate-300">
              SKU: {product.sku}
            </span>
            <span className="text-[11.5px] bg-blue-100 text-blue-800 font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border border-blue-200">
              {product.category}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-black text-slate-900 leading-snug">{product.name}</h3>
            </div>

            {/* Ratings & Stock Status */}
            <div className="flex items-center gap-3 mt-2 text-xs font-bold text-slate-600">
              <div className="flex items-center text-amber-500 font-black gap-1 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span>{product.rating || 4.9}</span>
                <span className="text-slate-400 font-normal">({product.ratingCount || 150} verified B2B reviews)</span>
              </div>
              <span>•</span>
              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                In Stock & Ready
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
            {product.description}
          </p>

          {/* Pricing Display */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-[11.5px] font-bold text-slate-400 uppercase tracking-wider block">Price</span>
            <div className="text-xl font-black text-slate-900">
              {formatCurrency(product.price)} / {product.unit}
            </div>
            {product.originalPrice && product.originalPrice > product.price && (
              <div className="text-[12.5px] text-emerald-700 font-extrabold">
                Promotional Savings: Save {formatCurrency(product.originalPrice - product.price)} / {product.unit}
              </div>
            )}
          </div>

          {/* Service Guarantee Badges */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="text-xs font-bold text-slate-800">Customization & Printing Guarantee</div>
            <div className="grid grid-cols-2 gap-2 text-[12.5px] font-bold text-slate-600">
              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200/80">
                <Package className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Bulk Commercial Packaging</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200/80">
                <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Express Dispatch Available</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200/80">
                <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>Color Proof Pre-Approval</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200/80">
                <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                <span>ISO 9001 Quality Standard</span>
              </div>
            </div>
          </div>

          {/* Quantity selector */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <label className="text-xs font-bold text-slate-700 block">Select Order Quantity ({product.unit}s)</label>
            <div className="flex items-center gap-3">
              <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden bg-white shadow-2xs">
                <button
                  type="button"
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-100 font-black transition"
                >
                  -
                </button>
                <span className="px-4 text-xs font-black text-slate-900">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQty(qty + 1)}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-100 font-black transition"
                >
                  +
                </button>
              </div>

              <div className="text-xs text-slate-500 font-medium">
                Total: <span className="font-black text-slate-900 text-sm">{formatCurrency(product.price * qty)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs transition"
          >
            Close
          </button>

          <button
            onClick={handleAdd}
            disabled={added}
            className={`px-6 py-2.5 rounded-xl font-extrabold text-xs text-white shadow-md flex items-center gap-2 transition ${
              added ? 'bg-emerald-600' : 'bg-slate-900 hover:bg-slate-800'
            }`}
          >
            {added ? (
              <>
                <Check className="w-4 h-4" />
                <span>Added to Order</span>
              </>
            ) : (
              <>
                <ShoppingBag className="w-4 h-4" />
                <span>Add {qty} {product.unit}(s) to Order</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
