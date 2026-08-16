/**
 * Prime PORTAL — Portal Data Service (REAL ERP contract)
 *
 * UI → Portal service (hooks) → API client → ERP Portal API
 *
 * Implements the ERP Portal API as verified from the PrimeERPsystem source
 * (docs/SASA_PHASE_4_ERP_INTEGRATION.md). Every method maps to a REAL endpoint.
 * Features that the ERP genuinely cannot serve — referral invitations (the ERP
 * only refers EXISTING customers by id, while Sasa's UI invites by name/email)
 * and reward claiming (ERP-admin approved, no customer endpoint) — throw an
 * explicit UNAVAILABLE error. They are never fabricated or replaced with mock
 * data.
 *
 * Customer scoping: every endpoint derives the authenticated customer from the
 * ERP JWT server-side. Sasa NEVER sends a customer_id from the UI — no URL,
 * query, form, or storage value is used to scope requests.
 */

import { env } from '../config/env';
import type {
  AccountProfile,
  DeliveryNotification,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  NewOrderPayload,
  NewQuoteRequestPayload,
  Order,
  OrderItem,
  OrderStatus,
  Payment,
  PaymentRequest,
  PaymentRequestStatus,
  PortalAd,
  PortalNotification,
  Product,
  Quotation,
  QuotationItem,
  QuoteRequest,
  QuoteRequestItem,
  QuoteStatus,
  Referral,
  ReferralInvitePayload,
  StatementEntry,
} from '../types';
import type {
  ErpCatalogItem,
  ErpInvoiceSummary,
  ErpLoyalty,
  ErpNotification,
  ErpOrder,
  ErpPaymentIntent,
  ErpPaymentRecord,
  ErpPaymentRequest,
  ErpPaymentRequestCreatePayload,
  ErpPaymentRequestRecord,
  ErpPaymentResult,
  ErpPortalAd,
  ErpProfile,
  ErpQuotation,
  ErpReorderResult,
  ErpRequest,
  ErpRequestLine,
  ErpShipment,
  ErpStatement,
} from '../types';
import { ApiError, type ApiClient } from './apiClient';
import { authService } from './authService';
import { MockPortalService } from './mockPortalService';

export interface PortalService {
  // ── Current customer / account ────────────────────────────────────────────
  getCurrentCustomer(): Promise<AccountProfile>;

  // ── Invoices & payments ───────────────────────────────────────────────────
  getInvoices(): Promise<Invoice[]>;
  getInvoiceDetail(invoiceId: string): Promise<Invoice>;
  getPayments(): Promise<Payment[]>;
  submitPayment(payload: ErpPaymentRequest): Promise<ErpPaymentResult>;
  getPaymentIntent(invoiceId: string, amount: number): Promise<ErpPaymentIntent>;

  // ── Payment requests (NON-ACCOUNTING bank-transfer intentions) ───────────
  getPaymentRequests(): Promise<PaymentRequest[]>;
  getPaymentRequest(paymentRequestId: string): Promise<PaymentRequest>;
  createPaymentRequest(payload: ErpPaymentRequestCreatePayload): Promise<PaymentRequest>;

  // ── Orders (created through the ERP request pipeline) ─────────────────────
  getOrders(): Promise<Order[]>;
  createOrder(payload: NewOrderPayload): Promise<Order>;
  reorderOrder(orderId: string): Promise<Order>;

  // ── Quotations (formal, READY) ────────────────────────────────────────────
  getQuotations(): Promise<Quotation[]>;
  acceptQuotation(quotationId: string): Promise<void>;
  rejectQuotation(quotationId: string, reason?: string): Promise<void>;
  requestQuotationRevision(quotationId: string, comments?: string): Promise<void>;

  // ── Quotation requests / RFQs (ERP request pipeline) ──────────────────────
  getQuoteRequests(): Promise<QuoteRequest[]>;
  submitQuoteRequest(payload: NewQuoteRequestPayload): Promise<QuoteRequest>;

  // ── Deliveries / shipments ────────────────────────────────────────────────
  getDeliveries(): Promise<DeliveryNotification[]>;

  // ── Statements ────────────────────────────────────────────────────────────
  getStatements(startDate?: string, endDate?: string): Promise<StatementEntry[]>;

  // ── Referrals — blocked: Sasa's invite flow does not match the ERP ────────
  getReferrals(): Promise<Referral[]>;
  sendReferralInvite(payload: ReferralInvitePayload): Promise<Referral>;
  claimReferralReward(referralId: string): Promise<Referral>;

  // ── Catalog / products ────────────────────────────────────────────────────
  getCatalog(): Promise<Product[]>;

  // ── Notifications (ERP portal_notifications) ──────────────────────────────
  getNotifications(): Promise<PortalNotification[]>;
  getUnreadNotificationCount(): Promise<number>;
  markNotificationsRead(ids: string[]): Promise<void>;
  markAllNotificationsRead(): Promise<void>;

  // ── Loyalty (real ERP tier for profile display) ───────────────────────────
  getLoyalty(): Promise<ErpLoyalty>;

  // ── Advertisements (ERP portal banner ads — dashboard carousel) ───────────
  getAds(): Promise<PortalAd[]>;
}

/** Explicit failure for features blocked by pending ERP migrations. */
function blocked(feature: string, reason: string): never {
  throw new ApiError(`${feature} is temporarily unavailable. ${reason}`, { code: 'UNAVAILABLE' });
}

/**
 * True when the error is the EXPECTED blocked-referral state — the referral
 * feature is intentionally not wired and must render its unavailable panel,
 * never a generic failure. Any other error (network, auth, server) stays a
 * real error and remains visible/diagnosable.
 */
export function isReferralsBlockedError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.code === 'UNAVAILABLE' &&
    (error.message ?? '').startsWith('Referrals is temporarily unavailable.')
  );
}

// ── ERP → Sasa adapters (exact shapes from the Phase 3 contract §7) ─────────

function normalizeInvoiceStatus(status: string | undefined): InvoiceStatus {
  const normalized = (status ?? '').toLowerCase();
  if (
    normalized === 'unpaid' ||
    normalized === 'partially_paid' ||
    normalized === 'paid' ||
    normalized === 'overdue' ||
    normalized === 'credit_note'
  ) {
    return normalized as InvoiceStatus;
  }
  if (normalized === 'voided') return 'voided';
  // ERP stores 'Partial' / 'Paid' / 'Unpaid' / 'Overdue' capitalized.
  if (normalized === 'partial') return 'partially_paid';
  return (normalized || 'unpaid') as InvoiceStatus;
}

function normalizeOrderStatus(status: string | undefined): OrderStatus {
  const normalized = (status ?? '').toLowerCase();
  switch (normalized) {
    case 'draft':
      return 'draft';
    case 'confirmed':
      return 'confirmed';
    case 'pending':
      return 'pending';
    case 'processing':
      return 'processing';
    case 'shipped':
      return 'shipped';
    case 'delivered':
    case 'fulfilled':
      return normalized as OrderStatus;
    case 'cancelled':
      return 'cancelled';
    default:
      return (normalized || 'pending') as OrderStatus;
  }
}

function normalizeDeliveryStatus(status: string | undefined): DeliveryNotification['status'] {
  const normalized = (status ?? '').toLowerCase();
  switch (normalized) {
    case 'inbound':
      return 'processing';
    case 'active':
    case 'in transit':
    case 'in_transit':
      return 'dispatched';
    case 'delivered':
      return 'delivered';
    case 'delayed':
      return 'delayed';
    case 'out_for_delivery':
    case 'out for delivery':
      return 'out_for_delivery';
    default:
      return normalized === 'processing' || normalized === 'dispatched' || normalized === 'order_placed'
        ? (normalized as DeliveryNotification['status'])
        : 'processing';
  }
}

function mapInvoice(summary: ErpInvoiceSummary): Invoice {
  return {
    id: summary.id,
    invoiceNumber: summary.invoice_number ?? summary.id,
    issueDate: summary.created_at,
    dueDate: summary.due_date ?? summary.created_at,
    amount: summary.total_amount,
    amountPaid: summary.paid_amount,
    amountRemaining: Math.max(0, summary.total_amount - summary.paid_amount),
    status: normalizeInvoiceStatus(summary.status),
    items: [],
  };
}

function mapOrder(order: ErpOrder): Order {
  const items: OrderItem[] = (order.items ?? []).map((item) => ({
    // The ERP list endpoint carries the display name as `productName` (raw
    // stored order lines); the detail endpoint normalizes it to `name`.
    // Never hardcode 'Item' when the ERP provides a real name.
    productId: item.productId ?? item.product_id ?? '',
    productName: item.name ?? item.productName ?? item.product_name ?? item.description ?? 'Item',
    quantity: item.quantity,
    unitPrice: item.unitPrice ?? item.price ?? item.unit_price ?? 0,
    total: item.lineTotal ?? item.lineTotalNet ?? item.line_total ?? item.subtotal ?? (item.quantity ?? 0) * (item.unitPrice ?? item.price ?? item.unit_price ?? 0),
  }));
  return {
    id: order.id,
    orderNumber: order.order_number ?? order.orderNumber ?? order.id,
    date: order.orderDate ?? order.created_at ?? '',
    items,
    totalAmount: order.totalAmount ?? order.total ?? 0,
    status: normalizeOrderStatus(order.status),
    deliveryAddress: '',
    paymentMethod: '',
    estimatedDelivery: order.deliveryDate ?? '',
    associatedInvoiceId: undefined,
  };
}

function mapQuotation(quotation: ErpQuotation): Quotation {
  const items: QuotationItem[] = (quotation.items ?? []).map((item, idx) => ({
    id: item.productId ?? item.product_id ?? `qi_${idx}`,
    productId: item.productId ?? item.product_id ?? undefined,
    description: item.name ?? item.description ?? 'Item',
    quantity: item.quantity,
    unitPrice: item.unitPrice ?? item.price ?? 0,
    total: item.lineTotal ?? item.lineTotalNet ?? (item.quantity ?? 0) * (item.unitPrice ?? item.price ?? 0),
  }));
  const statusRaw = String(quotation.status ?? '').toLowerCase();
  const status: QuoteStatus = statusRaw === 'ready'
    ? 'quoted'
    : statusRaw === 'rejected'
      ? 'declined'
      : statusRaw === 'converted' || statusRaw === 'revision_requested' || statusRaw === 'accepted' || statusRaw === 'expired'
        ? (statusRaw as QuoteStatus)
        : (statusRaw as QuoteStatus) || 'pending_review';
  return {
    id: quotation.id,
    quotationNumber: quotation.quotation_number ?? quotation.quotationNumber ?? quotation.id,
    issuedDate: quotation.created_at ?? quotation.date ?? '',
    validUntil: quotation.valid_until ?? quotation.validUntil ?? '',
    status,
    items,
    subtotal: quotation.subtotal ?? quotation.materialTotal ?? quotation.total ?? 0,
    discount: quotation.discount ?? 0,
    tax: quotation.tax_amount ?? quotation.tax ?? 0,
    total: quotation.total ?? quotation.totalAmount ?? 0,
    notes: quotation.payment_terms ?? quotation.paymentTerms ?? undefined,
    pdfUrl: undefined,
  };
}

function mapShipment(shipment: ErpShipment): DeliveryNotification {
  const orderRef = shipment.order_number ?? shipment.orderNumber ?? shipment.order_id ?? shipment.orderId ?? shipment.id;
  return {
    id: shipment.id,
    orderId: shipment.order_id ?? shipment.orderId ?? orderRef,
    trackingNumber: shipment.tracking_number ?? shipment.trackingNumber ?? shipment.id,
    title: `Order ${orderRef}`,
    message: `Shipment status: ${shipment.status}`,
    status: normalizeDeliveryStatus(shipment.status),
    timestamp: shipment.orderDate ?? shipment.date ?? '',
    estimatedArrival: shipment.estimated_delivery ?? shipment.estimatedDelivery ?? '',
    driverName: shipment.driver_name ?? shipment.driverName ?? undefined,
    driverPhone: shipment.driver_phone ?? shipment.driverPhone ?? undefined,
    vehicleNumber: shipment.vehicle_no ?? shipment.vehicleNo ?? undefined,
    deliveryAddress: shipment.shipping_address ?? shipment.shippingAddress ?? '',
    itemsSummary: (shipment.items ?? []).map((i) => `${i.quantity}x ${i.name ?? 'Item'}`).join(', '),
    proofOfDelivery: undefined,
    isRead: false,
  };
}

function mapStatement(statement: ErpStatement): StatementEntry[] {
  return (statement.transactions ?? []).map((txn, idx) => ({
    id: `st_${idx}_${txn.date ?? idx}`,
    date: txn.date ?? '',
    type: txn.type === 'credit_note' ? 'Credit Note' : txn.type === 'payment' ? 'Payment' : 'Invoice',
    reference: txn.description,
    description: txn.description,
    debit: txn.debit,
    credit: txn.credit,
    balance: txn.balance,
  }));
}

function mapPayment(payment: ErpPaymentRecord): Payment {
  return {
    id: payment.id,
    paymentNumber: payment.reference || payment.id,
    date: payment.date,
    amount: payment.amount,
    method: payment.payment_method,
    referenceCode: payment.reference,
    status: 'verified', // the payments list only contains ERP-recorded payments
  };
}

function normalizePaymentRequestStatus(status: string | null | undefined): PaymentRequestStatus {
  const normalized = String(status ?? '').toLowerCase();
  switch (normalized) {
    case 'requested':
    case 'under_review':
    case 'confirmed':
    case 'rejected':
    case 'cancelled':
      return normalized as PaymentRequestStatus;
    default:
      // Unknown statuses are kept verbatim (never silently coerced to a
      // misleading label) — the UI renders them honestly as-is.
      return (normalized || 'requested') as PaymentRequestStatus;
  }
}

/**
 * ERP payment-request DTO → Sasa PaymentRequest.
 *
 * A payment request is workflow data ONLY: `requestedAmount` is the requested
 * (not paid) amount and `status` is a workflow status — `confirmed` must never
 * be read as "paid" unless the ERP invoice/payment data independently confirms
 * a recorded accounting payment.
 */
function mapPaymentRequest(record: ErpPaymentRequestRecord): PaymentRequest {
  return {
    id: record.id,
    requestNumber: record.requestNumber ?? record.id,
    invoiceId: record.invoiceId ?? '',
    invoiceNumber: record.invoiceNumber ?? undefined,
    requestedAmount: Number(record.requestedAmount ?? 0),
    paymentMethod: record.paymentMethod ?? 'Bank Transfer',
    status: normalizePaymentRequestStatus(record.status),
    note: record.note ?? undefined,
    requestedAt: record.requestedAt ?? record.createdAt ?? '',
    createdAt: record.createdAt ?? '',
  };
}

function mapAd(ad: ErpPortalAd): PortalAd {
  return {
    id: ad.id,
    title: ad.title ?? '',
    subtitle: ad.subtitle ?? null,
    badge: ad.badge ?? null,
    ctaLabel: ad.ctaLabel ?? null,
    ctaTarget: ad.ctaTarget ?? null,
    imageUrl: ad.imageUrl ?? null,
    gradient: ad.gradient ?? null,
    emoji: ad.emoji ?? null,
  };
}

function mapCatalogItem(item: ErpCatalogItem): Product {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    price: item.price,
    unit: item.unit || 'unit',
    description: item.description ?? '',
    image: '', // ERP catalog has no image field (§16 ERP gap list)
    inStock: item.quantity > 0,
    minOrderQty: 1,
    sku: item.sku ?? '',
    rating: undefined,
    ratingCount: undefined,
    isTopSeller: undefined,
  };
}

function mapNotification(notification: ErpNotification): PortalNotification {
  const rawType = (notification.type ?? '').toLowerCase();
  const type: PortalNotification['type'] = rawType.includes('delivery')
    ? 'delivery'
    : rawType.includes('invoice')
      ? 'invoice'
      : rawType.includes('payment')
        ? 'payment'
        : 'system';
  return {
    id: notification.id,
    type,
    title: notification.title,
    message: notification.body ?? notification.title,
    timestamp: notification.created_at,
    isRead: notification.is_read ?? false,
    link: notification.link ?? undefined,
  };
}

/** ERP request line → Sasa QuoteRequestItem (custom lines keep their target price). */
function mapRequestItemToQuoteItem(item: ErpRequestLine): QuoteRequestItem {
  return {
    id: item.productId ?? item.product_id ?? `ri_${item.name ?? ''}`,
    name: item.name ?? item.description ?? 'Item',
    quantity: item.quantity ?? item.qty ?? 1,
    targetPrice: item.unitPrice ?? item.price,
  };
}

/** ERP request row → Sasa QuoteRequest (quote requests are ERP 'quotation' requests). */
function mapRequestToQuoteRequest(request: ErpRequest): QuoteRequest {
  const statusRaw = String(request.status ?? '').toLowerCase();
  const status: QuoteStatus = statusRaw === 'ready_for_conversion'
    ? 'converted'
    : statusRaw === 'cancelled' || statusRaw === 'rejected'
      ? 'declined'
      : 'pending_review';
  return {
    id: request.id,
    quoteNumber: request.requestNumber,
    requestDate: request.created_at ?? '',
    requiredByDate: request.requestedDeliveryDate ?? request.requested_delivery_date ?? '',
    items: (request.items ?? []).map(mapRequestItemToQuoteItem),
    status,
    estimatedTotal: request.total,
    adminNotes: request.notes ?? undefined,
    deliveryLocation: '',
    priority: 'standard',
  };
}

/** ERP request row → Sasa Order (the request must still be confirmed into an order). */
function mapRequestToOrder(request: ErpRequest): Order {
  const items: OrderItem[] = (request.items ?? []).map((item) => ({
    productId: item.productId ?? item.product_id ?? '',
    productName: item.name ?? item.description ?? 'Item',
    quantity: item.quantity ?? item.qty ?? 1,
    unitPrice: item.unitPrice ?? item.price ?? 0,
    total: item.lineTotal ?? (item.quantity ?? 1) * (item.unitPrice ?? item.price ?? 0),
  }));
  return {
    id: request.id,
    orderNumber: request.requestNumber,
    date: request.created_at ?? '',
    items,
    totalAmount: request.total ?? 0,
    status: 'pending',
    deliveryAddress: '',
    paymentMethod: '',
    estimatedDelivery: request.requestedDeliveryDate ?? request.requested_delivery_date ?? '',
  };
}

export class ErpPortalService implements PortalService {
  private readonly client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  // ── Current customer / account ────────────────────────────────────────────

  async getCurrentCustomer(): Promise<AccountProfile> {
    const profile = await this.client.get<ErpProfile>('/portal/profile');
    let tier = 'Standard';
    try {
      const loyalty = await this.client.get<ErpLoyalty>('/portal/loyalty');
      tier = loyalty.tier || 'Standard';
    } catch {
      // Tier is display-only — profile data still loads when loyalty is down.
    }
    const addressParts = [profile.address, profile.city, profile.state, profile.zip, profile.country].filter(Boolean);
    return {
      id: profile.id,
      customerName: profile.full_name,
      accountNumber: profile.id, // the real ERP customer id
      companyName: profile.full_name, // ERP profile exposes no separate company field
      email: profile.email,
      phone: profile.phone,
      address: addressParts.join(', '),
      creditLimit: profile.creditLimit,
      currentBalance: profile.balance,
      tier: tier as AccountProfile['tier'],
      accountManager: { name: '', email: '', phone: '', avatar: '' }, // ERP DATA MISSING (§16)
      referralCode: '',
      referralLink: '',
      totalReferralEarned: 0, // referrals blocked pending migrations 0003/0004
    };
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  //
  // NOTE: Sasa assembles the dashboard client-side from the REAL list
  // endpoints (profile, invoices, shipments, statements — see DashboardTab).
  // The ERP also exposes a composite GET /api/portal/dashboard; it is not used
  // here because the Sasa dashboard contract needs full lists, which the ERP
  // endpoint does not return. No blocked stub is kept: there is no separate
  // dashboard call.

  // ── Invoices & payments ───────────────────────────────────────────────────

  async getInvoices(): Promise<Invoice[]> {
    const data = await this.client.get<ErpInvoiceSummary[] | { invoices: ErpInvoiceSummary[] }>('/portal/invoices');
    const list = Array.isArray(data) ? data : data.invoices;
    return list.map(mapInvoice);
  }

  async getInvoiceDetail(invoiceId: string): Promise<Invoice> {
    const raw = await this.client.get<Record<string, unknown>>(`/portal/invoices/${invoiceId}`);
    const itemsRaw = Array.isArray(raw.items)
      ? (raw.items as Array<Record<string, unknown>>)
      : Array.isArray(raw.line_items)
        ? (raw.line_items as Array<Record<string, unknown>>)
        : [];
    const items: InvoiceItem[] = itemsRaw.map((item, idx) => ({
      id: `ii_${idx}`,
      description: String(item.description ?? item.name ?? item.item_name ?? ''),
      quantity: Number(item.quantity ?? 0),
      unitPrice: Number(item.unitPrice ?? item.unit_price ?? 0),
      total: Number(item.total ?? item.lineTotal ?? item.line_total ?? 0),
    }));
    const totalAmount = Number(raw.total_amount ?? raw.totalAmount ?? 0);
    const paidAmount = Number(raw.paid_amount ?? raw.paidAmount ?? 0);
    return {
      id: invoiceId,
      invoiceNumber: String(raw.invoice_number ?? raw.invoiceNumber ?? invoiceId),
      issueDate: String(raw.created_at ?? raw.issueDate ?? ''),
      dueDate: String(raw.due_date ?? raw.dueDate ?? ''),
      amount: totalAmount,
      amountPaid: paidAmount,
      amountRemaining: Math.max(0, totalAmount - paidAmount),
      status: normalizeInvoiceStatus(String(raw.status ?? '')),
      items,
      notes: typeof raw.notes === 'string' ? raw.notes : undefined,
      pdfUrl: undefined, // no server-side PDF endpoint (§16 ERP gap list)
    };
  }

  async getPayments(): Promise<Payment[]> {
    const data = await this.client.get<ErpPaymentRecord[] | { payments: ErpPaymentRecord[] }>('/portal/payments');
    const list = Array.isArray(data) ? data : data.payments;
    return list.map(mapPayment);
  }

  async submitPayment(payload: ErpPaymentRequest): Promise<ErpPaymentResult> {
    return this.client.post<ErpPaymentResult>('/portal/payments', payload);
  }

  async getPaymentIntent(invoiceId: string, amount: number): Promise<ErpPaymentIntent> {
    return this.client.post<ErpPaymentIntent>('/portal/payments/intent', { invoiceId, amount });
  }

  // ── Payment requests (NON-ACCOUNTING bank-transfer intentions) ───────────
  //
  // Verified ERP contract: POST/GET /api/portal/payment-requests and
  // GET /api/portal/payment-requests/:id. Customer identity is derived by the
  // ERP from the portal JWT — the payload carries ONLY { invoiceId,
  // requestedAmount, note }. Creating a request never records a payment,
  // allocates funds, touches Stripe, or modifies the invoice.

  async getPaymentRequests(): Promise<PaymentRequest[]> {
    const data = await this.client.get<ErpPaymentRequestRecord[] | { paymentRequests: ErpPaymentRequestRecord[] }>(
      '/portal/payment-requests'
    );
    const list = Array.isArray(data) ? data : data.paymentRequests;
    return (list ?? []).map(mapPaymentRequest);
  }

  async getPaymentRequest(paymentRequestId: string): Promise<PaymentRequest> {
    const record = await this.client.get<ErpPaymentRequestRecord>(`/portal/payment-requests/${paymentRequestId}`);
    return mapPaymentRequest(record);
  }

  async createPaymentRequest(payload: ErpPaymentRequestCreatePayload): Promise<PaymentRequest> {
    const record = await this.client.post<ErpPaymentRequestRecord>('/portal/payment-requests', {
      invoiceId: payload.invoiceId,
      requestedAmount: payload.requestedAmount,
      note: payload.note || undefined,
    });
    return mapPaymentRequest(record);
  }

  // ── Orders (created through the ERP request pipeline) ─────────────────────

  async getOrders(): Promise<Order[]> {
    const data = await this.client.get<ErpOrder[] | { orders: ErpOrder[] }>('/portal/orders');
    const list = Array.isArray(data) ? data : data.orders;
    return list.map(mapOrder);
  }

  /**
   * Creates an order by submitting an ERP 'order' request.
   * The ERP re-prices every line server-side (browser prices are only kept for
   * genuine custom line items); `deliveryAddress` and `paymentTerms` have no
   * dedicated ERP request fields and are folded into the request notes.
   */
  async createOrder(payload: NewOrderPayload): Promise<Order> {
    const notes = [
      payload.deliveryAddress ? `Delivery address: ${payload.deliveryAddress}` : null,
      payload.paymentTerms ? `Payment terms: ${payload.paymentTerms}` : null,
    ]
      .filter(Boolean)
      .join('. ') || undefined;
    const request = await this.client.post<ErpRequest>('/portal/requests', {
      requestType: 'order',
      items: payload.items.map((item) => ({
        productId: item.productId || undefined,
        name: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      notes,
    });
    return mapRequestToOrder(request);
  }

  /** Re-submits an existing order through the ERP reorder pipeline. */
  async reorderOrder(orderId: string): Promise<Order> {
    const result = await this.client.post<ErpReorderResult>(`/portal/orders/${orderId}/reorder`);
    return {
      id: result.id,
      orderNumber: result.requestNumber,
      date: new Date().toISOString(),
      items: [],
      totalAmount: 0,
      status: 'pending',
      deliveryAddress: '',
      paymentMethod: '',
      estimatedDelivery: '',
    };
  }

  // ── Quotations (formal, READY) ────────────────────────────────────────────

  async getQuotations(): Promise<Quotation[]> {
    const data = await this.client.get<ErpQuotation[] | { quotations: ErpQuotation[] }>('/portal/quotations');
    const list = Array.isArray(data) ? data : data.quotations;
    return list.map(mapQuotation);
  }

  async acceptQuotation(quotationId: string): Promise<void> {
    await this.client.post<{ id: string; status: string }>(`/portal/quotations/${quotationId}/accept`);
  }

  async rejectQuotation(quotationId: string, reason?: string): Promise<void> {
    await this.client.post<{ id: string; status: string }>(`/portal/quotations/${quotationId}/reject`, {
      reason: reason || undefined,
    });
  }

  async requestQuotationRevision(quotationId: string, comments?: string): Promise<void> {
    await this.client.post<{ id: string; status: string }>(`/portal/quotations/${quotationId}/revision`, {
      comments: comments || undefined,
    });
  }

  // ── Quotation requests / RFQs (ERP request pipeline) ──────────────────────

  async getQuoteRequests(): Promise<QuoteRequest[]> {
    const data = await this.client.get<ErpRequest[] | { requests: ErpRequest[] }>('/portal/requests');
    const list = Array.isArray(data) ? data : data.requests;
    return list
      .filter((request) => (request.requestType ?? request.request_type) !== 'order')
      .map(mapRequestToQuoteRequest);
  }

  async submitQuoteRequest(payload: NewQuoteRequestPayload): Promise<QuoteRequest> {
    const notes = [
      payload.notes,
      payload.deliveryLocation ? `Delivery location: ${payload.deliveryLocation}` : null,
    ]
      .filter(Boolean)
      .join('. ') || undefined;
    const request = await this.client.post<ErpRequest>('/portal/requests', {
      requestType: 'quotation',
      items: payload.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.targetPrice,
      })),
      notes,
      requestedDeliveryDate: payload.requiredByDate || undefined,
    });
    return mapRequestToQuoteRequest(request);
  }

  // ── Deliveries / shipments ────────────────────────────────────────────────

  async getDeliveries(): Promise<DeliveryNotification[]> {
    const data = await this.client.get<ErpShipment[] | { shipments: ErpShipment[] }>('/portal/shipments');
    const list = Array.isArray(data) ? data : data.shipments;
    return list.map(mapShipment);
  }

  // ── Statements ────────────────────────────────────────────────────────────

  async getStatements(startDate?: string, endDate?: string): Promise<StatementEntry[]> {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const query = params.toString();
    const path = query ? `/portal/statements?${query}` : '/portal/statements';
    const statement = await this.client.get<ErpStatement>(path);
    return mapStatement(statement);
  }

  // ── Referrals — blocked: Sasa's invite flow does not match the ERP ────────
  //
  // The ERP referral API exists and is LIVE (GET/POST /portal/referrals,
  // /portal/referrals/rewards, /settings, /stats), but it refers EXISTING
  // customers by their ERP customer id (searched via /portal/referrals/customers/search).
  // Sasa's ReferralInvitePayload (name/company/email of a NEW contact) does not
  // map to the ERP contract, and reward claiming is ERP-ADMIN approved — there
  // is no customer claim endpoint. These stay UNAVAILABLE instead of being
  // fabricated or half-wired.

  getReferrals(): Promise<Referral[]> {
    return blocked(
      'Referrals',
      'The ERP referral list is live, but Sasa models referrals as email invitations while the ERP refers existing customers by id. The Sasa referral screen must be rebuilt around the ERP contract before it can be enabled.'
    );
  }

  sendReferralInvite(): Promise<Referral> {
    return blocked(
      'Sending a referral invitation',
      'The ERP only refers existing customers by their ERP customer id (POST /portal/referrals requires referredCustomerId). Sasa\u2019s name/email invite form cannot be sent to the ERP — the invite flow must be redesigned around the ERP contract.'
    );
  }

  claimReferralReward(): Promise<Referral> {
    return blocked(
      'Claiming a referral reward',
      'The ERP has no customer-facing claim endpoint — referral rewards are approved and credited by ERP staff (PATCH /api/referrals/rewards/:id/approve).'
    );
  }

  // ── Catalog / products ────────────────────────────────────────────────────

  async getCatalog(): Promise<Product[]> {
    const data = await this.client.get<ErpCatalogItem[] | { catalog: ErpCatalogItem[] }>('/portal/catalog');
    const list = Array.isArray(data) ? data : data.catalog;
    return list.map(mapCatalogItem);
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  async getNotifications(): Promise<PortalNotification[]> {
    const data = await this.client.get<ErpNotification[] | { notifications: ErpNotification[] }>('/portal/notifications');
    const list = Array.isArray(data) ? data : data.notifications;
    return list.map(mapNotification);
  }

  async getUnreadNotificationCount(): Promise<number> {
    const data = await this.client.get<{ count: number }>('/portal/notifications/unread-count');
    return data.count ?? 0;
  }

  async markNotificationsRead(ids: string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.client.put<{ success: boolean }>(`/portal/notifications/${id}/read`, {})));
  }

  async markAllNotificationsRead(): Promise<void> {
    await this.client.put<{ success: boolean }>('/portal/notifications/read-all', {});
  }

  // ── Loyalty ───────────────────────────────────────────────────────────────

  async getLoyalty(): Promise<ErpLoyalty> {
    return this.client.get<ErpLoyalty>('/portal/loyalty');
  }

  // ── Advertisements (ERP portal banner ads — dashboard carousel) ───────────
  //
  // The ERP serves display-ready banner ads at GET /portal/ads (company-scoped
  // via the customer's companyId, active + date-filtered server-side, sorted
  // by priority). Sasa renders exactly what the ERP returns — no fallback or
  // fabricated promotional content.

  async getAds(): Promise<PortalAd[]> {
    const data = await this.client.get<ErpPortalAd[] | { ads: ErpPortalAd[] }>('/portal/ads');
    const list = Array.isArray(data) ? data : data.ads;
    return list.map(mapAd);
  }
}

/**
 * Selects the active Portal service from the environment configuration.
 * The real ERP implementation is the default. The mock implementation is only
 * active when VITE_ENABLE_MOCK_API=true AND VITE_USE_REAL_BACKEND is not 'true'.
 * Production never silently falls back to mock data.
 */
export function createPortalService(): PortalService {
  if (!env.useRealBackend && env.enableMockApi) {
    return new MockPortalService();
  }
  const client = authService.getApiClient?.() ?? null;
  if (!client) {
    // Cannot happen in the real-backend path; guard keeps typing honest.
    throw new ApiError('The ERP API client is not available.', { code: 'NOT_CONFIGURED' });
  }
  return new ErpPortalService(client);
}

/** Application-wide Portal service singleton. */
export const portalService: PortalService = createPortalService();
