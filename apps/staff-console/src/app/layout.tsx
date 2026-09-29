import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { ThemeToggle } from '../components/ThemeToggle';
import { BASE_PATH } from '../lib/base-path';
import { loadConfig } from '../lib/config';
import { getStaffSession } from '../lib/session';

const fontSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Crimson Copies -- Staff',
  description: 'Staff queue: advance orders, view uploaded files.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getStaffSession();
  const { STOREFRONT_URL } = loadConfig();

  // Read the saved theme cookie server-side so the very first byte of HTML already has the
  // right data-theme attribute -- no client script race, no flash on full page navigations.
  // No cookie means "follow the OS", which the prefers-color-scheme media query in globals.css
  // handles on its own.
  const themeCookie = (await cookies()).get('cc-theme')?.value;
  const theme = themeCookie === 'light' || themeCookie === 'dark' ? themeCookie : undefined;

  return (
    <html lang="en" className={fontSans.variable} data-theme={theme}>
      <body>
        <header className="site-header">
          {/* next/link is basePath-aware; this resolves to /staff -- the staff queue. */}
          <Link href="/" className="brand">
            Crimson Copies -- Staff
          </Link>
          <nav>
            {/* Queue is the staff "home". */}
            <Link href="/">Queue</Link>
            <Link href="/my-workload">My Workload</Link>
          </nav>
          <div className="header-actions">
            <ThemeToggle />
            {session && (
              // Plain <form action> is NOT rewritten by Next -- prefix it explicitly.
              <form action={`${BASE_PATH}/logout`} method="POST" className="session-form">
                <span className="muted">Signed in as {session.username}</span>
                <button type="submit">Log out</button>
              </form>
            )}
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}