import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { loadConfig } from '../../../../lib/config';
import { BASE_PATH } from '../../../../lib/base-path';

export async function GET(): Promise<NextResponse> {
  const config = loadConfig();
  const state = crypto.randomUUID();
  const store = await cookies();
  store.set('auth0_staff_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  });

  const params = new URLSearchParams({
    client_id: config.AUTH0_CLIENT_ID,
    redirect_uri: `${config.APP_BASE_URL}${BASE_PATH}/auth/auth0/callback`,
    response_type: 'code',
    scope: 'openid profile email',
    state,
  });

  return NextResponse.redirect(`https://${config.AUTH0_DOMAIN}/authorize?${params.toString()}`);
}
