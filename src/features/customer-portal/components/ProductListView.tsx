import React, { useState, useMemo } from 'react';
import { Search, SortAsc, Filter } from 'lucide-react';
import { OrderItem } from '../types';
import { formatCurrency } from '../utils/formatters';

interface ProductListViewProps {
  items: OrderItem[];
}

type SortKey = 'name' | 'price' | 'minOrder';
type SortDir = 'asc' | 'desc';

export const ProductListView: React.FC<ProductListViewProps> = ({ items }) => {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const filtered = useMemo(() => {
    let result = items;
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (i) => i.productName.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
    return result;
  }, [items, query, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  if (items.length === 0) {
    return <p className="text-sm text-slate-500">No products available.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleSort('name')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
              sortKey === 'name' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Name {sortKey === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
          </button>
          <button
            type="button"
            onClick={() => handleSort('price')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
              sortKey === 'price' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Price {sortKey === 'price' && (sortDir === 'asc' ? '↑' : '↓')}
          </button>
          <button
            type="button"
            onClick={() => handleSort('minOrder')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
              sortKey === 'minOrder' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Min Qty {sortKey === 'minOrder' && (sortDir === 'asc' ? '↑' : '↓')}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">No products match your search.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((item) => (
            <div key={item.productId} className="border border-slate-200 rounded-xl p-4 bg-white hover:shadow-md transition">
              <div className="flex justify-between items-start mb-2">
                <div className="text-base font-bold text-slate-900">{item.productName}</div>
                <div className="text-base font-bold text-blue-600">{formatCurrency(item.unitPrice)} / pcs</div>
              </div>
              {item.description && (
                <p className="text-xs text-slate-500 mb-2">{item.description}</p>
              )}
              <div className="flex justify-between items-center">
                <div className="text-xs text-slate-500">Min Order: {item.quantity} pcs</div>
                <button type="button" className="bg-black text-white px-4 py-1.5 text-xs font-bold rounded-xl hover:bg-slate-800 transition">
                  Add to Cart
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400 text-center">
        Showing {filtered.length} of {items.length} products
      </p>
    </div>
  );
};