import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { callOrdersApi } from '../../lib/internal-api';
import { createSessionCookieValue, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../../lib/session';

// Reads searchParams for the error/next state below, so this page must never be statically
// prerendered at build time (see orders/page.tsx for the same reasoning).
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ error?: string; next?: string }>;
}

interface LoginResponseBody {
  userId: number;
  username: string;
  role: 'customer' | 'staff';
}

// The post-login destination arrives from the query string, so it is attacker-controlled.
// Only a same-site, path-only destination is ever allowed: resolve it against a throwaway
// origin and require the origin to survive unchanged. That rejects 'https://evil.example.com',
// the protocol-relative '//evil.example.com', the backslash form '/\\evil.example.com' and
// tab/newline-smuggled variants, all of which browsers resolve off-site.
const NEXT_FALLBACK = '/';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" />
    </svg>
  );
}

function safeNextPath(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : '';
  if (!value.startsWith('/') || value.startsWith('//')) {
    return NEXT_FALLBACK;
  }

  let resolved: URL;
  try {
    resolved = new URL(value, 'http://cc.invalid');
  } catch {
    return NEXT_FALLBACK;
  }

  if (resolved.origin !== 'http://cc.invalid') {
    return NEXT_FALLBACK;
  }

  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  return path.startsWith('/') && !path.startsWith('//') ? path : NEXT_FALLBACK;
}

async function login(formData: FormData): Promise<void> {
  'use server';

  const next = safeNextPath(formData.get('next'));
  const username = String(formData.get('username') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!username || !password) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const result = await callOrdersApi<LoginResponseBody>({
    method: 'POST',
    path: '/internal/auth/verify-credentials',
    body: { username, password },
  });

  if (result.status !== 200) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
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

  redirect(next);
}


export default async function LoginPage({ searchParams }: PageProps) {
  const { error, next } = await searchParams;

  return (
    <>
      <h1>Sign in</h1>
      {error && <p className="error">Invalid username or password.</p>}
      <form action={login}>
        <input type="hidden" name="next" value={safeNextPath(next)} />
        <label>
          Username
          <input type="text" name="username" required autoComplete="username" />
        </label>
        <label>
          Password
          <input type="password" name="password" required autoComplete="current-password" />
        </label>
        <button type="submit">Sign in</button>
        <button type="button" className="google-signin-btn">
        <GoogleIcon />Sign in with Google</button>
      </form>
      <p className="muted">
        No account? Guest checkout is still available -- <a href="/order">place an order</a>{' '}
        without signing in.
      </p>
    </>
  );
}
