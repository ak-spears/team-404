import { NextResponse } from 'next/server';
import { BASE_PATH } from '../../../../lib/base-path';
import { getStaffConsoleUrl } from '../../../../lib/staff-console-origin';
import { getStaffSession } from '../../../../lib/session';
import {
  ADMIN_COOKIE_NAME,
  ADMIN_TTL_SECONDS,
  createAdminCookieValue,
} from '../../../../lib/session';

export async function POST(): Promise<NextResponse> {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.redirect(getStaffConsoleUrl(`${BASE_PATH}/login?next=/admin`), 303);
  }

  const response = NextResponse.redirect(getStaffConsoleUrl(`${BASE_PATH}/admin`), 303);
  response.cookies.set(ADMIN_COOKIE_NAME, createAdminCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: BASE_PATH,
    maxAge: ADMIN_TTL_SECONDS,
  });
  return response;
}
