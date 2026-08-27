import React from 'react';
import {
  Award,
  Building2,
  ChevronRight,
  CreditCard,
  FileText,
  Gift,
  Home,
  LogOut,
  MessageSquareQuote,
  Receipt,
  Search,
  ShieldCheck,
  ShoppingBag,
  Truck,
  User,
} from 'lucide-react';
import { AccountProfile, TabType } from '../types';
import { formatCurrency } from '../utils/formatters';

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  /** Null while the customer profile has not loaded (no fake identity is shown). */
  profile: AccountProfile | null;
  unpaidCount: number;
  unpaidTotal: number;
  cartCount: number;
  onOpenPaymentModal: () => void;
  onOpenQuoteModal: () => void;
  onOpenCommandPalette?: () => void;
  onSignOut?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  profile,
  unpaidCount,
  unpaidTotal,
  cartCount,
  onOpenPaymentModal,
  onOpenQuoteModal,
  onOpenCommandPalette,
  onSignOut,
}) => {
  const navItems: { id: TabType; label: string; icon: React.FC<{ className?: string }>; badge?: number; badgeColor?: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'invoices', label: 'Customer Invoices', icon: FileText, badge: unpaidCount, badgeColor: 'bg-rose-600' },
    { id: 'orders', label: 'Orders & Catalog', icon: ShoppingBag, badge: cartCount, badgeColor: 'bg-slate-900' },
    { id: 'deliveries', label: 'Shipments & Tracking', icon: Truck },
    { id: 'quotes', label: 'Quotations', icon: MessageSquareQuote },
    { id: 'statements', label: 'Account Ledger', icon: Receipt },
    { id: 'referrals', label: 'Partner Rewards', icon: Gift },
    { id: 'account', label: 'Account Settings', icon: User },
  ];

  return (
    <aside className="hidden lg:flex flex-col w-72 bg-white border-r border-slate-200/80 min-h-screen p-5 shrink-0 sticky top-0 h-screen overflow-y-auto shadow-2xs">
      {/* Brand Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-black text-lg shadow-xs shrink-0">
          <Building2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-black text-sm text-slate-900 tracking-tight">Prime</span>
            <span className="font-black text-[10px] uppercase tracking-wider text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
              PORTAL
            </span>
          </div>
          <h2 className="font-bold text-xs text-slate-700 tracking-tight truncate max-w-[150px]" title={profile?.companyName}>
            {profile?.companyName || 'Customer'}
          </h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11.5px] font-mono font-bold text-slate-500">{profile?.accountNumber || '—'}</span>
            <span className="w-1 h-1 rounded-full bg-slate-300" />
            <span className="text-[10px] font-black uppercase text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded-full border border-amber-200">
              {profile?.tier || '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Command Palette Quick Search Button */}
      {onOpenCommandPalette && (
        <button
          onClick={onOpenCommandPalette}
          className="mt-4 w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-500 transition shadow-2xs group"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition" />
            <span className="font-medium text-slate-600">Quick Search...</span>
          </div>
          <kbd className="px-1.5 py-0.5 text-[11.5px] font-mono font-bold text-slate-500 bg-white border border-slate-200 rounded shadow-2xs">
            ⌘K
          </kbd>
        </button>
      )}

      {/* Primary Navigation */}
      <nav className="flex-1 py-4 space-y-1">
        <div className="text-[11.5px] font-black uppercase tracking-wider text-slate-400 px-3 mb-2">
          Main Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-bold text-xs transition-all duration-150 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4.5 h-4.5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span>{item.label}</span>
              </div>

              {item.badge !== undefined && item.badge > 0 && (
                 <span
                  className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                    isActive
                      ? 'bg-white text-slate-900'
                      : `${item.badgeColor || 'bg-slate-900'} text-white`
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Quick Actions */}
      <div className="space-y-3 pt-4 border-t border-slate-100">
        {unpaidTotal > 0 && (
          <button
            onClick={onOpenPaymentModal}
            className="w-full py-2.5 px-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black flex items-center justify-between shadow-2xs transition"
          >
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              <span>Pay Invoices</span>
            </div>
            <span>{formatCurrency(unpaidTotal)}</span>
          </button>
        )}

        <button
          onClick={onOpenQuoteModal}
          className="w-full py-2.5 px-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 shadow-2xs transition"
        >
          <MessageSquareQuote className="w-4 h-4" />
          <span>Request Custom Quote</span>
        </button>

        {onSignOut && (
          <button
            onClick={onSignOut}
            className="w-full py-2 px-3.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out (Prime PORTAL)</span>
          </button>
        )}
      </div>
    </aside>
  );
};
