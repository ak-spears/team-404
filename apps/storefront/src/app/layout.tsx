import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { ThemeToggle } from '../components/ThemeToggle';
import { auth0 } from '../lib/auth0';
import { loadConfig } from '../lib/config';
import { getAuthenticatedUser } from '../lib/customer-identity';
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
  const { STAFF_CONSOLE_URL } = loadConfig();

  const signedInName =
    authSession?.user?.email ??
    authSession?.user?.name ??
    authSession?.user?.nickname ??
    localSession?.username ??
    null;

  // Role decides which nav links show; undefined when signed out (or Auth0 can't be matched
  // to an orders-api user). Only customers get the ordering links -- staff work in the console.
  const { role } = signedInName ? await getAuthenticatedUser() : { role: undefined };
  const isCustomer = role === 'customer';
  const isStaff = role === 'staff';


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
            {isCustomer && (
              <>
                <a href="/order">Place an order</a>
                <a href="/orders">My orders</a>
              </>
            )}
          </nav>
          <div className="header-actions">
            <ThemeToggle />
            {signedInName ? (
              <span className="session-form">
                <span className="muted">Signed in as {signedInName}</span>
                {/* Temporary: restore Auth0 logout once Allowed Logout URLs include /signed-out */}
                <form action="/logout" method="post">
                  <button type="submit">Log out</button>
                </form>
                {isStaff && <a href={STAFF_CONSOLE_URL}>Staff console</a>}
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