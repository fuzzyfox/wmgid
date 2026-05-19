# Prototype — Google ID Debugger UI

**Question:** Of three distinct UI aesthetics, which best fits the "internal staff support tool" feel for retrieving a Google `sub` claim?

**Run it:** open `prototype/google-id-debugger.html` directly in a browser. No build step — Tailwind v4 and Alpine.js load from CDN. The real app will use compiled Tailwind v4 CLI per the handoff.

**Switching:**
- Floating bottom bar: ← / → arrows cycle A → B → C. Arrow keys work too.
- `logged in` / `logged out` button toggles the pre-auth state for the current variant.
- URL is reload-stable: `?variant=a&state=in` etc.

## Variants

| Key | Name | Direction |
|-----|------|-----------|
| A | Classic card | 480px centred card on muted bg. Avatar top-centre, `sub` in a dashed-border "copy box", collapsed accordion at the bottom. Support-tool conservative. |
| B | Dashboard | `sub` is a large monospace banner across a coloured header. Two-column body: identity rail on left, claims table on right. Developer-tool feel. |
| C | Terminal | Mono throughout, dark-first, JSON-viewer body with syntax-style colouring, `sub` as a shell-prompt copy line. Very debug-flavoured. |

## Shared behaviour (all three)
- `sub` is the hero — prominent, one-click copy, always in the main area (never inside the collapsed section).
- `iss`, `aud`, `azp`, `iat` live in a debug accordion that's **closed by default**.
- "Copy all claims as JSON" present in every variant.
- Avatar `<img>` `onerror` falls back to a deterministic coloured circle with the user's initials. (Force fallback in DevTools by blocking the Google image URL.)
- Dark mode via `prefers-color-scheme` (Variant C is dark-only by design).
- Logout is a `POST` form button (form intercepted in the prototype with `@submit.prevent` so refreshing isn't disruptive).
- Pre-auth view uses Google's official 4-colour G mark on a white pill, per their branding guidelines.

## Verdict
_To be filled in after review. The interesting feedback is usually "I want X from one with Y from another" — note that here._
