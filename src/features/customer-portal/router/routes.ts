/**
 * Prime PORTAL — Route Structure
 *
 * Hash-based routes (no router dependency required; the Portal can also be
 * embedded inside the ERP without conflicting with its router).
 *
 * Implemented screens map 1:1 to Sasa's existing tabs. Two routes are reserved
 * for ERP feature parity and currently render the same quotes screen:
 *   /quotations — formal quotations issued by the supplier
 *   /requests   — quotation requests (RFQs) submitted by the customer
 */

import type { TabType } from '../types';

export const ROUTES = {
  login: '/login',
  activate: '/activate',
  forgotPassword: '/forgot-password',
  dashboard: '/dashboard',
  invoices: '/invoices',
  orders: '/orders',
  quotations: '/quotations',
  requests: '/requests',
  deliveries: '/deliveries',
  statements: '/statements',
  referrals: '/referrals',
  account: '/account',
  support: '/support',
} as const;

export type PortalRoute = (typeof ROUTES)[keyof typeof ROUTES];

const TAB_ROUTES: Record<TabType, PortalRoute> = {
  dashboard: ROUTES.dashboard,
  invoices: ROUTES.invoices,
  orders: ROUTES.orders,
  quotes: ROUTES.quotations,
  deliveries: ROUTES.deliveries,
  statements: ROUTES.statements,
  referrals: ROUTES.referrals,
  account: ROUTES.account,
  support: ROUTES.support,
};

const ROUTE_TABS: Record<string, TabType> = {
  [ROUTES.dashboard]: 'dashboard',
  [ROUTES.invoices]: 'invoices',
  [ROUTES.orders]: 'orders',
  [ROUTES.quotations]: 'quotes',
  [ROUTES.requests]: 'quotes',
  [ROUTES.deliveries]: 'deliveries',
  [ROUTES.statements]: 'statements',
  [ROUTES.referrals]: 'referrals',
  [ROUTES.account]: 'account',
  [ROUTES.support]: 'support',
};

export function pathForTab(tab: TabType): PortalRoute {
  return TAB_ROUTES[tab];
}

export function tabFromPath(path: string): TabType | null {
  const normalized = path.split('?')[0].replace(/\/+$/, '') || '/';
  return ROUTE_TABS[normalized] ?? null;
}

/** Routes renderable without a session (auth screens). */
const PUBLIC_ROUTES: readonly string[] = [ROUTES.login, ROUTES.activate, ROUTES.forgotPassword];

export function isPublicRoute(path: string): boolean {
  const normalized = path.split('?')[0].replace(/\/+$/, '') || '/';
  return PUBLIC_ROUTES.includes(normalized);
}

/** Every route the Portal can render (used for redirect decisions). */
export const ALL_PORTAL_ROUTES: readonly string[] = Object.values(ROUTES);