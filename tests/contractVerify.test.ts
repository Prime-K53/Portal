import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  readContractVerifyParams,
  API_BASE_URL,
} from '../src/features/customer-portal/views/ContractVerify';

describe('printing-contract hash verification params', () => {
  const origin = 'https://primeportalmw.vercel.app';
  const hash = 'a'.repeat(64);

  it('parses a QRdecoded payload from the query string', () => {
    const url = new URL(`${origin}/verify?c=PC-P726-023&h=${hash}`);
    const params = readContractVerifyParams(url.search, '');
    assert.strictEqual(params.c, 'PC-P726-023');
    assert.strictEqual(params.h, hash);
    assert.strictEqual(url.toString(), `${origin}/verify?c=PC-P726-023&h=${hash}`);
  });

  it('falls back to the hash query string for SPA hash routes', () => {
    const params = readContractVerifyParams('', `#/verify?c=PC-P726-023&h=${hash}`);
    assert.strictEqual(params.c, 'PC-P726-023');
    assert.strictEqual(params.h, hash);
  });

  it('supports manual short-code lookup without a hash', () => {
    const params = readContractVerifyParams('?c=4612-f2e1-2ecc', '');
    assert.strictEqual(params.c, '4612-f2e1-2ecc');
    assert.strictEqual(params.h, '');
  });

  it('uses the API base URL for contract-verify', () => {
    assert.ok(typeof API_BASE_URL === 'string');
    assert.match(API_BASE_URL, /\/api$/);
  });
});
