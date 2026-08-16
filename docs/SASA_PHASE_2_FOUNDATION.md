# SASA → PRIME ERP PORTAL REPLACEMENT — PHASE 2: PRODUCTION FOUNDATION

Status: **FOUNDATION COMPLETE — ERP INTEGRATION NOT YET CONNECTED**

This document records the Phase 2 work that prepared the Sasa frontend as a clean,
production-ready customer Portal shell for the future PrimeERPsystem Portal API
integration. Sasa is **not** connected to the ERP. No fake authentication, no
hardcoded sessions, and no mock-data fallbacks exist in production paths.

---

## 1. Authentication Architecture

```
ERP Portal authentication
        ↓
JWT access token
        ↓
refresh token/session rotation (inside authService only — never exposed to app code)
        ↓
authenticated Sasa session
        ↓
portal customer
        ↓
customer_id  (portal_users.customer_id → customers.id)
```

### Files

| File | Role |
| --- | --- |
| `src/features/customer-portal/services/authService.ts` | `AuthService` interface + implementations + factory |
| `src/features/customer-portal/services/tokenStore.ts` | Sole persistence module for tokens/sessions |
| `src/features/customer-portal/hooks/useAuth.ts` | React binding; component tree reads auth ONLY from here |
| `src/features/customer-portal/components/AuthPage.tsx` | Credential-based sign-in / sign-up / password reset UI |

### AuthService operations

- `login(credentials)` — exchanges credentials for an `AuthSession` (JWT access token + Portal user)
- `logout()` — clears the local session
- `refreshSession()` — restores/rotates the session on boot and on 401
- `getCurrentUser()` — returns the authenticated `PortalUser`
- `getSession()` / `isAuthenticated()` — session state queries
- `register(input)` / `requestPasswordReset(email)` — existing Sasa UI flows routed through the auth boundary

### Implementations

1. **`UnconnectedAuthService` (default, production-safe)**
   - Every credential operation throws `AuthError NOT_CONNECTED` with an explicit message.
   - `getSession()` always returns `null` and discards any stored (stale/demo) session,
     so the application **can never** boot into an authenticated state.
   - `refreshSession()` returns `null` (no refresh endpoint contract yet).

2. **`MockAuthService` (DEVELOPMENT ONLY)**
   - Enabled **only** when `VITE_ENABLE_MOCK_AUTH=true` (explicit, loud console warning).
   - Accepts any non-empty credentials for local development and produces a session whose
     access token is explicitly marked `demo_access_token_*`. Never for production.

### Guarantees

- No `isAuthenticated = true`, no hardcoded demo customer, no fabricated tokens.
- Refresh tokens never appear in application code; only the access token is persisted
  (and only by `tokenStore`).
- No credentials stored in source code or on the device.

---

## 2. API Client Architecture

`src/features/customer-portal/services/apiClient.ts`

- Methods: `get` / `post` / `put` / `patch` / `delete` / `request`
- JSON serialization/deserialization
- Bearer authorization from the session token store (injected via `getAccessToken`)
- Per-request timeout (default 15000 ms, configurable via `VITE_API_TIMEOUT_MS`)
- Normalized errors: `ApiError { message, status, code, details }` with codes
  `NOT_CONFIGURED | NETWORK_ERROR | TIMEOUT | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | BAD_REQUEST | SERVER_ERROR | UNKNOWN`
- 401 handling: one refresh/retry cycle via `refreshAccessToken`; `onAuthFailure`
  hook for session-expiry side effects
- Refuses to call anything when the base URL is unset (`NOT_CONFIGURED`)

No URLs are hardcoded anywhere. The base URL comes exclusively from `VITE_API_URL`
(via `config/env.ts`). The exact ERP endpoint set is **not** invented in this phase.

---

## 3. Environment Configuration

`src/features/customer-portal/config/env.ts` is the single source of configuration;
no other module reads `import.meta.env`.

| Variable | Purpose | Default |
| --- | --- | --- |
| `VITE_API_URL` | ERP Portal API base URL — intentionally empty until Phase 3 | `''` |
| `VITE_API_TIMEOUT_MS` | Request timeout | `15000` |
| `VITE_ENABLE_MOCK_API` | DEV ONLY: serve in-memory mock Portal service | `false` |
| `VITE_ENABLE_MOCK_AUTH` | DEV ONLY: enable mock auth | `false` |

Production safety: mock implementations are **off by default**, require an explicit
opt-in flag, and print loud console warnings when active. No service-role keys,
database credentials, localhost URLs or hardcoded production URLs exist in the
repository. Template: see `.env.example`.

---

## 4. Service / Data-Layer Architecture

```
UI (tabs/modals)
   ↓  (read hooks + mutation callbacks only)
Portal service — PortalService interface (typed boundaries)
   ↓
API client (apiClient)   [or MockPortalService in dev]
   ↓
ERP Portal API  (Phase 3)
```

Files:

| File | Role |
| --- | --- |
| `services/portalService.ts` | `PortalService` interface + `UnconnectedPortalService` (throws `NOT_CONFIGURED`) + factory |
| `services/mockPortalService.ts` | DEV-ONLY in-memory implementation behind the same interface |
| `hooks/usePortalData.ts` | Typed read hooks per screen |
| `hooks/usePortalQuery.ts` | Generic loading/data/error/refetch hook |

Typed service boundaries (only for features present in Sasa):

- current customer (`getCurrentCustomer`) and account
- dashboard (`getDashboard` composite)
- invoices + payment prompts (`getInvoices`, `submitPaymentPrompt`)
- orders + catalog (`getOrders`, `createOrder`, `getCatalog`)
- quotations / quotation requests (`getQuoteRequests`, `submitQuoteRequest`, `acceptQuote`)
- deliveries / shipments (`getDeliveries`)
- statements (`getStatements`)
- referrals (`getReferrals`, `sendReferralInvite`, `claimReferralReward`)
- notifications (`getNotifications`, `markNotificationsRead` — Sasa surfaces deliveries as notifications)

UI components never fetch endpoints directly; business logic does not live in
React components (mutations previously embedded in `CustomerPortalApp` now live
in the service layer).

---

## 5. Domain Types

`src/features/customer-portal/types.ts` — normalized, documented, and marked
`@provisional` where the ERP contract is not yet locked:

`PortalUser`, `Customer`, `AuthCredentials`, `AuthRegisterInput`, `AuthSession`,
`AccountProfile`, `Invoice`, `InvoiceItem`, `Payment`, `PaymentPromptPayload`,
`PaymentPromptResult`, `Product`, `CartItem`, `Order`, `OrderItem`,
`NewOrderPayload`, `Quotation`, `QuotationItem`, `QuoteRequest`,
`QuoteRequestItem`, `NewQuoteRequestPayload`, `Shipment` (= `DeliveryNotification`),
`Statement` (= `StatementEntry`), `Referral`, `ReferralInvitePayload`,
`PortalNotification`, `PortalDashboard`, `TabType`.

Notes:

- Types introduced for ERP parity but not yet consumed by any screen:
  `Payment`, `Quotation`, `QuotationItem`, `PortalNotification`, `Customer`.
- Existing Sasa field names were **not** changed; the ERP contract will drive the
  final shape during Phase 3, not the mock-era model.
- `PortalNotification` is named to avoid shadowing the DOM `Notification` global.

---

## 6. Route Structure

Zero-dependency hash router (`router/useHashRoute.ts`), route table in
`router/routes.ts`, protected-route guard in `router/RouteGuard.tsx`.

| Route | Screen |
| --- | --- |
| `#/login` | AuthPage (unauthenticated users always land here) |
| `#/dashboard` | DashboardTab |
| `#/invoices` | InvoicesTab |
| `#/orders` | OrdersTab |
| `#/quotations` | QuotesTab (formal quotations — reserved for ERP parity) |
| `#/requests` | QuotesTab (quotation requests / RFQs) |
| `#/deliveries` | DeliveriesTab |
| `#/statements` | StatementsTab |
| `#/referrals` | ReferralsTab |
| `#/account` | AccountTab |

Guards: unknown routes and `#/login` redirect to the dashboard when authenticated;
unauthenticated users can never reach Portal screens. Guards rely solely on
`AuthService` state — no fake bypasses.

---

## 7. Mock-Data Inventory

All mock data is confined to DEV-ONLY code paths behind the `PortalService`
interface. Inventory:

| File | Mock data | Used by | Replacement API required |
| --- | --- | --- | --- |
| `data/mockData.ts` | `initialProfile` | `MockPortalService.getCurrentCustomer/getDashboard` | `GET /profile` (customer) |
| `data/mockData.ts` | `initialInvoices` | `MockPortalService.getInvoices/getDashboard`, payment prompt flow | `GET /invoices`, `POST /payments` |
| `data/mockData.ts` | `initialDeliveries` | `MockPortalService.getDeliveries/getDashboard/getNotifications`, order flow | `GET /shipments` (+ notifications) |
| `data/mockData.ts` | `initialProducts` | `MockPortalService.getCatalog` | `GET /catalog` |
| `data/mockData.ts` | `initialOrders` | `MockPortalService.getOrders/getDashboard`, create order flow | `GET /orders`, `POST /orders` |
| `data/mockData.ts` | `initialQuotes` | `MockPortalService.getQuoteRequests/getDashboard`, RFQ flow | `GET /requests`, `POST /requests` |
| `data/mockData.ts` | `initialStatements` | `MockPortalService.getStatements/getDashboard`, payment/order/reward flows | `GET /statements` |
| `data/mockData.ts` | `initialReferrals` | `MockPortalService.getReferrals`, invite/claim flows | `GET /referrals` (+ POST/claim) |

Former `services/portalApiAdapter.ts` (dead adapter with in-repo mock fallback and
guessed endpoints) was **deleted**.

---

## 8. Mock-Data Replacement Plan

1. UI depends only on the `PortalService` interface (hooks), never on `mockData.ts`.
2. `mockData.ts` and `MockPortalService` are marked DEVELOPMENT ONLY; the public
   barrel (`index.ts`) no longer exports mock data.
3. Production can never silently use mocks: mocks require explicit
   `VITE_ENABLE_MOCK_API` / `VITE_ENABLE_MOCK_AUTH` flags; without them the
   `UnconnectedPortalService` fails loudly with `NOT_CONFIGURED` and renders error
   states — mock data is never displayed as a fallback.
4. Phase 3 replaces `UnconnectedPortalService` with a real implementation wired
   through `apiClient`; the mock implementation can then be removed.

---

## 9. Error / Loading / Empty Architecture

`components/state/PortalDataBoundary.tsx` + `hooks/usePortalQuery.ts`:

- Every data screen renders through `PortalDataBoundary`: loading → error → empty → content.
- `ErrorState` maps errors to human messages:
  - `UNAUTHORIZED` → "session expired, sign in again"
  - `FORBIDDEN` → authorization failure
  - `NETWORK_ERROR` / `TIMEOUT` → network failure
  - `NOT_CONFIGURED` → ERP not yet connected
  - other/server errors → server message
- API failures are **never** silently replaced with mock data.
- Mutations surface failures through an action-error banner (no fake success).

---

## 10. Tests Performed

| Check | Result |
| --- | --- |
| `npm install` (fresh, pnpm-installed node_modules was incompatible with npm; removed and reinstalled) | ✅ 216 packages |
| `npm run lint` (`tsc --noEmit`) | ✅ 0 errors |
| `npm run build` (production, no mock flags) | ✅ built |
| `npm run build` (with mock flags, dev verification) | ✅ built |
| Dev server boot + HTTP 200 | ✅ |
| Headless-browser (Chrome CDP) smoke test — **default mode**: boots to Sign In, integration note present, NO Portal sidebar, NO demo login buttons, NO hardcoded authenticated shell, no runtime exceptions | ✅ all passed |
| Headless-browser smoke test — **mock mode**: sign-in submits credentials through AuthService, Portal shell + Dashboard render, no exceptions | ✅ all passed |
| `npm test` | ⚠️ Not available — project has no test runner/script (no dependency added per phase constraints) |

Test harnesses used (`smoke-ssr.tsx`, `cdp-smoke.mjs`) were temporary dev tooling
and have been removed.

---

## 11. Remaining Blockers

1. **No ERP API contract imported** — every Portal data operation and every
   credential operation currently fails with an explicit "not connected" error.
2. **No ERP authentication contract** — login/register/password-reset endpoints,
   JWT claims, and the refresh/token-rotation flow are undefined.
3. **TOTP 2FA** (present in the ERP Portal) has no Sasa counterpart yet.
4. **No test runner** in the project — a testing strategy (framework, coverage of
   services/apiClient) is a Phase 3 prerequisite.
5. **`initialProfileData` prop** on `CustomerPortalApp` remains for the ERP merge
   path; final behavior should be reviewed during integration.
6. **Lock files**: `bun.lock` and `pnpm-lock.yaml` predate the npm install;
   recommend consolidating to one package manager before integration.

---

## 12. Exact ERP API Contracts Still Required

Imported during Phase 3 — nothing below has been assumed or implemented:

- **Authentication**
  - `POST` login (credentials → JWT access token + refresh token/session)
  - `POST` refresh session / token rotation
  - `POST` logout
  - `POST` register portal user (if supported by ERP)
  - `POST` request password reset
  - TOTP 2FA challenge/verify endpoints
  - JWT claim set (sub, customer_id, roles, expiry) and storage rules
- **Identity**: `GET` current customer / profile (portal_users.customer_id → customers.id)
- **Dashboard**: composite payload shape or per-collection endpoints
- **Invoices**: `GET` list/detail; **Payments**: `POST` payment prompt + result shape
- **Orders**: `GET` list/detail, `POST` create (payload = `NewOrderPayload`)
- **Quotations / requests**: `GET`/`POST` quote requests (RFQs), formal quotations, accept action
- **Deliveries**: `GET` shipments/notifications, mark-read semantics
- **Statements**: `GET` ledger entries (running balance semantics)
- **Referrals**: `GET` list, `POST` invite, reward claim endpoint
- **Catalog**: `GET` products (stock, pricing, units)
- **Error contract**: status codes, error body shape (`message`/`details`), 401 semantics

---

## File Inventory — Phase 2 Changes

**Added**
- `src/vite-env.d.ts`
- `src/features/customer-portal/config/env.ts`
- `src/features/customer-portal/services/apiClient.ts`
- `src/features/customer-portal/services/tokenStore.ts`
- `src/features/customer-portal/services/authService.ts`
- `src/features/customer-portal/services/portalService.ts`
- `src/features/customer-portal/services/mockPortalService.ts`
- `src/features/customer-portal/services/index.ts`
- `src/features/customer-portal/router/routes.ts`
- `src/features/customer-portal/router/useHashRoute.ts`
- `src/features/customer-portal/router/RouteGuard.tsx`
- `src/features/customer-portal/hooks/useAuth.ts`
- `src/features/customer-portal/hooks/usePortalQuery.ts`
- `src/features/customer-portal/hooks/usePortalData.ts`
- `src/features/customer-portal/components/state/PortalDataBoundary.tsx`
- `docs/SASA_PHASE_2_FOUNDATION.md`
- `package-lock.json` (npm install)

**Modified**
- `src/features/customer-portal/types.ts` (auth/identity types, provisional marks, parity types)
- `src/features/customer-portal/CustomerPortalApp.tsx` (auth-driven, routed, service-backed)
- `src/features/customer-portal/components/AuthPage.tsx` (credential submission, demo login removed)
- `src/features/customer-portal/index.ts` (new service/type exports, mock data un-exported)
- `src/features/customer-portal/data/mockData.ts` (DEVELOPMENT ONLY header)
- `src/features/customer-portal/components/Sidebar.tsx` / `MobileHeader.tsx` (null-safe profile, no fake fallbacks)
- `.env.example`, `MERGE_GUIDE.md`

**Removed**
- `temp_repo/` (broken Playwright debris breaking `tsc`)
- `src/features/customer-portal/services/portalApiAdapter.ts` (dead adapter + guessed endpoints)

---

**STOP — Phase 2 complete. Do not proceed to ERP integration without the confirmed
API contracts listed in §12.**