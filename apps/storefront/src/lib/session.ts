import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { loadConfig } from './config';

export type SessionRole = 'customer' | 'staff';

export interface SessionPayload {
  userId: number;
  username: string;
  role: SessionRole;
  iat: number;
}

export const SESSION_COOKIE_NAME = 'cc_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

/**
 * Constant-time signature comparison -- same length-mismatch-safe pattern orders-api's
 * internal-auth plugin uses for its X-Internal-Key check.
 */
function signaturesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  const lengthsMatch = bufA.length === bufB.length;
  const isMatch = timingSafeEqual(bufA, lengthsMatch ? bufB : bufA);
  return lengthsMatch && isMatch;
}

export function createSessionCookieValue(payload: Omit<SessionPayload, 'iat'>): string {
  const config = loadConfig();
  const full: SessionPayload = { ...payload, iat: Date.now() };
  const payloadB64 = Buffer.from(JSON.stringify(full)).toString('base64url');
  return `${payloadB64}.${sign(payloadB64, config.SESSION_SECRET)}`;
}

/** Verifies the signature and expiry of a raw session cookie value. Never throws. */
export function verifySessionCookieValue(value: string | undefined): SessionPayload | null {
  if (!value) return null;
  const dotIndex = value.lastIndexOf('.');
  if (dotIndex === -1) return null;
  const payloadB64 = value.slice(0, dotIndex);
  const signature = value.slice(dotIndex + 1);

  const config = loadConfig();
  if (!signaturesMatch(signature, sign(payloadB64, config.SESSION_SECRET))) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof payload.iat !== 'number' || Date.now() - payload.iat > SESSION_TTL_SECONDS * 1000) {
    return null;
  }
  return payload;
}

/** Reads and verifies the session cookie for the current request. Server Components/Actions only. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionCookieValue(store.get(SESSION_COOKIE_NAME)?.value);
}
