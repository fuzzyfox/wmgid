import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { createAuth } from './auth.js';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
}

const clientId = required('GOOGLE_CLIENT_ID');
const clientSecret = required('GOOGLE_CLIENT_SECRET');
const sessionSecret = required('SESSION_SECRET');
const baseUrl = required('BASE_URL');

const auth = createAuth({ clientId, clientSecret, baseUrl });

export const app = createApp({
  sessionSecret,
  auth,
  allowedHd: process.env.ALLOWED_HD || undefined,
  isProd: process.env.NODE_ENV !== 'development',
});

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  serve({ fetch: app.fetch, port });
  console.log(`[wmgid] boot — listening on :${port} base=${baseUrl}`);
}
