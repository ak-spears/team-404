import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { callOrdersApi } from '../../../../lib/internal-api';
import { createSessionCookieValue, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../../../../lib/session';
import { loadConfig } from '../../../../lib/config';
import { BASE_PATH } from '../../../../lib/base-path';

interface GoogleAuthResponseBody {
  userId: number;
  username: string;
  role: 'staff';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = loadConfig();
  const REDIRECT_URI = `${config.APP_BASE_URL}${BASE_PATH}/auth/google/callback`;

  const code = request.nextUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL(`${BASE_PATH}/login?error=not-staff`, request.url));
  }

  const result = await callOrdersApi<GoogleAuthResponseBody>({
    method: 'POST',
    path: '/internal/auth/verify-google-staff',
    body: { code, redirectUri: REDIRECT_URI },
  });

  if (result.status !== 200) {
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
