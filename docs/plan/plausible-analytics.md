# Plan: Plausible Analytics

> Source PRD: `docs/prd/plausible-analytics.md` — server-side, opt-in Plausible integration. ADR-0003 records the server-side-only decision.

## Architectural decisions

Durable decisions that apply across all phases:

- **Opt-in switch**: presence of `PLAUSIBLE_DOMAIN` env var enables analytics. Unset = zero footprint (no outbound calls, no script tags, no CSP changes).
- **Config surface**: two env vars — `PLAUSIBLE_DOMAIN` (site id, optional) and `PLAUSIBLE_HOST` (host without scheme, defaults to `plausible.io`).
- **Transport**: server-side POST to `https://${PLAUSIBLE_HOST}/api/event`. No browser-facing third-party code. CSP stays as-is.
- **Event set** (fixed, no custom props):
  - `pageview` on `GET /`
  - `Sign-in started` on `GET /auth/google`
  - `Sign-in cancelled` on callback with `error=access_denied`
  - `Sign-in success` on callback after session cookie set
  - `Sign-in rejected` on callback when `hd` check fails
  - `Sign-in verify failed` on callback when ID-token verification throws
- **Outbound URL field**: always constructed as `BASE_URL + fixed path` inside the analytics module — never the inbound `c.req.url`. This guarantees OAuth `code`/`state` never reach Plausible.
- **Client IP precedence**: `CF-Connecting-IP` → leftmost segment of `X-Forwarded-For` → `X-Real-IP` → `0.0.0.0`. Forwarded to Plausible via `X-Forwarded-For`.
- **Header forwarding**: `User-Agent` passed through from inbound. `Referer` is never forwarded.
- **Failure mode**: fire-and-forget; errors logged once via `console.warn('[wmgid] analytics:', …)`. Never blocks or fails the user-facing response. No retries.
- **Dependency injection**: a `Tracker` is constructed in `index.ts` and passed into `createApp` as a new `AppDeps` field, mirroring how `auth` is already injected. When `PLAUSIBLE_DOMAIN` is unset the factory returns a no-op tracker so call sites stay unconditional.
- **Privacy contract**: no `props` field is ever sent. No claim, email, `hd`, `sub`, OAuth `code`/`state` ever crosses the analytics seam.

---

## Phase 1: Analytics module + dependency wiring (no-op default)

**User stories**: 1, 2, 3, 11, 12, 13, 15, 16, 17, 18, 19

### What to build

A new `analytics.ts` module exposing a `createAnalytics({ domain, host, baseUrl })` factory that returns a `Tracker` with a single `track(eventName, request, path)` method. Internally it constructs the outbound URL from `baseUrl + path` (never `request.url`), derives the client IP via the documented precedence, forwards `User-Agent`, and POSTs to `https://${host}/api/event` fire-and-forget with `console.warn` on failure. When `domain` is undefined the factory returns a no-op tracker.

`index.ts` reads `PLAUSIBLE_DOMAIN` and `PLAUSIBLE_HOST` (defaulting to `plausible.io`), constructs the tracker, and passes it into `createApp` as a new dep. `AppDeps` gains a `tracker: Tracker` field. No track call sites are wired in this phase — call sites land in Phase 2. The app continues to behave exactly as today.

### Acceptance criteria

- [ ] `createAnalytics` returns a no-op tracker when `domain` is undefined (verified with a captured `fetch` — never called).
- [ ] When enabled, outbound URL is exactly `https://${host}/api/event`.
- [ ] Outbound body includes `name`, `domain`, and a `url` field built from `BASE_URL + path` — **not** the inbound request URL — verified by passing a request whose `url` contains query strings and asserting they do not appear in the outbound body.
- [ ] Outbound body never contains a `props` field.
- [ ] `X-Forwarded-For` derivation covered by separate tests for each of: `CF-Connecting-IP` only, `X-Forwarded-For` only (with multiple comma-separated entries), `X-Real-IP` only, and a combined header set asserting `CF-Connecting-IP` wins. Fallback is `0.0.0.0`.
- [ ] `User-Agent` is forwarded from the inbound request; `Referer` is not forwarded.
- [ ] A rejected `fetch` does not throw out of `track()` and surfaces a single `console.warn`.
- [ ] `index.ts` constructs the tracker from env and injects it into `createApp`; with `PLAUSIBLE_DOMAIN` unset, no outbound calls occur during a full request lifecycle.
- [ ] Existing tests continue to pass with a no-op or capturing tracker injected as a dep.

---

## Phase 2: Pageview + sign-in funnel events

**User stories**: 4, 5, 6, 7, 8, 9, 10, 14

### What to build

Wire `tracker.track(...)` into the existing Hono handlers at exactly five sites: top of `GET /` (pageview); inside `GET /auth/google` before the redirect (`Sign-in started`); and inside the `/auth/google/callback` handler — `Sign-in cancelled` on `error=access_denied`, `Sign-in success` after the session cookie is set, `Sign-in rejected` in the `hd`-fail branch, `Sign-in verify failed` in the `catch`. No payload contains claims, email, `hd`, or OAuth params — the tracker enforces this and the handlers don't try to pass them. Tracker calls run concurrently with the response and never block redirect/HTML emission.

App-level tests use a capturing `Tracker` fake as a dep and assert each route fires the expected event exactly once. Payload-shape assertions stay in `analytics.test.ts`.

### Acceptance criteria

- [ ] `GET /` records one `pageview` call regardless of whether a session cookie is present.
- [ ] `GET /auth/google` records one `Sign-in started` call before redirecting to Google.
- [ ] Callback with `error=access_denied` records one `Sign-in cancelled` call.
- [ ] Callback success path records one `Sign-in success` call after the session cookie is set.
- [ ] Callback `hd` rejection records one `Sign-in rejected` call.
- [ ] Callback verification failure records one `Sign-in verify failed` call.
- [ ] Failed Plausible network calls do not change response status, body, redirect target, or cookie state on any of the above routes (verified by making the capturing tracker throw).
- [ ] No track call site reads or forwards email, `hd`, `sub`, OAuth `code`, or `state` — verified by spying on the capturing tracker's arguments.

---

## Phase 3: Operator documentation

**User stories**: 20

### What to build

Update the README so an operator can make an informed opt-in decision. Add `PLAUSIBLE_DOMAIN` and `PLAUSIBLE_HOST` to the config table with their defaults and effect. Add a short prose section stating that analytics is server-side only, lists the fixed event set, names the data forwarded to Plausible (derived client IP + `User-Agent`), and reaffirms that no Google claim, email, `hd`, `sub`, or OAuth parameter ever reaches Plausible. Note that ADR-0003 explains the server-side-only choice.

### Acceptance criteria

- [ ] README config table lists `PLAUSIBLE_DOMAIN` (optional, enables analytics) and `PLAUSIBLE_HOST` (optional, defaults to `plausible.io`).
- [ ] README explains that analytics is server-side only and enumerates the six event names.
- [ ] README explicitly states what is and is not forwarded to Plausible (forwarded: derived client IP, `User-Agent`; not forwarded: claims, email, `hd`, OAuth `code`/`state`, `Referer`, raw request URL).
- [ ] README points to `docs/adr/0003-server-side-plausible-analytics.md` for the architectural rationale.
- [ ] No UI copy or `CONTEXT.md` glossary changes — "Plausible," "pageview," and "tracker" remain implementation detail.
