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
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
        {/* Left — Logo + Title */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-600/20">
            <span className="text-xs font-black tracking-tight">P</span>
          </div>
          <div className="min-w-0">
            <h1 className="font-extrabold text-base text-slate-900 tracking-tight leading-none">
              Prime<span className="text-blue-600"> PORTAL</span>
            </h1>
          </div>
        </div>

        {/* Right — Actions */}
        <div className="flex items-center gap-1">
          {onOpenCommandPalette && (
            <button
              onClick={onOpenCommandPalette}
              className="p-2 rounded-xl hover:bg-slate-100/80 text-slate-500 hover:text-slate-800 transition-all focus:outline-none"
              title="Search (Cmd+K)"
              aria-label="Search"
            >
              <Search className="w-[18px] h-[18px]" />
            </button>
          )}

          {onOpenCart && (
            <button
              onClick={onOpenCart}
              className="relative p-2 rounded-xl hover:bg-slate-100/80 text-slate-500 hover:text-slate-800 transition-all focus:outline-none"
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
            className="relative p-2 rounded-xl hover:bg-slate-100/80 text-slate-500 hover:text-slate-800 transition-all focus:outline-none"
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
            className="ml-1 w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-white flex items-center justify-center text-[11px] font-bold shadow-sm hover:shadow-md transition-shadow"
            aria-label="Account"
          >
            {initials}
          </button>
        </div>
      </div>
    </header>
  );
};
