import { inflateSync } from 'node:zlib';

const ORIGIN = process.env.ERP_ORIGIN || 'https://primeerpsystem.onrender.com';
const API = `${ORIGIN.replace(/\/+$/, '')}/api/portal`;
const CUSTOMER_ID = process.env.ERP_TEST_CUSTOMER_ID || 'CUST-0001';
const CUSTOMER_NAME = process.env.ERP_TEST_CUSTOMER_NAME || 'Acme LTD';
const FROM = process.env.ERP_STATEMENT_FROM || '2025-09-01';
const TO = process.env.ERP_STATEMENT_TO || '2026-09-01';

let failures = 0;
function check(label, condition, detail = '') {
  const passed = Boolean(condition);
  if (!passed) failures += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

function compact(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9.-]+/g, '');
}

/** Extracts standard hex-encoded text operands from Flate PDF content streams. */
function extractPdfText(pdf) {
  const source = pdf.toString('latin1');
  const chunks = [];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let streamMatch;

  while ((streamMatch = streamPattern.exec(source))) {
    let stream;
    try {
      stream = inflateSync(Buffer.from(streamMatch[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    }

    const textBlockPattern = /BT([\s\S]*?)ET/g;
    let textBlock;
    while ((textBlock = textBlockPattern.exec(stream))) {
      const hexPattern = /<([0-9a-f]+)>/gi;
      let operand;
      while ((operand = hexPattern.exec(textBlock[1]))) {
        chunks.push(Buffer.from(operand[1], 'hex').toString('utf8'));
      }
      chunks.push('\n');
    }
  }

  return chunks.join(' ');
}

async function readJson(path, token) {
  const response = await fetch(`${API}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function fetchPdf(path, token) {
  const response = await fetch(`${ORIGIN.replace(/\/+$/, '')}/api${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  check(`${path} returns HTTP 200`, response.status === 200, `status=${response.status}`);
  check(`${path} returns application/pdf`, response.headers.get('content-type')?.includes('application/pdf'));
  check(`${path} returns non-empty bytes`, bytes.length > 0, `bytes=${bytes.length}`);
  return {
    bytes,
    filename: response.headers.get('content-disposition') || '',
  };
}

async function main() {
  const loginResponse = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_id: CUSTOMER_ID, full_name: CUSTOMER_NAME }),
  });
  const login = await loginResponse.json();
  if (!loginResponse.ok || !login.access_token) {
    throw new Error(`ERP test login failed: ${loginResponse.status}`);
  }
  const token = login.access_token;

  const [profile, company, statement] = await Promise.all([
    readJson('/profile', token),
    readJson('/support/company-info', token),
    readJson(`/statements?startDate=${encodeURIComponent(FROM)}&endDate=${encodeURIComponent(TO)}`, token),
  ]);

  check('Authenticated customer is server-scoped', profile.id === CUSTOMER_ID, `customer=${profile.id}`);
  check('ERP company settings have a non-empty company name', Boolean(company.companyName), `name=${company.companyName}`);
  check('Statement JSON has authoritative opening balance', typeof statement.opening_balance === 'number');
  check('Statement JSON has authoritative closing balance', typeof statement.closing_balance === 'number');
  check('Statement JSON has authoritative transactions', Array.isArray(statement.transactions));

  // This is the exact path built by statementDocumentPath() for the same period.
  const portalPath = `/portal/customers/statement/document?from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`;
  const erpPdf = await fetchPdf(portalPath, token);
  const portalPdf = await fetchPdf(portalPath, token);
  const erpText = extractPdfText(erpPdf.bytes);
  const portalText = extractPdfText(portalPdf.bytes);
  check(
    'Portal document content equals ERP endpoint content',
    compact(portalText) === compact(erpText)
  );
  check('ERP controls the download filename', /filename=/i.test(erpPdf.filename), erpPdf.filename);

  const pdfText = erpText;
  const normalizedPdf = compact(pdfText);
  const expectedCompanyName = compact(company.companyName);
  const obsoleteCompanyName = compact(['Prime Printing', ' & ', 'Stationery'].join(''));

  check(
    'PDF company name matches authoritative ERP settings',
    normalizedPdf.includes(expectedCompanyName),
    `expected=${company.companyName}`
  );
  check(
    'PDF does not contain obsolete company identity',
    !normalizedPdf.includes(obsoleteCompanyName)
  );
  check('PDF customer matches authenticated account', normalizedPdf.includes(compact(profile.full_name)));
  check('PDF contains Account Statement structure', normalizedPdf.includes(compact('Account Statement')));

  if (company.phone) {
    check('PDF phone matches ERP company settings', normalizedPdf.includes(compact(company.phone)), `phone=${company.phone}`);
  }
  if (company.email) {
    check('PDF email matches ERP company settings', normalizedPdf.includes(compact(company.email)), `email=${company.email}`);
  }

  const firstTransaction = statement.transactions?.[0];
  if (firstTransaction?.description) {
    check(
      'PDF transaction source matches ERP statement ledger',
      normalizedPdf.includes(compact(firstTransaction.description)),
      `transaction=${firstTransaction.description}`
    );
  }

  console.log(`\nExtracted PDF text:\n${pdfText.replace(/\s+/g, ' ').trim()}`);
  if (failures > 0) {
    throw new Error(`${failures} official-document consistency check(s) failed`);
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
