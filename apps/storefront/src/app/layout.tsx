import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { ThemeToggle } from '../components/ThemeToggle';
import { auth0 } from '../lib/auth0';
import { loadConfig } from '../lib/config';
import { getSession } from '../lib/session';

export const dynamic = 'force-dynamic';

const fontSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Crimson Copies',
  description: 'Order printing, posters, and copies -- no email required.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const localSession = await getSession();
  const authSession = await auth0.getSession();
  const { APP_BASE_URL, STAFF_CONSOLE_URL } = loadConfig();

  const signedInName =
    authSession?.user?.email ??
    authSession?.user?.name ??
    authSession?.user?.nickname ??
    localSession?.username ??
    null;


  const themeCookie = (await cookies()).get('cc-theme')?.value;
  const theme = themeCookie === 'light' || themeCookie === 'dark' ? themeCookie : undefined;

  return (
    <html lang="en" className={fontSans.variable} data-theme={theme}>
      <body>
        <header className="site-header">
          <a href="/" className="brand">
            Crimson Copies
          </a>
          <nav>
            <a href="/">Catalog</a>
            <a href="/order">Place an order</a>
            <a href="/orders">My orders</a>
          </nav>
          <div className="header-actions">
            <ThemeToggle />
            {signedInName ? (
              <span className="session-form">
                <span className="muted">Signed in as {signedInName}</span>
                <a
                  href={
                    authSession
                      ? `/auth/logout?returnTo=${encodeURIComponent(new URL('/signed-out', APP_BASE_URL).toString())}`
                      : '/logout'
                  }
                >
                  Log out
                </a>
                <a href={STAFF_CONSOLE_URL}>Staff sign in</a>
              </span>
            ) : (
              <span className="session-form">
                <a href="/auth/login">Sign in</a>
                <a href={STAFF_CONSOLE_URL}>Staff sign in</a>
              </span>
            )}
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}