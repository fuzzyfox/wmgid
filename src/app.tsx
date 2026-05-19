import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { secureHeaders } from 'hono/secure-headers';
import { serveStatic } from '@hono/node-server/serve-static';
import { pickAllowlistedClaims } from './claims.js';
import { COOKIE_NAME, encodeSession, decodeSession } from './session.js';
import { checkHd } from './hdPolicy.js';
import type { VerifiedClaims } from './auth.js';
import type { Tracker } from './analytics.js';
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
  tracker: Tracker;
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

  // Cloudflare and other shared caches must never serve one user's rendered
  // HTML to another. `/public/*` is exempt because serveStatic supplies its
  // own Cache-Control, which the conditional below preserves.
  app.use('*', async (c, next) => {
    await next();
    if (c.res.headers.has('Cache-Control')) return;
    c.res.headers.set('Cache-Control', 'private, no-store');
    c.res.headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
    const vary = c.res.headers.get('Vary');
    c.res.headers.set('Vary', vary ? `${vary}, Cookie` : 'Cookie');
  });

  app.get('/healthz', (c) => c.text('ok'));
  app.get('/public/*', serveStatic({ root: './' }));

  const track = (name: string, c: { req: { header(n: string): string | undefined } }, path: string) => {
    try {
      void deps.tracker.track(name, c.req, path).catch(() => {});
    } catch {
      // swallow synchronous throws from misbehaving trackers
    }
  };

  app.get('/', (c) => {
    track('pageview', c, '/');
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
    track('Sign-in started', c, '/auth/google');
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
    if (error === 'access_denied') {
      track('Sign-in cancelled', c, '/auth/google/callback');
      return c.redirect('/?cancelled=1');
    }

    if (!code || !state || !expectedState || state !== expectedState) {
      return c.text('invalid oauth state', 400);
    }

    try {
      const verified = await deps.auth.verifyCallback(code);
      const hdCheck = checkHd({ received: verified.hd, allowed: deps.allowedHd });

      if (!hdCheck.ok) {
        track('Sign-in rejected', c, '/auth/google/callback');
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

      track('Sign-in success', c, '/auth/google/callback');
      console.log(`[wmgid] callback ok: sub=${verified.sub} email=${verified.email ?? '(none)'}`);

      return c.redirect('/');
    } catch (err) {
      track('Sign-in verify failed', c, '/auth/google/callback');
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
