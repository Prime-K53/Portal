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
  Order,
  Payment,
  PaymentRequest,
  PortalAd,
  PortalNotification,
  Product,
  Quotation,
  QuoteRequest,
  Referral,
  ReferralInvitePayload,
  StatementEntry,
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
  initialReferrals,
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
  private referrals: Referral[];
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
    this.referrals = clone(initialReferrals);
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
  async getOrders(): Promise<Order[]> {
    return clone(this.orders);
  }

  async createOrder(payload: NewOrderPayload): Promise<Order> {
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

    return clone(newOrder);
  }

  async reorderOrder(orderId: string): Promise<Order> {
    const order = this.orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!order) throw new Error(`Order not found: ${orderId}`);
    const reordered: Order = { ...clone(order), id: `ord_${Date.now()}`, status: 'processing' };
    this.orders = [reordered, ...this.orders];
    return clone(reordered);
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
  async getReferrals(): Promise<Referral[]> {
    return clone(this.referrals);
  }

  async sendReferralInvite(payload: ReferralInvitePayload): Promise<Referral> {
    const newReferral: Referral = {
      id: `ref_${Date.now()}`,
      refereeName: payload.refereeName,
      refereeCompany: payload.refereeCompany,
      email: payload.email,
      dateInvited: new Date().toISOString().split('T')[0],
      status: 'invited',
      rewardAmount: 500,
      rewardClaimed: false,
    };
    this.referrals = [newReferral, ...this.referrals];
    return clone(newReferral);
  }

  async claimReferralReward(referralId: string): Promise<Referral> {
    const referral = this.referrals.find((ref) => ref.id === referralId);
    if (!referral || referral.rewardClaimed) return clone(referral || this.referrals[0]);

    const updated: Referral = { ...referral, rewardClaimed: true };
    this.referrals = this.referrals.map((ref) => (ref.id === referralId ? updated : ref));

    this.profile = {
      ...this.profile,
      totalReferralEarned: this.profile.totalReferralEarned + referral.rewardAmount,
      currentBalance: Math.max(0, this.profile.currentBalance - referral.rewardAmount),
    };

    this.statements = [
      {
        id: `st_${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        type: 'Credit Note',
        reference: `CRD-${Math.floor(1000 + Math.random() * 9000)}`,
        description: 'Referral Bonus Program Reward Credit Applied',
        debit: 0,
        credit: referral.rewardAmount,
        balance: this.profile.currentBalance,
      },
      ...this.statements,
    ];

    return clone(updated);
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
