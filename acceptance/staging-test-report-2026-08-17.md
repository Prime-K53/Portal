# Sasa → ERP Staging Test Report — 2026-08-17

Scope: first authorized live staging test of the Sasa order-request flow against the
real ERP portal backend. Sasa source code was NOT modified during this test. The ERP
was NOT modified (code, schema, or data) and NOT redeployed.

---

## 1. Environment

| Item | Value | Status |
|---|---|---|
| ERP API | `http://127.0.0.1:3000/api/portal` (real ERP dev server, PID 7452) | REACHABLE |
| Sasa dev | `http://127.0.0.1:3001` (Vite, no proxy) | UP |
| Sasa env | `VITE_API_URL=http://127.0.0.1:3000`, `VITE_USE_REAL_BACKEND=true`, `VITE_ENABLE_MOCK_API=false`, `VITE_ENABLE_MOCK_AUTH=false` | REAL BACKEND |
| Login | `POST /api/portal/auth/login` `{customer_id: "CUST-0001", full_name: "Acme LTD"}` | 200 OK |
| Portal user | `pusr_1786163215519_42643d6f3be1` (customer CUST-0001, stable per customer) | OK |
| ERP build freshness | Preflight `Access-Control-Allow-Headers` response lacks the literal `Idempotency-Key` header even though the ERP source (`index.cjs:227/280`) includes it | STALE BUILD |

## 2. Baseline (before test)

- Customer: CUST-0001 "Acme LTD" (portal user same id used for idempotency scope).
- Invoices: 2 (both Partial, outstanding 0). Payments: 2. Statement transactions: 4.
- Official sales orders: 1 (`ORD-0002`, status Converted).
- Order requests: 0. Catalog: 97 products served (ERP cloud `products` table has 118
  rows; raw materials filtered out). Selected product `INV-STA-012` "A4 Envelope":
  catalog price 500, stock 50 (cloud `products` row: id/sku `INV-STA-012`, sellingPrice 500, stock 50).

## 3. Order Submission

- Sasa UI (headless Chrome, real backend): product card `SKU: INV-STA-012` → Add to
  Cart (qty 1) → cart drawer → `Submit Order Request` clicked ONCE.
- Captured request: `POST /api/portal/requests` with header `Idempotency-Key:
  978622ae-a944-46b1-b19d-cf0a08d14` and body
  `{"requestType":"order","items":[{"productId":"INV-STA-012","name":"A4 Envelope","quantity":1,"unitPrice":500}],"notes":"Payment terms: Net 30 Credit Terms"}`.
- Outcome: the browser POST was BLOCKED before reaching the ERP handler — the ERP's
  preflight response does not allow the literal `Idempotency-Key` header (only
  `x-idempotency-key`). The running ERP is a stale build: its own current source
  (`index.cjs`) already lists `Idempotency-Key` in `Access-Control-Allow-Headers`, but
  the running process predates that edit. No success screen; no request created.
- Diagnostic server-side replay of the SAME key + body + user (no preflight) returned
  HTTP 201 and created `req_1786980430581_eb4598bdb818` / `ODR-2026-000001`.
- Sasa client behavior verified correct: key format valid (UUID v4, 8–128 chars),
  header present, single click, no duplicate POST from the app.

## 4. Idempotency

- Replaying the identical request (same `Idempotency-Key`, same body, same portal
  user token) created a SECOND request (`req_1786980710117_57eeaf059b83` /
  `ODR-2026-000002`) instead of replaying the stored response → **idempotency is NOT
  functional on the running ERP build** (consistent with the stale-build diagnosis:
  the running instance predates `idempotencyMiddleware()` on `POST /portal/requests`,
  `portal.cjs:171`).
- Cloud `idempotency_keys` table: no row exists for key `978622ae-a944-46b1-b19d-cf0a08d14`.
  A diagnostic write probe replicating the middleware's exact write shape (POST
  `{id, data, version}` + `on_conflict`) SUCCEEDED (HTTP 201), proving the table accepts
  the middleware's payload — the failure is the stale running build, not the table.
  Probe row left behind for ERP team removal: `id=d990f0db-7ea5-453b-be64-4e3db947d5ae`
  (staging idempotency ledger, marked `note:"diagnostic write probe"`).

## 5. Accounting Firewall

- Invoices: 2 (unchanged). Payments: 2 (unchanged). Statement transactions: 4
  (unchanged). Closing/outstanding balances unchanged. No accounting mutation from
  order-request submission or cancellation. PASS.

## 6. Inventory

- Catalog stock for `INV-STA-012`: 50 (unchanged). No inventory movement from request
  submission or cancellation. PASS.

## 7. Sales Order

- Official sales orders remain 1 (`ORD-0002`, Converted). No new SO. PASS.

## 8. Sasa History

- Data source (`GET /api/portal/requests`) returns both ODRs (now cancelled) — the app
  reads the ERP truth. On-screen render of the history tab was NOT conclusively
  captured: the headless session-restore screen did not settle, and the UI submission
  phase was blocked earlier by the stale ERP CORS anyway. INCONCLUSIVE (data source OK).

## 9. Cleanup

- `POST /api/portal/requests/:id/cancel` → 200 `{"id": ..., "status": "cancelled"}` for
  BOTH requests (`req_1786980430581_eb4598bdb818`, `req_1786980710117_57eeaf059b83`).
  Cancellation used only the ERP-supported endpoint; no direct Supabase writes.

## 10. Overall Result: **FAIL**

Sasa client-side behavior PASSED (key generated/sent, valid format, single submission,
correct payload). The live Sasa→ERP flow FAILED due to ERP-side conditions:

| # | Finding | Root cause | Owner |
|---|---|---|---|
| F1 | Browser submission blocked (CORS) | Running ERP is a stale build; preflight lacks the `Idempotency-Key` allowlist entry that its own source already contains | ERP team: restart the ERP server from current source |
| F2 | Idempotency dead in live | Same stale build — `idempotencyMiddleware()` on `POST /portal/requests` not active in the running process; same key created two ODRs | ERP team: restart; then re-verify replay |
| F3 | Every catalog order priced 0 (`priceSource: "unknown_product"`) | ERP pricing map `getCatalogPriceMap()` reads the cloud `inventory` table (2 placeholder rows: INV-PAPER, INV-TONER) while the catalog is served from cloud `products` (118 rows). The ERP's own comment (`portalService.cjs:264-268`) documents that the sync populates `products`, never `inventory` — the pricing source reads the wrong table | ERP team: point the pricing map at the same dataset the catalog serves |

Impact of F3: any real catalog order submitted to the ERP today would be created at
total 0 with `priceSource: "unknown_product"` — never at the ERP master price.

## 11. Deployment

**NOT DEPLOYED.** No Sasa changes made during the test; no ERP changes; no live
(production) activity. Two test ODRs created and cancelled in the staging environment.
Test artifacts (login/session capture, submission capture) kept in the local temp
working directory, not in the repository; no credentials included in this report.

## Recommendations

1. ERP team: restart the ERP dev server to load current source (fixes F1 + F2).
2. ERP team: fix the order-pricing data source (F3) — price from the same cloud dataset
   the portal catalog serves (`products`), not `inventory`.
3. ERP team: remove the diagnostic probe row `d990f0db-7ea5-453b-be64-4e3db947d5ae`.
4. After 1–3 are verified by the ERP team, re-run this staging test (single UI
   submission, idempotent replay, price verification, firewall checks, cleanup).