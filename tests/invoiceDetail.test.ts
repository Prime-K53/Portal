/**
 * Prime PORTAL — Invoice detail line-item regression tests.
 *
 * Covers the corrected ERP contract for GET /portal/invoices/:id, which
 * exposes normalized lines through BOTH `line_items` (canonical) and `items`
 * (compatibility) regardless of payment status.
 *
 * Run: npx tsx --test tests/invoiceDetail.test.ts
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ErpPortalService } from '../src/features/customer-portal/services/portalService';
import { ApiError, type ApiClient } from '../src/features/customer-portal/services/apiClient';
import type { ErpInvoiceDetail, Invoice } from '../src/features/customer-portal/types';
import { canRequestPayment } from '../src/features/customer-portal/utils/paymentRequest';

interface RecordedCall {
  method: string;
  path: string;
  body?: unknown;
}

function createDetailClient(response: unknown | ApiError, calls: RecordedCall[] = []): ApiClient {
  return {
    async get<T>(path: string): Promise<T> {
      calls.push({ method: 'GET', path });
      if (response instanceof ApiError) throw response;
      return response as T;
    },
    async post<T>(): Promise<T> {
      throw new Error('Not implemented');
    },
    async put<T>(): Promise<T> {
      throw new Error('Not implemented');
    },
    async patch<T>(): Promise<T> {
      throw new Error('Not implemented');
    },
    async delete<T>(): Promise<T> {
      throw new Error('Not implemented');
    },
    async request<T>(): Promise<T> {
      throw new Error('Not implemented');
    },
  };
}

const CANONICAL_LINES = [
  { id: 'p1', item_name: 'A4 Paper Ream', quantity: 2, unit_price: 15000, line_total: 30000 },
  { id: 'p2', item_name: 'Toner Cartridge', quantity: 1, unit_price: 45000, line_total: 45000 },
];

function detailPayload(overrides: Partial<ErpInvoiceDetail> = {}): ErpInvoiceDetail {
  return {
    status: 'Unpaid',
    total_amount: 75000,
    paid_amount: 0,
    ...overrides,
  } as ErpInvoiceDetail;
}

describe('Invoice detail line items (corrected ERP contract)', () => {
  test('unpaid invoice with line_items only renders every item in order', async () => {
    const service = new ErpPortalService(
      createDetailClient(detailPayload({ line_items: CANONICAL_LINES }))
    );
    const inv = await service.getInvoiceDetail('inv_unpaid_001');
    assert.equal(inv.status, 'unpaid');
    assert.equal(inv.items.length, 2);
    assert.equal(inv.items[0].description, 'A4 Paper Ream');
    assert.equal(inv.items[1].description, 'Toner Cartridge');
    assert.equal(inv.items[0].quantity, 2);
    assert.equal(inv.items[0].unitPrice, 15000);
    assert.equal(inv.items[0].total, 30000);
    assert.equal(inv.items[1].quantity, 1);
    assert.equal(inv.items[1].unitPrice, 45000);
    assert.equal(inv.items[1].total, 45000);
  });

  test('unpaid invoice with items only renders every item in order', async () => {
    const service = new ErpPortalService(
      createDetailClient(detailPayload({ items: CANONICAL_LINES }))
    );
    const inv = await service.getInvoiceDetail('inv_unpaid_002');
    assert.equal(inv.status, 'unpaid');
    assert.equal(inv.items.length, 2);
    assert.equal(inv.items[0].description, 'A4 Paper Ream');
    assert.equal(inv.items[1].description, 'Toner Cartridge');
    assert.equal(inv.items[0].quantity, 2);
    assert.equal(inv.items[0].unitPrice, 15000);
    assert.equal(inv.items[0].total, 30000);
  });

  test('unpaid invoice where both exist renders once (no duplicates, canonical wins)', async () => {
    const service = new ErpPortalService(
      createDetailClient(detailPayload({ line_items: CANONICAL_LINES, items: CANONICAL_LINES }))
    );
    const inv = await service.getInvoiceDetail('inv_unpaid_003');
    assert.equal(inv.items.length, 2);
    assert.deepEqual(
      inv.items.map((i) => i.description),
      ['A4 Paper Ream', 'Toner Cartridge']
    );
  });

  test('canonical line_items wins when both arrays differ (no concatenation)', async () => {
    const other = [{ id: 'x1', item_name: 'Other Item', quantity: 9, unit_price: 1, line_total: 9 }];
    const service = new ErpPortalService(
      createDetailClient(detailPayload({ line_items: CANONICAL_LINES, items: other }))
    );
    const inv = await service.getInvoiceDetail('inv_both_differ');
    assert.equal(inv.items.length, 2);
    assert.equal(inv.items[0].description, 'A4 Paper Ream');
  });

  test('empty items array does NOT shadow populated line_items (unpaid regression)', async () => {
    const service = new ErpPortalService(
      createDetailClient(detailPayload({ line_items: CANONICAL_LINES, items: [] }))
    );
    const inv = await service.getInvoiceDetail('inv_unpaid_shadow');
    assert.equal(inv.items.length, 2);
    assert.equal(inv.items[0].description, 'A4 Paper Ream');
  });

  test('empty line_items falls back to populated items', async () => {
    const service = new ErpPortalService(
      createDetailClient(detailPayload({ line_items: [], items: CANONICAL_LINES }))
    );
    const inv = await service.getInvoiceDetail('inv_fallback');
    assert.equal(inv.items.length, 2);
  });

  test('partially-paid invoice keeps items visible', async () => {
    const service = new ErpPortalService(
      createDetailClient({
        status: 'partially_paid',
        total_amount: 75000,
        paid_amount: 10000,
        line_items: CANONICAL_LINES,
        items: CANONICAL_LINES,
      })
    );
    const inv = await service.getInvoiceDetail('inv_partial');
    assert.equal(inv.status, 'partially_paid');
    assert.equal(inv.amountPaid, 10000);
    assert.equal(inv.amountRemaining, 65000);
    assert.equal(inv.items.length, 2);
  });

  test('spaced ERP status "Partially paid" normalizes to partially_paid with items visible', async () => {
    const service = new ErpPortalService(
      createDetailClient({
        status: 'Partially paid',
        total_amount: 75000,
        paid_amount: 10000,
        line_items: CANONICAL_LINES,
        items: CANONICAL_LINES,
      })
    );
    const inv = await service.getInvoiceDetail('inv_partial_space');
    assert.equal(inv.status, 'partially_paid');
    assert.equal(inv.items.length, 2);
  });

  test('paid invoice keeps items visible', async () => {
    const service = new ErpPortalService(
      createDetailClient({
        status: 'Paid',
        total_amount: 75000,
        paid_amount: 75000,
        line_items: CANONICAL_LINES,
        items: CANONICAL_LINES,
      })
    );
    const inv = await service.getInvoiceDetail('inv_paid');
    assert.equal(inv.status, 'paid');
    assert.equal(inv.amountRemaining, 0);
    assert.equal(inv.items.length, 2);
    assert.equal(inv.items[1].quantity, 1);
    assert.equal(inv.items[1].unitPrice, 45000);
    assert.equal(inv.items[1].total, 45000);
  });

  test('payment status never determines item visibility (same lines across statuses)', async () => {
    for (const status of ['Unpaid', 'partially_paid', 'Partially paid', 'Paid'] as const) {
      const paid = status.toLowerCase().includes('paid') && !status.toLowerCase().includes('unpaid')
        ? status.toLowerCase().startsWith('paid')
          ? 75000
          : 10000
        : 0;
      const service = new ErpPortalService(
        createDetailClient({
          status,
          total_amount: 75000,
          paid_amount: paid,
          line_items: CANONICAL_LINES,
          items: CANONICAL_LINES,
        })
      );
      const inv = await service.getInvoiceDetail(`inv_status_${status}`);
      assert.equal(inv.items.length, 2, `status ${status} must still render items`);
    }
  });

  test('empty line-items response yields empty state without crashing', async () => {
    const service = new ErpPortalService(
      createDetailClient(detailPayload({ line_items: [], items: [] }))
    );
    const inv = await service.getInvoiceDetail('inv_empty');
    assert.equal(inv.items.length, 0);
    assert.deepEqual(inv.items, []);
  });

  test('absent line-items fields yield empty state without crashing', async () => {
    const service = new ErpPortalService(createDetailClient(detailPayload({})));
    const inv = await service.getInvoiceDetail('inv_absent');
    assert.equal(inv.items.length, 0);
  });

  test('JSON-string line_items are parsed safely', async () => {
    const service = new ErpPortalService(
      createDetailClient(detailPayload({ line_items: JSON.stringify(CANONICAL_LINES) as unknown as typeof CANONICAL_LINES }))
    );
    const inv = await service.getInvoiceDetail('inv_json_string');
    assert.equal(inv.items.length, 2);
    assert.equal(inv.items[0].description, 'A4 Paper Ream');
  });

  test('malformed JSON line_items do not crash (empty state)', async () => {
    const service = new ErpPortalService(
      createDetailClient(detailPayload({ line_items: '{not-json' as unknown as typeof CANONICAL_LINES }))
    );
    const inv = await service.getInvoiceDetail('inv_bad_json');
    assert.equal(inv.items.length, 0);
  });

  test('customer authorization behaviour unchanged: detail uses JWT-scoped GET, never sends customer_id', async () => {
    const calls: RecordedCall[] = [];
    const service = new ErpPortalService(
      createDetailClient(detailPayload({ line_items: CANONICAL_LINES, items: CANONICAL_LINES }), calls)
    );
    await service.getInvoiceDetail('inv_auth_check');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].path, '/portal/invoices/inv_auth_check');
    assert.ok(!JSON.stringify(calls[0]).includes('customer_id'), 'must never send customer_id');
    assert.ok(!JSON.stringify(calls[0]).includes('CUST-'), 'must never send customer identity');
  });

  test('foreign invoice 403/404 from ERP propagates (ownership enforced server-side)', async () => {
    const forbidden = new ApiError('Invoice not found', { status: 403, code: 'FORBIDDEN' });
    const service = new ErpPortalService(createDetailClient(forbidden));
    await assert.rejects(() => service.getInvoiceDetail('inv_foreign_0001'), (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal((err as ApiError).status, 403);
      return true;
    });
  });
});

describe('INV-P726/021 slash-ID regression (production forensic: CUST-0002, Unpaid, 1 Chalk line)', () => {
  // Verified production Supabase shape: data.items = [{ Chalk (box), quantity 10,
  // price 4000, lineTotalNet 40000 }], normalized by the backend to line_items = [1].
  const CHALK_LINE = { name: 'Chalk (box)', quantity: 10, price: 4000, lineTotalNet: 40000 };

  function chalkPayload(
    status = 'Unpaid',
    paid_amount = 0,
    total_amount = 40000
  ): ErpInvoiceDetail {
    return {
      status,
      total_amount,
      paid_amount,
      line_items: [{ ...CHALK_LINE }],
      items: [{ ...CHALK_LINE }],
    } as ErpInvoiceDetail;
  }

  function summaryInvoice(): Invoice {
    // GET /portal/invoices list shape: headers only, items always [].
    return {
      id: 'INV-P726/021',
      invoiceNumber: 'INV-P726/021',
      issueDate: '2026-01-01',
      dueDate: '2026-02-01',
      amount: 40000,
      amountPaid: 0,
      amountRemaining: 40000,
      status: 'unpaid',
      items: [],
    };
  }

  test('slash invoice ID is URL-encoded so the ERP :id route receives a single id', async () => {
    const calls: RecordedCall[] = [];
    const service = new ErpPortalService(createDetailClient(chalkPayload(), calls));
    const inv = await service.getInvoiceDetail('INV-P726/021');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, '/portal/invoices/INV-P726%2F021');
    // The returned object keeps the raw ID so cache keys match the list summary.
    assert.equal(inv.id, 'INV-P726/021');
    assert.equal(inv.items.length, 1);
  });

  test('INV-P726/021 Chalk payload maps to exactly one line (unpaid, canonical wins, no dup)', async () => {
    const service = new ErpPortalService(createDetailClient(chalkPayload()));
    const inv = await service.getInvoiceDetail('INV-P726/021');
    assert.equal(inv.status, 'unpaid');
    assert.equal(inv.items.length, 1);
    assert.equal(inv.items[0].description, 'Chalk (box)');
    assert.equal(inv.items[0].quantity, 10);
    assert.equal(inv.items[0].unitPrice, 4000);
    assert.equal(inv.items[0].total, 40000);
  });

  test('INV-P726/021 renders under unpaid, partial, and paid statuses', async () => {
    for (const [status, paid] of [['Unpaid', 0], ['partially_paid', 10000], ['Paid', 40000]] as const) {
      const service = new ErpPortalService(createDetailClient(chalkPayload(status, paid)));
      const inv = await service.getInvoiceDetail('INV-P726/021');
      assert.equal(inv.items.length, 1, `status ${status} must still render the Chalk line`);
      assert.equal(inv.items[0].description, 'Chalk (box)');
    }
  });

  test('lineTotalNet is authoritative (discounted line keeps the ERP total, not qty*price)', async () => {
    const discounted = { name: 'Chalk (box)', quantity: 10, price: 4000, lineTotalNet: 35000 };
    const payload: ErpInvoiceDetail = {
      status: 'Unpaid',
      total_amount: 35000,
      paid_amount: 0,
      line_items: [discounted],
      items: [discounted],
    } as ErpInvoiceDetail;
    const service = new ErpPortalService(createDetailClient(payload));
    const inv = await service.getInvoiceDetail('INV-P726/021');
    assert.equal(inv.items.length, 1);
    assert.equal(inv.items[0].unitPrice, 4000);
    assert.equal(inv.items[0].total, 35000);
  });

  test('detail replaces list summary: summary [] + detail [1] → effective has 1; failed detail keeps summary', async () => {
    const summary = summaryInvoice();
    const service = new ErpPortalService(createDetailClient(chalkPayload()));
    const detail = await service.getInvoiceDetail('INV-P726/021');
    // Mirrors InvoiceDetailModal: const effectiveInvoice = detail ?? invoice.
    const effectiveOnSuccess: Invoice = detail ?? summary;
    assert.equal(effectiveOnSuccess.items.length, 1);
    assert.equal(effectiveOnSuccess.id, 'INV-P726/021');
    assert.equal(effectiveOnSuccess.items[0].description, 'Chalk (box)');
    const failedDetail: Invoice | null = null;
    const effectiveOnFailure: Invoice = failedDetail ?? summary;
    assert.equal(effectiveOnFailure.items.length, 0);
    assert.equal(effectiveOnFailure.id, 'INV-P726/021');
  });

  test('INV-P726/021 totals passthrough unchanged and payment actions unchanged', async () => {
    const service = new ErpPortalService(createDetailClient(chalkPayload('Unpaid', 0, 40000)));
    const unpaid = await service.getInvoiceDetail('INV-P726/021');
    assert.equal(unpaid.amount, 40000);
    assert.equal(unpaid.amountPaid, 0);
    assert.equal(unpaid.amountRemaining, 40000);
    assert.equal(canRequestPayment(unpaid), true);
    const paidService = new ErpPortalService(createDetailClient(chalkPayload('Paid', 40000, 40000)));
    const paid = await paidService.getInvoiceDetail('INV-P726/021');
    assert.equal(paid.amountRemaining, 0);
    assert.equal(canRequestPayment(paid), false);
  });
});
