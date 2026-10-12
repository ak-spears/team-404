import { NextResponse } from 'next/server';
import { BASE_PATH } from '../../../../lib/base-path';
import { getStaffSession } from '../../../../lib/session';
import {
  ADMIN_COOKIE_NAME,
  ADMIN_TTL_SECONDS,
  createAdminCookieValue,
} from '../../../../lib/session';

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.redirect(new URL(`${BASE_PATH}/login?next=/admin`, request.url), 303);
  }

  const response = NextResponse.redirect(new URL(`${BASE_PATH}/admin`, request.url), 303);
  response.cookies.set(ADMIN_COOKIE_NAME, createAdminCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: BASE_PATH,
    maxAge: ADMIN_TTL_SECONDS,
  });
  return response;
}
