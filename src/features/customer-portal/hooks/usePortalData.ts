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
import { useCustomerAuth } from '../components/auth/CustomerAuthContext';
import type {
  AccountProfile,
  DeliveryNotification,
  Invoice,
  InvoiceItem,
  Order,
  OrderRequest,
  Payment,
  PaymentRequest,
  PortalAd,
  PortalNotification,
  PortalReferral,
  Product,
  Quotation,
  QuoteRequest,
  ReferralReward,
  ReferralStats,
  StatementEntry,
  SupportArticle,
  SupportTicket,
  Wallet,
} from '../types';
import type { ErpLoyalty } from '../types';

/**
 * Per-invoice line-item cache. The list endpoint never returns items
 * (it would balloon payloads), but the list screen advertises that
 * search hits line-item text. We populate the cache on every successful
 * `getInvoiceDetail` call and let the list search use it.
 *
 * Cleared on logout so a different customer never sees another
 * customer's cached items. Bounded so a long-lived session cannot leak
 * memory.
 */
const invoiceItemsCache = new Map<string, InvoiceItem[]>();
const INVOICE_ITEMS_CACHE_MAX = 500;

function cacheInvoiceItems(id: string, items: InvoiceItem[]): void {
  if (invoiceItemsCache.size >= INVOICE_ITEMS_CACHE_MAX) {
    const firstKey = invoiceItemsCache.keys().next().value;
    if (firstKey !== undefined) invoiceItemsCache.delete(firstKey);
  }
  invoiceItemsCache.set(id, items);
}

/** Returns cached line items for an invoice id (or empty array). */
export function getCachedInvoiceItems(invoiceId: string): InvoiceItem[] {
  return invoiceItemsCache.get(invoiceId) ?? [];
}

/** Live events subscription — starts with the session, stops on logout. */
export function usePortalEvents(active = true): void {
  const { isAuthenticated } = useCustomerAuth();
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

  // Wipe the per-invoice line-items cache on logout so the next signed-in
  // customer cannot see the previous user's cached descriptions via search.
  useEffect(() => {
    if (!isAuthenticated) invoiceItemsCache.clear();
  }, [isAuthenticated]);
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
      return portalService.getInvoiceDetail(invoiceId).then((invoice) => {
        if (invoice?.items?.length) {
          cacheInvoiceItems(invoice.id, invoice.items);
        }
        return invoice;
      });
    },
    invoiceId ? [invoiceId] : ['none'],
    invoiceId !== null
  );
}

export function useOrdersData(): PortalQueryResult<Order[]> {
  return usePortalQuery(() => portalService.getOrders(), []);
}

/**
 * Customer order REQUESTS (ODR-...) — submitted requests from the ERP request
 * pipeline. Distinct from official Sales Orders (useOrdersData).
 */
export function useOrderRequestsData(): PortalQueryResult<OrderRequest[]> {
  return usePortalQuery(() => portalService.getOrderRequests(), []);
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

export function useReferralsData(): PortalQueryResult<PortalReferral[]> {
  return usePortalQuery(() => portalService.getReferrals(), []);
}

export function useReferralStatsData(): PortalQueryResult<ReferralStats> {
  return usePortalQuery(() => portalService.getReferralStats(), []);
}

export function useReferralRewardsData(): PortalQueryResult<ReferralReward[]> {
  return usePortalQuery(() => portalService.getReferralRewards(), []);
}

export function useWalletData(): PortalQueryResult<Wallet> {
  return usePortalQuery(() => portalService.getWallet(), []);
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

export function useSupportTicketsData(): PortalQueryResult<SupportTicket[]> {
  return usePortalQuery(() => portalService.getSupportTickets(), []);
}

export function useSupportArticlesData(): PortalQueryResult<SupportArticle[]> {
  return usePortalQuery(() => portalService.getSupportArticles(), []);
}