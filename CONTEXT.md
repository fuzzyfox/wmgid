# WMGID

**WMGID** — *"What's My Google ID"* — is an internal staff tool that signs a staff member in with Google and shows them the claims Google returned about their account. It exists so staff can read back values (most often their **Google ID**) and feed them into a **Downstream System** for debugging, admin, or relinking work.

## Language

**WMGID**:
The tool itself. Pronounced as letters; never expand the acronym in UI copy beyond the page title and README.
_Avoid_: "the Google ID tool", "the debug page"

**Staff Member**:
A staff employee using WMGID. The only user role — WMGID has no public surface.
_Avoid_: User, staffer, employee

**Google ID**:
The stable, never-reused identifier Google issues for a Google account. The headline value WMGID exists to surface.
_Avoid_: Google account number, user ID
_Technical synonym_: `sub` (the JWT claim name). Google's own docs call it "Subject ID".

**Downstream System**:
Any internal system, other than WMGID itself, that consumes a Google ID or other Google OAuth claim. The "thing the staff member is going to paste the value into." Plural and generic by design — WMGID does not know or care which one.
_Avoid_: "the other system", "target system", "relink target" (too narrow — relinking is one use case among many)

**Hosted Domain**:
The `hd` claim Google adds when a sign-in is from a Google Workspace account. Present only for Workspace accounts; absent on personal `@gmail.com` accounts.
_Avoid_: Domain, workspace

**Workspace Account / Personal Account**:
Two flavours of Google account a staff member might sign in with. Workspace accounts (e.g. `@example.com`) carry an `hd` claim; personal accounts (e.g. `@gmail.com`) do not. The distinction matters because some debugging flows need a personal-account fallback (see ADR-0002).

**Allow-listed Claim**:
A claim that WMGID stores in the session cookie and displays on the card. Explicitly enumerated — not "everything Google returned". The allow-list is the cookie's schema.
_Avoid_: "the claims", "token data"

## Relationships

- A **Staff Member** signs into **WMGID** with a **Workspace Account** or **Personal Account**.
- WMGID extracts the **Allow-listed Claims** — most importantly the **Google ID** — and displays them.
- The **Staff Member** copies the values they need into a **Downstream System**.
- If `ALLOWED_HD` is set, WMGID rejects sign-ins whose **Hosted Domain** doesn't match.

## Example dialogue

> **Dev:** "If a staff member signs in with their personal Gmail, do we still show them their Google ID?"
> **Domain expert:** "Yes — the Google ID is stable and unique whatever account they signed in with. The Hosted Domain just won't be present in their claims. That's actually a feature: if their Workspace SSO is broken in a Downstream System, they may need to sign into WMGID with a personal account to confirm WMGID itself works."

> **Dev:** "We say the tool is for relinking — should I call the field 'Relink Target' instead of 'Downstream System'?"
> **Domain expert:** "Relinking is one reason a staff member uses these values, but they might also be checking which Workspace a teammate's account belongs to, or capturing a Google ID for a new admin record. Keep it generic — Downstream System."

## Flagged ambiguities

- "Staff" was used as both noun and modifier; resolved — **Staff Member** is the noun for an individual user; "staff-facing" is fine as an adjective.
- "Google ID", "`sub`", "Subject ID" all referred to the same value; resolved — **Google ID** is the canonical product term, `sub` is the technical synonym used in code and the card subtitle, "Subject ID" appears only when quoting Google's docs.
- "The other system" / "downstream system" / "target system" all referred to the same role; resolved — **Downstream System**, generic and plural by intent.
