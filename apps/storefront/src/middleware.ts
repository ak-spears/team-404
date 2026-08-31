import { NextResponse, type NextRequest } from 'next/server';

// Duplicated from lib/session.ts's SESSION_COOKIE_NAME rather than imported -- middleware runs
// on the Edge runtime, and lib/session.ts pulls in node:crypto (for the real signature check),
// which Edge can't bundle.
const SESSION_COOKIE_NAME = 'cc_session';

/**
 * Cheap presence-only redirect for UX -- this middleware does NOT verify the cookie's
 * signature (that needs node:crypto, which the actual pages/route handlers below do via
 * lib/session.ts's getSession()). A forged or expired cookie still gets redirected to the real
 * page here, then rejected there -- this is a convenience, not the trust boundary.
 */
export function middleware(request: NextRequest): NextResponse {
  if (!request.cookies.has(SESSION_COOKIE_NAME)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/orders'],
};
