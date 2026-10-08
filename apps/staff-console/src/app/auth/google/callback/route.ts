import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { callOrdersApi } from '../../../../lib/internal-api';
import { createSessionCookieValue, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../../../../lib/session';
import { loadConfig } from '../../../../lib/config';
import { BASE_PATH } from '../../../../lib/base-path';

interface GoogleAuthResponseBody {
  userId: number;
  username: string;
  role: 'customer' | 'staff';
  requiresCwid: boolean;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = loadConfig();
  const REDIRECT_URI = `${config.APP_BASE_URL}${BASE_PATH}/auth/google/callback`;

  const code = request.nextUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL(`${BASE_PATH}/login?error=not-staff`, request.url));
  }

  // Same endpoint the storefront uses -- looks up or creates the linked user exactly like the
  // customer flow does. Staff-ness is checked afterward, below, the same way the password login
  // at app/login/page.tsx checks role after a shared verify-credentials call.
  const result = await callOrdersApi<GoogleAuthResponseBody>({
    method: 'POST',
    path: '/internal/auth/verify-google',
    body: { code, redirectUri: REDIRECT_URI },
  });

  if (result.status !== 200) {
    return NextResponse.redirect(new URL(`${BASE_PATH}/login?error=not-staff`, request.url));
  }

  if (result.body.requiresCwid) {
    const store = await cookies();
    store.set(
      SESSION_COOKIE_NAME,
      createSessionCookieValue({
        userId: result.body.userId,
        username: result.body.username,
        role: result.body.role,
        pendingCwid: true,
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_TTL_SECONDS,
      },
    );
    return NextResponse.redirect(new URL(`${BASE_PATH}/auth/cwid`, request.url));
  }

  // Not pending a CWID, so this is the final decision point -- reject anything that isn't
  // staff without ever setting a session cookie (same generic rejection as the password login,
  // so a non-staff account can't be used to probe for which emails are staff).
  if (result.body.role !== 'staff') {
    return NextResponse.redirect(new URL(`${BASE_PATH}/login?error=not-staff`, request.url));
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

  return NextResponse.redirect(new URL(`${BASE_PATH}/`, request.url));
}
