import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnalytics } from './analytics.js';

type Capture = { url: string; init: RequestInit }[];

function captureFetch(): { fetch: typeof fetch; calls: Capture } {
  const calls: Capture = [];
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(null, { status: 202 });
  }) as unknown as typeof fetch;
  return { fetch: fakeFetch, calls };
}

function fakeReq(headers: Record<string, string> = {}) {
  return {
    header(name: string): string | undefined {
      return headers[name.toLowerCase()];
    },
  };
}

test('when domain is undefined, track() is a no-op (no fetch)', async () => {
  const { fetch, calls } = captureFetch();
  const tracker = createAnalytics({
    domain: undefined,
    host: 'plausible.io',
    baseUrl: 'https://wmgid.example.com',
    fetch,
  });

  await tracker.track('pageview', fakeReq(), '/');

  assert.equal(calls.length, 0);
});

function makeTracker(overrides: Partial<Parameters<typeof createAnalytics>[0]> = {}) {
  const { fetch, calls } = captureFetch();
  const tracker = createAnalytics({
    domain: 'wmgid.example.com',
    host: 'plausible.io',
    baseUrl: 'https://wmgid.example.com',
    fetch,
    ...overrides,
  });
  return { tracker, calls };
}

function bodyOf(call: { init: RequestInit }): Record<string, unknown> {
  return JSON.parse(String(call.init.body));
}

function headersOf(call: { init: RequestInit }): Record<string, string> {
  const h = call.init.headers as Record<string, string> | undefined;
  return h ?? {};
}

test('outbound POST goes to https://${host}/api/event', async () => {
  const { tracker, calls } = makeTracker();
  await tracker.track('pageview', fakeReq(), '/');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://plausible.io/api/event');
  assert.equal(calls[0].init.method, 'POST');
});

test('outbound body carries name, domain, and BASE_URL + path as url', async () => {
  const { tracker, calls } = makeTracker();
  await tracker.track('Sign-in started', fakeReq(), '/auth/google');

  const body = bodyOf(calls[0]);
  assert.equal(body.name, 'Sign-in started');
  assert.equal(body.domain, 'wmgid.example.com');
  assert.equal(body.url, 'https://wmgid.example.com/auth/google');
});

test('outbound url never reflects the inbound request URL (no OAuth code leak)', async () => {
  const { tracker, calls } = makeTracker();
  const inbound = {
    header: () => undefined,
    url: 'https://wmgid.example.com/auth/google/callback?code=SECRET&state=xyz',
  };
  await tracker.track('Sign-in verify failed', inbound, '/auth/google/callback');

  const raw = String(calls[0].init.body);
  assert.equal(raw.includes('SECRET'), false);
  assert.equal(raw.includes('code='), false);
  assert.equal(bodyOf(calls[0]).url, 'https://wmgid.example.com/auth/google/callback');
});

test('outbound body never contains a props field', async () => {
  const { tracker, calls } = makeTracker();
  await tracker.track('pageview', fakeReq(), '/');

  const body = bodyOf(calls[0]);
  assert.equal('props' in body, false);
});

test('CF-Connecting-IP populates X-Forwarded-For on the outbound request', async () => {
  const { tracker, calls } = makeTracker();
  await tracker.track('pageview', fakeReq({ 'cf-connecting-ip': '203.0.113.10' }), '/');
  assert.equal(headersOf(calls[0])['X-Forwarded-For'], '203.0.113.10');
});

test('X-Forwarded-For (leftmost) is used when CF-Connecting-IP absent', async () => {
  const { tracker, calls } = makeTracker();
  await tracker.track(
    'pageview',
    fakeReq({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1, 10.0.0.2' }),
    '/',
  );
  assert.equal(headersOf(calls[0])['X-Forwarded-For'], '198.51.100.7');
});

test('X-Real-IP is used when no CF or X-Forwarded-For header is present', async () => {
  const { tracker, calls } = makeTracker();
  await tracker.track('pageview', fakeReq({ 'x-real-ip': '192.0.2.5' }), '/');
  assert.equal(headersOf(calls[0])['X-Forwarded-For'], '192.0.2.5');
});

test('CF-Connecting-IP wins over X-Forwarded-For and X-Real-IP', async () => {
  const { tracker, calls } = makeTracker();
  await tracker.track(
    'pageview',
    fakeReq({
      'cf-connecting-ip': '203.0.113.10',
      'x-forwarded-for': '198.51.100.7',
      'x-real-ip': '192.0.2.5',
    }),
    '/',
  );
  assert.equal(headersOf(calls[0])['X-Forwarded-For'], '203.0.113.10');
});

test('falls back to 0.0.0.0 when no client-IP header is present', async () => {
  const { tracker, calls } = makeTracker();
  await tracker.track('pageview', fakeReq(), '/');
  assert.equal(headersOf(calls[0])['X-Forwarded-For'], '0.0.0.0');
});

test('User-Agent is forwarded from inbound; Referer is not', async () => {
  const { tracker, calls } = makeTracker();
  await tracker.track(
    'pageview',
    fakeReq({
      'user-agent': 'Mozilla/5.0 (test)',
      referer: 'https://evil.example.com/leak?code=SECRET',
    }),
    '/',
  );

  const headers = headersOf(calls[0]);
  assert.equal(headers['User-Agent'], 'Mozilla/5.0 (test)');
  const headerKeys = Object.keys(headers).map((k) => k.toLowerCase());
  assert.equal(headerKeys.includes('referer'), false);
});

test('a rejected fetch does not throw and surfaces a single console.warn', async () => {
  const failingFetch = (async () => {
    throw new Error('boom');
  }) as unknown as typeof fetch;

  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };

  try {
    const tracker = createAnalytics({
      domain: 'wmgid.example.com',
      host: 'plausible.io',
      baseUrl: 'https://wmgid.example.com',
      fetch: failingFetch,
    });
    await tracker.track('pageview', fakeReq(), '/');
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /\[wmgid\] analytics:/);
});
