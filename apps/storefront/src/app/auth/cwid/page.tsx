import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { callOrdersApi } from '../../../lib/internal-api';
import {
  createSessionCookieValue,
  getPendingCwidSession,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from '../../../lib/session';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

interface SetCwidResponseBody {
  userId: number;
  username: string;
  role: 'customer' | 'staff';
}

async function submitCwid(formData: FormData): Promise<void> {
  'use server';

  const pending = await getPendingCwidSession();
  if (!pending) {
    redirect('/auth/login');
  }

  const cwid = String(formData.get('cwid') ?? '').trim();
  if (!/^\d+$/.test(cwid)) {
    redirect('/auth/cwid?error=1');
  }

  const result = await callOrdersApi<SetCwidResponseBody>({
    method: 'POST',
    path: '/internal/auth/set-cwid',
    body: { userId: pending.userId, cwid },
  });

  if (result.status !== 200) {
    redirect('/auth/cwid?error=1');
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

  redirect('/');
}

export default async function CwidPage({ searchParams }: PageProps) {
  const pending = await getPendingCwidSession();
  if (!pending) {
    redirect('/auth/login');
  }

  const { error } = await searchParams;

  return (
    <>
      <h1>Enter your CWID</h1>
      <p className="muted">
        Your Google account is not a UA email. Enter your Campus-Wide ID to finish signing in.
      </p>
      {error && <p className="error">Please enter a valid CWID (numbers only).</p>}
      <form action={submitCwid}>
        <label>
          CWID
          <input
            type="text"
            name="cwid"
            inputMode="numeric"
            pattern="[0-9]+"
            required
            autoComplete="off"
            autoFocus
          />
        </label>
        <button type="submit">Continue</button>
      </form>
    </>
  );
}
