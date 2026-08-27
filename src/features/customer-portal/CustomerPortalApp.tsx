import React, { useEffect, useState } from 'react';
import { useHashRoute } from './router/useHashRoute';
import { RouteGuard } from './router/RouteGuard';
import {
  useAdsData,
  useCatalogData,
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
  useUnreadNotificationCount,
  useWalletData,
} from './hooks/usePortalData';
import { portalService } from './services';
import { ROUTES, pathForTab, tabFromPath } from './router/routes';
import { combineQueryStates, PortalDataBoundary } from './components/state/PortalDataBoundary';
import { generateIdempotencyKey } from './utils/idempotency';
import {
  AccountProfile,
  CartItem,
  DeliveryNotification,
  Invoice,
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

// Layout & Navigation
import { BottomNavigation } from './components/BottomNavigation';
import { MobileHeader } from './components/MobileHeader';
import { NotificationDrawer } from './components/NotificationDrawer';
import { Sidebar } from './components/Sidebar';
import { PwaInstallChip } from './components/PwaInstallChip';

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

  // ── Portal data (all reads flow through the PortalService boundary) ───────
  const customerQuery = useCustomerData(initialProfileData);
  const invoicesQuery = useInvoicesData();
  const deliveriesQuery = useDeliveriesData();
  const ordersQuery = useOrdersData();
  const orderRequestsQuery = useOrderRequestsData();
  const quotationsQuery = useQuotationsData();
  const quoteRequestsQuery = useQuoteRequestsData();
  const statementsQuery = useStatementsData();
  const paymentsQuery = usePaymentsData();
  const referralsQuery = useReferralsData();
  const referralStatsQuery = useReferralStatsData();
  const referralRewardsQuery = useReferralRewardsData();
  const walletQuery = useWalletData();
  const catalogQuery = useCatalogData();
  const notificationsQuery = useNotificationsData();
  const unreadQuery = useUnreadNotificationCount();
  const adsQuery = useAdsData();

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
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Routing ───────────────────────────────────────────────────────────────
  const defaultPath = pathForTab(initialTab);
  const activeTab: TabType = tabFromPath(path) ?? tabFromPath(defaultPath) ?? 'dashboard';

  const handleNavigateTab = (tab: TabType) => navigate(pathForTab(tab));

  // Consume the KPI preset once the user leaves the invoices tab so the next
  // plain visit starts from the default filter.
  useEffect(() => {
    if (activeTab !== 'invoices') setInvoicePresetFilter(null);
  }, [activeTab]);

  // ── Computed values ───────────────────────────────────────────────────────
  const unpaidInvoices = invoices.filter(
    (i) => i.status === 'unpaid' || i.status === 'overdue' || i.status === 'partially_paid'
  );
  const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + i.amountRemaining, 0);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // ── Notification badge ────────────────────────────────────────────────────
  // The bell consolidates ERP unread items PLUS pending Quick Action work
  // (open invoices / shipments to track / statement entries). Opening the
  // drawer marks everything seen: ERP unread is cleared via read-all and the
  // Quick Action portion latches off until new unread notifications arrive.
  const [notificationsSeen, setNotificationsSeen] = useState(false);

  const handleOpenNotifications = () => {
    setIsNotificationDrawerOpen(true);
    if (!notificationsSeen) {
      setNotificationsSeen(true);
      portalService
        .markAllNotificationsRead()
        .then(() => {
          notificationsQuery.refetch();
          unreadQuery.refetch();
        })
        .catch(() => {
          // Badge clearing is cosmetic — never block the drawer.
          notificationsQuery.refetch();
          unreadQuery.refetch();
        });
    }
  };

  const notificationBadgeCount =
    unreadNotificationCount + (notificationsSeen ? 0 : unpaidInvoices.length + deliveries.length + statements.length);

  // ── Action helpers ────────────────────────────────────────────────────────
  const runAction = async <T,>(action: () => Promise<T>): Promise<T> => {
    setActionError(null);
    try {
      return await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The operation could not be completed.');
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
    await runAction(async () => {
      const created = await portalService.createOrder(
        {
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
        },
        idempotencyKey ?? generateIdempotencyKey()
      );
      ordersQuery.refetch();
      orderRequestsQuery.refetch();
      invoicesQuery.refetch();
      statementsQuery.refetch();
      deliveriesQuery.refetch();
      customerQuery.refetch();
      setCartItems([]);
      return created;
    });
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
    runAction(async () => {
      await portalService.acceptQuotation(quotationId);
      quoteRequestsQuery.refetch();
      quotationsQuery.refetch();
    });
  };

  const handleRejectQuotation = (quotationId: string) => {
    runAction(async () => {
      await portalService.rejectQuotation(quotationId);
      quoteRequestsQuery.refetch();
      quotationsQuery.refetch();
    });
  };

  const handleRequestQuotationRevision = (quotationId: string) => {
    runAction(async () => {
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
      default:
        return <CustomerLogin />;
    }
  };

  const renderPortal = () => (
    <div className={`min-h-screen bg-slate-100/70 text-slate-900 font-sans selection:bg-slate-900 selection:text-white flex ${className}`}>
      {/* Sidebar Navigation for Desktop (hidden on mobile) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleNavigateTab}
        profile={profile}
        unpaidCount={unpaidInvoices.length}
        unpaidTotal={unpaidTotal}
        deliveryAlertCount={notificationBadgeCount}
        cartCount={cartCount}
        onOpenPaymentModal={() => handleNavigateTab('invoices')}
        onOpenQuoteModal={() => setIsQuoteModalOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onSignOut={handleSignOut}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen bg-slate-50/50">
        {/* Top Navigation Bar Header - Only visible on Dashboard */}
        {activeTab === 'dashboard' && (
          <MobileHeader
            profile={profile}
            unreadCount={notificationBadgeCount}
            onOpenNotifications={handleOpenNotifications}
            onOpenAccount={() => handleNavigateTab('account')}
            cartCount={cartCount}
            onOpenCart={() => setIsCartOpen(true)}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          />
        )}

        {/* Action Error Banner (real API failures are never hidden) */}
        {actionError && (
          <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4">
            <div className="flex items-start justify-between gap-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium">
              <span className="leading-relaxed">{actionError}</span>
              <button
                type="button"
                onClick={() => setActionError(null)}
                className="text-rose-400 hover:text-rose-600 font-black shrink-0"
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Main Content View */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'dashboard' && (
            <PortalDataBoundary
              isLoading={combineQueryStates([customerQuery, invoicesQuery, deliveriesQuery, ordersQuery, quotationsQuery, quoteRequestsQuery, statementsQuery, adsQuery]).isLoading}
              error={combineQueryStates([customerQuery, invoicesQuery, deliveriesQuery, ordersQuery, quotationsQuery, quoteRequestsQuery, statementsQuery, adsQuery]).error}
              onRetry={() => {
                customerQuery.refetch();
                invoicesQuery.refetch();
                deliveriesQuery.refetch();
                ordersQuery.refetch();
                quotationsQuery.refetch();
                quoteRequestsQuery.refetch();
                statementsQuery.refetch();
                adsQuery.refetch();
              }}
            >
              <DashboardTab
                profile={profile ?? ({} as AccountProfile)}
                invoices={invoices}
                orders={orders}
                deliveries={deliveries}
                statements={statements}
                ads={ads}
                onNavigateTab={handleNavigateTab}
                onOpenPaymentModal={() => handleNavigateTab('invoices')}
                onNavigateInvoices={(filter) => {
                  setInvoicePresetFilter(filter);
                  handleNavigateTab('invoices');
                }}
              />
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
                onOpenStatementPrintModal={() => setIsStatementPrintModalOpen(true)}
                onSelectEntryDetail={(entry) => setSelectedStatementEntryDetail(entry)}
              />
            </PortalDataBoundary>
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
              <AccountTab profile={profile ?? ({} as AccountProfile)} onSignOut={handleSignOut} />
            </PortalDataBoundary>
          )}
        </main>

        {/* Bottom Navigation Dock (Visible on Mobile) */}
        <BottomNavigation
          activeTab={activeTab}
          setActiveTab={handleNavigateTab}
          unpaidCount={unpaidInvoices.length}
          deliveryAlertCount={notificationBadgeCount}
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
      />

      <OrderDetailModal
        order={selectedOrderDetail}
        onClose={() => setSelectedOrderDetail(null)}
        onReorder={(order) => handleReorderOrder(order.id)}
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
      />

      <StatementPrintModal
        isOpen={isStatementPrintModalOpen}
        onClose={() => setIsStatementPrintModalOpen(false)}
        profile={profile ?? ({} as AccountProfile)}
        statements={statements}
      />

      <QuotationDetailModal
        quotation={selectedQuotationDetail}
        onClose={() => setSelectedQuotationDetail(null)}
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

  return (
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
      <CustomerPortalShell {...props} />
    </CustomerAuthProvider>
  );
}

export default CustomerPortalApp;
