/**
 * Prime PORTAL — Feature Data Hooks
 *
 * Typed read hooks for each Portal screen. All data flows through the
 * PortalService boundary — components never fetch endpoints directly.
 *
 * usePortalEvents() subscribes to the ERP SSE stream while authenticated and
 * invalidates the shared query cache on every event (contract §10).
 */

import { useEffect } from 'react';
import { usePortalQuery, invalidatePortalQueries, type PortalQueryResult } from './usePortalQuery';
import { env } from '../config/env';
import { portalService, sseService } from '../services';
import { useAuth } from './useAuth';
import type {
  AccountProfile,
  DeliveryNotification,
  Invoice,
  Order,
  Payment,
  PaymentRequest,
  PortalAd,
  PortalNotification,
  Product,
  Quotation,
  QuoteRequest,
  Referral,
  StatementEntry,
} from '../types';
import type { ErpLoyalty } from '../types';

/** Live events subscription — starts with the session, stops on logout. */
export function usePortalEvents(active = true): void {
  const { isAuthenticated } = useAuth();
  useEffect(() => {
    if (!active || !isAuthenticated || !env.useRealBackend) return;
    sseService.start({
      onNotification: () => invalidatePortalQueries(),
      onEntityChanged: () => invalidatePortalQueries(),
    });
    return () => {
      sseService.stop();
    };
  }, [active, isAuthenticated]);
}

export function useCustomerData(overrides?: Partial<AccountProfile>): PortalQueryResult<AccountProfile> {
  const query = usePortalQuery(() => portalService.getCurrentCustomer(), []);
  if (overrides && query.data) {
    return { ...query, data: { ...query.data, ...overrides } };
  }
  return query;
}

export function useInvoicesData(): PortalQueryResult<Invoice[]> {
  return usePortalQuery(() => portalService.getInvoices(), []);
}

export function useInvoiceDetailData(invoiceId: string | null): PortalQueryResult<Invoice> {
  return usePortalQuery(
    () => {
      if (!invoiceId) return Promise.reject(new Error('No invoice selected.'));
      return portalService.getInvoiceDetail(invoiceId);
    },
    invoiceId ? [invoiceId] : ['none'],
    invoiceId !== null
  );
}

export function useOrdersData(): PortalQueryResult<Order[]> {
  return usePortalQuery(() => portalService.getOrders(), []);
}

export function useQuoteRequestsData(): PortalQueryResult<QuoteRequest[]> {
  return usePortalQuery(() => portalService.getQuoteRequests(), []);
}

export function useQuotationsData(): PortalQueryResult<Quotation[]> {
  return usePortalQuery(() => portalService.getQuotations(), []);
}

export function useDeliveriesData(): PortalQueryResult<DeliveryNotification[]> {
  return usePortalQuery(() => portalService.getDeliveries(), []);
}

export function useStatementsData(startDate?: string, endDate?: string): PortalQueryResult<StatementEntry[]> {
  return usePortalQuery(() => portalService.getStatements(startDate, endDate), [startDate, endDate]);
}

export function usePaymentsData(): PortalQueryResult<Payment[]> {
  return usePortalQuery(() => portalService.getPayments(), []);
}

/**
 * Customer payment-request list. Fetched only while enabled (default true) —
 * the payment-request modal gates it so no ERP call is made when the modal is
 * closed.
 */
export function usePaymentRequestsData(enabled = true): PortalQueryResult<PaymentRequest[]> {
  return usePortalQuery(() => portalService.getPaymentRequests(), [], enabled);
}

export function useReferralsData(): PortalQueryResult<Referral[]> {
  return usePortalQuery(() => portalService.getReferrals(), []);
}

export function useCatalogData(): PortalQueryResult<Product[]> {
  return usePortalQuery(() => portalService.getCatalog(), []);
}

export function useNotificationsData(): PortalQueryResult<PortalNotification[]> {
  return usePortalQuery(() => portalService.getNotifications(), []);
}

export function useUnreadNotificationCount(): PortalQueryResult<number> {
  return usePortalQuery(() => portalService.getUnreadNotificationCount(), []);
}

export function useLoyaltyData(): PortalQueryResult<ErpLoyalty> {
  return usePortalQuery(() => portalService.getLoyalty(), []);
}

export function useAdsData(): PortalQueryResult<PortalAd[]> {
  return usePortalQuery(() => portalService.getAds(), []);
}