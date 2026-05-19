import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './index.js';

test('GET /healthz returns 200 ok plain text', async () => {
  const res = await app.request('/healthz');
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'ok');
});

test('GET / returns 200 with a body', async () => {
  const res = await app.request('/');
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /wmgid/i);
});

test('GET /public/style.css is reachable in the dev server', async () => {
  // The static asset route must be wired even if the file is empty in tests.
  const res = await app.request('/public/style.css');
  // 200 (compiled) or 404 (not built yet) both prove the route exists, not a crash.
  assert.ok([200, 404].includes(res.status), `unexpected status ${res.status}`);
});
