# SASA — FIX INVOICE DETAIL ITEM BREAKDOWN

## CONTEXT

The Sasa customer portal is successfully integrated with the real Prime ERP API.

The previous data-display audit is complete.

Do NOT redo the completed fixes.

The following are already working:

- Authentication
- ERP ↔ Sasa API connection
- Invoice list
- Invoice totals
- Invoice status
- Quotation list
- Quotation line items
- Quotation totals
- Shipment list
- Order empty state
- Dashboard
- Build/lint/type checking

The quotation item pipeline is confirmed working perfectly.

The ONLY remaining issue in this task is:

> Invoice Detail → Invoice Item Breakdown is not displaying the invoice line items.

---

# VERIFIED CURRENT RESULT

Authenticated customer:

CUST-0001 / Acme LTD

Invoice list currently correctly displays:

INV-0024 — K21,000 — Partial
INV-0001 — K3,900 — Partial

Invoice detail for INV-0001 contains correct invoice-level data.

However:

## Invoice Item Breakdown

The line-item section is still empty/missing.

Quotation line items work correctly.

Therefore DO NOT assume the ERP database is missing invoice items.

The previous investigation already established that invoice detail data exists.

---

# IMPORTANT EXISTING FINDING

The previous agent reported:

> Invoice detail: INV-0001 full data with line items

but also noted:

> its stored materialTotal is genuinely 0 in Supabase — ERP data, not a mapping bug

This means:

- Do NOT "fix" materialTotal by inventing a value.
- Do NOT change the database value merely to make the UI look correct.
- Do NOT alter invoice totals.
- Do NOT modify Supabase schema.
- Do NOT create a migration.

The current issue is specifically that the invoice line items are not being rendered in Sasa.

---

# OBJECTIVE

Trace one real invoice through the complete pipeline:

ERP API
↓
Sasa portalService
↓
invoice mapper
↓
ErpInvoice type
↓
invoice detail state/props
↓
Invoice Detail component
↓
Invoice Item Breakdown UI

Find exactly where the line items disappear.

Fix the smallest possible layer.

---

# FIRST TEST WITH REAL DATA

Use:

INV-0001

for:

CUST-0001

Inspect the actual authenticated response returned by the ERP invoice detail endpoint.

Do NOT use mockPortalService.

Do NOT fabricate test invoice items.

Do NOT manually hardcode INV-0001 items.

---

# INSPECT THE ERP RESPONSE

Determine the exact shape of the invoice detail response.

Pay particular attention to:

- items
- lineItems
- invoiceItems
- material_items
- materialItems
- item_name
- itemName
- description
- quantity
- qty
- unit_price
- unitPrice
- price
- line_total
- lineTotal
- lineTotalNet
- materialTotal

Do not assume the property name.

Print/inspect the structure during local debugging if necessary, but NEVER print:

- passwords
- JWTs
- refresh tokens
- service-role keys
- secrets

---

# COMPARE WITH QUOTATION IMPLEMENTATION

Quotation line items are already displaying correctly.

Use the quotation implementation as a reference.

Compare:

Quotation API response
→ mapQuotation()
→ quotation item type
→ quotation detail component

against:

Invoice API response
→ mapInvoice()
→ invoice item type
→ invoice detail component

Identify the exact difference.

Do NOT copy quotation logic blindly.

Adapt it to the actual ERP invoice contract.

---

# INSPECT THESE FILES FIRST

Start with:

src/features/customer-portal/services/portalService.ts

src/features/customer-portal/types.ts

Then locate the exact component used to render invoice details and the "Invoice Item Breakdown" section.

Search the repository for:

"Invoice Item Breakdown"

and also:

"lineItems"
"items"
"invoice.items"
"item_name"

Determine whether the component expects a different property from the mapper.

---

# SPECIFIC THINGS TO CHECK

## 1. Invoice mapper

Inspect mapInvoice().

Confirm that the mapper preserves the complete item array.

If ERP returns something like:

items: [...]

but mapInvoice() produces:

items: []

then fix the mapper.

Do NOT remove valid fallback handling that was already added.

---

## 2. Invoice item property names

Confirm whether the invoice items use:

item_name

or:

itemName

or:

description

or another real ERP property.

Map the actual ERP contract into a stable Sasa representation.

For example, conceptually:

ERP item
→ Sasa item.name
→ UI item name

But only implement property names actually confirmed from the real response/code.

---

## 3. Invoice detail endpoint vs invoice list endpoint

This is VERY IMPORTANT.

Determine whether:

GET /portal/invoices

and:

GET /portal/invoices/:id

return different item structures.

Do not assume the list response contains the same fields as the detail response.

If the list response intentionally omits line items but the detail response includes them, the detail mapper must preserve the detail items.

---

## 4. Detail component

Confirm the invoice detail component is actually receiving:

invoice.items

and not another property such as:

invoice.lineItems

or:

invoice.materials

If the mapper produces:

items

but the UI renders:

lineItems

that is the bug.

Fix the contract consistently.

---

## 5. Conditional rendering

Check whether the UI contains logic such as:

if (!invoice.items?.length) return null

or:

invoice.items.length === 0

or:

invoice.lineItems?.length

Make sure valid real items reach the renderer.

Do not remove legitimate empty-state handling.

---

# EXPECTED RESULT

For INV-0001, if the ERP API returns real line items, the Sasa invoice detail page must display an item breakdown containing the real:

- Item/description
- Quantity
- Unit price
- Line total

Use the actual ERP values.

Do not calculate or invent values unless the existing ERP contract explicitly requires the frontend to calculate them.

---

# MATERIAL TOTAL WARNING

The existing investigation found that INV-0001 has:

materialTotal = 0

in the underlying ERP/Supabase data.

Do NOT change this value.

Do NOT recalculate materialTotal merely to make the UI look better.

The goal of this task is:

DISPLAY THE EXISTING INVOICE LINE ITEMS.

It is NOT to alter invoice accounting data.

If the invoice line totals legitimately add up differently from materialTotal, report that separately after fixing the display.

---

# DO NOT TOUCH

Do NOT modify:

- Supabase schema
- Supabase migrations
- migration 0005
- migration 0006
- migration 0007
- create migration 0008
- customer records
- invoice records
- quotation records
- ERP authentication
- refresh token logic
- SSE
- VITE_API_URL
- VITE_USE_REAL_BACKEND
- mock data
- unrelated modules

Do not make unrelated UI redesigns.

---

# VERIFICATION

After fixing:

Run:

npx tsc --noEmit

npm run lint

npm run build

Restart only the necessary local development process if required.

Then authenticate again if the backend was restarted with the ephemeral JWT secret.

Open:

Invoices
→ INV-0001
→ Invoice Detail

Verify:

### Invoice header
- Invoice number correct
- Status correct
- Issue date correct
- Due date correct
- Total correct

### Invoice Item Breakdown
- Items appear
- Item names/descriptions appear
- Quantities appear
- Unit prices appear
- Line totals appear

### Important
Do not change the known materialTotal=0 value just to make the breakdown appear.

---

# REGRESSION CHECK

After the fix, verify that:

- Invoice list still works
- Quotations still work
- Quotation line items still work
- Shipments still work
- Orders still show honest empty state
- Dashboard still works
- Authentication still works

---

# FINAL REPORT

Report:

## Root cause

Exactly why invoice items were not appearing.

## Actual ERP response

Describe the real invoice item structure discovered.

## Mapping

Describe how the ERP item structure is mapped into Sasa.

## UI

Identify the invoice detail component and explain what was changed.

## Files changed

List every changed file.

## Verification

Report:

npx tsc --noEmit → PASS/FAIL

npm run lint → PASS/FAIL

npm run build → PASS/FAIL

Invoice list → PASS/FAIL

Invoice detail → PASS/FAIL

Invoice item breakdown → PASS/FAIL

Quotation line items → PASS/FAIL

Shipments → PASS/FAIL

No mock data → PASS/FAIL

No Supabase changes → PASS/FAIL

No migrations → PASS/FAIL

## IMPORTANT

If the ERP detail endpoint does NOT actually return invoice items, stop and report that fact.

Do not fabricate invoice items.

Do not modify the database.

Do not create a migration.

Do not solve a backend data problem by hardcoding values in Sasa.

The objective is to identify the exact missing link in:

ERP invoice data → Sasa mapper → Sasa invoice model → Invoice Detail UI

and fix only that link.