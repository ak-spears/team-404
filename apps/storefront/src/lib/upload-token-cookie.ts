import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

/**
 * The guest upload credential, kept across refreshes in an HttpOnly cookie instead of page
 * state. Page JavaScript never sees it, and nothing here logs it.
 *
 * Scoped to one order by PATH rather than by name: one copy for the order page and one for its
 * API routes. Browser path matching is segment-aware, so order 1's cookie is never sent to
 * /orders/12 or /api/orders/12/...
 */
const COOKIE_NAME = 'cc_upload_token';

function cookiePaths(orderId: number): string[] {
  return [`/orders/${orderId}`, `/api/orders/${orderId}`];
}

/** Attaches the credential for `orderId` to `response`, expiring when the credential does. */
export function setUploadTokenCookie(
  response: NextResponse,
  orderId: number,
  token: string,
  expiresAt: string,
): void {
  const maxAge = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  if (!Number.isFinite(maxAge) || maxAge <= 0) return;

  for (const path of cookiePaths(orderId)) {
    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path,
      maxAge,
    });
  }
}

/**
 * The credential sent with this request, if any. The cookie's path already limits it to the
 * order in the URL; orders-api still checks it against that order id before trusting it.
 */
export async function readUploadTokenCookie(): Promise<string | undefined> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  return value && value.length > 0 ? value : undefined;
}
