import React, { useState, useMemo } from 'react';
import {
  ArrowUpDown,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  Grid,
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
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'catalog' | 'history'>('catalog');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc' | 'rating' | 'name'>('featured');
  const [inStockOnly, setInStockOnly] = useState(false);

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
      onAddToCart(foundProduct, qty);
      setQuickSkuFeedback(`Added ${qty}x ${foundProduct.name} to cart!`);
      setQuickSkuInput('');
      setQuickQtyInput(10);
      setTimeout(() => setQuickSkuFeedback(null), 3000);
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
    onAddToCart(product, qty);

    setAddedProductIds((prev) => ({ ...prev, [product.id]: true }));
    setTimeout(() => {
      setAddedProductIds((prev) => ({ ...prev, [product.id]: false }));
    }, 1500);
  };

  const handleAddBatchToCart = () => {
    const selectedProds = products.filter((p) => selectedProductIds.includes(p.id));
    selectedProds.forEach((p) => {
      const qty = productQuantities[p.id] || p.minOrderQty || 1;
      onAddToCart(p, qty);
    });
    setSelectedProductIds([]);
  };

  const batchSubtotal = useMemo(() => {
    return products
      .filter((p) => selectedProductIds.includes(p.id))
      .reduce((sum, p) => {
        const qty = productQuantities[p.id] || p.minOrderQty || 1;
        return sum + p.price * qty;
      }, 0);
  }, [products, selectedProductIds, productQuantities]);

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

                {/* View Switcher (Grid vs Table) */}
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
                  <button
                    onClick={() => setViewMode('grid')}
                    title="Grid View"
                    className={`p-1.5 rounded-lg transition ${
                      viewMode === 'grid'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <Grid className="w-4 h-4" />
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

          {/* GRID VIEW MODE */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map((product) => {
                const isAdded = addedProductIds[product.id];
                const isBookmarked = bookmarkedSkus.includes(product.sku);
                const isSelected = selectedProductIds.includes(product.id);
                const qty = product.minOrderQty || 1;
                const subtotal = product.price * qty;

                return (
                  <div
                    key={product.id}
                    className={`rounded-2xl bg-white border transition-all duration-200 flex flex-col justify-between overflow-hidden relative group ${
                      isSelected
                        ? 'border-indigo-600 ring-2 ring-indigo-600/20 shadow-md'
                        : 'border-slate-200/90 hover:border-slate-300 hover:shadow-md'
                    }`}
                  >
                    {/* Compact Card Header Bar (No Pictures) */}
                    <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {/* Checkbox for batch select */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectProduct(product.id);
                          }}
                          className={`p-1.5 rounded-lg transition ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>

                        <span className="text-[10px] font-mono font-bold text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                          SKU: {product.sku}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[11.5px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                          {product.category}
                        </span>

                        {/* Bookmark Favorite Button */}
                        <button
                          onClick={(e) => toggleBookmark(product.sku, e)}
                          title={isBookmarked ? 'Remove Favorite' : 'Add to Favorites'}
                          className={`p-1.5 rounded-lg transition ${
                            isBookmarked
                              ? 'bg-amber-400 text-slate-950 shadow-xs'
                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-slate-950' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {/* Card Content Body */}
                    <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <div
                          className="cursor-pointer space-y-1"
                          onClick={() => onSelectProductDetail && onSelectProductDetail(product)}
                        >
                          <h4 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2 leading-snug">
                            {product.name}
                          </h4>
                          <p className="text-sm font-normal text-slate-500 line-clamp-2">
                            {product.description}
                          </p>
                        </div>

                        {/* Rating & Stock Indicator */}
                        <div className="flex items-center justify-between pt-1">
                          {product.rating ? (
                            <div className="flex items-center gap-1 bg-amber-50 text-amber-800 px-2 py-0.5 rounded-lg border border-amber-200 text-[12.5px] font-extrabold">
                              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                              <span>{product.rating}</span>
                              {product.ratingCount ? (
                                <span className="text-slate-400 font-normal">({product.ratingCount})</span>
                              ) : null}
                            </div>
                          ) : (
                            <span />
                          )}

                          <div className="flex items-center gap-1.5 text-[12.5px] font-bold">
                            <span className={`w-2 h-2 rounded-full ${product.inStock ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            <span className={product.inStock ? 'text-emerald-700' : 'text-rose-600'}>
                              {product.inStock ? 'In Stock' : 'Backorder'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Pricing & Savings Display */}
                      <div className="pt-3 border-t border-slate-100 space-y-3">
                        <div className="flex items-baseline justify-between">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-lg font-black text-slate-900 tabular-nums">
                              {formatCurrency(product.price)} / {product.unit}
                            </span>
                            {product.originalPrice && product.originalPrice > product.price && (
                              <span className="text-xs text-slate-400 line-through font-bold">
                                {formatCurrency(product.originalPrice)}
                              </span>
                            )}
                          </div>
                        </div>

                        {product.originalPrice && product.originalPrice > product.price && (
                          <div className="text-[12.5px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200/80 flex items-center justify-between">
                            <span>Promotional Savings:</span>
                            <span className="font-extrabold">Save {formatCurrency(product.originalPrice - product.price)} / {product.unit}</span>
                          </div>
                        )}

                        {/* Card Action Row */}
                        <div className="pt-1">
                          <button
                            onClick={(e) => handleAddSingleProduct(product, e)}
                            className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition shrink-0 ${
                              isAdded
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-slate-950 hover:bg-slate-800 text-white shadow-xs'
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
                      <th className="p-3">Category</th>
                      <th className="p-3">Unit Price</th>
                      <th className="p-3">Stock</th>
                      <th className="p-3 min-w-[140px]">Order Quantity</th>
                      <th className="p-3 text-right">Subtotal</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.map((product) => {
                      const isAdded = addedProductIds[product.id];
                      const isBookmarked = bookmarkedSkus.includes(product.sku);
                      const qty = productQuantities[product.id] || product.minOrderQty || 1;
                      const isSelected = selectedProductIds.includes(product.id);
                      const subtotal = product.price * qty;

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

                          {/* Product Info & Thumbnail */}
                          <td className="p-3 table-body-cell">
                            <div className="flex items-center gap-3">
                              <img
                                src={product.image}
                                alt={product.name}
                                className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0 cursor-pointer"
                                onClick={() => onSelectProductDetail && onSelectProductDetail(product)}
                              />
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="font-medium text-slate-900 hover:text-indigo-600 cursor-pointer text-xs"
                                    onClick={() => onSelectProductDetail && onSelectProductDetail(product)}
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
                              </div>
                            </div>
                          </td>

                          {/* Category */}
                          <td className="p-3">
                            <span className="text-[11.5px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">
                              {product.category}
                            </span>
                          </td>

                          {/* Unit Price */}
                          <td className="p-3 table-body-cell whitespace-nowrap">
                            <span className="font-medium text-slate-900 finance-nums">
                              {formatCurrency(product.price)} / {product.unit}
                            </span>
                          </td>

                          {/* Stock Status */}
                          <td className="p-3">
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                product.inStock
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {product.inStock ? 'In Stock' : 'Backorder'}
                            </span>
                          </td>

                          {/* Quantity Stepper */}
                          <td className="p-3">
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
                          <td className="p-3 text-right table-body-cell font-medium finance-nums">
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
                  <div key={request.id} className="p-4 rounded-2xl bg-white border border-slate-200/90 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                      <div>
                        <h4 className="font-mono font-bold text-sm text-slate-900">{request.requestNumber || 'Request'}</h4>
                        <p className="text-[12.5px] text-slate-500 font-medium">Submitted {formatDate(request.date)}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-black text-slate-900 block tabular-nums">{formatCurrency(request.total)}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold capitalize ${badge.bg}`}>
                          {badge.label}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs text-slate-700">
                      {request.items.length > 0 ? (
                        request.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between font-medium">
                            <span>{item.quantity}x {item.productName}</span>
                            <span className="text-slate-500 tabular-nums">{formatCurrency(item.total)}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-[11.5px] text-slate-400">Request line items are confirmed by the ERP.</p>
                      )}
                      {request.discountTotal ? (
                        <div className="flex justify-between font-bold text-emerald-700">
                          <span>Promotion discount</span>
                          <span>-{formatCurrency(request.discountTotal)}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                      <div className="text-slate-500 text-[12.5px] font-medium space-y-0.5">
                        {request.requestedDeliveryDate && (
                          <div>Requested delivery: <span className="text-slate-700">{formatDate(request.requestedDeliveryDate)}</span></div>
                        )}
                        {request.reorderOfNumber && (
                          <div>Reorder of <span className="font-mono text-slate-700">{request.reorderOfNumber}</span></div>
                        )}
                        {request.officialOrderNumber ? (
                          <div className="text-emerald-700 font-bold">
                            Converted to official order <span className="font-mono">{request.officialOrderNumber}</span>
                          </div>
                        ) : request.status === 'converted' ? (
                          <div className="text-emerald-700 font-bold">Converted by the ERP</div>
                        ) : (
                          <div>Awaiting ERP review</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {cancelable && (
                          <button
                            onClick={() => handleCancelRequestClick(request)}
                            disabled={isBusy}
                            className={`px-3.5 py-1.5 rounded-xl font-bold transition shadow-2xs ${
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
              {orders.map((order) => (
                <div key={order.id} className="p-4 rounded-2xl bg-white border border-slate-200/90 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div>
                      <h4 className="font-mono font-bold text-sm text-slate-900">{order.orderNumber}</h4>
                      <p className="text-[12.5px] text-slate-500 font-medium">Placed on {formatDate(order.date)}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black text-slate-900 block tabular-nums">{formatCurrency(order.totalAmount)}</span>
                      <span className="text-[10px] bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full font-bold capitalize">
                        {order.status}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-slate-700">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between font-medium">
                        <span>{item.quantity}x {item.productName}</span>
                        <span className="text-slate-500 tabular-nums">{formatCurrency(item.total)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500 text-[12.5px] font-medium">Est. Delivery: {formatDate(order.estimatedDelivery)}</span>
                    {canReorderOrder(order) ? (
                      <button
                        onClick={() => handleReorderClick(order)}
                        disabled={reorderBusyId === order.id}
                        className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-bold text-xs flex items-center gap-1.5 transition shadow-2xs disabled:opacity-50"
                      >
                        {reorderBusyId === order.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        <span>{reorderBusyId === order.id ? 'Submitting...' : 'Reorder 1-Click'}</span>
                      </button>
                    ) : (
                      <span className="text-slate-400 text-[12.5px] font-medium">Not reorderable</span>
                    )}
                  </div>
                </div>
              ))}
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
    </div>
  );
};

