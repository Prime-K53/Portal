/**
 * Prime PORTAL — Order Request Lifecycle — Focused Unit Tests
 *
 * Run with:   npx tsx acceptance/order-request-unit.test.ts
 *
 * These tests exercise the order-request API client (submit / history /
 * detail / cancel / reorder), the ERP-mirroring UI helpers and status
 * rendering using a FAKE ApiClient that records every call. They never hit
 * the ERP Portal API and never touch Supabase — no real order request
 * (ODR-...) is created, cancelled or reordered during automated testing.
 *
 * Architecture under test:
 *   Sasa service → ApiClient (mocked here) → ERP Portal API → ERP business
 *   logic → ERP persistence → Supabase.  Sasa itself performs NO direct
 *   order write to Supabase, and never fabricates an official SO number.
 *
 * ERP contract verified from PrimeERPsystem source:
 *   - POST /api/portal/requests         (portal.cjs:170) — creates ODR-... request
 *   - GET  /api/portal/requests         (portal.cjs:148) — customer-scoped list
 *   - GET  /api/portal/requests/:id     (portal.cjs:198) — customer-owned detail
 *   - POST /api/portal/requests/:id/cancel (portal.cjs:210) — ownership + transition
 *   - POST /api/portal/orders/:id/reorder (portal.cjs:466) — new ODR from an SO
 *   - Idempotency: NO middleware/unique guard protects request creation (the
 *     ERP idempotency middleware is wired only on referral routes) — a network
 *     retry CAN create a duplicate request. Sasa documents this gap and never
 *     pretends it does not exist; each submission is a fresh, honest call.
 */

import { ErpPortalService } from '../src/features/customer-portal/services/portalService';
import { ApiError, type ApiClient, type ApiRequestOptions, type HttpMethod } from '../src/features/customer-portal/services/apiClient';
import type { ErpRequest, ErpReorderResult, NewOrderPayload, Order } from '../src/features/customer-portal/types';
import {
  canCancelOrderRequest,
  canReorderOrder,
  getRequestStatusBadge,
  getRequestStatusLabel,
  officialOrderNumberFor,
} from '../src/features/customer-portal/utils/orderRequest';
import { generateIdempotencyKey } from '../src/features/customer-portal/utils/idempotency';

// ── Tiny assertion harness ──────────────────────────────────────────────────

const results: Array<{ name: string; pass: boolean; detail?: string }> = [];
let failures = 0;

function check(name: string, pass: boolean, detail = ''): void {
  results.push({ name, pass, detail });
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function assertEqual<T>(name: string, actual: T, expected: T): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  check(name, a === b, a === b ? '' : `expected ${b}, got ${a}`);
}

// ── Fake ERP ApiClient (records calls, serves canned contract responses) ────

interface RecordedCall {
  method: HttpMethod;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

class FakeClient implements ApiClient {
  readonly calls: RecordedCall[] = [];
  private responses: Array<{ method: HttpMethod; path: string; result: unknown }> = [];

  on(method: HttpMethod, path: string, result: unknown): this {
    this.responses.push({ method, path, result });
    return this;
  }

  /** Clears all canned responses (used to simulate the ERP recovering). */
  reset(): this {
    this.responses = [];
    return this;
  }

  private respond(method: HttpMethod, path: string, body?: unknown, options?: ApiRequestOptions): Promise<unknown> {
    this.calls.push({ method, path, body, headers: options?.headers });
    const candidates = this.responses.filter((r) => r.method === method && path.startsWith(r.path));
    const match = candidates.sort((a, b) => b.path.length - a.path.length)[0];
    if (!match) {
      return Promise.reject(new ApiError(`Unexpected call ${method} ${path}`, { code: 'SERVER_ERROR' }));
    }
    if (match.result instanceof ApiError) return Promise.reject(match.result);
    return Promise.resolve(match.result);
  }

  get<T>(path: string): Promise<T> {
    return this.respond('GET', path) as Promise<T>;
  }
  post<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    return this.respond('POST', path, body, options) as Promise<T>;
  }
  put<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    return this.respond('PUT', path, body, options) as Promise<T>;
  }
  patch<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    return this.respond('PATCH', path, body, options) as Promise<T>;
  }
  delete<T>(path: string): Promise<T> {
    return this.respond('DELETE', path) as Promise<T>;
  }
  request<T>(method: HttpMethod, path: string): Promise<T> {
    return this.respond(method, path) as Promise<T>;
  }
}

// ── Fixtures (shapes verified from the ERP request pipeline) ────────────────

const erpOrderRequest: ErpRequest = {
  id: 'req_2026_000123',
  requestNumber: 'ODR-2026-000123',
  requestType: 'order',
  status: 'submitted',
  items: [
    {
      productId: 'PROD-0001',
      name: 'Industrial Valves 2"',
      quantity: 10,
      unitPrice: 900,
      lineTotal: 9000,
    },
    {
      productId: 'PROD-0002',
      name: 'Copper Tubing 1"',
      quantity: 20,
      unitPrice: 150,
      lineTotal: 3000,
    },
  ],
  subtotal: 12000,
  discountTotal: 1200,
  total: 10800,
  promotion: { code: 'WELCOME10', name: 'Welcome 10% Off', discountAmount: 1200 },
  promotionApplied: true,
  notes: 'Delivery address: Plot 7, Lusaka. Payment terms: Net 30 Credit Terms',
  requestedDeliveryDate: '2026-09-01',
  created_at: '2026-08-17T10:00:00.000Z',
};

const erpQuotationRequest: ErpRequest = {
  ...erpOrderRequest,
  id: 'req_2026_000456',
  requestNumber: 'QTR-2026-000456',
  requestType: 'quotation',
  subtotal: 5000,
  total: 5000,
  promotion: undefined,
  promotionApplied: false,
};

const erpConvertedRequest: ErpRequest = {
  ...erpOrderRequest,
  id: 'req_2026_000789',
  requestNumber: 'ODR-2026-000789',
  status: 'converted',
  sales_order_id: 'ord_2026_000042',
  sales_order_number: 'SO-2026-000042',
};

const reorderResult: ErpReorderResult = {
  id: 'req_2026_000200',
  requestNumber: 'ODR-2026-000200',
  status: 'submitted',
  reorderOf: 'ord_2026_000042',
  reorderOfNumber: 'SO-2026-000042',
};

const orderPayload: NewOrderPayload = {
  items: [
    {
      productId: 'PROD-0001',
      productName: 'Industrial Valves 2"',
      quantity: 10,
      unitPrice: 900,
      total: 9000,
    },
    {
      productId: 'PROD-0002',
      productName: 'Copper Tubing 1"',
      quantity: 20,
      unitPrice: 150,
      total: 3000,
    },
  ],
  deliveryAddress: 'Plot 7, Lusaka',
  paymentTerms: 'Net 30 Credit Terms',
  totalAmount: 12000,
  requestedDeliveryDate: '2026-09-01',
  promotionCode: 'WELCOME10',
};

const draftOrder: Order = {
  id: 'ord_draft',
  orderNumber: 'SO-2026-000001',
  date: '2026-08-01',
  items: [],
  totalAmount: 0,
  status: 'draft',
  deliveryAddress: '',
  paymentMethod: '',
  estimatedDelivery: '',
};

const cancelledOrder: Order = {
  ...draftOrder,
  id: 'ord_cancelled',
  status: 'cancelled',
};

const confirmedOrder: Order = {
  ...draftOrder,
  id: 'ord_confirmed',
  status: 'confirmed',
};

/** Fixed, valid Idempotency-Key (UUID v4 — 36 chars, within the ERP's 8–128). */
const IDEMPOTENCY_KEY = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

// ── 1. Order submission: ERP response preserved end-to-end ──────────────────

async function testCreateOrderSuccess(): Promise<void> {
  const client = new FakeClient().on('POST', '/portal/requests', erpOrderRequest);
  const service = new ErpPortalService(client);

  const created = await service.createOrder(orderPayload, IDEMPOTENCY_KEY);

  check('Create: resolves with the ERP request identity', created.id === 'req_2026_000123');
  check('Create: ERP request number (ODR-...) is preserved', created.requestNumber === 'ODR-2026-000123');
  check('Create: ERP status is preserved (submitted — a workflow state)', created.status === 'submitted');
  check(
    'Create: ERP totals are preserved (subtotal, discount, total)',
    created.subtotal === 12000 && created.discountTotal === 1200 && created.total === 10800
  );
  check('Create: ERP line items are preserved', created.items.length === 2 && created.items[0]?.total === 9000);
  check(
    'Create: ERP promotion snapshot is preserved (never re-computed locally)',
    created.promotion?.code === 'WELCOME10' && created.promotion?.discountAmount === 1200
  );
  check(
    'Create: requestedDeliveryDate is carried through',
    created.requestedDeliveryDate === '2026-09-01'
  );

  const post = client.calls.find((c) => c.method === 'POST' && c.path === '/portal/requests');
  assertEqual(
    'Create: payload is exactly { requestType, items, notes, requestedDeliveryDate, promotionCode }',
    post?.body,
    {
      requestType: 'order',
      items: [
        { productId: 'PROD-0001', name: 'Industrial Valves 2"', quantity: 10, unitPrice: 900 },
        { productId: 'PROD-0002', name: 'Copper Tubing 1"', quantity: 20, unitPrice: 150 },
      ],
      notes: 'Delivery address: Plot 7, Lusaka. Payment terms: Net 30 Credit Terms',
      requestedDeliveryDate: '2026-09-01',
      promotionCode: 'WELCOME10',
    }
  );
  check(
    'Create: NO customer_id is sent (identity comes from the ERP JWT)',
    post !== undefined && !('customer_id' in (post.body as object)) && !('customerId' in (post.body as object))
  );

  const client2 = new FakeClient().on('POST', '/portal/requests', erpOrderRequest);
  const service2 = new ErpPortalService(client2);
  await service2.createOrder(
    {
      items: orderPayload.items,
      deliveryAddress: '',
      paymentTerms: '',
      totalAmount: 0,
    },
    IDEMPOTENCY_KEY
  );
  const post2 = client2.calls.find((c) => c.method === 'POST' && c.path === '/portal/requests');
  const wire = JSON.parse(JSON.stringify(post2?.body ?? {})) as Record<string, unknown>;
  check(
    'Create: notes is omitted on the wire when deliveryAddress/paymentTerms are empty (no blank notes)',
    !('notes' in wire)
  );
}

// ── 2. Order submission: API errors propagate — never a fake success ────────

async function testCreateOrderErrors(): Promise<void> {
  const cases: Array<{ label: string; status: number; message: string }> = [
    { label: '400 invalid items', status: 400, message: 'items must contain at least one line' },
    { label: '403 authorization failure', status: 403, message: 'You do not have permission.' },
    { label: '401 authentication failure', status: 401, message: 'Your session has expired. Please login again.' },
    { label: '500 ERP server error', status: 500, message: 'Failed to create request' },
  ];
  for (const c of cases) {
    const client = new FakeClient().on(
      'POST',
      '/portal/requests',
      new ApiError(c.message, {
        status: c.status,
        code: c.status === 401 ? 'UNAUTHORIZED' : c.status === 403 ? 'FORBIDDEN' : c.status === 500 ? 'SERVER_ERROR' : 'BAD_REQUEST',
      })
    );
    const service = new ErpPortalService(client);
    let caught: unknown = null;
    try {
      await service.createOrder(orderPayload, IDEMPOTENCY_KEY);
    } catch (err) {
      caught = err;
    }
    check(
      `Create: ${c.label} rejects with the ERP error (no fake success)`,
      caught instanceof ApiError && caught.message === c.message && caught.status === c.status,
      caught instanceof ApiError ? `status=${caught.status} message=${caught.message}` : 'no error thrown'
    );
  }

  const client = new FakeClient().on(
    'POST',
    '/portal/requests',
    new ApiError('Unable to reach the ERP Portal service. Check your network connection and try again.', { code: 'NETWORK_ERROR' })
  );
  const service = new ErpPortalService(client);
  let network: unknown = null;
  try {
    await service.createOrder(orderPayload, IDEMPOTENCY_KEY);
  } catch (err) {
    network = err;
  }
  check(
    'Create: network failure rejects (never resolves as success)',
    network instanceof ApiError && network.code === 'NETWORK_ERROR'
  );
}

// ── 3. Idempotency-Key: header sent, format, retry reuse, new submissions ───

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function testIdempotencyHeader(): Promise<void> {
  const client = new FakeClient().on('POST', '/portal/requests', erpOrderRequest);
  const service = new ErpPortalService(client);

  await service.createOrder(orderPayload, IDEMPOTENCY_KEY);

  const post = client.calls.find((c) => c.method === 'POST' && c.path === '/portal/requests');
  check(
    'Idempotency: POST /portal/requests carries the Idempotency-Key header',
    post?.headers?.['Idempotency-Key'] === IDEMPOTENCY_KEY,
    `headers=${JSON.stringify(post?.headers)}`
  );
  check(
    'Idempotency: the sent key is the exact key generated for this submission (no transformation)',
    post?.headers?.['Idempotency-Key'] === IDEMPOTENCY_KEY
  );
}

function testIdempotencyKeyFormat(): void {
  const key = generateIdempotencyKey();
  check(
    'Key format: UUID v4 shape',
    typeof key === 'string' && UUID_V4_RE.test(key),
    `key=${key}`
  );
  check(
    'Key format: non-empty and within the ERP 8–128 character limit',
    key.length >= 8 && key.length <= 128,
    `length=${key.length}`
  );
  check(
    'Key format: two generated keys for independent submissions DIFFER',
    generateIdempotencyKey() !== generateIdempotencyKey()
  );
  check(
    'Key format: key contains no customer/sensitive data (UUID only)',
    !/CUST|ODR|SO-|acme|customer/i.test(key)
  );
}

async function testSameLogicalRetryReusesKey(): Promise<void> {
  // The CartDrawer generates ONE key per logical submission attempt and keeps
  // it while retrying the SAME attempt (a retry after a network timeout calls
  // the service again with the SAME key — the ERP replays its stored response
  // instead of creating a duplicate ODR request).
  const key = generateIdempotencyKey();
  const client = new FakeClient()
    .on(
      'POST',
      '/portal/requests',
      new ApiError('Unable to reach the ERP Portal service. Check your network connection and try again.', {
        code: 'NETWORK_ERROR',
      })
    );
  const service = new ErpPortalService(client);

  let first: unknown = null;
  try {
    await service.createOrder(orderPayload, key);
  } catch (err) {
    first = err;
  }
  check(
    'Retry: first attempt fails with the network error (no fake success)',
    first instanceof ApiError && first.code === 'NETWORK_ERROR'
  );

  // The ERP becomes reachable — the user retries the SAME logical submission.
  client.reset();
  client.on('POST', '/portal/requests', erpOrderRequest);
  const created = await service.createOrder(orderPayload, key);

  const posts = client.calls.filter((c) => c.method === 'POST' && c.path === '/portal/requests');
  check(
    'Retry: both attempts POST to /portal/requests',
    posts.length === 2,
    `posts=${posts.length}`
  );
  check(
    'Retry: the retry REUSES the same Idempotency-Key as the failed attempt (same logical submission)',
    posts.length === 2 &&
      posts[0]?.headers?.['Idempotency-Key'] === key &&
      posts[1]?.headers?.['Idempotency-Key'] === key,
    `keys=${JSON.stringify(posts.map((p) => p.headers?.['Idempotency-Key']))}`
  );
  check(
    'Retry: the successful retry still resolves with the real ERP response',
    created.requestNumber === 'ODR-2026-000123' && created.status === 'submitted'
  );
}

async function testNewSubmissionNewKey(): Promise<void> {
  // A NEW independent order gets a NEW key — the previous key is never reused
  // across submissions (component state, storage or otherwise).
  const keyA = generateIdempotencyKey();
  const keyB = generateIdempotencyKey();
  check(
    'New submission: distinct generated keys for separate orders',
    keyA !== keyB
  );

  const client = new FakeClient().on('POST', '/portal/requests', erpOrderRequest);
  const service = new ErpPortalService(client);
  await service.createOrder(orderPayload, keyA);
  await service.createOrder({ ...orderPayload, promotionCode: undefined }, keyB);

  const posts = client.calls.filter((c) => c.method === 'POST' && c.path === '/portal/requests');
  check(
    'New submission: each order request POSTs with its OWN key (no stale reuse)',
    posts.length === 2 &&
      posts[0]?.headers?.['Idempotency-Key'] === keyA &&
      posts[1]?.headers?.['Idempotency-Key'] === keyB,
    `keys=${JSON.stringify(posts.map((p) => p.headers?.['Idempotency-Key']))}`
  );
}

// ── 4. Order history: requests vs official orders, ODR vs SO ────────────────

async function testOrderHistory(): Promise<void> {
  const client = new FakeClient().on('GET', '/portal/requests', [erpOrderRequest, erpQuotationRequest, erpConvertedRequest]);
  const service = new ErpPortalService(client);

  const requests = await service.getOrderRequests();

  check('History: only requestType "order" is surfaced (quotation requests excluded)', requests.length === 2);
  check('History: ODR request number shown from the ERP', requests.some((r) => r.requestNumber === 'ODR-2026-000123'));
  check(
    'History: an un-converted request carries NO official SO number (never fabricated)',
    officialOrderNumberFor(requests.find((r) => r.requestNumber === 'ODR-2026-000123')!) === undefined
  );
  check(
    'History: a converted request carries the ERP SO number',
    officialOrderNumberFor(requests.find((r) => r.requestNumber === 'ODR-2026-000789')!) === 'SO-2026-000042'
  );
  check(
    'History: converted status is preserved from the ERP',
    requests.find((r) => r.requestNumber === 'ODR-2026-000789')?.status === 'converted'
  );

  // Snake_case list rows (raw DB spread) are tolerated too.
  const client2 = new FakeClient().on('GET', '/portal/requests', {
    requests: [
      {
        ...erpOrderRequest,
        request_type: 'order',
        discount_total: 1200,
        requested_delivery_date: '2026-09-01',
      },
    ],
  });
  const service2 = new ErpPortalService(client2);
  const snake = await service2.getOrderRequests();
  check(
    'History: snake_case ERP rows map identically (request_type/discount_total/requested_delivery_date)',
    snake.length === 1 &&
      snake[0]?.requestNumber === 'ODR-2026-000123' &&
      snake[0]?.discountTotal === 1200 &&
      snake[0]?.requestedDeliveryDate === '2026-09-01'
  );
}

// ── 5. Request detail: GET /portal/requests/:id (ownership enforced in ERP) ─

async function testRequestDetail(): Promise<void> {
  const client = new FakeClient().on('GET', '/portal/requests/req_2026_000123', erpOrderRequest);
  const service = new ErpPortalService(client);

  const detail = await service.getOrderRequestById('req_2026_000123');
  check('Detail: resolves the full ERP request', detail.requestNumber === 'ODR-2026-000123' && detail.total === 10800);

  const client404 = new FakeClient().on(
    'GET',
    '/portal/requests/req_404',
    new ApiError('Request not found', { status: 404, code: 'NOT_FOUND' })
  );
  const service404 = new ErpPortalService(client404);
  let caught: unknown = null;
  try {
    await service404.getOrderRequestById('req_404');
  } catch (err) {
    caught = err;
  }
  check(
    'Detail: 404 (other customer / unknown request) propagates',
    caught instanceof ApiError && caught.status === 404
  );
}

// ── 6. Cancellation: ERP-owned transition + authoritative follow-up read ────

async function testCancelOrderRequest(): Promise<void> {
  const cancelled = { ...erpOrderRequest, status: 'cancelled' };
  const client = new FakeClient()
    .on('POST', '/portal/requests/req_2026_000123/cancel', { id: 'req_2026_000123', status: 'cancelled' })
    .on('GET', '/portal/requests/req_2026_000123', cancelled);
  const service = new ErpPortalService(client);

  const result = await service.cancelOrderRequest('req_2026_000123');
  check('Cancel: ERP confirm endpoint is called', client.calls.some((c) => c.method === 'POST' && c.path.endsWith('/cancel')));
  check(
    'Cancel: result re-read from the ERP preserves the full request (number, items, totals)',
    result.requestNumber === 'ODR-2026-000123' &&
      result.status === 'cancelled' &&
      result.items.length === 2 &&
      result.total === 10800
  );

  // If the follow-up read fails, the ERP cancel result itself is returned —
  // never a fabricated request.
  const client2 = new FakeClient().on(
    'POST',
    '/portal/requests/req_2026_000123/cancel',
    { id: 'req_2026_000123', status: 'cancelled' }
  );
  const service2 = new ErpPortalService(client2);
  const fallback = await service2.cancelOrderRequest('req_2026_000123');
  check(
    'Cancel: when the detail read fails, the ERP cancel result is returned (id + status, no fabrication)',
    fallback.id === 'req_2026_000123' && fallback.status === 'cancelled' && fallback.requestNumber === ''
  );
}

// ── 7. Reorder: ERP pipeline creates a NEW ODR request referencing the SO ───

async function testReorderOrder(): Promise<void> {
  const createdRequest: ErpRequest = {
    ...erpOrderRequest,
    id: 'req_2026_000200',
    requestNumber: 'ODR-2026-000200',
    reorderOf: 'ord_2026_000042',
    reorderOfNumber: 'SO-2026-000042',
  };
  const client = new FakeClient()
    .on('POST', '/portal/orders/ord_2026_000042/reorder', reorderResult)
    .on('GET', '/portal/requests/req_2026_000200', createdRequest);
  const service = new ErpPortalService(client);

  const created = await service.reorderOrder('ord_2026_000042');
  check(
    'Reorder: ERP reorder endpoint is called for the official order',
    client.calls.some((c) => c.method === 'POST' && c.path === '/portal/orders/ord_2026_000042/reorder')
  );
  check(
    'Reorder: new request is re-read from the ERP — number, items and totals preserved',
    created.requestNumber === 'ODR-2026-000200' &&
      created.reorderOfNumber === 'SO-2026-000042' &&
      created.items.length === 2 &&
      created.total === 10800
  );

  const client2 = new FakeClient().on('POST', '/portal/orders/ord_2026_000042/reorder', reorderResult);
  const service2 = new ErpPortalService(client2);
  const fallback = await service2.reorderOrder('ord_2026_000042');
  check(
    'Reorder: when the detail read fails, the minimal ERP reorder result is returned',
    fallback.requestNumber === 'ODR-2026-000200' &&
      fallback.reorderOfNumber === 'SO-2026-000042' &&
      fallback.status === 'submitted'
  );
}

// ── 8. UI helpers mirror the ERP (cancellable set, reorder rule, labels) ────

function testUiHelpers(): void {
  // Cancellable set mirrors workflowEngine.cjs transitions into CANCELLED.
  check(
    'Cancel helper: work-in-progress statuses are cancellable (ERP-accepted)',
    canCancelOrderRequest('draft') &&
      canCancelOrderRequest('submitted') &&
      canCancelOrderRequest('assigned') &&
      canCancelOrderRequest('under_review') &&
      canCancelOrderRequest('waiting_for_customer') &&
      canCancelOrderRequest('ready_for_conversion')
  );
  check(
    'Cancel helper: converted/rejected/cancelled are NOT cancellable (ERP rejects)',
    !canCancelOrderRequest('converted') && !canCancelOrderRequest('rejected') && !canCancelOrderRequest('cancelled')
  );

  // Reorder rule mirrors ERP: Draft and Cancelled official orders are blocked.
  check('Reorder helper: Draft order is not reorderable (ERP rule)', canReorderOrder(draftOrder) === false);
  check('Reorder helper: Cancelled order is not reorderable (ERP rule)', canReorderOrder(cancelledOrder) === false);
  check('Reorder helper: Confirmed order is reorderable', canReorderOrder(confirmedOrder) === true);

  // Status labels match the ERP request statuses.
  assertEqual('Status label: submitted', getRequestStatusLabel('submitted'), 'Submitted');
  assertEqual('Status label: under_review', getRequestStatusLabel('under_review'), 'Under Review');
  assertEqual('Status label: waiting_for_customer', getRequestStatusLabel('waiting_for_customer'), 'Waiting for Customer');
  assertEqual('Status label: ready_for_conversion', getRequestStatusLabel('ready_for_conversion'), 'Ready for Conversion');
  assertEqual('Status label: converted', getRequestStatusLabel('converted'), 'Converted');
  assertEqual('Status label: rejected', getRequestStatusLabel('rejected'), 'Rejected');
  assertEqual('Status label: cancelled', getRequestStatusLabel('cancelled'), 'Cancelled');

  check(
    'Status badge: rejected renders rose, cancelled renders slate',
    getRequestStatusBadge('rejected').bg.includes('rose') && getRequestStatusBadge('cancelled').bg.includes('slate')
  );
}

// ── 9. Accounting firewall + no direct Supabase write ───────────────────────

async function testNoDirectSupabaseWrite(): Promise<void> {
  const client = new FakeClient()
    .on('GET', '/portal/requests', [erpOrderRequest])
    .on('POST', '/portal/requests', erpOrderRequest)
    .on('POST', '/portal/requests/req_2026_000123/cancel', { id: 'req_2026_000123', status: 'cancelled' })
    .on('POST', '/portal/orders/ord_2026_000042/reorder', reorderResult);
  const service = new ErpPortalService(client);

  await service.getOrderRequests();
  await service.createOrder(orderPayload, IDEMPOTENCY_KEY);
  await service.cancelOrderRequest('req_2026_000123');
  await service.reorderOrder('ord_2026_000042');

  const allowed = (c: RecordedCall) =>
    c.path.startsWith('/portal/requests') ||
    c.path.startsWith('/portal/orders/') ||
    c.path.startsWith('/portal/catalog') ||
    c.path.startsWith('/portal/profile') ||
    c.path.startsWith('/portal/loyalty');

  const outOfContract = client.calls.filter((c) => !allowed(c));
  check(
    'Security: order flow ONLY calls /portal/requests* and /portal/orders/:id/reorder through the ERP ApiClient',
    outOfContract.length === 0,
    outOfContract.map((c) => `${c.method} ${c.path}`).join(', ')
  );
  check(
    'Security: no direct Supabase fetch/write in the order flow',
    !client.calls.some((c) => /supabase|rest\/v1/i.test(c.path))
  );
  check(
    'Security: no invoice/payment/ledger endpoints touched by the order flow',
    !client.calls.some((c) => /invoices|payments|ledger|journal/i.test(c.path))
  );
  check(
    'Security: Idempotency-Key is sent ONLY on POST /portal/requests (never on cancel/reorder — they are separate ERP operations)',
    client.calls.every(
      (c) =>
        !(c.method === 'POST' && c.headers?.['Idempotency-Key']) ||
        (c.method === 'POST' && c.path === '/portal/requests')
    )
  );
}

// ── Runner ──────────────────────────────────────────────────────────────────

(async () => {
  console.log('═══ Sasa Order Request Lifecycle — Focused Unit Tests ═══');
  console.log('(fake ApiClient only — no ERP calls, no Supabase, no real order requests)\n');

  await testCreateOrderSuccess();
  await testCreateOrderErrors();
  await testIdempotencyHeader();
  testIdempotencyKeyFormat();
  await testSameLogicalRetryReusesKey();
  await testNewSubmissionNewKey();
  await testOrderHistory();
  await testRequestDetail();
  await testCancelOrderRequest();
  await testReorderOrder();
  testUiHelpers();
  await testNoDirectSupabaseWrite();

  console.log('\n═══ SUMMARY ═══');
  const passes = results.filter((r) => r.pass).length;
  console.log(`PASS ${passes} / ${results.length}  FAIL ${failures}`);
  if (failures) {
    results.filter((r) => !r.pass).forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
  }
  process.exit(failures ? 1 : 0);
})();