import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { callOrdersApi } from '../../../../lib/internal-api';
import { createSessionCookieValue, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../../../../lib/session';
import { loadConfig } from '../../../../lib/config';

interface GoogleAuthResponseBody {
  userId: number;
  username: string;
  role: 'customer' | 'staff';
  requiresCwid: boolean;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = loadConfig();
  const REDIRECT_URI = `${config.APP_BASE_URL}/auth/google/callback`;

  const code = request.nextUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=1', config.APP_BASE_URL));
  }

  const result = await callOrdersApi<GoogleAuthResponseBody>({
    method: 'POST',
    path: '/internal/auth/verify-google',
    body: { code, redirectUri: REDIRECT_URI },
  });

  if (result.status !== 200) {
    return NextResponse.redirect(new URL('/login?error=1', config.APP_BASE_URL));
  }

  const store = await cookies();
  store.set(
    SESSION_COOKIE_NAME,
    createSessionCookieValue({
      userId: result.body.userId,
      username: result.body.username,
      role: result.body.role,
      ...(result.body.requiresCwid ? { pendingCwid: true } : {}),
    }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    },
  );

  if (result.body.requiresCwid) {
    return NextResponse.redirect(new URL('/auth/cwid', config.APP_BASE_URL));
  }

  return NextResponse.redirect(new URL('/', config.APP_BASE_URL));
}
