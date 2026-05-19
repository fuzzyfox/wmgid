# Plan: WMGID (What's My Google ID)

> Source PRD: [../prd/wmgid.md](../prd/wmgid.md)
> Domain glossary: [../../CONTEXT.md](../../CONTEXT.md)
> ADRs: [0001 — Stateless signed-cookie session](../adr/0001-stateless-signed-cookie-session.md), [0002 — Opt-in hosted-domain restriction](../adr/0002-opt-in-hosted-domain-restriction.md)

## Architectural decisions

Durable decisions that apply across all phases:

- **Routes**: `GET /`, `GET /auth/google`, `GET /auth/google/callback`, `POST /logout`, `GET /healthz`, `GET /public/*`
- **No database**. The signed browser-session cookie is the entire session store. See ADR-0001.
- **Allow-listed Claims** (the cookie payload schema, in order of importance): `sub`, `email`, `email_verified`, `name`, `given_name`, `family_name`, `picture`, `locale`, `hd`, `iss`, `aud`, `azp`, `iat`. Explicitly excluded: `exp`, `at_hash`, `nonce`.
- **Cookie flags**: `HttpOnly`, `Secure`, `SameSite=Lax`, HMAC-SHA256 signed with `SESSION_SECRET`. No `Max-Age` / `Expires` (browser-session lifetime).
- **OAuth library boundary**: `@hono/oauth-providers/google` for the dance + `google-auth-library` for ID-token verification. Wrapped behind a single `auth` module so the rest of the app sees only `VerifiedClaims`.
- **Deep modules** to test in isolation if testing is added later: `claims` (pure, defines the allow-list) and `hdPolicy` (pure, defines the opt-in restriction rule).
- **Stack**: Node + Hono (JSX views) + Tailwind v4 CLI (compiled) + Alpine.js for client interactions.
- **Deploy target**: Dokku. `Procfile` `web: node dist/index.js`. `CHECKS` → `/healthz`. Production host `wmgid.<dokku-host>`. Local dev tunnel via fwd.host, pointed at by `BASE_URL`.
- **Visual direction**: Variant C (terminal aesthetic), dark-only. Visual source-of-truth: [`../../prototype/google-id-debugger.html`](../../prototype/google-id-debugger.html).

---

## Phase 1: Walking skeleton

**User stories**: 20 (Dokku deploy), 21 (fwd.host local dev) — partial groundwork for all others.

### What to build

A Hono app that boots, serves a `/healthz` endpoint, and renders a placeholder `/` page with compiled Tailwind CSS applied. Dokku-deployable end-to-end: `git push dokku main`, container starts, `CHECKS` passes, `/` returns 200 over HTTPS at `wmgid.<dokku-host>`. Locally, the same flow runs over a fwd.host tunnel pointed at `BASE_URL`.

No OAuth yet. No cookie. No terminal aesthetic. The placeholder `/` is bare and exists only to prove the pipeline.

### Acceptance criteria

- [ ] `npm run dev` boots the server locally; `npm run build` produces a `dist/` and `public/style.css`.
- [ ] `GET /healthz` returns `200 ok` (plain text).
- [ ] `GET /` returns 200 with a placeholder body and a Tailwind class applied (visible proof CSS is wired).
- [ ] `Procfile`, `CHECKS`, `tsconfig.json`, `tailwind.config` (or v4 equivalent), and `.env.example` committed.
- [ ] Deployed instance reachable at the production host with HTTPS.
- [ ] README documents local dev (including the fwd.host tunnel step), env vars, and Dokku deploy.

---

## Phase 2: OAuth round-trip with cookie session

**User stories**: 1 (sign in), 9 (browser-session cookie), 10 (logout), 15 (no silent re-auth), 16 (server-side verification), 24 (allow-listed claims, drops explicit).

### What to build

End-to-end Google OAuth, hooked up to the signed-cookie session, with the Allow-listed Claims rendered as raw JSON on `/`. No styling beyond what's needed to read it — `<pre>` is fine. The point is to verify the full flow works against real Google credentials before investing in UI.

Flow:
- `GET /` — has cookie? show JSON dump of allow-listed claims + a `POST /logout` form. No cookie? show a link to `/auth/google`.
- `GET /auth/google` — generates a `state` (CSRF), redirects to Google with `openid email profile` scopes.
- `GET /auth/google/callback` — exchanges code, verifies ID token via `google-auth-library`, applies the claims allow-list, sets the signed cookie, redirects to `/`.
- `POST /logout` — clears the cookie, redirects to `/`.

Cookie tampering / parse failures silently clear the cookie and bounce to the logged-out view.

### Acceptance criteria

- [ ] Real Google sign-in completes and lands on `/` showing the user's actual Google ID + other allow-listed claims.
- [ ] Closing the browser ends the session (cookie disappears); refresh within the same browser keeps it.
- [ ] `POST /logout` clears the cookie and returns the logged-out view.
- [ ] Cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, signed, no `Max-Age`.
- [ ] Token signature, `iss`, `aud`, and `exp` are server-side verified; tampered cookies are silently dropped.
- [ ] Stored cookie payload contains exactly the 13 allow-listed claims — no `exp`, `at_hash`, `nonce`.
- [ ] CSRF `state` parameter is validated on the callback; mismatched state rejects the request.

---

## Phase 3: Terminal UI

**User stories**: 2 (hero copy), 3 (identity confirmation), 4 (copy JSON), 5 (collapsed debug), 6 (hd visible), 7 (sub in JSON too), 17 (avatar fallback), 18 (null vs missing), 19 (unverified email), 23 (dark-only terminal aesthetic).

### What to build

Replace the raw JSON dump with the terminal-aesthetic card from [`../../prototype/google-id-debugger.html`](../../prototype/google-id-debugger.html) (Variant C), built as Hono JSX components and wired to the real claims. Dark-only, mono throughout, JSON-viewer body with the colour scheme from the prototype. Alpine.js powers the debug-section collapse, the `[copy]` button on Google ID, and the `[copy --json]` button.

Also build the logged-out screen in matching aesthetic: `❯ wmgid --login` header, single Google-branded "Sign in with Google" button.

### Acceptance criteria

- [ ] `❯ wmgid` header and shell-style identity row (`name="…" email="…" [verified] hd="…"`).
- [ ] Google ID rendered as the hero with a working `[copy]` button (writes to clipboard, visual confirmation).
- [ ] Token-metadata claims (`iss`, `aud`, `azp`, `iat`) collapsed by default into a `▸ token claims (4 hidden)` accordion; clicking expands.
- [ ] `iat` rendered as raw unix value with a `// human` comment showing the formatted timestamp.
- [ ] `[copy --json]` button copies all 13 allow-listed claims as JSON to clipboard.
- [ ] Missing claims (e.g. `hd` on a personal account) are omitted entirely from the rendered JSON.
- [ ] Null-valued claims render dimmed.
- [ ] `email_verified: false` swaps the green `[verified]` chip for a red `[unverified]` chip.
- [ ] Avatar `<img>` falls back to a deterministic coloured-circle with initials when the picture URL is missing or fails to load.
- [ ] Logged-out screen renders in the same aesthetic with Google's official "Sign in with Google" button (per their branding guidelines).
- [ ] Tailwind CSS is compiled in the build, not loaded from CDN. Alpine.js is bundled or served from `/public/`, not CDN.
- [ ] Page is dark-only (no `prefers-color-scheme` light variant).
- [ ] Logout button uses `POST` (form), placed as small/secondary in the card.

---

## Phase 4: Opt-in hosted-domain restriction

**User stories**: 8 (personal-account fallback works by default), 12 (`ALLOWED_HD` env var), 13 (login-screen hint), 14 (rejection screen with required vs received).

### What to build

The `ALLOWED_HD` env var. When unset, behaviour is unchanged from Phase 3 — any Google account is accepted. When set:

- The `/auth/google` redirect includes `hd=<value>` as a hint to Google.
- The callback server-side checks the `hd` claim against `ALLOWED_HD`. Mismatch (including missing `hd` on personal accounts) → render the rejection screen, **do not set the cookie**.
- The logged-out screen renders a muted `// restricted to @<domain>` hint above the sign-in button.

Rejection screen, in terminal aesthetic:

```
❯ wmgid --verify
✗ access denied

  required hd  "<allowed>"
  received hd  "<received or (none)>"
  signed in as <email>

  This tool is restricted to @<allowed> accounts.

  [ try again ]
```

`[ try again ]` re-enters the OAuth flow.

### Acceptance criteria

- [ ] With `ALLOWED_HD` unset, signing in with both a Workspace and a Personal account works (story 8 verified end-to-end).
- [ ] With `ALLOWED_HD=example.com` set, signing in with `@example.com` works; signing in with `@gmail.com` shows the rejection screen and no cookie is set.
- [ ] Rejection screen shows required vs received `hd` (with `(none)` for missing) and the received email.
- [ ] Logged-out screen displays the `// restricted to @<domain>` hint only when `ALLOWED_HD` is set.
- [ ] The `hd` check lives in a pure `hdPolicy` module testable without HTTP.

---

## Phase 5: Error UX & ops hardening

**User stories**: 11 (sign-in-cancelled banner), 22 (logging policy, no raw tokens) — plus security headers and README polish.

### What to build

The remaining non-happy-path UX and ops items:

- **Sign-in cancelled** — on `?error=access_denied` from Google, bounce to `/` (logged-out) with a `// sign-in cancelled` muted banner above the sign-in button.
- **Verification failure** — render a terminal-aesthetic 400 page: `❯ wmgid --verify`, `✗ token verification failed`, copy "This usually clears up on retry," `[ try again ]` button. Server logs the verification error message and any parseable `iss`/`aud` — **never** the raw token.
- **Security headers** — wire Hono's `secureHeaders()` middleware with the CSP allowing `script-src 'self' 'unsafe-eval'` (for Alpine), `img-src 'self' https://lh3.googleusercontent.com`, plus HSTS, nosniff, and a strict referrer policy.
- **Logging** — `console.log` / `console.error` to stdout. Log: boot, callback received (sub + email), `hd` rejection (received `hd` + email), token verification failure (error message, never the token). Don't log: cookie sets, healthchecks, page renders.
- **README** completion — local-dev steps end-to-end (including fwd.host), Google Cloud OAuth client setup checklist, Dokku deploy walkthrough, env var reference, ADR pointers.

### Acceptance criteria

- [ ] Clicking "Cancel" at Google's consent screen returns to `/` with the `// sign-in cancelled` banner.
- [ ] A deliberately-broken token (e.g. wrong `aud` in a test fixture) renders the verification-failure screen with the `[ try again ]` button.
- [ ] Response headers include the CSP, HSTS, X-Content-Type-Options, and Referrer-Policy as specified.
- [ ] `dokku logs` shows boot + callback + rejection + failure events. Grep for any substring of a real ID token returns nothing.
- [ ] README is complete enough that a new operator can stand up a fresh deploy without asking questions.
