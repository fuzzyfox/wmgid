# Hosted-domain restriction is opt-in, default unrestricted

WMGID accepts any Google account by default. A `ALLOWED_HD` environment variable enables an opt-in restriction: when set, WMGID passes `hd=<value>` on the auth request *and* server-side verifies the `hd` claim in the callback, rejecting mismatches. When unset, no `hd` hint is sent and any account is accepted.

The obvious default for an internal tool would be "lock to the company's Workspace domain". We chose the opposite default because WMGID's primary use case is **debugging broken Google SSO** — and the most useful diagnostic move when a Staff Member's Workspace SSO is misbehaving in a Downstream System is to sign into WMGID with a Personal Account to confirm WMGID itself works. A hard domain lock would defeat that.

The restriction is still available for deployments that need it (e.g. a production replica where the broken-SSO diagnostic isn't relevant), and is exposed on the logged-out screen as a visible hint (`// restricted to @<domain>`) so Staff Members pick the right account before signing in rather than after.
