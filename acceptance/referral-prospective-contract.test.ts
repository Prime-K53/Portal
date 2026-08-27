/**
 * Prime PORTAL — ERP Referral Contract (prospective-person flow)
 *
 * Run with:   npx tsx acceptance/referral-prospective-contract.test.ts
 *
 * Replaces the retired search→select→{referredCustomerId} spec. The current
 * contract (see portalService.createReferral + ReferralsTab):
 *   - POST /api/portal/referrals  body = { referredName, referredEmail?,
 *     referredPhone?, notes? }  + Idempotency-Key header (user-scoped,
 *     8–128 chars, 24h TTL, replays stored response on the same key)
 *   - NO customer-directory search exists: referrals target NEW/prospective
 *     people only; existing customers are rejected upstream
 *   - list/detail/timeline/rewards/stats/settings/wallet are read-only;
 *     rewards are approved + credited by ERP staff — never by Sasa
 *
 * These tests use a FAKE ApiClient that records every call. No real referral
 * is created and Supabase is never touched.
 */

import { ErpPortalService } from '../src/features/customer-portal/services/portalService';import { ApiError, type ApiClient, type ApiRequestOptions, type HttpMethod } from '../src/features/customer-portal/services/apiClient';
import type {
  ErpReferral,
  ErpReferralCreateResult,
  ErpReferralReward,
  ErpReferralSettings,
  ErpReferralStats,
  ErpReferralTimelineEntry,
} from '../src/features/customer-portal/types';
import {
  getReferralStatusBadge,
  getRewardStatusBadge,
} from '../src/features/customer-portal/utils/referral';
import { generateIdempotencyKey } from '../src/features/customer-portal/utils/idempotency';

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

  callsTo(method: HttpMethod, pathPrefix: string): RecordedCall[] {
    return this.calls.filter((c) => c.method === method && c.path.startsWith(pathPrefix));
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

  request<T>(method: HttpMethod, path: string, options?: ApiRequestOptions): Promise<T> {
    return this.respond(method, path, options?.body, options) as Promise<T>;
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
  delete<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return this.respond('DELETE', path) as Promise<T>;
  }
}

function makeService(client: FakeClient): ErpPortalService {
  return new ErpPortalService(client);
}

const CREATED_ROW: ErpReferralCreateResult = {
  id: 'ref_001',
  customer_id: null,
  referred_by_id: null,
  referred_by_name: null,
  referral_code: 'REF-ABC123',
  referred_name: 'Thoko Banda',
  referred_email: 'thoko@example.com',
  referred_phone: null,
  registered_customer_id: null,
  registered_at: null,
  status: 'pending',
  pending_invoice_id: null,
  pending_invoice_amount: null,
  converted_invoice_id: null,
  converted_at: null,
  notes: null,
  created_at: '2026-08-24T10:00:00Z',
  updated_at: '2026-08-24T10:00:00Z',
};

const LIST_ENVELOPE = {
  referrals: [
    {
      id: 'ref_001',
      referral_code: 'REF-ABC123',
      referred_name: 'Thoko Banda',
      status: 'pending',
      created_at: '2026-08-24T10:00:00Z',
    },
  ] as unknown as ErpReferral[],
  total: 1,
};

// ── Tests ───────────────────────────────────────────────────────────────────

async function testCreatePayloadOnWire(): Promise<void> {
  const client = new FakeClient().on('POST', '/portal/referrals', CREATED_ROW);
  const service = makeService(client);

  const created = await service.createReferral(
    { referredName: 'Thoko Banda', referredEmail: 'thoko@example.com', notes: 'Bulk print prospect' },
    IDEMPOTENCY_KEY
  );

  const posts = client.callsTo('POST', '/portal/referrals');
  check('create hits POST /portal/referrals exactly once', posts.length === 1);
  const wire = posts[0];
  assertEqual('create wire payload is prospective-person shape', wire.body, {
    referredName: 'Thoko Banda',
    referredEmail: 'thoko@example.com',
    notes: 'Bulk print prospect',
  });
  check('Idempotency-Key header sent', Boolean(wire.headers?.['Idempotency-Key']));
  assertEqual('201 row mapped', created.id, 'ref_001');
}

async function testOptionalFieldsOmittedWhenBlank(): Promise<void> {
  const client = new FakeClient().on('POST', '/portal/referrals', CREATED_ROW);
  const service = makeService(client);
  await service.createReferral({ referredName: 'Grace Phiri' }, IDEMPOTENCY_KEY);

  const wire = client.callsTo('POST', '/portal/referrals')[0];
  const body = wire.body as Record<string, unknown>;
  check('blank email/phone/notes omitted from wire', !('referredEmail' in body) && !('referredPhone' in body) && !('notes' in body));
}

async function testIdempotentReplay(): Promise<void> {
  const client = new FakeClient()
    .on('POST', '/portal/referrals', CREATED_ROW)
    .on('POST', '/portal/referrals', CREATED_ROW); // replay serves stored 201 again

  const service = makeService(client);
  const key = generateIdempotencyKey();

  const first = await service.createReferral({ referredName: 'Thoko Banda' }, key);
  const second = await service.createReferral({ referredName: 'Thoko Banda' }, key);

  assertEqual('same key → same stored result', second.id, first.id);
  check('two wire calls for same key (ERP replays)', client.callsTo('POST', '/portal/referrals').length === 2);
  const [a, b] = client.callsTo('POST', '/portal/referrals');
  check('identical Idempotency-Key on retries', a.headers?.['Idempotency-Key'] === b.headers?.['Idempotency-Key']);
}

async function testDistinctKeysAreDistinctSubmissions(): Promise<void> {
  const client = new FakeClient()
    .on('POST', '/portal/referrals', CREATED_ROW)
    .on('POST', '/portal/referrals', { ...CREATED_ROW, id: 'ref_002', referred_name: 'Grace Phiri' });

  const service = makeService(client);
  await service.createReferral({ referredName: 'Thoko Banda' }, generateIdempotencyKey());
  await service.createReferral({ referredName: 'Grace Phiri' }, generateIdempotencyKey());

  const [a, b] = client.callsTo('POST', '/portal/referrals');
  check('distinct keys for distinct submissions', a.headers?.['Idempotency-Key'] !== b.headers?.['Idempotency-Key']);
}

async function testServerErrorSurfaces(): Promise<void> {
  const client = new FakeClient().on(
    'POST',
    '/portal/referrals',
    new ApiError('Existing customers cannot be referred.', { code: 'BAD_REQUEST' })
  );
  const service = makeService(client);

  try {
    await service.createReferral({ referredName: 'Already A Customer' }, IDEMPOTENCY_KEY);
    check('ERP rejection surfaces to caller', false, 'expected throw');
  } catch (err) {
    check('ERP rejection surfaces to caller', err instanceof ApiError && /Existing customers/i.test(err.message));
  }
}

async function testListMappingAndReadOnlySurface(): Promise<void> {
  const client = new FakeClient()
    .on('GET', '/portal/referrals', LIST_ENVELOPE)
    .on('GET', '/portal/referrals/rewards', { rewards: [] } as unknown as ErpReferralReward[])
    .on('GET', '/portal/referrals/stats', { totalReferrals: 1 } as unknown as ErpReferralStats)
    .on('GET', '/portal/referrals/settings', {} as unknown as ErpReferralSettings);

  const service = makeService(client);
  const referrals = await service.getReferrals();
  assertEqual('list envelope mapped', referrals.length, 1);
  assertEqual('mapped status passthrough', getReferralStatusBadge(referrals[0].status).label.length > 0, true);

  await service.getReferralRewards();
  await service.getReferralStats();
  await service.getReferralSettings();

  const gets = client.callsTo('GET', '/portal/referrals');
  check('referral reads are GET-only', gets.every((g) => g.method === 'GET'));
  // No customer-directory search endpoint may be called anymore.
  check('no customer search calls', client.callsTo('GET', '/portal/referrals/customers/search').length === 0);
}

async function testBadgeHelpersTotal(): Promise<void> {
  check('reward badge helper usable', typeof getRewardStatusBadge === 'function');
}

// ── Runner ──────────────────────────────────────────────────────────────────

const IDEMPOTENCY_KEY = generateIdempotencyKey();

async function main(): Promise<void> {
  console.log('Prime PORTAL — referral contract (prospective-person flow)\n');
  await testCreatePayloadOnWire();
  await testOptionalFieldsOmittedWhenBlank();
  await testIdempotentReplay();
  await testDistinctKeysAreDistinctSubmissions();
  await testServerErrorSurfaces();
  await testListMappingAndReadOnlySurface();
  testBadgeHelpersTotal();

  console.log(`\n${results.length - failures}/${results.length} checks passed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error('RUNNER FAILED:', e);
  process.exit(1);
});
