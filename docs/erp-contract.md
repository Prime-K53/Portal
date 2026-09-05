# Prime PORTAL — ERP Contract

> Pinned assumptions the Portal makes about the ERP backend.
> If the ERP changes in a way that breaks these contracts, the Portal will
> silently misbehave until this document is updated and tests adjusted.

The Portal is a read-mostly customer-facing frontend that talks to a remote
ERP via the `portalService` boundary. Customer identity, financial state, and
business rules are **authoritative in the ERP** — the Portal only reflects
what the ERP says and only mutates state through explicit, validated endpoints.

---

## 1. Authentication

| Field | Contract |
|-------|----------|
| `POST /api/portal/auth/login` | Returns `{ access_token, refresh_token, expires_in, user }`. `user.id` MUST equal `customer_id`. |
| `POST /api/portal/auth/refresh` | Returns a fresh `{ access_token, refresh_token, expires_in, user }`. `user` may be `null` if the refresh is implicit (token rotation only). |
| `POST /api/portal/auth/logout` | Idempotent. Revokes the refresh token server-side. |
| JWT identity | The ERP derives `customer_id` from the JWT for every authenticated request. The Portal NEVER sends `customer_id` in any request body — the server owns identity. |

**Portal responsibilities**
- Refresh tokens before `expires_in` elapses.
- Never store raw passwords in `sessionStorage` / `localStorage` (only tokens).
- On logout, wipe the per-invoice line-items cache so the next signed-in
  customer cannot see the previous user's cached descriptions via search
  (`usePortalEvents` clears `invoiceItemsCache` on `!isAuthenticated`).

**ERP responsibilities**
- Reject any request whose JWT `customer_id` does not own the resource
  being read/mutated (object-level authorization).
- Rate-limit per-customer aggressively enough that a single Portal session
  cannot fire 20+ concurrent GETs without a 429 (see §10 for the Portal-side
  mitigation).

---

## 2. Read endpoints

All endpoints live under `/api/portal/` and return JSON. The Portal never
calls them directly — only through `portalService`.

| Endpoint | Used by | Returns |
|----------|---------|---------|
| `GET /portal/profile` | `useCustomerData` | `{ id, full_name, email, phone, address, city, state, zip, country, creditLimit, balance, accountNumber, tier, ... }` |
| `GET /portal/loyalty` | `useLoyaltyData` | `{ tier }` or 5xx if unavailable (Portal tolerates failure) |
| `GET /portal/invoices` | `useInvoicesData` | `Invoice[]` (no line items — see §4) |
| `GET /portal/invoices/:id` | `useInvoiceDetailData` | `Invoice` with `items[]` |
| `GET /portal/orders` | `useOrdersData` | `Order[]` (official Sales Orders) |
| `GET /portal/requests?type=order` | `useOrderRequestsData` | `OrderRequest[]` |
| `GET /portal/quotations` | `useQuotationsData` | `Quotation[]` |
| `GET /portal/requests?type=quote` | `useQuoteRequestsData` | `QuoteRequest[]` |
| `GET /portal/shipments` | `useDeliveriesData` | `DeliveryNotification[]` |
| `GET /portal/statements?start=&end=` | `useStatementsData` | `StatementEntry[]` |
| `GET /portal/payments` | `usePaymentsData` | `Payment[]` |
| `GET /portal/payment-requests` | `usePaymentRequestsData` | `PaymentRequest[]` |
| `GET /portal/referrals` | `useReferralsData` | `PortalReferral[]` |
| `GET /portal/referrals/stats` | `useReferralStatsData` | `ReferralStats` |
| `GET /portal/referrals/rewards` | `useReferralRewardsData` | `ReferralReward[]` |
| `GET /portal/wallet` | `useWalletData` | `Wallet` |
| `GET /portal/catalog` | `useCatalogData` | `Product[]` |
| `GET /portal/notifications` | `useNotificationsData` | `PortalNotification[]` |
| `GET /portal/notifications/unread-count` | `useUnreadNotificationCount` | `{ count: number }` |
| `GET /portal/ads` | `useAdsData` | `PortalAd[]` (soft-deleted ads MUST be filtered server-side) |
| `GET /portal/support/tickets` | `useSupportTicketsData` | `SupportTicket[]` |
| `GET /portal/support/articles` | `useSupportArticlesData` | `SupportArticle[]` |
| `GET /portal/company-contact` | `useCompanyContactData` | `CompanyContactInfo` |

---

## 3. Mutation endpoints

| Endpoint | Body | Authoritative side |
|----------|------|---------------------|
| `POST /portal/requests` (type=order) | `{ items, deliveryAddress, paymentTerms, totalAmount, requestedDeliveryDate? }` | ERP creates `OrderRequest` (ODR-...). Portal MUST NOT invent order numbers. |
| `POST /portal/requests/:id/cancel` | none | ERP enforces ownership + cancellable status set. |
| `POST /portal/orders/:id/reorder` | none | ERP creates a fresh `OrderRequest` from the official Sales Order. |
| `POST /portal/quote-requests` | `{ items, requiredByDate, deliveryLocation, priority, notes }` | ERP creates `QuoteRequest`. |
| `POST /portal/quotations/:id/accept` | none | ERP flips quotation to accepted. |
| `POST /portal/quotations/:id/reject` | none | ERP flips quotation to rejected. |
| `POST /portal/quotations/:id/request-revision` | none | ERP marks the quotation as needing revision. |
| `POST /portal/payment-requests` | `{ invoiceId, requestedAmount, note, paymentMethod }` | ERP validates ownership + outstanding amount + duplicate-active-request. **This is a payment REQUEST, never a payment** — invoices do not change status here. |
| `POST /portal/referrals` | `{ referredName, referredEmail?, referredPhone?, notes? }` | ERP validates: not a self-referral, no duplicate existing customer. Portal NEVER fabricates referral codes/links. |
| `GET /portal/referrals/:id/timeline` | none | Returns `ReferralTimelineEntry[]`. |
| `POST /portal/support/tickets` | `{ subject, description, category, priority }` | ERP creates `SupportTicket`. |
| `POST /portal/notifications/mark-read` | `{ ids: string[] }` | Marks notifications read. |
| `POST /portal/notifications/mark-all-read` | none | Marks all read. |

**Portal-side mutation invariants**
- Every mutation sends an `Idempotency-Key` header. The ERP MUST dedupe on
  that key for the lifetime of the attempt.
- The Portal never sends `customerId` / `customer_id` in any body — the
  ERP extracts it from the JWT.

---

## 4. List-vs-detail payload split

- `GET /portal/invoices` returns invoice headers WITHOUT `items[]`. The
  Portal caches line items when the user opens the detail modal so that
  list-time search can hit item descriptions without ballooning every list
  payload.
- Cache lifecycle: per-invoice, capped at 500 entries, FIFO eviction,
  wiped on logout.
- If the ERP ever decides to include `items[]` on the list endpoint, the
  Portal's `getCachedInvoiceItems` will still work (it reads from the
  invoice object first, then the cache).

---

## 5. Variant-aware product ordering

- A product may carry `variants[]` (`{ id, name, sku, sellingPrice }`).
- `usePortalQuery` only fetches the catalog once (no variant endpoint).
- "Add to Cart" on a product WITH variants opens the `VariantSelectModal`
  before adding — the Portal does NOT silently pick a variant.
- The Portal sends `variantId` in the order request line. The ERP re-prices
  server-side from its master data (never trusts the client price).

---

## 6. The official-document watermark system

- `GET /portal/invoices/:id/official-pdf` returns a watermarked PDF
  scoped to the customer. Used by `downloadOfficialDocument('invoice', id)`.
- The watermark contains customer-identifying tokens; the ERP renders it
  server-side, the Portal only downloads.
- Copy watermark: same endpoint family for copy-paste protection on
  quotations, statements, delivery notes.

---

## 7. Outstanding balance is ERP-authoritative

- `profile.outstandingBalance` (when present) is the source of truth.
- The Portal NEVER derives outstanding from a date-filtered ledger —
  payments inside the window can be truncated, which would silently
  under-report the customer's debt.
- Fallback: if `profile.outstandingBalance` is missing, use the most recent
  unfiltered ledger row's `balance`. Visible in `StatementsTab.tsx`.

---

## 8. Live updates (SSE — contract §10)

- `GET /portal/events-ticket` returns a one-shot `{ ticket, expiresIn }`.
- `GET /portal/events?ticket=...` opens a Server-Sent Events stream of
  `{ entity, action, id }` events.
- On every event, the Portal calls `invalidatePortalQueries()` which
  refetches every mounted query hook. This is acceptable because events
  are rare — full refetches keep the Portal consistent with the ERP.
- The Portal subscribes to SSE only while authenticated
  (`sseService.start()` / `.stop()` are tied to the auth lifecycle).
- The ERP should not send events for the logged-out customer; if it does,
  the Portal ignores them (query hooks are `effectiveEnabled = false`).

---

## 9. Tab-aware query gating (429 mitigation)

The Portal splits list-query hooks into three buckets to avoid firing 20+
concurrent GETs against the same JWT session (which would trip the ERP's
429 rate-limit):

- **Always-on** (every tab, cross-tab UI): `useCustomerData`,
  `useNotificationsData`, `useUnreadNotificationCount`,
  `useCompanyContactData`. The header + bell need them on every render.
- **Dashboard-required** (always-on in practice, treated as such by the
  shell because the Dashboard tab renders KPIs + lists from them):
  `useInvoicesData`, `useOrdersData`, `useOrderRequestsData`,
  `useDeliveriesData`, `useStatementsData`, `useCatalogData`, `useAdsData`.
  Cost: ~7 extra fetches per session, but the dashboard could be the first
  tab the user sees and we don't want empty KPIs.
- **Per-tab gated** (silenced when not on their tab — `enabled=activeTab === 'X'`):
  `useQuotationsData`, `useQuoteRequestsData` (quotes tab);
  `usePaymentsData` (statements tab — needed for ledger detail);
  `useReferralsData`, `useReferralStatsData`, `useReferralRewardsData`,
  `useWalletData` (referrals tab);
  `useSupportTicketsData`, `useSupportArticlesData` (support tab).
- The list vs. dashboard split is enforced at code-review time. The test
  `tests/conditionalQueryFetching.test.ts` pins the contract.
- If a new list hook is added, it MUST be either (a) added to the
  always-on set with justification, (b) added to the dashboard-required set
  if the Dashboard tab reads from it, or (c) added to a per-tab gate.

---

## 10. Rate-limit (429) expectations

- The ERP returns 429 when a single JWT fires many requests in a short
  window.
- The Portal's responsibilities:
  - Only fetch what's needed for the active tab (see §9).
  - Dedupe in-flight requests (`usePortalQuery` `inFlightRef`).
  - Re-fetch on SSE invalidation is OK because invalidations are rare.
- The ERP's responsibilities:
  - Return `Retry-After` on 429.
  - Allow a small burst (e.g. 5 req/s sustained) for normal Portal use.

---

## 11. Error envelope

- 4xx / 5xx responses SHOULD return `{ error: string, code?: string }`.
- The Portal surfaces the `error` string verbatim via the
  `actionError` banner. The ERP should therefore avoid leaking stack
  traces in this string.

---

## 12. Versioning

- The Portal reads `portalService` config from `VITE_PORTAL_API_BASE` /
  `VITE_USE_REAL_BACKEND`. Switching environments is config-only.
- No breaking change to the endpoints above may ship without bumping the
  Portal to a new major version. Additive changes (new optional fields)
  are always safe.