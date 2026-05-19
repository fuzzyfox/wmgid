/**
 * Pure formatting helpers for the card. Kept separate so they can be tested
 * without the JSX layer.
 */

export function iatHuman(iat: number): string {
  return new Date(iat * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace('.000Z', ' UTC');
}

export function initials(seed: string): string {
  return seed
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]!)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function avatarBg(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 65% 45%)`;
}

const PRIMARY_KEYS = [
  'sub',
  'email',
  'email_verified',
  'name',
  'given_name',
  'family_name',
  'picture',
  'locale',
  'hd',
] as const;

const META_KEYS = ['iss', 'aud', 'azp', 'iat'] as const;

export type PrimaryClaimKey = (typeof PRIMARY_KEYS)[number];
export type MetaClaimKey = (typeof META_KEYS)[number];

export function primaryEntries(
  claims: Record<string, unknown>,
): Array<[PrimaryClaimKey, unknown]> {
  return PRIMARY_KEYS
    .filter((k) => k in claims)
    .map((k) => [k, claims[k]] as [PrimaryClaimKey, unknown]);
}

export function metaEntries(
  claims: Record<string, unknown>,
): Array<[MetaClaimKey, unknown]> {
  return META_KEYS
    .filter((k) => k in claims)
    .map((k) => [k, claims[k]] as [MetaClaimKey, unknown]);
}
