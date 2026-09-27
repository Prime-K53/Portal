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
import { usePortalQuery, invalidatePortalQueries, type PortalQueryResult, type PortalQueryScope } from './usePortalQuery';
import { env } from '../config/env';
import { portalService, sseService } from '../services';
import { useCustomerAuth } from '../components/auth/CustomerAuthContext';
import type {
  AccountProfile,
  CompanyContactInfo,
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

/**
 * Cache freshness policy — the ERP 429s when one JWT fires many requests in
 * a short window, so mounted queries reuse data briefly instead of
 * refetching on every render, tab switch, or unrelated SSE ping:
 *   TRANSACTIONAL — money/ledger documents, refetch at most every 10s.
 *   REFERENCE     — catalogs, articles, contact info, refetch at most every 60s.
 */
export const STALE_MS_TRANSACTIONAL = 10_000;
export const STALE_MS_REFERENCE = 60_000;

// Stable scope arrays (module-level so listener identity is stable).
const SCOPE_CUSTOMER: PortalQueryScope[] = ['customer'];
const SCOPE_INVOICES: PortalQueryScope[] = ['invoices'];
const SCOPE_ORDERS: PortalQueryScope[] = ['orders', 'order-requests'];
const SCOPE_QUOTES: PortalQueryScope[] = ['quotations', 'quote-requests'];
const SCOPE_DELIVERIES: PortalQueryScope[] = ['deliveries'];
const SCOPE_STATEMENTS: PortalQueryScope[] = ['statements', 'payments', 'payment-requests'];
const SCOPE_REFERRALS: PortalQueryScope[] = ['referrals', 'wallet'];
const SCOPE_CATALOG: PortalQueryScope[] = ['catalog'];
const SCOPE_NOTIFICATIONS: PortalQueryScope[] = ['notifications'];
const SCOPE_SUPPORT: PortalQueryScope[] = ['support', 'articles'];
const SCOPE_ADS: PortalQueryScope[] = ['ads'];
const SCOPE_CONTACT: PortalQueryScope[] = ['company-contact'];
const SCOPE_LOYALTY: PortalQueryScope[] = ['loyalty'];

/**
 * Maps an ERP `entity_changed` docType to the query scopes that read it.
 * Returns `undefined` for unrecognized types — the caller then invalidates
 * globally so nothing ever goes silently stale.
 */
export function scopesForDocType(docType: string): PortalQueryScope[] | undefined {
  const t = (docType ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (!t) return undefined;
  if (t.includes('invoice')) return ['invoices', 'statements'];
  if (t.includes('statement') || t.includes('ledger')) return ['statements'];
  if (t.includes('payment')) return ['payments', 'payment-requests', 'invoices', 'statements'];
  if (t.includes('order') || t.includes('request')) return ['orders', 'order-requests'];
  if (t.includes('quot') || t.includes('rfq')) return ['quotations', 'quote-requests'];
  if (t.includes('notif')) return ['notifications'];
  if (t.includes('deliver') || t.includes('ship') || t.includes('dispatch') || t.includes('deliverynote')) return ['deliveries'];
  if (t.includes('referral') || t.includes('reward') || t.includes('wallet')) return ['referrals', 'wallet'];
  if (t.includes('product') || t.includes('catalog') || t.includes('catalogue')) return ['catalog'];
  if (t.includes('ticket') || t.includes('support') || t.includes('article') || t.includes('message')) return ['support', 'articles'];
  if (t.includes('customer') || t.includes('profile') || t.includes('account')) return ['customer'];
  if (t.includes('loyal')) return ['loyalty'];
  if (t === 'ad' || t === 'ads' || t.includes('advert') || t.includes('banner') || t.includes('promo')) return ['ads'];
  return undefined;
}

/** Live events subscription — starts with the session, stops on logout. */
export function usePortalEvents(active = true): void {
  const { isAuthenticated } = useCustomerAuth();
  useEffect(() => {
    if (!active || !isAuthenticated || !env.useRealBackend) return;
    sseService.start({
      // Per-entity invalidation: only queries reading the changed document
      // type refetch. Unknown doc types fall back to a global invalidation
      // so nothing ever goes silently stale.
      onNotification: () => invalidatePortalQueries(['notifications']),
      onEntityChanged: (event) => invalidatePortalQueries(scopesForDocType(event.docType)),
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
  const query = usePortalQuery(() => portalService.getCurrentCustomer(), [], true, STALE_MS_TRANSACTIONAL, SCOPE_CUSTOMER);
  if (overrides && query.data) {
    return { ...query, data: { ...query.data, ...overrides } };
  }
  return query;
}

export function useInvoicesData(enabled = true): PortalQueryResult<Invoice[]> {
  return usePortalQuery(() => portalService.getInvoices(), [], enabled, STALE_MS_TRANSACTIONAL, SCOPE_INVOICES);
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
    invoiceId !== null,
    STALE_MS_TRANSACTIONAL,
    SCOPE_INVOICES
  );
}

export function useOrdersData(enabled = true): PortalQueryResult<Order[]> {
  return usePortalQuery(() => portalService.getOrders(), [], enabled, STALE_MS_TRANSACTIONAL, SCOPE_ORDERS);
}

/**
 * Customer order REQUESTS (ODR-...) — submitted requests from the ERP request
 * pipeline. Distinct from official Sales Orders (useOrdersData).
 */
export function useOrderRequestsData(enabled = true): PortalQueryResult<OrderRequest[]> {
  return usePortalQuery(() => portalService.getOrderRequests(), [], enabled, STALE_MS_TRANSACTIONAL, SCOPE_ORDERS);
}

export function useQuoteRequestsData(enabled = true): PortalQueryResult<QuoteRequest[]> {
  return usePortalQuery(() => portalService.getQuoteRequests(), [], enabled, STALE_MS_TRANSACTIONAL, SCOPE_QUOTES);
}

export function useQuotationsData(enabled = true): PortalQueryResult<Quotation[]> {
  return usePortalQuery(() => portalService.getQuotations(), [], enabled, STALE_MS_TRANSACTIONAL, SCOPE_QUOTES);
}

export function useDeliveriesData(enabled = true): PortalQueryResult<DeliveryNotification[]> {
  return usePortalQuery(() => portalService.getDeliveries(), [], enabled, STALE_MS_TRANSACTIONAL, SCOPE_DELIVERIES);
}

export function useStatementsData(
  startDate?: string,
  endDate?: string,
  enabled = true
): PortalQueryResult<StatementEntry[]> {
  return usePortalQuery(
    () => portalService.getStatements(startDate, endDate),
    [startDate, endDate],
    enabled,
    STALE_MS_TRANSACTIONAL,
    SCOPE_STATEMENTS
  );
}

export function usePaymentsData(enabled = true): PortalQueryResult<Payment[]> {
  return usePortalQuery(() => portalService.getPayments(), [], enabled, STALE_MS_TRANSACTIONAL, SCOPE_STATEMENTS);
}

/**
 * Customer payment-request list. Fetched only while enabled (default true) —
 * the payment-request modal gates it so no ERP call is made when the modal is
 * closed.
 */
export function usePaymentRequestsData(enabled = true): PortalQueryResult<PaymentRequest[]> {
  return usePortalQuery(() => portalService.getPaymentRequests(), [], enabled, STALE_MS_TRANSACTIONAL, SCOPE_STATEMENTS);
}

export function useReferralsData(enabled = true): PortalQueryResult<PortalReferral[]> {
  return usePortalQuery(() => portalService.getReferrals(), [], enabled, STALE_MS_TRANSACTIONAL, SCOPE_REFERRALS);
}

export function useReferralStatsData(enabled = true): PortalQueryResult<ReferralStats> {
  return usePortalQuery(() => portalService.getReferralStats(), [], enabled, STALE_MS_TRANSACTIONAL, SCOPE_REFERRALS);
}

export function useReferralRewardsData(enabled = true): PortalQueryResult<ReferralReward[]> {
  return usePortalQuery(() => portalService.getReferralRewards(), [], enabled, STALE_MS_TRANSACTIONAL, SCOPE_REFERRALS);
}

export function useWalletData(enabled = true): PortalQueryResult<Wallet> {
  return usePortalQuery(() => portalService.getWallet(), [], enabled, STALE_MS_TRANSACTIONAL, SCOPE_REFERRALS);
}

export function useCatalogData(enabled = true): PortalQueryResult<Product[]> {
  return usePortalQuery(() => portalService.getCatalog(), [], enabled, STALE_MS_REFERENCE, SCOPE_CATALOG);
}

export function useNotificationsData(): PortalQueryResult<PortalNotification[]> {
  return usePortalQuery(() => portalService.getNotifications(), [], true, STALE_MS_TRANSACTIONAL, SCOPE_NOTIFICATIONS);
}

export function useUnreadNotificationCount(): PortalQueryResult<number> {
  return usePortalQuery(() => portalService.getUnreadNotificationCount(), [], true, STALE_MS_TRANSACTIONAL, SCOPE_NOTIFICATIONS);
}

export function useLoyaltyData(): PortalQueryResult<ErpLoyalty> {
  return usePortalQuery(() => portalService.getLoyalty(), [], true, STALE_MS_TRANSACTIONAL, SCOPE_LOYALTY);
}

export function useAdsData(enabled = true): PortalQueryResult<PortalAd[]> {
  return usePortalQuery(() => portalService.getAds(), [], enabled, STALE_MS_REFERENCE, SCOPE_ADS);
}

export function useSupportTicketsData(enabled = true): PortalQueryResult<SupportTicket[]> {
  return usePortalQuery(() => portalService.getSupportTickets(), [], enabled, STALE_MS_TRANSACTIONAL, SCOPE_SUPPORT);
}

export function useSupportArticlesData(enabled = true): PortalQueryResult<SupportArticle[]> {
  return usePortalQuery(() => portalService.getSupportArticles(), [], enabled, STALE_MS_REFERENCE, SCOPE_SUPPORT);
}

export function useCompanyContactData(): PortalQueryResult<CompanyContactInfo | null> {
  return usePortalQuery(() => portalService.getCompanyContactInfo(), [], true, STALE_MS_REFERENCE, SCOPE_CONTACT);
}