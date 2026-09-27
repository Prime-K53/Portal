import React, { useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { useHashRoute } from '../router/useHashRoute';
import { ROUTES } from '../router/routes';

interface SearchResult {
  type: string;
  label: string;
  path: string;
  description?: string;
}

const SEARCH_INDEX: SearchResult[] = [
  { type: 'tab', label: 'Dashboard', path: ROUTES.dashboard, description: 'Overview and quick actions' },
  { type: 'tab', label: 'Invoices', path: ROUTES.invoices, description: 'View and pay invoices' },
  { type: 'tab', label: 'Orders', path: ROUTES.orders, description: 'Track your orders' },
  { type: 'tab', label: 'Quotations', path: ROUTES.quotations, description: 'Quotation requests and responses' },
  { type: 'tab', label: 'Deliveries', path: ROUTES.deliveries, description: 'Delivery tracking' },
  { type: 'tab', label: 'Statements', path: ROUTES.statements, description: 'Account ledger and statements' },
  { type: 'tab', label: 'Referrals', path: ROUTES.referrals, description: 'Referral program' },
  { type: 'tab', label: 'Account', path: ROUTES.account, description: 'Profile and settings' },
  { type: 'tab', label: 'Support', path: ROUTES.support, description: 'Help and tickets' },
];

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const { navigate } = useHashRoute();

  const results = query
    ? SEARCH_INDEX.filter(
        (r) =>
          r.label.toLowerCase().includes(query.toLowerCase()) ||
          r.description?.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  const handleSelect = useCallback(
    (path: string) => {
      navigate(path);
      setOpen(false);
      setQuery('');
    },
    [navigate]
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs text-slate-500 transition min-h-[44px]"
        aria-label="Open search"
      >
        <Search className="w-4 h-4" />
        <span>Search...</span>
        <kbd className="ml-auto text-[10px] font-bold text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200">⌘K</kbd>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[6000]" onClick={() => { setOpen(false); setQuery(''); }} />
          <div className="fixed top-1/4 left-1/2 -translate-x-1/2 z-[6001] w-full max-w-lg mx-4 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-fade-in">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
              <Search className="w-5 h-5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pages..."
                className="flex-1 bg-transparent text-sm text-slate-900 placeholder-slate-400 outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setOpen(false);
                    setQuery('');
                  }
                }}
              />
              <button type="button" onClick={() => { setOpen(false); setQuery(''); }} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              {results.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No results found</p>
              ) : (
                results.map((r) => (
                  <button
                    key={r.path}
                    type="button"
                    onClick={() => handleSelect(r.path)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition text-left"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">{r.type}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900">{r.label}</p>
                      {r.description && (
                        <p className="text-[11px] text-slate-500">{r.description}</p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}