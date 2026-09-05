import React from 'react';
import { LucideIcon } from 'lucide-react';
import { FileText } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Shared empty-state surface. Used when a list/grid has no data to show.
 *
 * Usage:
 *   <EmptyState
 *     icon={Truck}
 *     title="No deliveries yet"
 *     description="Shipment updates will appear here"
 *     action={<Button variant="secondary" onClick={onRefresh}>Refresh</Button>}
 *   />
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = FileText,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-slate-400 stroke-1" aria-hidden="true" />
      </div>
      <p className="text-sm font-bold text-slate-700">{title}</p>
      {description && (
        <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">{description}</p>
      )}
      {action && (
        <div className="mt-4">{action}</div>
      )}
    </div>
  );
};
