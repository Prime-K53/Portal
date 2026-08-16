/**
 * Prime PORTAL — Payment Request Feature — Focused Unit Tests (Phase 11)
 *
 * Run with:   npx tsx acceptance/payment-request-unit.test.ts
 *
 * These tests exercise the payment-request API client, the duplicate-request
 * guard, the UI gating helpers and status rendering using a FAKE ApiClient
 * that records every call. They never hit the ERP Portal API and never touch
 * Supabase — in particular NO real payment request is created against any
 * invoice (INV-0024 or otherwise) during automated testing.
 *
 * Architecture under test:
 *   Sasa service → ApiClient (mocked here) → ERP Portal API → ERP business
 *   logic → ERP persistence → Supabase.  Sasa itself performs NO direct
 *   payment-request write to Supabase.
 */

import { ErpPortalService } from '../src/features/customer-portal/services/portalService';
import { ApiError, type ApiClient, type HttpMethod } from '../src/features/customer-portal/services/apiClient';
import type { ErpPaymentRequestRecord } from '../src/features/customer-portal/types';
import type { Invoice } from '../src/features/customer-portal/types';
import {
  BANK_TRANSFER_METHOD_LABEL,
  canRequestPayment,
  defaultPaymentRequestAmount,
  findActivePaymentRequestForInvoice,
  getPaymentRequestStatusBadge,
  getPaymentRequestStatusLabel,
  isActivePaymentRequestStatus,
  validateRequestedAmount,
} from '../src/features/customer-portal/utils/paymentRequest';

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
}

class FakeClient implements ApiClient {
  readonly calls: RecordedCall[] = [];
  private responses: Array<{ method: HttpMethod; path: string; result: unknown }> = [];

  /** Registers a canned response. `result` may be an ApiError to simulate a failure. */
  on(method: HttpMethod, path: string, result: unknown): this {
    this.responses.push({ method, path, result });
    return this;
  }

  private respond(method: HttpMethod, path: string, body?: unknown): Promise<unknown> {
    this.calls.push({ method, path, body });
    // Prefer the most specific registered stub (longest matching path) so a
    // detail route never falls through to a list stub by prefix.
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
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.respond('POST', path, body) as Promise<T>;
  }
  put<T>(path: string, body?: unknown): Promise<T> {
    return this.respond('PUT', path, body) as Promise<T>;
  }
  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.respond('PATCH', path, body) as Promise<T>;
  }
  delete<T>(path: string): Promise<T> {
    return this.respond('DELETE', path) as Promise<T>;
  }
  request<T>(method: HttpMethod, path: string): Promise<T> {
    return this.respond(method, path) as Promise<T>;
  }
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const erpDto: ErpPaymentRequestRecord = {
  id: 'payreq_2026_000001',
  requestNumber: 'PAYREQ-2026-000001',
  customerId: 'CUST-0001',
  customerName: 'Acme LTD',
  invoiceId: 'inv_0024',
  invoiceNumber: 'INV-0024',
  requestedAmount: 11000,
  paymentMethod: 'Bank Transfer',
  status: 'requested',
  note: 'Paying by bank transfer this week',
  requestedAt: '2026-08-15T09:00:00.000Z',
  reviewedBy: null,
  reviewedAt: null,
  adminNotes: null,
  linkedPaymentId: null,
  createdAt: '2026-08-15T09:00:00.000Z',
};

const partialInvoice: Invoice = {
  id: 'inv_0024',
  invoiceNumber: 'INV-0024',
  issueDate: '2026-07-01',
  dueDate: '2026-08-01',
  amount: 21000,
  amountPaid: 10000,
  amountRemaining: 11000,
  status: 'partially_paid',
  items: [],
};

const paidInvoice: Invoice = {
  ...partialInvoice,
  amountRemaining: 0,
  amountPaid: 21000,
  status: 'paid',
};

const requestOf = (status: string, invoiceId = 'inv_0024') => ({
  id: `pr_${status}`,
  requestNumber: `PAYREQ-2026-${status}`,
  invoiceId,
  invoiceNumber: 'INV-0024',
  requestedAmount: 11000,
  paymentMethod: 'Bank Transfer',
  status: status as never,
  requestedAt: '2026-08-15T09:00:00.000Z',
  createdAt: '2026-08-15T09:00:00.000Z',
});

// ── 1. Payment-request API client (GET list + GET by id mapping) ────────────

async function testApiClient(): Promise<void> {
  const client = new FakeClient()
    .on('GET', '/portal/payment-requests', [erpDto])
    .on('GET', '/portal/payment-requests/payreq_2026_000001', erpDto);
  const service = new ErpPortalService(client);

  const list = await service.getPaymentRequests();
  assertEqual('Client: GET list returns mapped camelCase records', list.length, 1);
  check(
    'Client: GET list maps ERP DTO → PaymentRequest',
    list[0]?.requestNumber === 'PAYREQ-2026-000001' &&
      list[0]?.invoiceId === 'inv_0024' &&
      list[0]?.invoiceNumber === 'INV-0024' &&
      list[0]?.requestedAmount === 11000 &&
      list[0]?.paymentMethod === 'Bank Transfer' &&
      list[0]?.status === 'requested' &&
      list[0]?.note === 'Paying by bank transfer this week',
    JSON.stringify(list[0])
  );

  const one = await service.getPaymentRequest('payreq_2026_000001');
  check('Client: GET by id maps the same DTO shape', one.id === 'payreq_2026_000001' && one.requestNumber === 'PAYREQ-2026-000001');

  // Wrapper-object list shape is tolerated too ({ paymentRequests: [...] }).
  const client2 = new FakeClient().on('GET', '/portal/payment-requests', { paymentRequests: [erpDto] });
  const service2 = new ErpPortalService(client2);
  const wrapped = await service2.getPaymentRequests();
  check('Client: accepts { paymentRequests: [...] } list envelope', wrapped.length === 1 && wrapped[0]?.id === erpDto.id);
}

// ── 2 + 7. Successful Bank Transfer request + correct payload ───────────────

async function testCreateSuccess(): Promise<void> {
  const client = new FakeClient().on('POST', '/portal/payment-requests', erpDto);
  const service = new ErpPortalService(client);

  const created = await service.createPaymentRequest({
    invoiceId: 'inv_0024',
    requestedAmount: 11000,
    note: 'Paying by bank transfer this week',
  });

  check('Create: resolves with the ERP-created request', created.requestNumber === 'PAYREQ-2026-000001');
  check('Create: status is a WORKFLOW status (requested), never "paid"', created.status === 'requested');
  check('Create: method is Bank Transfer', created.paymentMethod === BANK_TRANSFER_METHOD_LABEL);

  const post = client.calls.find((c) => c.method === 'POST' && c.path === '/portal/payment-requests');
  assertEqual('Create: payload is exactly { invoiceId, requestedAmount, note }', post?.body, {
    invoiceId: 'inv_0024',
    requestedAmount: 11000,
    note: 'Paying by bank transfer this week',
  });
  check(
    'Create: NO customer_id is sent (identity comes from the ERP JWT)',
    post !== undefined && !('customer_id' in (post.body as object)) && !('customerId' in (post.body as object))
  );
}

// ── 4. API errors propagate — never a fake success ──────────────────────────

async function testApiErrors(): Promise<void> {
  const cases: Array<{ label: string; status: number; message: string }> = [
    { label: '403 authorization failure', status: 403, message: 'You do not have permission.' },
    { label: '404 invoice/request not found', status: 404, message: 'Invoice not found' },
    { label: '400 invalid amount', status: 400, message: 'requestedAmount (999999) exceeds the outstanding balance (11000)' },
    { label: '400 duplicate active request', status: 400, message: 'An active payment request already exists for invoice INV-0024' },
    { label: '401 authentication failure', status: 401, message: 'Your session has expired. Please login again.' },
    { label: '500 ERP server error', status: 500, message: 'Failed to create payment request' },
  ];
  for (const c of cases) {
    const client = new FakeClient().on(
      'POST',
      '/portal/payment-requests',
      new ApiError(c.message, { status: c.status, code: c.status === 401 ? 'UNAUTHORIZED' : c.status === 403 ? 'FORBIDDEN' : c.status === 404 ? 'NOT_FOUND' : c.status === 500 ? 'SERVER_ERROR' : 'BAD_REQUEST' })
    );
    const service = new ErpPortalService(client);
    let caught: unknown = null;
    try {
      await service.createPaymentRequest({ invoiceId: 'inv_0024', requestedAmount: 11000 });
    } catch (err) {
      caught = err;
    }
    check(
      `Create: ${c.label} rejects with the ERP error (no fake success)`,
      caught instanceof ApiError && caught.message === c.message && caught.status === c.status,
      caught instanceof ApiError ? `status=${caught.status} message=${caught.message}` : 'no error thrown'
    );
  }

  // Network failure surfaces as ApiError too (the real client maps fetch
  // failures to NETWORK_ERROR — here we simulate the normalized ApiError).
  const client = new FakeClient().on(
    'POST',
    '/portal/payment-requests',
    new ApiError('Unable to reach the ERP Portal service. Check your network connection and try again.', { code: 'NETWORK_ERROR' })
  );
  const service = new ErpPortalService(client);
  let network: unknown = null;
  try {
    await service.createPaymentRequest({ invoiceId: 'inv_0024', requestedAmount: 11000 });
  } catch (err) {
    network = err;
  }
  check(
    'Create: network failure rejects (never resolves as success)',
    network instanceof ApiError && network.code === 'NETWORK_ERROR'
  );
}

// ── 3. Existing active request detection ────────────────────────────────────

function testActiveRequestDetection(): void {
  const active = requestOf('requested');
  check(
    'Active: requested request is detected for the invoice',
    findActivePaymentRequestForInvoice('inv_0024', [active])?.id === active.id
  );
  check(
    'Active: under_review request is detected for the invoice',
    findActivePaymentRequestForInvoice('inv_0024', [requestOf('under_review')]) !== undefined
  );
  check(
    'Active: confirmed/rejected/cancelled requests do NOT block (ERP ACTIVE_STATUSES)',
    !findActivePaymentRequestForInvoice('inv_0024', [requestOf('confirmed'), requestOf('rejected'), requestOf('cancelled')])
  );
  check(
    'Active: request for a DIFFERENT invoice is ignored',
    !findActivePaymentRequestForInvoice('inv_9999', [active])
  );
  check(
    'Active: helper matches the ERP status set (requested + under_review only)',
    isActivePaymentRequestStatus('requested') &&
      isActivePaymentRequestStatus('under_review') &&
      !isActivePaymentRequestStatus('confirmed') &&
      !isActivePaymentRequestStatus('rejected') &&
      !isActivePaymentRequestStatus('cancelled')
  );
}

// ── 5 + 6. Invoice gating: zero vs partial outstanding balance ──────────────

function testInvoiceGating(): void {
  check('Gating: zero outstanding → canRequestPayment false', canRequestPayment(paidInvoice) === false);
  check('Gating: partial outstanding → canRequestPayment true', canRequestPayment(partialInvoice) === true);
  check('Gating: default request amount = full outstanding balance', defaultPaymentRequestAmount(partialInvoice) === 11000);
  check('Gating: default for a settled invoice is 0', defaultPaymentRequestAmount(paidInvoice) === 0);
  check('Gating: client validation rejects amounts above outstanding', validateRequestedAmount(12000, partialInvoice) !== null);
  check('Gating: client validation accepts the outstanding amount', validateRequestedAmount(11000, partialInvoice) === null);
  check('Gating: client validation rejects non-positive amounts', validateRequestedAmount(0, partialInvoice) !== null);
}

// ── 8. No direct Supabase write ─────────────────────────────────────────────

async function testNoDirectSupabaseWrite(): Promise<void> {
  const client = new FakeClient().on('GET', '/portal/payment-requests', [erpDto]).on('POST', '/portal/payment-requests', erpDto);
  const service = new ErpPortalService(client);

  await service.getPaymentRequests();
  await service.createPaymentRequest({ invoiceId: 'inv_0024', requestedAmount: 11000, note: 'note' });

  const outOfPortal = client.calls.filter((c) => !c.path.startsWith('/portal/payment-requests'));
  check(
    'Security: the flow ONLY calls /portal/payment-requests* through the ERP ApiClient (no Supabase, no other tables)',
    outOfPortal.length === 0,
    outOfPortal.map((c) => `${c.method} ${c.path}`).join(', ')
  );
  check(
    'Security: no direct Supabase fetch/write in the request path',
    !client.calls.some((c) => /supabase|rest\/v1/i.test(c.path))
  );
}

// ── 9. Successful request does not locally mark the invoice as paid ─────────

async function testInvoiceNotLocallyMutated(): Promise<void> {
  const client = new FakeClient().on('POST', '/portal/payment-requests', erpDto);
  const service = new ErpPortalService(client);

  const before = JSON.stringify(partialInvoice);
  await service.createPaymentRequest({ invoiceId: 'inv_0024', requestedAmount: 11000 });
  const after = JSON.stringify(partialInvoice);

  check('Integrity: invoice object is untouched by creating a request', before === after);
  const invoiceWrites = client.calls.filter(
    (c) => c.path.includes('/portal/invoices') && c.method !== 'GET'
  );
  check(
    'Integrity: no writes to invoice records (paidAmount/status never locally changed)',
    invoiceWrites.length === 0,
    invoiceWrites.map((c) => `${c.method} ${c.path}`).join(', ')
  );
}

// ── 10. Status rendering (Phase 6 human labels + badges) ────────────────────

function testStatusRendering(): void {
  assertEqual('Status label: requested', getPaymentRequestStatusLabel('requested'), 'Requested');
  assertEqual('Status label: under_review', getPaymentRequestStatusLabel('under_review'), 'Under Review');
  assertEqual('Status label: confirmed', getPaymentRequestStatusLabel('confirmed'), 'Confirmed');
  assertEqual('Status label: rejected', getPaymentRequestStatusLabel('rejected'), 'Rejected');
  assertEqual('Status label: cancelled', getPaymentRequestStatusLabel('cancelled'), 'Cancelled');

  check(
    'Status badge: active statuses render amber (in-progress)',
    getPaymentRequestStatusBadge('requested').label === 'Requested' &&
      getPaymentRequestStatusBadge('under_review').label === 'Under Review' &&
      getPaymentRequestStatusBadge('requested').bg.includes('amber')
  );
  check(
    'Status badge: confirmed renders emerald',
    getPaymentRequestStatusBadge('confirmed').bg.includes('emerald')
  );
  check(
    'Status badge: rejected renders rose',
    getPaymentRequestStatusBadge('rejected').bg.includes('rose')
  );
  check(
    'Status badge: cancelled renders slate (terminal, neutral)',
    getPaymentRequestStatusBadge('cancelled').bg.includes('slate')
  );
}

// ── Runner ──────────────────────────────────────────────────────────────────

(async () => {
  console.log('═══ Sasa Payment Request — Focused Unit Tests ═══');
  console.log('(fake ApiClient only — no ERP calls, no Supabase, no real payment requests)\n');

  await testApiClient();
  await testCreateSuccess();
  await testApiErrors();
  testActiveRequestDetection();
  testInvoiceGating();
  await testNoDirectSupabaseWrite();
  await testInvoiceNotLocallyMutated();
  testStatusRendering();

  console.log('\n═══ SUMMARY ═══');
  const passes = results.filter((r) => r.pass).length;
  console.log(`PASS ${passes} / ${results.length}  FAIL ${failures}`);
  if (failures) {
    results.filter((r) => !r.pass).forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
  }
  process.exit(failures ? 1 : 0);
})();
