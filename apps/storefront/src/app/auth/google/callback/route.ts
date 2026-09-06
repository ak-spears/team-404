import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { callOrdersApi } from '../../../../lib/internal-api';
import { createSessionCookieValue, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../../../../lib/session';

interface GoogleAuthResponseBody {
  userId: number;
  username: string;
  role: 'customer' | 'staff';
}

const REDIRECT_URI = 'http://localhost:3000/auth/google/callback';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=1', request.url));
  }

  const result = await callOrdersApi<GoogleAuthResponseBody>({
    method: 'POST',
    path: '/internal/auth/verify-google',
    body: { code, redirectUri: REDIRECT_URI },
  });

  if (result.status !== 200) {
    return NextResponse.redirect(new URL('/login?error=1', request.url));
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

  return NextResponse.redirect(new URL('/', request.url));
}