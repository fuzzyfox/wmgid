# PRD — Plausible analytics for WMGID

## Problem Statement

The WMGID operator has no visibility into how the tool is actually used. Is it hit once a week or fifty times a day? Are Staff Members getting past the **Hosted Domain** gate, or being rejected? Are sign-ins failing silently at the verification step? Without basic usage signal, there's no way to tell whether WMGID is healthy, whether a configuration change broke something for real users, or whether the tool is even being adopted enough to keep maintaining. The existing privacy posture — no database, no logs of claims — means there's also no existing place to bolt usage stats onto.

## Solution

Add an opt-in Plausible integration that emits a small, fixed set of events from the server, with no third-party code in the browser. When `PLAUSIBLE_DOMAIN` is set, WMGID's Hono handlers fire pageviews and sign-in outcome events directly to Plausible's events API; when unset, no analytics code runs and there is no third-party footprint at all. Self-hosters can point at their own instance via `PLAUSIBLE_HOST`. The event set is deliberately narrow — a pageview on `/`, plus `Sign-in started`, `Sign-in cancelled`, `Sign-in success`, `Sign-in rejected`, and `Sign-in verify failed` — and carries no custom properties, so no Google claim, OAuth state, or email value ever reaches Plausible.

## User Stories

1. As an operator, I want to enable analytics with a single env var (`PLAUSIBLE_DOMAIN`), so that I can opt in without code changes.
2. As an operator self-hosting Plausible, I want to point WMGID at my own instance via `PLAUSIBLE_HOST`, so that data never leaves my infrastructure.
3. As an operator running WMGID without analytics, I want zero analytics footprint when `PLAUSIBLE_DOMAIN` is unset — no script tag, no outbound calls, no CSP additions — so that the no-third-party-footprint default is real, not nominal.
4. As an operator, I want to see how many Staff Members hit the WMGID landing page per day, so that I can tell whether the tool is being used.
5. As an operator, I want a `Sign-in started` event when a Staff Member clicks "Sign in with Google," so that I can measure the top of the funnel.
6. As an operator, I want a `Sign-in success` event when a Staff Member lands on the Card view, so that I can measure successful sign-ins.
7. As an operator, I want a `Sign-in cancelled` event when a Staff Member backs out at Google's consent screen, so that started-but-no-outcome counts add up.
8. As an operator, I want a `Sign-in rejected` event when the `hd` check fails, so that I can spot a misconfigured `ALLOWED_HD` or a Staff Member repeatedly signing in with the wrong account.
9. As an operator, I want a `Sign-in verify failed` event when Google's ID-token verification throws, so that I can detect verification breakage (clock skew, key rotation issue, etc.) before someone reports it.
10. As an operator, I want accurate unique-visitor counts on the outcome events, so that "10 sign-in attempts" reflects 10 distinct people rather than one person retrying.
11. As a Staff Member using WMGID, I want my Google claims, email, `hd`, and OAuth `code`/`state` to never reach Plausible, so that the "no logs of your claims" promise in the README still holds.
12. As a Staff Member, I want Plausible to never see the raw OAuth callback URL (which contains Google's `code`), so that an analytics integration can't accidentally leak credentials.
13. As a Staff Member, I want WMGID's browser experience unchanged when analytics is enabled — no extra third-party script, no widened CSP — so that the security headers stay as locked-down as they are today.
14. As an operator, I want a console warning (not a user-facing error) if Plausible is unreachable, so that a Plausible outage never breaks sign-in.
15. As an operator deploying behind Cloudflare and Dokku, I want WMGID to forward the *real* client IP (not the Dokku container's neighbour, not Cloudflare's edge IP), so that Plausible's unique-visitor counts are accurate.
16. As an operator, I want WMGID to derive the client IP using `CF-Connecting-IP` → leftmost `X-Forwarded-For` → `X-Real-IP`, so that the proxy chain is walked correctly in the default deploy topology.
17. As a developer maintaining WMGID, I want all Plausible-bound URLs constructed from `BASE_URL` plus a fixed path string inside the analytics helper, so that the raw request URL can never accidentally be shipped to Plausible.
18. As a developer, I want the analytics module to expose a small, testable interface that the route handlers call once each, so that the privacy guarantees are enforced in one place rather than scattered across handlers.
19. As a developer, I want analytics to be wired into `createApp` as an injected dependency, so that tests can substitute a no-op or capturing fake without touching the network.
20. As an operator, I want the README to document `PLAUSIBLE_DOMAIN` and `PLAUSIBLE_HOST` in the config table, and to state plainly that analytics is server-side only and forwards client IP + UA, so that I can make an informed call before enabling it.

## Implementation Decisions

### Modules

- **`analytics.ts` (new)** — deep module encapsulating all Plausible interaction. Single exported factory `createAnalytics({ domain, host, baseUrl })` returns a `Tracker` with one method `track(eventName, request, path)`. Internals: builds the outbound URL from `baseUrl + path` (never the request URL), derives client IP via the documented precedence, swallows fetch errors with `console.warn`, fire-and-forget. When `domain` is undefined the factory returns a no-op `Tracker` whose `track()` is a function that returns immediately — keeps call sites unconditional.
- **`index.ts` (modified)** — reads `PLAUSIBLE_DOMAIN` (optional) and `PLAUSIBLE_HOST` (defaults to `plausible.io`) from env, constructs the `Tracker`, passes it into `createApp` as a new dep.
- **`app.tsx` (modified)** — adds `tracker: Tracker` to `AppDeps`. Calls `tracker.track('pageview', c.req, '/')` at the top of `GET /`. Calls `tracker.track('Sign-in started', c.req, '/auth/google')` in the `/auth/google` handler. Inside the callback: `Sign-in cancelled` on `error=access_denied`, `Sign-in success` after the cookie is set, `Sign-in rejected` in the `hd` branch, `Sign-in verify failed` in the catch.
- **No view changes.** No `<script>` tag, no Layout plumbing, no conditional CSP.

### Configuration

| Env var            | Required | Purpose                                                                |
| ------------------ | -------- | ---------------------------------------------------------------------- |
| `PLAUSIBLE_DOMAIN` | no       | Plausible site identifier. Setting this enables analytics.             |
| `PLAUSIBLE_HOST`   | no       | Plausible host (no scheme). Defaults to `plausible.io`. Self-host here.|

### Privacy contract enforced inside `analytics.ts`

- Outbound `url` is always `https://${baseUrl-host}${fixed-path}` — never `c.req.url`.
- No `props` field is ever sent. No claim, email, `hd`, `sub`, OAuth `code`/`state`.
- `X-Forwarded-For` on the outbound request is the single derived client IP. `User-Agent` is passed through from inbound.
- No `Referer` header is forwarded.
- IP precedence: `CF-Connecting-IP` → leftmost segment of `X-Forwarded-For` → `X-Real-IP`. Falls back to `0.0.0.0` if nothing is present (preserves the call rather than spoofing the container IP).

### Failure mode

- Outbound `fetch` to Plausible is awaited inside a `try`/`catch` but never blocks the user-facing response — the route handler returns its HTML/redirect synchronously and the analytics call runs concurrently. Errors are logged once via `console.warn('[wmgid] analytics:', message)`. No retries.

### Architectural rationale (recorded in ADR-0003)

- Fully server-side rather than the standard browser script — see `docs/adr/0003-server-side-plausible-analytics.md`. Driven by the OAuth-`code`-in-URL leak risk on the Rejected/VerifyFailed pages, the desire to keep CSP locked down, and the materially better privacy story of "the browser never talks to Plausible."

## Testing Decisions

A good test for this feature asserts **observable external behaviour** of the analytics module — what URL it POSTs to, what headers it sends, what body shape it produces — rather than how it constructs them internally. Tests should never hit the network; the `fetch` boundary is the seam.

- **`analytics.test.ts` (new)** — covers the deep module in isolation. With a captured `fetch`, assert:
  - When `domain` is undefined, `track()` is a no-op (no `fetch` call).
  - Outbound URL is `https://${host}/api/event`.
  - Body includes `name`, `domain`, `url` constructed from `BASE_URL + path` (and crucially does **not** include the inbound request URL even when the inbound request has query strings).
  - Body never contains a `props` field.
  - `X-Forwarded-For` is derived in the documented precedence — one test each for `CF-Connecting-IP` only, `X-Forwarded-For` only, `X-Real-IP` only, and a combined header set asserting `CF-Connecting-IP` wins.
  - `User-Agent` is forwarded from the inbound request; `Referer` is not.
  - A rejected `fetch` does not throw and surfaces a `console.warn`.
- **`app.test.tsx` (modified)** — uses a capturing `Tracker` fake passed as a dep. Asserts that hitting `GET /` records one `pageview` call; the `/auth/google` redirect records `Sign-in started`; the callback paths record the right outcome event for each branch (success, rejected, verify-failed, cancelled). These tests should not assert on payload shape — that's `analytics.test.ts`'s job.

Prior art: `auth.ts` is already injected into `createApp` as a dep and `app.test.tsx` substitutes a fake. The new `Tracker` follows the same shape. `hdPolicy.ts` is the closest analogue for a small pure module with focused unit tests — analytics tests should match its style.

## Out of Scope

- Client-side interaction events (e.g. "Copy button clicked"). If wanted later, a tiny `POST /track/:event` endpoint can be added without revisiting the server-side architecture.
- A `Sign-in cancelled` distinction between "user clicked cancel" and "user closed the tab." The latter is unobservable from the server.
- Bot filtering. Server-side events bypass Plausible's browser-based bot heuristics; for this tool's volume the noise is tolerable and visible if it ever matters.
- Origin-firewall hardening to guarantee `CF-Connecting-IP` is trustworthy. That's a deploy-config concern, not a code concern.
- Renaming or restructuring existing logging in `app.tsx`. Analytics is additive; the existing `console.log` lines stay.
- A UI affordance to tell Staff Members that analytics is enabled. The README documents the integration; Staff Members of an internal staff tool don't need a banner.

## Further Notes

- The `CONTEXT.md` glossary is unchanged. "Plausible," "pageview," and "tracker" are implementation detail, not domain language — they should not appear in any UI copy.
- The README's "No server-side persistence" claim remains accurate when analytics is enabled: WMGID still stores nothing about the Staff Member. The outbound events to Plausible are clearly documented in the README's config section so the operator opting in understands the trade.
- ADR-0003 captures the server-side-only decision; future maintainers wondering "why no `<script>` tag?" should find their answer there.
