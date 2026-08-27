import React from 'react';
import {
  FileText,
  Gift,
  Home,
  MoreHorizontal,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import { TabType } from '../types';

interface BottomNavigationProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  unpaidCount: number;
  deliveryAlertCount: number;
  onOpenMore?: () => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeTab,
  setActiveTab,
  unpaidCount,
  deliveryAlertCount,
}) => {
  const primaryTabs: {
    id: TabType;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
    badgeColor?: string;
  }[] = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'invoices', label: 'Invoices', icon: FileText, badge: unpaidCount, badgeColor: 'bg-rose-500' },
    { id: 'orders', label: 'Orders', icon: ShoppingBag },
    { id: 'deliveries', label: 'Track', icon: Truck, badge: deliveryAlertCount, badgeColor: 'bg-emerald-500' },
  ];

  const isMoreTab = !['dashboard', 'invoices', 'orders', 'deliveries'].includes(activeTab);

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 pb-safe">
      <div className="mx-3 mb-3">
        <div className="bg-white/90 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.08)] px-2 py-1.5 flex items-center justify-between">
          {primaryTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all duration-200 min-w-[56px] ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${isActive ? 'text-white' : ''}`} />
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span
                      className={`absolute -top-1.5 -right-2 ${
                        isActive ? 'bg-white text-blue-600' : (tab.badgeColor || 'bg-rose-500')
                      } text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border ${isActive ? 'border-blue-600' : 'border-white'}`}
                    >
                      {tab.badge > 9 ? '9+' : tab.badge}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[10px] mt-1 leading-none tracking-tight font-semibold ${
                    isActive ? 'text-white' : ''
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}

          {/* More tab */}
          <button
            onClick={() => {
              const moreTabs: TabType[] = ['statements', 'referrals', 'account'];
              const currentIdx = moreTabs.indexOf(activeTab);
              const nextIdx = (currentIdx + 1) % moreTabs.length;
              const nextTab = isMoreTab ? moreTabs[nextIdx] : moreTabs[0];
              setActiveTab(nextTab);
            }}
            className={`relative flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all duration-200 min-w-[56px] ${
              isMoreTab
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <MoreHorizontal className={`w-5 h-5 ${isMoreTab ? 'text-white' : ''}`} />
            <span
              className={`text-[10px] mt-1 leading-none tracking-tight font-semibold ${
                isMoreTab ? 'text-white' : ''
              }`}
            >
              More
            </span>
          </button>
        </div>
      </div>
    </nav>
  );
};
