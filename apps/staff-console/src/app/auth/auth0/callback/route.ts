import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { loadConfig } from '../../../../lib/config';
import { createSessionCookieValue, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../../../../lib/session';
import { BASE_PATH } from '../../../../lib/base-path';
import { callOrdersApi } from '../../../../lib/internal-api';

interface Auth0CallbackBody {
  userId: number;
  username: string;
  role: 'customer' | 'staff';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = loadConfig();
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const storedState = (await cookies()).get('auth0_staff_state')?.value;

  console.log('AUTH0 STAFF CALLBACK', {
    hasCode: !!code,
    hasState: !!state,
    state,
    storedState,
    redirectUri: `${config.APP_BASE_URL}${BASE_PATH}/auth/auth0/callback`,
  });

  if (!code || !state || state !== storedState) {
    console.log('AUTH0 STAFF CALLBACK: state mismatch or missing code/state');
    return NextResponse.redirect(new URL(`${BASE_PATH}/login?error=1`, request.url));
  }

  const tokenResponse = await fetch(`https://${config.AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: config.AUTH0_CLIENT_ID,
      client_secret: config.AUTH0_CLIENT_SECRET,
      code,
      redirect_uri: `${config.APP_BASE_URL}${BASE_PATH}/auth/auth0/callback`,
    }),
  });

  console.log('AUTH0 STAFF TOKEN RESPONSE', {
    ok: tokenResponse.ok,
    status: tokenResponse.status,
    statusText: tokenResponse.statusText,
  });

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text();
    console.log('AUTH0 STAFF TOKEN BODY', text);
    return NextResponse.redirect(new URL(`${BASE_PATH}/login?error=1`, request.url));
  }

  const tokenData = (await tokenResponse.json()) as { access_token?: string; id_token?: string };
  console.log('AUTH0 STAFF TOKEN DATA', {
    hasAccessToken: !!tokenData.access_token,
    hasIdToken: !!tokenData.id_token,
  });

  const idToken = tokenData.id_token;
  if (!idToken) {
    console.log('AUTH0 STAFF CALLBACK: missing id_token');
    return NextResponse.redirect(new URL(`${BASE_PATH}/login?error=1`, request.url));
  }

  const claims = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
    email?: string;
    email_verified?: boolean;
    name?: string;
  };

  console.log('AUTH0 STAFF TOKEN CLAIMS', claims);

  const email = claims.email ?? claims.name;
  if (!email || claims.email_verified === false) {
    console.log('AUTH0 STAFF CALLBACK: missing email or email not verified', { email, email_verified: claims.email_verified });
    return NextResponse.redirect(new URL(`${BASE_PATH}/login?error=1`, request.url));
  }

  const result = await callOrdersApi<Auth0CallbackBody | { valid: false }>({
    method: 'POST',
    path: '/internal/auth/verify-auth0-staff',
    body: { email },
  });

  console.log('AUTH0 STAFF VERIFY RESULT', result);

  const verifiedBody = result.body as Partial<Auth0CallbackBody> | { valid: false } | undefined;
  if (
    result.status !== 200 ||
    !verifiedBody ||
    typeof verifiedBody !== 'object' ||
    !('userId' in verifiedBody) ||
    verifiedBody.role !== 'staff'
  ) {
    console.log('AUTH0 STAFF CALLBACK: verify failed or non-staff account', {
      status: result.status,
      body: result.body,
      email,
    });
    return NextResponse.redirect(new URL(`${BASE_PATH}/login?error=not-staff`, request.url));
  }

  const staffUser = verifiedBody as Auth0CallbackBody;
  const store = await cookies();
  store.set(
    SESSION_COOKIE_NAME,
    createSessionCookieValue({
      userId: staffUser.userId,
      username: staffUser.username,
      role: staffUser.role,
    }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    },
  );
  store.delete('auth0_staff_state');

  console.log('AUTH0 STAFF CALLBACK: success, redirecting to app root');
  return NextResponse.redirect(new URL(`${BASE_PATH}/`, request.url));
}
