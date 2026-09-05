import React from 'react';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

/**
 * Shimmer skeleton primitive — used to build per-section loading states.
 * Uses the .skeleton utility from index.css which handles light/dark mode.
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  width,
  height,
  rounded = 'md',
}) => {
  const roundedClass = {
    sm: 'rounded',
    md: 'rounded-lg',
    lg: 'rounded-xl',
    full: 'rounded-full',
  }[rounded];

  return (
    <div
      className={`skeleton ${roundedClass} ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
};

/** Skeleton row for a table or list */
export const SkeletonRow: React.FC<{ cols?: number; className?: string }> = ({ cols = 4, className = '' }) => (
  <div className={`flex items-center gap-4 py-3 px-4 ${className}`}>
    {Array.from({ length: cols }).map((_, i) => (
      <Skeleton key={i} height={14} className="flex-1" rounded="sm" />
    ))}
  </div>
);

/** Skeleton card for a grid of items */
export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`rounded-2xl border border-slate-200 bg-white p-4 space-y-3 ${className}`}>
    <div className="flex items-center justify-between">
      <Skeleton height={12} width="40%" rounded="sm" />
      <Skeleton height={20} width={64} rounded="full" />
    </div>
    <Skeleton height={14} width="70%" rounded="sm" />
    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
      <Skeleton height={12} width={80} rounded="sm" />
      <Skeleton height={12} width={60} rounded="sm" />
    </div>
  </div>
);

/** Skeleton KPI card */
export const SkeletonKpi: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`rounded-2xl border border-slate-200 bg-white p-4 space-y-2 ${className}`}>
    <div className="flex items-start justify-between">
      <Skeleton height={10} width={80} rounded="sm" />
      <Skeleton height={28} width={28} rounded="full" />
    </div>
    <Skeleton height={28} width="60%" rounded="sm" />
    <Skeleton height={12} width={100} rounded="sm" />
  </div>
);

/** Skeleton ledger row */
export const SkeletonLedgerRow: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`flex items-center justify-between gap-3 px-3.5 py-3 ${className}`}>
    <div className="space-y-1.5 flex-1">
      <Skeleton height={11} width="30%" rounded="sm" />
      <Skeleton height={10} width="50%" rounded="sm" />
    </div>
    <div className="flex items-center gap-3 shrink-0">
      <Skeleton height={12} width={60} rounded="sm" />
      <Skeleton height={12} width={40} rounded="sm" />
    </div>
  </div>
);
