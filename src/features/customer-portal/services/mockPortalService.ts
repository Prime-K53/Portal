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
  CompanyContactInfo,
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

/** DEV-ONLY mock revision metadata, keyed by seeded quote id. */
const MOCK_QUOTATION_REVISIONS: Record<string, { version: number; updatedAt: string }> = {
  qt_501: { version: 2, updatedAt: '2026-08-14T09:30:00.000Z' },
  qt_488: { version: 1, updatedAt: '2026-06-18T08:00:00.000Z' },
};

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

  async getOrderById(orderId: string): Promise<Order> {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }
    return clone(order);
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
          // DEV-ONLY revision metadata so the version indicator can be
          // exercised before the ERP supplies it (real mode maps the ERP
          // `version` / `updated_at` quotation columns in portalService).
          version: MOCK_QUOTATION_REVISIONS[request.id]?.version,
          updatedAt: MOCK_QUOTATION_REVISIONS[request.id]?.updatedAt,
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

  async getCompanyContactInfo(): Promise<CompanyContactInfo> {
    return {
      companyName: 'Prime Printing',
      email: 'info@primeprinting.mw',
      phone: '+265 992 526 222',
      phones: ['+265 992 526 222'],
      whatsapp: '+265 992 526 222',
    };
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
  { id: 'ART-001', slug: 'about-prime-printing', title: 'What does Prime Printing do?', summary: 'Prime Printing provides professional printing and stationery solutions for individuals, businesses, schools, organisations, and institutions.', body: 'Prime Printing provides professional printing and stationery solutions for individuals, businesses, schools, organisations, and institutions.\n\nOur services include general printing, business and office stationery, promotional materials, examination-related printing, document printing, customised print jobs, and other printing requirements.', category: 'About Prime Printing', tags: ['about', 'services'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-002', slug: 'who-can-order', title: 'Who can order from Prime Printing?', summary: 'Anyone can request our printing services.', body: 'Anyone can request our printing services. We serve individuals, businesses, schools, organisations, NGOs, institutions, and other customers with printing and stationery needs.', category: 'About Prime Printing', tags: ['orders', 'customers'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-003', slug: 'location', title: 'Where is Prime Printing located?', summary: 'Prime Printing operates in Malawi.', body: 'Please contact our team or check the contact information provided in your customer account for our current location and collection arrangements.', category: 'About Prime Printing', tags: ['location', 'contact'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-004', slug: 'request-quotation', title: 'How do I request a quotation?', summary: 'Contact Prime Printing with details of what you need printed.', body: 'You can contact Prime Printing with details of what you need printed, including the product, quantity, size, material, finishing requirements, and preferred deadline.\n\nWhere available, you can also submit a quotation request through the Prime Portal.', category: 'Orders & Quotations', tags: ['quotation', 'request'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-005', slug: 'quotation-info', title: 'What information should I provide when requesting a quotation?', summary: 'Provide details about what you want printed, quantity, size, colour requirements, and more.', body: 'For the most accurate quotation, provide:\n\n- What you want printed\n- Quantity required\n- Size\n- Colour or black-and-white requirements\n- Paper/material preference\n- Finishing requirements\n- Whether artwork/design is ready\n- Your required completion date\n- Delivery or collection preference', category: 'Orders & Quotations', tags: ['quotation', 'details'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-006', slug: 'quotation-vs-order', title: 'Is a quotation the same as an order?', summary: 'No. A quotation shows the estimated price; an order is created when the quotation is accepted.', body: 'No.\n\nA quotation shows the estimated price and details of the requested work. An order is created when the quotation/request is accepted and the job proceeds through the appropriate Prime Printing process.', category: 'Orders & Quotations', tags: ['quotation', 'order'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-007', slug: 'change-order', title: 'Can I change my order after submitting it?', summary: 'Contact Prime Printing as soon as possible.', body: 'Contact Prime Printing as soon as possible.\n\nChanges may affect the price, production time, materials, or delivery date. Once production has started, some changes may no longer be possible or may incur additional costs.', category: 'Orders & Quotations', tags: ['order', 'changes'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-008', slug: 'cancel-order', title: 'Can I cancel an order?', summary: 'Cancellation depends on the stage of the order.', body: 'Cancellation depends on the stage of the order.\n\nContact Prime Printing immediately if you need to cancel. Orders that have already entered production may be subject to applicable charges.', category: 'Orders & Quotations', tags: ['order', 'cancellation'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-009', slug: 'artwork-required', title: 'Do I need to provide my own artwork?', summary: 'Not necessarily. You can provide print-ready artwork or ask about design assistance.', body: 'Not necessarily.\n\nIf you already have print-ready artwork, you can provide it to us. If you need design or artwork preparation assistance, ask our team about the available options.', category: 'Artwork & Design', tags: ['artwork', 'design'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-010', slug: 'file-formats', title: 'What file formats can I provide?', summary: 'Common print-ready formats such as PDF are preferred.', body: 'Common print-ready formats such as PDF are preferred. Depending on the job, other formats may also be accepted.\n\nIf you are unsure whether your file is suitable for printing, contact us before placing the order.', category: 'Artwork & Design', tags: ['artwork', 'files'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-011', slug: 'artwork-check', title: 'Will my artwork be checked before printing?', summary: 'Artwork may be reviewed for basic production requirements.', body: 'Where applicable, artwork may be reviewed for basic production requirements.\n\nCustomers should carefully check spelling, names, dates, quantities, colours, logos, contact details, and other information before approving artwork for production.', category: 'Artwork & Design', tags: ['artwork', 'quality'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-012', slug: 'design-services', title: 'Can Prime Printing design my material?', summary: 'Yes, where design services are available.', body: 'Yes, where design services are available.\n\nYou can discuss your requirements with our team before production begins.', category: 'Artwork & Design', tags: ['design', 'services'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-013', slug: 'pricing-factors', title: 'How is the price of a printing job calculated?', summary: 'Pricing may depend on quantity, size, paper, colour requirements, and more.', body: 'Pricing may depend on:\n\n- Quantity\n- Size\n- Paper/material\n- Colour requirements\n- Printing method\n- Finishing\n- Binding\n- Artwork/design requirements\n- Packaging\n- Delivery\n- Production time\n\nFor customised jobs, the final price is normally confirmed through a quotation.', category: 'Pricing', tags: ['pricing', 'quotation'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-014', slug: 'similar-prices', title: 'Why can two similar printing jobs have different prices?', summary: 'Small differences in specifications can affect the cost.', body: 'Small differences in quantity, paper, size, colour, finishing, artwork, or production requirements can affect the cost.', category: 'Pricing', tags: ['pricing'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-015', slug: 'final-price', title: 'Is the price shown in my quotation final?', summary: 'The quotation represents the price for the stated specifications.', body: 'The quotation represents the price for the specifications stated in it.\n\nIf you change the specifications, quantity, artwork, delivery requirements, or other important details, the quotation may need to be revised.', category: 'Pricing', tags: ['pricing', 'quotation'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-016', slug: 'printing-types', title: 'What types of printing does Prime Printing offer?', summary: 'We offer business cards, flyers, posters, brochures, books, stationery, and more.', body: 'Depending on the job, Prime Printing can provide:\n\n- Business cards\n- Flyers\n- Posters\n- Brochures\n- Books and booklets\n- Reports\n- Certificates\n- Forms\n- Receipt books\n- Office stationery\n- School stationery\n- Examination materials\n- Branded materials\n- General document printing\n- Other customised printing', category: 'Printing & Products', tags: ['products', 'services'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-017', slug: 'large-orders', title: 'Can Prime Printing handle large orders?', summary: 'Yes. Large or recurring orders can be discussed with our team.', body: 'Yes. Large or recurring orders can be discussed with our team so production requirements, pricing, and delivery schedules can be properly planned.', category: 'Printing & Products', tags: ['orders', 'large'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-018', slug: 'recurring-orders', title: 'Can I place recurring orders?', summary: 'Yes, where applicable. Regular orders can be processed more efficiently.', body: 'Yes, where applicable.\n\nIf you regularly require the same stationery or printed materials, let our team know so future orders can be processed more efficiently.', category: 'Printing & Products', tags: ['orders', 'recurring'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-019', slug: 'delivery', title: 'Do you offer delivery?', summary: 'Delivery may be available depending on the order and delivery location.', body: 'Delivery may be available depending on the order and delivery location.\n\nDelivery arrangements and applicable charges should be confirmed when the order is processed.', category: 'Delivery & Collection', tags: ['delivery'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-020', slug: 'collection', title: 'Can I collect my order?', summary: 'Yes, where collection is offered.', body: 'Yes, where collection is offered for the particular order.\n\nYour order status or our team will indicate when your order is ready for collection.', category: 'Delivery & Collection', tags: ['collection'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-021', slug: 'turnaround-time', title: 'How long will my order take?', summary: 'Turnaround time depends on the type and quantity of work.', body: 'Turnaround time depends on the type and quantity of work, artwork requirements, production workload, finishing, and delivery requirements.\n\nYour expected completion date should be confirmed with the quotation or order.', category: 'Delivery & Collection', tags: ['turnaround', 'time'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-022', slug: 'urgent-orders', title: 'Can I request an urgent order?', summary: 'You can ask our team about urgent production.', body: 'You can ask our team about urgent production.\n\nUrgent jobs depend on production capacity and job requirements. An additional charge may apply where expedited production is available.', category: 'Delivery & Collection', tags: ['urgent', 'rush'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-023', slug: 'prime-portal', title: 'What is the Prime Portal?', summary: 'Prime Printing customer-facing online platform for managing your account.', body: 'The Prime Portal is Prime Printing\'s customer-facing online platform.\n\nDepending on your account and available services, you can use it to view and manage:\n\n- Quotations\n- Orders\n- Invoices\n- Payment requests\n- Account information\n- Referral information\n- Order status', category: 'Prime Customer Portal', tags: ['portal', 'account'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-024', slug: 'portal-account', title: 'Do I need a Portal account to use Prime Printing?', summary: 'Not every interaction requires a Portal account.', body: 'Not every interaction necessarily requires a Portal account.\n\nIf Prime Printing has provided or enabled Portal access for you, your Portal account gives you convenient access to your customer information and transactions.', category: 'Prime Customer Portal', tags: ['portal', 'account'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-025', slug: 'forgot-password', title: 'I forgot my password. What should I do?', summary: 'Use the password recovery option on the Portal.', body: 'Use the password recovery option on the Portal.\n\nIf you cannot recover your account, contact Prime Printing support.', category: 'Prime Customer Portal', tags: ['password', 'account'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-026', slug: 'order-history', title: 'Can I see my previous orders?', summary: 'Where your account has Portal access, you can view order history.', body: 'Where your account has Portal access and the relevant records are available, you can view your order history through the Portal.', category: 'Prime Customer Portal', tags: ['orders', 'history'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-027', slug: 'invoices-online', title: 'Can I see my invoices online?', summary: 'Yes, invoices can be made available through the Portal.', body: 'Yes, invoices associated with your customer account can be made available through the Portal.', category: 'Prime Customer Portal', tags: ['invoices', 'portal'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-028', slug: 'request-not-order', title: 'Does submitting an online request automatically mean my job has started?', summary: 'No. A request does not necessarily mean production has started.', body: 'No.\n\nA request or quotation submission does not necessarily mean production has started. The order must go through the appropriate confirmation and processing stages.', category: 'Prime Customer Portal', tags: ['requests', 'orders'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-029', slug: 'payment-methods', title: 'How can I pay for my order?', summary: 'Available payment methods depend on arrangements provided by Prime Printing.', body: 'Available payment methods depend on the arrangements provided by Prime Printing.\n\nYour invoice or payment instructions should indicate the appropriate payment method.', category: 'Payments', tags: ['payment', 'invoices'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-030', slug: 'payment-request', title: 'What is a payment request?', summary: 'A payment request is a request relating to payment for an outstanding transaction.', body: 'A payment request is a request relating to payment for an outstanding transaction.\n\nSubmitting a payment request does not by itself mean payment has been received or that an invoice has been paid.', category: 'Payments', tags: ['payment', 'request'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-031', slug: 'invoice-unpaid', title: 'Why does my invoice still show as unpaid after I submit a payment request?', summary: 'A payment request and actual payment are different things.', body: 'A payment request and an actual recorded payment are different things.\n\nPayment must be received and recorded by Prime Printing before the invoice status is updated as paid.', category: 'Payments', tags: ['invoice', 'payment'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-032', slug: 'paid-balance', title: 'What should I do if I have already paid but my account still shows an outstanding balance?', summary: 'Contact Prime Printing with your payment information or proof of payment.', body: 'Contact Prime Printing and provide the relevant payment information or proof of payment.\n\nOur team can verify and update the payment record where appropriate.', category: 'Payments', tags: ['payment', 'balance'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-033', slug: 'referral-programme', title: 'Does Prime Printing have a referral programme?', summary: 'Yes, Prime Printing may provide a referral programme.', body: 'Yes, Prime Printing may provide a referral programme that allows eligible customers to refer new customers.', category: 'Referrals', tags: ['referral', 'programme'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-034', slug: 'referral-how', title: 'How does the referral programme work?', summary: 'An eligible customer can share their referral link or code with someone interested.', body: 'An eligible customer can share their referral link or referral code with someone interested in using Prime Printing.\n\nWhen the referred customer registers and completes the required qualifying activity, the referral may become eligible for the applicable reward.', category: 'Referrals', tags: ['referral', 'programme'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-035', slug: 'referral-reward', title: 'Does every referral automatically earn a reward?', summary: 'No. A referral must satisfy the programme\'s qualifying conditions.', body: 'No.\n\nA referral must satisfy the programme\'s qualifying conditions before a reward is issued.', category: 'Referrals', tags: ['referral', 'reward'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-036', slug: 'self-referral', title: 'Can I refer myself?', summary: 'No. Self-referrals are not eligible.', body: 'No.\n\nSelf-referrals are not eligible.', category: 'Referrals', tags: ['referral'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-037', slug: 'referral-discount', title: 'Can I receive the first-order referral discount more than once?', summary: 'No. The first-order referral discount is intended for the referred customer\'s first order.', body: 'No.\n\nThe first-order referral discount is intended for the referred customer\'s qualifying first order and should not be repeatedly applied to subsequent orders.', category: 'Referrals', tags: ['referral', 'discount'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-038', slug: 'referral-credit', title: 'When will my referral reward be credited?', summary: 'The reward becomes eligible after the referred customer completes the required qualifying order lifecycle.', body: 'The reward becomes eligible after the referred customer completes the required qualifying order lifecycle.\n\nOnce qualified, the applicable reward is processed according to Prime Printing\'s referral programme rules.', category: 'Referrals', tags: ['referral', 'reward'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-039', slug: 'referral-reversed', title: 'What happens if a qualifying order is cancelled or reversed?', summary: 'A referral reward associated with a qualifying order may be reversed.', body: 'A referral reward associated with a qualifying order may be reversed where the underlying transaction is cancelled or otherwise becomes ineligible.', category: 'Referrals', tags: ['referral', 'cancelled'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-040', slug: 'account-security', title: 'Is my customer information secure?', summary: 'Prime Printing takes reasonable measures to protect customer information.', body: 'Prime Printing takes reasonable measures to protect customer account and transaction information.\n\nCustomers should also keep their passwords confidential and should not share their login credentials.', category: 'Account & Security', tags: ['security', 'account'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-041', slug: 'other-customer', title: 'Can another customer see my orders or invoices?', summary: 'No. Your customer information is intended to remain associated with your own account.', body: 'No. Your customer information is intended to remain associated with your own account.', category: 'Account & Security', tags: ['privacy', 'account'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-042', slug: 'incorrect-info', title: 'What should I do if I notice something incorrect in my account?', summary: 'Contact Prime Printing support as soon as possible.', body: 'Contact Prime Printing support as soon as possible and provide the relevant order, quotation, invoice, or transaction details.', category: 'Account & Security', tags: ['support', 'account'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-043', slug: 'wrong-job', title: 'What if the printed job is different from what I approved?', summary: 'Contact Prime Printing promptly with your order details.', body: 'Contact Prime Printing promptly.\n\nProvide the order details and explain the issue. Our team will review the approved specifications and delivered work.', category: 'Problems & Support', tags: ['support', 'issue'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-044', slug: 'spelling-error', title: 'What if there is a spelling or information error in my printed material?', summary: 'Customers are strongly encouraged to carefully proofread and approve all artwork.', body: 'If the error was present in the artwork or information approved by the customer, responsibility may depend on the circumstances.\n\nCustomers are strongly encouraged to carefully proofread and approve all artwork before production.', category: 'Problems & Support', tags: ['quality', 'artwork'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-045', slug: 'fewer-items', title: 'What if I receive fewer items than I ordered?', summary: 'Contact Prime Printing with your order details.', body: 'Contact Prime Printing with your order details so production and delivery records can be checked.', category: 'Problems & Support', tags: ['order', 'issue'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
  { id: 'ART-046', slug: 'order-delayed', title: 'What if my order is delayed?', summary: 'Check the order status through the Portal or contact Prime Printing support.', body: 'Check the order status through the Portal where available, or contact Prime Printing support.\n\nDelays can occur because of artwork approval, material availability, production requirements, order changes, or other circumstances.', category: 'Problems & Support', tags: ['order', 'delay'], helpful: 0, notHelpful: 0, lastUpdated: new Date().toISOString() },
];
