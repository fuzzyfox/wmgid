# WMGID — What's My Google ID

A single-purpose internal staff tool. A Staff Member signs in with Google and sees the allow-listed claims Google returned about their account — most importantly their **Google ID** (`sub` claim) — with one-click copy.

See [`docs/prd/wmgid.md`](docs/prd/wmgid.md) for the full PRD, [`docs/plan/wmgid.md`](docs/plan/wmgid.md) for the phased implementation plan, and [`docs/adr/`](docs/adr/) for load-bearing decisions.

## Stack

- Node 20+
- [Hono](https://hono.dev/) + JSX views
- Tailwind v4 CLI (compiled at build time)
- Alpine.js for the small client interactions
- Signed-cookie session, no database (see ADR-0001)

## Local dev

1. Copy `.env.example` to `.env` and fill in the values. For Google OAuth credentials, create an OAuth 2.0 client at <https://console.cloud.google.com/apis/credentials>.
2. To receive Google's OAuth redirect locally over HTTPS, expose the dev server via [fwd.host](https://fwd.host) (or any HTTPS tunnel). Set `BASE_URL` to the tunnel URL and add `<BASE_URL>/auth/google/callback` to the Google client's authorised redirect URIs.
3. Install and run:

   ```sh
   npm install
   npm run dev
   ```

   This compiles Tailwind once, then runs the TypeScript server with hot reload. Run `npm run dev:css` in a second terminal to recompile CSS on change.

## Build & run

```sh
npm run build   # compiles TS to dist/ and Tailwind to public/style.css
npm start       # runs dist/index.js
```

## Deploy (Dokku)

```sh
git remote add dokku dokku@<dokku-host>:wmgid
git push dokku main
```

`Procfile` boots `node dist/index.js`. `CHECKS` polls `/healthz` for zero-downtime deploys. Production hostname: `wmgid.<dokku-host>`.

Set env vars on the deployed app:

```sh
dokku config:set wmgid GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… SESSION_SECRET=… BASE_URL=https://wmgid.<dokku-host>
# optional:
dokku config:set wmgid ALLOWED_HD=example.com
```

## Tests

```sh
npm test
```

Tests cover the pure modules (`claims`, `hdPolicy`) and route-level integration via `app.request()`. Views are smoke-tested manually before each deploy.
