import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { serveStatic } from '@hono/node-server/serve-static';
import { pickAllowlistedClaims } from './claims.js';
import { COOKIE_NAME, encodeSession, decodeSession } from './session.js';
import type { VerifiedClaims } from './auth.js';

const STATE_COOKIE = 'wmgid_oauth_state';

export type AppDeps = {
  sessionSecret: string;
  auth: {
    getAuthorizeUrl: (state: string, hd?: string) => string;
    verifyCallback: (code: string) => Promise<VerifiedClaims>;
  };
  isProd?: boolean;
};

export function createApp(deps: AppDeps) {
  const app = new Hono();
  const secure = deps.isProd !== false;

  app.get('/healthz', (c) => c.text('ok'));
  app.get('/public/*', serveStatic({ root: './' }));

  app.get('/', (c) => {
    const cookie = getCookie(c, COOKIE_NAME);
    if (!cookie) return renderLogin(c);
    const claims = decodeSession(cookie, deps.sessionSecret);
    if (!claims) {
      deleteCookie(c, COOKIE_NAME);
      return renderLogin(c);
    }
    return renderCard(c, claims);
  });

  app.get('/auth/google', (c) => {
    const state = crypto.randomUUID();
    setCookie(c, STATE_COOKIE, state, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
    });
    return c.redirect(deps.auth.getAuthorizeUrl(state));
  });

  app.get('/auth/google/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const expectedState = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE);

    if (!code || !state || !expectedState || state !== expectedState) {
      return c.text('invalid oauth state', 400);
    }

    try {
      const verified = await deps.auth.verifyCallback(code);
      const stored = pickAllowlistedClaims(verified as Record<string, unknown>);
      setCookie(c, COOKIE_NAME, encodeSession(stored, deps.sessionSecret), {
        httpOnly: true,
        secure,
        sameSite: 'Lax',
        path: '/',
      });
      return c.redirect('/');
    } catch (err) {
      console.error('[wmgid] callback verification failed:', (err as Error).message);
      return c.text('token verification failed', 400);
    }
  });

  app.post('/logout', (c) => {
    deleteCookie(c, COOKIE_NAME);
    return c.redirect('/');
  });

  return app;
}

function renderLogin(c: any) {
  return c.html(
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>wmgid</title>
<link rel="stylesheet" href="/public/style.css"></head>
<body class="bg-zinc-950 text-emerald-300 font-mono p-8">
<pre>❯ wmgid --login
not signed in</pre>
<p><a href="/auth/google">Sign in with Google</a></p>
</body></html>`
  );
}

function renderCard(c: any, claims: any) {
  return c.html(
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>wmgid</title>
<link rel="stylesheet" href="/public/style.css"></head>
<body class="bg-zinc-950 text-emerald-300 font-mono p-8">
<pre>❯ wmgid
${escapeHtml(JSON.stringify(claims, null, 2))}</pre>
<form method="POST" action="/logout"><button>logout</button></form>
</body></html>`
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!)
  );
}
