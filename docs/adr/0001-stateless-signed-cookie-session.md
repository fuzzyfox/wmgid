# Stateless signed-cookie session, no database

WMGID has no database and no server-side session store. The Allow-listed Claims returned by Google are stored directly in a single HMAC-signed cookie (`HttpOnly`, `Secure`, `SameSite=Lax`) with no `Max-Age` or `Expires`, making it a browser-session cookie that disappears when the browser closes.

The cookie deliberately omits the ID token's `exp`, `at_hash`, and `nonce` claims: WMGID does not re-verify the token after the initial OAuth callback, so an expiry would only force a needless re-auth mid-debug-session. The signed payload is the entire session — there is nothing to look up.

This shape was chosen because (1) the tool stores no information about a Staff Member that isn't already in their Google account, so a database would be pure overhead; (2) browser-session lifetime matches the typical use ("sign in, copy a value, close the tab"); and (3) keeping the server stateless makes Dokku deploys, container restarts, and horizontal scaling trivially safe — there is no state to migrate or invalidate.
