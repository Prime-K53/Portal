/**
 * Official document download helpers (run: npx tsx tests/officialDocument.test.ts).
 * Pure-logic coverage: path building, Content-Disposition filename handling,
 * and error classification — the browser blob flow is exercised in staging.
 */
import {
  findPaymentForStatementEntry,
  mapFetchError,
  officialDocumentPath,
  parseContentDispositionFilename,
  resolveStatementPeriod,
  statementDocumentPath,
} from '../src/features/customer-portal/utils/officialDocument.ts';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

// Paths map to the ERP portal contract; ids are URL-encoded.
check('invoice path', officialDocumentPath('invoice', 'inv_1'), '/portal/invoices/inv_1/document');
check('quotation path', officialDocumentPath('quotation', 'qtr/x'), '/portal/quotations/qtr%2Fx/document');
check('order path', officialDocumentPath('order', 'so_9'), '/portal/orders/so_9/document');
check('receipt path', officialDocumentPath('receipt', 'pay_7'), '/portal/payments/pay_7/document');
check('delivery-note path', officialDocumentPath('delivery-note', 'dn#1'), '/portal/deliveries/dn%231/document');
check('statement path', officialDocumentPath('statement', 'ignored'), '/portal/customers/statement/document');
check('unknown kind throws', (() => { try { return (officialDocumentPath as any)('nope', 'x'); } catch { return 'throws'; } })(), 'throws');

// Statement period resolution (YYYY-MM-DD; 'all' defers to the ERP default).
const today = new Date(Date.UTC(2026, 7, 23)); // Aug 23 2026
check('period all → ERP default', resolveStatementPeriod('all', { today }), {});
check(
  'period 30days',
  resolveStatementPeriod('30days', { today }),
  { from: '2026-07-24', to: '2026-08-23' }
);
check(
  'period this_month',
  resolveStatementPeriod('this_month', { today }),
  { from: '2026-08-01', to: '2026-08-23' }
);
check(
  'period custom',
  resolveStatementPeriod('custom', { startDate: '2026-01-01', endDate: '2026-01-31', today }),
  { from: '2026-01-01', to: '2026-01-31' }
);
check('statement path with params', statementDocumentPath({ from: '2026-01-01', to: '2026-01-31' }), '/portal/customers/statement/document?from=2026-01-01&to=2026-01-31');
check('statement path default window', statementDocumentPath({}), '/portal/customers/statement/document');

// Network failure → friendly message (never a stack trace).
const netErr = mapFetchError(new TypeError('Failed to fetch'));
check('fetch error message', netErr.message, 'Unable to reach the ERP. Check your connection and try again.');

// Ledger row → ERP payment resolution (official receipt download).
const PAYMENTS = [
  { id: 'cp_1', paymentNumber: 'PAY-1001', referenceCode: 'PAY-1001', date: '2026-08-01', amount: 250000 },
  { id: 'cp_2', paymentNumber: 'PAYREF-77', referenceCode: 'PAYREF-77', date: '2026-08-10', amount: 90000 },
];
check(
  'matcher by reference',
  findPaymentForStatementEntry({ reference: 'PAYREF-77', date: '2026-08-10', credit: 90000 }, PAYMENTS)?.id,
  'cp_2'
);
check(
  'matcher by payment id as reference',
  findPaymentForStatementEntry({ reference: 'cp_1', date: '', credit: 250000 }, PAYMENTS)?.id,
  'cp_1'
);
check(
  'matcher fallback date+amount',
  findPaymentForStatementEntry({ reference: 'Bank transfer received', date: '2026-08-01', credit: 250000 }, PAYMENTS)?.id,
  'cp_1'
);
check(
  'matcher no match → null (never guesses)',
  findPaymentForStatementEntry({ reference: 'Unknown ref', date: '2026-07-01', credit: 123 }, PAYMENTS),
  null
);

// ERP-provided filename wins.
check('plain disposition', parseContentDispositionFilename('attachment; filename="INV-A-001.pdf"', 'fallback.pdf'), 'INV-A-001.pdf');
check('quoted spaces', parseContentDispositionFilename('attachment; filename="Invoice 12.pdf"', 'f.pdf'), 'Invoice 12.pdf');
check('utf8 extended', parseContentDispositionFilename("attachment; filename*=UTF-8''INV%20%C3%A9.pdf", 'f.pdf'), 'INV é.pdf');
check('missing header → fallback', parseContentDispositionFilename(null, 'invoice-id.pdf'), 'invoice-id.pdf');
check('empty header → fallback', parseContentDispositionFilename('', 'invoice-id.pdf'), 'invoice-id.pdf');

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('All official-document helper checks passed');
