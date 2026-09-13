/**
 * Customer Registration Request Tests
 * Run: npx tsx --test tests/registrationRequest.test.ts
 *
 * Pins the approval-gated public registration migration:
 *   - Create Account submits to POST /portal/registration-requests (201 →
 *     request number + pending status), never to /portal/auth/register.
 *   - No session/token/user is established by the request flow and no
 *     password material is ever sent or stored.
 *   - Referral codes parse from BOTH the hash form (#/register?ref=CODE)
 *     and the shared-link path form (/register?ref=CODE, i.e. `?ref=CODE`
 *     in window.location.search).
 *   - One Idempotency-Key per logical attempt, reused across retries.
 *   - Backend errors (409 duplicate pending, 400 invalid referral, 429 rate
 *     limit, network failure) map to explicit kinds.
 *   - The pending screen route is public; the dashboard stays protected;
 *     login/logout/refresh/activation endpoints are untouched.
 *
 * Service tests inject a stub ApiClient — no network, no DOM, no singletons.
 * Static checks read the actual component sources to prove no registration
 * bypass (session creation / legacy endpoint) remains in the UI layer.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';

import { ApiError, type ApiClient } from '../src/features/customer-portal/services/apiClient';
import {
  RegistrationRequestError,
  buildRegistrationIdempotencyHeaders,
  cancelRegistrationRequest,
  extractRequestNumber,
  getRegistrationRequestStatus,
  readPendingRegistration,
  submitRegistrationRequest,
  toRegistrationRequestError,
  writePendingRegistration,
  type PendingStorageLike,
} from '../src/features/customer-portal/services/registrationRequestService';
import {
  parseReferralCodeFromLocations,
  PENDING_REFERRAL_STORAGE_KEY,
} from '../src/features/customer-portal/utils/referral';
import { generateIdempotencyKey } from '../src/features/customer-portal/utils/idempotency';
import {
  ROUTES,
  isPublicRoute,
  tabFromPath,
} from '../src/features/customer-portal/router/routes';

// ── Stub API client ──────────────────────────────────────────────────────────

interface CapturedCall {
  method: string;
  path: string;
  body?: unknown;
  options?: Record<string, unknown>;
}

function stubClient(handler: (call: CapturedCall) => unknown): ApiClient & { calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const client = {
    calls,
    async request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, options?: Record<string, unknown>): Promise<T> {
      const call: CapturedCall = { method, path, body: (options as { body?: unknown } | undefined)?.body, options };
      calls.push(call);
      return handler(call) as T;
    },
    async get<T>(path: string, options?: Record<string, unknown>): Promise<T> {
      return client.request<T>('GET', path, options);
    },
    async post<T>(path: string, body?: unknown, options?: Record<string, unknown>): Promise<T> {
      return client.request<T>('POST', path, { ...options, body });
    },
    async put<T>(path: string, body?: unknown, options?: Record<string, unknown>): Promise<T> {
      return client.request<T>('PUT', path, { ...options, body });
    },
    async patch<T>(path: string, body?: unknown, options?: Record<string, unknown>): Promise<T> {
      return client.request<T>('PATCH', path, { ...options, body });
    },
    async delete<T>(path: string, options?: Record<string, unknown>): Promise<T> {
      return client.request<T>('DELETE', path, options);
    },
  };
  return client;
}

function readSource(relativePath: string): string {
  return readFileSync(new URL(`../src/${relativePath}`, import.meta.url), 'utf8');
}

const VALID_INPUT = () => ({
  companyName: 'Acme Printers Ltd',
  contactName: 'Ada Banda',
  email: 'ada.banda@example.com',
  phone: '0888123456',
  tier: 'School Account' as const,
  referredByCode: 'FNMJ74HZ',
});

const CREATED_201 = () => ({
  requestNumber: 'CREG-2026-000001',
  status: 'pending',
  submittedAt: '2026-09-13T00:00:00.000Z',
  message: 'Registration request received and pending review.',
});

function mapStorage(): PendingStorageLike & { size: number } {
  const backing = new Map<string, string>();
  return {
    get size() {
      return backing.size;
    },
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => {
      backing.set(key, value);
    },
    removeItem: (key: string) => {
      backing.delete(key);
    },
  };
}

// ── Submission ───────────────────────────────────────────────────────────────

describe('registration request submission', () => {
  it('1 — Create Account submits to /portal/registration-requests (anonymous)', async () => {
    const client = stubClient(() => CREATED_201());
    await submitRegistrationRequest(VALID_INPUT(), 'key-1', client);
    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0].method, 'POST');
    assert.equal(client.calls[0].path, '/portal/registration-requests');
    assert.equal((client.calls[0].options as { skipAuth?: boolean } | undefined)?.skipAuth, true);
  });

  it('2/3 — successful submission resolves the request number + pending status', async () => {
    const client = stubClient(() => CREATED_201());
    const response = await submitRegistrationRequest(VALID_INPUT(), 'key-1', client);
    assert.equal(response.requestNumber, 'CREG-2026-000001');
    assert.equal(response.status, 'pending');
  });

  it('4-7 — submission ships no session/token/user material and never touches the legacy endpoint', async () => {
    const client = stubClient(() => CREATED_201());
    await submitRegistrationRequest(VALID_INPUT(), 'key-1', client);
    const body = client.calls[0].body as Record<string, unknown>;
    for (const forbidden of [
      'password',
      'confirmPassword',
      'password_hash',
      'access_token',
      'refresh_token',
      'customer_id',
      'portal_user',
      'tenant_id',
      'organization_id',
      'company_id',
    ]) {
      assert.ok(!(forbidden in body), `body must not contain ${forbidden}`);
    }
    assert.ok(!client.calls.some((c) => String(c.path).includes('/portal/auth/register')));
    const serviceSource = readSource('features/customer-portal/services/registrationRequestService.ts');
    assert.ok(!serviceSource.includes('tokenStore'), 'request service must not touch the token store');
    assert.ok(!serviceSource.includes('establishSession'), 'request flow must not establish a session');
  });

  it('8/9 — password and confirm-password are never sent', async () => {
    const client = stubClient(() => CREATED_201());
    // Even if a legacy-shaped object is passed, only review fields are sent.
    await submitRegistrationRequest(
      { ...VALID_INPUT(), password: 'secret123', confirmPassword: 'secret123' } as unknown as ReturnType<typeof VALID_INPUT>,
      'key-1',
      client
    );
    const sent = JSON.stringify(client.calls[0].body);
    assert.ok(!sent.includes('secret123'), 'credential material must not be serialized');
    assert.deepEqual(
      Object.keys(client.calls[0].body as Record<string, unknown>).sort(),
      ['companyName', 'contactName', 'email', 'phone', 'referredByCode', 'tier']
    );
  });

  it('referredByCode is submitted when a referral was captured', async () => {
    const client = stubClient(() => CREATED_201());
    await submitRegistrationRequest(VALID_INPUT(), 'key-1', client);
    assert.equal((client.calls[0].body as Record<string, unknown>).referredByCode, 'FNMJ74HZ');
  });

  it('referredByCode is omitted when no referral was captured', async () => {
    const client = stubClient(() => CREATED_201());
    const { referredByCode: _omit, ...withoutReferral } = VALID_INPUT();
    await submitRegistrationRequest(withoutReferral, 'key-1', client);
    assert.ok(!('referredByCode' in (client.calls[0].body as Record<string, unknown>)));
  });
});

// ── Idempotency ──────────────────────────────────────────────────────────────

describe('registration request idempotency', () => {
  it('20 — the provided key is sent verbatim as Idempotency-Key and reused across retries', async () => {
    const client = stubClient(() => CREATED_201());
    await submitRegistrationRequest(VALID_INPUT(), 'stable-key', client);
    await submitRegistrationRequest(VALID_INPUT(), 'stable-key', client);
    for (const call of client.calls) {
      const headers = (call.options as { headers?: Record<string, string> } | undefined)?.headers;
      assert.equal(headers?.['Idempotency-Key'], 'stable-key');
    }
  });

  it('header builder emits the canonical Idempotency-Key header', () => {
    assert.deepEqual(buildRegistrationIdempotencyHeaders('abc'), { 'Idempotency-Key': 'abc' });
  });

  it('generated keys are unique UUID-shaped values', () => {
    const a = generateIdempotencyKey();
    const b = generateIdempotencyKey();
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    assert.notEqual(a, b);
  });

  it('status lookup and cancel carry no idempotency replay risk (GET has none; cancel accepts one)', async () => {
    const client = stubClient((call) =>
      call.method === 'GET'
        ? { requestNumber: 'CREG-2026-000001', status: 'pending', submittedAt: null }
        : { requestNumber: 'CREG-2026-000001', status: 'cancelled', submittedAt: null }
    );
    await getRegistrationRequestStatus('CREG-2026-000001', 'ada.banda@example.com', client);
    const getHeaders = (client.calls[0].options as { headers?: unknown } | undefined)?.headers;
    assert.equal(getHeaders, undefined);
    await cancelRegistrationRequest('CREG-2026-000001', 'ada.banda@example.com', 'cancel-key', client);
    const cancelHeaders = (client.calls[1].options as { headers?: Record<string, string> } | undefined)?.headers;
    assert.equal(cancelHeaders?.['Idempotency-Key'], 'cancel-key');
  });
});

// ── Error mapping ────────────────────────────────────────────────────────────

describe('registration request error mapping', () => {
  it('17 — 409 duplicate pending surfaces the existing request number', async () => {
    const client = stubClient(() => {
      throw new ApiError(
        'A pending registration request already exists for this email (CREG-2026-000001)',
        { status: 409, code: 'BAD_REQUEST' }
      );
    });
    const error = await submitRegistrationRequest(VALID_INPUT(), 'k', client).then(
      () => assert.fail('expected rejection'),
      (err: unknown) => err
    );
    assert.ok(error instanceof RegistrationRequestError);
    assert.equal(error.kind, 'duplicate-pending');
    assert.equal(error.existingRequestNumber, 'CREG-2026-000001');
  });

  it('409 without a pending marker means the customer already exists', async () => {
    const client = stubClient(() => {
      throw new ApiError('An account with these details already exists', { status: 409, code: 'BAD_REQUEST' });
    });
    const error = await submitRegistrationRequest(VALID_INPUT(), 'k', client).then(
      () => assert.fail('expected rejection'),
      (err: unknown) => err
    );
    assert.ok(error instanceof RegistrationRequestError);
    assert.equal(error.kind, 'duplicate-customer');
  });

  it('18 — 400 invalid referral maps explicitly', async () => {
    const client = stubClient(() => {
      throw new ApiError('Invalid referral code', { status: 400, code: 'BAD_REQUEST', details: 'INVALID_REFERRAL_CODE' });
    });
    const error = await submitRegistrationRequest(VALID_INPUT(), 'k', client).then(
      () => assert.fail('expected rejection'),
      (err: unknown) => err
    );
    assert.ok(error instanceof RegistrationRequestError);
    assert.equal(error.kind, 'invalid-referral');
  });

  it('other 400s map to validation errors', async () => {
    const client = stubClient(() => {
      throw new ApiError('A valid email is required', { status: 400, code: 'BAD_REQUEST' });
    });
    const error = await submitRegistrationRequest(VALID_INPUT(), 'k', client).then(
      () => assert.fail('expected rejection'),
      (err: unknown) => err
    );
    assert.ok(error instanceof RegistrationRequestError);
    assert.equal(error.kind, 'validation');
  });

  it('19 — 429 maps to a friendly rate-limit error', async () => {
    const client = stubClient(() => {
      throw new ApiError('Too many requests', { status: 429, code: 'UNAVAILABLE' });
    });
    const error = await submitRegistrationRequest(VALID_INPUT(), 'k', client).then(
      () => assert.fail('expected rejection'),
      (err: unknown) => err
    );
    assert.ok(error instanceof RegistrationRequestError);
    assert.equal(error.kind, 'rate-limited');
  });

  it('network failure maps to a retry-safe error (idempotency key preserved by caller)', async () => {
    const client = stubClient(() => {
      throw new ApiError('Unable to reach the ERP Portal service.', { code: 'NETWORK_ERROR' });
    });
    const error = await submitRegistrationRequest(VALID_INPUT(), 'k', client).then(
      () => assert.fail('expected rejection'),
      (err: unknown) => err
    );
    assert.ok(error instanceof RegistrationRequestError);
    assert.equal(error.kind, 'network');
    assert.match(error.message, /retrying is safe/i);
  });

  it('extractRequestNumber finds the CREG number embedded in backend text', () => {
    assert.equal(extractRequestNumber('exists (creg-2026-000042)'), 'CREG-2026-000042');
    assert.equal(extractRequestNumber('nothing here'), null);
    assert.equal(extractRequestNumber(null), null);
  });

  it('toRegistrationRequestError passes its own errors through untouched', () => {
    const original = new RegistrationRequestError('x', { kind: 'conflict', status: 409 });
    assert.equal(toRegistrationRequestError(original), original);
  });
});

// ── Status + cancel endpoints ────────────────────────────────────────────────

describe('registration request status and cancel', () => {
  it('status lookup calls GET .../:requestNumber?email=... anonymously', async () => {
    const client = stubClient(() => ({ requestNumber: 'CREG-2026-000001', status: 'approved', submittedAt: '2026-09-13T00:00:00.000Z' }));
    const result = await getRegistrationRequestStatus('CREG-2026-000001', 'Ada.Banda@Example.com', client);
    assert.equal(result.status, 'approved');
    assert.equal(client.calls[0].method, 'GET');
    assert.ok(client.calls[0].path.startsWith('/portal/registration-requests/CREG-2026-000001?email='));
    assert.ok(client.calls[0].path.includes('email=ada.banda%40example.com'));
    assert.equal((client.calls[0].options as { skipAuth?: boolean } | undefined)?.skipAuth, true);
  });

  it('cancel posts the applicant email to .../:requestNumber/cancel', async () => {
    const client = stubClient(() => ({ requestNumber: 'CREG-2026-000001', status: 'cancelled', submittedAt: null }));
    const result = await cancelRegistrationRequest('CREG-2026-000001', 'ada.banda@example.com', undefined, client);
    assert.equal(result.status, 'cancelled');
    assert.equal(client.calls[0].method, 'POST');
    assert.equal(client.calls[0].path, '/portal/registration-requests/CREG-2026-000001/cancel');
    assert.deepEqual(client.calls[0].body, { email: 'ada.banda@example.com' });
  });

  it('cancel of a reviewed request maps 409 to conflict', async () => {
    const client = stubClient(() => {
      throw new ApiError('Invalid registration request transition: approved → cancelled', {
        status: 409,
        code: 'BAD_REQUEST',
      });
    });
    const error = await cancelRegistrationRequest('CREG-2026-000001', 'a@b.c', undefined, client).then(
      () => assert.fail('expected rejection'),
      (err: unknown) => err
    );
    assert.ok(error instanceof RegistrationRequestError);
    assert.equal(error.kind, 'conflict');
  });
});

// ── Referral parsing ─────────────────────────────────────────────────────────

describe('registration referral parsing', () => {
  it('13 — hash-router form #/register?ref=abc is captured and uppercased', () => {
    assert.equal(parseReferralCodeFromLocations('', '#/register?ref=fnmj74hz'), 'FNMJ74HZ');
  });

  it('13 — shared-link path form (/register?ref=abc → search) is captured', () => {
    assert.equal(parseReferralCodeFromLocations('?ref=FNMJ74HZ', ''), 'FNMJ74HZ');
    assert.equal(parseReferralCodeFromLocations('?ref=FNMJ74HZ&plan=basic', '#/dashboard'), 'FNMJ74HZ');
  });

  it('hash query wins when both locations carry a code', () => {
    assert.equal(parseReferralCodeFromLocations('?ref=OLDCODE', '#/register?ref=NEWCODE'), 'NEWCODE');
  });

  it('blank / missing codes yield null (no crash)', () => {
    assert.equal(parseReferralCodeFromLocations('?ref=', '#/register'), null);
    assert.equal(parseReferralCodeFromLocations('?other=ABC', '#/register'), null);
    assert.equal(parseReferralCodeFromLocations('', ''), null);
    assert.equal(parseReferralCodeFromLocations('?ref=%20%20', '#/register'), null);
  });

  it('codes are trimmed', () => {
    assert.equal(parseReferralCodeFromLocations('?ref=%20FNMJ74HZ%20', ''), 'FNMJ74HZ');
  });

  it('pending-referral storage key is unchanged (existing links/session reuse)', () => {
    assert.equal(PENDING_REFERRAL_STORAGE_KEY, 'portal_pending_ref');
  });
});

// ── Pending-state persistence ────────────────────────────────────────────────

describe('pending registration persistence', () => {
  it('persists only the safe minimum and round-trips', () => {
    const storage = mapStorage();
    writePendingRegistration(
      { requestNumber: 'CREG-2026-000001', email: 'a@b.c', status: 'pending', submittedAt: '2026-09-13T00:00:00.000Z' },
      storage
    );
    const raw = storage.getItem('portal_registration_pending') ?? '';
    assert.ok(!raw.includes('password'), 'pending state must never contain passwords');
    assert.ok(!raw.includes('token'), 'pending state must never contain tokens');
    assert.deepEqual(readPendingRegistration(storage), {
      requestNumber: 'CREG-2026-000001',
      email: 'a@b.c',
      status: 'pending',
      submittedAt: '2026-09-13T00:00:00.000Z',
    });
  });

  it('invalid persisted state reads as null', () => {
    const storage = mapStorage();
    storage.setItem('portal_registration_pending', 'not-json{{{');
    assert.equal(readPendingRegistration(storage), null);
    storage.setItem('portal_registration_pending', JSON.stringify({ email: 'a@b.c' }));
    assert.equal(readPendingRegistration(storage), null);
  });
});

// ── Routing ──────────────────────────────────────────────────────────────────

describe('registration routing guards', () => {
  it('21 — /register/pending is a public route (no authentication required)', () => {
    assert.equal(ROUTES.registerPending, '/register/pending');
    assert.equal(isPublicRoute('/register/pending'), true);
    assert.equal(isPublicRoute('/register'), true);
  });

  it('22 — the authenticated dashboard remains protected', () => {
    assert.equal(isPublicRoute('/dashboard'), false);
    assert.equal(isPublicRoute('/account'), false);
  });

  it('23 — the pending route is not a tab and cannot bypass the guard into the shell', () => {
    assert.equal(tabFromPath('/register/pending'), null);
  });

  it('pending route is wired into the unauthenticated renderer', () => {
    const shell = readSource('features/customer-portal/CustomerPortalApp.tsx');
    assert.ok(shell.includes('CustomerRegistrationPending'), 'shell must render the pending screen');
    assert.ok(shell.includes('ROUTES.registerPending'), 'shell must route the pending path');
    assert.ok(shell.includes('/register'), 'shell must handle the legacy path-form entry');
  });
});

// ── No registration bypass (static) ──────────────────────────────────────────

describe('no active-account registration bypass', () => {
  const registerSource = readSource('features/customer-portal/components/auth/CustomerRegister.tsx');
  const pendingSource = readSource('features/customer-portal/components/auth/CustomerRegistrationPending.tsx');
  const contextSource = readSource('features/customer-portal/components/auth/CustomerAuthContext.tsx');

  it('28 — Create Account never calls the legacy active-account endpoint', () => {
    assert.ok(!registerSource.includes('/portal/auth/register'));
    assert.ok(!registerSource.includes('registerWithApi'));
    assert.ok(!registerSource.includes('authService.register'));
  });

  it('5/6/7 — successful submission establishes no session and never reaches the dashboard', () => {
    assert.ok(!registerSource.includes('establishSession'));
    assert.ok(!registerSource.includes('writeEnvelope'));
    assert.ok(!registerSource.includes('access_token'));
    assert.ok(!registerSource.includes('refresh_token'));
    assert.ok(!registerSource.includes('ROUTES.dashboard'));
    assert.ok(registerSource.includes('ROUTES.registerPending'));
  });

  it('10/11/12 — no JWT, refresh token, or portal user is stored or assumed', () => {
    for (const source of [registerSource, pendingSource]) {
      assert.ok(!source.includes('tokenStore'));
      assert.ok(!source.includes('access_token'));
      assert.ok(!source.includes('refresh_token'));
    }
    assert.ok(!pendingSource.includes('useCustomerAuth'), 'pending screen must stay anonymous');
  });

  it('password fields are gone from the public form', () => {
    // No password INPUT, payload key, autocomplete hook, or storage may
    // remain. Explanatory UX copy ("No password is needed yet") is
    // intentional and asserted separately below.
    for (const pattern of [
      'confirmPassword',
      'form.password',
      'type="password"',
      'new-password',
      "'password'",
      '"password"',
      'password:',
    ]) {
      assert.ok(!registerSource.includes(pattern), `must not contain ${pattern}`);
    }
    assert.ok(
      registerSource.includes('No password is needed yet'),
      'form must explain that no password is collected before approval'
    );
  });

  it('15/16 — referral is cleared only after backend acceptance, never on failure', () => {
    assert.ok(registerSource.includes('clearPendingReferralCode'), 'clears the referral on success');
    const failurePath = registerSource.slice(registerSource.indexOf('catch (err'));
    assert.ok(!failurePath.includes('clearPendingReferralCode'), 'failure path must retain the referral');
    assert.ok(!registerSource.includes('persistReferralCode(null)'), 'no unmount/abandon wipe may remain');
  });

  it('context no longer exposes a session-establishing registration call', () => {
    assert.ok(!contextSource.includes('registerWithApi'));
    assert.ok(!contextSource.includes('authService.register'));
  });

  it('pending copy promises review — never instant access', () => {
    assert.ok(pendingSource.includes('pending review'));
    assert.ok(!pendingSource.includes('ROUTES.dashboard'));
    assert.ok(!registerSource.includes('account created successfully'));
    assert.ok(!registerSource.includes('login immediately'));
  });
});

// ── Authentication regression (static contract) ──────────────────────────────

describe('existing authentication contract intact', () => {
  const contextSource = readSource('features/customer-portal/components/auth/CustomerAuthContext.tsx');
  const serviceSource = readSource('features/customer-portal/services/authService.ts');

  it('24/25/26/27 — login, logout, refresh, and activation remain wired', () => {
    for (const member of ['loginWithApi', 'activateAccount', 'requestPasswordReset', 'logout']) {
      assert.ok(contextSource.includes(member), `context must keep ${member}`);
    }
    for (const endpoint of [
      '/portal/auth/login-password',
      '/portal/auth/refresh',
      '/portal/auth/logout',
      '/portal/auth/activate',
    ]) {
      assert.ok(serviceSource.includes(endpoint), `auth service must keep ${endpoint}`);
    }
  });
});
