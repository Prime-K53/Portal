/**
 * Multi-variant pricing flow tests (run: npx tsx tests/variantFlow.test.ts).
 *
 * Pins the Sasa side of the ERP variant contract using the REAL mapper:
 *   A. every variant price survives ERP -> Portal mapping
 *   B. default selection = first variant; displayed price = ITS OWN price
 *   C. selecting each variant resolves exactly that variant's ERP price
 *   E. order payload keeps product id + variant id + variant-labelled name
 *   F. single-price products keep their own price, no variants
 */
import { mapCatalogItem } from '../src/features/customer-portal/services/portalService';
import type { ErpCatalogItem } from '../src/features/customer-portal/types';
import type { Product } from '../src/features/customer-portal/types';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

const erpTShirt: ErpCatalogItem = {
  id: 'INV-TSHIRT',
  name: 'T-Shirt',
  sku: 'INV-TSHIRT',
  unit: 'Each',
  description: null,
  price: 5500,
  quantity: 100,
  category: 'General',
  status: 'Active',
  variants: [
    { id: 'INV-TSHIRT::TS-S', productId: 'INV-TSHIRT', name: 'T-Shirt - S', sku: 'TS-S', attributes: {}, sellingPrice: 5000, costPrice: 2353.5, stock: 10, active: true },
    { id: 'INV-TSHIRT::TS-M', productId: 'INV-TSHIRT', name: 'T-Shirt - M', sku: 'TS-M', attributes: {}, sellingPrice: 5500, costPrice: 3173.5, stock: 20, active: true },
    { id: 'INV-TSHIRT::TS-L', productId: 'INV-TSHIRT', name: 'T-Shirt - L', sku: 'TS-L', attributes: {}, sellingPrice: 6000, costPrice: 3788.5, stock: 30, active: true },
  ],
} as ErpCatalogItem;

// Test A — all three ERP prices survive mapping.
const tshirt: Product = mapCatalogItem(erpTShirt);
check('A1 variant count', tshirt.variants?.length, 3);
check('A2 variant prices preserved', tshirt.variants?.map((v) => v.sellingPrice), [5000, 5500, 6000]);

// Test B — established convention: first variant is preselected and the
// product price IS that selected variant's own ERP price (never invented).
check('B1 default selection', tshirt.selectedVariantId, 'INV-TSHIRT::TS-S');
check('B2 default price = selected variant price', tshirt.price, 5000);

// Test C — selection resolution (mirrors OrdersTab.getEffectiveProduct /
// ProductDetailModal effectivePrice): each variant yields its own ERP price.
function effectivePrice(p: Product, variantId?: string): number {
  const variant = variantId ? p.variants?.find((v) => v.id === variantId) : undefined;
  return variant ? variant.sellingPrice : p.price;
}
check('C1 Small', effectivePrice(tshirt, 'INV-TSHIRT::TS-S'), 5000);
check('C2 Medium', effectivePrice(tshirt, 'INV-TSHIRT::TS-M'), 5500);
check('C3 Large', effectivePrice(tshirt, 'INV-TSHIRT::TS-L'), 6000);

// Test E — order payload line for Large keeps identity + labelled name.
const cartProduct: Product = { ...tshirt, price: effectivePrice(tshirt, 'INV-TSHIRT::TS-L'), selectedVariantId: 'INV-TSHIRT::TS-L' };
const ci = { product: cartProduct, quantity: 2, variantId: 'INV-TSHIRT::TS-L' };
const variant = ci.product.variants?.find((v) => v.id === ci.variantId);
const payloadLine = {
  productId: ci.product.id,
  productName: variant && variant.name !== ci.product.name ? `${ci.product.name} (${variant.name})` : ci.product.name,
  unitPrice: ci.product.price,
  variantId: ci.variantId,
};
check('E1 productId', payloadLine.productId, 'INV-TSHIRT');
check('E2 variantId', payloadLine.variantId, 'INV-TSHIRT::TS-L');
check('E3 labelled name', payloadLine.productName, 'T-Shirt (T-Shirt - L)');
check('E4 authoritative variant price in payload', payloadLine.unitPrice, 6000);

// Test F — single-price product unchanged.
const plain = mapCatalogItem({
  ...(erpTShirt as any),
  id: 'INV-SINGLE',
  name: 'Plain Notebook',
  price: 900,
  variants: undefined,
} as ErpCatalogItem);
check('F1 price', plain.price, 900);
check('F2 no variants', plain.variants ?? undefined, undefined);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll variant-flow checks passed');
