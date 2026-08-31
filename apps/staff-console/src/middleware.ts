import { NextResponse, type NextRequest } from "next/server";

// Duplicated from lib/session.ts's SESSION_COOKIE_NAME rather than imported -- middleware runs
// on the Edge runtime, and lib/session.ts pulls in node:crypto (for the real signature check),
// which Edge can't bundle.
const SESSION_COOKIE_NAME = "cc_session";

/**
 * Cheap presence-only redirect for UX, gating the entire staff console -- this middleware does
 * NOT verify the cookie's signature or role (that needs node:crypto plus a role check, which
 * every page/route handler below does via lib/session.ts's getStaffSession()). A forged,
 * expired, or non-staff cookie still gets redirected to the real page here, then rejected
 * there -- this is a convenience, not the trust boundary.
 */
export function middleware(request: NextRequest): NextResponse {
  if (!request.cookies.has(SESSION_COOKIE_NAME)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  // Excludes /api/* -- those are called by client-side fetch() (StatusUpdateForm,
  // OrderFilesList), which silently follows a redirect and would treat the resulting 200 login
  // page as success. API routes handle their own 401 via getStaffSession() instead.
  matcher: ["/((?!login|logout|api|_next|favicon.ico).*)"],
};
