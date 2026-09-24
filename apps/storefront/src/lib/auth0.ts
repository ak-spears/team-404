import { Auth0Client } from '@auth0/nextjs-auth0/server';
import { NextResponse } from 'next/server';
import {cookies} from 'next/headers';
import {callOrdersApi} from '../lib/internal-api';
import { createSessionCookieValue, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS} from './session';

const UA_EMAIL_ERROR_COOKIE = 'ua_email_error';

function setUaEmailErrorCookie(response: NextResponse): NextResponse {
  response.cookies.set(UA_EMAIL_ERROR_COOKIE, 'ua-email-required', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60,
  });
  return response;
}

export function isAllowedAuthEmail(email?: string): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (
    normalized === 'customer' ||
    normalized === 'staff' ||
    normalized.endsWith('@crimson.ua.edu') ||
    normalized.endsWith('@ua.edu')
  );
}

export function getSessionEmail(session: { user?: { email?: string | null; name?: string | null; nickname?: string | null } }): string | undefined {
  const candidates = [session?.user?.email, session?.user?.name, session?.user?.nickname];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return undefined;
}

export function isUnverifiedEmailSession(session?: { user?: { email_verified?: boolean } } | null): boolean {
  return !!session && session.user?.email_verified === false;
}

function buildUaEmailErrorRedirect(appBaseUrl?: string): NextResponse {
  const base = appBaseUrl || process.env.APP_BASE_URL || 'http://localhost:3000';
  const rootUrl = new URL('/', base);
  const logoutUrl = new URL('/auth/logout', base);
  logoutUrl.searchParams.set('returnTo', rootUrl.toString());

  const response = NextResponse.redirect(logoutUrl.toString());
  return setUaEmailErrorCookie(response);
}

function buildVerificationRequiredRedirect(appBaseUrl?: string, email?: string): NextResponse {
  const base = appBaseUrl || process.env.APP_BASE_URL || 'http://localhost:3000';
  const redirectUrl = new URL('/verify-email', base);
  if (email) {
    redirectUrl.searchParams.set('email', email);
  }
  return NextResponse.redirect(redirectUrl.toString());
}

export const auth0 = new Auth0Client({
  beforeSessionSaved: async (session) => session,
  onCallback: async (_error, ctx, session) => {
    if (!session) {
      return buildUaEmailErrorRedirect(ctx.appBaseUrl);
    }

    if (isUnverifiedEmailSession(session)) {
      return buildVerificationRequiredRedirect(ctx.appBaseUrl, getSessionEmail(session));
    }

    const email = getSessionEmail(session);
    if (!isAllowedAuthEmail(email)) {
      return buildUaEmailErrorRedirect(ctx.appBaseUrl);
    }

    const result = await callOrdersApi<{ userId: number; username: string; role: 'customer' | 'staff' }>({
      method: 'POST',
      path: '/internal/auth/verify-auth0-email',
      body: { email },
    });

    if (result.status === 200) {
      const store = await cookies();
      store.set(
        SESSION_COOKIE_NAME,
        createSessionCookieValue({
          userId: result.body.userId,
          username: result.body.username,
          role: result.body.role,
        }),
        { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_TTL_SECONDS },
      );
    }

    const redirectUrl = new URL(ctx.returnTo || '/', ctx.appBaseUrl || process.env.APP_BASE_URL || 'http://localhost:3000');
    return NextResponse.redirect(redirectUrl.toString());
  },
});

/*
const email = getSessionEmail(session);
if (!isAllowedAuthEmail(email)) {
  return buildUaEmailErrorRedirect(ctx.appBaseUrl);
}

const result = await callOrdersApi<{ userId: number; username: string; role: 'customer' | 'staff' }>({
  method: 'POST',
  path: '/internal/auth/verify-auth0-email',
  body: { email },
});

if (result.status === 200) {
  const store = await cookies();
  store.set(
    SESSION_COOKIE_NAME,
    createSessionCookieValue({
      userId: result.body.userId,
      username: result.body.username,
      role: result.body.role,
    }),
    { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_TTL_SECONDS },
  );
}

const redirectUrl = new URL(ctx.returnTo || '/', ctx.appBaseUrl || process.env.APP_BASE_URL || 'http://localhost:3000');
return NextResponse.redirect(redirectUrl.toString());*/