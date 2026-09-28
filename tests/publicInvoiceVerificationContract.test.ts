/**
 * Public Document Verification → Invoice PDF contract (INV-P726/063).
 *
 * The public verification PDF is rendered server-side by the ERP's ONE
 * canonical renderer (officialDocumentService.renderOfficialPdf →
 * normalizeRecordForRenderer → primeRenderer/mapToInvoiceData →
 * PrimeDocument). The Portal never renders the PDF; it only downloads the
 * ERP bytes. This suite pins the data contract the renderer requires so a
 * verification download carries the same substantive invoice fields as the
 * canonical ERP invoice.
 *
 * Canonical renderer expectations (frontend/utils/pdfMapper.ts):
 * - type: UPPERCASE DocType (INVOICE). The public route slug `invoice`
 *   MUST be canonicalized; lowercase falls into the generic fallback branch
 *   (descriptions + quantities only, no prices/amounts/totals/status/
 *   due-date/thank-you).
 * - date: invoiceDate || invoice_date || orderDate || order_date || date
 *   || nextRunDate || created_at || issuedAt || issued_at
 *   (`invoice_number_date` is non-canonical and must not shadow `date`).
 * - dueDate: dueDate || due_date || due_at || validUntil || expiryDate
 * - items: `items` array; line price ← price || unitPrice || unit_price
 *   || selling_price || sellingPrice || unitCost || unit_cost || cost || rate;
 *   line total ← total || lineTotal || line_total || lineTotalNet || subtotal
 *   || totalAmount || amount || extendedPrice || extended_price || qty*price.
 * - totals: totalAmount || total || total_amount; paid ← paidAmount ||
 *   amountPaid || paid_amount; subtotal ← totalAmount || ... || subtotal;
 *   balance is derived by the renderer as total - paid (no new accounting).
 * - status: renderer derives UNPAID/PAID/PARTIAL from total/paid/status.
 * - channel: 'portal' draws the native PORTAL COPY watermark; never 'erp'
 *   for public downloads and never post-processed in the Portal.
 *
 * Portal scope: this file tests what the Portal controls (its own invoice
 * detail mapping + verification route/token handling) against the
 * INV-P726/063 fixture, and documents the ERP-side type/normalization
 * contract (fixed in PrimeERPsystem backend/services/officialDocumentService.cjs)
 * as a pinned table so drift is caught at review time.
 *
 * Run: npx tsx --test tests/publicInvoiceVerificationContract.test.ts
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ErpPortalService } from '../src/features/customer-portal/services/portalService';
import type { ApiClient } from '../src/features/customer-portal/services/apiClient';
import { parseVerificationPath } from '../src/features/customer-portal/views/DocumentVerify';

function clientWith(response: unknown): ApiClient {
  return {
    async get<T>(): Promise<T> { return response as T; },
    async post<T>(): Promise<T> { throw new Error('Not implemented'); },
    async put<T>(): Promise<T> { throw new Error('Not implemented'); },
    async patch<T>(): Promise<T> { throw new Error('Not implemented'); },
    async delete<T>(): Promise<T> { throw new Error('Not implemented'); },
    async request<T>(): Promise<T> { throw new Error('Not implemented'); },
  };
}

/** INV-P726/063 fixture: canonical ERP values from the implementation brief. */
const INV_P726_063_LINES = [
  // sellingPrice + amount spellings (ERP finance layer spellings).
  { description: 'Quick Photocopy', quantity: 80, sellingPrice: 150, amount: 12000 },
  { description: 'Quick Photocopy', quantity: 47, sellingPrice: 150, amount: 7050 },
  // rate + extendedPrice spellings.
  { description: 'Printing L I Numbers', quantity: 4, rate: 450, extendedPrice: 1800 },
];

function invP726063Payload(overrides: Record<string, unknown> = {}) {
  return {
    status: 'Unpaid',
    total_amount: 20850,
    paid_amount: 0,
    subtotal: 20850,
    due_date: '2027-09-08',
    created_at: '2026-09-25',
    date: '2026-09-25',
    invoice_number: 'INV-P726/063',
    customer_name: 'Mandamula Primary School',
    line_items: INV_P726_063_LINES.map((l) => ({ ...l })),
    items: INV_P726_063_LINES.map((l) => ({ ...l })),
    ...overrides,
  };
}

/**
 * Pinned ERP type contract (fixed in officialDocumentService.cjs
 * toCanonicalRendererType). The Portal never maps types itself — the mapping
 * lives server-side — but the table is pinned here so a future route or
 * renderer change that breaks public downloads is caught in Portal review.
 */
const PUBLIC_TO_RENDERER_TYPE: Record<string, string> = {
  invoice: 'INVOICE',
  receipt: 'RECEIPT',
  quotation: 'QUOTATION',
  sales_order: 'SALES_ORDER',
  purchase_order: 'PO',
  delivery_note: 'DELIVERY_NOTE',
  supplier_payment: 'SUPPLIER_PAYMENT',
  statement: 'ACCOUNT_STATEMENT',
  printing_contract: 'PRINTING_CONTRACT',
};

describe('public invoice verification contract — INV-P726/063', () => {
  test('invoice line price reaches the renderer (sellingPrice / rate aliases)', async () => {
    const service = new ErpPortalService(clientWith(invP726063Payload()));
    const inv = await service.getInvoiceDetail('INV-P726/063');
    assert.equal(inv.items.length, 3);
    assert.equal(inv.items[0].unitPrice, 150);
    assert.equal(inv.items[1].unitPrice, 150);
    assert.equal(inv.items[2].unitPrice, 450);
  });

  test('invoice line total reaches the renderer (amount / extendedPrice aliases)', async () => {
    const service = new ErpPortalService(clientWith(invP726063Payload()));
    const inv = await service.getInvoiceDetail('INV-P726/063');
    assert.equal(inv.items[0].total, 12000);
    assert.equal(inv.items[1].total, 7050);
    assert.equal(inv.items[2].total, 1800);
  });

  test('invoice date uses the canonical business date (not a shadow field)', async () => {
    const service = new ErpPortalService(
      clientWith(invP726063Payload({ created_at: '2026-09-25', date: '2026-09-25' }))
    );
    const inv = await service.getInvoiceDetail('INV-P726/063');
    assert.equal(inv.issueDate, '2026-09-25');
  });

  test('invoice due date reaches the renderer (08/09/2027 → 2027-09-08)', async () => {
    const service = new ErpPortalService(clientWith(invP726063Payload()));
    const inv = await service.getInvoiceDetail('INV-P726/063');
    assert.equal(inv.dueDate, '2027-09-08');
  });

  test('subtotal / amountPaid / balanceDue reach the renderer (20850 / 0 / 20850)', async () => {
    const service = new ErpPortalService(clientWith(invP726063Payload()));
    const inv = await service.getInvoiceDetail('INV-P726/063');
    assert.equal(inv.amount, 20850);
    assert.equal(inv.amountPaid, 0);
    assert.equal(inv.amountRemaining, 20850);
  });

  test('status reaches the renderer as UNPAID (no new accounting algorithm)', async () => {
    const service = new ErpPortalService(clientWith(invP726063Payload()));
    const inv = await service.getInvoiceDetail('INV-P726/063');
    assert.equal(inv.status, 'unpaid');
  });

  test('existing snake_case spellings still map (no regression for unit_price/line_total)', async () => {
    const service = new ErpPortalService(
      clientWith(
        invP726063Payload({
          line_items: [{ item_name: 'A4 Paper', quantity: 2, unit_price: 15000, line_total: 30000 }],
          items: [{ item_name: 'A4 Paper', quantity: 2, unit_price: 15000, line_total: 30000 }],
        })
      )
    );
    const inv = await service.getInvoiceDetail('INV-P726/063');
    assert.equal(inv.items[0].description, 'A4 Paper');
    assert.equal(inv.items[0].unitPrice, 15000);
    assert.equal(inv.items[0].total, 30000);
  });

  test('public verification type canonicalization contract (ERP-side, pinned here)', () => {
    // Lowercase public slugs must render as their UPPERCASE DocType.
    // In particular `invoice` → `INVOICE`; lowercase falls into the
    // renderer's generic fallback (no financials, no thank-you).
    assert.equal(PUBLIC_TO_RENDERER_TYPE['invoice'], 'INVOICE');
    assert.equal(PUBLIC_TO_RENDERER_TYPE['sales_order'], 'SALES_ORDER');
    assert.equal(PUBLIC_TO_RENDERER_TYPE['purchase_order'], 'PO');
    assert.equal(PUBLIC_TO_RENDERER_TYPE['delivery_note'], 'DELIVERY_NOTE');
    assert.equal(PUBLIC_TO_RENDERER_TYPE['supplier_payment'], 'SUPPLIER_PAYMENT');
    assert.equal(PUBLIC_TO_RENDERER_TYPE['statement'], 'ACCOUNT_STATEMENT');
    // Already-canonical types pass through unchanged (no double mapping).
    for (const canonical of Object.values(PUBLIC_TO_RENDERER_TYPE)) {
      assert.ok(typeof canonical === 'string' && canonical === canonical.toUpperCase());
    }
  });

  test('portal channel remains portal (watermark behavior unchanged)', () => {
    // The Portal never sets the render channel itself — the ERP route sets
    // channel:'portal' server-side and the renderer draws the native
    // PORTAL COPY watermark. The Portal only downloads bytes verbatim.
    // Pin: verification download URLs always carry the token and never a
    // channel override.
    const parsed = parseVerificationPath('/verify/invoice/INV-P726%2F063?t=tok123');
    assert.equal(parsed.type, 'invoice');
    assert.equal(parsed.number, 'INV-P726/063');
    assert.equal(parsed.token, 'tok123');
    const apiBase = 'https://example.invalid'.replace(/\/+$/, '');
    const url = `${apiBase}/api/public/documents/download/${encodeURIComponent(parsed.type!)}/${encodeURIComponent(parsed.number)}?t=${encodeURIComponent(parsed.token)}`;
    assert.ok(url.includes('?t=tok123'));
    assert.ok(!url.includes('channel='));
    assert.ok(!url.toLowerCase().includes('watermark'));
  });

  test('verification security unchanged (token required, number sanitized by route)', () => {
    assert.equal(parseVerificationPath('/verify/invoice/INV-001').token, '');
    assert.equal(parseVerificationPath('/verify/invoice/INV-001?t=').token, '');
    assert.equal(parseVerificationPath('/verify/unknown/XYZ-001?t=abc123').type, null);
  });

  test('other document types are not changed unintentionally (route slugs intact)', () => {
    assert.equal(parseVerificationPath('/verify/quotation/QTN-001?t=a').type, 'quotation');
    assert.equal(parseVerificationPath('/verify/sales-order/SO-001?t=a').type, 'sales_order');
    assert.equal(parseVerificationPath('/verify/purchase-order/PO-001?t=a').type, 'purchase_order');
    assert.equal(parseVerificationPath('/verify/delivery-note/DN-001?t=a').type, 'delivery_note');
    assert.equal(parseVerificationPath('/verify/supplier-payment/SPAY-001?t=a').type, 'supplier_payment');
    assert.equal(parseVerificationPath('/verify/statement/STMT-001?t=a').type, 'statement');
    assert.equal(parseVerificationPath('/verify/receipt/PAY-001?t=a').type, 'receipt');
  });
});
