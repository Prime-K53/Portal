import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  X,
  FileText,
  ShoppingBag,
  Truck,
  FileSpreadsheet,
  Users,
  Settings,
  ArrowRight,
  Package,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Invoice, Order, Product, DeliveryNotification, TabType } from '../../types';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  invoices: Invoice[];
  orders: Order[];
  deliveries: DeliveryNotification[];
  onNavigateTab: (tab: TabType) => void;
  onSelectInvoiceDetail: (invoice: Invoice) => void;
  onSelectProductDetail: (product: Product) => void;
  onAddToCart: (product: Product, quantity: number) => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  products,
  invoices,
  orders,
  deliveries,
  onNavigateTab,
  onSelectInvoiceDetail,
  onSelectProductDetail,
  onAddToCart,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const trimmed = query.trim().toLowerCase();

  // Filtered Results
  const matchingProducts = trimmed
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(trimmed) ||
          p.sku.toLowerCase().includes(trimmed) ||
          p.category.toLowerCase().includes(trimmed)
      ).slice(0, 4)
    : [];

  const matchingInvoices = trimmed
    ? invoices.filter(
        (i) =>
          i.invoiceNumber.toLowerCase().includes(trimmed) ||
          (i.poNumber && i.poNumber.toLowerCase().includes(trimmed)) ||
          i.status.toLowerCase().includes(trimmed)
      ).slice(0, 4)
    : [];

  const matchingOrders = trimmed
    ? orders.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(trimmed) ||
          o.status.toLowerCase().includes(trimmed)
      ).slice(0, 3)
    : [];

  const matchingDeliveries = trimmed
    ? deliveries.filter(
        (d) =>
          d.trackingNumber.toLowerCase().includes(trimmed) ||
          d.orderId.toLowerCase().includes(trimmed) ||
          d.title.toLowerCase().includes(trimmed)
      ).slice(0, 3)
    : [];

  // Navigation shortcuts
  const navigationShortcuts: { label: string; tab: TabType; icon: React.ElementType }[] = [
    { label: 'Go to Invoices & Billing', tab: 'invoices' as TabType, icon: FileText },
    { label: 'Go to Wholesale Orders Catalog', tab: 'orders' as TabType, icon: ShoppingBag },
    { label: 'Go to Shipments & Live Tracking', tab: 'deliveries' as TabType, icon: Truck },
    { label: 'Go to Statement of Account', tab: 'statements' as TabType, icon: FileSpreadsheet },
    { label: 'Go to Referral Rewards', tab: 'referrals' as TabType, icon: Users },
    { label: 'Go to Account & Settings', tab: 'account' as TabType, icon: Settings },
  ].filter((s) => !trimmed || s.label.toLowerCase().includes(trimmed));

  const hasResults =
    matchingProducts.length > 0 ||
    matchingInvoices.length > 0 ||
    matchingOrders.length > 0 ||
    matchingDeliveries.length > 0 ||
    navigationShortcuts.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-20 px-3 bg-slate-950/60 backdrop-blur-xs transition-opacity">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Search Header Input */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-slate-100 bg-slate-50/80">
          <Search className="w-5 h-5 text-slate-400 shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search invoices, products, tracking #, orders, or commands... (e.g. INV-2026, Paper, TRK)"
            className="w-full bg-transparent text-slate-900 font-medium placeholder-slate-400 focus:outline-none text-sm"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 hover:bg-slate-200/60 text-slate-400 rounded-md transition mr-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[11.5px] font-mono font-bold text-slate-500 bg-white border border-slate-200 rounded-md shadow-2xs">
            ESC
          </kbd>
        </div>

        {/* Results Container */}
        <div className="overflow-y-auto p-3 space-y-4 text-xs">
          {!trimmed && (
            <div className="px-2 py-1 text-[12.5px] font-bold uppercase tracking-wider text-slate-400">
              Suggested Quick Actions
            </div>
          )}

          {/* Navigation Shortcuts */}
          {navigationShortcuts.length > 0 && (
            <div className="space-y-1">
              {!trimmed && (
                <span className="text-[11.5px] font-bold text-slate-400 uppercase tracking-wider px-2 block mb-1">
                  Jump To Section
                </span>
              )}
              {navigationShortcuts.map((sc) => {
                const IconComponent = sc.icon;
                return (
                  <button
                    key={sc.tab}
                    onClick={() => {
                      onNavigateTab(sc.tab);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition text-left group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600 group-hover:bg-slate-900 group-hover:text-white transition">
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-xs">{sc.label}</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Matching Products */}
          {matchingProducts.length > 0 && (
            <div className="space-y-1">
              <span className="text-[11.5px] font-bold text-slate-400 uppercase tracking-wider px-2 block">
                Products ({matchingProducts.length})
              </span>
              {matchingProducts.map((prod) => (
                <div
                  key={prod.id}
                  className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 border border-slate-100 transition"
                >
                  <button
                    onClick={() => {
                      onSelectProductDetail(prod);
                      onClose();
                    }}
                    className="flex items-center gap-3 text-left flex-1 min-w-0 mr-2"
                  >
                    <img
                      src={prod.image}
                      alt={prod.name}
                      className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-slate-900 truncate text-xs">{prod.name}</h4>
                      <p className="text-[11.5px] text-slate-500 font-medium">
                        SKU: {prod.sku} • ${prod.price.toFixed(2)} / {prod.unit}
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      onAddToCart(prod, prod.minOrderQty || 1);
                      onClose();
                    }}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[12.5px] font-bold shrink-0 transition"
                  >
                    + Cart
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Matching Invoices */}
          {matchingInvoices.length > 0 && (
            <div className="space-y-1">
              <span className="text-[11.5px] font-bold text-slate-400 uppercase tracking-wider px-2 block">
                Invoices ({matchingInvoices.length})
              </span>
              {matchingInvoices.map((inv) => (
                <button
                  key={inv.id}
                  onClick={() => {
                    onSelectInvoiceDetail(inv);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 border border-slate-100 transition text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 block">{inv.invoiceNumber}</span>
                      <span className="text-[11.5px] text-slate-500">PO: {inv.poNumber || 'N/A'} • Due: {inv.dueDate}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-extrabold text-slate-900 block tabular-nums">
                      ${inv.amountRemaining > 0 ? inv.amountRemaining.toFixed(2) : inv.amount.toFixed(2)}
                    </span>
                    <span
                      className={`text-[10.5px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                        inv.status === 'paid'
                          ? 'bg-emerald-100 text-emerald-800'
                          : inv.status === 'overdue'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Matching Orders */}
          {matchingOrders.length > 0 && (
            <div className="space-y-1">
              <span className="text-[11.5px] font-bold text-slate-400 uppercase tracking-wider px-2 block">
                Orders ({matchingOrders.length})
              </span>
              {matchingOrders.map((ord) => (
                <button
                  key={ord.id}
                  onClick={() => {
                    onNavigateTab('orders');
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 border border-slate-100 transition text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                      <Package className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 block">{ord.orderNumber}</span>
                      <span className="text-[11.5px] text-slate-500">Placed: {ord.date}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-extrabold text-slate-900 block tabular-nums">${ord.totalAmount.toFixed(2)}</span>
                    <span className="text-[10.5px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-md font-bold">
                      {ord.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Matching Deliveries */}
          {matchingDeliveries.length > 0 && (
            <div className="space-y-1">
              <span className="text-[11.5px] font-bold text-slate-400 uppercase tracking-wider px-2 block">
                Shipments ({matchingDeliveries.length})
              </span>
              {matchingDeliveries.map((del) => (
                <button
                  key={del.id}
                  onClick={() => {
                    onNavigateTab('deliveries');
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 border border-slate-100 transition text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                      <Truck className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 block">{del.trackingNumber}</span>
                      <span className="text-[11.5px] text-slate-500">{del.title}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[11.5px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-100">
                      {del.status.replace('_', ' ')}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {trimmed && !hasResults && (
            <div className="text-center py-8 text-slate-400">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="font-bold text-slate-600">No results found for "{query}"</p>
              <p className="text-[12.5px] text-slate-400 mt-1">
                Try searching for SKU, Invoice number (e.g. INV-101), or shipment code.
              </p>
            </div>
          )}
        </div>

        {/* Command Palette Footer */}
        <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-[11.5px] text-slate-500 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Tip: Use <kbd className="px-1 py-0.5 bg-white border rounded font-mono">Cmd + K</kbd> anytime to open</span>
          </div>
          <span className="font-medium text-slate-400">Customer ID B2B Portal</span>
        </div>
      </div>
    </div>
  );
};
