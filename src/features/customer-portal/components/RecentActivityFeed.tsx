import React from 'react';
import { Clock, ShoppingBag, FileText, Truck, Gift } from 'lucide-react';
import { useRecentViews } from '../context/RecentViewsContext';
import { useHashRoute } from '../router/useHashRoute';

const TYPE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  order: ShoppingBag,
  invoice: FileText,
  delivery: Truck,
  referral: Gift,
};

export function RecentActivityFeed() {
  const { history } = useRecentViews();
  const { navigate } = useHashRoute();

  if (history.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recent Activity</h3>
      {history.slice(0, 5).map((entry) => {
        const Icon = TYPE_ICONS[entry.type] || Clock;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => navigate(entry.path)}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition text-left"
          >
            <span className="shrink-0 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <Icon className="w-4 h-4 text-slate-500" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate">{entry.label}</p>
              <p className="text-[11px] text-slate-400">
                {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}