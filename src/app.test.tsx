import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { encodeSession, COOKIE_NAME } from './session.js';
import type { VerifiedClaims } from './auth.js';

const SECRET = 'test-secret-of-sufficient-length-for-hmac';

function fakeAuth(overrides: Partial<{ verified: VerifiedClaims; authorizeUrl: string }> = {}) {
  return {
    getAuthorizeUrl: (state: string) =>
      overrides.authorizeUrl ?? `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
    verifyCallback: async () =>
      overrides.verified ?? {
        sub: '117812345678901234567',
        email: 'jane.doe@example.com',
        email_verified: true,
        name: 'Jane Doe',
        iss: 'https://accounts.google.com',
        aud: 'aud',
        azp: 'azp',
        iat: 1747654320,
      },
  };
}

function makeApp(
  authOverrides: Parameters<typeof fakeAuth>[0] = {},
  appOverrides: { allowedHd?: string } = {},
) {
  return createApp({
    sessionSecret: SECRET,
    auth: fakeAuth(authOverrides),
    isProd: false,
    ...appOverrides,
  });
}

test('GET / without a cookie renders the login screen', async () => {
  const res = await makeApp().request('/');
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /Sign in with Google/);
  assert.match(body, /\/auth\/google/);
});

test('GET / with a valid session renders the claims', async () => {
  const cookie = encodeSession({ sub: '42', email: 'jane.doe@example.com' }, SECRET);
  const res = await makeApp().request('/', {
    headers: { cookie: `${COOKIE_NAME}=${cookie}` },
  });
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /jane\.doe@example\.com/);
  assert.match(body, /data-testid="google-id"[^>]*>42</);
});

test('GET / with a tampered cookie silently clears and shows login', async () => {
  const cookie = encodeSession({ sub: '42' }, SECRET);
  const tampered = cookie.slice(0, -2) + 'zz';
  const res = await makeApp().request('/', {
    headers: { cookie: `${COOKIE_NAME}=${tampered}` },
  });
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /Sign in with Google/);
  // Cookie clear directive should accompany the response.
  const setCookie = res.headers.get('set-cookie') ?? '';
  assert.match(setCookie, new RegExp(`${COOKIE_NAME}=;`));
});

test('GET /auth/google redirects to Google with a CSRF state cookie', async () => {
  const res = await makeApp().request('/auth/google');
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location') ?? '', /accounts\.google\.com/);
  assert.match(res.headers.get('set-cookie') ?? '', /wmgid_oauth_state=/);
});

test('callback rejects mismatched state to prevent CSRF', async () => {
  const res = await makeApp().request('/auth/google/callback?code=c&state=evil', {
    headers: { cookie: 'wmgid_oauth_state=expected' },
  });
  assert.equal(res.status, 400);
});

test('callback with matching state sets a signed session cookie containing only allow-listed claims', async () => {
  const res = await makeApp().request('/auth/google/callback?code=c&state=ok', {
    headers: { cookie: 'wmgid_oauth_state=ok' },
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/');
  const setCookie = res.headers.get('set-cookie') ?? '';
  // Isolate the session cookie's directives — other Set-Cookie segments
  // (e.g. the state-cookie clear) legitimately carry Max-Age=0.
  const session = setCookie
    .split(/,\s*(?=\w+=)/)
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  assert.ok(session, 'session cookie should be in Set-Cookie header');
  assert.match(session!, /HttpOnly/i);
  assert.match(session!, /SameSite=Lax/i);
  // No Max-Age / Expires => browser-session lifetime.
  assert.equal(/Max-Age=/i.test(session!), false, 'session cookie must not set Max-Age');
  assert.equal(/Expires=/i.test(session!), false, 'session cookie must not set Expires');
});

test('callback drops exp/at_hash/nonce when persisting the session', async () => {
  const verified = {
    sub: 'x',
    email: 'jane.doe@example.com',
    exp: 9999999999,
    at_hash: 'secret',
    nonce: 'secret',
  } as unknown as VerifiedClaims;
  const res = await makeApp({ verified }).request('/auth/google/callback?code=c&state=ok', {
    headers: { cookie: 'wmgid_oauth_state=ok' },
  });
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = setCookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  assert.ok(match, 'session cookie should be set');
  const [payload] = match![1].split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  assert.equal('exp' in decoded, false);
  assert.equal('at_hash' in decoded, false);
  assert.equal('nonce' in decoded, false);
  assert.equal(decoded.sub, 'x');
});

test('login screen surfaces the restricted-hd hint when configured', async () => {
  const restricted = makeApp({}, { allowedHd: 'example.com' });
  const res = await restricted.request('/');
  const body = await res.text();
  assert.match(body, /restricted to @example\.com/);

  const open = makeApp();
  const openBody = await (await open.request('/')).text();
  assert.equal(/restricted to @/.test(openBody), false);
});

test('/auth/google forwards hd= as a hint when restricted', async () => {
  let captured = '';
  const app = createApp({
    sessionSecret: SECRET,
    isProd: false,
    allowedHd: 'example.com',
    auth: {
      getAuthorizeUrl: (state, hd) => {
        captured = String(hd);
        return `https://accounts.google.com/?state=${state}&hd=${hd ?? ''}`;
      },
      verifyCallback: async () => ({ sub: 'x' }) as any,
    },
  });
  await app.request('/auth/google');
  assert.equal(captured, 'example.com');
});

test('callback rejects a Workspace mismatch and does not set the session cookie', async () => {
  const app = makeApp(
    { verified: { sub: 'x', email: 'jane@other.com', hd: 'other.com' } as any },
    { allowedHd: 'example.com' },
  );
  const res = await app.request('/auth/google/callback?code=c&state=ok', {
    headers: { cookie: 'wmgid_oauth_state=ok' },
  });
  assert.equal(res.status, 403);
  const body = await res.text();
  assert.match(body, /access denied/);
  assert.match(body, /required hd[^&]*&quot;example\.com&quot;/);
  assert.match(body, /received hd[^&]*&quot;other\.com&quot;/);
  assert.match(body, /jane@other\.com/);
  const setCookie = res.headers.get('set-cookie') ?? '';
  assert.equal(new RegExp(`${COOKIE_NAME}=[^;,]+`).test(setCookie), false);
});

test('callback rejects a personal account (no hd) and shows (none) received', async () => {
  const app = makeApp(
    { verified: { sub: 'x', email: 'jane@gmail.com' } as any },
    { allowedHd: 'example.com' },
  );
  const res = await app.request('/auth/google/callback?code=c&state=ok', {
    headers: { cookie: 'wmgid_oauth_state=ok' },
  });
  assert.equal(res.status, 403);
  const body = await res.text();
  assert.match(body, /\(none\)/);
});

test('callback accepts a personal account when no restriction is configured', async () => {
  const app = makeApp({ verified: { sub: 'x', email: 'jane@gmail.com' } as any });
  const res = await app.request('/auth/google/callback?code=c&state=ok', {
    headers: { cookie: 'wmgid_oauth_state=ok' },
  });
  assert.equal(res.status, 302);
  assert.match(res.headers.get('set-cookie') ?? '', new RegExp(`${COOKIE_NAME}=`));
});

test('POST /logout clears the session cookie and redirects to /', async () => {
  const res = await makeApp().request('/logout', { method: 'POST' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/');
  const setCookie = res.headers.get('set-cookie') ?? '';
  assert.match(setCookie, new RegExp(`${COOKIE_NAME}=;`));
});
