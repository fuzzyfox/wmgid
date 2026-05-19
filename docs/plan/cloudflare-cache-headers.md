# Plan: Cloudflare cache-header hardening

> Source: [../prd/wmgid.md § Security headers](../prd/wmgid.md)
> Related: [ADR-0001 — Stateless signed-cookie session](../adr/0001-stateless-signed-cookie-session.md), [ADR-0003 — Server-side Plausible analytics](../adr/0003-server-side-plausible-analytics.md) (documents the Cloudflare → Dokku → Node topology)

## Context

`wmgid.wduyck.me` sits behind Cloudflare. `GET /` renders authenticated per-user HTML — the signed-in user's `sub`, `email`, `name`, `picture`, and full claims JSON are inlined into the response by `src/views/card.tsx`. `GET /auth/google/callback` issues `Set-Cookie` and can also render user-specific HTML on `hd` rejection or token-verify failure.

Before this work the app set no `Cache-Control` header on any dynamic route. Cloudflare reported `cf-cache-status: DYNAMIC` only because of CF's default "don't cache HTML without explicit Cache-Control" behaviour — a single misapplied Page Rule / Cache Rule with "Cache Everything" away from serving user A's signed-in `/` to user B from the edge cache. The same risk applied to any future intermediate proxy or shared browser cache.

## Architectural decisions

Durable decisions that apply to this and any future caching work:

- **Primary defense**: `Cache-Control: private, no-store` on every dynamic response. This is the directive shared caches (Cloudflare included) honour for opting out of caching.
- **Defense-in-depth for Cloudflare**: `Cloudflare-CDN-Cache-Control: no-store` is the most specific CF directive and overrides any zone-level "Cache Everything" rule. Set unconditionally alongside `Cache-Control` on dynamic responses.
- **`Vary: Cookie` is additive, not load-bearing**: Cloudflare does **not** vary its cache key by `Cookie` — only `Accept-Encoding`. `Vary: Cookie` is set for HTTP correctness and for downstream browser shared caches, but it is not what protects against the CF leak. Do not rely on it.
- **Static assets keep their own Cache-Control**: `serveStatic` already supplies `Cache-Control: max-age=14400` on `/public/*`, observable as `cf-cache-status: HIT`. The dynamic-default middleware must never clobber this.
- **Implementation seam**: a single post-response middleware in `src/app.tsx` that runs `await next()` then writes the no-store headers *only if* no `Cache-Control` is already present. This keeps the dynamic-vs-static distinction declarative — anything that wants to be cacheable sets its own `Cache-Control`; everything else is uncacheable by default.
- **Scope**: this plan covers HTTP cache directives only. Cloudflare zone configuration (Page Rules, Cache Rules, Transform Rules) is operator concern and out of scope.

---

## Phase 1: Default-deny cache middleware

### What to build

A post-response middleware registered on `*` in `createApp` (`src/app.tsx`), placed immediately after `secureHeaders(...)`. After awaiting `next()`, it checks `c.res.headers.has('Cache-Control')`; if absent, it sets:

- `Cache-Control: private, no-store`
- `Cloudflare-CDN-Cache-Control: no-store`
- `Vary: Cookie` — appended to any existing `Vary` (preserves `Accept-Encoding` if present)

Routes that already set their own `Cache-Control` (notably `serveStatic` on `/public/*`) are untouched. No route-handler changes are required.

The PRD's Security headers section (`docs/prd/wmgid.md`) is updated to document the new defaults next to the existing CSP/HSTS list.

### Acceptance criteria

- [x] `GET /` (no cookie, login page) returns `Cache-Control: private, no-store`, `Cloudflare-CDN-Cache-Control: no-store`, and a `Vary` header containing `Cookie`.
- [x] `GET /` (valid session, claims rendered) returns the same three headers.
- [x] `GET /auth/google` redirect returns the same three headers.
- [x] `GET /auth/google/callback` success redirect — which carries `Set-Cookie` — returns the same three headers.
- [x] `POST /logout` returns the same three headers.
- [x] `GET /healthz` returns the same three headers.
- [x] A route that explicitly sets its own `Cache-Control` (the regression case mirroring `serveStatic`'s behaviour on `/public/*`) keeps its value unchanged and does **not** receive `Cloudflare-CDN-Cache-Control`.
- [x] All existing tests continue to pass; `tsc` clean.
- [x] PRD § Security headers documents the new defaults and the `/public/*` exemption.

### Post-deploy verification

- `curl -sI https://wmgid.wduyck.me/ | grep -iE 'cache-control|vary|cloudflare-cdn|cf-cache-status'` shows `Cache-Control: private, no-store`, `Cloudflare-CDN-Cache-Control: no-store`, `Vary` containing `Cookie`, and `cf-cache-status: DYNAMIC` (or `BYPASS`).
- `curl -sI https://wmgid.wduyck.me/public/style.css | grep -iE 'cache-control|cf-cache-status'` still shows `Cache-Control: max-age=14400` and `cf-cache-status: HIT`.
