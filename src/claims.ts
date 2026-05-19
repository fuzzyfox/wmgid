export const ALLOWLISTED_CLAIM_KEYS = [
  'sub',
  'email',
  'email_verified',
  'name',
  'given_name',
  'family_name',
  'picture',
  'locale',
  'hd',
  'iss',
  'aud',
  'azp',
  'iat',
] as const;

export type AllowlistedClaimKey = (typeof ALLOWLISTED_CLAIM_KEYS)[number];

export type StoredClaims = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
  hd?: string;
  iss?: string;
  aud?: string;
  azp?: string;
  iat?: number;
};

export function pickAllowlistedClaims(raw: Record<string, unknown>): StoredClaims {
  const out: Record<string, unknown> = {};
  for (const key of ALLOWLISTED_CLAIM_KEYS) {
    if (key in raw) out[key] = raw[key];
  }
  return out as StoredClaims;
}
