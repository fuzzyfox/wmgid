import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Card } from './card.js';

const FULL = {
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
  aud: 'aud',
  azp: 'azp',
  iat: 1747654320,
};

const render = (c: any) => String((Card as any)({ claims: c }));

test('shows the google_id prominently with a copy button targeting sub', () => {
  const html = render(FULL);
  assert.match(html, /data-testid="google-id"[^>]*>117812345678901234567</);
  assert.match(html, /data-testid="copy-google-id"/);
  assert.match(html, /117812345678901234567/);
});

test('renders shell-style identity row with name, email, hd', () => {
  const html = render(FULL);
  // JSX HTML-escapes ", so look for the entity form alongside the value.
  assert.match(html, /name=/);
  assert.match(html, /&quot;Jane Doe&quot;/);
  assert.match(html, /&quot;jane\.doe@example\.com&quot;/);
  assert.match(html, /hd=/);
  assert.match(html, /&quot;example\.com&quot;/);
});

test('flags [verified] when email_verified=true and [unverified] when false', () => {
  assert.match(render(FULL), /\[verified\]/);
  assert.equal(/\[unverified\]/.test(render(FULL)), false);
  const unverified = render({ ...FULL, email_verified: false });
  assert.match(unverified, /\[unverified\]/);
  assert.equal(/\[verified\]/.test(unverified), false);
});

test('hides token-meta claims behind a collapsed accordion that lists the count', () => {
  const html = render(FULL);
  assert.match(html, /data-testid="meta-hidden"/);
  assert.match(html, /4 hidden/);
  assert.match(html, /data-testid="toggle-meta"/);
});

test('renders iat with a "// human" comment in the meta section', () => {
  const html = render(FULL);
  assert.match(html, /\/\/ 2025-05-19 11:32:00 UTC/);
});

test('omits missing claims from the JSON view (no null rendering)', () => {
  const personal = { sub: '1', email: 'a@b' };
  const html = render(personal);
  // hd is missing — must not appear as a key (entity-escaped quotes in JSX)
  assert.equal(/&quot;hd&quot;/.test(html), false);
  assert.match(html, /&quot;sub&quot;/);
});

test('renders null-valued claims dimmed (preserves them, distinguishes from missing)', () => {
  const html = render({ sub: '1', picture: null as any });
  assert.match(html, /&quot;picture&quot;/);
  // Null renders as italic dimmed
  assert.match(html, /text-zinc-500 italic[^>]*>null/);
});

test('copy-json button payload is the JSON of all stored claims', () => {
  const html = render(FULL);
  // Look for the JSON string embedded in @click handler containing sub
  // (single quotes get entity-escaped as &#39;)
  assert.match(html, /copy\(.*117812345678901234567.*&#39;json&#39;\)/s);
});

test('falls back to initials avatar when picture is absent', () => {
  const html = render({ sub: '1', name: 'Jane Doe' });
  // no <img> tag for picture, initials block instead
  assert.equal(/<img [^>]*src="https/.test(html), false);
  assert.match(html, />JD</);
});
