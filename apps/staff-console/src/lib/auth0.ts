import { Auth0Client } from '@auth0/nextjs-auth0/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { BASE_PATH } from './base-path';
import { loadConfig } from './config';
import { callOrdersApi } from './internal-api';
import { createSessionCookieValue, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from './session';

export const auth0 = new Auth0Client({
  appBaseUrl: loadConfig().APP_BASE_URL,
  secret: loadConfig().AUTH0_SECRET,
  routes: {
    login: '/auth/auth0/login',
    callback: '/auth/auth0/callback',
    logout: '/auth/auth0/logout',
  },
  beforeSessionSaved: async (session) => session,
  onCallback: async (_error, ctx, session) => {
    const appBaseUrl = ctx.appBaseUrl || loadConfig().APP_BASE_URL;
    const fallbackRedirect = new URL(`${BASE_PATH}/login?error=1`, appBaseUrl);

    if (_error || !session) {
      return NextResponse.redirect(fallbackRedirect);
    }

    const email = session.user?.email;
    if (!email) {
      return NextResponse.redirect(fallbackRedirect);
    }

    const result = await callOrdersApi<{ userId: number; username: string; role: 'customer' | 'staff' }>({
      method: 'POST',
      path: '/internal/auth/verify-auth0-email',
      body: { email },
    });

    if (result.status !== 200 || result.body.role !== 'staff') {
      return NextResponse.redirect(new URL(`${BASE_PATH}/login?error=not-staff`, appBaseUrl));
    }

    const store = await cookies();
    store.set(
      SESSION_COOKIE_NAME,
      createSessionCookieValue({
        userId: result.body.userId,
        username: result.body.username,
        role: result.body.role,
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_TTL_SECONDS,
      },
    );

    return NextResponse.redirect(new URL(ctx.returnTo || `${BASE_PATH}/`, appBaseUrl));
  },
});
