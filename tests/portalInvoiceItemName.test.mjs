/**
 * Regression tests for the Portal invoice line-item name resolution.
 *
 * The Portal's `getInvoiceDetail` mapper must read the item name from
 * every field name the ERP backend may return, and must fall through
 * empty strings so a legacy "" never wins over a real name.
 *
 * Run: node tests/portalInvoiceItemName.test.mjs
 */

import assert from 'node:assert/strict';

// Mirror of the canonical field order used in:
//   - portalService.ts getInvoiceDetail()
//   - officialDocumentService.cjs normalizeRecordForRenderer()
//   - supabaseStore.cjs mapInvoiceLineItems()
const CANONICAL_FIELD_ORDER = [
  'item_name',
  'description',
  'name',
  'productName',
  'product_name',
  'itemName',
  'desc',
  'title',
  'label',
];

function resolveCanonicalDescription(item) {
  const candidate = CANONICAL_FIELD_ORDER
    .map((k) => item?.[k])
    .find((v) => typeof v === 'string' && v.trim().length > 0);
  return candidate == null ? '' : String(candidate);
}

// Mirror of getInvoiceDetail's item mapping (portalService.ts)
function mapInvoiceItem(rawItem, idx) {
  return {
    id: `ii_${idx}`,
    description: resolveCanonicalDescription(rawItem),
    quantity: Number(rawItem.quantity ?? 0),
    unitPrice: Number(rawItem.unitPrice ?? rawItem.unit_price ?? 0),
    total: Number(rawItem.total ?? rawItem.lineTotal ?? rawItem.line_total ?? 0),
  };
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
  }
}

console.log('Portal invoice item name resolution — regression tests\n');

test('canonical field order is deterministic and complete', () => {
  assert.equal(CANONICAL_FIELD_ORDER[0], 'item_name');
  assert.equal(new Set(CANONICAL_FIELD_ORDER).size, CANONICAL_FIELD_ORDER.length);
});

test('reads item_name when present (Supabase canonical path)', () => {
  const item = { item_name: 'A4 Colour Printing', quantity: 7, unit_price: 14000, line_total: 98000 };
  const mapped = mapInvoiceItem(item, 0);
  assert.equal(mapped.description, 'A4 Colour Printing');
  assert.equal(mapped.quantity, 7);
  assert.equal(mapped.unitPrice, 14000);
  assert.equal(mapped.total, 98000);
});

test('reads description when item_name is absent (local SQLite path)', () => {
  const item = { description: 'Lesson Plan (L)', quantity: 2, price: 7000, total: 14000 };
  const mapped = mapInvoiceItem(item, 0);
  assert.equal(mapped.description, 'Lesson Plan (L)');
});

test('reads name when both item_name and description are absent (examination adapter)', () => {
  const item = { name: 'Grade 7 Examination Service', quantity: 17, price: 7000 };
  const mapped = mapInvoiceItem(item, 0);
  assert.equal(mapped.description, 'Grade 7 Examination Service');
});

test('reads productName (legacy sales-order payload)', () => {
  const item = { productName: 'Business Cards 500pcs', quantity: 4, price: 5000 };
  const mapped = mapInvoiceItem(item, 0);
  assert.equal(mapped.description, 'Business Cards 500pcs');
});

test('reads product_name (snake_case legacy sales-order payload)', () => {
  const item = { product_name: 'Flyers A5', quantity: 4, price: 5000 };
  const mapped = mapInvoiceItem(item, 0);
  assert.equal(mapped.description, 'Flyers A5');
});

test('reads itemName (camelCase legacy)', () => {
  const item = { itemName: 'Banner 2x3m', quantity: 1, price: 25000 };
  const mapped = mapInvoiceItem(item, 0);
  assert.equal(mapped.description, 'Banner 2x3m');
});

test('reads desc (truncated legacy field)', () => {
  const item = { desc: 'Stickers 100pcs', quantity: 5, price: 3000 };
  const mapped = mapInvoiceItem(item, 0);
  assert.equal(mapped.description, 'Stickers 100pcs');
});

test('reads title (alternate schema)', () => {
  const item = { title: 'Custom Notebook Printing', quantity: 10, price: 4500 };
  const mapped = mapInvoiceItem(item, 0);
  assert.equal(mapped.description, 'Custom Notebook Printing');
});

test('reads label (alternate schema)', () => {
  const item = { label: 'Certificate Printing A4', quantity: 20, price: 1500 };
  const mapped = mapInvoiceItem(item, 0);
  assert.equal(mapped.description, 'Certificate Printing A4');
});

test('falls through empty strings — real name wins over legacy ""', () => {
  // THE REGRESSION: an item with description="" and a real name elsewhere
  // MUST show the real name, not "".
  const item = { description: '', item_name: 'Real Item Name', quantity: 1, price: 1000 };
  const mapped = mapInvoiceItem(item, 0);
  assert.equal(mapped.description, 'Real Item Name');
});

test('falls through empty strings across multiple fields', () => {
  const item = {
    description: '',
    name: '',
    productName: '',
    product_name: '',
    itemName: '',
    desc: '',
    title: 'The Real Title',
    quantity: 1,
    price: 1000,
  };
  const mapped = mapInvoiceItem(item, 0);
  assert.equal(mapped.description, 'The Real Title');
});

test('returns empty string when all name fields are absent', () => {
  const item = { quantity: 1, price: 1000 };
  const mapped = mapInvoiceItem(item, 0);
  assert.equal(mapped.description, '');
});

test('whitespace-only strings are treated as empty', () => {
  const item = { description: '   ', item_name: 'Real Name', quantity: 1 };
  const mapped = mapInvoiceItem(item, 0);
  assert.equal(mapped.description, 'Real Name');
});

test('preserves financial fields unchanged', () => {
  const item = { item_name: 'Test Item', quantity: 7, unitPrice: 14000, total: 98000 };
  const mapped = mapInvoiceItem(item, 0);
  assert.equal(mapped.quantity, 7);
  assert.equal(mapped.unitPrice, 14000);
  assert.equal(mapped.total, 98000);
});

test('reads unit_price when unitPrice is absent (snake_case)', () => {
  const item = { name: 'Test', quantity: 1, unit_price: 5000, line_total: 5000 };
  const mapped = mapInvoiceItem(item, 0);
  assert.equal(mapped.unitPrice, 5000);
  assert.equal(mapped.total, 5000);
});

test('reads line_total when total is absent (snake_case)', () => {
  const item = { name: 'Test', quantity: 1, unitPrice: 5000, line_total: 10000 };
  const mapped = mapInvoiceItem(item, 0);
  assert.equal(mapped.total, 10000);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
