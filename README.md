# WMGID — What's My Google ID

A tiny open-source debugging / curiosity tool. Sign in with Google and see the allow-listed claims Google returned about your account — most importantly your **Google ID** (`sub` claim) — with one-click copy.

Useful when you need to find your own (or a teammate's) Google ID to plug into another system, or just want to see what an OpenID Connect `id_token` actually contains.

**No server-side persistence.** No database, no logs of your claims. The only state is a signed-cookie session in your own browser, scoped to your session.

## Run it locally

1. Create an OAuth 2.0 client at <https://console.cloud.google.com/apis/credentials>.
2. Copy `.env.example` to `.env` and fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, and `BASE_URL`.
3. To receive Google's OAuth redirect locally over HTTPS, expose the dev server via [fwd.host](https://fwd.host) or any HTTPS tunnel. Set `BASE_URL` to the tunnel URL and add `<BASE_URL>/auth/google/callback` to the Google client's authorised redirect URIs.
4. Install and run:

   ```sh
   npm install
   npm run dev
   ```

## Build & run

```sh
npm run build
npm start
```

## Configuration

| Env var                | Required | Purpose                                                                 |
| ---------------------- | -------- | ----------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | yes      | OAuth 2.0 client ID from Google Cloud Console                           |
| `GOOGLE_CLIENT_SECRET` | yes      | OAuth 2.0 client secret                                                 |
| `SESSION_SECRET`       | yes      | HMAC key for the signed-cookie session (any long random string)         |
| `BASE_URL`             | yes      | Public base URL of the deployed app, used to build the OAuth redirect   |
| `ALLOWED_HD`           | no       | Restrict sign-in to a single Google Workspace hosted domain (see below) |
| `PLAUSIBLE_DOMAIN`     | no       | Plausible site identifier. Setting this enables analytics (see below)   |
| `PLAUSIBLE_HOST`       | no       | Plausible host (no scheme). Defaults to `plausible.io`; point at a self-hosted instance to keep data on your own infra |

### Optional: restrict to a Google Workspace domain

Set `ALLOWED_HD=example.com` to only allow accounts whose `hd` claim matches. Useful if you host this internally for one organisation. Unset = anyone with a Google account can sign in.

### Optional: server-side Plausible analytics

Setting `PLAUSIBLE_DOMAIN` enables a minimal, opt-in analytics integration. When unset there is **zero analytics footprint** — no outbound calls, no script tag, no CSP additions.

Analytics is **server-side only**: WMGID's Node process POSTs events directly to Plausible. The browser never talks to Plausible, so the CSP stays as locked-down as without analytics, and no third-party script runs in the Staff Member's session.

The fixed event set is:

- `pageview` — on every `GET /`
- `Sign-in started` — when a Staff Member clicks "Sign in with Google"
- `Sign-in cancelled` — when Google's consent screen is dismissed
- `Sign-in success` — when the session cookie is set
- `Sign-in rejected` — when the `hd` check fails
- `Sign-in verify failed` — when ID-token verification throws

**Forwarded to Plausible**: the derived client IP (via `CF-Connecting-IP` → leftmost `X-Forwarded-For` → `X-Real-IP`) and the inbound `User-Agent`. The `url` field is always built from `BASE_URL` plus a fixed path, never the raw request URL.

**Never forwarded**: Google claims, email, `hd`, `sub`, OAuth `code`/`state`, the inbound `Referer` header, or any custom event properties. The "no server-side persistence" promise still holds — WMGID stores nothing about the Staff Member; the outbound events sit in Plausible.

If Plausible is unreachable, the call is logged once via `console.warn` and sign-in continues unaffected.

The server-side-only choice is recorded in [`docs/adr/0003-server-side-plausible-analytics.md`](docs/adr/0003-server-side-plausible-analytics.md).

## Tests

```sh
npm test
```

## License

MIT — see [LICENSE](LICENSE).

