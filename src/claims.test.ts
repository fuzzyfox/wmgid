import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickAllowlistedClaims, ALLOWLISTED_CLAIM_KEYS } from './claims.js';

const FULL_WORKSPACE_TOKEN = {
  sub: '117812345678901234567',
  email: 'jane.doe@example.com',
  email_verified: true,
  name: 'Jane Doe',
  given_name: 'Jane',
  family_name: 'Doe',
  picture: 'https://lh3.googleusercontent.com/a/default-user=s96-c',
  locale: 'en-GB',
  hd: 'example.com',
  iss: 'https://accounts.google.com',
  aud: '123456789.apps.googleusercontent.com',
  azp: '123456789.apps.googleusercontent.com',
  iat: 1747654320,
  exp: 1747657920,
  at_hash: 'should-be-dropped',
  nonce: 'should-be-dropped-too',
} as const;

test('keeps every allow-listed claim from a full Workspace token', () => {
  const picked = pickAllowlistedClaims(FULL_WORKSPACE_TOKEN);
  for (const key of ALLOWLISTED_CLAIM_KEYS) {
    assert.equal(picked[key], FULL_WORKSPACE_TOKEN[key], `missing ${key}`);
  }
});

test('drops exp, at_hash, nonce — even when present on the raw token', () => {
  const picked = pickAllowlistedClaims(FULL_WORKSPACE_TOKEN) as Record<string, unknown>;
  assert.equal('exp' in picked, false);
  assert.equal('at_hash' in picked, false);
  assert.equal('nonce' in picked, false);
});

test('omits hd entirely for a personal account (Google sends no hd claim)', () => {
  const { hd: _hd, ...personal } = FULL_WORKSPACE_TOKEN;
  const picked = pickAllowlistedClaims(personal) as Record<string, unknown>;
  assert.equal('hd' in picked, false, 'hd should be omitted, not null');
});

test('drops claims that are not in the allow-list, even if Google adds new ones', () => {
  const withUnexpected = { ...FULL_WORKSPACE_TOKEN, surprise_claim: 'oh no' };
  const picked = pickAllowlistedClaims(withUnexpected) as Record<string, unknown>;
  assert.equal('surprise_claim' in picked, false);
});

test('passes email_verified: false through unchanged', () => {
  const picked = pickAllowlistedClaims({ ...FULL_WORKSPACE_TOKEN, email_verified: false });
  assert.equal(picked.email_verified, false);
});
