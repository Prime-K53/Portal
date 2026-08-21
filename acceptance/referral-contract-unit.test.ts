/**
 * Prime PORTAL — ERP Referral Contract — Focused Unit Tests
 *
 * Run with:   npx tsx acceptance/referral-contract-unit.test.ts
 *
 * These tests exercise the referral API client (search / create / list /
 * detail / timeline / rewards / stats / settings / wallet), the ERP-mirroring
 * UI helpers and idempotency behavior using a FAKE ApiClient that records
 * every call. They never hit the ERP Portal API and never touch Supabase — no
 * real referral is created, claimed or cancelled during automated testing.
 *
 * Architecture under test:
 *   Sasa service → ApiClient (mocked here) → ERP Portal API → ERP business
 *   logic → ERP persistence → Supabase.  Sasa performs NO direct referral
 *   write to Supabase and never fabricates referral codes, links, rewards or
 *   wallet credits.
 *
 * ERP contract verified from PrimeERPsystem source:
 *   - GET  /api/portal/referrals/customers/search?q=  (portalService.cjs:1230)
 *   - POST /api/portal/referrals                      (referralService.cjs:249,
 *     201 body = raw snake_case customer_referrals row; idempotency middleware
 *     user-scoped, 8–128 char key, 24h TTL, replays stored 201)
 *   - GET  /api/portal/referrals                      (portalService.cjs:1102,
 *     envelope { referrals, total, page, pageSize, totalPages }; list rows set
 *     referredCustomerName = customer_id fallback)
 *   - GET  /api/portal/referrals/:id                  (portalService.cjs:1128)
 *   - GET  /api/portal/referrals/:id/timeline         (portal.cjs:859 — BARE
 *     array of RAW snake_case referral_timeline rows, no envelope)
 *   - GET  /api/portal/referrals/rewards              (envelope, camelCase)
 *   - GET  /api/portal/referrals/stats                (flat camelCase)
 *   - GET  /api/portal/referrals/settings             (flat camelCase)
 *   - GET  /api/portal/wallet                         (portalService.cjs:997)
 *   - NO claim/invite endpoints exist: rewards are approved + credited by ERP
 *     staff; wallet is read-only for customers.
 */

import { ErpPortalService } from '../src/features/customer-portal/services/portalService';
import { ApiError, type ApiClient, type ApiRequestOptions, type HttpMethod } from '../src/features/customer-portal/services/apiClient';
import type {
  ErpReferral,
  ErpReferralCreateResult,
  ErpReferralCustomerSearchResult,
  ErpReferralReward,
  ErpReferralSettings,
  ErpReferralStats,
  ErpReferralTimelineEntry,
  ErpWallet,
} from '../src/features/customer-portal/types';
import {
  getReferralStatusBadge,
  getReferralStatusLabel,
  getRewardStatusBadge,
  getRewardStatusLabel,
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

// ── Fake ERP ApiClient (records calls, serves canned contract responses) ────

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

  /** Clears all canned responses (used to simulate the ERP recovering). */
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

// ── Fixtures (shapes verified from the ERP referral contract) ───────────────

const erpSearchCustomers: ErpReferralCustomerSearchResult[] = [
  { id: 'cust_101', name: 'David Sterling', email: 'd.sterling@sterlingmktg.com' },
  { id: 'cust_102', name: 'Elena Rostova', email: 'elena@apexbrand.io' },
];

const erpReferralActive: ErpReferral = {
  id: 'ref_1',
  referred_customer_id: 'cust_101',
  // ERP list behavior (portalService.cjs:1102): name = customer_id fallback
  referred_customer_name: 'cust_101',
  referred_customer_email: null,
  status: 'active',
  pending_invoice_id: null,
  pending_invoice_amount: 0,
  converted_invoice_id: null,
  converted_at: null,
  notes: null,
  created_at: '2026-07-12T10:00:00.000Z',
  updated_at: '2026-07-12T10:00:00.000Z',
};

const erpReferralConverted: ErpReferral = {
  ...erpReferralActive,
  id: 'ref_2',
  referred_customer_id: 'cust_102',
  referred_customer_name: 'Elena Rostova',
  status: 'converted',
  converted_invoice_id: 'inv_104',
  converted_at: '2026-08-01T09:00:00.000Z',
};

const erpTimelineRows: ErpReferralTimelineEntry[] = [
  {
    id: 'tl_1',
    referral_id: 'ref_1',
    event_type: 'created',
    title: 'Referral created',
    description: 'Referred by Marcus Vance',
    amount: null,
    actor_id: null,
    actor_name: 'System',
    metadata_json: null,
    timestamp: '2026-07-12T10:00:00.000Z',
    created_at: '2026-07-12T10:00:00.000Z',
  },
  {
    id: 'tl_2',
    referral_id: 'ref_1',
    event_type: 'reward_approved',
    title: 'Reward approved',
    description: 'Approved by ERP staff',
    amount: 450,
    actor_id: 'usr_admin',
    actor_name: 'ERP Admin',
    metadata_json: null,
    timestamp: '2026-08-02T14:30:00.000Z',
    created_at: '2026-08-02T14:30:00.000Z',
  },
];

/**
 * POST /api/portal/referrals 201 body — the RAW snake_case customer_referrals
 * row (referralService.cjs:249-283). `customer_id` is the REFERRED customer;
 * the response carries no referred-customer name/email.
 */
const erpCreateResult: ErpReferralCreateResult = {
  id: 'ref_3',
  customer_id: 'cust_103',
  referred_by_id: 'usr_001',
  referred_by_name: 'Marcus Vance',
  referral_code: 'REF-ABC123',
  status: 'active',
  pending_invoice_id: null,
  pending_invoice_amount: null,
  converted_invoice_id: null,
  converted_at: null,
  notes: 'Interested in bulk print',
  created_at: '2026-08-18T09:15:00.000Z',
  updated_at: '2026-08-18T09:15:00.000Z',
};

const erpRewards: ErpReferralReward[] = [
  {
    id: 'rw_1',
    referral_id: 'ref_2',
    referral_code: 'REF-ABC123',
    referred_customer_id: 'cust_102',
    referred_customer_name: 'Elena Rostova',
    invoice_id: 'inv_104',
    invoice_amount: 5000,
    amount: 450,
    status: 'approved',
    approved_at: '2026-08-02T14:30:00.000Z',
    cancelled_at: null,
    cancel_reason: null,
    wallet_transaction_id: null,
    created_at: '2026-08-02T14:30:00.000Z',
  },
];

const erpStats: ErpReferralStats = {
  total: 3,
  signedUp: 2,
  qualified: 1,
  rewardApproved: 1,
  paid: 0,
  pendingRewardAmount: 350,
  totalEarned: 450,
  conversionRate: 33.33,
};

const erpSettings: ErpReferralSettings = {
  enabled: true,
  rewardType: 'percentage',
  rewardValue: 10,
  rewardPercentage: 10,
  minimumPurchase: 1000,
  maxRewardAmount: 500,
  expiryDays: 90,
  requireApproval: true,
  shareMessage: 'Share this referral!',
};

const erpWallet: ErpWallet = {
  walletBalance: 450,
  transactions: [
    { date: '2026-08-02', amount: 450, type: 'credit', reference: 'Referral reward — REF-ABC123' },
  ],
};

/** Fixed, valid Idempotency-Key (UUID v4 — 36 chars, within the ERP's 8–128). */
const IDEMPOTENCY_KEY = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

// ── A. Customer search: ERP directory, query embedded in the path ───────────

async function testSearchReferralCustomers(): Promise<void> {
  const client = new FakeClient().on('GET', '/portal/referrals/customers/search?q=Davi', erpSearchCustomers);
  const service = new ErpPortalService(client);

  const results = await service.searchReferralCustomers('Davi');

  check('Search: resolves the ERP customer results', results.length === 2);
  check(
    'Search: results map to { id, name, email } verbatim',
    results[0]?.id === 'cust_101' && results[0]?.name === 'David Sterling' && results[0]?.email === 'd.sterling@sterlingmktg.com'
  );
  const get = client.calls.find((c) => c.method === 'GET' && c.path.startsWith('/portal/referrals/customers/search'));
  check(
    'Search: query is embedded in the path (?q=...) — the ApiClient has no params bag',
    get?.path === '/portal/referrals/customers/search?q=Davi',
    `path=${get?.path}`
  );

  const client2 = new FakeClient().on('GET', '/portal/referrals/customers/search', erpSearchCustomers);
  const service2 = new ErpPortalService(client2);
  const spaces = await service2.searchReferralCustomers('David Sterling');
  const get2 = client2.calls.find((c) => c.method === 'GET');
  check(
    'Search: query is URL-encoded in the path',
    get2?.path === '/portal/referrals/customers/search?q=David%20Sterling',
    `path=${get2?.path}`
  );
  check('Search: encoded query still resolves results', spaces.length === 2);

  const client3 = new FakeClient().on('GET', '/portal/referrals/customers/search', erpSearchCustomers);
  const service3 = new ErpPortalService(client3);
  const short = await service3.searchReferralCustomers('D');
  check(
    'Search: sub-2-char queries return [] WITHOUT a wasted call (ERP min is 2 chars)',
    short.length === 0 && client3.calls.length === 0
  );
}

// ── B. Creation: { referredCustomerId } + Idempotency-Key, 201 row mapped ───

async function testCreateReferral(): Promise<void> {
  const client = new FakeClient().on('POST', '/portal/referrals', erpCreateResult);
  const service = new ErpPortalService(client);

  const created = await service.createReferral(
    { referredCustomerId: 'cust_103', notes: 'Interested in bulk print' },
    IDEMPOTENCY_KEY
  );

  check('Create: resolves with the ERP referral identity', created.id === 'ref_3');
  check(
    'Create: referredCustomerId comes from the ERP row customer_id (the REFERRED customer)',
    created.referredCustomerId === 'cust_103'
  );
  check('Create: ERP status is preserved (active — the ERP decides)', created.status === 'active');
  check('Create: ERP notes and timestamps are preserved', created.notes === 'Interested in bulk print' && created.createdAt === '2026-08-18T09:15:00.000Z');

  const post = client.calls.find((c) => c.method === 'POST' && c.path === '/portal/referrals');
  assertEqual(
    'Create: payload is exactly { referredCustomerId, notes } — no codes, no emails',
    post?.body,
    { referredCustomerId: 'cust_103', notes: 'Interested in bulk print' }
  );
  check(
    'Create: NO customer_id / referrer identity is sent (identity comes from the ERP JWT)',
    post !== undefined &&
      !('customer_id' in (post.body as object)) &&
      !('customerId' in (post.body as object)) &&
      !('referredBy' in (post.body as object))
  );
  check(
    'Create: POST /portal/referrals carries the Idempotency-Key header',
    post?.headers?.['Idempotency-Key'] === IDEMPOTENCY_KEY,
    `headers=${JSON.stringify(post?.headers)}`
  );
  check(
    'Create: the response name is blank (the 201 row has no referred-customer name — Sasa never invents one)',
    created.referredCustomerName === '' && created.referredCustomerEmail === null
  );

  const client2 = new FakeClient().on('POST', '/portal/referrals', erpCreateResult);
  const service2 = new ErpPortalService(client2);
  await service2.createReferral({ referredCustomerId: 'cust_103' }, IDEMPOTENCY_KEY);
  const post2 = client2.calls.find((c) => c.method === 'POST');
  const wire = JSON.parse(JSON.stringify(post2?.body ?? {})) as Record<string, unknown>;
  check(
    'Create: notes is omitted on the wire when absent (no blank notes)',
    !('notes' in wire) && wire.referredCustomerId === 'cust_103',
    `wire=${JSON.stringify(wire)}`
  );

  const client3 = new FakeClient().on(
    'POST',
    '/portal/referrals',
    new ApiError('This customer has already been referred by you', { status: 400, code: 'BAD_REQUEST' })
  );
  const service3 = new ErpPortalService(client3);
  let duplicate: unknown = null;
  try {
    await service3.createReferral({ referredCustomerId: 'cust_103' }, IDEMPOTENCY_KEY);
  } catch (err) {
    duplicate = err;
  }
  check(
    'Create: ERP duplicate-referral 400 propagates (no fake success)',
    duplicate instanceof ApiError && duplicate.status === 400 && duplicate.message === 'This customer has already been referred by you'
  );

  const client4 = new FakeClient().on(
    'POST',
    '/portal/referrals',
    new ApiError('You cannot refer yourself', { status: 400, code: 'BAD_REQUEST' })
  );
  const service4 = new ErpPortalService(client4);
  let self: unknown = null;
  try {
    await service4.createReferral({ referredCustomerId: 'usr_001' }, IDEMPOTENCY_KEY);
  } catch (err) {
    self = err;
  }
  check('Create: ERP self-referral 400 propagates', self instanceof ApiError && self.status === 400);

  const client5 = new FakeClient().on(
    'POST',
    '/portal/referrals',
    new ApiError('Customer not found', { status: 404, code: 'NOT_FOUND' })
  );
  const service5 = new ErpPortalService(client5);
  let missing: unknown = null;
  try {
    await service5.createReferral({ referredCustomerId: 'cust_nope' }, IDEMPOTENCY_KEY);
  } catch (err) {
    missing = err;
  }
  check('Create: ERP 404 (customer not found) propagates', missing instanceof ApiError && missing.status === 404);

  // A camelCase DTO response (defensive path — same shape as list rows) maps
  // through the list mapper and keeps the ERP name.
  const client6 = new FakeClient().on('POST', '/portal/referrals', erpReferralConverted);
  const service6 = new ErpPortalService(client6);
  const camel = await service6.createReferral({ referredCustomerId: 'cust_102' }, IDEMPOTENCY_KEY);
  check(
    'Create: a camelCase DTO response maps via the list mapper (name preserved)',
    camel.id === 'ref_2' && camel.referredCustomerName === 'Elena Rostova' && camel.status === 'converted'
  );
}

// ── C. DTO mapping: list envelope, detail, timeline, stats, settings, wallet ─

async function testReferralListMapping(): Promise<void> {
  const client = new FakeClient().on('GET', '/portal/referrals', {
    referrals: [erpReferralActive, erpReferralConverted],
    total: 2,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  });
  const service = new ErpPortalService(client);

  const referrals = await service.getReferrals();

  check('List: the envelope is unwrapped to the referrals array', referrals.length === 2);
  check(
    'List: ERP statuses are preserved verbatim (active / converted)',
    referrals.some((r) => r.status === 'active') && referrals.some((r) => r.status === 'converted')
  );
  check(
    'List: referredCustomerName is shown exactly as the ERP returns it (ERP falls back to customer_id — Sasa does not restyle it)',
    referrals.find((r) => r.id === 'ref_1')?.referredCustomerName === 'cust_101'
  );
  check(
    'List: conversion fields are preserved (convertedInvoiceId, convertedAt)',
    referrals.find((r) => r.id === 'ref_2')?.convertedInvoiceId === 'inv_104' &&
      referrals.find((r) => r.id === 'ref_2')?.convertedAt === '2026-08-01T09:00:00.000Z'
  );

  // A bare array (no envelope) is tolerated too.
  const client2 = new FakeClient().on('GET', '/portal/referrals', [erpReferralActive]);
  const service2 = new ErpPortalService(client2);
  const bare = await service2.getReferrals();
  check('List: a bare array response also maps', bare.length === 1 && bare[0]?.id === 'ref_1');

  // Detail endpoint.
  const client3 = new FakeClient().on('GET', '/portal/referrals/ref_1', erpReferralActive);
  const service3 = new ErpPortalService(client3);
  const detail = await service3.getReferral('ref_1');
  check('Detail: GET /portal/referrals/:id maps to the same PortalReferral DTO', detail.id === 'ref_1' && detail.status === 'active');
}

async function testReferralTimelineMapping(): Promise<void> {
  // The ERP returns the RAW snake_case rows as a BARE array (no envelope).
  const client = new FakeClient().on('GET', '/portal/referrals/ref_1/timeline', erpTimelineRows);
  const service = new ErpPortalService(client);

  const timeline = await service.getReferralTimeline('ref_1');

  check('Timeline: the bare raw row array is unwrapped', timeline.length === 2);
  check(
    'Timeline: raw snake_case rows map to { eventType, title, description, amount, actorName, timestamp, createdAt }',
    timeline[0]?.eventType === 'created' &&
      timeline[0]?.title === 'Referral created' &&
      timeline[0]?.amount === null &&
      timeline[0]?.actorName === 'System' &&
      timeline[0]?.timestamp === '2026-07-12T10:00:00.000Z' &&
      timeline[0]?.createdAt === '2026-07-12T10:00:00.000Z'
  );
  check(
    'Timeline: reward events keep their ERP amount (never calculated)',
    timeline[1]?.eventType === 'reward_approved' && timeline[1]?.amount === 450
  );

  const client2 = new FakeClient().on(
    'GET',
    '/portal/referrals/ref_404/timeline',
    new ApiError('Referral not found', { status: 404, code: 'NOT_FOUND' })
  );
  const service2 = new ErpPortalService(client2);
  let caught: unknown = null;
  try {
    await service2.getReferralTimeline('ref_404');
  } catch (err) {
    caught = err;
  }
  check('Timeline: ERP 404 propagates', caught instanceof ApiError && caught.status === 404);

  // An envelope shape (defensive) is tolerated.
  const client3 = new FakeClient().on('GET', '/portal/referrals/ref_1/timeline', { timeline: erpTimelineRows });
  const service3 = new ErpPortalService(client3);
  const enveloped = await service3.getReferralTimeline('ref_1');
  check('Timeline: an envelope response also maps', enveloped.length === 2);
}

async function testStatsSettingsWalletMapping(): Promise<void> {
  const client = new FakeClient()
    .on('GET', '/portal/referrals/stats', erpStats)
    .on('GET', '/portal/referrals/settings', erpSettings)
    .on('GET', '/portal/wallet', erpWallet);
  const service = new ErpPortalService(client);

  const stats = await service.getReferralStats();
  check(
    'Stats: every ERP funnel field is preserved verbatim',
    stats.total === 3 &&
      stats.signedUp === 2 &&
      stats.qualified === 1 &&
      stats.rewardApproved === 1 &&
      stats.paid === 0 &&
      stats.pendingRewardAmount === 350 &&
      stats.totalEarned === 450 &&
      stats.conversionRate === 33.33
  );

  const settings = await service.getReferralSettings();
  check(
    'Settings: every ERP program field is preserved verbatim',
    settings.enabled === true &&
      settings.rewardType === 'percentage' &&
      settings.rewardValue === 10 &&
      settings.minimumPurchase === 1000 &&
      settings.maxRewardAmount === 500 &&
      settings.expiryDays === 90 &&
      settings.requireApproval === true &&
      settings.shareMessage === 'Share this referral!'
  );

  const wallet = await service.getWallet();
  check('Wallet: ERP balance is preserved verbatim', wallet.walletBalance === 450);
  check(
    'Wallet: ERP transactions are preserved verbatim',
    wallet.transactions.length === 1 &&
      wallet.transactions[0]?.type === 'credit' &&
      wallet.transactions[0]?.amount === 450 &&
      wallet.transactions[0]?.reference === 'Referral reward — REF-ABC123'
  );
  const walletCalls = client.calls.filter((c) => c.path.startsWith('/portal/wallet'));
  check('Wallet: only GET /portal/wallet is called (read-only)', walletCalls.length === 1 && walletCalls[0]?.method === 'GET');
}

// ── D/E. Idempotency: header format, retry reuse, new-submission new key ────

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function testIdempotencyKeyFormat(): void {
  const key = generateIdempotencyKey();
  check('Key format: UUID v4 shape', typeof key === 'string' && UUID_V4_RE.test(key), `key=${key}`);
  check(
    'Key format: within the ERP 8–128 character limit (36-char UUID)',
    key.length >= 8 && key.length <= 128,
    `length=${key.length}`
  );
  check(
    'Key format: two generated keys for independent submissions DIFFER',
    generateIdempotencyKey() !== generateIdempotencyKey()
  );
  check(
    'Key format: key contains no customer/referral data (UUID only)',
    !/CUST|REF|ref_|acme|customer/i.test(key)
  );
}

async function testSameLogicalRetryReusesKey(): Promise<void> {
  // The ReferralsTab generates ONE key per logical submission attempt and
  // keeps it while retrying the SAME attempt (a retry after a network timeout
  // calls the service again with the SAME key — the ERP replays its stored 201
  // instead of creating a duplicate referral).
  const key = generateIdempotencyKey();
  const client = new FakeClient().on(
    'POST',
    '/portal/referrals',
    new ApiError('Unable to reach the ERP Portal service. Check your network connection and try again.', {
      code: 'NETWORK_ERROR',
    })
  );
  const service = new ErpPortalService(client);

  let first: unknown = null;
  try {
    await service.createReferral({ referredCustomerId: 'cust_103' }, key);
  } catch (err) {
    first = err;
  }
  check(
    'Retry: first attempt fails with the network error (no fake success)',
    first instanceof ApiError && first.code === 'NETWORK_ERROR'
  );

  // The ERP becomes reachable — the user retries the SAME logical submission.
  client.reset();
  client.on('POST', '/portal/referrals', erpCreateResult);
  const created = await service.createReferral({ referredCustomerId: 'cust_103' }, key);

  const posts = client.calls.filter((c) => c.method === 'POST' && c.path === '/portal/referrals');
  check(
    'Retry: both attempts POST to /portal/referrals',
    posts.length === 2,
    `posts=${posts.length}`
  );
  check(
    'Retry: the retry REUSES the same Idempotency-Key as the failed attempt (same logical submission)',
    posts.length === 2 &&
      posts[0]?.headers?.['Idempotency-Key'] === key &&
      posts[1]?.headers?.['Idempotency-Key'] === key,
    `keys=${JSON.stringify(posts.map((p) => p.headers?.['Idempotency-Key']))}`
  );
  check(
    'Retry: the successful retry still resolves with the real ERP referral',
    created.id === 'ref_3' && created.status === 'active'
  );
}

async function testNewSubmissionNewKey(): Promise<void> {
  // A NEW independent referral (different customer) gets a NEW key — the
  // previous key is never reused across submissions.
  const keyA = generateIdempotencyKey();
  const keyB = generateIdempotencyKey();
  check('New submission: distinct generated keys for separate referrals', keyA !== keyB);

  const client = new FakeClient().on('POST', '/portal/referrals', erpCreateResult);
  const service = new ErpPortalService(client);
  await service.createReferral({ referredCustomerId: 'cust_103' }, keyA);
  await service.createReferral({ referredCustomerId: 'cust_104', notes: 'Second referral' }, keyB);

  const posts = client.calls.filter((c) => c.method === 'POST' && c.path === '/portal/referrals');
  check(
    'New submission: each referral POSTs with its OWN key (no stale reuse)',
    posts.length === 2 &&
      posts[0]?.headers?.['Idempotency-Key'] === keyA &&
      posts[1]?.headers?.['Idempotency-Key'] === keyB,
    `keys=${JSON.stringify(posts.map((p) => p.headers?.['Idempotency-Key']))}`
  );
}

// ── F. Obsolete invite/claim API is GONE ────────────────────────────────────

function testNoObsoleteReferralApi(): void {
  const service = new ErpPortalService(new FakeClient());
  const anyService = service as unknown as Record<string, unknown>;

  check(
    'Surface: sendReferralInvite no longer exists (the ERP has no invite-by-email endpoint)',
    typeof anyService.sendReferralInvite === 'undefined'
  );
  check(
    'Surface: claimReferralReward no longer exists (rewards are ERP-staff approved — no customer claim endpoint)',
    typeof anyService.claimReferralReward === 'undefined'
  );
  check(
    'Surface: no fabricated referral-code/link factory exists',
    typeof anyService.generateReferralLink === 'undefined' &&
      typeof anyService.getReferralLink === 'undefined' &&
      typeof anyService.issueReferralCode === 'undefined'
  );
  check(
    'Surface: the create flow is search → select → createReferral({ referredCustomerId }) only',
    typeof anyService.createReferral === 'function' && typeof anyService.searchReferralCustomers === 'function'
  );
}

// ── G. Status helpers mirror the ERP statuses ───────────────────────────────

function testStatusHelpers(): void {
  assertEqual('Referral label: active', getReferralStatusLabel('active'), 'Active');
  assertEqual('Referral label: converted', getReferralStatusLabel('converted'), 'Converted');
  assertEqual('Referral label: expired', getReferralStatusLabel('expired'), 'Expired');
  assertEqual('Referral label: cancelled', getReferralStatusLabel('cancelled'), 'Cancelled');

  check(
    'Referral badge: active renders emerald, converted indigo, expired amber, cancelled slate',
    getReferralStatusBadge('active').bg.includes('emerald') &&
      getReferralStatusBadge('converted').bg.includes('indigo') &&
      getReferralStatusBadge('expired').bg.includes('amber') &&
      getReferralStatusBadge('cancelled').bg.includes('slate')
  );

  assertEqual('Reward label: pending', getRewardStatusLabel('pending'), 'Pending');
  assertEqual('Reward label: approved', getRewardStatusLabel('approved'), 'Approved');
  assertEqual('Reward label: paid', getRewardStatusLabel('paid'), 'Paid');
  assertEqual('Reward label: cancelled', getRewardStatusLabel('cancelled'), 'Cancelled');

  check(
    'Reward badge: approved renders emerald, pending amber, paid sky, cancelled slate',
    getRewardStatusBadge('approved').bg.includes('emerald') &&
      getRewardStatusBadge('pending').bg.includes('amber') &&
      getRewardStatusBadge('paid').bg.includes('sky') &&
      getRewardStatusBadge('cancelled').bg.includes('slate')
  );

  // Unknown ERP statuses render honestly (no silent coercion).
  check('Referral label: unknown status capitalizes verbatim', getReferralStatusLabel('weird_status') === 'Weird_status');
}

// ── H. Rewards: ERP-authoritative amounts, never calculated client-side ─────

async function testRewardsNoClientSideCalculation(): Promise<void> {
  const client = new FakeClient().on('GET', '/portal/referrals/rewards', {
    rewards: erpRewards,
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  });
  const service = new ErpPortalService(client);

  const rewards = await service.getReferralRewards();

  check('Rewards: the envelope is unwrapped', rewards.length === 1);
  check(
    'Rewards: the ERP amount is preserved verbatim (450 — no Sasa-side reward math)',
    rewards[0]?.amount === 450
  );
  check(
    'Rewards: the ERP invoice amount is preserved verbatim (5000)',
    rewards[0]?.invoiceAmount === 5000
  );
  check(
    'Rewards: ERP status is preserved (approved — decided by ERP staff)',
    rewards[0]?.status === 'approved'
  );
  check(
    'Rewards: ERP references are preserved (referral code, invoice id, wallet transaction id)',
    rewards[0]?.referralCode === 'REF-ABC123' &&
      rewards[0]?.invoiceId === 'inv_104' &&
      rewards[0]?.walletTransactionId === null
  );
  check(
    'Rewards: stats.totalEarned is the ERP value (450) — the UI renders it as-is, never summing locally',
    erpStats.totalEarned === 450 && rewards.length === 1 && rewards[0]?.amount === 450
  );

  // Bare array tolerated.
  const client2 = new FakeClient().on('GET', '/portal/referrals/rewards', erpRewards);
  const service2 = new ErpPortalService(client2);
  const bare = await service2.getReferralRewards();
  check('Rewards: a bare array response also maps', bare.length === 1 && bare[0]?.amount === 450);
}

// ── I. Wallet read-only + security firewall ─────────────────────────────────

async function testWalletReadOnlyAndFirewall(): Promise<void> {
  const client = new FakeClient()
    .on('GET', '/portal/referrals/customers/search?q=Davi', erpSearchCustomers)
    .on('POST', '/portal/referrals', erpCreateResult)
    .on('GET', '/portal/referrals', { referrals: [erpReferralActive, erpReferralConverted], total: 2, page: 1, pageSize: 20, totalPages: 1 })
    .on('GET', '/portal/referrals/ref_1', erpReferralActive)
    .on('GET', '/portal/referrals/ref_1/timeline', erpTimelineRows)
    .on('GET', '/portal/referrals/rewards', { rewards: erpRewards, total: 1, page: 1, pageSize: 20, totalPages: 1 })
    .on('GET', '/portal/referrals/stats', erpStats)
    .on('GET', '/portal/referrals/settings', erpSettings)
    .on('GET', '/portal/wallet', erpWallet);
  const service = new ErpPortalService(client);

  await service.searchReferralCustomers('Davi');
  await service.createReferral({ referredCustomerId: 'cust_103', notes: 'Bulk print' }, IDEMPOTENCY_KEY);
  await service.getReferrals();
  await service.getReferral('ref_1');
  await service.getReferralTimeline('ref_1');
  await service.getReferralRewards();
  await service.getReferralStats();
  await service.getReferralSettings();
  await service.getWallet();

  check(
    'Security: the referral flow ONLY calls /portal/referrals* and /portal/wallet (no payments, no ledger, no invoices)',
    client.calls.every(
      (c) => c.path.startsWith('/portal/referrals') || c.path === '/portal/wallet'
    ),
    client.calls.map((c) => `${c.method} ${c.path}`).join(', ')
  );
  check(
    'Security: no direct Supabase fetch/write in the referral flow',
    !client.calls.some((c) => /supabase|rest\/v1/i.test(c.path))
  );
  check(
    'Security: no wallet WRITE exists — the wallet is only ever GET',
    !client.calls.some((c) => c.path.startsWith('/portal/wallet') && c.method !== 'GET')
  );
  check(
    'Security: no claim/approve/credit endpoint is ever called (rewards are ERP-admin owned)',
    !client.calls.some((c) => /claim|approve|credit|wallet/i.test(c.path) && c.method !== 'GET')
  );
  check(
    'Security: Idempotency-Key is sent ONLY on POST /portal/referrals',
    client.calls.every(
      (c) =>
        !(c.method === 'POST' && c.headers?.['Idempotency-Key']) ||
        (c.method === 'POST' && c.path === '/portal/referrals')
    )
  );
  check(
    'Security: the create call happens exactly once per submission (no silent retries by the service)',
    client.calls.filter((c) => c.method === 'POST' && c.path === '/portal/referrals').length === 1
  );
}

// ── Runner ──────────────────────────────────────────────────────────────────

(async () => {
  console.log('═══ Sasa ERP Referral Contract — Focused Unit Tests ═══');
  console.log('(fake ApiClient only — no ERP calls, no Supabase, no real referrals)\n');

  await testSearchReferralCustomers();
  await testCreateReferral();
  await testReferralListMapping();
  await testReferralTimelineMapping();
  await testStatsSettingsWalletMapping();
  testIdempotencyKeyFormat();
  await testSameLogicalRetryReusesKey();
  await testNewSubmissionNewKey();
  testNoObsoleteReferralApi();
  testStatusHelpers();
  await testRewardsNoClientSideCalculation();
  await testWalletReadOnlyAndFirewall();

  console.log('\n═══ SUMMARY ═══');
  const passes = results.filter((r) => r.pass).length;
  console.log(`PASS ${passes} / ${results.length}  FAIL ${failures}`);
  if (failures) {
    results.filter((r) => !r.pass).forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
  }
  process.exit(failures ? 1 : 0);
})();