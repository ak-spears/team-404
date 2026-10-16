import { NextResponse, type NextRequest } from 'next/server';
import { BASE_PATH } from './lib/base-path';
import { getStaffConsoleUrl } from './lib/staff-console-origin';

// Duplicated from lib/session.ts's SESSION_COOKIE_NAME rather than imported -- middleware runs
// on the Edge runtime, and lib/session.ts pulls in node:crypto (for the real signature check),
// which Edge can't bundle.
const SESSION_COOKIE_NAME = 'cc_session';

/**
 * Cheap presence-only redirect for UX, gating the entire staff console -- this middleware does
 * NOT verify the cookie's signature or role (that needs node:crypto plus a role check, which
 * every page/route handler below does via lib/session.ts's getStaffSession()). A forged,
 * expired, or non-staff cookie still gets redirected to the real page here, then rejected
 * there -- this is a convenience, not the trust boundary.
 */
export function middleware(request: NextRequest): NextResponse {
  if (!request.cookies.has(SESSION_COOKIE_NAME)) {
    // Spell the /staff basePath out: NextResponse.redirect() does NOT re-add it the way
    // next/navigation's redirect() does. Use the configured public origin because request.url
    // can be the internal localhost address behind the VM reverse proxy.
    // request.nextUrl.pathname is already basePath-relative (e.g. "/orders/3"), which is what
    // the login page's `next` handling expects.
    const next = encodeURIComponent(request.nextUrl.pathname || '/');
    const loginUrl = getStaffConsoleUrl(`${BASE_PATH}/login?next=${next}`);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  // Excludes /auth/* because the Google OAuth callback runs before a session cookie exists.
  // Excludes /api/* because client fetches would otherwise follow a login redirect and could
  // mistake its 200 response for a successful status or file operation. API routes validate
  // their own session with getStaffSession().
  matcher: ['/((?!login|logout|api|auth|_next|favicon.ico).*)'],
};
