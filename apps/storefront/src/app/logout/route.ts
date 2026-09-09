import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '../../lib/session';

/** Signed out via a plain form POST -- no client JS required. */
export async function POST(request: Request): Promise<NextResponse> {
  const store = await cookies();
  store.delete({
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  const proto = request.headers.get('x-forwarded-proto') ?? 'http';
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const origin = `${proto}://${host}`;
  return NextResponse.redirect(new URL('/', origin), { status: 303 });
}
