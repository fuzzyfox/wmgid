import { createHmac, timingSafeEqual } from 'node:crypto';
import type { StoredClaims } from './claims.js';

export const COOKIE_NAME = 'wmgid_session';

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

export function encodeSession(claims: StoredClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function decodeSession(cookie: string, secret: string): StoredClaims | null {
  if (!cookie) return null;

  const parts = cookie.split('.');
  if (parts.length !== 2) return null;

  const [payload, sig] = parts;

  const expected = sign(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as StoredClaims;
  } catch {
    return null;
  }
}
