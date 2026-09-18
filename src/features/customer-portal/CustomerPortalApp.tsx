import React, { useEffect, useRef, useState } from 'react';
import { useHashRoute } from './router/useHashRoute';
import { RouteGuard } from './router/RouteGuard';
import { invalidatePortalQueries } from './hooks/usePortalQuery';
import {
  bumpOutboxAttempts,
  enqueueOutbox,
  isOfflineError,
  listOutbox,
  removeOutboxEntry,
} from './utils/mutationOutbox';

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => {
    try {
      return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    } catch {
      return true;
    }
  });
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    try {
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
    } catch {
      // ignore
    }
    return () => {
      try {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      } catch {
        // ignore
      }
    };
  }, []);
  return online;
}

function OfflineBanner(): React.ReactElement | null {
  const online = useOnlineStatus();
  const [queued, setQueued] = useState(() => {
    try {
      return listOutbox().length;
    } catch {
      return 0;
    }
  });
  useEffect(() => {
    const update = () => {
      try {
        setQueued(listOutbox().length);
      } catch {
        // ignore
      }
    };
    update();
    try {
      window.addEventListener('online', update);
      window.addEventListener('offline', update);
      window.addEventListener('portal-outbox-changed', update);
    } catch {
      // ignore
    }
    return () => {
      try {
        window.removeEventListener('online', update);
        window.removeEventListener('offline', update);
        window.removeEventListener('portal-outbox-changed', update);
      } catch {
        // ignore
      }
    };
  }, []);

  const handleReplay = async () => {
    const entries = listOutbox().filter((e) => e.kind === 'order-request');
    for (const entry of entries) {
      try {
        const payload = entry.payload as Parameters<typeof portalService.createOrder>[0];
        await portalService.createOrder(payload, entry.idempotencyKey);
        removeOutboxEntry(entry.id);
      } catch {
        bumpOutboxAttempts(entry.id);
        break;
      }
    }
    try {
      window.dispatchEvent(new CustomEvent('portal-queries-invalidated'));
    } catch {
      // ignore
    }
    invalidatePortalQueries();
  };

  if (online && queued === 0) return null;
  return (
    <div className="max-w-7xl w-full mx-auto px-3 sm:px-4 lg:px-6 pt-4" role="alert" aria-live="assertive">
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold flex items-center justify-between gap-3">
        <span>
          {!online
            ? 'You are offline. Browsing cached data works, but new submissions wait in the outbox.'
            : `${queued} offline order${queued === 1 ? '' : 's'} queued.`}
        </span>
        {online && queued > 0 && (
          <button
            type="button"
            onClick={() => void handleReplay()}
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold shrink-0 min-h-[36px]"
          >
            Retry now
          </button>
        )}
      </div>
    </div>
  );
}
import {
  useAdsData,
  useCatalogData,
  useCompanyContactData,
  useCustomerData,
  useDeliveriesData,
  useInvoicesData,
  useNotificationsData,
  useOrderRequestsData,
  useOrdersData,
  usePaymentsData,
  usePortalEvents,
  useQuoteRequestsData,
  useQuotationsData,
  useReferralsData,
  useReferralRewardsData,
  useReferralStatsData,
  useStatementsData,
  useSupportArticlesData,
  useSupportTicketsData,
  useUnreadNotificationCount,
  useWalletData,
} from './hooks/usePortalData';
import { portalService } from './services';
import { ROUTES, pathForTab, tabFromPath } from './router/routes';
import { combineQueryStates, DashboardSkeleton, PortalDataBoundary } from './components/state/PortalDataBoundary';
import { generateIdempotencyKey } from './utils/idempotency';
import {
  AccountProfile,
  CartItem,
  DeliveryNotification,
  Invoice,
  NewSupportTicketPayload,
  Order,
  OrderRequest,
  PaymentRequest,
  PortalReferral,
  Product,
  QuoteRequest,
  QuoteRequestItem,
  Quotation,
  ReferralCreatePayload,
  ReferralTimelineEntry,
  StatementEntry,
  TabType,
} from './types';

// Auth Component
import { CustomerActivate } from './components/auth/CustomerActivate';
import { CustomerAuthProvider, useCustomerAuth } from './components/auth/CustomerAuthContext';
import { CustomerForgotPassword } from './components/auth/CustomerForgotPassword';
import { CustomerLogin } from './components/auth/CustomerLogin';
import { CustomerRegister } from './components/auth/CustomerRegister';
import { CustomerRegistrationPending } from './components/auth/CustomerRegistrationPending';
import { BrandSplash } from './components/auth/BrandSplash';
import { onSplashChange, setSplashVisible } from './components/auth/splashState';

// Layout & Navigation
import { BottomNavigation } from './components/BottomNavigation';
import { MobileHeader } from './components/MobileHeader';
import { NotificationDrawer } from './components/NotificationDrawer';
import { Sidebar } from './components/Sidebar';
import { PwaInstallChip } from './components/PwaInstallChip';
import { DevModeBanner } from './components/DevModeBanner';
import { DarkModeProvider } from './context/DarkModeContext';
import { DocumentVerify } from './views/DocumentVerify';

// Modals
import { CartDrawer } from './components/modals/CartDrawer';
import { CommandPaletteModal } from './components/modals/CommandPaletteModal';
import { InvoiceDetailModal } from './components/modals/InvoiceDetailModal';
import { OrderDetailModal } from './components/modals/OrderDetailModal';
import { PaymentRequestModal } from './components/modals/PaymentRequestModal';
import { ProductDetailModal } from './components/modals/ProductDetailModal';
import { QuoteRequestModal } from './components/modals/QuoteRequestModal';
import { QuotationDetailModal } from './components/modals/QuotationDetailModal';
import { StatementItemDetailModal } from './components/modals/StatementItemDetailModal';
import { StatementPrintModal } from './components/modals/StatementPrintModal';

// Tabs
import { AccountTab } from './components/tabs/AccountTab';
import { DashboardTab } from './components/tabs/DashboardTab';
import { DeliveriesTab } from './components/tabs/DeliveriesTab';
import { InvoicesTab } from './components/tabs/InvoicesTab';
import type { InvoiceFilter } from './components/tabs/InvoicesTab';
import { OrdersTab } from './components/tabs/OrdersTab';
import { QuotesTab } from './components/tabs/QuotesTab';
import { ReferralsTab } from './components/tabs/ReferralsTab';
import { StatementsTab } from './components/tabs/StatementsTab';
import { SupportTab } from './components/tabs/SupportTab';

export interface CustomerPortalAppProps {
  initialTab?: TabType;
  /** Optional ERP-merge override merged over the profile returned by the Portal service. */
  initialProfileData?: AccountProfile;
  onNavigateMainApp?: (path: string) => void;
  className?: string;
}

function CustomerPortalShell({
  initialTab = 'dashboard',
  initialProfileData,
  className = '',
}: CustomerPortalAppProps) {
  const auth = useCustomerAuth();
  const { path, navigate } = useHashRoute();

  // ── Legacy path-form entry (`/register?ref=CODE`) ─────────────────────────
  //
  // Shared referral links use the path form built by ReferralCodeCard, but the
  // Portal routes by hash. Without this redirect a shared link lands on the
  // login screen and the referral code is never captured. Mirror `/register`
  // (+ its query string, which carries `ref`) into the equivalent hash route
  // exactly once on boot. Existing links keep working; the in-app canonical
  // form remains `#/register?ref=CODE`.
  useEffect(() => {
    try {
      const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
      if (pathname === '/register' && !window.location.hash) {
        navigate(`/register${window.location.search}`);
      }
    } catch {
      // Location unavailable (non-browser render) — ignore.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Routing (computed before data hooks so the per-tab enabled flags
  //    below can reference the active tab on the very first render). ────
  const defaultPath = pathForTab(initialTab);
  const activeTab: TabType = tabFromPath(path) ?? tabFromPath(defaultPath) ?? 'dashboard';

  // ── Statement filter state (declared before queries so the range feeds the
  //    ERP request — previously the filter never refetched). ──────────────
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const todayISO = today.toISOString().split('T')[0];
  const [statementDateFilter, setStatementDateFilter] = useState<'all' | '30days' | 'this_month' | 'custom'>('all');
  const [statementStartDate, setStatementStartDate] = useState(firstOfMonth);
  const [statementEndDate, setStatementEndDate] = useState(todayISO);

  const effectiveStatementRange = (() => {
    if (statementDateFilter === 'all') return { start: undefined as string | undefined, end: undefined as string | undefined, invalid: false };
    if (statementDateFilter === '30days') {
      const end = todayISO;
      const start = new Date(Date.now() - 29 * 86400000).toISOString().split('T')[0];
      return { start, end, invalid: false };
    }
    if (statementDateFilter === 'this_month') return { start: firstOfMonth, end: todayISO, invalid: false };
    if (!statementStartDate || !statementEndDate) return { start: undefined as string | undefined, end: undefined as string | undefined, invalid: true };
    if (statementStartDate > statementEndDate) return { start: undefined as string | undefined, end: undefined as string | undefined, invalid: true };
    return { start: statementStartDate, end: statementEndDate, invalid: false };
  })();
  const isStatementRangeInvalid = effectiveStatementRange.invalid;

  // ── Portal data (all reads flow through the PortalService boundary) ───────
  //
  // Query gating — the ERP /api/portal/* endpoints return HTTP 429 when a
  // single JWT fires many requests in a short window. Only the active tab's
  // queries + header essentials are enabled. Dashboard KPIs need their sets,
  // so each list is enabled on dashboard + its own tab — not on every tab.

  // Always-on (header, bell, cross-tab UI).
  const customerQuery = useCustomerData(initialProfileData);
  const notificationsQuery = useNotificationsData();
  const unreadQuery = useUnreadNotificationCount();
  const companyContactQuery = useCompanyContactData();

  // Gated by tab to avoid the 11-request boot storm (ERP 429s on concurrent
  // JWT GETs). Dashboard KPIs need these, so each is enabled on dashboard +
  // its own tab — not on every tab.
  const isDashboard = activeTab === 'dashboard';
  const invoicesQuery = useInvoicesData(isDashboard || activeTab === 'invoices');
  const deliveriesQuery = useDeliveriesData(isDashboard || activeTab === 'deliveries');
  const ordersQuery = useOrdersData(isDashboard || activeTab === 'orders');
  const orderRequestsQuery = useOrderRequestsData(isDashboard || activeTab === 'orders');
  const catalogQuery = useCatalogData(isDashboard || activeTab === 'orders');
  const adsQuery = useAdsData(isDashboard);
  const statementsQuery = useStatementsData(
    effectiveStatementRange.start,
    effectiveStatementRange.end,
    (isDashboard || activeTab === 'statements') && !isStatementRangeInvalid
  );

  // Per-tab gated (only fetched when their tab is the active tab).
  const quotationsQuery = useQuotationsData(activeTab === 'quotes');
  const quoteRequestsQuery = useQuoteRequestsData(activeTab === 'quotes');
  const paymentsQuery = usePaymentsData(activeTab === 'statements');
  const referralsQuery = useReferralsData(activeTab === 'referrals');
  const referralStatsQuery = useReferralStatsData(activeTab === 'referrals');
  const referralRewardsQuery = useReferralRewardsData(activeTab === 'referrals');
  const walletQuery = useWalletData(activeTab === 'referrals');
  const supportTicketsQuery = useSupportTicketsData(activeTab === 'support');
  const supportArticlesQuery = useSupportArticlesData(activeTab === 'support');

  // ── Live ERP events (SSE) ─────────────────────────────────────────────────
  usePortalEvents();

  const profile = customerQuery.data;
  const invoices = invoicesQuery.data ?? [];
  const deliveries = deliveriesQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const orderRequests = orderRequestsQuery.data ?? [];
  const quotations = quotationsQuery.data ?? [];
  const quoteRequests = quoteRequestsQuery.data ?? [];
  const statements = statementsQuery.data ?? [];
  const referrals = referralsQuery.data ?? [];
  const referralStats = referralStatsQuery.data ?? null;
  const referralRewards = referralRewardsQuery.data ?? [];
  const wallet = walletQuery.data ?? null;
  const products = catalogQuery.data ?? [];
  const notifications = notificationsQuery.data ?? [];
  const unreadNotificationCount = unreadQuery.data ?? 0;
  const ads = adsQuery.data ?? [];
  const supportTickets = supportTicketsQuery.data ?? [];
  const supportArticles = supportArticlesQuery.data ?? [];
  const companyContact = companyContactQuery.data ?? null;

  // ── UI state (no business data lives here) ────────────────────────────────
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedInvoiceDetail, setSelectedInvoiceDetail] = useState<Invoice | null>(null);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(null);
  const [selectedProductDetail, setSelectedProductDetail] = useState<Product | null>(null);
  const [selectedStatementEntryDetail, setSelectedStatementEntryDetail] = useState<StatementEntry | null>(null);
  const [selectedQuotationDetail, setSelectedQuotationDetail] = useState<Quotation | QuoteRequest | null>(null);

  const [paymentRequestInvoice, setPaymentRequestInvoice] = useState<Invoice | null>(null);
  /** Preset list filter applied when drilling in from a dashboard KPI. */
  const [invoicePresetFilter, setInvoicePresetFilter] = useState<InvoiceFilter | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isStatementPrintModalOpen, setIsStatementPrintModalOpen] = useState(false);
  const [showBrandSplash, setShowBrandSplash] = useState(true);
  const [loginSplashActive, setLoginSplashActive] = useState(false);

  useEffect(() => {
    const unsub = onSplashChange((visible) => {
      setLoginSplashActive(visible);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!showBrandSplash) return;
    const timer = window.setTimeout(() => setShowBrandSplash(false), 4000);
    return () => window.clearTimeout(timer);
  }, [showBrandSplash]);

  const isSplashVisible = showBrandSplash || loginSplashActive;
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionCorrelationId, setActionCorrelationId] = useState<string | null>(null);

  // ── Routing (activeTab already computed above for query gating) ────────

  // Tracks a monotonically-increasing nonce used to remount the Invoices tab
  // on every re-entry. Combined with the preset filter key, this gives us
  // the right behavior: a KPI drill-in remounts the tab with the preset
  // applied, and a plain visit always starts from the default filter.
  const [invoicesTabNonce, setInvoicesTabNonce] = useState(0);
  const wasOnInvoicesRef = useRef(false);

  const handleNavigateTab = (tab: TabType) => navigate(pathForTab(tab));

  useEffect(() => {
    const isOnInvoices = activeTab === 'invoices';
    // First time the user lands on Invoices, or every time they come back to
    // Invoices from a different tab, remount it so internal state (filter,
    // search) is reset to the default.
    if (isOnInvoices && !wasOnInvoicesRef.current) {
      setInvoicesTabNonce((n) => n + 1);
    }
    wasOnInvoicesRef.current = isOnInvoices;

    // Consume the KPI preset once the user leaves the invoices tab. The next
    // visit to /invoices then starts from the default filter. We deliberately
    // clear on leave (not on enter) so the preset survives a quick tab toggle.
    if (!isOnInvoices && invoicePresetFilter !== null) {
      setInvoicePresetFilter(null);
    }
  }, [activeTab, invoicePresetFilter]);

  // ── Computed values ───────────────────────────────────────────────────────
  const unpaidInvoices = invoices.filter(
    (i) => i.status === 'unpaid' || i.status === 'overdue' || i.status === 'partially_paid'
  );
  const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + i.amountRemaining, 0);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // ── Notification badge ────────────────────────────────────────────────────
  // Badge shows only the real ERP unread notification count.
  // No inflation with invoice/delivery/statement totals.
  const notificationBadgeCount = unreadNotificationCount;

  const handleOpenNotifications = () => {
    setIsNotificationDrawerOpen(true);
  };

  // ── Action helpers ────────────────────────────────────────────────────────
  const runAction = async <T,>(action: () => Promise<T>): Promise<T> => {
    setActionError(null);
    setActionCorrelationId(null);
    try {
      return await action();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The operation could not be completed.';
      // Preserve server correlation ID so support can trace the failure.
      const correlationId =
        err instanceof Error && 'correlationId' in err
          ? String((err as unknown as { correlationId: unknown }).correlationId ?? '')
          : null;
      setActionError(correlationId ? `${message} (Ref: ${correlationId})` : message);
      setActionCorrelationId(correlationId || null);
      throw err;
    }
  };

  // ── Bank Transfer payment REQUEST (workflow data only — never a payment) ─
  //
  // Submits a payment REQUEST to the ERP (POST /api/portal/payment-requests).
  // The ERP derives customer identity from the JWT, re-validates invoice
  // ownership + outstanding amount, and protects against duplicate active
  // requests. Sasa never writes a customer_payment or modifies the invoice:
  // after a successful request the ERP state is simply refreshed and the
  // invoice remains unpaid/partial unless the ERP independently records a
  // real accounting payment.
  const handleSubmitPaymentRequest = (invoiceId: string, requestedAmount: number, note: string, paymentMethod: string): Promise<PaymentRequest> => {
    return runAction(() => portalService.createPaymentRequest({ invoiceId, requestedAmount, note, paymentMethod })).then((created) => {
      // Phase 9: refresh ERP state. A request does NOT change invoice
      // financials — this refetch only surfaces real ERP changes.
      invoicesQuery.refetch();
      statementsQuery.refetch();
      customerQuery.refetch();
      return created;
    });
  };

  // ── Cart ──────────────────────────────────────────────────────────────────
  const handleAddToCart = (product: Product, quantity: number) => {
    const variantId = product.selectedVariantId;
    setCartItems((prev) => {
      const existing = prev.find(
        (item) => item.product.id === product.id && item.variantId === variantId
      );
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id && item.variantId === variantId
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { product, quantity, variantId }];
    });
  };

  const handleUpdateCartQuantity = (productId: string, quantity: number, variantId?: string) => {
    if (quantity <= 0) {
      handleRemoveCartItem(productId, variantId);
      return;
    }
    setCartItems((prev) =>
      prev.map((item) =>
        item.product.id === productId && item.variantId === variantId ? { ...item, quantity } : item
      )
    );
  };

  const handleRemoveCartItem = (productId: string, variantId?: string) => {
    setCartItems((prev) => prev.filter((item) => !(item.product.id === productId && item.variantId === variantId)));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  const handlePlaceOrder = async (
    requestedDeliveryDate?: string,
    idempotencyKey?: string
  ) => {
    const totalAmount = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const key = idempotencyKey ?? generateIdempotencyKey();
    const buildPayload = () => ({
      items: cartItems.map((ci) => {
        // Label the line with the selected variant so ERP staff see the
        // exact option ordered (variantId is sent alongside; the ERP
        // re-prices server-side from its own master data).
        const variant = ci.variantId
          ? ci.product.variants?.find((v) => v.id === ci.variantId)
          : undefined;
        const productName =
          variant && variant.name && variant.name !== ci.product.name
            ? `${ci.product.name} (${variant.name})`
            : ci.product.name;
        return {
          productId: ci.product.id,
          productName,
          quantity: ci.quantity,
          unitPrice: ci.product.price,
          total: ci.product.price * ci.quantity,
          variantId: ci.variantId,
        };
      }),
      deliveryAddress: '',
      paymentTerms: 'Net 30 Credit Terms',
      totalAmount,
      requestedDeliveryDate,
    });
    try {
      await runAction(async () => {
        const created = await portalService.createOrder(buildPayload(), key);
        ordersQuery.refetch();
        orderRequestsQuery.refetch();
        invoicesQuery.refetch();
        statementsQuery.refetch();
        deliveriesQuery.refetch();
        customerQuery.refetch();
        setCartItems([]);
        return created;
      });
    } catch (err) {
      // Offline: preserve intent + idempotency key so reconnect replays the
      // SAME attempt instead of forging a duplicate.
      if (isOfflineError(err)) {
        enqueueOutbox({ kind: 'order-request', idempotencyKey: key, payload: buildPayload() });
        setActionError('You are offline — order saved to outbox and will replay with the same key when you reconnect.');
      }
      throw err;
    }
  };

  /**
   * Cancels a customer's own order REQUEST (POST /portal/requests/:id/cancel).
   * The ERP enforces ownership and the cancellable status set — requests
   * already converted / rejected / cancelled are rejected server-side.
   */
  const handleCancelOrderRequest = (requestId: string): Promise<OrderRequest> => {
    return runAction(() => portalService.cancelOrderRequest(requestId)).then((cancelled) => {
      orderRequestsQuery.refetch();
      return cancelled;
    });
  };

  /** Re-submits an official Sales Order through the ERP reorder pipeline. */
  const handleReorderOrder = (orderId: string): Promise<OrderRequest> => {
    return runAction(() => portalService.reorderOrder(orderId)).then((created) => {
      orderRequestsQuery.refetch();
      return created;
    });
  };

  // ── Quotations (formal ERP quotations) ────────────────────────────────────
  const handleSubmitQuoteRequest = (
    items: QuoteRequestItem[],
    requiredByDate: string,
    deliveryLocation: string,
    priority: 'standard' | 'urgent' | 'express',
    notes: string
  ) => {
    runAction(async () => {
      await portalService.submitQuoteRequest({
        items,
        requiredByDate,
        deliveryLocation,
        priority,
        notes,
      });
      quoteRequestsQuery.refetch();
      quotationsQuery.refetch();
    });
  };

  const handleAcceptQuotation = (quotationId: string) => {
    return runAction(async () => {
      await portalService.acceptQuotation(quotationId);
      quoteRequestsQuery.refetch();
      quotationsQuery.refetch();
    });
  };

  const handleRejectQuotation = (quotationId: string) => {
    return runAction(async () => {
      await portalService.rejectQuotation(quotationId);
      quoteRequestsQuery.refetch();
      quotationsQuery.refetch();
    });
  };

  const handleRequestQuotationRevision = (quotationId: string) => {
    return runAction(async () => {
      await portalService.requestQuotationRevision(quotationId);
      quoteRequestsQuery.refetch();
      quotationsQuery.refetch();
    });
  };

  // ── Referrals (prospective-person referrals) ─────────────────────────────
  //
  // Creates a prospective-person referral (POST /api/portal/referrals,
  // body { referredName, referredEmail?, referredPhone?, notes? }).
  // The ERP derives customer identity from the JWT, validates the referral
  // (no self-referral, no existing customers, no duplicates), and owns the
  // lifecycle (pending → registered → converted/expired/cancelled) plus
  // rewards. Sasa never fabricates referral codes/links and there is no
  // customer-facing claim: rewards are approved and credited by ERP staff.
  const handleCreateReferral = (payload: ReferralCreatePayload, idempotencyKey: string): Promise<PortalReferral> => {
    return runAction(() => portalService.createReferral(payload, idempotencyKey)).then((created) => {
      referralsQuery.refetch();
      referralStatsQuery.refetch();
      referralRewardsQuery.refetch();
      walletQuery.refetch();
      return created;
    });
  };

  const handleLoadReferralTimeline = (referralId: string): Promise<ReferralTimelineEntry[]> => {
    return portalService.getReferralTimeline(referralId);
  };

  // ── Support / Help Desk ───────────────────────────────────────────────────
  const handleCreateSupportTicket = (payload: NewSupportTicketPayload): Promise<void> => {
    return runAction(async () => {
      await portalService.createSupportTicket(payload);
      supportTicketsQuery.refetch();
    }) as Promise<void>;
  };

  // ── Notifications (ERP portal_notifications) ──────────────────────────────
  const handleMarkAllNotificationsRead = () => {
    runAction(async () => {
      await portalService.markAllNotificationsRead();
      notificationsQuery.refetch();
      unreadQuery.refetch();
    });
  };

  const handleMarkNotificationRead = (id: string) => {
    runAction(async () => {
      await portalService.markNotificationsRead([id]);
      notificationsQuery.refetch();
      unreadQuery.refetch();
    });
  };

  // ── Sign out ──────────────────────────────────────────────────────────────
  const handleSignOut = async () => {
    await auth.logout();
    navigate(ROUTES.login);
  };

  // Auth screens (public routes) — switched by the current hash path.
  const renderUnauthenticated = () => {
    switch (path.split('?')[0].replace(/\/+$/, '')) {
      case ROUTES.activate:
        return <CustomerActivate />;
      case ROUTES.forgotPassword:
        return <CustomerForgotPassword />;
      case ROUTES.register:
        return <CustomerRegister />;
      case ROUTES.registerPending:
        return <CustomerRegistrationPending />;
      default:
        return <CustomerLogin />;
    }
  };

  const renderPortal = () => (
    <div className={`min-h-screen bg-slate-100/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-slate-900 selection:text-white flex ${className}`}>
      {/* Sidebar Navigation for Desktop (hidden on mobile) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleNavigateTab}
        profile={profile}
        unpaidCount={unpaidInvoices.length}
        unpaidTotal={unpaidTotal}
        cartCount={cartCount}
        onOpenPaymentModal={() => handleNavigateTab('invoices')}
        onOpenQuoteModal={() => setIsQuoteModalOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onSignOut={handleSignOut}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen-safe bg-slate-50/50 dark:bg-slate-900/50">
        {/* Top Navigation Bar Header (persistent on every tab so mobile users
            keep access to cart, notifications, and command palette). */}
        <MobileHeader
          profile={profile}
          unreadCount={notificationBadgeCount}
          onOpenNotifications={handleOpenNotifications}
          onOpenAccount={() => handleNavigateTab('account')}
          cartCount={cartCount}
          onOpenCart={() => setIsCartOpen(true)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        />

        {/* Offline banner — mutations queue nothing, so say so explicitly. */}
        <OfflineBanner />

        {/* Action Error Banner (real API failures are never hidden).
            Lives outside the tab conditional so it surfaces on every tab. */}
        {actionError && (
          <div className="max-w-7xl w-full mx-auto px-3 sm:px-4 lg:px-6 pt-4" role="alert" aria-live="assertive">
            <div className="flex items-start justify-between gap-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium">
              <span className="leading-relaxed">{actionError}</span>
              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setActionCorrelationId(null);
                }}
                className="text-rose-400 hover:text-rose-600 font-black shrink-0"
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Main Content View */}
        <main className="flex-1 px-3 py-4 sm:px-4 sm:py-6 lg:px-6 lg:py-8 max-w-7xl w-full mx-auto min-w-0" id="main-content">
          {activeTab === 'dashboard' && (
            <PortalDataBoundary
              isLoading={combineQueryStates([customerQuery, invoicesQuery, deliveriesQuery, ordersQuery, orderRequestsQuery, statementsQuery, adsQuery]).isLoading}
              error={combineQueryStates([customerQuery, invoicesQuery, deliveriesQuery, ordersQuery, orderRequestsQuery, statementsQuery, adsQuery]).error}
              onRetry={() => {
                customerQuery.refetch();
                invoicesQuery.refetch();
                deliveriesQuery.refetch();
                ordersQuery.refetch();
                orderRequestsQuery.refetch();
                statementsQuery.refetch();
                adsQuery.refetch();
              }}
              skeleton={<DashboardSkeleton />}
            >
              {profile ? (
              <DashboardTab
                profile={profile}
                invoices={invoices}
                orders={orders}
                deliveries={deliveries}
                statements={statements}
                ads={ads}
                activeTab={activeTab}
                onNavigateTab={handleNavigateTab}
                onOpenPaymentModal={() => handleNavigateTab('invoices')}
                onNavigateInvoices={(filter) => {
                  setInvoicePresetFilter(filter);
                  handleNavigateTab('invoices');
                }}
              />
              ) : (
                <div className="p-6 text-center text-sm text-slate-500" role="alert">
                  Profile failed to load. {customerQuery.error instanceof Error ? customerQuery.error.message : 'Please retry.'}
                </div>
              )}
            </PortalDataBoundary>
          )}

          {activeTab === 'invoices' && (
            <PortalDataBoundary
              isLoading={invoicesQuery.isLoading}
              error={invoicesQuery.error}
              isEmpty={!invoicesQuery.isLoading && !invoicesQuery.error && invoices.length === 0}
              emptyTitle="No invoices found"
              emptyDescription="Invoices issued by the ERP will appear here."
              onRetry={invoicesQuery.refetch}
            >
              <InvoicesTab
                key={`${invoicesTabNonce}-${invoicePresetFilter ?? 'default'}`}
                invoices={invoices}
                initialFilter={invoicePresetFilter ?? undefined}
                onSelectInvoiceDetail={(inv) => setSelectedInvoiceDetail(inv)}
                onRequestPayment={(inv) => setPaymentRequestInvoice(inv)}
              />
            </PortalDataBoundary>
          )}

          {activeTab === 'deliveries' && (
            <PortalDataBoundary
              isLoading={deliveriesQuery.isLoading}
              error={deliveriesQuery.error}
              isEmpty={!deliveriesQuery.isLoading && !deliveriesQuery.error && deliveries.length === 0}
              emptyTitle="No deliveries yet"
              emptyDescription="Shipment updates from the ERP dispatch system will appear here."
              onRetry={deliveriesQuery.refetch}
            >
              <DeliveriesTab deliveries={deliveries} />
            </PortalDataBoundary>
          )}

          {activeTab === 'orders' && (
            <PortalDataBoundary
              isLoading={combineQueryStates([catalogQuery, ordersQuery, orderRequestsQuery]).isLoading}
              error={combineQueryStates([catalogQuery, ordersQuery, orderRequestsQuery]).error}
              onRetry={() => {
                catalogQuery.refetch();
                ordersQuery.refetch();
                orderRequestsQuery.refetch();
              }}
            >
              <OrdersTab
                products={products}
                orders={orders}
                orderRequests={orderRequests}
                cartItems={cartItems}
                onAddToCart={handleAddToCart}
                onOpenCart={() => setIsCartOpen(true)}
                onReorder={(order) => handleReorderOrder(order.id)}
                onCancelOrderRequest={(request) => handleCancelOrderRequest(request.id)}
                onSelectProductDetail={(product) => setSelectedProductDetail(product)}
                onSelectOrderDetail={(order) => setSelectedOrderDetail(order)}
              />
            </PortalDataBoundary>
          )}

          {activeTab === 'quotes' && (
            <PortalDataBoundary
              isLoading={quotationsQuery.isLoading || quoteRequestsQuery.isLoading}
              error={quotationsQuery.error || quoteRequestsQuery.error}
              isEmpty={!quotationsQuery.isLoading && !quoteRequestsQuery.isLoading && !quotationsQuery.error && !quoteRequestsQuery.error && quotations.length === 0 && quoteRequests.length === 0}
              emptyTitle="No quotations yet"
              emptyDescription="Commercial quotations issued by the ERP will appear here."
              onRetry={() => {
                quoteRequestsQuery.refetch();
                quotationsQuery.refetch();
              }}
            >
              <QuotesTab
                quotes={quotations}
                quoteRequests={quoteRequests}
                onCreateQuote={() => setIsQuoteModalOpen(true)}
                onAcceptQuotation={handleAcceptQuotation}
                onRejectQuotation={handleRejectQuotation}
                onRequestRevision={handleRequestQuotationRevision}
                onSelectQuotation={(quotation) => setSelectedQuotationDetail(quotation)}
              />
            </PortalDataBoundary>
          )}

          {activeTab === 'statements' && (
            isStatementRangeInvalid ? (
              <div className="p-6 text-center text-sm text-rose-600 bg-white rounded-2xl border border-rose-200" role="alert">
                Invalid date range — start date must be on or before end date.
              </div>
            ) : (
            <PortalDataBoundary
              isLoading={combineQueryStates([customerQuery, statementsQuery]).isLoading}
              error={combineQueryStates([customerQuery, statementsQuery]).error}
              isEmpty={!statementsQuery.isLoading && !statementsQuery.error && statements.length === 0}
              emptyTitle="No statement entries"
              emptyDescription="Your account ledger will appear here."
              onRetry={() => {
                customerQuery.refetch();
                statementsQuery.refetch();
              }}
            >
              <StatementsTab
                profile={profile ?? ({} as AccountProfile)}
                statements={statements}
                dateFilter={statementDateFilter}
                startDate={statementStartDate}
                endDate={statementEndDate}
                onDateFilterChange={setStatementDateFilter}
                onStartDateChange={setStatementStartDate}
                onEndDateChange={setStatementEndDate}
                onOpenStatementPrintModal={() => setIsStatementPrintModalOpen(true)}
                onSelectEntryDetail={(entry) => setSelectedStatementEntryDetail(entry)}
              />
            </PortalDataBoundary>
            )
          )}

          {activeTab === 'referrals' && (
            <PortalDataBoundary
              isLoading={referralsQuery.isLoading}
              error={referralsQuery.error}
              onRetry={referralsQuery.refetch}
            >
              <ReferralsTab
                profile={profile ?? ({} as AccountProfile)}
                referrals={referrals}
                stats={referralStats}
                rewards={referralRewards}
                wallet={wallet}
                onCreateReferral={handleCreateReferral}
                onLoadTimeline={handleLoadReferralTimeline}
              />
            </PortalDataBoundary>
          )}

          {activeTab === 'account' && (
            <PortalDataBoundary
              isLoading={customerQuery.isLoading}
              error={customerQuery.error}
              onRetry={customerQuery.refetch}
            >
              <AccountTab
                profile={profile ?? ({} as AccountProfile)}
                onSignOut={handleSignOut}
                onRefreshProfile={customerQuery.refetch}
                isRefreshingProfile={customerQuery.isLoading}
              />
            </PortalDataBoundary>
          )}

          {activeTab === 'support' && (
            <PortalDataBoundary
              isLoading={supportTicketsQuery.isLoading || supportArticlesQuery.isLoading || companyContactQuery.isLoading}
              error={supportTicketsQuery.error || supportArticlesQuery.error || companyContactQuery.error}
              onRetry={() => {
                supportTicketsQuery.refetch();
                supportArticlesQuery.refetch();
                companyContactQuery.refetch();
              }}
            >
              <SupportTab
                tickets={supportTickets}
                articles={supportArticles}
                companyContact={companyContact}
                isLoadingTickets={supportTicketsQuery.isLoading}
                isLoadingArticles={supportArticlesQuery.isLoading}
                onCreateTicket={handleCreateSupportTicket}
              />
            </PortalDataBoundary>
          )}
        </main>

        {/* Bottom Navigation Dock (Visible on Mobile) */}
        <BottomNavigation
          activeTab={activeTab}
          setActiveTab={handleNavigateTab}
          unpaidCount={unpaidInvoices.length}
        />
      </div>

      {/* Modals & Overlays */}
      <InvoiceDetailModal
        invoice={selectedInvoiceDetail}
        onClose={() => setSelectedInvoiceDetail(null)}
        onRequestPayment={(inv) => {
          setSelectedInvoiceDetail(null);
          setPaymentRequestInvoice(inv);
        }}
        customer={profile}
      />

      <OrderDetailModal
        order={selectedOrderDetail}
        onClose={() => setSelectedOrderDetail(null)}
        onReorder={(order) => handleReorderOrder(order.id)}
        customer={profile}
      />

      <PaymentRequestModal
        invoice={paymentRequestInvoice}
        onClose={() => setPaymentRequestInvoice(null)}
        onSubmitPaymentRequest={handleSubmitPaymentRequest}
      />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={handleClearCart}
        onPlaceOrder={handlePlaceOrder}
      />

      <QuoteRequestModal
        isOpen={isQuoteModalOpen}
        onClose={() => setIsQuoteModalOpen(false)}
        onSubmitQuoteRequest={handleSubmitQuoteRequest}
        products={products}
        profile={profile}
      />

      <StatementPrintModal
        isOpen={isStatementPrintModalOpen}
        onClose={() => setIsStatementPrintModalOpen(false)}
        dateFilter={statementDateFilter}
        startDate={statementStartDate}
        endDate={statementEndDate}
      />

      <QuotationDetailModal
        quotation={selectedQuotationDetail}
        onClose={() => setSelectedQuotationDetail(null)}
        customer={profile}
        onAcceptQuotation={handleAcceptQuotation}
        onRejectQuotation={handleRejectQuotation}
        onRequestRevision={handleRequestQuotationRevision}
      />

      <NotificationDrawer
        isOpen={isNotificationDrawerOpen}
        onClose={() => setIsNotificationDrawerOpen(false)}
        notifications={notifications}
        onMarkAllAsRead={handleMarkAllNotificationsRead}
        onMarkAsRead={handleMarkNotificationRead}
        onNavigateTab={handleNavigateTab}
      />

      <ProductDetailModal
        product={selectedProductDetail}
        isOpen={Boolean(selectedProductDetail)}
        onClose={() => setSelectedProductDetail(null)}
        onAddToCart={(prod, qty) => {
          handleAddToCart(prod, qty);
          setIsCartOpen(true);
        }}
      />

      <StatementItemDetailModal
        entry={selectedStatementEntryDetail}
        profile={profile ?? ({} as AccountProfile)}
        invoices={invoices}
        payments={paymentsQuery.data ?? []}
        isOpen={Boolean(selectedStatementEntryDetail)}
        onClose={() => setSelectedStatementEntryDetail(null)}
      />

      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        products={products}
        invoices={invoices}
        orders={orders}
        deliveries={deliveries}
        onNavigateTab={handleNavigateTab}
        onSelectInvoiceDetail={(inv) => setSelectedInvoiceDetail(inv)}
        onSelectProductDetail={(prod) => setSelectedProductDetail(prod)}
        onAddToCart={handleAddToCart}
      />

      {/* PWA installer chip (hidden while the cart bar owns the bottom edge). */}
      <PwaInstallChip suppressed={cartCount > 0} />
    </div>
  );

  const isVerificationPath = /^\/(verify\/invoice|verify\/(receipt|quotation|sales-order|purchase-order|delivery-note|supplier-payment|statement))/.test(path.split('?')[0]);

  if (isVerificationPath) {
    return <DocumentVerify />;
  }

  return (
    <>
      {isSplashVisible && (
        <BrandSplash onReady={() => setShowBrandSplash(false)} duration={4000} />
      )}
      <RouteGuard
        path={path}
        navigate={navigate}
        isAuthenticated={auth.isAuthenticated}
        isRestoring={auth.isRestoring}
        defaultPath={defaultPath}
        onUnauthenticated={renderUnauthenticated}
      >
        {renderPortal()}
      </RouteGuard>
    </>
  );
}

/**
 * Public entry — mounts the auth context ABOVE the shell so the route guard
 * and the login/activate/forgot-password screens share ONE session state.
 * After a successful login the provider flips to authenticated and the guard
 * swaps the login screen for the portal immediately.
 */
export function CustomerPortalApp(props: CustomerPortalAppProps) {
  return (
    <CustomerAuthProvider>
      <DarkModeProvider>
        <div className="relative">
          <DevModeBanner />
          <CustomerPortalShell {...props} />
        </div>
      </DarkModeProvider>
    </CustomerAuthProvider>
  );
}

export default CustomerPortalApp;
