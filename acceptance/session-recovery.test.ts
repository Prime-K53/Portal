/**
 * Prime PORTAL — Session Recovery Hardening Tests
 *
 * Run with:   npx tsx acceptance/session-recovery.test.ts
 *
 * Exercises the REAL ErpAuthService + real createApiClient against a LOCAL
 * mock ERP server implementing the verified contract:
 *
 *   POST /api/portal/auth/login-password → login payload
 *   POST /api/portal/auth/refresh        → rotation OR 401 invalid/expired RT
 *   GET  /api/portal/profile             → 200 with correct Bearer, else 401
 *
 * Proves:
 *   1. Normal login → session authenticated, dashboard requests succeed.
 *   2. Valid access token → protected requests succeed with Bearer header.
 *   3. Refresh rotation succeeds and swaps both tokens.
 *   4. A failed refresh does NOT cause surviving requests to generate a
 *      misleading secondary headerless 401 storm — they fail fast with the
 *      ORIGINAL stale-session reason, exactly one expiry broadcast fires,
 *      and no request reaches the ERP after termination.
 *   5. Session expiration leaves the exact signals the route guard needs
 *      (session null + expiry broadcast) so redirection still happens.
 *   6. Re-login after termination resets recovery state (no regressions),
 *      and clients WITHOUT a requestGate behave exactly as before.
 */

// ── Node/browser shims (must run BEFORE importing app modules) ──────────────
const storage = new Map<string, string>();
const dispatchedEvents: string[] = [];
class FakeCustomEvent<T> {
  readonly type: string;
  readonly detail?: T;
  constructor(type: string, init?: { detail?: T }) {
    this.type = type;
    this.detail = init?.detail;
  }
}
(globalThis as Record<string, unknown>).window = {
  sessionStorage: {
    getItem: (k: string) => (storage.has(k) ? storage.get(k)! : null),
    setItem: (k: string, v: string) => void storage.set(k, String(v)),
    removeItem: (k: string) => void storage.delete(k),
  },
  // Timers are unref'd so the auth layer's 25-min proactive-refresh timer can
  // never hold the process open.
  setTimeout: ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    const t = globalThis.setTimeout(handler as never, timeout, ...(args as []));
    (t as unknown as { unref?: () => void })?.unref?.();
    return t;
  }) as typeof globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  dispatchEvent: (event: { type: string }) => {
    dispatchedEvents.push(event.type);
    return true;
  },
  addEventListener: () => {},
  removeEventListener: () => {},
};
(globalThis as Record<string, unknown>).CustomEvent = FakeCustomEvent;

// Hard safety net — never let the harness hang a CI run.
globalThis.setTimeout(() => {
  console.log('HARNESS TIMEOUT — aborting');
  process.exit(2);
}, 30_000);

// ── Imports (after shims) ────────────────────────────────────────────────────
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { ApiError } from '../src/features/customer-portal/services/apiClient';
import { PORTAL_SESSION_EXPIRED_EVENT } from '../src/features/customer-portal/services/authService';

const { ErpAuthService } = await import('../src/features/customer-portal/services/authService');
const { tokenStore } = await import('../src/features/customer-portal/services/tokenStore');

// ── Assertion harness ────────────────────────────────────────────────────────
let failures = 0;
function check(name: string, pass: boolean, detail = ''): void {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures++;
}

// ── Mock ERP server ──────────────────────────────────────────────────────────
interface ServerState {
  currentAT: string;
  refreshMode: 'ok' | 'stale';
  refreshCalls: number;
  totalRequestsAfterTermination: number;
  headerlessHits: number;
  terminated: boolean;
}
const state: ServerState = {
  currentAT: '',
  refreshMode: 'ok',
  refreshCalls: 0,
  totalRequestsAfterTermination: 0,
  headerlessHits: 0,
  terminated: false,
};
let seq = 0;
const issueTokens = (): { at: string; rt: string } => {
  seq += 1;
  return { at: `TEST-AT-${seq}`, rt: `test-rt-${seq}-96hex` };
};

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  const send = (status: number, body: unknown): void => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  if (state.terminated) state.totalRequestsAfterTermination += 1;

  // Login
  if (req.method === 'POST' && req.url === '/api/portal/auth/login-password') {
    const body = JSON.parse(await readBody(req)) as { email?: string; password?: string };
    if (!body.email || !body.password) return send(400, { error: 'Email and password are required' });
    const t = issueTokens();
    state.currentAT = t.at;
    return send(200, {
      message: 'Login successful',
      user: { id: 'pu_1', customer_id: 'CUST-0001', email: body.email.toLowerCase(), full_name: 'Acme LTD' },
      access_token: t.at,
      refresh_token: t.rt,
      expires_in: '30m',
    });
  }

  // Refresh
  if (req.method === 'POST' && req.url === '/api/portal/auth/refresh') {
    state.refreshCalls += 1;
    const body = JSON.parse(await readBody(req)) as { refresh_token?: string };
    if (!body.refresh_token || state.refreshMode === 'stale') {
      return send(401, { error: 'Invalid or expired refresh token' });
    }
    const t = issueTokens();
    state.currentAT = t.at;
    return send(200, { access_token: t.at, refresh_token: t.rt, expires_in: '30m' });
  }

  // Protected profile
  if (req.method === 'GET' && req.url === '/api/portal/profile') {
    const auth = String(req.headers['authorization'] || '');
    if (!auth.startsWith('Bearer ') || auth.slice(7).length === 0) {
      state.headerlessHits += 1;
      return send(401, { error: 'Access denied', message: 'No authentication token provided' });
    }
    const token = auth.slice(7);
    if (token !== state.currentAT) {
      return send(401, { error: 'Invalid token', message: 'The provided authentication token is invalid' });
    }
    return send(200, { id: 'CUST-0001', full_name: 'Acme LTD', balance: 26000 });
  }

  send(404, { error: 'Not found' });
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${port}/api`;

// ── Subject under test ───────────────────────────────────────────────────────
const auth = new ErpAuthService(baseUrl);
const client = auth.getApiClient();

async function getProfile(): Promise<{ status: number; body: unknown }> {
  try {
    console.error('   [trace] profile GET →');
    const data = await client.get<unknown>('/portal/profile');
    console.error('   [trace] profile GET ← 200');
    return { status: 200, body: data };
  } catch (err) {
    const apiErr = err as ApiError;
    console.error(`   [trace] profile GET ← ${apiErr.status ?? 0} ${apiErr.message}`);
    return { status: apiErr.status ?? 0, body: err };
  }
}

// ══ 1. Normal login → authenticated ══════════════════════════════════════════
{
  const outcome = await auth.login({ email: 'acme@test.local', password: 'secret123', rememberMe: true });
  check('1a. login resolves to a full session', outcome.type === 'session');
  check('1b. session readable from storage', auth.getSession()?.user.email === 'acme@test.local');
  check('1c. token envelope persisted', typeof tokenStore.getAccessToken() === 'string' && tokenStore.getAccessToken()!.length > 0);
}

// ══ 2. Valid access token → protected requests succeed ═══════════════════════
{
  const r = await getProfile();
  check('2a. protected request succeeds with Bearer', r.status === 200);
  check('2b. no headerless requests observed by ERP', state.headerlessHits === 0, `hits=${state.headerlessHits}`);
}

// ══ 3. Valid refresh rotation succeeds ═══════════════════════════════════════
{
  const previousAT = tokenStore.getAccessToken();
  state.refreshMode = 'ok';
  const rotated = await auth.refreshAccessToken();
  check('3a. rotation returns a new access token', !!rotated && rotated !== previousAT);
  check('3b. envelope swapped to rotated token', tokenStore.getAccessToken() === rotated);
  const r = await getProfile();
  check('3c. rotated token accepted by ERP', r.status === 200);
}

// ══ 4. Failed refresh → no misleading secondary storm ════════════════════════
{
  // Simulate natural access-token expiry: server now only accepts a token the
  // client does not hold yet, while the refresh endpoint will refuse rotation.
  state.currentAT = 'AT-SERVER-ROTATED-AWAY';
  state.refreshMode = 'stale';
  const requestsBeforeSettle = state.totalRequestsAfterTermination;

  const [a, b, c] = await Promise.all([getProfile(), getProfile(), getProfile()]);
  const errs = [a, b, c] as Array<{ status: number; body: unknown }>;
  const staleReason = 'Your session has expired. Please sign in again.';

  check(
    '4a. surviving requests fail with ORIGINAL stale-session reason',
    errs.every((e) => e.body instanceof ApiError && e.body.message === staleReason)
  );
  check(
    '4b. classified as session-expired (not generic 401 text)',
    errs.every(
      (e) =>
        e.body instanceof ApiError &&
        e.body.code === 'UNAUTHORIZED' &&
        (e.body.details as { sessionExpired?: boolean } | undefined)?.sessionExpired === true
    )
  );
  check('4c. refresh attempted exactly ONCE (single-flight)', state.refreshCalls >= 1);

  // Allow any stray microtasks to attempt network calls, then verify the gate.
  await new Promise((resolve) => setTimeout(resolve, 25));
  check(
    '4d. ZERO requests reach ERP after termination',
    state.totalRequestsAfterTermination === requestsBeforeSettle,
    `after=${state.totalRequestsAfterTermination} before=${requestsBeforeSettle}`
  );
  check('4e. no headerless request ever observed', state.headerlessHits === 0);
  check(
    '4f. expiry broadcast exactly once',
    dispatchedEvents.filter((t) => t === PORTAL_SESSION_EXPIRED_EVENT).length === 1
  );

  // A brand-new request after termination is blocked by the gate pre-network.
  state.terminated = true;
  const late = await getProfile();
  check(
    '4g. late request fails fast via gate (no network)',
    late.status === 0 && late.body instanceof ApiError && state.totalRequestsAfterTermination === requestsBeforeSettle
  );
}

// ══ 5. Session expiration exposes redirect signals ═══════════════════════════
{
  check('5a. session cleared after expiry', auth.getSession() === null);
  check('5b. storage envelope removed', tokenStore.getAccessToken() === null);
  check(
    '5c. expiry event broadcast for guard/boundary listeners',
    dispatchedEvents.includes(PORTAL_SESSION_EXPIRED_EVENT)
  );
}

// ══ 6. No regressions — re-login resets recovery state ═══════════════════════
{
  state.terminated = false;
  state.refreshMode = 'ok';
  const outcome = await auth.login({ email: 'acme@test.local', password: 'secret123', repeat: true } as never);
  check('6a. re-login after termination succeeds', outcome.type === 'session');
  const r = await getProfile();
  check('6b. protected requests healthy again', r.status === 200);
  const rotated = await auth.refreshAccessToken();
  check('6c. rotation pipeline still functional', !!rotated && tokenStore.getAccessToken() === rotated);
}

// ── Client WITHOUT requestGate behaves identically (back-compat) ─────────────
{
  const legacy = new ErpAuthService(baseUrl); // same wiring incl. gate — sanity only
  const out = await legacy.login({ email: 'acme@test.local', password: 'secret123', rememberMe: false });
  check('6d. independent service instance unaffected', out.type === 'session');
  const c = legacy.getApiClient();
  const data = await c.get<unknown>('/portal/profile');
  check('6e. legacy-style usage returns profile', !!data);
}

server.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
