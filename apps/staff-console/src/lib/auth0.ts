import { Auth0Client } from '@auth0/nextjs-auth0/server';
import { NextResponse } from 'next/server';
import { callOrdersApi } from './internal-api';
import {
  createSessionCookieValue,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from './session';

export const auth0 = new Auth0Client({
  appBaseUrl: process.env.APP_BASE_URL,
  onCallback: async (_error, ctx, session) => {
    const email = session?.user?.email?.trim().toLowerCase();

    if (!email || session?.user?.email_verified === false) {
      return NextResponse.redirect(
        new URL('/staff/login?error=not-staff', ctx.appBaseUrl),
      );
    }

    const result = await callOrdersApi<{
      userId: number;
      username: string;
      role: 'customer' | 'staff';
    }>({
      method: 'POST',
      path: '/internal/auth/verify-auth0-email',
      body: { email },
    });

    if (result.status !== 200 || result.body.role !== 'staff') {
      return NextResponse.redirect(
        new URL('/staff/login?error=not-staff', ctx.appBaseUrl),
      );
    }

    const res = NextResponse.redirect(new URL('/staff', ctx.appBaseUrl));

    res.cookies.set(
      SESSION_COOKIE_NAME,
      createSessionCookieValue({
        userId: result.body.userId,
        username: result.body.username,
        role: 'staff',
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_TTL_SECONDS,
      },
    );

    return res;
  },
});