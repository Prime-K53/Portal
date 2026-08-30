/**
 * Prime PORTAL — Domain Types
 *
 * PROVISIONAL CONTRACT NOTE
 * -------------------------
 * These types describe the customer Portal domain as implemented by the Sasa
 * frontend. The exact shape of the PrimeERPsystem Portal API (Phase 3) may
 * differ. Every type whose shape is not yet locked to the ERP contract is
 * marked `@provisional`. Field names must follow the ERP contract when it is
 * imported — they will NOT be renamed to match this mock-era model.
 */

export type TabType =
  | 'dashboard'
  | 'invoices'
  | 'deliveries'
  | 'orders'
  | 'quotes'
  | 'statements'
  | 'referrals'
  | 'account'
  | 'support';

// ─────────────────────────────────────────────────────────────────────────────
// Identity & Authentication
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A Portal user account (the identity authenticated against the ERP Portal
 * authentication API).
 * @provisional — identity model to be locked to portal_users when the ERP
 * contract is imported. Identity relationship: portal_users.customer_id → customers.id.
 */
export interface PortalUser {
  id: string;
  email: string;
  fullName: string;
  /** ERP customer_id the Portal user is bound to (portal_users.customer_id → customers.id). */
  customerId: string;
  roles?: string[];
  createdAt?: string;
}

/**
 * The ERP customer the authenticated Portal user belongs to.
 * @provisional — customer model to be locked to the ERP customers table.
 */
export interface Customer {
  id: string;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  accountNumber?: string;
  creditLimit?: number;
  currentBalance?: number;
  tier?: string;
}

export interface AuthCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthRegisterInput {
  companyName: string;
  contactName?: string;
  email: string;
  password: string;
  phone?: string;
  tier?: 'Gold Partner' | 'Silver Member' | 'Platinum Preferred';
}

/**
 * Authenticated session envelope. Holds the JWT access token and the identity
 * of the authenticated Portal user. Refresh tokens are NEVER exposed to
 * application code; session refresh is performed inside the auth service.
 * @provisional — session shape to be locked to the ERP authentication contract.
 */
export interface AuthSession {
  accessToken: string;
  user: PortalUser;
  authenticatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Account / Customer Profile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @provisional — account/balance model to be locked to the ERP customers ledger.
 */
export interface AccountProfile {
  id: string;
  customerName: string;
  accountNumber: string;
  companyName?: string;
  email: string;
  phone: string;
  address: string;
  creditLimit: number;
  currentBalance: number;
  tier?: string;
  accountManager?: {
    name?: string;
    email?: string;
    phone?: string;
    avatar?: string;
  };
  referralCode?: string | null;
  referralShareMessage?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoices & Payments
// ─────────────────────────────────────────────────────────────────────────────

export type InvoiceStatus =
  | 'unpaid'
  | 'overdue'
  | 'paid'
  | 'partially_paid'
  | 'pending_verification'
  | 'credit_note'
  | 'voided';

/**
 * @provisional — invoice model to be locked to the ERP invoices contract.
 */
export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

/**
 * @provisional — invoice model to be locked to the ERP invoices contract.
 */
export interface Invoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  amount: number;
  amountPaid: number;
  amountRemaining: number;
  status: InvoiceStatus;
  poNumber?: string;
  items: InvoiceItem[];
  notes?: string;
  pdfUrl?: string;
}

/**
 * Payment record as represented in the Portal domain.
 * @provisional — not yet returned by any implemented screen; introduced for the
 * ERP payment/ledger contract.
 */
export interface Payment {
  id: string;
  paymentNumber: string;
  date: string;
  invoiceId?: string;
  invoiceNumber?: string;
  amount: number;
  method: string;
  referenceCode?: string;
  status: 'prompted' | 'pending_verification' | 'verified' | 'rejected';
}

export interface PaymentPromptPayload {
  invoiceIds: string[];
  amount: number;
  paymentMethod: string;
  referenceCode?: string;
}

export interface PaymentPromptResult {
  success: boolean;
  message: string;
  transactionRef: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog / Products
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @provisional — product model to be locked to the ERP catalog/inventory contract.
 */
export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  originalPrice?: number;
  unit: string;
  description: string;
  image: string;
  inStock: boolean;
  minOrderQty: number;
  sku: string;
  rating?: number;
  ratingCount?: number;
  isTopSeller?: boolean;
  variants?: ProductVariant[];
  selectedVariantId?: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  sku: string | null;
  attributes: Record<string, string>;
  sellingPrice: number;
  costPrice: number;
  stock: number;
  active: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  variantId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orders
// ─────────────────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'draft'
  | 'confirmed'
  | 'fulfilled';

/**
 * @provisional — order line model to be locked to the ERP order lines contract.
 */
export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  variantId?: string;
}

/**
 * @provisional — order model to be locked to the ERP orders contract.
 */
export interface Order {
  id: string;
  orderNumber: string;
  date: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  deliveryAddress: string;
  paymentMethod: string;
  estimatedDelivery: string;
  associatedInvoiceId?: string;
}

export interface NewOrderPayload {
  items: OrderItem[];
  deliveryAddress: string;
  paymentTerms: string;
  totalAmount: number;
  /** Optional delivery date — sent to the ERP as `requestedDeliveryDate`. */
  requestedDeliveryDate?: string;
  /** Optional ERP portal promotion code — validated server-side only. */
  promotionCode?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Requests (ERP quotation_requests with request_type 'order')
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Workflow status of an ERP order REQUEST (ODR-...).
 *
 * These are REQUEST statuses, not Sales Order statuses. A request becomes an
 * official Sales Order (SO-...) only when the ERP converts it
 * (POST /api/portal/admin/requests/:id/complete-order).
 */
export type RequestStatus =
  | 'draft'
  | 'submitted'
  | 'assigned'
  | 'under_review'
  | 'waiting_for_customer'
  | 'ready_for_conversion'
  | 'converted'
  | 'rejected'
  | 'cancelled';

/** Promotion snapshot as returned by the ERP request row. */
export interface OrderRequestPromotion {
  code?: string;
  name?: string;
  discountAmount?: number;
}

/**
 * Customer order REQUEST as returned by the ERP request pipeline
 * (GET /portal/requests with request_type === 'order').
 *
 * This is NOT an official Sales Order. `officialOrderNumber` (SO-...) is set
 * ONLY when the ERP has actually converted the request — Sasa never fabricates
 * an SO number.
 */
export interface OrderRequest {
  id: string;
  /** ERP request number (ODR-YYYY-######). */
  requestNumber: string;
  date: string;
  items: OrderItem[];
  subtotal: number;
  discountTotal?: number;
  /** ERP-authoritative grand total after any server-side promotion. */
  total: number;
  promotion?: OrderRequestPromotion;
  status: RequestStatus;
  notes?: string;
  requestedDeliveryDate?: string;
  /** Set ONLY when the ERP converted the request into an official sales order. */
  officialOrderId?: string;
  officialOrderNumber?: string;
  reorderOfNumber?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Quotations & Quotation Requests
// ─────────────────────────────────────────────────────────────────────────────

export type QuoteStatus =
  | 'pending_review'
  | 'quoted'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'revision_requested'
  | 'converted';

/**
 * Line item of a formal quotation.
 * @provisional — the Sasa UI currently lists quote REQUESTS (see QuoteRequest);
 * a formal quotation model is introduced here for ERP parity and is not yet
 * consumed by any screen.
 */
export interface QuotationItem {
  id: string;
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

/**
 * Formal quotation issued by the supplier.
 * @provisional — not yet consumed by any screen; for ERP parity.
 */
export interface Quotation {
  id: string;
  quotationNumber: string;
  issuedDate: string;
  validUntil: string;
  status: QuoteStatus;
  items: QuotationItem[];
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  notes?: string;
  pdfUrl?: string;
}

/**
 * @provisional — quotation request model to be locked to the ERP RFQ contract.
 */
export interface QuoteRequestItem {
  id: string;
  name: string;
  quantity: number;
  targetPrice?: number;
  notes?: string;
  productId?: string;
  variantId?: string;
}

/**
 * @provisional — quotation request model to be locked to the ERP RFQ contract.
 */
export interface QuoteRequest {
  id: string;
  quoteNumber: string;
  requestDate: string;
  requiredByDate: string;
  items: QuoteRequestItem[];
  status: QuoteStatus;
  estimatedTotal?: number;
  adminNotes?: string;
  deliveryLocation: string;
  priority: 'standard' | 'urgent' | 'express';
  attachmentsCount?: number;
}

export interface NewQuoteRequestPayload {
  items: QuoteRequestItem[];
  requiredByDate: string;
  deliveryLocation: string;
  priority: 'standard' | 'urgent' | 'express';
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deliveries / Shipments
// ─────────────────────────────────────────────────────────────────────────────

export type DeliveryStatus = 'order_placed' | 'processing' | 'dispatched' | 'out_for_delivery' | 'delivered' | 'delayed';

/**
 * Shipment / delivery record. The Sasa UI models deliveries as notifications;
 * `Shipment` is the canonical domain name for ERP parity.
 * @provisional — shipment model to be locked to the ERP shipments contract.
 */
export interface Shipment {
  id: string;
  orderId: string;
  trackingNumber: string;
  title: string;
  message: string;
  status: DeliveryStatus;
  timestamp: string;
  estimatedArrival: string;
  driverName?: string;
  driverPhone?: string;
  vehicleNumber?: string;
  deliveryAddress: string;
  itemsSummary: string;
  proofOfDelivery?: {
    signedBy: string;
    deliveredAt: string;
    photoUrl?: string;
  };
  isRead: boolean;
}

export type DeliveryNotification = Shipment;

// ─────────────────────────────────────────────────────────────────────────────
// Statements
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @provisional — statement entry model to be locked to the ERP ledger contract.
 */
export interface Statement {
  id: string;
  date: string;
  type: 'Invoice' | 'Payment' | 'Credit Note' | 'Adjustment';
  reference: string;
  description: string;
  /** Increases the running balance. */
  debit: number;
  /** Decreases the running balance. */
  credit: number;
  balance: number;
}

export type StatementEntry = Statement;

// ─────────────────────────────────────────────────────────────────────────────
// Referrals
// ─────────────────────────────────────────────────────────────────────────────

export interface PortalReferral {
  id: string;
  /** The referred customer's ID (only set after registration). */
  referredCustomerId: string | null;
  /** The prospective person's name (set at referral creation). */
  referredCustomerName: string | null;
  /** The prospective person's email (set at referral creation). */
  referredCustomerEmail: string | null;
  /** The prospective person's phone (set at referral creation). */
  referredCustomerPhone: string | null;
  /** Customer ID after registration/activation (linked by the system). */
  registeredCustomerId: string | null;
  /** When the referred person registered/activated. */
  registeredAt: string | null;
  status: 'pending' | 'registered' | 'active' | 'converted' | 'expired' | 'cancelled';
  pendingInvoiceId: string | null;
  pendingInvoiceAmount: number;
  convertedInvoiceId: string | null;
  convertedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** POST /api/portal/referrals request body — prospective-person referral. */
export interface ReferralCreatePayload {
  referredName: string;
  referredEmail?: string;
  referredPhone?: string;
  notes?: string;
}

export interface ReferralTimelineEntry {
  id: string;
  referralId: string;
  eventType: string;
  title: string;
  description: string | null;
  amount: number | null;
  actorName: string | null;
  timestamp: string;
  createdAt: string;
}

export interface ReferralReward {
  id: string;
  referralId: string;
  referralCode: string | null;
  referredCustomerId: string | null;
  referredCustomerName: string | null;
  invoiceId: string | null;
  invoiceAmount: number;
  amount: number;
  status: 'pending' | 'approved' | 'paid' | 'cancelled';
  approvedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  walletTransactionId: string | null;
  createdAt: string;
}

/** GET /api/portal/referrals/stats — ERP funnel stats (camelCase, no envelope). */
export interface ReferralStats {
  total: number;
  signedUp: number;
  qualified: number;
  rewardApproved: number;
  paid: number;
  pendingRewardAmount: number;
  totalEarned: number;
  conversionRate: number;
}

/** GET /api/portal/referrals/settings — ERP program configuration (read-only in Sasa). */
export interface ReferralSettings {
  enabled: boolean;
  rewardType: string;
  rewardValue: number;
  rewardPercentage: number;
  minimumPurchase: number;
  maxRewardAmount: number;
  expiryDays: number;
  requireApproval: boolean;
  shareMessage: string;
}

/** GET /api/portal/wallet — ERP-authoritative wallet (read-only in Sasa). */
export interface WalletTransaction {
  date: string;
  amount: number;
  type: 'credit' | 'debit';
  reference: string;
}

export interface Wallet {
  walletBalance: number;
  transactions: WalletTransaction[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: The Sasa UI currently surfaces notifications as delivery/shipment
// updates. `PortalNotification` is the generic notification model reserved for
// ERP parity; it is not yet consumed by any screen.

/**
 * Generic Portal notification (mapped from ERP portal_notifications).
 * Named PortalNotification to avoid shadowing the DOM `Notification` global.
 */
export interface PortalNotification {
  id: string;
  type: 'delivery' | 'invoice' | 'payment' | 'system';
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  /** Optional ERP-issued deep link for the notification. */
  link?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Composite payload backing the Dashboard screen.
 * @provisional — composed by the Portal service; exact ERP shape TBD.
 */
export interface PortalDashboard {
  profile: AccountProfile;
  invoices: Invoice[];
  deliveries: DeliveryNotification[];
  orders: Order[];
  quotes: QuoteRequest[];
  statements: StatementEntry[];
}

// ═════════════════════════════════════════════════════════════════════════════
// ERP CONTRACT TYPES (Phase 3 — docs/SASA_PHASE_3_ERP_CONTRACT.md)
//
// Raw shapes returned by the PrimeERPsystem Portal API. Sasa UI types above are
// produced from these by the Portal service adapters — UI code never consumes
// these raw shapes directly.
// ═════════════════════════════════════════════════════════════════════════════

// ── Authentication ───────────────────────────────────────────────────────────

/** User object inside the ERP login payload. */
export interface ErpLoginUser {
  id: string; // portal_users.id
  customer_id: string; // customers.id — Sasa's customer identity
  email: string;
  full_name?: string;
  phone?: string;
}

/**
 * 200 login success.
 * NOTE: only the unified POST /api/auth/login response carries `userId` and
 * `role`. POST /api/portal/auth/login-password and /api/portal/auth/activate
 * omit them — both fields are therefore optional.
 */
export interface ErpLoginPayload {
  message: string;
  userId?: string;
  role?: 'customer';
  user: ErpLoginUser;
  access_token: string;
  refresh_token: string;
  expires_in: string; // string like '30m' — never numeric seconds
}

/** 200 2FA challenge (no tokens present — client must re-POST with code). */
export interface ErpTwoFactorChallenge {
  requires_two_factor: true;
  pending_token: string;
  user: { id: string; email: string };
}

export type ErpLoginResponse = ErpLoginPayload | ErpTwoFactorChallenge;

/** POST /api/portal/auth/refresh response (tokens rotate on every call). */
export interface ErpRefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: string;
}

/** ErpSession stored in sessionStorage under `portal_session`. */
export interface ErpStoredSession {
  access_token: string;
  refresh_token: string;
  expires_in: string;
  user: ErpLoginUser;
}

// ── Identity ─────────────────────────────────────────────────────────────────

/** GET /api/portal/profile — the authenticated customer profile. */
export interface ErpProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  balance: number;
  walletBalance: number;
  creditLimit: number;
  outstandingBalance: number;
  status: string;
  created_at: string | null;
  referralCode?: string | null;
}

/** GET /api/portal/loyalty — used for the real tier display. */
export interface ErpLoyalty {
  points: number;
  cashback: number;
  tier: string;
  pointsHistory: unknown[];
}

// ── Invoices ─────────────────────────────────────────────────────────────────

/** GET /api/portal/invoices list item (snake_case summary). */
export interface ErpInvoiceSummary {
  id: string;
  invoice_number: string;
  customer_name: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  due_date: string | null;
  created_at: string;
}

// ── Orders ───────────────────────────────────────────────────────────────────

/** GET /api/portal/orders record (list + detail share this shape). */
export interface ErpOrder {
  id: string;
  order_number: string | null;
  orderNumber?: string | null;
  customerId?: string;
  customer_id?: string;
  customerName: string;
  orderDate: string;
  deliveryDate: string | null;
  status: string;
  items: ErpOrderLine[];
  totalAmount: number;
  total?: number;
  tracking_number?: string | null;
  trackingNumber?: string | null;
  created_at: string;
}

/**
 * Order line as returned by the ERP.
 *
 * The LIST endpoint returns raw stored order lines whose display name lives
 * under `productName` (verified: `productName: "Administration Records"`,
 * plus `productId`, `unitPrice`, `subtotal`); the DETAIL endpoint normalizes
 * them to `name`/`lineTotal`. Both spellings are declared so the mapper can
 * adapt to either variant.
 */
export interface ErpOrderLine {
  name?: string;
  productName?: string;
  product_name?: string;
  description?: string;
  productId?: string | null;
  product_id?: string | null;
  quantity: number;
  unitPrice?: number;
  price?: number;
  unit_price?: number;
  lineTotal?: number;
  lineTotalNet?: number;
  line_total?: number;
  subtotal?: number;
}

// ── Requests (quotations + orders share the ERP request pipeline) ────────────

/** Request line item accepted by POST /api/portal/requests (server-authoritative pricing). */
export interface ErpRequestLine {
  productId?: string | null;
  product_id?: string | null;
  variantId?: string | null;
  variant_id?: string | null;
  name?: string;
  description?: string;
  quantity?: number;
  qty?: number;
  unitPrice?: number;
  price?: number;
  /** ERP audit flag: 'master' | 'master_variant' | 'unknown_product' | 'custom_line'. */
  priceSource?: string;
  lineTotal?: number;
}

/**
 * Request row — GET /api/portal/requests list item and the 201 response of
 * POST /api/portal/requests (requestType 'quotation' | 'order').
 */
export interface ErpRequest {
  id: string;
  requestNumber: string;
  request_type?: 'quotation' | 'order';
  requestType?: 'quotation' | 'order';
  customer_id?: string;
  customer_name?: string;
  status: string;
  items: ErpRequestLine[];
  subtotal: number;
  discount_total?: number;
  discountTotal?: number;
  total: number;
  promotion?: unknown;
  promotionApplied?: boolean;
  promotion_applied?: number;
  notes?: string | null;
  requested_delivery_date?: string | null;
  requestedDeliveryDate?: string | null;
  reorderOf?: string | null;
  reorderOfNumber?: string | null;
  reorder_of?: string | null;
  reorder_of_number?: string | null;
  sales_order_id?: string | null;
  sales_order_number?: string | null;
  created_at?: string;
}

/** POST /api/portal/orders/:id/reorder response (creates a new request row). */
export interface ErpReorderResult {
  id: string;
  requestNumber: string;
  status: string;
  reorderOf?: string | null;
  reorderOfNumber?: string | null;
}

// ── Quotations ───────────────────────────────────────────────────────────────

/**
 * GET /api/portal/quotations record.
 *
 * The live ERP returns the stored quotation row (camelCase fields — date,
 * validUntil, materialTotal, total, paymentTerms — spread from the data
 * JSON), which differs from the snake_case QuotationRecord used by the ERP
 * admin frontend. Both spellings are declared so the mapper can adapt to
 * either variant.
 */
export interface ErpQuotation {
  id: string;
  quotation_number?: string;
  quotationNumber?: string;
  request_id?: string | null;
  customer_id?: string;
  customerId?: string;
  customer_name?: string;
  customerName?: string;
  items: {
    productId?: string | null;
    product_id?: string | null;
    name?: string;
    description?: string;
    quantity: number;
    unitPrice?: number;
    price?: number;
    lineTotal?: number;
    lineTotalNet?: number;
  }[];
  subtotal?: number;
  materialTotal?: number;
  discount?: number;
  tax_rate?: number;
  tax_amount?: number;
  tax?: number;
  delivery_fee?: number;
  total: number;
  totalAmount?: number;
  currency?: string;
  payment_terms?: string | null;
  paymentTerms?: string | null;
  valid_until?: string | null;
  validUntil?: string | null;
  status: string;
  version?: number;
  rejected_at?: string | null;
  revision_requested_at?: string | null;
  accepted_at?: string | null;
  created_at?: string;
  date?: string;
  updated_at?: string;
}

// ── Payments ─────────────────────────────────────────────────────────────────

/** GET /api/portal/payments list item. */
export interface ErpPaymentRecord {
  id: string;
  amount: number;
  payment_method: string;
  date: string;
  reference: string;
}

/** POST /api/portal/payments response (real recorded payment result). */
export interface ErpPaymentResult {
  success: boolean;
  paymentId: string;
  status: 'paid' | 'partially_paid';
}

/** POST /api/portal/payments/intent response. */
export interface ErpPaymentIntent {
  clientSecret: string;
  mode: 'stripe' | 'mock';
}

/** Request body for POST /api/portal/payments. */
export interface ErpPaymentRequest {
  invoiceId: string;
  amount: number;
  currency?: string;
  paymentMethod?: string;
  reference?: string;
  transactionId?: string;
}

// ── Payment requests (NON-ACCOUNTING bank-transfer intentions) ──────────────

/**
 * Lifecycle of a payment request. These are WORKFLOW statuses — they are NOT
 * accounting statuses. `confirmed` does NOT mean the invoice is paid; only an
 * ERP-recorded accounting payment (invoice paid_amount / status) says that.
 */
export type PaymentRequestStatus = 'requested' | 'under_review' | 'confirmed' | 'rejected' | 'cancelled';

/**
 * Customer payment-intent record as represented in the Portal domain.
 * A payment request is workflow data ONLY: it never records a payment,
 * allocates funds, or modifies the invoice.
 */
export interface PaymentRequest {
  id: string;
  requestNumber: string;
  invoiceId: string;
  invoiceNumber?: string;
  requestedAmount: number;
  /** Always 'Bank Transfer' — the only payment-request method the ERP accepts. */
  paymentMethod: string;
  status: PaymentRequestStatus;
  note?: string;
  requestedAt: string;
  createdAt: string;
}

/**
 * Request body for POST /api/portal/payment-requests.
 *
 * SECURITY: only customer-controlled fields are sent. Customer identity
 * (customer_id) is derived by the ERP from the authenticated portal JWT — it
 * is NEVER included here and the browser can never choose another customer.
 */
export interface ErpPaymentRequestCreatePayload {
  invoiceId: string;
  /** Optional; the ERP defaults to the authoritative outstanding balance. */
  requestedAmount?: number;
  note?: string;
  paymentMethod?: string;
}

/**
 * GET /api/portal/payment-requests record (camelCase DTO verified from the
 * ERP paymentRequestService.toPortalDto) and the 201 response of POST
 * /api/portal/payment-requests.
 */
export interface ErpPaymentRequestRecord {
  id: string;
  requestNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  requestedAmount: number;
  paymentMethod: string | null;
  status: string | null;
  note: string | null;
  requestedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  adminNotes: string | null;
  linkedPaymentId: string | null;
  createdAt: string | null;
}

// ── Deliveries / shipments ───────────────────────────────────────────────────

/**
 * GET /api/portal/shipments record.
 *
 * The live ERP returns shipment rows (camelCase fields — trackingNumber,
 * orderId, driverName, vehicleNo, estimatedDelivery, date — spread from the
 * stored data JSON) for `_source: 'shipments'` and delivery-note sourced
 * rows. Both spellings are declared so the mapper can adapt to either.
 */
export interface ErpShipment {
  id: string;
  _source?: 'shipments' | 'delivery_notes' | 'sales_orders';
  order_number?: string | null;
  orderNumber?: string | null;
  order_id?: string | null;
  orderId?: string | null;
  orderDate?: string;
  date?: string;
  customerName?: string;
  customer_name?: string;
  status: string;
  tracking_number?: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
  driver_name?: string | null;
  driverName?: string | null;
  driver_phone?: string | null;
  driverPhone?: string | null;
  vehicle_no?: string | null;
  vehicleNo?: string | null;
  estimated_delivery?: string | null;
  estimatedDelivery?: string | null;
  actual_arrival?: string | null;
  current_location?: string | null;
  proof_of_delivery?: string | null;
  shipping_address?: string | null;
  shippingAddress?: string | null;
  items: { name?: string; quantity: number; unitPrice?: number; price?: number; lineTotal?: number }[];
}

// ── Statements ───────────────────────────────────────────────────────────────

/** GET /api/portal/statements payload. */
export interface ErpStatement {
  opening_balance: number;
  closing_balance: number;
  outstanding_balance: number;
  credit_limit: number;
  transactions: {
    date: string | null;
    description: string;
    type: 'invoice' | 'credit_note' | 'payment';
    debit: number;
    credit: number;
    balance: number;
  }[];
}

// ── Notifications ────────────────────────────────────────────────────────────

/** GET /api/portal/notifications record. */
export interface ErpNotification {
  id: string;
  portal_user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean | null;
  created_at: string;
}

// ── Catalog ──────────────────────────────────────────────────────────────────

/** GET /api/portal/catalog item. */
export interface ErpCatalogItem {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  type: string | null;
  description: string | null;
  price: number;
  quantity: number;
  category: string;
  status: string;
  variants?: ErpVariant[];
}

/** GET /api/portal/catalog variant. */
export interface ErpVariant {
  id: string;
  productId: string;
  name: string;
  sku: string | null;
  attributes: Record<string, string>;
  sellingPrice: number;
  costPrice: number;
  stock: number;
  active: boolean;
}

// ── Advertisements (ERP portal banner ads) ───────────────────────────────────

/**
 * Prepared banner asset metadata produced by the ERP pipeline
 * (backend bannerImageService → stored in portal_ads.data.imageMeta →
 * delivered by GET /api/portal/ads). Uploads are always 1600 × 400 WebP;
 * pasted-URL banners carry probed dimensions instead (format/fileSize absent).
 */
export interface PortalAdImageMeta {
  /** Banner type — always 'customer_portal_banner'. */
  bannerType?: string;
  /** Asset width in px. */
  width: number;
  /** Asset height in px. */
  height: number;
  /** Asset aspect ratio (width / height). */
  aspectRatio: number;
  /** Stored format — 'webp' for prepared banners. */
  format?: string;
  /** Stored file size in bytes. */
  fileSize?: number;
  /** ISO timestamp of when the asset was prepared. */
  preparedAt?: string;
}

/**
 * GET /api/portal/ads item — the ERP's display-ready banner ad.
 *
 * Verified from the live ERP response (portalLifecycleService.getActivePortalAds
 * → `portal_ads` table, company-scoped via the customer's companyId, active +
 * date-filtered, sorted by priority desc). Ads are managed in the ERP admin
 * (Smart Operations Hub → Ads); image uploads land in `portal_ads.data.imageUrl`.
 * `gradient` is a full CSS gradient string (e.g.
 * `linear-gradient(135deg, #312E81 0%, #7C5CF0 100%)`).
 */
export interface ErpPortalAd {
  id: string;
  title: string;
  subtitle: string | null;
  badge: string | null;
  ctaLabel: string | null;
  ctaTarget: string | null;
  imageUrl: string | null;
  imageMeta: PortalAdImageMeta | null;
  gradient: string | null;
  emoji: string | null;
  endsAt: string | null;
}

/** Banner ad as consumed by the Sasa dashboard carousel. */
export interface PortalAd {
  id: string;
  title: string;
  subtitle: string | null;
  badge: string | null;
  ctaLabel: string | null;
  ctaTarget: string | null;
  imageUrl: string | null;
  imageMeta: PortalAdImageMeta | null;
  gradient: string | null;
  emoji: string | null;
}

// ── Realtime / SSE ───────────────────────────────────────────────────────────

/** POST /api/portal/events-ticket response. */
export interface ErpEventsTicket {
  ticket: string;
  expiresIn: number; // seconds (300)
}

/** `entity_changed` SSE payload. */
export interface ErpEntityChangedEvent {
  customerId: string;
  docType: string;
  docId: string;
  event: string;
  eventType?: string;
  status?: string;
  docNumber?: string;
  metadata?: unknown;
  updatedAt?: string;
}

/** `notification` SSE payload. */
export interface ErpNotificationEvent {
  customerId: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  actorName?: string;
  createdAt: string;
}

export type ErpSseEvent =
  | { name: 'entity_changed'; data: ErpEntityChangedEvent }
  | { name: 'notification'; data: ErpNotificationEvent };

// ── Referrals ───────────────────────────────────────────────────────────────────

/** GET /api/portal/referrals list item (snake_case from ERP). */
export interface ErpReferral {
  id: string;
  customer_id: string | null;
  referred_customer_id: string | null;
  referred_customer_name: string | null;
  referred_customer_email: string | null;
  referred_customer_phone: string | null;
  registered_customer_id: string | null;
  registered_at: string | null;
  status: string;
  pending_invoice_id: string | null;
  pending_invoice_amount: number;
  converted_invoice_id: string | null;
  converted_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** GET /api/portal/referrals/:id response. */
export type ErpReferralDetail = ErpReferral;

/**
 * GET /api/portal/referrals/:id/timeline list item.
 *
 * The ERP returns the RAW snake_case referral_timeline rows (bare array — no
 * envelope). `event_type` values: created, referral_cancelled,
 * referral_expired, reward_earned, reward_approved, reward_rejected.
 * `metadata_json` is a JSON STRING (not parsed) when present.
 */
export interface ErpReferralTimelineEntry {
  id: string;
  referral_id: string;
  event_type: string;
  title: string;
  description: string | null;
  amount: number | null;
  actor_id: string | null;
  actor_name: string | null;
  metadata_json: string | null;
  timestamp: string;
  created_at: string;
  version?: number;
}

/** POST /api/portal/referrals request body — prospective-person referral. */
export interface ErpReferralCreatePayload {
  referredName: string;
  referredEmail?: string;
  referredPhone?: string;
  notes?: string;
}

/**
 * POST /api/portal/referrals — 201 response.
 *
 * NOTE: the create endpoint returns the RAW snake_case customer_referrals row
 * (via referralService.register → SELECT *), which differs from the camelCase
 * list/detail DTOs. `customer_id` is the REFERRED customer; `referred_by_*`
 * identify the referrer.
 */
export interface ErpReferralCreateResult {
  id: string;
  customer_id: string | null;
  referred_by_id: string | null;
  referred_by_name: string | null;
  referral_code: string | null;
  status: string;
  referred_name: string | null;
  referred_email: string | null;
  referred_phone: string | null;
  registered_customer_id: string | null;
  registered_at: string | null;
  pending_invoice_id: string | null;
  pending_invoice_amount: number | null;
  converted_invoice_id: string | null;
  converted_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  version?: number;
}

/** GET /api/portal/referrals/rewards list item. */
export interface ErpReferralReward {
  id: string;
  referral_id: string;
  referral_code: string | null;
  referred_customer_id: string | null;
  referred_customer_name: string | null;
  invoice_id: string | null;
  invoice_amount: number;
  amount: number;
  status: 'pending' | 'approved' | 'paid' | 'cancelled';
  approved_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  wallet_transaction_id: string | null;
  created_at: string;
}

/** GET /api/portal/referrals/stats response (flat camelCase funnel stats). */
export interface ErpReferralStats {
  total: number;
  signedUp: number;
  qualified: number;
  rewardApproved: number;
  paid: number;
  pendingRewardAmount: number;
  totalEarned: number;
  conversionRate: number;
}

/** GET /api/portal/referrals/settings response (camelCase program config). */
export interface ErpReferralSettings {
  enabled: boolean;
  rewardType: string;
  rewardValue: number;
  rewardPercentage: number;
  minimumPurchase: number;
  maxRewardAmount: number;
  expiryDays: number;
  requireApproval: boolean;
  shareMessage: string;
}

/** GET /api/portal/wallet response (ERP-authoritative wallet, read-only). */
export interface ErpWallet {
  walletBalance: number;
  transactions: Array<{
    date: string;
    amount: number;
    type: 'credit' | 'debit';
    reference: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Support / Help Desk

export type SupportTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type SupportTicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  category: SupportTicketCategory;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  messages: SupportMessage[];
  attachments?: SupportAttachment[];
}

export type SupportTicketCategory =
  | 'billing'
  | 'technical'
  | 'account'
  | 'order'
  | 'product'
  | 'other';

export interface SupportMessage {
  id: string;
  ticketId: string;
  authorName: string;
  authorRole: 'customer' | 'agent';
  content: string;
  createdAt: string;
  attachments?: SupportAttachment[];
}

export interface SupportAttachment {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
}

export interface SupportArticle {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  tags: string[];
  helpful: number;
  notHelpful: number;
  lastUpdated: string;
}

export interface NewSupportTicketPayload {
  subject: string;
  description: string;
  category: SupportTicketCategory;
  priority?: SupportTicketPriority;
  attachments?: File[];
}

// ── ERP support types ───────────────────────────────────────────────────────────

export interface ErpSupportTicket {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  messages: ErpSupportMessage[];
  attachments?: ErpSupportAttachment[];
}

export interface ErpSupportMessage {
  id: string;
  ticket_id: string;
  author_name: string;
  author_role: string;
  content: string;
  created_at: string;
  attachments?: ErpSupportAttachment[];
}

export interface ErpSupportAttachment {
  id: string;
  filename: string;
  url: string;
  mime_type: string;
  size_bytes: number;
}

export interface ErpSupportArticle {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  tags: string[];
  helpful: number;
  not_helpful: number;
  last_updated: string;
}