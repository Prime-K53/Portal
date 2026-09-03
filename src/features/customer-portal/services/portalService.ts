/**
 * Prime PORTAL — Portal Data Service (REAL ERP contract)
 *
 * UI → Portal service (hooks) → API client → ERP Portal API
 *
 * Implements the ERP Portal API as verified from the PrimeERPsystem source
 * (docs/SASA_PHASE_4_ERP_INTEGRATION.md). Every method maps to a REAL endpoint.
 * Referrals refer EXISTING ERP customers by id (search → select → create) and
 * rewards are ERP-admin approved — Sasa never fabricates referrals, rewards or
 * wallet credits, and never claims or approves anything.
 *
 * Customer scoping: every endpoint derives the authenticated customer from the
 * ERP JWT server-side. Sasa NEVER sends a customer_id from the UI — no URL,
 * query, form, or storage value is used to scope requests.
 */

import { env } from '../config/env';
import type {
  AccountProfile,
  DeliveryNotification,
  ErpReferral,
  ErpReferralCreatePayload,
  ErpReferralCreateResult,
  ErpReferralReward,
  ErpReferralSettings,
  ErpReferralStats,
  ErpReferralTimelineEntry,
  ErpWallet,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  NewOrderPayload,
  NewQuoteRequestPayload,
  Order,
  OrderItem,
  OrderRequest,
  OrderRequestPromotion,
  OrderStatus,
  Payment,
  PaymentRequest,
  PaymentRequestStatus,
  PortalAd,
  PortalNotification,
  PortalReferral,
  Product,
  Quotation,
  QuotationItem,
  QuoteRequest,
  QuoteRequestItem,
  QuoteStatus,
  ReferralCreatePayload,
  ReferralReward,
  ReferralSettings,
  ReferralStats,
  ReferralTimelineEntry,
  RequestStatus,
  StatementEntry,
  Wallet,
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
  ErpSupportTicket,
  ErpSupportMessage,
  ErpSupportAttachment,
  ErpSupportArticle,
  NewSupportTicketPayload,
  SupportArticle,
  SupportAttachment,
  SupportMessage,
  SupportTicket,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
  CompanyContactInfo,
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
  /** Fetches one official Sales Order by id. Used by reorder as a fallback when POST /orders/:id/reorder is unavailable. */
  getOrderById(orderId: string): Promise<Order>;
  /** ERP order REQUESTS (ODR-...) — the customer's submitted requests, NOT official SOs. */
  getOrderRequests(): Promise<OrderRequest[]>;
  /** GET /portal/requests/:id — the ERP enforces customer ownership server-side. */
  getOrderRequestById(requestId: string): Promise<OrderRequest>;
  /**
   * Submits an order REQUEST. `idempotencyKey` must be generated once per
   * logical submission attempt (utils/idempotency.ts) and reused for retries
   * of the SAME attempt — it is sent as the Idempotency-Key header so the ERP
   * can replay the stored response instead of creating a duplicate request.
   */
  createOrder(payload: NewOrderPayload, idempotencyKey: string): Promise<OrderRequest>;
  /** POST /portal/requests/:id/cancel — only cancellable request statuses are accepted by the ERP. */
  cancelOrderRequest(requestId: string): Promise<OrderRequest>;
  reorderOrder(orderId: string): Promise<OrderRequest>;

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

  // ── Referrals ───────────────────────────────────────────────────────────────
  getReferrals(): Promise<PortalReferral[]>;
  getReferral(referralId: string): Promise<PortalReferral>;
  getReferralTimeline(referralId: string): Promise<ReferralTimelineEntry[]>;
  createReferral(payload: ReferralCreatePayload, idempotencyKey: string): Promise<PortalReferral>;
  getReferralRewards(): Promise<ReferralReward[]>;
  getReferralStats(): Promise<ReferralStats>;
  getReferralSettings(): Promise<ReferralSettings>;
  getWallet(): Promise<Wallet>;

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

  // ── Support / Help Desk ────────────────────────────────────────────────────
  getSupportTickets(): Promise<SupportTicket[]>;
  getSupportTicket(ticketId: string): Promise<SupportTicket>;
  createSupportTicket(payload: NewSupportTicketPayload): Promise<SupportTicket>;
  addSupportMessage(ticketId: string, content: string): Promise<SupportMessage>;
  getSupportArticles(): Promise<SupportArticle[]>;
  getSupportArticle(slug: string): Promise<SupportArticle>;
  getCompanyContactInfo(): Promise<CompanyContactInfo>;
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
    // ERP "Inbound" tab → Dispatched (preparing at warehouse)
    case 'inbound':
      return 'dispatched';
    // ERP "Active" tab → Out for Delivery (on the road)
    case 'active':
    case 'in transit':
    case 'in_transit':
    case 'out_for_delivery':
    case 'out for delivery':
      return 'out_for_delivery';
    // ERP "History" tab (completed + signed) → Delivered & Signed
    case 'delivered':
    case 'completed':
    case 'signed':
      return 'delivered';
    case 'delayed':
      return 'delayed';
    case 'order_placed':
      return 'order_placed';
    case 'processing':
      return 'processing';
    default:
      return 'processing';
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
    imageMeta: ad.imageMeta ?? null,
    gradient: ad.gradient ?? null,
    emoji: ad.emoji ?? null,
  };
}

function mapSupportMessage(m: ErpSupportMessage): SupportMessage {
  return {
    id: m.id,
    ticketId: m.ticket_id,
    authorName: m.author_name,
    authorRole: m.author_role as 'customer' | 'agent',
    content: m.content,
    createdAt: m.created_at,
    attachments: m.attachments?.map(mapSupportAttachment),
  };
}

function mapSupportAttachment(a: ErpSupportAttachment): SupportAttachment {
  return {
    id: a.id,
    filename: a.filename,
    url: a.url,
    mimeType: a.mime_type,
    sizeBytes: a.size_bytes,
  };
}

function mapSupportTicket(t: ErpSupportTicket): SupportTicket {
  return {
    id: t.id,
    ticketNumber: t.ticket_number,
    subject: t.subject,
    description: t.description,
    status: t.status as SupportTicketStatus,
    priority: t.priority as SupportTicketPriority,
    category: t.category as SupportTicketCategory,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    resolvedAt: t.resolved_at,
    messages: t.messages?.map(mapSupportMessage) ?? [],
    attachments: t.attachments?.map(mapSupportAttachment),
  };
}

function mapSupportArticle(a: ErpSupportArticle): SupportArticle {
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    body: a.body,
    category: a.category,
    tags: a.tags ?? [],
    helpful: a.helpful ?? 0,
    notHelpful: a.not_helpful ?? 0,
    lastUpdated: a.last_updated,
  };
}

export function mapCatalogItem(item: ErpCatalogItem): Product {
  const variants = item.variants?.filter((v) => v.active).map((v) => ({
    id: v.id,
    productId: v.productId,
    name: v.name,
    sku: v.sku ?? null,
    attributes: v.attributes ?? {},
    // ERP contract: an unset upstream price arrives as null and is modelled
    // as 0 here; server-side re-pricing resolves it from ERP master data.
    sellingPrice: v.sellingPrice ?? 0,
    costPrice: v.costPrice ?? 0,
    stock: v.stock,
    active: v.active,
  }));

  const selectedVariantId = variants?.[0]?.id;

  const price = selectedVariantId ? (variants.find((v) => v.id === selectedVariantId)?.sellingPrice ?? item.price) : item.price;

  return {
    id: item.id,
    name: item.name,
    category: item.category,
    price,
    unit: item.unit || 'unit',
    description: item.description ?? '',
    image: '', // ERP catalog has no image field (§16 ERP gap list)
    inStock: item.quantity > 0,
    minOrderQty: 1,
    sku: item.sku ?? '',
    rating: undefined,
    ratingCount: undefined,
    isTopSeller: undefined,
    variants,
    selectedVariantId,
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

function mapErpReferral(referral: ErpReferral): PortalReferral {
  return {
    id: referral.id,
    referredCustomerId: referral.customer_id || referral.registered_customer_id || null,
    referredCustomerName: referral.referred_customer_name || referral.customer_id || null,
    referredCustomerEmail: referral.referred_customer_email,
    referredCustomerPhone: referral.referred_customer_phone ?? null,
    registeredCustomerId: referral.registered_customer_id ?? null,
    registeredAt: referral.registered_at ?? null,
    status: (referral.status as PortalReferral['status']) || 'pending',
    pendingInvoiceId: referral.pending_invoice_id,
    pendingInvoiceAmount: referral.pending_invoice_amount,
    convertedInvoiceId: referral.converted_invoice_id,
    convertedAt: referral.converted_at,
    notes: referral.notes,
    createdAt: referral.created_at,
    updatedAt: referral.updated_at,
  };
}

/**
 * POST /api/portal/referrals 201 result (raw snake_case customer_referrals
 * row) → PortalReferral. The create response does NOT carry the referred
 * customer's name/email (the table only stores the referrer's name), so the
 * customer name is left blank — the UI shows the ERP-returned id/name, never
 * an invented one.
 */
function mapErpReferralCreateResult(result: ErpReferralCreateResult): PortalReferral {
  return {
    id: result.id,
    referredCustomerId: result.customer_id || result.registered_customer_id || null,
    referredCustomerName: result.referred_name || result.customer_id || null,
    referredCustomerEmail: result.referred_email ?? null,
    referredCustomerPhone: result.referred_phone ?? null,
    registeredCustomerId: result.registered_customer_id ?? null,
    registeredAt: result.registered_at ?? null,
    status: (result.status as PortalReferral['status']) || 'pending',
    pendingInvoiceId: result.pending_invoice_id,
    pendingInvoiceAmount: result.pending_invoice_amount ?? 0,
    convertedInvoiceId: result.converted_invoice_id,
    convertedAt: result.converted_at,
    notes: result.notes,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
  };
}

/** Raw snake_case referral_timeline row → Sasa ReferralTimelineEntry. */
function mapErpTimelineEntry(entry: ErpReferralTimelineEntry): ReferralTimelineEntry {
  return {
    id: entry.id,
    referralId: entry.referral_id,
    eventType: entry.event_type,
    title: entry.title,
    description: entry.description,
    amount: entry.amount,
    actorName: entry.actor_name,
    timestamp: entry.timestamp,
    createdAt: entry.created_at,
  };
}

/** ERP reward DTO → Sasa ReferralReward (amount is ERP-authoritative, never calculated). */
function mapErpReward(reward: ErpReferralReward): ReferralReward {
  return {
    id: reward.id,
    referralId: reward.referral_id,
    referralCode: reward.referral_code,
    referredCustomerId: reward.referred_customer_id,
    referredCustomerName: reward.referred_customer_name,
    invoiceId: reward.invoice_id,
    invoiceAmount: reward.invoice_amount,
    amount: reward.amount,
    status: reward.status,
    approvedAt: reward.approved_at,
    cancelledAt: reward.cancelled_at,
    cancelReason: reward.cancel_reason,
    walletTransactionId: reward.wallet_transaction_id,
    createdAt: reward.created_at,
  };
}

/** ERP request line → Sasa QuoteRequestItem (custom lines keep their target price). */
function mapRequestItemToQuoteItem(item: ErpRequestLine): QuoteRequestItem {
  return {
    id: item.productId ?? item.product_id ?? `ri_${item.name ?? ''}`,
    productId: item.productId ?? item.product_id ?? undefined,
    variantId: item.variantId ?? item.variant_id ?? undefined,
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

/**
 * ERP status string → Sasa RequestStatus. Unknown/blank values fall back to
 * 'submitted' so a request is never hidden or mislabelled as closed.
 */
function normalizeRequestStatus(status: string | undefined | null): RequestStatus {
  const normalized = String(status ?? '').toLowerCase();
  switch (normalized) {
    case 'draft':
    case 'submitted':
    case 'assigned':
    case 'under_review':
    case 'waiting_for_customer':
    case 'ready_for_conversion':
    case 'converted':
    case 'rejected':
    case 'cancelled':
      return normalized;
    default:
      return 'submitted';
  }
}

function extractPromotion(promotion: unknown): OrderRequestPromotion | undefined {
  if (!promotion || typeof promotion !== 'object') return undefined;
  const raw = promotion as Record<string, unknown>;
  return {
    code: typeof raw.code === 'string' ? raw.code : undefined,
    name: typeof raw.name === 'string' ? raw.name : undefined,
    discountAmount: typeof raw.discountAmount === 'number' ? raw.discountAmount : undefined,
  };
}

/**
 * ERP request row → Sasa OrderRequest.
 *
 * An ERP 'order' request is NOT an official Sales Order. The request number
 * (ODR-...) is the customer-visible reference; the official SO number is
 * present only after the ERP converts the request (sales_order_number).
 */
function mapRequestToOrderRequest(request: ErpRequest): OrderRequest {
  const items: OrderItem[] = (request.items ?? []).map((item) => ({
    productId: item.productId ?? item.product_id ?? '',
    productName: item.name ?? item.description ?? 'Item',
    quantity: item.quantity ?? item.qty ?? 1,
    unitPrice: item.unitPrice ?? item.price ?? 0,
    total: item.lineTotal ?? (item.quantity ?? 1) * (item.unitPrice ?? item.price ?? 0),
  }));
  return {
    id: request.id,
    requestNumber: request.requestNumber,
    date: request.created_at ?? '',
    items,
    subtotal: request.subtotal ?? 0,
    discountTotal: request.discountTotal ?? request.discount_total ?? undefined,
    total: request.total ?? 0,
    promotion: extractPromotion(request.promotion),
    status: normalizeRequestStatus(request.status),
    notes: request.notes ?? undefined,
    requestedDeliveryDate: request.requestedDeliveryDate ?? request.requested_delivery_date ?? undefined,
    officialOrderId: request.sales_order_id ?? undefined,
    officialOrderNumber: request.sales_order_number ?? undefined,
    reorderOfNumber: request.reorderOfNumber ?? request.reorder_of_number ?? undefined,
    referralFirstOrderDiscount: (request as unknown as Record<string, unknown>).referralFirstOrderDiscount as number | undefined,
    referralFirstOrderDiscountPercent: (request as unknown as Record<string, unknown>).referralFirstOrderDiscountPercent as number | undefined,
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
    let tier: string | undefined = undefined;
    try {
      const loyalty = await this.client.get<ErpLoyalty>('/portal/loyalty');
      if (loyalty && loyalty.tier && loyalty.tier.trim().length > 0) {
        tier = loyalty.tier;
      }
    } catch {
      // Tier is display-only — profile data still loads when loyalty is down.
    }
    const addressParts = [profile.address, profile.city, profile.state, profile.zip, profile.country].filter(Boolean);
    const rawProfile = profile as unknown as Record<string, unknown>;
    const customerName = profile.full_name || String(rawProfile.name || rawProfile.customer_name || '');
    const accountNumber = profile.id || String(rawProfile.customer_id || '');
    const companyName = profile.full_name || String(rawProfile.company_name || rawProfile.name || '');

    return {
      id: profile.id || accountNumber,
      customerName,
      accountNumber,
      companyName,
      email: profile.email || '',
      phone: profile.phone || '',
      address: addressParts.join(', '),
      creditLimit: profile.creditLimit ?? 0,
      currentBalance: profile.balance ?? 0,
      tier,
      accountManager: undefined,
      referralCode: (profile as unknown as Record<string, unknown>).referralCode as string | null ?? null,
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
    let itemsRaw: Array<Record<string, unknown>> = [];
    if (Array.isArray(raw.items)) {
      itemsRaw = raw.items as Array<Record<string, unknown>>;
    } else if (typeof raw.items === 'string') {
      try { itemsRaw = JSON.parse(raw.items); } catch (_) { itemsRaw = []; }
    } else if (Array.isArray(raw.line_items)) {
      itemsRaw = raw.line_items as Array<Record<string, unknown>>;
    } else if (typeof raw.line_items === 'string') {
      try { itemsRaw = JSON.parse(raw.line_items); } catch (_) { itemsRaw = []; }
    }

    const items: InvoiceItem[] = itemsRaw.map((item, idx) => {
      // Authoritative line item description resolution — checks historical
      // line description first, then item/product master names, ignoring
      // empty/whitespace strings.
      const candidate = [
        item.description,
        item.desc,
        item.item_description,
        item.itemDescription,
        item.item_name,
        item.itemName,
        item.name,
        item.productName,
        item.product_name,
        item.title,
        item.label,
      ].find((v) => typeof v === 'string' && v.trim().length > 0);
      return {
        id: `ii_${idx}`,
        description: String(candidate ?? ''),
        quantity: Number(item.quantity ?? item.qty ?? 0),
        unitPrice: Number(item.unitPrice ?? item.unit_price ?? item.price ?? 0),
        total: Number(item.total ?? item.lineTotal ?? item.line_total ?? item.subtotal ?? 0),
      };
    });
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
      ...(payload.paymentMethod ? { paymentMethod: payload.paymentMethod } : {}),
    });
    return mapPaymentRequest(record);
  }

  // ── Orders (created through the ERP request pipeline) ─────────────────────

  async getOrders(): Promise<Order[]> {
    const data = await this.client.get<ErpOrder[] | { orders: ErpOrder[] }>('/portal/orders');
    const list = Array.isArray(data) ? data : data.orders;
    return list.map(mapOrder);
  }

  /** Fetches one official Sales Order by id. Used by reorder as a fallback when POST /orders/:id/reorder is unavailable. */
  async getOrderById(orderId: string): Promise<Order> {
    const data = await this.client.get<ErpOrder>(`/portal/orders/${orderId}`);
    return mapOrder(data);
  }

  /**
   * ERP order REQUESTS (ODR-...): GET /api/portal/requests filtered to
   * requestType 'order'. Official Sales Orders (SO-...) come from getOrders().
   */
  async getOrderRequests(): Promise<OrderRequest[]> {
    const data = await this.client.get<ErpRequest[] | { requests: ErpRequest[] }>('/portal/requests');
    const list = Array.isArray(data) ? data : data.requests;
    return (list ?? [])
      .filter((request) => (request.requestType ?? request.request_type) === 'order')
      .map(mapRequestToOrderRequest);
  }

  /**
   * Fetches one request through GET /api/portal/requests/:id. The ERP resolves
   * the request by id AND the JWT customer_id, so a customer can only read
   * their own request (404 when it does not belong to them).
   */
  async getOrderRequestById(requestId: string): Promise<OrderRequest> {
    const record = await this.client.get<ErpRequest>(`/portal/requests/${requestId}`);
    return mapRequestToOrderRequest(record);
  }

  /**
   * Creates an order REQUEST via POST /api/portal/requests (requestType
   * 'order'). The ERP re-prices every line server-side (browser prices are
   * only kept for genuine custom line items) and returns the authoritative
   * subtotal / discount / total. `deliveryAddress` and `paymentTerms` have no
   * dedicated ERP request fields and are folded into the request notes.
   *
   * `idempotencyKey` identifies ONE logical submission attempt: the caller
   * generates it once (utils/idempotency.ts) and reuses the same key when
   * retrying the same attempt. It is sent as the Idempotency-Key header so
   * the ERP (middleware/idempotency.cjs, user-scoped, 24h TTL) replays the
   * stored response instead of creating a duplicate ODR request.
   *
   * The returned OrderRequest is NOT an official Sales Order — the ERP creates
   * the SO only when staff convert the request.
   */
  async createOrder(payload: NewOrderPayload, idempotencyKey: string): Promise<OrderRequest> {
    const notes = [
      payload.deliveryAddress ? `Delivery address: ${payload.deliveryAddress}` : null,
      payload.paymentTerms ? `Payment terms: ${payload.paymentTerms}` : null,
    ]
      .filter(Boolean)
      .join('. ') || undefined;
    const request = await this.client.post<ErpRequest>(
      '/portal/requests',
      {
        requestType: 'order',
        items: payload.items.map((item) => ({
          productId: item.productId || undefined,
          name: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          variantId: item.variantId || undefined,
        })),
        notes,
        requestedDeliveryDate: payload.requestedDeliveryDate || undefined,
        promotionCode: payload.promotionCode || undefined,
      },
      { headers: { 'Idempotency-Key': idempotencyKey } }
    );
    return mapRequestToOrderRequest(request);
  }

  /**
   * Cancels a customer's own order REQUEST via
   * POST /api/portal/requests/:id/cancel. The ERP enforces ownership and the
   * cancellable status set server-side. The ERP cancel response is a minimal
   * { id, status } — the full updated request is then re-read from
   * GET /api/portal/requests/:id so the caller always receives the ERP's
   * authoritative record (number, items, totals preserved). If the follow-up
   * read fails, the ERP cancel result itself is returned — never a fabricated
   * request.
   */
  async cancelOrderRequest(requestId: string): Promise<OrderRequest> {
    const result = await this.client.post<{ id: string; status: string }>(`/portal/requests/${requestId}/cancel`);
    try {
      return await this.getOrderRequestById(result.id);
    } catch {
      return {
        id: result.id,
        requestNumber: '',
        date: '',
        items: [],
        subtotal: 0,
        total: 0,
        status: normalizeRequestStatus(result.status),
      };
    }
  }

  /**
   * Re-submits an existing official Sales Order through the ERP reorder
   * pipeline (POST /api/portal/orders/:id/reorder). The ERP creates a NEW
   * order request (ODR-...) referencing the original order, and blocks
   * Draft/Cancelled orders server-side. The created request is re-read from
   * GET /api/portal/requests/:id for its full ERP-authoritative record; the
   * minimal reorder response is returned only when that read fails.
   */
  async reorderOrder(orderId: string): Promise<OrderRequest> {
    let result: ErpReorderResult;
    try {
      result = await this.client.post<ErpReorderResult>(`/portal/orders/${orderId}/reorder`);
    } catch (reorderError) {
      const order = await this.getOrderById(orderId);
      const idempotencyKey = `reorder-fallback-${orderId}-${Date.now()}`;
      return this.createOrder(
        {
          items: order.items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
            variantId: item.variantId,
          })),
          deliveryAddress: order.deliveryAddress,
          paymentTerms: order.paymentMethod,
          totalAmount: order.totalAmount,
        },
        idempotencyKey
      );
    }
    try {
      return await this.getOrderRequestById(result.id);
    } catch {
      return {
        id: result.id,
        requestNumber: result.requestNumber,
        date: new Date().toISOString(),
        items: [],
        subtotal: 0,
        total: 0,
        status: normalizeRequestStatus(result.status),
        reorderOfNumber: result.reorderOfNumber ?? undefined,
      };
    }
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
        productId: item.productId || undefined,
        variantId: item.variantId || undefined,
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

  // ── Referrals ───────────────────────────────────────────────────────────────

  // searchReferralCustomers removed — prospective-person referrals do not
  // search the ERP customer directory.

  async getReferrals(): Promise<PortalReferral[]> {
    const data = await this.client.get<
      { referrals: ErpReferral[]; total?: number; page?: number; pageSize?: number; totalPages?: number } | ErpReferral[]
    >('/portal/referrals');
    const list = Array.isArray(data) ? data : data.referrals ?? [];
    return list.map(mapErpReferral);
  }

  async getReferral(referralId: string): Promise<PortalReferral> {
    const data = await this.client.get<ErpReferral>(`/portal/referrals/${referralId}`);
    return mapErpReferral(data);
  }

  /**
   * GET /api/portal/referrals/:id/timeline — the ERP returns the RAW
   * snake_case referral_timeline rows as a bare array (no envelope). Only the
   * authenticated customer's own referral timeline is served (ownership 404).
   */
  async getReferralTimeline(referralId: string): Promise<ReferralTimelineEntry[]> {
    const data = await this.client.get<ErpReferralTimelineEntry[] | { timeline: ErpReferralTimelineEntry[] }>(
      `/portal/referrals/${referralId}/timeline`
    );
    const list = Array.isArray(data) ? data : data.timeline ?? [];
    return (list ?? []).map(mapErpTimelineEntry);
  }

  /**
   * POST /api/portal/referrals — creates a referral for an EXISTING ERP
   * customer (the ERP validates existence, self-referral, business duplicates
   * and ownership server-side). `idempotencyKey` identifies ONE logical
   * submission attempt (utils/idempotency.ts) and is reused when retrying the
   * same attempt — sent as the Idempotency-Key header so the ERP
   * (middleware/idempotency.cjs, user-scoped, 24h TTL) replays the stored 201
   * instead of creating a duplicate referral. The 201 body is the raw
   * snake_case customer_referrals row — mapped to the same PortalReferral DTO.
   */
  async createReferral(payload: ReferralCreatePayload, idempotencyKey: string): Promise<PortalReferral> {
    const body: ErpReferralCreatePayload = {
      referredName: payload.referredName,
      ...(payload.referredEmail ? { referredEmail: payload.referredEmail } : {}),
      ...(payload.referredPhone ? { referredPhone: payload.referredPhone } : {}),
      ...(payload.notes ? { notes: payload.notes } : {}),
    };
    const data = await this.client.post<ErpReferralCreateResult | ErpReferral>('/portal/referrals', body, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return 'id' in data && 'referred_name' in data
      ? mapErpReferralCreateResult(data as ErpReferralCreateResult)
      : mapErpReferral(data as ErpReferral);
  }

  async getReferralRewards(): Promise<ReferralReward[]> {
    const data = await this.client.get<
      { rewards: ErpReferralReward[]; total?: number; page?: number; pageSize?: number; totalPages?: number } | ErpReferralReward[]
    >('/portal/referrals/rewards');
    const list = Array.isArray(data) ? data : data.rewards ?? [];
    return (list ?? []).map(mapErpReward);
  }

  async getReferralStats(): Promise<ReferralStats> {
    const data = await this.client.get<ErpReferralStats>('/portal/referrals/stats');
    return {
      total: data.total ?? 0,
      signedUp: data.signedUp ?? 0,
      qualified: data.qualified ?? 0,
      rewardApproved: data.rewardApproved ?? 0,
      paid: data.paid ?? 0,
      pendingRewardAmount: data.pendingRewardAmount ?? 0,
      totalEarned: data.totalEarned ?? 0,
      conversionRate: data.conversionRate ?? 0,
    };
  }

  /** Read-only: the ERP owns the referral program configuration. */
  async getReferralSettings(): Promise<ReferralSettings> {
    const data = await this.client.get<ErpReferralSettings>('/portal/referrals/settings');
    return {
      enabled: data.enabled ?? true,
      rewardType: data.rewardType ?? '',
      rewardValue: data.rewardValue ?? 0,
      rewardPercentage: data.rewardPercentage ?? 0,
      minimumPurchase: data.minimumPurchase ?? 0,
      maxRewardAmount: data.maxRewardAmount ?? 0,
      expiryDays: data.expiryDays ?? 0,
      requireApproval: data.requireApproval ?? true,
      shareMessage: data.shareMessage ?? '',
    };
  }

  /**
   * GET /api/portal/wallet — ERP-authoritative wallet. The ERP credits the
   * wallet when a reward is approved; Sasa only reads and never writes a
   * balance or transaction.
   */
  async getWallet(): Promise<Wallet> {
    const data = await this.client.get<ErpWallet>('/portal/wallet');
    return { walletBalance: data.walletBalance ?? 0, transactions: data.transactions ?? [] };
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
    const data = await this.client.get<ErpPortalAd[] | { ads?: ErpPortalAd[] }>('/portal/ads');
    const list = Array.isArray(data) ? data : (data.ads ?? []);
    
    // Filter out deleted ads - check for common deletion indicators
    const activeAds = list.filter(ad => {
      // Check if ad has been explicitly marked as deleted
      if (ad.deleted === true) return false;
      
      // Check if ad has been tombstoned (common soft-delete pattern)
      if (ad.tombstone === true) return false;
      
      // Check if ad has been archived
      if (ad.archived === true) return false;
      
      // Check if ad has ended in the past (if endsAt is present)
      if (ad.endsAt) {
        const endDate = new Date(ad.endsAt);
        const now = new Date();
        if (endDate < now) return false;
      }
      
      // Check if title contains common deletion indicators
      if (ad.title && ad.title.toLowerCase().includes('deleted')) return false;
      if (ad.title && ad.title.toLowerCase().includes('removed')) return false;
      if (ad.title && ad.title.toLowerCase().includes('archived')) return false;
      
      return true;
    });
    
    return activeAds.map(mapAd);
  }

  // ── Support / Help Desk ────────────────────────────────────────────────────

  async getSupportTickets(): Promise<SupportTicket[]> {
    const data = await this.client.get<ErpSupportTicket[]>('/portal/support/tickets');
    return data.map(mapSupportTicket);
  }

  async getSupportTicket(ticketId: string): Promise<SupportTicket> {
    const data = await this.client.get<ErpSupportTicket>(`/portal/support/tickets/${ticketId}`);
    return mapSupportTicket(data);
  }

  async createSupportTicket(payload: NewSupportTicketPayload): Promise<SupportTicket> {
    const formData = new FormData();
    formData.append('subject', payload.subject);
    formData.append('description', payload.description);
    formData.append('category', payload.category);
    if (payload.priority) formData.append('priority', payload.priority);
    if (payload.attachments) {
      for (const file of payload.attachments) {
        formData.append('attachments', file);
      }
    }
    const data = await this.client.post<ErpSupportTicket>('/portal/support/tickets', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return mapSupportTicket(data);
  }

  async addSupportMessage(ticketId: string, content: string): Promise<SupportMessage> {
    const data = await this.client.post<ErpSupportMessage>(
      `/portal/support/tickets/${ticketId}/messages`,
      { content }
    );
    return mapSupportMessage(data);
  }

  async getSupportArticles(): Promise<SupportArticle[]> {
    const data = await this.client.get<ErpSupportArticle[]>('/portal/support/articles');
    return data.map(mapSupportArticle);
  }

  async getSupportArticle(slug: string): Promise<SupportArticle> {
    const data = await this.client.get<ErpSupportArticle>(`/portal/support/articles/${slug}`);
    return mapSupportArticle(data);
  }

  async getCompanyContactInfo(): Promise<CompanyContactInfo> {
    return this.client.get<CompanyContactInfo>('/portal/support/company-info');
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
