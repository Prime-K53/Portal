import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  cleanCustomerName,
  completionProgressRows,
  fieldRows,
  parseVerificationPath,
} from '../src/features/customer-portal/views/DocumentVerify';

describe('parseVerificationPath', () => {
  it('parses invoice verification path with encoded slash', () => {
    const result = parseVerificationPath('/verify/invoice/INV-P726%2F029?t=f393b887e143958bb9338c5cd4c5975444bcbc3a558e6a773f629d5384140188');
    assert.strictEqual(result.type, 'invoice');
    assert.strictEqual(result.number, 'INV-P726/029');
    assert.strictEqual(result.token, 'f393b887e143958bb9338c5cd4c5975444bcbc3a558e6a773f629d5384140188');
  });

  it('parses receipt verification path', () => {
    const result = parseVerificationPath('/verify/receipt/PAY-001?t=abc123');
    assert.strictEqual(result.type, 'receipt');
    assert.strictEqual(result.number, 'PAY-001');
    assert.strictEqual(result.token, 'abc123');
  });

  it('parses quotation verification path', () => {
    const result = parseVerificationPath('/verify/quotation/QTN-001?t=abc123');
    assert.strictEqual(result.type, 'quotation');
    assert.strictEqual(result.number, 'QTN-001');
    assert.strictEqual(result.token, 'abc123');
  });

  it('parses sales-order verification path', () => {
    const result = parseVerificationPath('/verify/sales-order/SO-001?t=abc123');
    assert.strictEqual(result.type, 'sales_order');
    assert.strictEqual(result.number, 'SO-001');
    assert.strictEqual(result.token, 'abc123');
  });

  it('parses purchase-order verification path', () => {
    const result = parseVerificationPath('/verify/purchase-order/PO-001?t=abc123');
    assert.strictEqual(result.type, 'purchase_order');
    assert.strictEqual(result.number, 'PO-001');
    assert.strictEqual(result.token, 'abc123');
  });

  it('parses delivery-note verification path', () => {
    const result = parseVerificationPath('/verify/delivery-note/DN-001?t=abc123');
    assert.strictEqual(result.type, 'delivery_note');
    assert.strictEqual(result.number, 'DN-001');
    assert.strictEqual(result.token, 'abc123');
  });

  it('parses supplier-payment verification path', () => {
    const result = parseVerificationPath('/verify/supplier-payment/SPAY-001?t=abc123');
    assert.strictEqual(result.type, 'supplier_payment');
    assert.strictEqual(result.number, 'SPAY-001');
    assert.strictEqual(result.token, 'abc123');
  });

  it('parses statement verification path', () => {
    const result = parseVerificationPath('/verify/statement/STMT-001?t=abc123');
    assert.strictEqual(result.type, 'statement');
    assert.strictEqual(result.number, 'STMT-001');
    assert.strictEqual(result.token, 'abc123');
  });

  it('parses printing contract completion receipt verification path', () => {
    const result = parseVerificationPath('/verify/printing-contract-completion-receipt/PCR-PC-P726%2F023?t=abc123');
    assert.strictEqual(result.type, 'printing_contract_completion_receipt');
    assert.strictEqual(result.number, 'PCR-PC-P726/023');
    assert.strictEqual(result.token, 'abc123');
  });

  it('returns null type for unknown slug', () => {
    const result = parseVerificationPath('/verify/unknown/XYZ-001?t=abc123');
    assert.strictEqual(result.type, null);
    assert.strictEqual(result.number, 'XYZ-001');
    assert.strictEqual(result.token, 'abc123');
  });

  it('handles missing token', () => {
    const result = parseVerificationPath('/verify/invoice/INV-001');
    assert.strictEqual(result.type, 'invoice');
    assert.strictEqual(result.number, 'INV-001');
    assert.strictEqual(result.token, '');
  });

  it('handles missing query string', () => {
    const result = parseVerificationPath('/verify/invoice/INV-001?t=');
    assert.strictEqual(result.type, 'invoice');
    assert.strictEqual(result.number, 'INV-001');
    assert.strictEqual(result.token, '');
  });
});

describe('cleanCustomerName', () => {
  it('removes a trailing customer number in parentheses', () => {
    assert.strictEqual(
      cleanCustomerName('Mtakataka CCAP School (CUST-0033)'),
      'Mtakataka CCAP School'
    );
  });

  it('removes the exact customerNumber supplied by the API', () => {
    assert.strictEqual(
      cleanCustomerName('Mtakataka Police Primary (CUST-0034)', 'CUST-0034'),
      'Mtakataka Police Primary'
    );
    assert.strictEqual(
      cleanCustomerName('CUST-0034 - Mtakataka Police Primary', 'CUST-0034'),
      'Mtakataka Police Primary'
    );
  });

  it('leaves ordinary customer names and parentheses untouched', () => {
    assert.strictEqual(cleanCustomerName('School (Main Campus)'), 'School (Main Campus)');
    assert.strictEqual(cleanCustomerName('Customer Care'), 'Customer Care');
  });
});

describe('fieldRows', () => {
  it('shows a printing contract customer name without the customer number', () => {
    const rows = fieldRows({
      verified: true,
      documentType: 'printing_contract',
      contractNumber: 'PC-P726/023',
      contractDate: '2026-10-19T00:00:00.000Z',
      companyName: 'Prime Printing Service',
      customerName: 'Mtakataka CCAP School (CUST-0033)',
      currency: 'MWK',
      prepaidTotal: 319200,
      totalAssessments: 4,
      status: 'ACTIVE',
    });

    const customer = rows.find(([label]) => label === 'Customer');
    assert.deepStrictEqual(customer, ['Customer', 'Mtakataka CCAP School']);
    assert.ok(!rows.some(([, value]) => value.includes('CUST-0033')));
  });

  it('formats the contract date and does not repeat contract-date aliases', () => {
    const rows = fieldRows({
      verified: true,
      documentType: 'printing_contract',
      contractNumber: 'PC-P726/023',
      contractDate: '2026-10-19T00:00:00.000Z',
      contract_date: '2026-10-19T00:00:00.000Z',
      customerName: 'Mtakataka CCAP School (CUST-0033)',
      status: 'ACTIVE',
    });

    const contractDates = rows.filter(([label]) => /^contract date$/i.test(label));
    assert.strictEqual(contractDates.length, 1);
    assert.strictEqual(contractDates[0][1], '2026-10-19');
  });
});

const completionReceipt = (overrides: Record<string, unknown> = {}) => ({
  verified: true,
  documentType: 'printing_contract_completion_receipt',
  verificationScope: 'contract',
  receiptNumber: 'PCR-PC-P726/023',
  contractNumber: 'PC-P726/023',
  contractDate: '2026-10-19T00:00:00.000Z',
  customerName: 'Mtakataka CCAP School (CUST-0033)',
  currency: 'MWK',
  prepaidTotal: 319200,
  totalAssessments: 4,
  completedToDate: 1,
  remainingAssessments: 3,
  status: 'ACTIVE',
  ...overrides,
});

const rowsByLabel = (rows: Array<[string, string]>) =>
  Object.fromEntries(rows.map(([label, value]) => [label, value]));

describe('printing contract completion receipt progress', () => {
  it('shows 1 / 4 and 3 remaining when one of four assessments is completed', () => {
    const rows = fieldRows(completionReceipt());
    const byLabel = rowsByLabel(rows);

    assert.strictEqual(byLabel['Completion Progress'], '1 / 4');
    assert.strictEqual(byLabel['Remaining Assessments'], '3');
  });

  it('shows 4 / 4 and 0 remaining when all four assessments are completed', () => {
    const rows = fieldRows(completionReceipt({
      completedToDate: 4,
      remainingAssessments: 0,
    }));
    const byLabel = rowsByLabel(rows);

    assert.strictEqual(byLabel['Completion Progress'], '4 / 4');
    assert.strictEqual(byLabel['Remaining Assessments'], '0');
  });

  it('shows 0 / 4 and 4 remaining when no assessments are completed', () => {
    const rows = fieldRows(completionReceipt({
      completedToDate: 0,
      remainingAssessments: 4,
    }));
    const byLabel = rowsByLabel(rows);

    assert.strictEqual(byLabel['Completion Progress'], '0 / 4');
    assert.strictEqual(byLabel['Remaining Assessments'], '4');
  });

  it('uses the authoritative assessment counts, never monetary fields', () => {
    const rows = fieldRows(completionReceipt({
      completedToDate: 1,
      totalAssessments: 4,
      prepaidTotal: 999999999,
      totalConsumedToDate: 123456,
      amountDebited: 79800,
      walletBalanceAfter: 5000,
    }));
    const byLabel = rowsByLabel(rows);

    assert.strictEqual(byLabel['Completion Progress'], '1 / 4');
    assert.strictEqual(byLabel['Remaining Assessments'], '3');
  });

  it('derives completed from remaining when only the remaining count is supplied', () => {
    const rows = fieldRows(completionReceipt({
      completedToDate: undefined,
      remainingAssessments: 3,
    }));
    const byLabel = rowsByLabel(rows);

    assert.strictEqual(byLabel['Completion Progress'], '1 / 4');
    assert.strictEqual(byLabel['Remaining Assessments'], '3');
  });

  it('handles a zero total safely and never renders NaN or Infinity', () => {
    const rows = fieldRows(completionReceipt({
      totalAssessments: 0,
      completedToDate: 0,
      remainingAssessments: 0,
    }));
    const byLabel = rowsByLabel(rows);

    assert.strictEqual(byLabel['Completion Progress'], '0 / 0');
    assert.strictEqual(byLabel['Remaining Assessments'], '0');
    assert.ok(rows.every(([, value]) => !/NaN|Infinity/i.test(value)));
  });

  it('does not invent progress when the total is missing', () => {
    const rows = fieldRows(completionReceipt({
      totalAssessments: undefined,
      completedToDate: 1,
      remainingAssessments: 3,
    }));
    const byLabel = rowsByLabel(rows);

    assert.strictEqual(byLabel['Completion Progress'], '—');
    assert.strictEqual(byLabel['Remaining Assessments'], '—');
    assert.ok(rows.every(([, value]) => !/NaN|Infinity/i.test(value)));
  });

  it('clamps an inconsistent completed count to the contractual total', () => {
    assert.deepStrictEqual(completionProgressRows({
      totalAssessments: 4,
      completedToDate: 9,
      remainingAssessments: 0,
    }), [
      ['Completion Progress', '4 / 4'],
      ['Remaining Assessments', '0'],
    ]);
  });

  it('does not display Prepaid Total or the raw count fields', () => {
    const rows = fieldRows(completionReceipt());
    const labels = rows.map(([label]) => label);

    assert.ok(!labels.includes('Prepaid Total'));
    assert.ok(!labels.includes('Total Assessments'));
    assert.ok(!labels.includes('Completed To Date'));
    assert.ok(!labels.some((label) => /^prepaid/i.test(label)));
    assert.strictEqual(labels.filter((label) => /completion progress/i.test(label)).length, 1);
    assert.strictEqual(labels.filter((label) => /remaining assessments/i.test(label)).length, 1);
  });

  it('leaves the ordinary printing contract prepaid total unchanged', () => {
    const rows = fieldRows({
      verified: true,
      documentType: 'printing_contract',
      contractNumber: 'PC-P726/023',
      contractDate: '2026-10-19T00:00:00.000Z',
      customerName: 'Mtakataka CCAP School (CUST-0033)',
      currency: 'MWK',
      prepaidTotal: 319200,
      totalAssessments: 4,
      status: 'ACTIVE',
    });
    const byLabel = rowsByLabel(rows);

    assert.strictEqual(byLabel['Prepaid Total'], 'MWK 319,200.00');
    assert.strictEqual(byLabel['Total Assessments'], '4');
    assert.ok(!('Completion Progress' in byLabel));
    assert.ok(!('Remaining Assessments' in byLabel));
  });

  it('leaves an ordinary invoice verification response unchanged', () => {
    const rows = fieldRows({
      verified: true,
      documentType: 'invoice',
      invoiceNumber: 'INV-P726/029',
      invoiceDate: '2026-10-19T00:00:00.000Z',
      customerName: 'Mtakataka CCAP School (CUST-0033)',
      currency: 'MWK',
      subtotal: 100000,
      tax: 0,
      total: 100000,
      amountPaid: 50000,
      balanceDue: 50000,
      status: 'UNPAID',
    });
    const labels = rows.map(([label]) => label);

    assert.ok(labels.includes('Total'));
    assert.ok(labels.includes('Amount Paid'));
    assert.ok(labels.includes('Balance Due'));
    assert.ok(!labels.includes('Completion Progress'));
    assert.ok(!labels.includes('Remaining Assessments'));
  });
});
