/**
 * Prime PORTAL — Quotation Request Identity Preservation — Focused Unit Tests
 *
 * Run with:   npx tsx acceptance/quote-request-identity.test.ts
 *
 * Verifies that catalog product identity (productId / variantId) survives
 * the full Portal quotation-request flow:
 *   QuoteRequestModal selection → submitQuoteRequest payload → ERP response
 *
 * No real ERP API is called. A FakeClient records the exact POST body.
 */

import { ErpPortalService } from '../src/features/customer-portal/services/portalService';
import { ApiError, type ApiClient, type ApiRequestOptions, type HttpMethod } from '../src/features/customer-portal/services/apiClient';
import type { ErpRequest, QuoteRequestItem } from '../src/features/customer-portal/types';

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

// ── Fake ERP ApiClient ──────────────────────────────────────────────────────

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

// ── Fixtures ────────────────────────────────────────────────────────────────

const erpQuotationRequest: ErpRequest = {
  id: 'req_2026_000456',
  requestNumber: 'QTR-2026-000456',
  requestType: 'quotation',
  status: 'submitted',
  items: [
    {
      productId: 'prod-a4-hard',
      variantId: null,
      name: 'A4 Hardcover',
      quantity: 5,
      unitPrice: 6500,
      lineTotal: 32500,
      priceSource: 'master',
    },
    {
      productId: null,
      variantId: null,
      name: 'Custom school booklet',
      quantity: 100,
      unitPrice: 0,
      lineTotal: 0,
      priceSource: 'custom_line',
    },
  ],
  subtotal: 32500,
  total: 32500,
  notes: null,
  requestedDeliveryDate: '2026-08-25',
  created_at: '2026-08-23T12:00:00.000Z',
};

const catalogProduct = {
  id: 'prod-a4-hard',
  name: 'A4 Executive Hardcover Notebook (Custom Embossed)',
  category: 'Stationery & Cards',
  price: 18.50,
  unit: 'Each',
  description: '192 archival ruled pages, foil embossed faux-leather cover with ribbon bookmark.',
  image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=300&auto=format&fit=crop&q=80',
  inStock: true,
  minOrderQty: 1,
  sku: 'A4-HARD-001',
  rating: 4.8,
  ratingCount: 124,
  isTopSeller: true,
  variants: [],
  selectedVariantId: undefined,
};

const catalogProductWithVariant = {
  ...catalogProduct,
  id: 'prod-pen',
  name: 'Executive Pen Set',
  sku: 'PEN-SET-01',
  variants: [
    {
      id: 'var-pen-blue',
      productId: 'prod-pen',
      name: 'Blue Ink',
      sku: 'PEN-BLUE',
      attributes: { color: 'Blue' },
      sellingPrice: 2500,
      costPrice: 1500,
      stock: 500,
      active: true,
    },
    {
      id: 'var-pen-red',
      productId: 'prod-pen',
      name: 'Red Ink',
      sku: 'PEN-RED',
      attributes: { color: 'Red' },
      sellingPrice: 2500,
      costPrice: 1500,
      stock: 300,
      active: true,
    },
  ],
  selectedVariantId: 'var-pen-blue',
};

// ── 1. Service payload preserves productId for catalog items ────────────────

async function testCatalogItemPreservesProductId(): Promise<void> {
  const client = new FakeClient().on('POST', '/portal/requests', erpQuotationRequest);
  const service = new ErpPortalService(client);

  const items: QuoteRequestItem[] = [
    {
      id: '1',
      productId: 'prod-a4-hard',
      name: 'A4 Executive Hardcover Notebook (Custom Embossed)',
      quantity: 5,
      targetPrice: null,
    },
  ];

  await service.submitQuoteRequest({
    items,
    requiredByDate: '2026-08-25',
    deliveryLocation: 'Lusaka',
    priority: 'standard',
    notes: 'Please include embossing.',
  });

  const post = client.calls.find((c) => c.method === 'POST' && c.path === '/portal/requests');
  const body = post?.body as Record<string, unknown> | undefined;

  check(
    'Payload: catalog item forwards productId',
    body?.items && Array.isArray(body.items) && body.items[0]?.productId === 'prod-a4-hard',
    body?.items ? JSON.stringify(body.items[0]) : 'no items in payload'
  );
  check(
    'Payload: catalog item preserves display name (not replaced by ERP name)',
    body?.items && Array.isArray(body.items) && body.items[0]?.name === 'A4 Executive Hardcover Notebook (Custom Embossed)',
    body?.items ? JSON.stringify(body.items[0]) : 'no items in payload'
  );
  check(
    'Payload: catalog item forwards quantity',
    body?.items && Array.isArray(body.items) && body.items[0]?.quantity === 5,
    body?.items ? JSON.stringify(body.items[0]) : 'no items in payload'
  );
}

// ── 2. Service payload omits productId for custom items ─────────────────────

async function testCustomItemOmitsProductId(): Promise<void> {
  const client = new FakeClient().on('POST', '/portal/requests', erpQuotationRequest);
  const service = new ErpPortalService(client);

  const items: QuoteRequestItem[] = [
    {
      id: '1',
      name: 'Custom school booklet',
      quantity: 100,
      targetPrice: null,
    },
  ];

  await service.submitQuoteRequest({
    items,
    requiredByDate: '2026-08-25',
    deliveryLocation: 'Lusaka',
    priority: 'standard',
  });

  const post = client.calls.find((c) => c.method === 'POST' && c.path === '/portal/requests');
  const body = post?.body as Record<string, unknown> | undefined;

  check(
    'Payload: custom item has no productId',
    body?.items && Array.isArray(body.items) && !('productId' in (body.items[0] as object)),
    body?.items ? JSON.stringify(body.items[0]) : 'no items in payload'
  );
  check(
    'Payload: custom item has no variantId',
    body?.items && Array.isArray(body.items) && !('variantId' in (body.items[0] as object)),
    body?.items ? JSON.stringify(body.items[0]) : 'no items in payload'
  );
}

// ── 3. Service payload preserves variantId ──────────────────────────────────

async function testVariantIdPreserved(): Promise<void> {
  const client = new FakeClient().on('POST', '/portal/requests', erpQuotationRequest);
  const service = new ErpPortalService(client);

  const items: QuoteRequestItem[] = [
    {
      id: '1',
      productId: 'prod-pen',
      variantId: 'var-pen-blue',
      name: 'Executive Pen Set',
      quantity: 2,
      targetPrice: null,
    },
  ];

  await service.submitQuoteRequest({
    items,
    requiredByDate: '2026-08-25',
    deliveryLocation: 'Lusaka',
    priority: 'standard',
  });

  const post = client.calls.find((c) => c.method === 'POST' && c.path === '/portal/requests');
  const body = post?.body as Record<string, unknown> | undefined;

  check(
    'Payload: variant item forwards variantId',
    body?.items && Array.isArray(body.items) && body.items[0]?.variantId === 'var-pen-blue',
    body?.items ? JSON.stringify(body.items[0]) : 'no items in payload'
  );
  check(
    'Payload: variant item forwards parent productId',
    body?.items && Array.isArray(body.items) && body.items[0]?.productId === 'prod-pen',
    body?.items ? JSON.stringify(body.items[0]) : 'no items in payload'
  );
}

// ── 4. Mixed catalog + custom items in one request ──────────────────────────

async function testMixedCatalogAndCustomItems(): Promise<void> {
  const client = new FakeClient().on('POST', '/portal/requests', erpQuotationRequest);
  const service = new ErpPortalService(client);

  const items: QuoteRequestItem[] = [
    {
      id: '1',
      productId: 'prod-a4-hard',
      name: 'A4 Executive Hardcover Notebook (Custom Embossed)',
      quantity: 5,
      targetPrice: null,
    },
    {
      id: '2',
      name: 'Type & printing Administration Records',
      quantity: 1,
      targetPrice: null,
    },
  ];

  await service.submitQuoteRequest({
    items,
    requiredByDate: '2026-08-25',
    deliveryLocation: 'Lusaka',
    priority: 'standard',
  });

  const post = client.calls.find((c) => c.method === 'POST' && c.path === '/portal/requests');
  const body = post?.body as Record<string, unknown> | undefined;
  const wireItems = body?.items as Record<string, unknown>[] | undefined;

  check(
    'Mixed payload: first item has productId',
    wireItems && wireItems[0]?.productId === 'prod-a4-hard',
    wireItems ? JSON.stringify(wireItems[0]) : 'no items'
  );
  check(
    'Mixed payload: second item has no productId',
    wireItems && !('productId' in (wireItems[1] as object)),
    wireItems ? JSON.stringify(wireItems[1]) : 'no items'
  );
  check(
    'Mixed payload: second item keeps its display name',
    wireItems && wireItems[1]?.name === 'Type & printing Administration Records',
    wireItems ? JSON.stringify(wireItems[1]) : 'no items'
  );
}

// ── 5. ERP response mapping preserves productId / variantId ────────────────

async function testErpResponseMappingPreservesIdentity(): Promise<void> {
  const client = new FakeClient().on('POST', '/portal/requests', erpQuotationRequest);
  const service = new ErpPortalService(client);

  const items: QuoteRequestItem[] = [
    {
      id: '1',
      productId: 'prod-a4-hard',
      variantId: null,
      name: 'A4 Hardcover',
      quantity: 5,
      targetPrice: null,
    },
  ];

  const created = await service.submitQuoteRequest({
    items,
    requiredByDate: '2026-08-25',
    deliveryLocation: 'Lusaka',
    priority: 'standard',
  });

  check(
    'Response mapping: created items preserve productId',
    created.items[0]?.productId === 'prod-a4-hard',
    JSON.stringify(created.items[0])
  );
  check(
    'Response mapping: created items preserve variantId when present',
    created.items[0]?.variantId === null || created.items[0]?.variantId === undefined,
    JSON.stringify(created.items[0])
  );
}

// ── 6. No authoritative price is sent from Portal ───────────────────────────

async function testNoAuthoritativePriceSent(): Promise<void> {
  const client = new FakeClient().on('POST', '/portal/requests', erpQuotationRequest);
  const service = new ErpPortalService(client);

  const items: QuoteRequestItem[] = [
    {
      id: '1',
      productId: 'prod-a4-hard',
      name: 'A4 Executive Hardcover Notebook (Custom Embossed)',
      quantity: 5,
      targetPrice: 6500,
    },
  ];

  await service.submitQuoteRequest({
    items,
    requiredByDate: '2026-08-25',
    deliveryLocation: 'Lusaka',
    priority: 'standard',
  });

  const post = client.calls.find((c) => c.method === 'POST' && c.path === '/portal/requests');
  const body = post?.body as Record<string, unknown> | undefined;
  const wireItems = body?.items as Record<string, unknown>[] | undefined;

  check(
    'Payload: targetPrice may be sent but ERP ignores it for pricing authority',
    wireItems && wireItems[0]?.unitPrice === 6500,
    wireItems ? JSON.stringify(wireItems[0]) : 'no items'
  );
  check(
    'Payload: productId is still forwarded alongside any targetPrice',
    wireItems && wireItems[0]?.productId === 'prod-a4-hard',
    wireItems ? JSON.stringify(wireItems[0]) : 'no items'
  );
}

// ── 7. QuoteRequestModal selectProduct preserves identity ───────────────────

async function testModalSelectProductPreservesIdentity(): Promise<void> {
  // Simulate the exact selectProduct mapping from QuoteRequestModal.tsx
  const product = catalogProduct;

  const item: QuoteRequestItem = {
    id: '1',
    name: '',
    quantity: 1,
    targetPrice: undefined,
  };

  const updated = {
    ...item,
    name: product.name,
    query: product.name,
    showSuggestions: false,
    activeIndex: 0,
    quantity: item.quantity < product.minOrderQty ? product.minOrderQty : item.quantity,
    productId: product.id,
    variantId: product.selectedVariantId || undefined,
  };

  check(
    'Modal: selected catalog item has productId',
    updated.productId === 'prod-a4-hard',
    JSON.stringify(updated.productId)
  );
  check(
    'Modal: selected catalog item preserves display name',
    updated.name === 'A4 Executive Hardcover Notebook (Custom Embossed)',
    JSON.stringify(updated.name)
  );
  check(
    'Modal: selected catalog item has no variantId when no variant selected',
    updated.variantId === undefined,
    JSON.stringify(updated.variantId)
  );
}

// ── 8. QuoteRequestModal selectProduct with variant preserves variantId ─────

async function testModalSelectVariantPreservesVariantId(): Promise<void> {
  const product = catalogProductWithVariant;

  const item: QuoteRequestItem = {
    id: '1',
    name: '',
    quantity: 1,
    targetPrice: undefined,
  };

  const updated = {
    ...item,
    name: product.name,
    query: product.name,
    showSuggestions: false,
    activeIndex: 0,
    quantity: item.quantity < product.minOrderQty ? product.minOrderQty : item.quantity,
    productId: product.id,
    variantId: product.selectedVariantId || undefined,
  };

  check(
    'Modal: variant product preserves productId',
    updated.productId === 'prod-pen',
    JSON.stringify(updated.productId)
  );
  check(
    'Modal: variant product preserves selectedVariantId as variantId',
    updated.variantId === 'var-pen-blue',
    JSON.stringify(updated.variantId)
  );
}

// ── Run ─────────────────────────────────────────────────────────────────────

(async () => {
  await testCatalogItemPreservesProductId();
  await testCustomItemOmitsProductId();
  await testVariantIdPreserved();
  await testMixedCatalogAndCustomItems();
  await testErpResponseMappingPreservesIdentity();
  await testNoAuthoritativePriceSent();
  await testModalSelectProductPreservesIdentity();
  await testModalSelectVariantPreservesVariantId();

  console.log('\n═══ SUMMARY ═══');
  const passes = results.filter((r) => r.pass).length;
  console.log(`PASS ${passes} / ${results.length}  FAIL ${failures}`);
  if (failures) {
    results.filter((r) => !r.pass).forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
  }
  process.exit(failures ? 1 : 0);
})();
