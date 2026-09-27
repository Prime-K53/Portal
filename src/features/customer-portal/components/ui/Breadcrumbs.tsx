import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { useHashRoute } from '../router/useHashRoute';
import { ROUTES } from '../router/routes';

interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

const LABEL_MAP: Record<string, string> = {
  dashboard: 'Dashboard',
  invoices: 'Invoices',
  orders: 'Orders',
  quotations: 'Quotations',
  requests: 'Requests',
  deliveries: 'Deliveries',
  statements: 'Statements',
  referrals: 'Referrals',
  account: 'Account',
  support: 'Support',
  landing: 'Home',
  login: 'Sign In',
};

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const { navigate } = useHashRoute();

  const allItems: BreadcrumbItem[] = [
    { label: 'Home', path: ROUTES.landing },
    ...items,
  ];

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-slate-500">
      {allItems.map((item, index) => {
        const isLast = index === allItems.length - 1;
        const label = LABEL_MAP[item.path?.split('/')[1] || ''] || item.label;
        return (
          <React.Fragment key={index}>
            {index > 0 && <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />}
            {isLast ? (
              <span className="font-bold text-slate-900" aria-current="page">
                {label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => item.path && navigate(item.path)}
                className="hover:text-blue-600 transition font-medium flex items-center gap-1"
              >
                {index === 0 && <Home className="w-3 h-3" />}
                {label}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}