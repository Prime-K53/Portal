import React from 'react';
import { Bell, Search, ShoppingBag } from 'lucide-react';
import { AccountProfile } from '../types';

interface MobileHeaderProps {
  profile?: AccountProfile | null;
  unreadCount: number;
  onOpenNotifications: () => void;
  onOpenAccount: () => void;
  onOpenPaymentModal?: () => void;
  unpaidTotal?: number;
  cartCount?: number;
  onOpenCart?: () => void;
  onOpenCommandPalette?: () => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
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
  const initials = getInitials(profile?.customerName || profile?.companyName || 'U');

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200/50 pt-safe bottom-nav-print-hide">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-3">
        {/* Left — Logo + Title */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-600/20">
            <span className="text-[11px] sm:text-xs font-black tracking-tight">P</span>
          </div>
          <div className="min-w-0">
            <h1 className="font-black text-sm sm:text-base text-slate-900 tracking-tight leading-none">
              Prime <span className="text-blue-600">PORTAL</span>
            </h1>
            <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 leading-tight">Smart. Simple. School Supplies.</p>
          </div>
        </div>

        {/* Right — Actions */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          {onOpenCommandPalette && (
            <button
              onClick={onOpenCommandPalette}
              className="p-2 sm:p-2.5 rounded-xl hover:bg-slate-100/80 text-slate-500 hover:text-slate-800 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-[44px] min-w-[44px]"
              title="Search (Cmd+K)"
              aria-label="Search"
            >
              <Search className="w-[18px] h-[18px]" />
            </button>
          )}

          {onOpenCart && (
            <button
              onClick={onOpenCart}
              className="relative p-2 sm:p-2.5 rounded-xl hover:bg-slate-100/80 text-slate-500 hover:text-slate-800 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-[44px] min-w-[44px]"
              aria-label="Cart"
            >
              <ShoppingBag className="w-[18px] h-[18px]" />
              {cartCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-blue-600 rounded-full ring-2 ring-white" />
              )}
            </button>
          )}

          <button
            onClick={onOpenNotifications}
            className="relative p-2 sm:p-2.5 rounded-xl hover:bg-slate-100/80 text-slate-500 hover:text-slate-800 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-[44px] min-w-[44px]"
            aria-label="Notifications"
          >
            <Bell className="w-[18px] h-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center ring-2 ring-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Profile avatar */}
          <button
            onClick={onOpenAccount}
            className="ml-0.5 sm:ml-1 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-white flex items-center justify-center text-[10px] sm:text-[11px] font-bold shadow-sm hover:shadow-md active:scale-95 transition-all min-h-[44px] min-w-[44px]"
            aria-label="Account"
          >
            {initials}
          </button>
        </div>
      </div>
    </header>
  );
};
