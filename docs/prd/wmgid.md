# PRD — WMGID (What's My Google ID)

## Problem Statement

When a **Staff Member**'s Google SSO breaks in a **Downstream System** (or when admin work requires copying a Staff Member's identity values across systems), nobody has a fast, no-friction way to read back what Google actually returned about that account. The most important value — the **Google ID** (`sub` claim) — isn't surfaced anywhere a Staff Member can self-serve, so support work stalls until someone with database access can look it up or until the Staff Member is talked through opening dev tools mid-OAuth flow. There is no neutral, "let me just see my Google identity" page.

## Solution

WMGID is a single-purpose internal tool. A Staff Member opens `https://wmgid.<dokku-host>/`, clicks "Sign in with Google," and lands on a card showing the **Allow-listed Claims** Google returned about their account — Google ID first and most prominently, with the remaining claims either inline or in a collapsible debug section. They copy the value(s) they need (one-click copy for Google ID, "copy all as JSON" for everything) and paste them into whichever Downstream System needs them. No database, no analytics, no persistence — the cookie *is* the session and disappears when the browser closes.

## User Stories

1. As a Staff Member, I want to sign into WMGID with my `@example.com` Google account, so that I can see the claims Google returns about me.
2. As a Staff Member, I want my **Google ID** displayed prominently with a one-click copy button, so that I can paste it into a Downstream System in one motion.
3. As a Staff Member, I want my email, name, and avatar shown alongside the Google ID, so that I can visually confirm I'm signed into the correct Google account before I copy anything.
4. As a Staff Member debugging a tricky case, I want a "copy all claims as JSON" button, so that I can paste a complete snapshot into a support ticket or Slack thread.
5. As a Staff Member, I want lower-priority OAuth metadata (`iss`, `aud`, `azp`, `iat`) hidden in a collapsed debug section by default, so that the main view stays focused on the values I actually need.
6. As a Staff Member, I want the Hosted Domain (`hd`) shown when present, so that I can confirm I'm signed in with my Workspace account and not my personal Gmail.
7. As a Staff Member, I want the Google ID to *also* appear in the collapsed JSON view alongside the rest of the claims, so that a "copy all as JSON" payload is complete.
8. As a Staff Member whose Workspace SSO is broken in a Downstream System, I want to be able to sign into WMGID with a **Personal Account** as a fallback diagnostic, so that I can confirm WMGID itself is working before troubleshooting the Downstream System.
9. As a Staff Member, I want a session cookie that persists across tab refreshes but disappears when I close my browser, so that I can refresh the page during a debugging session without re-authing but don't leave a stale session on a shared machine.
10. As a Staff Member, I want a one-click "Sign out" button that clears the cookie and returns me to the login screen, so that I can explicitly end my session without closing the browser.
11. As a Staff Member who clicked "Cancel" at Google by mistake, I want a quiet "sign-in cancelled" acknowledgement on the login screen, so that I know the button works and can try again.
12. As an operator deploying WMGID to a context that should be restricted, I want an optional `ALLOWED_HD` env var that locks sign-in to a specific Workspace, so that I can run a restricted instance without changing code.
13. As a Staff Member signing into a WMGID instance with `ALLOWED_HD` set, I want to see the restriction stated on the login screen *before* I click sign-in, so that I pick the right account first time.
14. As a Staff Member who signs in with the wrong account against an `ALLOWED_HD`-restricted instance, I want a clear rejection screen showing the required vs received `hd` (and my received email), so that I understand exactly why I was rejected and can try again with the right account.
15. As a Staff Member, I want WMGID to never use a sign-in I didn't initiate (no silent re-auth from a tampered cookie), so that I can trust what I see on the card.
16. As an operator, I want WMGID to verify Google's ID-token signature server-side, so that the claims shown are cryptographically attributable to Google.
17. As a Staff Member, I want avatar fallback to coloured-circle initials when the Google profile picture is missing or fails to load, so that the card looks intentional in edge cases.
18. As a Staff Member, I want missing claims omitted from the JSON view (rather than rendered as `null`), and null-valued claims rendered dimmed, so that I can tell "Google didn't send this" from "Google sent this as null."
19. As a Staff Member with `email_verified: false`, I want that flagged visibly on the card, so that I (and support) can see the unverified state is part of the broken-SSO picture.
20. As an operator, I want WMGID to deploy on Dokku with `git push`, a `Procfile`, and a `CHECKS` file pointing at `/healthz`, so that zero-downtime deploys "just work" with no custom orchestration.
21. As a developer working locally, I want to point WMGID at a fwd.host tunnel URL via `BASE_URL`, so that Google can hit my local callback over HTTPS during development.
22. As an operator, I want WMGID to log key auth events to stdout (boot, callback received, `hd` rejection, verification failure) but never the raw ID token, so that `dokku logs` is useful without being a credential leak.
23. As a Staff Member, I want the tool to render in dark mode only (the terminal aesthetic), so that the visual signals (mono type, JSON-style colouring) read as "this is a debug tool" rather than "this is a marketing page."
24. As a developer maintaining WMGID, I want a curated allow-list of stored claims (Google ID, email, email_verified, name, given_name, family_name, picture, locale, hd, iss, aud, azp, iat) and explicit exclusions (`exp`, `at_hash`, `nonce`), so that the cookie schema is intentional and not just "whatever Google returned today."

## Implementation Decisions

### Tech stack

- **Server:** Node.js + [Hono](https://hono.dev/) with `@hono/oauth-providers/google` for the OAuth dance and `google-auth-library` (`OAuth2Client.verifyIdToken`) for ID-token verification.
- **Views:** Hono JSX, server-rendered. No client framework beyond Alpine.js for the small interactions (copy buttons, debug-section collapse).
- **CSS:** Tailwind v4 CLI, compiled at build time. No CDN, no PostCSS pipeline.
- **TypeScript:** compiled with `tsc` (no bundler — the server is small enough to not warrant Vite/esbuild).
- **Deploy target:** Dokku, Node buildpack. `Procfile` `web: node dist/index.js`; `CHECKS` pointing at `/healthz`. Production hostname: `wmgid.<dokku-host>`.

### Modules

| Module | Shape | Responsibility |
|---|---|---|
| `auth` | Deep — small interface, encapsulates Google libs | `getAuthorizeUrl(state, hd?)`, `verifyCallback(code) → VerifiedClaims`. Hides `@hono/oauth-providers` and `google-auth-library` from the rest of the app. |
| `claims` | Deep — pure functions | `pickAllowlistedClaims(rawClaims) → StoredClaims`; defines the cookie's schema. Centralises which claims are stored vs dropped. |
| `hdPolicy` | Deep — pure function | `check(received, allowed) → { ok } \| { mismatch, received, required }`. The one place that knows the opt-in restriction rule (see ADR-0002). |
| `cookie` | Shallow — Hono helpers | Thin wrapper over `getSignedCookie`/`setSignedCookie` with the cookie name and flags pre-set. |
| `views/*` | Shallow — templates | `layout`, `card`, `login`, `error` JSX components. Take a `StoredClaims` (or error model) and render. |
| `index.ts` | Shallow — glue | Hono app wiring routes to modules. |

### Routes

- `GET /` — branch on signed cookie: render `card` if present (and parseable), otherwise `login`.
- `GET /auth/google` — redirect to Google with `state` for CSRF and `hd=` if `ALLOWED_HD` is set.
- `GET /auth/google/callback` — verify ID token, run `hdPolicy.check`, on success set the signed cookie and redirect to `/`, on `hd` mismatch render the rejection screen, on verification failure render the failure screen.
- `POST /logout` — clear cookie, redirect to `/`.
- `GET /healthz` — `200 ok` plain text. Used by Dokku zero-downtime deploys.
- `GET /public/*` — serve compiled `style.css`.

### Session shape

Browser-session signed cookie (no `Max-Age`/`Expires`), `HttpOnly`, `Secure`, `SameSite=Lax`, HMAC-SHA256 with `SESSION_SECRET`. Payload is the **Allow-listed Claims** as JSON. See ADR-0001 for why.

Stored claims: `sub`, `email`, `email_verified`, `name`, `given_name`, `family_name`, `picture`, `locale`, `hd`, `iss`, `aud`, `azp`, `iat`. Explicitly dropped: `exp`, `at_hash`, `nonce`.

### Env vars

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — OAuth client credentials.
- `SESSION_SECRET` — 32+ random bytes for cookie HMAC.
- `BASE_URL` — used to construct `redirect_uri`. Production: `https://wmgid.<dokku-host>`. Local: the fwd.host tunnel URL.
- `PORT` — Dokku-injected.
- `ALLOWED_HD` — optional. If set, restrict sign-in to that Workspace (see ADR-0002).

### Visual direction (Variant C — Terminal)

Dark-only by intent. Mono throughout. JSON-viewer body with sky-coloured top-level keys, purple for token-metadata keys (the collapsed debug ones), amber for booleans/numbers. Identity rendered shell-style:

```
❯ wmgid
name="Jane Doe"  email="jane.doe@example.com" [verified]  hd="example.com"

google_id  117812345678901234567   [copy]

▸ token claims (4 hidden)              [copy --json] [show --meta]
```

All section headers use the `❯ wmgid …` framing (`❯ wmgid`, `❯ wmgid --login`, `❯ wmgid --verify`). The full visual source-of-truth is [`../../prototype/google-id-debugger.html`](../../prototype/google-id-debugger.html) (Variant C).

### Rendering rules

- **Missing claim** — omit the line entirely (a real JSON viewer doesn't print absent keys).
- **Null/empty-string claim** — render dimmed (e.g. `picture: null` muted) so absence is distinguishable from missing.
- **`email_verified: false`** — replace `[verified]` chip with a red `[unverified]` chip.
- **`iat`** — render raw unix value with a `// human` comment, e.g. `iat: 1747654320  // 19 May 2026, 14:32 UTC`.
- **Picture fetch fails** — fall back to a deterministic coloured-circle with initials (derived from `name`, or local-part of `email` if `name` is the email).

### Error UX

- **User cancels at Google** — bounce to `/` (login screen) with a muted `// sign-in cancelled` banner above the sign-in button.
- **`hd` mismatch** — terminal-aesthetic rejection screen showing required vs received `hd` and the email signed in with. Single `[ try again ]` button that re-enters the OAuth flow. Cookie not set.
- **Token verification failure** — terminal-aesthetic 400 page, copy: "could not be verified. This usually clears up on retry." Server logs the verification error and the parseable `iss`/`aud` claims, *never* the raw token.
- **Tampered/expired cookie** — silently clear and render the login screen, no banner.

### Security headers

Set via Hono's `secureHeaders()` middleware:
- `Content-Security-Policy: default-src 'self'; img-src 'self' https://lh3.googleusercontent.com; script-src 'self' 'unsafe-eval'` (Alpine requires `unsafe-eval`; trade-off accepted).
- `Strict-Transport-Security: max-age=31536000`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

CSRF on the OAuth flow handled via the `state` parameter (supported by `@hono/oauth-providers`).

## Testing Decisions

A good test for this codebase exercises external behaviour through a module's public interface, not its internals. We are explicitly **not** writing tests for the views, the route wiring, or the Hono/Google library plumbing — those have a manual smoke loop before each deploy.

Test surface, *if* we later choose to add tests (the immediate decision is to ship without):

- **`claims.pickAllowlistedClaims`** — pure function, ideal candidate. Cases: a full token, a personal-account token (no `hd`), a token with extra unexpected claims (should be dropped silently), a token with `email_verified: false`.
- **`hdPolicy.check`** — pure function. Cases: no `ALLOWED_HD` set + any `hd` → ok; `ALLOWED_HD` set + matching `hd` → ok; `ALLOWED_HD` set + mismatching `hd` → mismatch with both values returned; `ALLOWED_HD` set + missing `hd` (personal account) → mismatch.

Prior art: none — fresh repo. Tests would use `node:test` and `node:assert` to avoid pulling in a runner dependency for a ~150-LOC app.

Decision: **ship without tests.** Module boundaries are drawn cleanly enough that tests can be added later without restructuring if the manual smoke loop becomes painful.

## Out of Scope

- Any database, key-value store, or other server-side persistence.
- Showing identity claims for *other* Staff Members (WMGID only ever displays the signed-in account's own claims).
- Federated / SAML / non-Google sign-in providers.
- Multi-account switching within a single session — to view a different account's claims, the Staff Member signs out (or closes the browser) and signs in again.
- Audit logging beyond stdout (no log aggregation, no SIEM integration, no immutable trail).
- Rate limiting, abuse protection, or CAPTCHAs — the tool sits behind internal networking, the OAuth flow itself rate-limits abuse, and there is no API surface to spam.
- Internationalisation — copy is English-only.
- Light mode — see Q10; the terminal aesthetic is dark-only by design.
- Automated tests — see Testing Decisions.
- Light-mode rendering, automated tests, and any kind of "remember me across browser sessions" — explicit decisions, not omissions.

## Further Notes

- The Google `sub` claim is officially Google's stable, unique, never-reused identifier ([source](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [source](https://developers.google.com/identity/siwg/best-practices)). Truffle Security has reported ~0.04% drift in field data; Google disputes. For staff-troubleshooting use, the official guarantee is sufficient.
- The visual source-of-truth is [`../../prototype/google-id-debugger.html`](../../prototype/google-id-debugger.html) (open in a browser, `?variant=c`). It is not production code — Tailwind/Alpine load from CDN there; the real build compiles Tailwind.
- ADRs covering load-bearing decisions: [`../adr/0001-stateless-signed-cookie-session.md`](../adr/0001-stateless-signed-cookie-session.md), [`../adr/0002-opt-in-hosted-domain-restriction.md`](../adr/0002-opt-in-hosted-domain-restriction.md).
- Domain glossary: [`../../CONTEXT.md`](../../CONTEXT.md).
- This PRD was generated from a `/grill-me` session followed by `/grill-with-docs`. All listed decisions were resolved interactively with the project owner.
