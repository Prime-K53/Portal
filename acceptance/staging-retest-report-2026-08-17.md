# Staging Retest Report — Sasa → ERP Orders

**Test**: FINAL Controlled Staging Retest — Sasa → ERP Orders
**Date**: 2026-08-17 (evening UTC+2)
**Result**: **FAIL**
**Deployment**: NOT DEPLOYED
**Code Changes**: NO CODE CHANGES DURING RETEST
**Test signature**: one logical order request via the real Sasa UI; ERP verification; idempotency replay; accounting/inventory/SO firewalls; Sasa refresh; ERP-supported cleanup.

---

## 1. Environment

- Same staging environment as the previous staging test (no deployment, no restarts by the tester).
- ERP: `http://127.0.0.1:3000` — process PID 13980, `node index.cjs`, started 2026-08-17 18:44 local (restarted by the ERP team).
- Sasa (Prime PORTAL): `http://127.0.0.1:3001` (existing local dev server, unchanged).
- Supabase (staging cloud): `https://rdtuzuzehfbwvfdzqliw.supabase.co` — confirmed identical to the ERP process's configured URL from its startup log (`[cloudSyncStore] STARTUP: Cloud sync configured OK. URL=https://rdtuzuzehfbwvfdzqliw.supabase.co`) and to `backend/.env`.
- Sasa env config verified: `VITE_API_URL=http://127.0.0.1:3000`, `VITE_USE_REAL_BACKEND=true`, `VITE_ENABLE_MOCK_API=false`, `VITE_ENABLE_MOCK_AUTH=false`.
- Preflight check: `Access-Control-Allow-Headers` on the ERP now includes the literal `Idempotency-Key` (CORS fix from the previous report is live).
- Customer: `CUST-0001` / Acme LTD. Portal user: `pusr_1786163215519_42643d6f3be1`.
- ERP process was observed to intermittently fail Supabase reads (`server-err.log`: `portal_sessions read failed (timeout of 10000ms exceeded)`, `shipments read failed (401) PGRST303 "JWT issued at future"`). No tester action taken (no restart allowed).

## 2. Baseline (captured read-only before submission)

- Requests: **2** (both cancelled from the previous staging test) — `req_1786980430581_eb4598bdb818` / ODR-2026-000001, `req_1786980710117_57eeaf059b83` / ODR-2026-000002.
- Official Sales Orders: **1** — `ORD-0002` (Converted).
- Invoices: **2** (INV-0001, INV-0024 — Partial). Payments: **2** (PAY-0001 3000, PAY-0010 10000).
- Statement: **4** transactions; closing balance **11900**; outstanding **11900**; credit limit 0.
- Catalog: **97** products; `INV-STA-012` "A4 Envelope" price **500**, stock **50**.
- Dashboard: balance **26000**, `activeRequestCount` **0**.

## 3. Submission

- Product: `INV-STA-012` "A4 Envelope" (catalog price 500), quantity **1**.
- Flow: Orders tab → `SKU: INV-STA-012` card → **Add to Cart** → **View Cart & Checkout** → **Submit Order Request** — clicked **once**.
- Captured: `POST /api/portal/requests` with `Idempotency-Key: 9e508d75-bf88-4e05-b341-e52fda0caf0a` → **HTTP 201** (no CORS block).
- ERP response: `id req_1786992034695_96d4d8f9fc5a`, `requestNumber ODR-2026-000003`, status `submitted`; item `INV-STA-012` qty 1, `unitPrice 500`, `originalUnitPrice 500`, `netUnitPrice 500`, `lineTotal 500`, `promotionId null`, **`priceSource "master"`** (pricing fix live: prices now come from `products`, not the empty cloud `inventory`); subtotal **500**, discountTotal **0**, total **500**, `promotionApplied false`.
- Success screen rendered: "Order Request Submitted" panel with Request `ODR-2026-000003`, Request ID, Status, Items count 1, Subtotal K 500.00, Promotion, Total K 500.00 (CartDrawer success panel renders the ERP POST response, verified in source + captured response).
- ERP read-back: `GET /api/portal/requests/req_1786992034695_96d4d8f9fc5a` → 200, customer `CUST-0001`, created_by `pusr_1786163215519_42643d6f3be1`, status `submitted`, subtotal/total 500. List count after submission: **3**.
- **PASS** — exactly one new ODR created by the UI submission.

## 4. Idempotency — **FAIL**

- Replay performed **once** with the **identical** key (`9e508d75-bf88-4e05-b341-e52fda0caf0a`), body, and user: `POST /api/portal/requests` → **HTTP 201 with a NEW request** `req_1786992112733_a66e7eab80e8` / **ODR-2026-000004** (submitted, total 500). List count after replay: **4**.
- This triggers the retest failure condition: **more than one ODR was created**.
- Root cause (read-only evidence, no repair performed): the middleware's idempotency row is stored **double-wrapped** in the cloud `idempotency_keys` table:
  - Row `a11e8f83-2354-45cd-9a24-9d02e32cd690` (created 18:39:44Z, updated 18:41:51Z) contains `data = { id, data: { key: "9e508d75-…", path: "/api/portal/requests", method: "POST", user_id: "pusr_…", expires_at } }` — i.e. the key lives at **`data.data.key`** (nested), while the middleware lookup filters `data->>key` at the **top level** → the lookup never matches, every POST is treated as new, and every POST inserts a fresh row (a second row `5774d6e2-d2f0-457e-bc43-34b2d770fb90` exists for the same key, created 18:38:26Z).
  - ERP `server-out.log` confirms the middleware ran: `[SYNC-FORENSIC] STAGE-13 cloudSyncStore.upsertRow() { table: 'idempotency_keys', id: 'a11e8f83-…', incomingVersion: NaN, hasDomain: true }`; no `[SupabaseRepo] idempotency_keys upsert failed` warning appears in `server-err.log`, so the write path executed without an axios-level failure — the middleware passes its `{ id, data: {...} }` envelope to `supabaseRepository.upsert → cloudSyncStore.upsertRow`, which stores the envelope verbatim (double-wrap), while other callers were migrated to raw domain objects. The ERP's internal 9/9 hermetic verification suite does not exercise the live cloud write path and did not catch this.
- **Conclusion**: the idempotency defect from the previous test (F2) is **still present in the live environment**; CORS (F1) and pricing (F3) fixes are live, but idempotency replay is not.

## 5. Accounting Firewall — **PASS**

After submission and after cleanup, accounting surfaces identical to baseline:
- Invoices **2**, Payments **2**, Statement **4** transactions, closing **11900**, outstanding **11900**.

## 6. Inventory — **PASS**

- Catalog count **97**; `INV-STA-012` price **500**, stock **50** — unchanged. No stock decrement on request submission.

## 7. Sales Order — **PASS**

- Official SOs: **1** — `ORD-0002` (Converted). No sales order was created by the portal request.

## 8. Refresh — **PARTIAL**

- UI submission round-trip verified end-to-end (catalog → cart → submit → success panel with ODR-2026-000003).
- Post-submission re-entry into Sasa to visually confirm the history row could not be conclusively captured: the app's "Restoring your session..." screen hung repeatedly (ERP Supabase reads intermittently time out — see §1), and the ERP login endpoint rate-limiter returned 429 (`retryAfter: 30`) briefly blocking a fresh login. The history list is driven by `GET /api/portal/requests`, which was verified via API to return the new request with status `submitted`.
- Pre-existing cosmetic gap (unchanged — no source changes during retest): ERP list endpoints return `request_number` (snake_case) while Sasa's `mapRequestToOrderRequest` reads only `requestNumber`, so the history row renders the fallback label `"Request"` instead of the ODR number (`OrdersTab.tsx:906`). The submission success panel shows the ODR number because the POST response is camelCase.

## 9. Cleanup

- Both retest ODRs cancelled via the **ERP-supported endpoint** `POST /api/portal/requests/:id/cancel` (200, `status: cancelled`):
  - ODR-2026-000003 (`req_1786992034695_96d4d8f9fc5a`) — the intended test ODR.
  - ODR-2026-000004 (`req_1786992112733_a66e7eab80e8`) — the duplicate created by the failed replay.
- Final request list: **4**, all `cancelled` (000001, 000002 from the previous test; 000003, 000004 from this retest). No manual deletes, no direct Supabase writes, no source changes.
- Post-cleanup verification: invoices **2**, payments **2**, statement **4** tx / closing **11900**, SOs **1**, catalog **97**, INV-STA-012 price **500** stock **50** — all identical to baseline.

## 10. Overall Result — **FAIL**

- Failure conditions met:
  1. **More than one ODR was created** (ODR-2026-000003 + ODR-2026-000004) — the idempotency replay created a duplicate instead of replaying.
  2. **Idempotency-Key middleware still not functional live** — rows are stored double-wrapped (`data.data.key`) so lookups never match; defect persists from the previous test (F2) despite CORS (F1) and pricing (F3) being live.
- Passed elements: CORS `Idempotency-Key` allowance; real-endpoint submission; pricing from `products` (`priceSource: "master"`); accounting/inventory/SO firewalls (no mutations); ERP-supported cancellation.
- Remaining ERP-side action items: fix the idempotency row write (stop double-wrapping `data`), add a live (non-hermetic) idempotency check to the ERP verification suite, and remove the two test rows in cloud `idempotency_keys` (`a11e8f83-2354-45cd-9a24-9d02e32cd690`, `5774d6e2-d2f0-457e-bc43-34b2d770fb90` — key `9e508d75-…`) plus the previously disclosed diagnostic probe row `d990f0db-7ea5-453b-be64-4e3db947d5ae` if still present.

## 11. Deployment — **NOT DEPLOYED**

No build, no deploy, no restart of Sasa or ERP performed during this retest.

## 12. Code Changes — **NO CODE CHANGES DURING RETEST**

No files in `D:\FonePaw\PrimePORTAL` or the ERP were modified during the retest. Verification was read-only: ERP GET endpoints, the Sasa UI in a headless browser, and staging Supabase REST (SELECT only, using the ERP's own `backend/.env` credentials). The `idempotency_keys` rows above are the ERP middleware's own writes from the test POSTs, not tester inserts.

---

*Report generated by the staging retest run on 2026-08-17. Test stopped after reporting the failure per the retest rules — no Referrals initiated, no further order requests created.*