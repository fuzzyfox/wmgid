import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkHd } from './hdPolicy.js';

test('with no restriction, any hd (including missing) is accepted', () => {
  assert.deepEqual(checkHd({ received: 'example.com', allowed: undefined }), { ok: true });
  assert.deepEqual(checkHd({ received: undefined, allowed: undefined }), { ok: true });
  assert.deepEqual(checkHd({ received: 'gmail.com', allowed: undefined }), { ok: true });
});

test('with a restriction, the matching hd is accepted', () => {
  assert.deepEqual(checkHd({ received: 'example.com', allowed: 'example.com' }), { ok: true });
});

test('with a restriction, a mismatching hd is rejected and both values are returned', () => {
  assert.deepEqual(checkHd({ received: 'other.com', allowed: 'example.com' }), {
    ok: false,
    received: 'other.com',
    required: 'example.com',
  });
});

test('with a restriction, a missing hd (personal account) is rejected with (none)', () => {
  assert.deepEqual(checkHd({ received: undefined, allowed: 'example.com' }), {
    ok: false,
    received: '(none)',
    required: 'example.com',
  });
});

test('matching is exact — case differences are rejected (Google sends lowercase)', () => {
  const result = checkHd({ received: 'EXAMPLE.COM', allowed: 'example.com' });
  assert.equal(result.ok, false);
});
