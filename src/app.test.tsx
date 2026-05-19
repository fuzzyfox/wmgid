import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { encodeSession, COOKIE_NAME } from './session.js';
import type { VerifiedClaims } from './auth.js';
import type { Tracker } from './analytics.js';

const SECRET = 'test-secret-of-sufficient-length-for-hmac';

const noopTracker: Tracker = { track: async () => {} };

type TrackCall = { name: string; path: string };

function capturingTracker(): { tracker: Tracker; calls: TrackCall[] } {
  const calls: TrackCall[] = [];
  return {
    tracker: {
      track: async (name, _req, path) => {
        calls.push({ name, path });
      },
    },
    calls,
  };
}

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
    tracker: noopTracker,
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
    tracker: noopTracker,
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

test('Google "Cancel" bounces to / with the cancelled banner shown', async () => {
  const app = makeApp();
  const res = await app.request('/auth/google/callback?error=access_denied');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/?cancelled=1');

  const home = await app.request('/?cancelled=1');
  const body = await home.text();
  assert.match(body, /data-testid="cancelled-banner"/);
  assert.match(body, /sign-in cancelled/);
});

test('a token verification failure renders the verify-failed screen, not raw text', async () => {
  const app = createApp({
    sessionSecret: SECRET,
    isProd: false,
    tracker: noopTracker,
    auth: {
      getAuthorizeUrl: () => '',
      verifyCallback: async () => {
        throw new Error('signature mismatch');
      },
    },
  });
  const res = await app.request('/auth/google/callback?code=c&state=ok', {
    headers: { cookie: 'wmgid_oauth_state=ok' },
  });
  assert.equal(res.status, 400);
  const body = await res.text();
  assert.match(body, /data-testid="verify-failed"/);
  assert.match(body, /try again/);
  // Must never echo any token-shaped string into the body.
  assert.equal(/signature mismatch/.test(body), false);
});

test('responses carry CSP, HSTS, nosniff, and a strict referrer policy', async () => {
  const res = await makeApp().request('/');
  assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  assert.match(res.headers.get('content-security-policy') ?? '', /lh3\.googleusercontent\.com/);
  assert.match(res.headers.get('content-security-policy') ?? '', /'unsafe-eval'/);
  assert.equal(res.headers.get('strict-transport-security'), 'max-age=31536000');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
});

function assertNoStore(res: Response) {
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(res.headers.get('cloudflare-cdn-cache-control'), 'no-store');
  assert.match(res.headers.get('vary') ?? '', /\bCookie\b/);
}

test('GET / (login page) is marked uncacheable for shared caches', async () => {
  const res = await makeApp().request('/');
  assertNoStore(res);
});

test('GET / (with session) is marked uncacheable for shared caches', async () => {
  const cookie = encodeSession({ sub: '42', email: 'jane.doe@example.com' }, SECRET);
  const res = await makeApp().request('/', {
    headers: { cookie: `${COOKIE_NAME}=${cookie}` },
  });
  assertNoStore(res);
});

test('GET /auth/google redirect is marked uncacheable', async () => {
  const res = await makeApp().request('/auth/google');
  assertNoStore(res);
});

test('successful callback redirect with Set-Cookie is marked uncacheable', async () => {
  const res = await makeApp().request('/auth/google/callback?code=c&state=ok', {
    headers: { cookie: 'wmgid_oauth_state=ok' },
  });
  assert.equal(res.status, 302);
  assert.match(res.headers.get('set-cookie') ?? '', new RegExp(`${COOKIE_NAME}=`));
  assertNoStore(res);
});

test('POST /logout is marked uncacheable', async () => {
  const res = await makeApp().request('/logout', { method: 'POST' });
  assertNoStore(res);
});

test('GET /healthz is marked uncacheable', async () => {
  const res = await makeApp().request('/healthz');
  assertNoStore(res);
});

test('cache middleware does not overwrite a route-supplied Cache-Control', async () => {
  // Mirrors what serveStatic does for /public/* — assert the no-store default
  // never clobbers an explicit Cache-Control set by a route handler.
  const app = createApp({ sessionSecret: SECRET, auth: fakeAuth(), isProd: false, tracker: noopTracker });
  app.get('/__cached', (c) => {
    c.header('Cache-Control', 'public, max-age=14400');
    return c.text('ok');
  });
  const res = await app.request('/__cached');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=14400');
  assert.equal(res.headers.get('cloudflare-cdn-cache-control'), null);
});

test('GET / records one pageview, regardless of session state', async () => {
  const { tracker, calls } = capturingTracker();
  const app = createApp({ sessionSecret: SECRET, auth: fakeAuth(), isProd: false, tracker });
  await app.request('/');
  assert.deepEqual(calls, [{ name: 'pageview', path: '/' }]);
});

test('GET /auth/google records Sign-in started before redirecting', async () => {
  const { tracker, calls } = capturingTracker();
  const app = createApp({ sessionSecret: SECRET, auth: fakeAuth(), isProd: false, tracker });
  const res = await app.request('/auth/google');
  assert.equal(res.status, 302);
  assert.deepEqual(calls, [{ name: 'Sign-in started', path: '/auth/google' }]);
});

test('Google cancel records Sign-in cancelled', async () => {
  const { tracker, calls } = capturingTracker();
  const app = createApp({ sessionSecret: SECRET, auth: fakeAuth(), isProd: false, tracker });
  await app.request('/auth/google/callback?error=access_denied');
  assert.deepEqual(calls, [{ name: 'Sign-in cancelled', path: '/auth/google/callback' }]);
});

test('successful callback records Sign-in success', async () => {
  const { tracker, calls } = capturingTracker();
  const app = createApp({ sessionSecret: SECRET, auth: fakeAuth(), isProd: false, tracker });
  const res = await app.request('/auth/google/callback?code=c&state=ok', {
    headers: { cookie: 'wmgid_oauth_state=ok' },
  });
  assert.equal(res.status, 302);
  assert.deepEqual(calls, [{ name: 'Sign-in success', path: '/auth/google/callback' }]);
});

test('hd-mismatch callback records Sign-in rejected', async () => {
  const { tracker, calls } = capturingTracker();
  const app = createApp({
    sessionSecret: SECRET,
    auth: fakeAuth({ verified: { sub: 'x', email: 'jane@other.com', hd: 'other.com' } as any }),
    allowedHd: 'example.com',
    isProd: false,
    tracker,
  });
  await app.request('/auth/google/callback?code=c&state=ok', {
    headers: { cookie: 'wmgid_oauth_state=ok' },
  });
  assert.deepEqual(calls, [{ name: 'Sign-in rejected', path: '/auth/google/callback' }]);
});

test('verification failure records Sign-in verify failed', async () => {
  const { tracker, calls } = capturingTracker();
  const app = createApp({
    sessionSecret: SECRET,
    isProd: false,
    tracker,
    auth: {
      getAuthorizeUrl: () => '',
      verifyCallback: async () => {
        throw new Error('signature mismatch');
      },
    },
  });
  await app.request('/auth/google/callback?code=c&state=ok', {
    headers: { cookie: 'wmgid_oauth_state=ok' },
  });
  assert.deepEqual(calls, [{ name: 'Sign-in verify failed', path: '/auth/google/callback' }]);
});

test('a throwing tracker never breaks the user-facing response', async () => {
  const throwingTracker: Tracker = {
    track: async () => {
      throw new Error('plausible exploded');
    },
  };
  const app = createApp({
    sessionSecret: SECRET,
    auth: fakeAuth(),
    isProd: false,
    tracker: throwingTracker,
  });

  const home = await app.request('/');
  assert.equal(home.status, 200);

  const start = await app.request('/auth/google');
  assert.equal(start.status, 302);

  const success = await app.request('/auth/google/callback?code=c&state=ok', {
    headers: { cookie: 'wmgid_oauth_state=ok' },
  });
  assert.equal(success.status, 302);
  assert.match(success.headers.get('set-cookie') ?? '', new RegExp(`${COOKIE_NAME}=`));
});

test('POST /logout clears the session cookie and redirects to /', async () => {
  const res = await makeApp().request('/logout', { method: 'POST' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/');
  const setCookie = res.headers.get('set-cookie') ?? '';
  assert.match(setCookie, new RegExp(`${COOKIE_NAME}=;`));
});
