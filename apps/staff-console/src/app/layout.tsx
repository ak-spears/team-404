import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { BASE_PATH } from '../lib/base-path';
import { loadConfig } from '../lib/config';
import { getStaffSession } from '../lib/session';

export const metadata: Metadata = {
  title: 'Crimson Copies -- Staff',
  description: 'Staff queue: advance orders, view uploaded files.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getStaffSession();
  const { STOREFRONT_URL } = loadConfig();

  return (
    <html lang="en">
      <body>
        <header className="site-header">
          {/* next/link is basePath-aware; this resolves to /staff -- the staff queue. */}
          <Link href="/" className="brand">
            Crimson Copies -- Staff
          </Link>
          <nav>
            {/* Queue is the staff "home"; Home leaves for the main Crimson Copies site. */}
            <Link href="/">Queue</Link>
            <a href={STOREFRONT_URL}>Home</a>
          </nav>
          {session && (
            // Plain <form action> is NOT rewritten by Next -- prefix it explicitly.
            <form action={`${BASE_PATH}/logout`} method="POST" className="session-form">
              <span className="muted">Signed in as {session.username}</span>
              <button type="submit">Log out</button>
            </form>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
