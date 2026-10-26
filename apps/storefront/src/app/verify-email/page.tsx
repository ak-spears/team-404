import { redirect } from 'next/navigation';
import { auth0 } from '../../lib/auth0';

export const dynamic = 'force-dynamic';

interface VerifyEmailPageProps {
  searchParams: Promise<{ email?: string; next?: string }>
}

function safeNextPath(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : '';
  if (!value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }

  let resolved: URL;
  try {
    resolved = new URL(value, 'http://cc.invalid');
  } catch {
    return '/';
  }

  if (resolved.origin !== 'http://cc.invalid') {
    return '/';
  }

  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  return path.startsWith('/') && !path.startsWith('//') ? path : '/';
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const { email, next } = await searchParams;
  const session = await auth0.getSession();

  if (session?.user?.email_verified === true) {
    redirect(safeNextPath(next) || '/');
  }

  const targetEmail = session?.user?.email ?? email ?? 'your email address';
  const hasUnverifiedSession = session?.user?.email_verified === false;

  return (
    <>
      <section className="intro" style={{ maxWidth: '42rem', margin: '3rem auto' }}>
        <h1>Check Your Inbox</h1>
        <p>
          We sent a verification email to <strong>{targetEmail}</strong>.
        </p>
        <p>
          Please open the message and click the verification link before using the website. Once your email is
          confirmed, you can continue normally.
        </p>
        {hasUnverifiedSession && (
          <p>
            If you already verified your email, <a href="/auth/logout">sign in again</a> to refresh the session.
          </p>
        )}
        <p className="muted">
          If you don&apos;t see the email, check your spam folder and try signing in again with the same address.
        </p>
      </section>
    </>
  );
}
