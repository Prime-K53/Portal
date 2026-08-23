import React, { useState, useMemo } from 'react';
import {
  ArrowUpDown,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  Layers,
  List,
  Loader2,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  Table as TableIcon,
  Truck,
  Zap,
} from 'lucide-react';
import { CartItem, Order, OrderRequest, Product } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { canCancelOrderRequest, canReorderOrder, getRequestStatusBadge } from '../../utils/orderRequest';
import { VariantSelectModal } from '../modals/VariantSelectModal';

interface OrdersTabProps {
  products: Product[];
  /** Official Sales Orders (SO-...) created by the ERP. */
  orders: Order[];
  /** Customer order REQUESTS (ODR-...) — submitted requests awaiting ERP confirmation. */
  orderRequests: OrderRequest[];
  cartItems: CartItem[];
  onAddToCart: (product: Product, quantity: number) => void;
  onOpenCart: () => void;
  /** Re-submits an official order through the ERP reorder pipeline — resolves with the new request. */
  onReorder: (order: Order) => Promise<OrderRequest>;
  /** Cancels a customer's own order request — the ERP enforces ownership + status. */
  onCancelOrderRequest: (request: OrderRequest) => Promise<OrderRequest>;
  onSelectProductDetail?: (product: Product) => void;
  onSelectOrderDetail?: (order: Order) => void;
}

export const OrdersTab: React.FC<OrdersTabProps> = ({
  products,
  orders,
  orderRequests,
  cartItems,
  onAddToCart,
  onOpenCart,
  onReorder,
  onCancelOrderRequest,
  onSelectProductDetail,
  onSelectOrderDetail,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'catalog' | 'history'>('catalog');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc' | 'rating' | 'name'>('featured');
  const [inStockOnly, setInStockOnly] = useState(false);

  // Per-product variant selection state
  const [selectedVariantIds, setSelectedVariantIds] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    products.forEach((p) => {
      if (p.variants && p.variants.length > 0) {
        initial[p.id] = p.selectedVariantId || p.variants[0].id;
      }
    });
    return initial;
  });

  // Per-product selected quantity state
  const [productQuantities, setProductQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    products.forEach((p) => {
      initial[p.id] = p.minOrderQty || 1;
    });
    return initial;
  });

  // Added animation state
  const [addedProductIds, setAddedProductIds] = useState<Record<string, boolean>>({});

  // Bookmarks / Favorites
  const [bookmarkedSkus, setBookmarkedSkus] = useState<string[]>(['PAP-A4-01', 'PEN-GEL-02', 'ST-BC-1000']);

  // Multi-select for Batch Order
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  // Quick SKU order state
  const [isQuickSkuOpen, setIsQuickSkuOpen] = useState(false);
  const [quickSkuInput, setQuickSkuInput] = useState('');
  const [quickQtyInput, setQuickQtyInput] = useState(10);
  const [quickSkuFeedback, setQuickSkuFeedback] = useState<string | null>(null);

  const categories = useMemo(() => {
    return ['All', '★ Favorites', ...Array.from(new Set(products.map((p) => p.category)))];
  }, [products]);

  const toggleBookmark = (sku: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setBookmarkedSkus((prev) =>
      prev.includes(sku) ? prev.filter((s) => s !== sku) : [...prev, sku]
    );
  };

  const handleQtyChange = (productId: string, delta: number, minQty: number = 1) => {
    setProductQuantities((prev) => {
      const current = prev[productId] || minQty;
      const updated = Math.max(minQty, current + delta);
      return { ...prev, [productId]: updated };
    });
  };

  const handleQtyInput = (productId: string, value: string, minQty: number = 1) => {
    const parsed = parseInt(value, 10);
    const updated = isNaN(parsed) || parsed < 1 ? minQty : parsed;
    setProductQuantities((prev) => ({ ...prev, [productId]: updated }));
  };

  const getEffectiveProduct = (product: Product): Product => {
    const variantId = selectedVariantIds[product.id];
    if (variantId && product.variants) {
      const variant = product.variants.find((v) => v.id === variantId);
      if (variant) {
        return {
          ...product,
          price: variant.sellingPrice,
          sku: variant.sku || product.sku,
          selectedVariantId: variant.id,
        };
      }
    }
    return product;
  };

  // ── Mandatory variant chooser ────────────────────────────────────────────
  // Any "Add to Cart" on a product WITH variants opens the VariantSelectModal
  // first; the add only happens after an explicit option is picked there.
  // Non-variant products keep the one-click flow.
  const [variantPickerQueue, setVariantPickerQueue] = useState<Array<{ product: Product; quantity: number }>>([]);

  const requestAddToCart = (product: Product, quantity: number) => {
    if (product.variants && product.variants.length > 0) {
      setVariantPickerQueue((prev) => [...prev, { product, quantity }]);
      return;
    }
    onAddToCart(product, quantity);
    setAddedProductIds((prev) => ({ ...prev, [product.id]: true }));
    setTimeout(() => {
      setAddedProductIds((prev) => ({ ...prev, [product.id]: false }));
    }, 1500);
  };

  const handleVariantPickerConfirm = (effectiveProduct: Product, quantity: number) => {
    onAddToCart(effectiveProduct, quantity);
    setAddedProductIds((prev) => ({ ...prev, [effectiveProduct.id]: true }));
    setTimeout(() => {
      setAddedProductIds((prev) => ({ ...prev, [effectiveProduct.id]: false }));
    }, 1500);
    setVariantPickerQueue((prev) => prev.slice(1));
  };


  const toggleSelectProduct = (productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const handleSelectAll = (filtered: Product[]) => {
    if (selectedProductIds.length === filtered.length) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(filtered.map((p) => p.id));
    }
  };

  const handleQuickSkuSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSku = quickSkuInput.trim().toUpperCase();
    const foundProduct = products.find((p) => p.sku.toUpperCase() === cleanSku);

    if (foundProduct) {
      const qty = Math.max(foundProduct.minOrderQty || 1, quickQtyInput);
      // Variant products open the mandatory chooser instead of adding directly.
      requestAddToCart(foundProduct, qty);
      if (!(foundProduct.variants && foundProduct.variants.length > 0)) {
        setQuickSkuFeedback(`Added ${qty}x ${foundProduct.name} to cart!`);
        setQuickSkuInput('');
        setQuickQtyInput(10);
      } else {
        setQuickSkuFeedback(`Choose an option for ${foundProduct.name} to finish adding.`);
      }
      setTimeout(() => setQuickSkuFeedback(null), 3500);
    } else {
      setQuickSkuFeedback(`Error: SKU "${cleanSku}" not found in catalog.`);
      setTimeout(() => setQuickSkuFeedback(null), 3500);
    }
  };

  // Filtering & Sorting
  const filteredProducts = useMemo(() => {
    let result = products.filter((p) => {
      if (selectedCategory === '★ Favorites') {
        if (!bookmarkedSkus.includes(p.sku)) return false;
      } else if (selectedCategory !== 'All' && p.category !== selectedCategory) {
        return false;
      }

      if (inStockOnly && !p.inStock) return false;

      const term = searchTerm.toLowerCase().trim();
      if (!term) return true;

      return (
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        p.description.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term)
      );
    });

    // Sorting
    result = [...result].sort((a, b) => {
      if (sortBy === 'price-asc') return a.price - b.price;
      if (sortBy === 'price-desc') return b.price - a.price;
      if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      // 'featured'
      if (a.isTopSeller && !b.isTopSeller) return -1;
      if (!a.isTopSeller && b.isTopSeller) return 1;
      return 0;
    });

    return result;
  }, [products, selectedCategory, bookmarkedSkus, inStockOnly, searchTerm, sortBy]);

  const handleAddSingleProduct = (product: Product, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const qty = productQuantities[product.id] || product.minOrderQty || 1;
    requestAddToCart(product, qty);
  };

  const handleAddBatchToCart = () => {
    const selectedProds = products.filter((p) => selectedProductIds.includes(p.id));
    selectedProds.forEach((p) => {
      const qty = productQuantities[p.id] || p.minOrderQty || 1;
      // Variant products queue through the mandatory chooser one by one.
      requestAddToCart(p, qty);
    });
    setSelectedProductIds([]);
  };

  const batchSubtotal = useMemo(() => {
    return products
      .filter((p) => selectedProductIds.includes(p.id))
      .reduce((sum, p) => {
        const effectiveProduct = getEffectiveProduct(p);
        const qty = productQuantities[p.id] || effectiveProduct.minOrderQty || 1;
        return sum + effectiveProduct.price * qty;
      }, 0);
  }, [products, selectedProductIds, productQuantities, selectedVariantIds]);

  const totalCartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // Order request cancellation — two-step confirm (no destructive instant action)
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [cancelBusyId, setCancelBusyId] = useState<string | null>(null);
  // Reorder feedback — shows the ERP-created request number
  const [reorderBusyId, setReorderBusyId] = useState<string | null>(null);
  const [reorderNotice, setReorderNotice] = useState<string | null>(null);

  const resetReorderNotice = () => {
    if (reorderNotice) {
      window.setTimeout(() => setReorderNotice(null), 6000);
    }
  };

  const handleCancelRequestClick = (request: OrderRequest) => {
    if (pendingCancelId === request.id) {
      setCancelBusyId(request.id);
      onCancelOrderRequest(request)
        .catch(() => {
          // The ERP rejected the cancellation (e.g. already converted) — the
          // global action error banner explains why; the list refreshes.
        })
        .finally(() => {
          setPendingCancelId(null);
          setCancelBusyId(null);
        });
    } else {
      setPendingCancelId(request.id);
    }
  };

  const handleReorderClick = (order: Order) => {
    if (reorderBusyId) return;
    setReorderBusyId(order.id);
    onReorder(order)
      .then((created) => {
        if (created.requestNumber) {
          setReorderNotice(
            `Reorder submitted — new order request ${created.requestNumber} created. It will be reviewed by the ERP sales team.`
          );
          resetReorderNotice();
        }
      })
      .catch(() => {
        // Error surfaced by the global action error banner.
      })
      .finally(() => setReorderBusyId(null));
  };

  return (
    <div className="space-y-4 pb-28 text-slate-900">
      {/* Module Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-slate-900 text-white shadow-xs">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Commercial Catalog & Orders</h2>
            <p className="text-xs text-slate-500">Browse wholesale catalog, review order histories, or enter express SKU re-orders</p>
          </div>
        </div>
      </div>

      {/* Subtab Toggle Header */}
      <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
        <button
          onClick={() => setActiveSubTab('catalog')}
          className={`flex-1 py-2.5 text-xs font-black rounded-xl transition flex items-center justify-center gap-2 ${
            activeSubTab === 'catalog'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Product Catalog ({products.length})</span>
        </button>
        <button
          onClick={() => setActiveSubTab('history')}
          className={`flex-1 py-2.5 text-xs font-black rounded-xl transition flex items-center justify-center gap-2 ${
            activeSubTab === 'history'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Order History ({orderRequests.length + orders.length})</span>
        </button>
      </div>

      {activeSubTab === 'catalog' ? (
        <>
          {/* Quick Express SKU Bar */}
          <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white rounded-2xl p-3.5 shadow-xs border border-slate-800">
            <div
              className="flex items-center justify-between cursor-pointer select-none"
              onClick={() => setIsQuickSkuOpen(!isQuickSkuOpen)}
            >
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-400/20 text-amber-400 border border-amber-400/30">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-black block">Express Wholesale SKU Quick Order</span>
                  <span className="text-[11.5px] text-indigo-200 font-medium">Type product SKU code to add directly in bulk</span>
                </div>
              </div>
              <button className="text-slate-300 hover:text-white p-1">
                {isQuickSkuOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {isQuickSkuOpen && (
              <form onSubmit={handleQuickSkuSubmit} className="mt-3 pt-3 border-t border-slate-800 space-y-2.5">
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <div className="relative flex-1 min-w-[160px]">
                    <input
                      type="text"
                      placeholder="Enter SKU (e.g. PAP-A4-01, ST-BC-1000)"
                      value={quickSkuInput}
                      onChange={(e) => setQuickSkuInput(e.target.value)}
                      className="w-full bg-slate-900/90 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 font-mono uppercase focus:outline-none focus:border-amber-400"
                      required
                    />
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[11.5px] text-slate-400 font-bold uppercase">Qty:</span>
                    <input
                      type="number"
                      min="1"
                      max="5000"
                      value={quickQtyInput}
                      onChange={(e) => setQuickQtyInput(parseInt(e.target.value) || 1)}
                      className="w-20 bg-slate-900/90 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white font-bold text-center focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs rounded-xl shadow-xs transition shrink-0 flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> Add SKU
                  </button>
                </div>

                {quickSkuFeedback && (
                  <p
                    className={`text-[12.5px] font-extrabold px-3 py-1.5 rounded-xl ${
                      quickSkuFeedback.startsWith('Error')
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {quickSkuFeedback}
                  </p>
                )}
              </form>
            )}
          </div>

          {/* Search, Categories, Sort, and View Mode Toolbar */}
          <div className="space-y-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
            {/* Search Input & Control Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Search catalog by product name, SKU, or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                   className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-xs font-normal text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-slate-900 shadow-2xs"
                />
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              </div>

              {/* Sort Dropdown & View Mode Switcher */}
              <div className="flex items-center gap-2 justify-between sm:justify-start">
                {/* Sort Selector */}
                <div className="relative flex-1 sm:flex-none">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-slate-900 appearance-none pr-8 cursor-pointer"
                  >
                    <option value="featured">Sort: Featured</option>
                    <option value="price-asc">Price: Low to High</option>
                    <option value="price-desc">Price: High to Low</option>
                    <option value="rating">Highest Rated</option>
                    <option value="name">Name: A to Z</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3.5 pointer-events-none" />
                </div>

                {/* View Switcher (List vs Table) */}
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
                  <button
                    onClick={() => setViewMode('grid')}
                    title="List View"
                    className={`p-1.5 rounded-lg transition ${
                      viewMode === 'grid'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    title="Procurement Table View"
                    className={`p-1.5 rounded-lg transition ${
                      viewMode === 'table'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <TableIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Category Pills & Stock Filter */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {categories.map((cat) => {
                  const count =
                    cat === 'All'
                      ? products.length
                      : cat === '★ Favorites'
                      ? products.filter((p) => bookmarkedSkus.includes(p.sku)).length
                      : products.filter((p) => p.category === cat).length;

                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition flex items-center gap-1.5 ${
                        selectedCategory === cat
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200/80'
                      }`}
                    >
                      <span>{cat}</span>
                      <span
                        className={`text-[11.5px] px-1.5 py-0.2 rounded-full font-mono ${
                          selectedCategory === cat ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* In Stock Toggle */}
              <label className="hidden sm:flex items-center gap-2 cursor-pointer shrink-0 select-none text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => setInStockOnly(e.target.checked)}
                  className="rounded text-slate-900 focus:ring-slate-900"
                />
                <span>In Stock Only</span>
              </label>
            </div>
          </div>

          {/* Floating Batch Add Bar when items selected */}
          {selectedProductIds.length > 0 && (
            <div className="p-3 bg-indigo-950 text-white rounded-2xl shadow-lg border border-indigo-900 flex items-center justify-between gap-3 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-400 text-slate-950 font-black text-xs rounded-lg">
                  {selectedProductIds.length}
                </div>
                <div>
                  <span className="text-xs font-extrabold block">
                    {selectedProductIds.length} Product(s) Selected
                  </span>
                  <span className="text-[12.5px] text-indigo-200 font-medium">
                    Subtotal: {formatCurrency(batchSubtotal)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedProductIds([])}
                  className="px-3 py-1.5 text-xs text-indigo-200 hover:text-white font-bold"
                >
                  Clear Selection
                </button>
                <button
                  onClick={handleAddBatchToCart}
                  className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Add Selected to Cart</span>
                </button>
              </div>
            </div>
          )}

          {/* Product Results Info */}
          <div className="flex items-center justify-between px-1 text-xs text-slate-500 font-medium">
            <span>Showing <strong className="text-slate-900">{filteredProducts.length}</strong> products</span>
            {viewMode === 'table' && (
              <button
                onClick={() => handleSelectAll(filteredProducts)}
                className="text-indigo-600 font-bold hover:underline"
              >
                {selectedProductIds.length === filteredProducts.length ? 'Deselect All' : 'Select All Items'}
              </button>
            )}
          </div>

          {/* LIST VIEW MODE */}
          {viewMode === 'grid' && (
            <div className="flex flex-col gap-2">
              {filteredProducts.map((product) => {
                const isAdded = addedProductIds[product.id];
                const isBookmarked = bookmarkedSkus.includes(product.sku);
                const isSelected = selectedProductIds.includes(product.id);
                const qty = product.minOrderQty || 1;

                return (
                  <div
                    key={product.id}
                    className={`rounded-xl border bg-white ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/40'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center gap-3 p-3">
                      {/* Product Info */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelectProduct(product.id);
                            }}
                            className={`shrink-0 rounded-md border flex items-center justify-center ${
                              isSelected
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-white border-slate-200 text-slate-600'
                            }`}
                            style={{ width: 18, height: 18 }}
                            aria-label="Select product"
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                          </button>

                          <span className="text-[10px] font-mono font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                            {product.sku}
                          </span>
                          <span className="text-[11px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                            {product.category}
                          </span>
                          {product.isTopSeller && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wide">
                              Top Seller
                            </span>
                          )}
                          <button
                            onClick={(e) => toggleBookmark(product.sku, e)}
                            title={isBookmarked ? 'Remove Favorite' : 'Add to Favorites'}
                            className={`shrink-0 p-1 rounded-md transition-colors ${
                              isBookmarked
                                ? 'bg-amber-400 text-slate-950 border border-amber-400'
                                : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-slate-950' : ''}`} />
                          </button>
                        </div>

                          <h4
                            className="font-semibold text-sm text-slate-900 truncate cursor-pointer"
                            onClick={() => onSelectProductDetail && onSelectProductDetail(getEffectiveProduct(product))}
                          >
                            {product.name}
                          </h4>
                         {product.description && (
                           <p className="text-xs text-slate-500 line-clamp-1">
                             {product.description}
                           </p>
                         )}
                         {product.variants && product.variants.length > 0 && (
                           <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md px-2 py-0.5">
                             <Layers className="w-3 h-3" />
                             {product.variants.length} options
                           </span>
                         )}
                        <div className="flex items-center gap-2 flex-wrap">
                          {product.rating && (
                            <span className="flex items-center gap-1 text-[11px] font-extrabold text-amber-700">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              <span>{product.rating}</span>
                              {product.ratingCount && (
                                <span className="text-slate-400 font-normal">({product.ratingCount})</span>
                              )}
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400">•</span>
                          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {product.inStock ? 'In Stock' : 'Backorder'}
                          </span>
                          <span className="text-[11px] text-slate-400">•</span>
                          <span className="text-[11px] text-slate-500">
                            Min Order: {product.minOrderQty || 1} {product.unit}
                          </span>
                        </div>
                      </div>

                      {/* Price & Actions */}
                      <div className="flex flex-col items-end gap-2">
                        <div className="text-right">
                          <span className="text-base font-black text-slate-900 tabular-nums">
                            {formatCurrency(getEffectiveProduct(product).price)} / {product.unit}
                          </span>
                        </div>

                        <button
                          onClick={(e) => handleAddSingleProduct(product, e)}
                          className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors ${
                            isAdded
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-950 hover:bg-slate-800 text-white'
                          }`}
                        >
                          {isAdded ? (
                            <>
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Added!</span>
                            </>
                          ) : (
                            <>
                              <ShoppingCart className="w-4 h-4 text-amber-400" />
                              <span>Add to Cart</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* DENSE TABLE VIEW MODE (B2B Procurement Table) */}
          {viewMode === 'table' && (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] md:text-[13px] text-slate-700">
                  <thead className="table-header bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={selectedProductIds.length === filteredProducts.length && filteredProducts.length > 0}
                          onChange={() => handleSelectAll(filteredProducts)}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                      </th>
                       <th className="p-3 min-w-[220px]">Product & SKU</th>
                        <th className="p-3 hidden md:table-cell">Category</th>
                        <th className="p-3">Unit Price</th>
                        <th className="p-3 min-w-[140px] hidden md:table-cell">Order Quantity</th>
                        <th className="p-3 text-right hidden md:table-cell">Subtotal</th>
                        <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.map((product) => {
                      const isAdded = addedProductIds[product.id];
                      const isBookmarked = bookmarkedSkus.includes(product.sku);
                      const qty = productQuantities[product.id] || product.minOrderQty || 1;
                      const isSelected = selectedProductIds.includes(product.id);
                      // Subtotal follows the SELECTED variant's ERP price.
                      const subtotal = getEffectiveProduct(product).price * qty;

                      return (
                        <tr
                          key={product.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isSelected ? 'bg-indigo-50/40' : ''
                          }`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectProduct(product.id)}
                              className="rounded text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>

                            {/* Product Info */}
                            <td className="p-3 table-body-cell">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span
                                     className="font-semibold text-slate-900 hover:text-indigo-600 cursor-pointer text-xs"
                                    onClick={() => onSelectProductDetail && onSelectProductDetail(getEffectiveProduct(product))}
                                  >
                                    {product.name}
                                  </span>
                                </div>
                                 <div className="flex items-center gap-2 text-[11.5px] text-slate-500 font-mono mt-0.5">
                                   <span>SKU: {product.sku}</span>
                                   <button
                                     onClick={(e) => toggleBookmark(product.sku, e)}
                                     className="text-amber-500 hover:text-amber-600"
                                   >
                                     <Bookmark className={`w-3 h-3 ${isBookmarked ? 'fill-amber-400' : ''}`} />
                                   </button>
                                 </div>
                                 {product.variants && product.variants.length > 0 && (
                                   <span className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md px-1.5 py-0.5">
                                     <Layers className="w-3 h-3" />
                                     {product.variants.length} options
                                   </span>
                                 )}
                               </div>
                             </td>

                            {/* Category */}
                            <td className="p-3 hidden md:table-cell">
                              <span className="text-[11.5px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">
                                {product.category}
                              </span>
                            </td>

                             {/* Unit Price */}
                             <td className="p-3 table-body-cell whitespace-nowrap">
                               <span className="font-medium text-slate-900 finance-nums">
                                 {formatCurrency(getEffectiveProduct(product).price)} / {product.unit}
                               </span>
                             </td>

                            {/* Quantity Stepper */}
                           <td className="p-3 hidden md:table-cell">
                             <div className="flex items-center gap-1">
                               <button
                                 onClick={() => handleQtyChange(product.id, -1, 1)}
                                 disabled={qty <= 1}
                                 className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40 font-bold text-slate-700 flex items-center justify-center transition"
                               >
                                 <Minus className="w-3 h-3" />
                               </button>

                               <input
                                 type="number"
                                 value={qty}
                                 onChange={(e) => handleQtyInput(product.id, e.target.value, 1)}
                                 className="w-12 text-center font-bold text-xs bg-slate-50 border border-slate-200 rounded py-0.5 text-slate-900 focus:outline-none focus:border-slate-900 finance-nums"
                               />

                               <button
                                 onClick={() => handleQtyChange(product.id, 1, 1)}
                                 className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center transition"
                               >
                                 <Plus className="w-3 h-3" />
                               </button>
                             </div>
                           </td>

                           {/* Subtotal */}
                           <td className="p-3 text-right table-body-cell font-medium finance-nums hidden md:table-cell">
                             {formatCurrency(subtotal)}
                           </td>

                          {/* Add Button */}
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleAddSingleProduct(product)}
                              className={`p-2 rounded-xl font-bold text-xs transition ${
                                isAdded
                                  ? 'bg-emerald-600 text-white shadow-2xs'
                                  : 'bg-slate-950 hover:bg-slate-800 text-white shadow-2xs'
                              }`}
                              title="Add to Cart"
                            >
                              {isAdded ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {filteredProducts.length === 0 && (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
              <ShoppingBag className="w-10 h-10 mx-auto text-slate-300" />
              <h3 className="text-sm font-bold text-slate-700">No products match your criteria</h3>
              <p className="text-xs text-slate-500">Try clearing your search keyword or selected category filter.</p>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('All');
                  setInStockOnly(false);
                }}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl shadow-2xs"
              >
                Reset Filters
              </button>
            </div>
          )}
        </>
      ) : (
        /* Order History Subtab — Order REQUESTS (ODR) + Official Sales Orders (SO) */
        <div className="space-y-3">
          {reorderNotice && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-bold leading-relaxed flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{reorderNotice}</span>
            </div>
          )}

          {/* Section: Order Requests (ODR-...) — the ERP request pipeline */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-200/70">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-indigo-600" />
                  Order Requests
                </h3>
                <p className="text-[11.5px] text-slate-500 font-medium">
                  Submitted requests awaiting ERP confirmation — the official Sales Order is created by the ERP.
                </p>
              </div>
              <span className="text-[10px] font-extrabold bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                {orderRequests.length} request(s)
              </span>
            </div>
          </div>

          {orderRequests.length === 0 ? (
            <div className="text-center py-8 bg-white rounded-2xl border border-slate-200/90 space-y-2">
              <Package className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs font-bold text-slate-600">No order requests yet</p>
              <p className="text-[11.5px] text-slate-400">Submit items from the catalog — each submission creates an ODR request reviewed by the ERP sales team.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orderRequests.map((request) => {
                const badge = getRequestStatusBadge(request.status);
                const cancelable = canCancelOrderRequest(request.status);
                const isPendingConfirm = pendingCancelId === request.id;
                const isBusy = cancelBusyId === request.id;
                return (
                  <div key={request.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-slate-900 space-y-3 shadow-2xs cursor-pointer hover:border-indigo-300 hover:shadow-md transition">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-slate-900">{request.requestNumber || 'Request'}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg}`}>
                            {badge.label}
                          </span>
                        </div>
                        <p className="text-[12.5px] text-slate-500 mt-0.5">Submitted on {formatDate(request.date)}</p>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-medium text-slate-900 block finance-nums">{formatCurrency(request.total)}</span>
                        <span className="text-[11.5px] text-slate-400">
                          {request.officialOrderNumber ? `Converted to ${request.officialOrderNumber}` : 'Awaiting ERP review'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[11.5px] text-slate-400 font-medium">
                        {request.items.length} line item{request.items.length !== 1 ? 's' : ''}
                      </span>
                      <span className="text-[11.5px] text-indigo-600 font-bold">View details →</span>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                      <span className="text-[12.5px] text-slate-500 font-medium">
                        {request.requestedDeliveryDate ? `Requested delivery: ${formatDate(request.requestedDeliveryDate)}` : 'No delivery date specified'}
                      </span>
                      <div className="flex items-center gap-2">
                        {cancelable && (
                          <button
                            onClick={() => handleCancelRequestClick(request)}
                            disabled={isBusy}
                            className={`px-3.5 py-2 rounded-xl font-extrabold transition shadow-xs ${
                              isPendingConfirm
                                ? 'bg-rose-600 text-white hover:bg-rose-700'
                                : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                            }`}
                          >
                            {isBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : isPendingConfirm ? (
                              'Confirm Cancel?'
                            ) : (
                              'Cancel Request'
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Section: Official Sales Orders (SO-...) */}
          <div className="p-3.5 rounded-2xl bg-slate-100 border border-slate-200/70">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-slate-600" />
                  Official Sales Orders
                </h3>
                <p className="text-[11.5px] text-slate-500 font-medium">
                  Orders confirmed by the ERP and routed to logistics dispatch.
                </p>
              </div>
              <span className="text-[10px] font-extrabold bg-slate-200 text-slate-700 border border-slate-300 px-2 py-0.5 rounded-full">
                {orders.length} order(s)
              </span>
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="text-center py-8 bg-white rounded-2xl border border-slate-200/90 space-y-2">
              <Truck className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs font-bold text-slate-600">No official sales orders yet</p>
              <p className="text-[11.5px] text-slate-400">Once the ERP confirms an order request, the official Sales Order appears here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const badge = {
                  label: order.status.charAt(0).toUpperCase() + order.status.slice(1),
                  bg: 'bg-blue-100 text-blue-800 border-blue-200',
                };
                const reorderable = canReorderOrder(order);
                const isBusy = reorderBusyId === order.id;
                return (
                  <div
                    key={order.id}
                    onClick={() => onSelectOrderDetail?.(order)}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-slate-900 space-y-3 shadow-2xs cursor-pointer hover:border-indigo-300 hover:shadow-md transition"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-slate-900">{order.orderNumber}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg}`}>
                            {badge.label}
                          </span>
                        </div>
                        <p className="text-[12.5px] text-slate-500 mt-0.5">Placed on {formatDate(order.date)}</p>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-medium text-slate-900 block finance-nums">{formatCurrency(order.totalAmount)}</span>
                        <span className="text-[11.5px] text-slate-400">
                          Est. delivery {formatDate(order.estimatedDelivery)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[11.5px] text-slate-400 font-medium">
                        {order.items.length} line item{order.items.length !== 1 ? 's' : ''}
                      </span>
                      <span className="text-[11.5px] text-indigo-600 font-bold">View details →</span>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                      <span className="text-[12.5px] text-slate-500 font-medium">
                        {order.deliveryAddress || 'No delivery address'}
                      </span>
                      {reorderable ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReorderClick(order);
                          }}
                          disabled={isBusy}
                          className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-xs flex items-center gap-1.5 transition disabled:opacity-50"
                        >
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                          )}
                          <span>{isBusy ? 'Submitting...' : 'Reorder 1-Click'}</span>
                        </button>
                      ) : (
                        <span className="text-slate-400 text-[12.5px] font-medium">Not reorderable</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Floating Bottom Cart Bar */}
      {totalCartCount > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-20 p-3 bg-slate-950/95 text-white border-t border-slate-800 backdrop-blur-md shadow-2xl animate-slide-up">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-400 text-slate-950 rounded-xl font-black text-xs shadow-xs">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-black block">{totalCartCount} Item(s) in Order Cart</span>
                <span className="text-[11.5px] text-indigo-200 font-medium">Ready for quick account checkout</span>
              </div>
            </div>
            <button
              onClick={onOpenCart}
              className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs shadow-md flex items-center gap-1.5 transition"
            >
              <span>View Cart & Checkout</span>
            </button>
          </div>
        </div>
      )}

      {/* Mandatory variant chooser — opens for any Add to Cart on a variant product. */}
      <VariantSelectModal
        product={variantPickerQueue[0]?.product ?? null}
        quantity={variantPickerQueue[0]?.quantity ?? 1}
        onClose={() => setVariantPickerQueue((prev) => prev.slice(1))}
        onConfirm={handleVariantPickerConfirm}
      />
    </div>
  );
};

