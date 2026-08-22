import React, { useState, useRef, useEffect } from 'react';
import { FileUp, MessageSquareQuote, Plus, Trash2, X } from 'lucide-react';
import { Product, QuoteRequestItem } from '../../types';

interface QuoteRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitQuoteRequest: (
    items: QuoteRequestItem[],
    requiredByDate: string,
    deliveryLocation: string,
    priority: 'standard' | 'urgent' | 'express',
    notes: string
  ) => void;
  products: Product[];
}

interface ItemState extends QuoteRequestItem {
  query: string;
  showSuggestions: boolean;
  activeIndex: number;
}

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

const matchProduct = (product: Product, query: string) => {
  const q = normalize(query);
  if (!q) return false;
  const haystack = normalize(`${product.name} ${product.category} ${product.sku}`);
  return haystack.includes(q);
};

const filterProducts = (products: Product[], query: string) => {
  if (!query.trim()) return [];
  const seen = new Set<string>();
  const results: Product[] = [];
  for (const product of products) {
    const key = product.id;
    if (seen.has(key)) continue;
    if (matchProduct(product, query)) {
      seen.add(key);
      results.push(product);
    }
  }
  return results.slice(0, 8);
};

export const QuoteRequestModal: React.FC<QuoteRequestModalProps> = ({
  isOpen,
  onClose,
  onSubmitQuoteRequest,
  products,
}) => {
  const [items, setItems] = useState<ItemState[]>([
    { id: '1', name: 'Annual Corporate Catalog (5,000 copies, 48 pages)', quantity: 5000, targetPrice: 2.50, notes: 'Full-color silk stock, spot UV cover finish, perfect bound', query: '', showSuggestions: false, activeIndex: 0 },
  ]);
  const [requiredByDate, setRequiredByDate] = useState('2026-08-25');
  const [deliveryLocation, setDeliveryLocation] = useState('742 Enterprise Parkway, Loading Dock B');
  const [priority, setPriority] = useState<'standard' | 'urgent' | 'express'>('urgent');
  const [generalNotes, setGeneralNotes] = useState('');
  const [attachmentName, setAttachmentName] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const suggestionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setItems((prev) => prev.map((i) => ({ ...i, showSuggestions: false, activeIndex: 0 })));
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen) return null;

  const handleAddItem = () => {
    setItems([
      ...items,
      { id: Date.now().toString(), name: '', quantity: 1, targetPrice: undefined, notes: '', query: '', showSuggestions: false, activeIndex: 0 },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length === 1) return;
    setItems(items.filter((i) => i.id !== id));
  };

  const handleItemChange = (id: string, field: keyof ItemState, value: any) => {
    setItems(
      items.map((i) => (i.id === id ? { ...i, [field]: value } : i))
    );
  };

  const handleQueryChange = (id: string, value: string) => {
    const next = items.map((i) => {
      if (i.id !== id) return i;
      const suggestions = filterProducts(products, value);
      return {
        ...i,
        query: value,
        name: value,
        showSuggestions: suggestions.length > 0,
        activeIndex: 0,
      };
    });
    setItems(next);
  };

  const selectProduct = (id: string, product: Product) => {
    setItems(
      items.map((i) =>
        i.id === id
          ? {
              ...i,
              name: product.name,
              query: product.name,
              showSuggestions: false,
              activeIndex: 0,
              quantity: i.quantity < product.minOrderQty ? product.minOrderQty : i.quantity,
            }
          : i
      )
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item || !item.showSuggestions) {
      if (e.key === 'Enter') {
        e.preventDefault();
      }
      return;
    }

    const suggestions = filterProducts(products, item.query);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (item.activeIndex + 1) % suggestions.length;
      setItems(items.map((i) => (i.id === id ? { ...i, activeIndex: next } : i)));
      suggestionRefs.current[next]?.scrollIntoView({ block: 'nearest' });
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (item.activeIndex - 1 + suggestions.length) % suggestions.length;
      setItems(items.map((i) => (i.id === id ? { ...i, activeIndex: next } : i)));
      suggestionRefs.current[next]?.scrollIntoView({ block: 'nearest' });
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const selected = suggestions[item.activeIndex];
      if (selected) {
        selectProduct(id, selected);
      }
      return;
    }

    if (e.key === 'Escape') {
      setItems(items.map((i) => (i.id === id ? { ...i, showSuggestions: false, activeIndex: 0 } : i)));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.some((i) => !i.name.trim())) return;

    const cleaned = items.map(({ query, showSuggestions, activeIndex, ...rest }) => rest);
    onSubmitQuoteRequest(cleaned, requiredByDate, deliveryLocation, priority, generalNotes);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-white border border-slate-200 text-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-100 text-slate-800 rounded-xl border border-slate-200">
              <MessageSquareQuote className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">Request Custom Quotation</h3>
              <p className="text-xs text-slate-500">Get volume pricing and custom engineering quotes</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Priority & Delivery Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Quote Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:outline-none"
              >
                <option value="standard">Standard (48 hrs response)</option>
                <option value="urgent">Urgent (24 hrs response)</option>
                <option value="express">Express (4 hrs response)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Required By Date</label>
              <input
                type="date"
                value={requiredByDate}
                onChange={(e) => setRequiredByDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:outline-none"
              />
            </div>
          </div>

          {/* Requested Line Items */}
          <div ref={containerRef}>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Requested Items / Services ({items.length})
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs text-slate-900 hover:text-slate-700 font-extrabold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => {
                const suggestions = filterProducts(products, item.query);

                return (
                  <div key={item.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2 text-xs shadow-2xs relative">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-slate-500 text-[12.5px]">Item #{idx + 1}</span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-slate-400 hover:text-rose-600 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search products, stationery or services..."
                        value={item.name}
                        onChange={(e) => handleQueryChange(item.id, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, item.id)}
                        onFocus={() => {
                          const s = filterProducts(products, item.query);
                          if (s.length > 0) {
                            setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, showSuggestions: true, activeIndex: 0 } : i)));
                          }
                        }}
                        required
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-slate-900 text-xs font-bold focus:outline-none"
                      />

                      {item.showSuggestions && suggestions.length > 0 && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                          {suggestions.map((product, suggestionIdx) => (
                            <button
                              key={product.id}
                              ref={(el) => { suggestionRefs.current[suggestionIdx] = el; }}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                selectProduct(item.id, product);
                              }}
                              className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition ${
                                suggestionIdx === item.activeIndex ? 'bg-indigo-50' : 'bg-white hover:bg-slate-50'
                              }`}
                            >
                              <div className="min-w-0">
                                <span className="block text-slate-900 font-bold truncate">{product.name}</span>
                                <span className="block text-[11.5px] text-slate-500 truncate">{product.category} · {product.sku}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11.5px] text-slate-500 font-bold">Quantity Needed</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(item.id, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-full bg-white border border-slate-200 rounded-xl p-1.5 text-slate-900 text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[11.5px] text-slate-500 font-bold">Target Budget ($/unit)</label>
                        <input
                          type="number"
                          placeholder="Optional"
                          value={item.targetPrice || ''}
                          onChange={(e) => handleItemChange(item.id, 'targetPrice', parseFloat(e.target.value) || undefined)}
                          className="w-full bg-white border border-slate-200 rounded-xl p-1.5 text-slate-900 text-xs font-bold"
                        />
                      </div>
                    </div>

                    <input
                      type="text"
                      placeholder="Additional item specifications or CAD drawings note..."
                      value={item.notes || ''}
                      onChange={(e) => handleItemChange(item.id, 'notes', e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-1.5 text-slate-700 text-[12.5px] font-medium"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Delivery Destination</label>
            <input
              type="text"
              value={deliveryLocation}
              onChange={(e) => setDeliveryLocation(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-xs text-slate-900 font-bold"
            />
          </div>

          {/* Spec Attachment Simulator */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Upload Engineering Specs / RFQ PDF</label>
            <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-2xl text-center space-y-1">
              <FileUp className="w-5 h-5 mx-auto text-slate-600" />
              <p className="text-xs text-slate-700 font-bold">
                {attachmentName ? `Attached: ${attachmentName}` : 'Click to simulate uploading CAD or PDF specs'}
              </p>
              <button
                type="button"
                onClick={() => setAttachmentName('Technical_Specs_RFQ_2026.pdf')}
                className="text-[12.5px] text-slate-900 hover:text-slate-700 font-extrabold underline"
              >
                {attachmentName ? 'Change File' : 'Attach File'}
              </button>
            </div>
          </div>

          {/* Footer Submit */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-xs transition"
            >
              Submit Quotation Request
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
