import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { secureHeaders } from 'hono/secure-headers';
import { serveStatic } from '@hono/node-server/serve-static';
import { pickAllowlistedClaims } from './claims.js';
import { COOKIE_NAME, encodeSession, decodeSession } from './session.js';
import { checkHd } from './hdPolicy.js';
import type { VerifiedClaims } from './auth.js';
import { Card } from './views/card.js';
import { Login } from './views/login.js';
import { Rejected } from './views/rejected.js';
import { VerifyFailed } from './views/verifyFailed.js';

const STATE_COOKIE = 'wmgid_oauth_state';

export type AppDeps = {
  sessionSecret: string;
  auth: {
    getAuthorizeUrl: (state: string, hd?: string) => string;
    verifyCallback: (code: string) => Promise<VerifiedClaims>;
  };
  allowedHd?: string;
  isProd?: boolean;
};

export function createApp(deps: AppDeps) {
  const app = new Hono();
  const secure = deps.isProd !== false;

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'https://lh3.googleusercontent.com', 'data:'],
        scriptSrc: ["'self'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
      strictTransportSecurity: 'max-age=31536000',
      xContentTypeOptions: 'nosniff',
      referrerPolicy: 'strict-origin-when-cross-origin',
    }),
  );

  app.get('/healthz', (c) => c.text('ok'));
  app.get('/public/*', serveStatic({ root: './' }));

  app.get('/', (c) => {
    const cancelled = c.req.query('cancelled') === '1';
    const cookie = getCookie(c, COOKIE_NAME);

    if (!cookie)
      return c.html(<Login restrictedHd={deps.allowedHd} cancelled={cancelled} />);

    const claims = decodeSession(cookie, deps.sessionSecret);

    if (!claims) {
      deleteCookie(c, COOKIE_NAME);
      return c.html(<Login restrictedHd={deps.allowedHd} cancelled={cancelled} />);
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

    return c.redirect(deps.auth.getAuthorizeUrl(state, deps.allowedHd));
  });

  app.get('/auth/google/callback', async (c) => {
    const error = c.req.query('error');
    const code = c.req.query('code');
    const state = c.req.query('state');
    const expectedState = getCookie(c, STATE_COOKIE);

    deleteCookie(c, STATE_COOKIE);

    // User clicked "Cancel" at Google's consent screen → bounce home quietly.
    if (error === 'access_denied') return c.redirect('/?cancelled=1');

    if (!code || !state || !expectedState || state !== expectedState) {
      return c.text('invalid oauth state', 400);
    }

    try {
      const verified = await deps.auth.verifyCallback(code);
      const hdCheck = checkHd({ received: verified.hd, allowed: deps.allowedHd });

      if (!hdCheck.ok) {
        console.warn(
          `[wmgid] hd rejected: required=${hdCheck.required} received=${hdCheck.received} email=${verified.email ?? '(none)'}`,
        );
        return c.html(
          <Rejected
            required={hdCheck.required}
            received={hdCheck.received}
            email={verified.email ?? '(none)'}
          />,
          403,
        );
      }

      const stored = pickAllowlistedClaims(verified as Record<string, unknown>);

      setCookie(c, COOKIE_NAME, encodeSession(stored, deps.sessionSecret), {
        httpOnly: true,
        secure,
        sameSite: 'Lax',
        path: '/',
      });

      console.log(`[wmgid] callback ok: sub=${verified.sub} email=${verified.email ?? '(none)'}`);

      return c.redirect('/');
    } catch (err) {
      console.error('[wmgid] callback verification failed:', (err as Error).message);

      return c.html(<VerifyFailed />, 400);
    }
  });

  app.post('/logout', (c) => {
    deleteCookie(c, COOKIE_NAME);
    return c.redirect('/');
  });

  return app;
}
