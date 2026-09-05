import React from 'react';
import { LucideIcon } from 'lucide-react';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconBg?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Consistent section header used across all tabs.
 * Replaces the ad-hoc pattern of icon + h2 + p in every tab.
 *
 * Usage:
 *   <SectionHeader
 *     icon={Truck}
 *     title="Deliveries"
 *     subtitle="Track active shipments"
 *     action={<Button size="sm">Export</Button>}
 *   />
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  iconBg = 'bg-blue-600',
  action,
  className = '',
}) => {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 pb-3 border-b border-slate-200/80 ${className}`}>
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className={`p-2.5 rounded-2xl ${iconBg} text-white shadow-xs shrink-0`}>
            <Icon className="w-5 h-5" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-xl font-black text-slate-900 tracking-tight truncate">{title}</h2>
          {subtitle && (
            <p className="text-xs text-slate-500 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">{action}</div>}
    </div>
  );
};
