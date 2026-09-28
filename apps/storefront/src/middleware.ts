import { NextResponse, type NextRequest } from 'next/server';
import { auth0 } from './lib/auth0-middleware';
import {
  getSessionEmail,
  isAllowedAuthEmail,
  isUnverifiedEmailSession,
} from './lib/auth0-helpers';

// Duplicated from lib/session.ts's SESSION_COOKIE_NAME rather than imported -- middleware runs
// on the Edge runtime, and lib/session.ts pulls in node:crypto (for the real signature check),
// which Edge can't bundle.
const SESSION_COOKIE_NAME = 'cc_session';

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // Let Next's static asset requests pass through untouched. Auth0 middleware is not meant to
  // evaluate bundle/chunk requests and can respond with 404s on /_next/static/* paths.
  if (
    request.nextUrl.pathname.startsWith('/_next/') ||
    request.nextUrl.pathname === '/favicon.ico' ||
    request.nextUrl.pathname === '/robots.txt' ||
    request.nextUrl.pathname === '/sitemap.xml'
  ) {
    return NextResponse.next();
  }

  const authResponse = await auth0.middleware(request);

  if (authResponse.status !== 200 || request.nextUrl.pathname.startsWith('/auth')) {
    return authResponse;
  }

  const authSession = await auth0.getSession(request);
  const isUnverifiedSession = isUnverifiedEmailSession(authSession);

  if (isUnverifiedSession && !request.nextUrl.pathname.startsWith('/verify-email')) {
    const verifyUrl = new URL('/verify-email', request.url);
    if (authSession?.user?.email) {
      verifyUrl.searchParams.set('email', authSession.user.email);
    }
    return NextResponse.redirect(verifyUrl);
  }

  const hasAuthUser = Boolean(authSession?.user);
  const isUaEmailErrorPage = request.nextUrl.searchParams.get('error') === 'ua-email-required';
  if (!isUaEmailErrorPage && hasAuthUser && authSession && !isAllowedAuthEmail(getSessionEmail(authSession))) {
    const errorUrl = new URL('/', request.url);
    const logoutUrl = new URL('/auth/logout', request.url);
    logoutUrl.searchParams.set('returnTo', errorUrl.toString());

    const response = NextResponse.redirect(logoutUrl.toString());
    response.cookies.set('ua_email_error', 'ua-email-required', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60,
    });
    return response;
  }

  const hasLegacySession = request.cookies.has(SESSION_COOKIE_NAME);
  const isAuthenticated = hasLegacySession || Boolean(authSession?.user && authSession.user.email_verified !== false);

  if ((request.nextUrl.pathname === '/order' || request.nextUrl.pathname.startsWith('/orders')) && !isAuthenticated) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('returnTo', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return authResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'],
};
