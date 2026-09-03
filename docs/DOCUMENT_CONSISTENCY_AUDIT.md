# Prime Portal ↔ PrimeERP Document Consistency Audit

## Status

Portal-side statement duplication has been removed. The remaining release blocker is
in the ERP document renderer: the live company settings endpoint returns `Prime
Printing Service`, while the live Account Statement PDF still renders the obsolete
company identity. The live consistency test in
`acceptance/official-document-consistency.test.mjs` detects this mismatch.

The task must not be accepted as complete until the ERP renderer is fixed and that
test passes against the target environment.

## End-to-end flow

```text
Authenticated portal customer JWT
  → GET /api/portal/customers/statement/document?from=…&to=…
  → ERP resolves customer_id from the JWT (no browser-supplied customer ID)
  → ERP statement/document renderer
  → application/pdf bytes + ERP Content-Disposition filename
  → one Portal Blob/Object URL
  → the same bytes are used for preview, download, and print
```

The Portal does not store ERP service credentials and does not send a customer ID in
the statement URL. If the ERP PDF cannot be loaded, the statement modal shows an
explicit error. It does not render a local statement or substitute local company
settings.

## Root causes

### Account Statement mismatch

`StatementPrintModal.tsx` was an independent Portal document implementation. It:

- summed debit and credit entries in the browser;
- selected the last Portal ledger row as the current balance;
- created a Portal-specific company/customer banner, transaction table, and footer;
- printed that HTML with `window.print()`;
- downloaded a different document from the ERP PDF endpoint.

Preview, print, and download therefore had different sources. The modal now contains
only an iframe for the ERP PDF and actions over the exact blob loaded into that
iframe.

The interactive Account Ledger screen still presents ERP transaction JSON for
navigation and CSV export. It is not used to generate the official Account Statement.

### Company identity mismatch

The source-wide Portal audit found no `Prime Printing & Stationery` literal in
`src/`. The obsolete identity is present in the PDF returned by the live ERP endpoint.
A decompressed PDF content-stream audit found the company heading while
`GET /api/portal/support/company-info` returned `Prime Printing Service` in the same
authenticated session.

This proves the live document renderer is not resolving its company heading from the
same authoritative settings source. Replacing Portal text cannot fix that backend
renderer defect.

Two unrelated Portal UI strings used the plural `Prime Printing Services`; these were
removed rather than replaced with another local company-name default.

## ERP accounting contract observed by the Portal

The existing verified integration contract identifies
`backend/services/portalService.cjs:getStatements` as the source of:

- `opening_balance`;
- `closing_balance`;
- `outstanding_balance`;
- `credit_limit`;
- invoice, credit-note, and payment transactions;
- debit, credit, and running-balance values.

`GET /api/portal/statements?startDate&endDate` filters that server ledger and
recomputes opening/closing balances. The official Portal document does not recalculate
those fields. Its period is sent as `from`/`to` to the authenticated ERP document
endpoint.

The ERP source root was not exposed to this agent's file tools during this change, so
the internal renderer/configuration function names cannot be asserted here. They must
be recorded when the ERP renderer defect is fixed.

## Document inventory

| Document | Data source | Company configuration | Renderer | Footer/security source | Portal status |
|---|---|---|---|---|---|
| Account Statement | ERP customer ledger, customer scoped by JWT | Must be ERP company settings | `GET /portal/customers/statement/document` | ERP renderer | Portal preview/download/print now reuse one PDF blob; live ERP branding mismatch remains |
| Invoice | ERP invoice by customer-owned ID | ERP document service | `GET /portal/invoices/:id/document` | ERP renderer | Download uses ERP PDF; invoice Print now uses the same preloaded ERP PDF blob |
| Quotation | ERP quotation by customer-owned ID | ERP document service | `GET /portal/quotations/:id/document` | ERP renderer | Download uses ERP PDF |
| Payment Receipt | ERP recorded payment by customer-owned ID | ERP document service | `GET /portal/payments/:id/document` | ERP renderer | Download from a matched ledger payment uses ERP PDF |
| Order / Order Acceptance | ERP order by customer-owned ID | ERP document service | `GET /portal/orders/:id/document` | ERP renderer | Route is mapped; current order detail UI exposes no document action |
| Delivery Note | ERP delivery/order ownership resolution | ERP document service | `GET /portal/deliveries/:id/document` | ERP renderer | Download uses ERP PDF; missing notes return an explicit 404 |
| Credit Note | ERP statement/invoice data | Not locally configured | No standalone Portal document action | None in Portal | No Portal generator found |
| Debit Note | ERP data | Not locally configured | No standalone Portal document action | None in Portal | No Portal generator found |
| Purchase documents | ERP data | Not locally configured | No customer Portal document action | None in Portal | No Portal generator found |

## Company configuration and fallback behavior

- Authenticated Portal contact information comes from
  `GET /api/portal/support/company-info`.
- Official document branding, logo, contact information, terms, footer, security
  notice, QR code, and signatures are not generated or cached by the Portal. They must
  come from the ERP renderer.
- No document path reads company settings from `localStorage`.
- No document path has a default company name.
- An ERP/settings/renderer failure is shown explicitly; no stale identity is silently
  substituted.

## Validation

Run:

```sh
npx tsx tests/officialDocument.test.ts
node acceptance/official-document-consistency.test.mjs
npm run build
npm run lint
```

The live consistency test is read-only. It checks customer scoping, company identity,
company phone/email, statement JSON presence, PDF content, ERP filename ownership,
and byte identity between repeated Portal endpoint downloads. It currently fails on
the live ERP branding mismatch by design and becomes the release gate for the backend
fix.
