import React from 'react';
import {
  FileText,
  Headphones,
  Home,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import { TabType } from '../types';

interface BottomNavigationProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  unpaidCount: number;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeTab,
  setActiveTab,
  unpaidCount,
}) => {
  const primaryTabs: {
    id: TabType;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
    badgeColor?: string;
  }[] = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'invoices', label: 'Invoices', icon: FileText, badge: unpaidCount, badgeColor: 'bg-rose-600' },
    { id: 'orders', label: 'Orders', icon: ShoppingBag },
    { id: 'deliveries', label: 'Deliveries', icon: Truck },
    { id: 'support', label: 'Support', icon: Headphones },
  ];

  return (
    <>
      <nav
        aria-label="Primary navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-xl border-t border-slate-200/60 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] pb-safe"
      >
        <div className="max-w-md mx-auto grid grid-cols-5 gap-0 px-1 pt-1.5 pb-1.5">
          {primaryTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-label={tab.label}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex flex-col items-center justify-center min-h-[48px] min-w-0 px-1 py-1 rounded-xl transition-all duration-200 active:scale-95 ${
                  isActive
                    ? 'text-blue-600'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <div className={`relative flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
                  isActive ? 'bg-blue-50' : ''
                }`}>
                  <Icon className={`w-[18px] h-[18px] transition-transform ${
                    isActive ? 'text-blue-600 scale-110' : 'text-slate-500'
                  }`} aria-hidden="true" />
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span
                      className={`absolute -top-0.5 -right-1 ${
                        tab.badgeColor || 'bg-rose-600'
                      } text-white text-[9px] font-black min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center border-2 border-white shadow-2xs`}
                    >
                      {tab.badge > 9 ? '9+' : tab.badge}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[10px] sm:text-[11px] mt-0.5 leading-none font-bold tracking-tight truncate max-w-full ${
                    isActive ? 'text-blue-600' : 'text-slate-500'
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}

        </div>
      </nav>
    </>
  );
};
