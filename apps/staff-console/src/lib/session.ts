import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { callOrdersApi } from './internal-api';
import { loadConfig } from './config';

export type SessionRole = 'customer' | 'staff';

export interface SessionPayload {
  userId: number;
  username: string;
  role: SessionRole;
  iat: number;
  /** Set after Google login with a non-UA email until the user submits a CWID. */
  pendingCwid?: boolean;
}

export const SESSION_COOKIE_NAME = 'cc_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const ADMIN_COOKIE_NAME = 'cc_admin';
export const ADMIN_TTL_SECONDS = 4 * 60 * 60;

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

export function createSessionCookieValue(
  payload: Omit<SessionPayload, 'iat'> & { pendingCwid?: boolean },
): string {
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

/**
 * Reads and verifies the session cookie for the current request, requiring role 'staff'.
 * Server Components/Actions/Route Handlers only. Pending-CWID sessions are treated as
 * signed-out for the rest of the app.
 */
export async function getStaffSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const session = verifySessionCookieValue(store.get(SESSION_COOKIE_NAME)?.value);
  if (session?.role !== 'staff') return null;

  try {
    const result = await callOrdersApi<{ isStaff: boolean }>({
      method: 'GET',
      path: '/internal/auth/is-staff',
      searchParams: { userId: String(session.userId) },
    });
    return result.status === 200 && result.body.isStaff ? session : null;
  } catch {
    return null;
  }
}

export function createAdminCookieValue(): string {
  const config = loadConfig();
  const expiresAt = String(Date.now() + ADMIN_TTL_SECONDS * 1000);
  return `${expiresAt}.${sign(expiresAt, config.SESSION_SECRET)}`;
}

export function verifyAdminCookieValue(value: string | undefined): boolean {
  if (!value) return false;
  const separator = value.lastIndexOf('.');
  if (separator < 1) return false;

  const expiresAt = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expiry = Number(expiresAt);
  if (!Number.isSafeInteger(expiry) || expiry <= Date.now()) return false;

  return signaturesMatch(signature, sign(expiresAt, loadConfig().SESSION_SECRET));
}

export async function hasAdminSession(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminCookieValue(store.get(ADMIN_COOKIE_NAME)?.value);
}
