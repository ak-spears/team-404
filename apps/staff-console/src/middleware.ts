
import { NextResponse, type NextRequest } from 'next/server';
import { auth0 } from './lib/auth0-middleware';
import { BASE_PATH } from './lib/base-path';
import { getStaffConsoleUrl } from './lib/staff-console-origin';

const SESSION_COOKIE_NAME = 'cc_session';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Let static assets pass through untouched.
  if (
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return NextResponse.next();
  }

  // Let the Auth0 SDK handle its authentication endpoints.
  const authResponse = await auth0.middleware(request);

  // Do not apply the staff-session guard to Auth0 routes.
  if (
    pathname.startsWith(`${BASE_PATH}/auth/`) ||
    pathname === '/auth/login' ||
    pathname === '/auth/callback'
  ) {
    return authResponse;
  }

  // Keep login and logout pages accessible without a staff session.
  if (
    pathname === `${BASE_PATH}/login` ||
    pathname === `${BASE_PATH}/logout` ||
    pathname === '/login' ||
    pathname === '/logout'
  ) {
    return authResponse;
  }

  // Preserve the existing staff-only session guard.
  if (!request.cookies.has(SESSION_COOKIE_NAME)) {
    const next = encodeURIComponent(pathname || '/');
    return NextResponse.redirect(
      getStaffConsoleUrl(`${BASE_PATH}/login?next=${next}`),
    );
  }

  return authResponse;
}

export const config = {
  runtime: 'nodejs',
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api).*)',
  ],
};
