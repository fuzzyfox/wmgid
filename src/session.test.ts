import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeSession, decodeSession } from './session.js';

const SECRET = 'a'.repeat(48);
const CLAIMS = { sub: '117812345678901234567', email: 'jane.doe@example.com' };

test('round-trips signed claims', () => {
  const cookie = encodeSession(CLAIMS, SECRET);
  const decoded = decodeSession(cookie, SECRET);
  assert.deepEqual(decoded, CLAIMS);
});

test('returns null when the signature is tampered', () => {
  const cookie = encodeSession(CLAIMS, SECRET);
  const tampered = cookie.slice(0, -2) + (cookie.endsWith('a') ? 'bb' : 'aa');
  assert.equal(decodeSession(tampered, SECRET), null);
});

test('returns null when the payload is swapped under the original signature', () => {
  const cookie = encodeSession(CLAIMS, SECRET);
  const [, sig] = cookie.split('.');
  const fakePayload = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url');
  assert.equal(decodeSession(`${fakePayload}.${sig}`, SECRET), null);
});

test('returns null when the secret differs (re-keying invalidates sessions)', () => {
  const cookie = encodeSession(CLAIMS, SECRET);
  assert.equal(decodeSession(cookie, 'different-secret-of-sufficient-length'), null);
});

test('returns null for malformed cookies', () => {
  assert.equal(decodeSession('not-a-cookie', SECRET), null);
  assert.equal(decodeSession('', SECRET), null);
  assert.equal(decodeSession('only.one.dot.too.many', SECRET), null);
});
