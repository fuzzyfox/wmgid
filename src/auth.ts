import { OAuth2Client } from 'google-auth-library';
import type { StoredClaims } from './claims.js';

export type VerifiedClaims = StoredClaims & { sub: string };

export type AuthDeps = {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
};

/**
 * Module boundary around Google OAuth + ID-token verification. The rest of
 * the app sees only `VerifiedClaims`; swapping the underlying library means
 * touching just this file.
 */
export function createAuth(deps: AuthDeps) {
  const redirectUri = `${deps.baseUrl.replace(/\/$/, '')}/auth/google/callback`;
  const client = new OAuth2Client({
    clientId: deps.clientId,
    clientSecret: deps.clientSecret,
    redirectUri,
  });

  function getAuthorizeUrl(state: string, hd?: string): string {
    return client.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      state,
      ...(hd ? { hd } : {}),
    });
  }

  async function verifyCallback(code: string): Promise<VerifiedClaims> {
    const { tokens } = await client.getToken(code);
    const idToken = tokens.id_token;
    if (!idToken) throw new Error('no id_token in token response');

    const ticket = await client.verifyIdToken({ idToken, audience: deps.clientId });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub) throw new Error('id_token has no sub claim');
    return payload as VerifiedClaims;
  }

  return { getAuthorizeUrl, verifyCallback, redirectUri };
}

export type Auth = ReturnType<typeof createAuth>;
