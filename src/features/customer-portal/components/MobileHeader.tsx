import React from 'react';
import { Bell, Building2, Search, ShoppingBag } from 'lucide-react';
import { AccountProfile } from '../types';

interface MobileHeaderProps {
  profile?: AccountProfile | null;
  /** Unread notification count from the ERP portal_notifications endpoint. */
  unreadCount: number;
  onOpenNotifications: () => void;
  onOpenAccount: () => void;
  onOpenPaymentModal?: () => void;
  unpaidTotal?: number;
  cartCount?: number;
  onOpenCart?: () => void;
  onOpenCommandPalette?: () => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  profile,
  unreadCount,
  onOpenNotifications,
  onOpenAccount,
  cartCount = 0,
  onOpenCart,
  onOpenCommandPalette,
}) => {

  return (
    <header className="sticky top-0 z-30 bg-white text-slate-900 border-b border-slate-200/80 backdrop-blur-md shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
        {/* Left/Center Title with Building Icon */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
            <Building2 className="w-4.5 h-4.5 text-white" />
          </div>
          <h1 className="font-black text-lg text-slate-900 tracking-tight leading-none">
            Prime<span className="text-blue-600"> PORTAL</span>
          </h1>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5">
          {onOpenCommandPalette && (
            <button
              onClick={onOpenCommandPalette}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-800 transition focus:outline-none flex items-center gap-1.5"
              title="Search Portal (Cmd + K)"
              aria-label="Search"
            >
              <Search className="w-4.5 h-4.5 text-slate-800" />
              <kbd className="hidden md:inline-block px-1.5 py-0.5 text-[10.5px] font-mono font-bold text-slate-400">
                ⌘K
              </kbd>
            </button>
          )}

          {onOpenCart && (
            <button
              onClick={onOpenCart}
              className="relative p-2 rounded-xl hover:bg-slate-100 text-slate-800 transition focus:outline-none"
              aria-label="View Cart"
            >
              <ShoppingBag className="w-4.5 h-4.5 text-slate-800" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-slate-900 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-2xs">
                  {cartCount}
                </span>
              )}
            </button>
          )}

          <button
            onClick={onOpenNotifications}
            className="relative p-2 rounded-xl hover:bg-slate-100 text-slate-800 transition focus:outline-none"
            aria-label="Notifications"
          >
            <Bell className="w-4.5 h-4.5 text-slate-800" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-white shadow-2xs">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};



