import React from 'react';
import { LucideIcon } from 'lucide-react';
import { TrendingDown, TrendingUp } from 'lucide-react';

type KpiTrend = 'up' | 'down' | 'neutral';
type KpiVariant = 'default' | 'success' | 'warning' | 'danger';

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  trend?: KpiTrend;
  trendLabel?: string;
  variant?: KpiVariant;
  icon?: LucideIcon;
  className?: string;
}

const VARIANT_STYLES: Record<KpiVariant, { container: string; label: string; value: string; hint: string; icon: string }> = {
  default: {
    container: 'bg-white border-slate-200',
    label: 'text-slate-500',
    value: 'text-slate-900',
    hint: 'text-slate-500',
    icon: 'bg-slate-100 text-slate-500',
  },
  success: {
    container: 'bg-emerald-50 border-emerald-200',
    label: 'text-emerald-700',
    value: 'text-emerald-700',
    hint: 'text-emerald-600',
    icon: 'bg-emerald-100 text-emerald-600',
  },
  warning: {
    container: 'bg-amber-50 border-amber-200',
    label: 'text-amber-700',
    value: 'text-amber-700',
    hint: 'text-amber-600',
    icon: 'bg-amber-100 text-amber-600',
  },
  danger: {
    container: 'bg-rose-50 border-rose-200',
    label: 'text-rose-700',
    value: 'text-rose-700',
    hint: 'text-rose-600',
    icon: 'bg-rose-100 text-rose-600',
  },
};

/**
 * Standard KPI card used across Dashboard, Statements, and Invoices tabs.
 * Ensures consistent layout, typography, and variant treatment.
 *
 * Usage:
 *   <KpiCard
 *     label="OUTSTANDING"
 *     value={formatCurrency(outstandingBalance)}
 *     hint={isFullyPaid ? 'Fully Settled' : 'Has Outstanding Balance'}
 *     variant={isFullyPaid ? 'success' : 'danger'}
 *     icon={Clock}
 *   />
 */
export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  hint,
  trend,
  trendLabel,
  variant = 'default',
  icon: Icon,
  className = '',
}) => {
  const s = VARIANT_STYLES[variant];

  return (
    <div className={`rounded-2xl border p-4 shadow-card ${s.container} ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <span className={`text-[10px] font-black uppercase tracking-widest ${s.label}`}>
          {label}
        </span>
        {Icon && (
          <div className={`p-1.5 rounded-full ${s.icon}`}>
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
        )}
      </div>

      <p className={`text-xl font-black mt-1 tabular-nums tracking-tight ${s.value}`}>
        {value}
      </p>

      {(hint || trendLabel) && (
        <div className="flex items-center gap-1.5 mt-1">
          {trend && (
            <span className={
              trend === 'up' ? 'text-emerald-600' :
              trend === 'down' ? 'text-rose-600' :
              'text-slate-400'
            }>
              {trend === 'up' ? <TrendingUp className="w-3 h-3" /> :
               trend === 'down' ? <TrendingDown className="w-3 h-3" /> : null}
            </span>
          )}
          <span className={`text-xs font-bold ${s.hint}`}>
            {hint ?? trendLabel}
          </span>
        </div>
      )}
    </div>
  );
};
