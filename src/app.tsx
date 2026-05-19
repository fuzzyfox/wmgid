import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { serveStatic } from '@hono/node-server/serve-static';
import { pickAllowlistedClaims } from './claims.js';
import { COOKIE_NAME, encodeSession, decodeSession } from './session.js';
import type { VerifiedClaims } from './auth.js';
import { Card } from './views/card.js';
import { Login } from './views/login.js';

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
    if (!cookie) return c.html(<Login />);
    const claims = decodeSession(cookie, deps.sessionSecret);
    if (!claims) {
      deleteCookie(c, COOKIE_NAME);
      return c.html(<Login />);
    }
    return c.html(<Card claims={claims} />);
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
