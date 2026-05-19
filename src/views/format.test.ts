import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iatHuman, initials, primaryEntries, metaEntries } from './format.js';

test('iatHuman formats unix seconds as human-readable UTC', () => {
  assert.equal(iatHuman(1747654320), '2025-05-19 11:32:00 UTC');
});

test('initials takes up to 2 characters from word starts', () => {
  assert.equal(initials('Jane Doe'), 'JD');
  assert.equal(initials('jane'), 'J');
  assert.equal(initials('Jane Mary Doe'), 'JM');
});

test('primaryEntries skips claims that Google did not return', () => {
  const entries = primaryEntries({ sub: 'x', email: 'a@b' });
  const keys = entries.map(([k]) => k);
  assert.deepEqual(keys, ['sub', 'email']);
  assert.equal(keys.includes('hd' as never), false);
});

test('primaryEntries preserves canonical ordering (sub first)', () => {
  const entries = primaryEntries({ name: 'X', sub: 'y', hd: 'h' });
  assert.deepEqual(entries.map(([k]) => k), ['sub', 'name', 'hd']);
});

test('metaEntries returns only the token-metadata keys', () => {
  const entries = metaEntries({
    sub: 'x',
    iss: 'i',
    aud: 'a',
    azp: 'z',
    iat: 1,
  });
  assert.deepEqual(entries.map(([k]) => k), ['iss', 'aud', 'azp', 'iat']);
});
