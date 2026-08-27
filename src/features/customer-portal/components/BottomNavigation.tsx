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
  onOpenMore?: () => void;
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
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'invoices', label: 'Invoices', icon: FileText, badge: unpaidCount, badgeColor: 'bg-rose-600' },
    { id: 'orders', label: 'Orders', icon: ShoppingBag },
    { id: 'deliveries', label: 'Deliveries', icon: Truck },
  ];

  const isMoreTab = !['dashboard', 'invoices', 'orders', 'deliveries'].includes(activeTab);

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-100 text-slate-500 shadow-xl backdrop-blur-md">
      <div className="max-w-lg mx-auto px-4 py-2 flex items-center justify-between">
        {primaryTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex flex-col items-center justify-center py-1 px-2.5 transition-all duration-200 ${
                isActive
                  ? 'text-blue-600 font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'text-blue-600' : 'text-slate-500'}`} />
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span
                    className={`absolute -top-1.5 -right-2.5 ${
                      tab.badgeColor || 'bg-rose-600'
                    } text-white text-[10px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-white shadow-2xs`}
                  >
                    {tab.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[11px] mt-1 leading-none tracking-tight font-medium ${
                  isActive ? 'text-blue-600 font-bold' : 'text-slate-600'
                }`}
              >
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-blue-600 rounded-full animate-fade-in" />
              )}
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
          className={`relative flex flex-col items-center justify-center py-1 px-2.5 transition-all duration-200 ${
            isMoreTab
              ? 'text-blue-600 font-bold'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <div className="relative">
            <MoreHorizontal className={`w-5 h-5 transition-transform ${isMoreTab ? 'text-blue-600' : 'text-slate-500'}`} />
          </div>
          <span
            className={`text-[11px] mt-1 leading-none tracking-tight font-medium ${
              isMoreTab ? 'text-blue-600 font-bold' : 'text-slate-600'
            }`}
          >
            More
          </span>
          {isMoreTab && (
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-blue-600 rounded-full animate-fade-in" />
          )}
        </button>
      </div>
    </nav>
  );
};
