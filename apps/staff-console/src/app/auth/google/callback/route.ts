import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { callOrdersApi } from '../../../../lib/internal-api';
import { BASE_PATH } from '../../../../lib/base-path';
import { getStaffConsoleUrl } from '../../../../lib/staff-console-origin';
import { loadConfig } from '../../../../lib/config';
import {
  createSessionCookieValue,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from '../../../../lib/session';

interface GoogleAuthResponseBody {
  userId: number;
  username: string;
  role: 'customer' | 'staff';
  requiresCwid: boolean;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = loadConfig();
  const errorUrl = (error: string) =>
    getStaffConsoleUrl(`${BASE_PATH}/login?error=${encodeURIComponent(error)}`);

  if (!config.GOOGLE_CLIENT_ID) {
    return NextResponse.redirect(errorUrl('google-unavailable'));
  }

  const redirectUri = `${config.APP_BASE_URL}${BASE_PATH}/auth/google/callback`;
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.redirect(errorUrl('not-staff'));

  const result = await callOrdersApi<GoogleAuthResponseBody>({
    method: 'POST',
    path: '/internal/auth/verify-google',
    body: { code, redirectUri },
  });

  if (result.status !== 200 || result.body.role !== 'staff' || result.body.requiresCwid) {
    return NextResponse.redirect(errorUrl('not-staff'));
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

  return NextResponse.redirect(getStaffConsoleUrl(`${BASE_PATH}/`));
}
