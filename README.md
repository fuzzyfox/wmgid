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

### Optional: restrict to a Google Workspace domain

Set `ALLOWED_HD=example.com` to only allow accounts whose `hd` claim matches. Useful if you host this internally for one organisation. Unset = anyone with a Google account can sign in.

## Tests

```sh
npm test
```

## License

MIT — see [LICENSE](LICENSE).

