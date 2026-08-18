# SASA — Phase 4: Prime PORTAL ↔ PrimeERPsystem Live ERP Integration

Status: **LIVE** — the customer portal talks to the real PrimeERP Portal API.
Mocks remain strictly development-only and are disabled whenever
`VITE_USE_REAL_BACKEND=true`.

All endpoints, request bodies, response shapes, JWT claims, and session
semantics below were **verified directly from the PrimeERPsystem source**
(`backend/routes/portal.cjs`, `backend/routes/portalAuth.cjs`,
`backend/services/portalService.cjs`, `backend/services/portalAuthService.cjs`,
`backend/services/portalLifecycleService.cjs`, `backend/middleware/portalAuth.cjs`,
`backend/index.cjs`). They are not assumed or inferred.

---

## 1. Runtime mode selection

| `VITE_USE_REAL_BACKEND` | `VITE_ENABLE_MOCK_API` | `VITE_ENABLE_MOCK_AUTH` | Result |
|---|---|---|---|
| `true` | any | any | **REAL backend only.** Mocks are ignored. |
| unset/`false` | `true` | `true` | Mock portal service + mock auth (dev). |
| unset/`false` | `true` | `false` | Mock portal data, real auth flow. |
| unset/`false` | `false` | `true` | Real portal data, mock login. |
| unset/`false` | `false` | `false` | Real services; no authentication accepted (login will fail). |

- `erpApiBaseUrl()` = `${VITE_API_URL}/api`. `VITE_API_URL` is the ERP origin
  WITHOUT the `/api` suffix.
- Factory: `createAuthService()` and `createPortalService()` in
  `src/features/customer-portal/services/index.ts`.
- **Production rule:** failures in real mode are surfaced as errors — never
  replaced with mock data. There is no fallback path.

---

## 2. Authentication (`ErpAuthService`)

| Action | Endpoint | Payload / Notes |
|---|---|---|
| Login | `POST /api/portal/auth/login-password` | `{ email, password, two_factor_code? }` → access/refresh envelope, or 2FA challenge `{ requires_two_factor: true, pending_token, user: { id, email } }` |
| 2FA verify | `POST /api/portal/auth/login-password` | Re-POST login with `{ ..., two_factor_code }`. **No** `pending_token` is sent back — pending credentials are held in memory only. |
| Refresh (rotation) | `POST /api/portal/auth/refresh` | `{ refresh_token }`. No Bearer required. The server revokes the old session and issues a NEW refresh token (single-use). TTL 30 days, stored hashed in `portal_sessions`. Single-flight in Sasa. |
| Logout | `POST /api/portal/auth/logout` | Bearer + `{ refresh_token }`, fire-and-forget. **Revokes ALL sessions of the user.** |
| Forgot password | `POST /api/portal/auth/forgot-password` | `{ email }` → generic success (no account enumeration) |
| Reset password | `POST /api/portal/auth/reset-password` | `{ email, code, password }` (min 6 chars); revokes all sessions |
| Activate account | `POST /api/portal/auth/activate` | `{ customer_id, code, password }` → full login response (auto-login); requires `status === 'invited'` |
| Me | `GET /api/portal/auth/me` | Bearer → raw `portal_users` row |
| Sessions | `GET/DELETE /api/portal/auth/sessions(/:id)` | Bearer |

**Verified contract facts (source-confirmed):**
- JWT: **HS256**, payload `{ id, customer_id, email, role: 'portal_customer' }`, lifetime **30 minutes**.
- `expires_in` in every response is the **string `'30m'`**, never numeric seconds.
- The unified `POST /api/auth/login` **strips `two_factor_code`** (Zod schema) — 2FA customers cannot log in through it. `login-password` is the correct 2FA-capable endpoint and is what Sasa uses.
- Wrong-portal logins → 403 `{ error, code: 'ACCOUNT_BELONGS_TO_*', role }`.
- 2FA uses TOTP (`otplib`, window 1); secrets live on `portal_users`.
- Portal auth middleware: Bearer required, role must be exactly `portal_customer`, expired → 401 `{ error: 'Token expired' }`. Rate limits: `/portal/auth/*` 30 req/15 min per IP; `/portal/*` 200 req/15 min; sensitive routes 30 req/hour.

- Session envelope stored in `sessionStorage['portal_session']`:
  `{ access_token, refresh_token, expires_in, user }` (matches the ERP's own live client).
- Proactive refresh timer rotates the access token 25 minutes after login
  (access tokens are 30-minute TTL).
- On 401 the pipeline attempts one refresh; if refresh fails, the
  `portal-session-expired` DOM event is dispatched and the UI returns to the
  login screen.
- `AuthService.getApiClient()` exposes the shared `ApiClient` used by both
  `ErpPortalService` and `ErpSseService`, so every request shares the same
  single-flight refresh pipeline.

## 3. API client (`apiClient.ts`)

- Base: `${VITE_API_URL}/api`, timeout `VITE_API_TIMEOUT_MS` (default 15s).
- JSON envelope: `{ success, data, error? }` — decoded, then `data` returned.
- 401 → one refresh attempt → retry original request once.
- 429/5xx → retry with exponential backoff (1s → 2s → 4s, capped).
- Business failures raise `ApiError` with `code` (`UNAVAILABLE`, `UNAUTHORIZED`,
  `VALIDATION`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `NETWORK`, `SERVER`).

## 4. Portal data endpoints (`ErpPortalService`)

| SASA feature | Service method | ERP endpoint | Notes |
|---|---|---|---|
| Dashboard totals | `getCustomerProfile`, `getInvoices`, `getOrders`, `getShipments`, `getStatements` | `GET /portal/profile`, `/portal/invoices`, `/portal/orders`, `/portal/shipments`, `/portal/statements?startDate&endDate` | Client-side aggregation. The ERP composite `GET /portal/dashboard` exists but returns aggregates (not lists); the obsolete Sasa `getDashboard()` stub was removed |
| Invoices | `getInvoices` | `GET /portal/invoices` | `ErpInvoiceSummary[]` |
| Invoice detail | `getInvoiceDetail` | `GET /portal/invoices/{id}` | `{ invoice, items }`; modal falls back to list data on failure |
| Payments | `getPayments` | `GET /portal/payments` | `ErpPaymentRecord[]` |
| Make payment | `submitPayment` | `POST /portal/payments` | `{ invoiceId, amount, currency?, paymentMethod?, reference?, transactionId? }` → `{ success, paymentId, status }` |
| Stripe intent | `getPaymentIntent` | `POST /portal/payments/intent` | `{ invoiceId, amount, currency? }` → `{ clientSecret, mode }` (mock mode when no Stripe key) |
| Orders | `getOrders` | `GET /portal/orders` | Catalog items resolved client-side via `/portal/catalog` |
| Create order | `createOrder` | `POST /portal/requests` | `{ requestType: 'order', items[], notes? }` — the ERP has NO `POST /orders`; orders are created as requests (server-authoritative pricing). Sasa folds `deliveryAddress`/`paymentTerms` into notes |
| Reorder | `reorderOrder` | `POST /portal/orders/{id}/reorder` | → `{ id, requestNumber, status: 'submitted', reorderOf, reorderOfNumber }` |
| Quotations | `getQuotations` | `GET /portal/quotations` | `ErpQuotation[]` |
| Quotation accept | `acceptQuotation` | `POST /portal/quotations/{id}/accept` | |
| Quotation reject | `rejectQuotation` | `POST /portal/quotations/{id}/reject` | body `{ reason? }` |
| Quotation revision | `requestQuotationRevision` | `POST /portal/quotations/{id}/revision` | body `{ comments? }` |
| Quotation versions | — | `GET /portal/quotations/{id}/versions(/:version)` | EXISTS in ERP; not yet consumed by Sasa |
| Quotation signatures | — | `GET /portal/quotations/{id}/signatures` | EXISTS in ERP; not yet consumed by Sasa |
| Quotation requests / RFQs | `getQuoteRequests` | `GET /portal/requests` | Filtered to `request_type !== 'order'` |
| Submit RFQ | `submitQuoteRequest` | `POST /portal/requests` | `{ requestType: 'quotation', items[], notes?, requestedDeliveryDate? }` |
| Shipments | `getDeliveries` | `GET /portal/shipments` | Delivery notes + tracking sales orders (`_source`) |
| Statements | `getStatements` | `GET /portal/statements?startDate&endDate` | `{ opening_balance, closing_balance, outstanding_balance, credit_limit, transactions[] }` |
| Catalog | `getCatalog` | `GET /portal/catalog` | No image field in ERP |
| Notifications | `getNotifications` | `GET /portal/notifications` | rows use `is_read` / `created_at` snake_case |
| Unread count | `getUnreadNotificationCount` | `GET /portal/notifications/unread-count` | |
| Mark read | `markNotificationsRead` | `PUT /portal/notifications/{id}/read` | One PUT per id (parallel) |
| Mark all read | `markAllNotificationsRead` | `PUT /portal/notifications/read-all` | |
| Loyalty | `getLoyalty` | `GET /portal/loyalty` | `{ points, cashback, tier, pointsHistory }` |
| Wallet | — | `GET /portal/wallet` | EXISTS in ERP; no Sasa screen |
| Documents | — | `GET /portal/documents`, `GET/POST /portal/comments`, `GET /portal/timeline`, `POST /portal/downloads` | EXISTS in ERP (quotation-scoped); no Sasa screen |
| Support tickets | — | `GET/POST /portal/support/tickets...` | EXISTS in ERP; no Sasa screen |
| Banner ads | Dashboard carousel | `GET /portal/ads` | `ErpPortalAd[]` — display-ready, company-scoped, active/date-filtered, priority-sorted; Sasa maps to `PortalAd[]` (`mapAd`) and renders real image/gradient/emoji/CTA slides. `GET /portal/promotions` and `POST /portal/orders/preview` still not consumed by Sasa |
| Referrals | `getReferrals`, `sendReferralInvite`, `claimReferralReward` | `GET/POST /portal/referrals`, `/portal/referrals/{id}`, `/rewards`, `/settings`, `/stats`, `/customers/search` | **BLOCKED in Sasa** — ERP refers existing customers by id; Sasa invites by name/email (see §6) |

## 5. Real-time events (`ErpSseService`)

1. `POST /api/portal/events-ticket` (Bearer) → `{ ticket, expiresIn: 300 }` (5-minute JWT with `sse: true`).
2. `EventSource ${baseUrl}/portal/events?token=<ticket>` — the query token is accepted ONLY on this path.

- The ERP writes **NAMED events**; the browser `onmessage` handler does NOT fire for them, so Sasa registers both names with `addEventListener`:
  - `event: entity_changed` → `{ customerId, docType, docId, event, eventType?, status?, docNumber?, metadata?, updatedAt? }`
  - `event: notification` → `{ customerId, type, title, body, link?, actorName?, createdAt }`
- Server emits `retry: 15000` and a `: ping` heartbeat every 25 s; delivery is filtered by `customer_id` server-side.
- Fresh ticket is requested on EVERY (re)connect — tickets are short-lived.
- Events are deduplicated (docType/docId/event, or createdAt+title) and trigger
  invalidation of the affected query families via the `usePortalQuery` bus.
- Singleton `sseService` is started by `usePortalEvents()` only when
  authenticated AND `useRealBackend` — mock mode never opens an EventSource.

## 6. Features intentionally not wired (honest UNAVAILABLE states)

| Feature | ERP reality | Sasa behavior |
|---|---|---|
| Dashboard composite | `GET /api/portal/dashboard` EXISTS and is fully implemented | Not used: Sasa assembles the dashboard client-side from real list endpoints (the ERP endpoint returns aggregates, not the lists Sasa's dashboard contract needs). Obsolete blocked stub removed. |
| Referrals — invite | `POST /api/portal/referrals` requires `{ referredCustomerId }` (an EXISTING customer, found via `/portal/referrals/customers/search`) | Sasa's `ReferralInvitePayload` (name/company/email of a new contact) does not map to the ERP contract — blocked with an explicit message; screen shows a blocked-state panel. |
| Referrals — claim reward | **No customer claim endpoint** — rewards are ERP-admin approved (`PATCH /api/referrals/rewards/:id/approve`) | Blocked with an explicit message. |

These are real contract mismatches, not pending-migration blockers. They fail
loudly via `ApiError` code `UNAVAILABLE` and are never fabricated.

## 7. Mock coverage (dev only)

`MockAuthService` (demo login, 2FA passthrough) and `MockPortalService`
(profile, invoices, payments incl. `ErpPaymentResult`, quotations with
accept/reject/revision, deliveries, statements, catalog, notifications,
loyalty) implement the same `PortalService` interface with seeded data.
`submitPayment`/`getPaymentIntent`/`getLoyalty` return contract-shaped values.
No mock implements a blocked feature as if it worked.

## 8. Verification

```bash
npm run lint   # tsc --noEmit — strict typecheck
npm run build  # vite build — production bundle
```

No automated test runner is configured in this repository
(`TEST RUNNER NOT CONFIGURED`).

## 9. File map

- `src/features/customer-portal/services/authService.ts` — real auth (`/portal/auth/login-password`, 2FA, rotation refresh) + `erpApiBaseUrl()` + shared `getApiClient()`.
- `src/features/customer-portal/services/apiClient.ts` — raw-response client (no envelope), retries, refresh single-flight.
- `src/features/customer-portal/services/tokenStore.ts` — sessionStorage envelope.
- `src/features/customer-portal/services/portalService.ts` — ERP portal client + adapters (incl. request pipeline: orders + RFQs).
- `src/features/customer-portal/services/sseService.ts` — ticket-based SSE singleton with named-event listeners.
- `src/features/customer-portal/services/mockPortalService.ts`, `mockAuthService.ts` — dev mocks.
- `src/features/customer-portal/services/index.ts` — factories + singletons.
- `src/features/customer-portal/hooks/useAuth.ts`, `usePortalData.ts`, `usePortalQuery.ts` — data hooks.
- `src/features/customer-portal/config/env.ts` — all env flags.
- `src/features/customer-portal/types.ts` — ERP wire types.
- UI: `CustomerPortalApp.tsx`, `components/` (AuthPage, PaymentModal, CartDrawer, NotificationDrawer, tabs, modals).
