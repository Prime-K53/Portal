import React, { useState } from 'react';
import { useAuth } from './hooks/useAuth';
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
  usePortalEvents,
  useQuotationsData,
  useReferralsData,
  useStatementsData,
  useUnreadNotificationCount,
} from './hooks/usePortalData';
import { portalService, isReferralsBlockedError } from './services';
import { generateIdempotencyKey } from './utils/idempotency';
import { ROUTES, pathForTab, tabFromPath } from './router/routes';
import { combineQueryStates, PortalDataBoundary } from './components/state/PortalDataBoundary';
import {
  AccountProfile,
  CartItem,
  DeliveryNotification,
  Invoice,
  OrderRequest,
  PaymentRequest,
  Product,
  QuoteRequestItem,
  StatementEntry,
  TabType,
} from './types';

// Auth Component
import { AuthPage } from './components/AuthPage';

// Layout & Navigation
import { BottomNavigation } from './components/BottomNavigation';
import { MobileHeader } from './components/MobileHeader';
import { NotificationDrawer } from './components/NotificationDrawer';
import { Sidebar } from './components/Sidebar';

// Modals
import { CartDrawer } from './components/modals/CartDrawer';
import { CommandPaletteModal } from './components/modals/CommandPaletteModal';
import { InvoiceDetailModal } from './components/modals/InvoiceDetailModal';
import { PaymentModal } from './components/modals/PaymentModal';
import { PaymentRequestModal } from './components/modals/PaymentRequestModal';
import { ProductDetailModal } from './components/modals/ProductDetailModal';
import { QuoteRequestModal } from './components/modals/QuoteRequestModal';
import { StatementItemDetailModal } from './components/modals/StatementItemDetailModal';
import { StatementPrintModal } from './components/modals/StatementPrintModal';

// Tabs
import { AccountTab } from './components/tabs/AccountTab';
import { DashboardTab } from './components/tabs/DashboardTab';
import { DeliveriesTab } from './components/tabs/DeliveriesTab';
import { InvoicesTab } from './components/tabs/InvoicesTab';
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

export function CustomerPortalApp({
  initialTab = 'dashboard',
  initialProfileData,
  className = '',
}: CustomerPortalAppProps) {
  const auth = useAuth();
  const { path, navigate } = useHashRoute();

  // ── Portal data (all reads flow through the PortalService boundary) ───────
  const customerQuery = useCustomerData(initialProfileData);
  const invoicesQuery = useInvoicesData();
  const deliveriesQuery = useDeliveriesData();
  const ordersQuery = useOrdersData();
  const orderRequestsQuery = useOrderRequestsData();
  const quotationsQuery = useQuotationsData();
  const statementsQuery = useStatementsData();
  const referralsQuery = useReferralsData();
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
  const statements = statementsQuery.data ?? [];
  const referrals = referralsQuery.data ?? [];
  const products = catalogQuery.data ?? [];
  const notifications = notificationsQuery.data ?? [];
  const unreadNotificationCount = unreadQuery.data ?? 0;
  const ads = adsQuery.data ?? [];

  // ── UI state (no business data lives here) ────────────────────────────────
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [selectedInvoiceDetail, setSelectedInvoiceDetail] = useState<Invoice | null>(null);
  const [selectedProductDetail, setSelectedProductDetail] = useState<Product | null>(null);
  const [selectedStatementEntryDetail, setSelectedStatementEntryDetail] = useState<StatementEntry | null>(null);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentRequestInvoice, setPaymentRequestInvoice] = useState<Invoice | null>(null);
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

  // ── Computed values ───────────────────────────────────────────────────────
  const unpaidInvoices = invoices.filter(
    (i) => i.status === 'unpaid' || i.status === 'overdue' || i.status === 'partially_paid'
  );
  const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + i.amountRemaining, 0);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

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

  // ── Invoice selection ─────────────────────────────────────────────────────
  const handleToggleInvoiceSelection = (id: string) => {
    setSelectedInvoiceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllUnpaid = () => {
    setSelectedInvoiceIds(unpaidInvoices.map((i) => i.id));
  };

  const handleClearInvoiceSelection = () => {
    setSelectedInvoiceIds([]);
  };

  const handlePaySingleInvoice = (invoiceId: string) => {
    setSelectedInvoiceIds([invoiceId]);
    setIsPaymentModalOpen(true);
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
  const handleSubmitPaymentRequest = (invoiceId: string, requestedAmount: number, note: string): Promise<PaymentRequest> => {
    return runAction(() => portalService.createPaymentRequest({ invoiceId, requestedAmount, note })).then((created) => {
      // Phase 9: refresh ERP state. A request does NOT change invoice
      // financials — this refetch only surfaces real ERP changes.
      invoicesQuery.refetch();
      statementsQuery.refetch();
      customerQuery.refetch();
      return created;
    });
  };

  // ── Payment (records each selected invoice in the ERP ledger) ─────────────
  const handleCompletePayment = async (paidIds: string[], paymentMethod: string): Promise<string> => {
    const selected = invoices.filter((inv) => paidIds.includes(inv.id));
    let lastPaymentId = '';
    for (const inv of selected) {
      const result = await runAction(() =>
        portalService.submitPayment({
          invoiceId: inv.id,
          amount: inv.amountRemaining,
          paymentMethod,
        })
      );
      if (result) lastPaymentId = result.paymentId;
    }
    setSelectedInvoiceIds([]);
    invoicesQuery.refetch();
    statementsQuery.refetch();
    customerQuery.refetch();
    return lastPaymentId || 'ERP payment recorded';
  };

  // ── Cart ──────────────────────────────────────────────────────────────────
  const handleAddToCart = (product: Product, quantity: number) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + quantity } : item
        );
      }
      return [...prev, { product, quantity }];
    });
  };

  const handleUpdateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveCartItem(productId);
      return;
    }
    setCartItems((prev) =>
      prev.map((item) => (item.product.id === productId ? { ...item, quantity } : item))
    );
  };

  const handleRemoveCartItem = (productId: string) => {
    setCartItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  /**
   * Submits the cart as an order REQUEST (POST /portal/requests, requestType
   * 'order'). The ERP re-prices lines server-side and returns the authoritative
   * request (ODR-...). Resolves with the created request — the official Sales
   * Order is created later by the ERP, never by Sasa.
   *
   * `idempotencyKey` is generated once per logical submission attempt by the
   * CartDrawer and reused when the attempt is retried; it is sent as the
   * Idempotency-Key header so the ERP replays its stored response instead of
   * creating a duplicate request.
   */
  const handlePlaceOrder = async (
    deliveryAddress: string,
    paymentTerms: string,
    requestedDeliveryDate?: string,
    promotionCode?: string,
    idempotencyKey?: string
  ): Promise<OrderRequest> => {
    const totalAmount = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    return runAction(async () => {
      const created = await portalService.createOrder(
        {
          items: cartItems.map((ci) => ({
            productId: ci.product.id,
            productName: ci.product.name,
            quantity: ci.quantity,
            unitPrice: ci.product.price,
            total: ci.product.price * ci.quantity,
          })),
          deliveryAddress,
          paymentTerms,
          requestedDeliveryDate,
          promotionCode,
          totalAmount,
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
      quotationsQuery.refetch();
    });
  };

  const handleAcceptQuotation = (quotationId: string) => {
    runAction(async () => {
      await portalService.acceptQuotation(quotationId);
      quotationsQuery.refetch();
    });
  };

  const handleRejectQuotation = (quotationId: string) => {
    runAction(async () => {
      await portalService.rejectQuotation(quotationId);
      quotationsQuery.refetch();
    });
  };

  const handleRequestQuotationRevision = (quotationId: string) => {
    runAction(async () => {
      await portalService.requestQuotationRevision(quotationId);
      quotationsQuery.refetch();
    });
  };

  // ── Referrals ─────────────────────────────────────────────────────────────
  const handleSendInvite = (refereeName: string, refereeCompany: string, email: string) => {
    runAction(async () => {
      await portalService.sendReferralInvite({ refereeName, refereeCompany, email });
      referralsQuery.refetch();
    });
  };

  const handleClaimReward = (referralId: string) => {
    runAction(async () => {
      await portalService.claimReferralReward(referralId);
      referralsQuery.refetch();
      statementsQuery.refetch();
      customerQuery.refetch();
    });
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

  const renderUnauthenticated = () => (
    <AuthPage
      onLogin={auth.login}
      onVerifyTwoFactor={auth.verifyTwoFactor}
      onRequestPasswordReset={auth.requestPasswordReset}
    />
  );

  const renderPortal = () => (
    <div className={`min-h-screen bg-slate-100/70 text-slate-900 font-sans selection:bg-slate-900 selection:text-white flex ${className}`}>
      {/* Sidebar Navigation for Desktop (hidden on mobile) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleNavigateTab}
        profile={profile}
        unpaidCount={unpaidInvoices.length}
        unpaidTotal={unpaidTotal}
        deliveryAlertCount={unreadNotificationCount}
        cartCount={cartCount}
        onOpenPaymentModal={() => setIsPaymentModalOpen(true)}
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
            unreadCount={unreadNotificationCount}
            onOpenNotifications={() => setIsNotificationDrawerOpen(true)}
            onOpenAccount={() => handleNavigateTab('account')}
            onOpenPaymentModal={() => setIsPaymentModalOpen(true)}
            unpaidTotal={unpaidTotal}
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
              isLoading={combineQueryStates([customerQuery, invoicesQuery, deliveriesQuery, ordersQuery, quotationsQuery, statementsQuery, adsQuery]).isLoading}
              error={combineQueryStates([customerQuery, invoicesQuery, deliveriesQuery, ordersQuery, quotationsQuery, statementsQuery, adsQuery]).error}
              onRetry={() => {
                customerQuery.refetch();
                invoicesQuery.refetch();
                deliveriesQuery.refetch();
                ordersQuery.refetch();
                quotationsQuery.refetch();
                statementsQuery.refetch();
                adsQuery.refetch();
              }}
            >
              <DashboardTab
                profile={profile ?? ({} as AccountProfile)}
                invoices={invoices}
                deliveries={deliveries}
                statements={statements}
                ads={ads}
                onNavigateTab={handleNavigateTab}
                onOpenPaymentModal={() => setIsPaymentModalOpen(true)}
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
                selectedInvoiceIds={selectedInvoiceIds}
                onToggleInvoiceSelection={handleToggleInvoiceSelection}
                onSelectAllUnpaid={handleSelectAllUnpaid}
                onClearSelection={handleClearInvoiceSelection}
                onOpenPaymentModal={() => setIsPaymentModalOpen(true)}
                onSelectInvoiceDetail={(inv) => setSelectedInvoiceDetail(inv)}
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
              />
            </PortalDataBoundary>
          )}

          {activeTab === 'quotes' && (
            <PortalDataBoundary
              isLoading={quotationsQuery.isLoading}
              error={quotationsQuery.error}
              isEmpty={!quotationsQuery.isLoading && !quotationsQuery.error && quotations.length === 0}
              emptyTitle="No quotations yet"
              emptyDescription="Commercial quotations issued by the ERP will appear here."
              onRetry={quotationsQuery.refetch}
            >
              <QuotesTab
                quotes={quotations}
                onCreateQuote={() => setIsQuoteModalOpen(true)}
                onAcceptQuotation={handleAcceptQuotation}
                onRejectQuotation={handleRejectQuotation}
                onRequestRevision={handleRequestQuotationRevision}
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
            isReferralsBlockedError(referralsQuery.error) ? (
              // Intentional blocked state: the referral feature is not wired to
              // the ERP yet — render its unavailable panel, not a generic error.
              <ReferralsTab
                profile={profile ?? ({} as AccountProfile)}
                referrals={[]}
                onSendInvite={handleSendInvite}
                onClaimReward={handleClaimReward}
              />
            ) : (
              <PortalDataBoundary
                isLoading={referralsQuery.isLoading}
                error={referralsQuery.error}
                isEmpty={!referralsQuery.isLoading && !referralsQuery.error && referrals.length === 0}
                emptyTitle="No referrals yet"
                emptyDescription="Invitations you send will appear here."
                onRetry={referralsQuery.refetch}
              >
                <ReferralsTab
                  profile={profile ?? ({} as AccountProfile)}
                  referrals={referrals}
                  onSendInvite={handleSendInvite}
                  onClaimReward={handleClaimReward}
                />
              </PortalDataBoundary>
            )
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
          deliveryAlertCount={unreadNotificationCount}
          cartCount={cartCount}
        />
      </div>

      {/* Modals & Overlays */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        invoices={invoices}
        selectedInvoiceIds={selectedInvoiceIds}
        onToggleInvoiceSelection={handleToggleInvoiceSelection}
        onCompletePayment={handleCompletePayment}
      />

      <InvoiceDetailModal
        invoice={selectedInvoiceDetail}
        onClose={() => setSelectedInvoiceDetail(null)}
        onPaySingleInvoice={handlePaySingleInvoice}
        onRequestPayment={(inv) => setPaymentRequestInvoice(inv)}
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
      />

      <StatementPrintModal
        isOpen={isStatementPrintModalOpen}
        onClose={() => setIsStatementPrintModalOpen(false)}
        profile={profile ?? ({} as AccountProfile)}
        statements={statements}
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

export default CustomerPortalApp;
