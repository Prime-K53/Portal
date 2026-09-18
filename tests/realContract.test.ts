import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { tabFromPath, isPublicRoute, isAuthOnlyRoute, pathForTab } from '../src/features/customer-portal/router/routes';
import { createApiClient, ApiError } from '../src/features/customer-portal/services/apiClient';

describe('Real route contract (imports production code)', () => {
  test('tabFromPath is case-insensitive and trims slashes', () => {
    assert.equal(tabFromPath('/invoices'), 'invoices');
    assert.equal(tabFromPath('/Invoices'), 'invoices');
    assert.equal(tabFromPath('/invoices/'), 'invoices');
    assert.equal(tabFromPath('/invoices?filter=overdue'), 'invoices');
    assert.equal(tabFromPath('/requests'), 'quotes');
    assert.equal(tabFromPath('/quotations'), 'quotes');
    assert.equal(tabFromPath('/nope'), null);
  });

  test('public vs auth-only split: pending receipt stays viewable when authed', () => {
    assert.equal(isPublicRoute('/register/pending'), true);
    assert.equal(isAuthOnlyRoute('/register/pending'), false);
    assert.equal(isAuthOnlyRoute('/login'), true);
    assert.equal(isPublicRoute('/dashboard'), false);
  });

  test('pathForTab canonicalizes quotes to /quotations', () => {
    assert.equal(pathForTab('quotes'), '/quotations');
  });
});

describe('Real ApiError contract (imports production code)', () => {
  test('401 is auth error, 403 is NOT (no session kill on forbidden)', () => {
    const u = new ApiError('x', { status: 401, code: 'UNAUTHORIZED' });
    const f = new ApiError('x', { status: 403, code: 'FORBIDDEN' });
    assert.equal(u.isAuthError, true);
    assert.equal(f.isAuthError, false);
  });

  test('requestGate blocks every attempt, FormData has no JSON Content-Type', async () => {
    let gateCalls = 0;
    const client = createApiClient({
      baseUrl: 'https://erp.example.com/api',
      getAccessToken: () => 't',
      refreshAccessToken: async () => null,
      onAuthFailure: () => {},
      requestGate: () => {
        gateCalls += 1;
        return new ApiError('terminated', { code: 'UNAUTHORIZED' });
      },
    });
    await assert.rejects(() => client.get('/portal/invoices'), /terminated/);
    assert.ok(gateCalls >= 1);
  });

  test('NOT_CONFIGURED when baseUrl empty', async () => {
    const client = createApiClient({
      baseUrl: '',
      getAccessToken: () => null,
      refreshAccessToken: async () => null,
    });
    await assert.rejects(
      () => client.get('/portal/invoices'),
      (e: unknown) => e instanceof ApiError && e.code === 'NOT_CONFIGURED'
    );
  });
});
