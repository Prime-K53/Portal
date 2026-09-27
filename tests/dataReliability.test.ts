import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

/**
 * Data-reliability helpers (run: npx tsx --test tests/dataReliability.test.ts).
 *
 * Covers the Phase 2 invalidation/outbox logic:
 *   1. scopesForDocType maps ERP entity_changed docTypes to query scopes,
 *      with a global (undefined) fallback for unknown types.
 *   2. Outbox retry policy: attempts cap + TTL expiry.
 */

import { scopesForDocType } from '../src/features/customer-portal/hooks/usePortalData';
import {
  MAX_OUTBOX_ATTEMPTS,
  OUTBOX_TTL_MS,
  isOutboxEntryRetryable,
  type OutboxEntry,
} from '../src/features/customer-portal/utils/mutationOutbox';

function entry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id: 'test-entry',
    kind: 'order-request',
    idempotencyKey: 'key-1',
    payload: {},
    createdAt: new Date().toISOString(),
    attempts: 0,
    ...overrides,
  };
}

describe('scopesForDocType', () => {
  test('invoice changes invalidate invoices + statements', () => {
    assert.deepEqual(scopesForDocType('invoice'), ['invoices', 'statements']);
    assert.deepEqual(scopesForDocType('Invoice'), ['invoices', 'statements']);
  });

  test('payment changes fan out to payments, requests, invoices, statements', () => {
    const scopes = scopesForDocType('supplier-payment');
    assert.ok(scopes?.includes('payments'), 'includes payments');
    assert.ok(scopes?.includes('payment-requests'), 'includes payment-requests');
    assert.ok(scopes?.includes('invoices'), 'includes invoices');
  });

  test('orders, quotes, deliveries, referrals map to their tabs', () => {
    assert.deepEqual(scopesForDocType('sales-order'), ['orders', 'order-requests']);
    assert.deepEqual(scopesForDocType('quotation'), ['quotations', 'quote-requests']);
    assert.deepEqual(scopesForDocType('delivery-note'), ['deliveries']);
    assert.deepEqual(scopesForDocType('referral-reward'), ['referrals', 'wallet']);
  });

  test('notification docType does not route to deliveries', () => {
    assert.deepEqual(scopesForDocType('notification'), ['notifications']);
  });

  test('ads match exactly — "lead" must NOT map to ads', () => {
    assert.deepEqual(scopesForDocType('ads'), ['ads']);
    assert.equal(scopesForDocType('lead'), undefined);
  });

  test('unknown, empty, and blank docTypes fall back to global', () => {
    assert.equal(scopesForDocType('mystery-doc'), undefined);
    assert.equal(scopesForDocType(''), undefined);
    assert.equal(scopesForDocType('   '), undefined);
  });
});

describe('outbox retry policy', () => {
  test('fresh entry with no attempts is retryable', () => {
    assert.equal(isOutboxEntryRetryable(entry()), true);
  });

  test('entries at the attempt cap are not auto-retryable', () => {
    assert.equal(isOutboxEntryRetryable(entry({ attempts: MAX_OUTBOX_ATTEMPTS })), false);
    assert.equal(isOutboxEntryRetryable(entry({ attempts: MAX_OUTBOX_ATTEMPTS + 3 })), false);
  });

  test('entries older than the TTL are never replayed', () => {
    const old = new Date(Date.now() - OUTBOX_TTL_MS - 1000).toISOString();
    assert.equal(isOutboxEntryRetryable(entry({ createdAt: old })), false);
  });

  test('entries with an unparseable timestamp are treated as expired', () => {
    assert.equal(isOutboxEntryRetryable(entry({ createdAt: 'not-a-date' })), false);
  });

  test('policy constants are sane', () => {
    assert.ok(MAX_OUTBOX_ATTEMPTS >= 1 && MAX_OUTBOX_ATTEMPTS <= 20, 'bounded attempts');
    assert.ok(OUTBOX_TTL_MS >= 24 * 60 * 60 * 1000, 'TTL at least a day');
  });
});
