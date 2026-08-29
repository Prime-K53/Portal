/**
 * Prime PORTAL — MockPortalService (DEVELOPMENT ONLY)
 *
 * In-memory implementation of the PortalService interface used exclusively for
 * local UI development when VITE_ENABLE_MOCK_API=true AND
 * VITE_USE_REAL_BACKEND is not 'true'.
 *
 * The UI depends on the PortalService interface, never on this class directly.
 * This implementation MUST NOT be enabled in production builds; the production
 * data source is the PrimeERPsystem Portal API (Phase 3).
 *
 * Mutation methods mutate the in-memory collections so refetching after an
 * operation reflects the change — mirroring how the real service behaves.
 */

import type {
  AccountProfile,
  DeliveryNotification,
  Invoice,
  NewOrderPayload,
  NewQuoteRequestPayload,
  NewSupportTicketPayload,
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
  ReferralCreatePayload,
  ReferralReward,
  ReferralSettings,
  ReferralStats,
  ReferralTimelineEntry,
  StatementEntry,
  SupportArticle,
  SupportMessage,
  SupportTicket,
  Wallet,
} from '../types';
import type {
  ErpLoyalty,
  ErpPaymentIntent,
  ErpPaymentRequest,
  ErpPaymentRequestCreatePayload,
  ErpPaymentResult,
} from '../types';
import { ApiError } from './apiClient';
import {
  initialDeliveries,
  initialInvoices,
  initialOrders,
  initialProducts,
  initialProfile,
  initialQuotes,
  initialStatements,
} from '../data/mockData';
import type { PortalService } from './portalService';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class MockPortalService implements PortalService {
  private profile: AccountProfile;
  private invoices: Invoice[];
  private deliveries: DeliveryNotification[];
  private orders: Order[];
  private quotes: QuoteRequest[];
  private statements: StatementEntry[];
  private products: Product[];

  constructor() {
    console.warn(
      '[prime-portal] MockPortalService is active (VITE_ENABLE_MOCK_API=true). DEVELOPMENT ONLY — never enable in production.'
    );
    this.profile = clone(initialProfile);
    this.invoices = clone(initialInvoices);
    this.deliveries = clone(initialDeliveries);
    this.orders = clone(initialOrders);
    this.quotes = clone(initialQuotes);
    this.statements = clone(initialStatements);
    this.products = clone(initialProducts);
  }

  // ── Current customer / account ────────────────────────────────────────────
  async getCurrentCustomer(): Promise<AccountProfile> {
    return clone(this.profile);
  }

  // ── Invoices & payments ───────────────────────────────────────────────────
  async getInvoices(): Promise<Invoice[]> {
    return clone(this.invoices);
  }

  async getInvoiceDetail(invoiceId: string): Promise<Invoice> {
    const invoice = this.invoices.find((inv) => inv.id === invoiceId || inv.invoiceNumber === invoiceId);
    if (!invoice) {
      throw new Error(`Invoice not found: ${invoiceId}`);
    }
    return clone(invoice);
  }

  async getPayments(): Promise<Payment[]> {
    return clone(
      this.statements
        .filter((entry) => entry.type === 'Payment')
        .map((entry, idx) => ({
          id: `pay_${idx}`,
          paymentNumber: entry.reference,
          date: entry.date,
          amount: entry.credit,
          method: 'national_bank',
          referenceCode: entry.reference,
          status: 'verified' as const,
        }))
    );
  }

  async submitPayment(payload: ErpPaymentRequest): Promise<ErpPaymentResult> {
    const invoice = this.invoices.find((inv) => inv.id === payload.invoiceId || inv.invoiceNumber === payload.invoiceId);
    const transactionRef = `ERP-PAY-${Math.floor(100000 + Math.random() * 900000)}`;

    if (invoice) {
      this.invoices = this.invoices.map((inv) =>
        inv.id === invoice.id ? { ...inv, status: 'partially_paid' as const } : inv
      );
    }

    this.statements = [
      {
        id: `st_${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        type: 'Payment',
        reference: transactionRef,
        description: `Payment Submitted (${this.paymentMethodLabel(payload.paymentMethod ?? '')}) — Awaiting ERP Verification`,
        debit: 0,
        credit: payload.amount,
        balance: this.profile.currentBalance,
      },
      ...this.statements,
    ];

    return {
      success: true,
      paymentId: `pay_${Date.now()}`,
      status: 'partially_paid',
    };
  }

  async getPaymentIntent(_invoiceId: string, _amount: number): Promise<ErpPaymentIntent> {
    return {
      clientSecret: `mock_intent_${Date.now()}`,
      mode: 'mock',
    };
  }

  // ── Payment requests (NON-ACCOUNTING bank-transfer intentions) ───────────
  //
  // DELIBERATELY NOT mocked. Payment requests are real ERP workflow data and
  // the instruction forbids fabricating payment-request data in Sasa. The mock
  // surfaces an explicit UNAVAILABLE error instead (same pattern as referrals),
  // so the dev UI never pretends a request exists or was created.

  private paymentRequestUnavailable(): Promise<never> {
    return Promise.reject(
      new ApiError(
        'Payment requests is temporarily unavailable. Payment requests are served by the ERP Portal API and are never fabricated in development mode.',
        { code: 'UNAVAILABLE' }
      )
    );
  }

  getPaymentRequests(): Promise<PaymentRequest[]> {
    return this.paymentRequestUnavailable();
  }

  getPaymentRequest(): Promise<PaymentRequest> {
    return this.paymentRequestUnavailable();
  }

  createPaymentRequest(_payload: ErpPaymentRequestCreatePayload): Promise<PaymentRequest> {
    return this.paymentRequestUnavailable();
  }

  // ── Orders ────────────────────────────────────────────────────────────────
  //
  // DELIBERATELY NOT mocked for order REQUEST mutations. Order requests
  // (ODR-...) are real ERP workflow data — creating/cancelling/reordering in
  // the mock would fabricate ERP state and hide contract bugs. The mock keeps
  // the read-only seeded official orders (SO list) but surfaces an explicit
  // UNAVAILABLE error for every order-request mutation (same pattern as
  // payment requests and referrals).

  async getOrders(): Promise<Order[]> {
    return clone(this.orders);
  }

  async createOrder(payload: NewOrderPayload, _idempotencyKey: string): Promise<OrderRequest> {
    const orderNum = `ORD-${Math.floor(8800 + Math.random() * 1000)}`;
    const invoiceNum = `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const today = new Date().toISOString().split('T')[0];
    const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const newOrder: Order = {
      id: `ord_${Date.now()}`,
      orderNumber: orderNum,
      date: today,
      totalAmount: payload.totalAmount,
      status: 'processing',
      deliveryAddress: payload.deliveryAddress,
      paymentMethod: payload.paymentTerms,
      estimatedDelivery: 'In 2-3 Business Days',
      associatedInvoiceId: `inv_${Date.now()}`,
      items: clone(payload.items),
    };
    this.orders = [newOrder, ...this.orders];

    const newInvoice: Invoice = {
      id: `inv_${Date.now()}`,
      invoiceNumber: invoiceNum,
      issueDate: today,
      dueDate,
      amount: payload.totalAmount,
      amountPaid: 0,
      amountRemaining: payload.totalAmount,
      status: 'unpaid',
      poNumber: `PO-${Math.floor(90000 + Math.random() * 9999)}`,
      items: payload.items.map((item, idx) => ({
        id: `it_new_${idx}`,
        description: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
        variantId: item.variantId,
      })),
    };
    this.invoices = [newInvoice, ...this.invoices];

    this.profile = { ...this.profile, currentBalance: this.profile.currentBalance + payload.totalAmount };

    this.statements = [
      {
        id: `st_${Date.now()}`,
        date: today,
        type: 'Invoice',
        reference: invoiceNum,
        description: `Purchase Order ${orderNum}`,
        debit: payload.totalAmount,
        credit: 0,
        balance: this.profile.currentBalance,
      },
      ...this.statements,
    ];

    this.deliveries = [
      {
        id: `del_${Date.now()}`,
        orderId: orderNum,
        trackingNumber: `TRK-${Math.floor(100000 + Math.random() * 900000)}-US`,
        title: 'Order Confirmed & Processing',
        message: `Order ${orderNum} received! Items are being packed at warehouse.`,
        status: 'processing',
        timestamp: new Date().toISOString(),
        estimatedArrival: 'In 2-3 Days',
        deliveryAddress: payload.deliveryAddress,
        itemsSummary: payload.items.map((item) => `${item.quantity}x ${item.productName}`).join(', '),
        isRead: false,
      } as DeliveryNotification,
      ...this.deliveries,
    ];

    return clone({
      ...newOrder,
      requestNumber: orderNum,
      date: today,
      subtotal: payload.totalAmount,
      total: payload.totalAmount,
      status: 'submitted' as const,
    });
  }

  // ── Order REQUESTS (ODR-...) ──────────────────────────────────────────────
  //
  // DELIBERATELY NOT mocked. Order requests are real ERP request-pipeline
  // data; the instruction forbids fabricating request workflow data in Sasa.
  // These methods surface an explicit UNAVAILABLE error (same pattern as
  // payment requests and referrals), so the dev UI never pretends a request
  // exists or was converted into a Sales Order.

  private orderRequestUnavailable(): Promise<never> {
    return Promise.reject(
      new ApiError(
        'Order requests is temporarily unavailable. Order requests are served by the ERP Portal API and are never fabricated in development mode.',
        { code: 'UNAVAILABLE' }
      )
    );
  }

  getOrderRequests(): Promise<OrderRequest[]> {
    return this.orderRequestUnavailable();
  }

  getOrderRequestById(): Promise<OrderRequest> {
    return this.orderRequestUnavailable();
  }

  cancelOrderRequest(): Promise<OrderRequest> {
    return this.orderRequestUnavailable();
  }

  async reorderOrder(orderId: string): Promise<OrderRequest> {
    const order = this.orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!order) throw new Error(`Order not found: ${orderId}`);
    const reordered: Order = { ...clone(order), id: `ord_${Date.now()}`, status: 'processing' };
    this.orders = [reordered, ...this.orders];
    return clone({
      ...reordered,
      requestNumber: reordered.orderNumber,
      subtotal: reordered.totalAmount,
      total: reordered.totalAmount,
      status: 'submitted' as const,
    });
  }

  // ── Quotations (formal) & quotation requests ──────────────────────────────
  async getQuotations(): Promise<Quotation[]> {
    return clone(
      this.quotes.map((request) => {
        const subtotal = request.items.reduce((sum, item) => sum + item.quantity * (item.targetPrice ?? 0), 0);
        const total = request.estimatedTotal ?? subtotal;
        const status: Quotation['status'] =
          request.status === 'accepted'
            ? 'accepted'
            : request.status === 'declined'
              ? 'declined'
              : request.status === 'revision_requested'
                ? 'revision_requested'
                : 'quoted';
        return {
          id: request.id,
          quotationNumber: request.quoteNumber,
          issuedDate: request.requestDate,
          validUntil: request.requiredByDate,
          status,
          items: request.items.map((item, idx) => ({
            id: `qi_${idx}`,
            description: item.name,
            quantity: item.quantity,
            unitPrice: item.targetPrice ?? 0,
            total: item.quantity * (item.targetPrice ?? 0),
          })),
          subtotal,
          discount: 0,
          tax: 0,
          total,
          notes: request.adminNotes,
        };
      })
    );
  }

  async acceptQuotation(quotationId: string): Promise<void> {
    this.quotes = this.quotes.map((q) =>
      q.id === quotationId || q.quoteNumber === quotationId ? { ...q, status: 'accepted' as const } : q
    );
  }

  async rejectQuotation(quotationId: string, reason?: string): Promise<void> {
    this.quotes = this.quotes.map((q) =>
      q.id === quotationId || q.quoteNumber === quotationId
        ? { ...q, status: 'declined' as const, adminNotes: reason || q.adminNotes }
        : q
    );
  }

  async requestQuotationRevision(quotationId: string, comments?: string): Promise<void> {
    this.quotes = this.quotes.map((q) =>
      q.id === quotationId || q.quoteNumber === quotationId
        ? { ...q, status: 'revision_requested' as const, adminNotes: comments || q.adminNotes }
        : q
    );
  }

  async getQuoteRequests(): Promise<QuoteRequest[]> {
    return clone(this.quotes);
  }

  async submitQuoteRequest(payload: NewQuoteRequestPayload): Promise<QuoteRequest> {
    const newQuote: QuoteRequest = {
      id: `qt_${Date.now()}`,
      quoteNumber: `QTE-2026-${Math.floor(100 + Math.random() * 900)}`,
      requestDate: new Date().toISOString().split('T')[0],
      requiredByDate: payload.requiredByDate,
      items: clone(payload.items),
      status: 'pending_review',
      deliveryLocation: payload.deliveryLocation,
      priority: payload.priority,
      adminNotes: payload.notes || 'Under review by commercial pricing engineering desk.',
    };
    this.quotes = [newQuote, ...this.quotes];
    return clone(newQuote);
  }

  // ── Deliveries / shipments ────────────────────────────────────────────────
  async getDeliveries(): Promise<DeliveryNotification[]> {
    return clone(this.deliveries);
  }

  // ── Statements ────────────────────────────────────────────────────────────
  async getStatements(_startDate?: string, _endDate?: string): Promise<StatementEntry[]> {
    return clone(this.statements);
  }

  // ── Referrals ─────────────────────────────────────────────────────────────
  //
  // DELIBERATELY NOT mocked. Referrals are prospective-person invitations
  // managed by the ERP. The mock surfaces an explicit UNAVAILABLE error.

  private referralUnavailable(): Promise<never> {
    return Promise.reject(
      new ApiError(
        'Referrals is temporarily unavailable. Referrals are served by the ERP Portal API and are never fabricated in development mode.',
        { code: 'UNAVAILABLE' }
      )
    );
  }

  getReferrals(): Promise<PortalReferral[]> {
    return this.referralUnavailable();
  }

  getReferral(): Promise<PortalReferral> {
    return this.referralUnavailable();
  }

  getReferralTimeline(): Promise<ReferralTimelineEntry[]> {
    return this.referralUnavailable();
  }

  createReferral(_payload: ReferralCreatePayload, _idempotencyKey: string): Promise<PortalReferral> {
    return this.referralUnavailable();
  }

  getReferralRewards(): Promise<ReferralReward[]> {
    return this.referralUnavailable();
  }

  getReferralStats(): Promise<ReferralStats> {
    return this.referralUnavailable();
  }

  getReferralSettings(): Promise<ReferralSettings> {
    return this.referralUnavailable();
  }

  getWallet(): Promise<Wallet> {
    return this.referralUnavailable();
  }

  // ── Catalog / products ────────────────────────────────────────────────────
  async getCatalog(): Promise<Product[]> {
    return clone(this.products);
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  async getNotifications(): Promise<PortalNotification[]> {
    return clone(
      this.deliveries.map((delivery, idx) => ({
        id: delivery.id,
        type: 'delivery' as const,
        title: delivery.title,
        message: delivery.message,
        timestamp: delivery.timestamp,
        isRead: delivery.isRead,
        _mockDeliveryIndex: idx,
      }))
    );
  }

  async getUnreadNotificationCount(): Promise<number> {
    return this.deliveries.filter((delivery) => !delivery.isRead).length;
  }

  async markNotificationsRead(ids: string[]): Promise<void> {
    this.deliveries = this.deliveries.map((d) => (ids.includes(d.id) ? { ...d, isRead: true } : d));
  }

  async markAllNotificationsRead(): Promise<void> {
    this.deliveries = this.deliveries.map((d) => ({ ...d, isRead: true }));
  }

  // ── Loyalty ───────────────────────────────────────────────────────────────
  async getLoyalty(): Promise<ErpLoyalty> {
    return { points: 0, cashback: 0, tier: 'standard', pointsHistory: [] };
  }

  // ── Advertisements ────────────────────────────────────────────────────────
  // Honest empty state: ads come from the ERP's portal_ads table and are never
  // fabricated in the mock. In dev mode the dashboard simply shows the welcome
  // and delivery slides.
  async getAds(): Promise<PortalAd[]> {
    return [];
  }

  // ── Support / Help Desk ─────────────────────────────────────────────────
  async getSupportTickets(): Promise<SupportTicket[]> {
    return clone(MOCK_SUPPORT_TICKETS);
  }

  async getSupportTicket(ticketId: string): Promise<SupportTicket> {
    const ticket = MOCK_SUPPORT_TICKETS.find((t) => t.id === ticketId);
    if (!ticket) throw new ApiError(`Support ticket ${ticketId} not found.`, { code: 'NOT_FOUND' });
    return clone(ticket);
  }

  async createSupportTicket(payload: NewSupportTicketPayload): Promise<SupportTicket> {
    const newTicket: SupportTicket = {
      id: `TKT-${Date.now()}`,
      ticketNumber: `TKT-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      subject: payload.subject,
      description: payload.description,
      status: 'open',
      priority: payload.priority ?? 'medium',
      category: payload.category,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [
        {
          id: `MSG-${Date.now()}`,
          ticketId: `TKT-${Date.now()}`,
          authorName: 'You',
          authorRole: 'customer',
          content: payload.description,
          createdAt: new Date().toISOString(),
        },
      ],
    };
    MOCK_SUPPORT_TICKETS.unshift(newTicket);
    return clone(newTicket);
  }

  async addSupportMessage(ticketId: string, content: string): Promise<SupportMessage> {
    const ticket = MOCK_SUPPORT_TICKETS.find((t) => t.id === ticketId);
    if (!ticket) throw new ApiError(`Support ticket ${ticketId} not found.`, { code: 'NOT_FOUND' });
    const msg: SupportMessage = {
      id: `MSG-${Date.now()}`,
      ticketId,
      authorName: 'You',
      authorRole: 'customer',
      content,
      createdAt: new Date().toISOString(),
    };
    ticket.messages.push(msg);
    ticket.updatedAt = new Date().toISOString();
    return clone(msg);
  }

  async getSupportArticles(): Promise<SupportArticle[]> {
    return clone(MOCK_SUPPORT_ARTICLES);
  }

  async getSupportArticle(slug: string): Promise<SupportArticle> {
    const article = MOCK_SUPPORT_ARTICLES.find((a) => a.slug === slug);
    if (!article) throw new ApiError(`Support article "${slug}" not found.`, { code: 'NOT_FOUND' });
    return clone(article);
  }

  // ── Private helpers ───────────────────────────────────────────────────────
  private paymentMethodLabel(method: string): string {
    const labels: Record<string, string> = {
      national_bank: 'National Bank',
      first_capital_bank: 'First Capital Bank',
      tnm_mpamba: 'TNM Mpamba',
      airtel_money: 'Airtel Money',
    };
    return labels[method] || method;
  }
}

// ── Mock support data ─────────────────────────────────────────────────────────────

const MOCK_SUPPORT_TICKETS: SupportTicket[] = [
  {
    id: 'TKT-001',
    ticketNumber: 'TKT-A1B2C3',
    subject: 'Invoice INV-2024-001 has wrong line items',
    description: 'The invoice shows 10 units but we only received 8. Please advise.',
    status: 'open',
    priority: 'high',
    category: 'billing',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    messages: [
      {
        id: 'MSG-001',
        ticketId: 'TKT-001',
        authorName: 'You',
        authorRole: 'customer',
        content: 'The invoice shows 10 units but we only received 8. Please advise.',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
      {
        id: 'MSG-002',
        ticketId: 'TKT-001',
        authorName: 'PrimeERP Support',
        authorRole: 'agent',
        content: 'Thank you for reaching out. We have escalated this to our billing team and will investigate the discrepancy. You should receive an updated invoice within 24 hours.',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      },
    ],
  },
  {
    id: 'TKT-002',
    ticketNumber: 'TKT-D4E5F6',
    subject: 'How do I update our delivery address?',
    description: 'We are relocating next month and need to update the delivery address on file.',
    status: 'resolved',
    priority: 'low',
    category: 'account',
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    resolvedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    messages: [
      {
        id: 'MSG-003',
        ticketId: 'TKT-002',
        authorName: 'You',
        authorRole: 'customer',
        content: 'We are relocating next month and need to update the delivery address on file.',
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
      },
      {
        id: 'MSG-004',
        ticketId: 'TKT-002',
        authorName: 'PrimeERP Support',
        authorRole: 'agent',
        content: 'You can update your delivery address from the Account Settings tab. Go to Account → Company Profile and update the address fields. Changes take effect on your next order.',
        createdAt: new Date(Date.now() - 86400000 * 9).toISOString(),
      },
    ],
  },
  {
    id: 'TKT-003',
    ticketNumber: 'TKT-G7H8I9',
    subject: 'Product CAT-LOG-01 showing incorrect stock',
    description: 'Your catalog shows 500 units available but when I tried to place an order for 100 I was told there were only 50.',
    status: 'in_progress',
    priority: 'medium',
    category: 'product',
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    messages: [
      {
        id: 'MSG-005',
        ticketId: 'TKT-003',
        authorName: 'You',
        authorRole: 'customer',
        content: 'Your catalog shows 500 units available but when I tried to place an order for 100 I was told there were only 50.',
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      },
      {
        id: 'MSG-006',
        ticketId: 'TKT-003',
        authorName: 'PrimeERP Support',
        authorRole: 'agent',
        content: 'We are checking the current stock levels with our warehouse. We will update the catalog shortly.',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ],
  },
];

const MOCK_SUPPORT_ARTICLES: SupportArticle[] = [
  {
    id: 'ART-001',
    slug: 'how-to-place-an-order',
    title: 'How to Place an Order',
    summary: 'Step-by-step guide to submitting an order request through the Prime PORTAL.',
    body: '## Placing an Order\n\n1. Navigate to the Orders & Catalog tab.\n2. Browse or search for the products you need.\n3. Add items to your cart.\n4. Review your cart and click Place Order.\n5. Your order request will be reviewed by our sales team and converted to an official Sales Order.',
    category: 'Orders',
    tags: ['orders', 'catalog', 'cart'],
    helpful: 42,
    notHelpful: 3,
    lastUpdated: new Date(Date.now() - 86400000 * 30).toISOString(),
  },
  {
    id: 'ART-002',
    slug: 'understanding-your-invoice',
    title: 'Understanding Your Invoice',
    summary: 'Explains each section of your Prime ERP invoice, including line items, taxes, and payment terms.',
    body: '## Invoice Sections\n\n**Header**: Your company details, invoice number, and issue date.\n\n**Line Items**: Each product or service with quantity, unit price, and total.\n\n**Subtotal / Tax / Total**: The final amount payable.\n\n**Payment Terms**: Net 30 days unless otherwise agreed.',
    category: 'Billing',
    tags: ['invoices', 'billing', 'payments'],
    helpful: 38,
    notHelpful: 5,
    lastUpdated: new Date(Date.now() - 86400000 * 15).toISOString(),
  },
  {
    id: 'ART-003',
    slug: 'tracking-your-delivery',
    title: 'Tracking Your Delivery',
    summary: 'How to use the Deliveries tab and tracking numbers to monitor your shipment status.',
    body: '## Delivery Tracking\n\nGo to the Deliveries tab to see all your shipments. Each shipment shows:\n\n- Current status (Processing, Dispatched, In Transit, Delivered)\n- Tracking number\n- Expected delivery date\n\nClick any delivery for the full timeline.',
    category: 'Deliveries',
    tags: ['deliveries', 'tracking', 'shipments'],
    helpful: 29,
    notHelpful: 2,
    lastUpdated: new Date(Date.now() - 86400000 * 7).toISOString(),
  },
  {
    id: 'ART-004',
    slug: 'requesting-a-quotation',
    title: 'Requesting a Quotation',
    summary: 'How to submit a formal quotation request for volume pricing or custom engineering.',
    body: '## Quotation Requests\n\nUse the "Request Custom Quote" button in the Quotations tab.\n\n1. Add the products and quantities you need.\n2. Set your required delivery date.\n3. Add any notes or specifications.\n4. Submit — our team will respond within 1 business day.',
    category: 'Quotations',
    tags: ['quotations', 'rfq', 'pricing'],
    helpful: 21,
    notHelpful: 1,
    lastUpdated: new Date(Date.now() - 86400000 * 20).toISOString(),
  },
  {
    id: 'ART-005',
    slug: 'updating-your-account',
    title: 'Updating Your Account Details',
    summary: 'How to change your company profile, contact details, and notification preferences.',
    body: '## Account Settings\n\nNavigate to Account Settings to update:\n\n- Company name and address\n- Contact phone and email\n- Account manager\n\nNote: Some changes require approval from our team.',
    category: 'Account',
    tags: ['account', 'profile', 'settings'],
    helpful: 17,
    notHelpful: 2,
    lastUpdated: new Date(Date.now() - 86400000 * 45).toISOString(),
  },
];
