import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseVerificationPath } from '../src/features/customer-portal/views/DocumentVerify';

describe('parseVerificationPath', () => {
  it('parses invoice verification path with encoded slash', () => {
    const result = parseVerificationPath('/verify/invoice/INV-P726%2F029?t=f393b887e143958bb9338c5cd4c5975444bcbc3a558e6a773f629d5384140188');
    assert.strictEqual(result.type, 'invoice');
    assert.strictEqual(result.number, 'INV-P726/029');
    assert.strictEqual(result.token, 'f393b887e143958bb9338c5cd4c5975444bcbc3a558e6a773f629d5384140188');
  });

  it('parses receipt verification path', () => {
    const result = parseVerificationPath('/verify/receipt/PAY-001?t=abc123');
    assert.strictEqual(result.type, 'receipt');
    assert.strictEqual(result.number, 'PAY-001');
    assert.strictEqual(result.token, 'abc123');
  });

  it('parses quotation verification path', () => {
    const result = parseVerificationPath('/verify/quotation/QTN-001?t=abc123');
    assert.strictEqual(result.type, 'quotation');
    assert.strictEqual(result.number, 'QTN-001');
    assert.strictEqual(result.token, 'abc123');
  });

  it('parses sales-order verification path', () => {
    const result = parseVerificationPath('/verify/sales-order/SO-001?t=abc123');
    assert.strictEqual(result.type, 'sales_order');
    assert.strictEqual(result.number, 'SO-001');
    assert.strictEqual(result.token, 'abc123');
  });

  it('parses purchase-order verification path', () => {
    const result = parseVerificationPath('/verify/purchase-order/PO-001?t=abc123');
    assert.strictEqual(result.type, 'purchase_order');
    assert.strictEqual(result.number, 'PO-001');
    assert.strictEqual(result.token, 'abc123');
  });

  it('parses delivery-note verification path', () => {
    const result = parseVerificationPath('/verify/delivery-note/DN-001?t=abc123');
    assert.strictEqual(result.type, 'delivery_note');
    assert.strictEqual(result.number, 'DN-001');
    assert.strictEqual(result.token, 'abc123');
  });

  it('parses supplier-payment verification path', () => {
    const result = parseVerificationPath('/verify/supplier-payment/SPAY-001?t=abc123');
    assert.strictEqual(result.type, 'supplier_payment');
    assert.strictEqual(result.number, 'SPAY-001');
    assert.strictEqual(result.token, 'abc123');
  });

  it('parses statement verification path', () => {
    const result = parseVerificationPath('/verify/statement/STMT-001?t=abc123');
    assert.strictEqual(result.type, 'statement');
    assert.strictEqual(result.number, 'STMT-001');
    assert.strictEqual(result.token, 'abc123');
  });

  it('returns null type for unknown slug', () => {
    const result = parseVerificationPath('/verify/unknown/XYZ-001?t=abc123');
    assert.strictEqual(result.type, null);
    assert.strictEqual(result.number, 'XYZ-001');
    assert.strictEqual(result.token, 'abc123');
  });

  it('handles missing token', () => {
    const result = parseVerificationPath('/verify/invoice/INV-001');
    assert.strictEqual(result.type, 'invoice');
    assert.strictEqual(result.number, 'INV-001');
    assert.strictEqual(result.token, '');
  });

  it('handles missing query string', () => {
    const result = parseVerificationPath('/verify/invoice/INV-001?t=');
    assert.strictEqual(result.type, 'invoice');
    assert.strictEqual(result.number, 'INV-001');
    assert.strictEqual(result.token, '');
  });
});
