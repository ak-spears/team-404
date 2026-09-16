import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { ThemeToggle } from '../components/ThemeToggle';
import { loadConfig } from '../lib/config';
import { getSession } from '../lib/session';

export const dynamic = 'force-dynamic';

const fontSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Crimson Copies',
  description: 'Order printing, posters, and copies -- no email required.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const { STAFF_CONSOLE_URL } = loadConfig();

  // Read the saved theme cookie server-side so the very first byte of HTML already has the
  // right data-theme attribute -- no client script race, no flash on full page navigations
  // (this app's nav links are plain <a> tags, so every click is a fresh server render).
  // No cookie means "follow the OS", which the prefers-color-scheme media query in globals.css
  // handles on its own.
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
            {session ? (
              <form action="/logout" method="POST" className="session-form">
                <span className="muted">Signed in as {session.username}</span>
                <button type="submit">Log out</button>
                <a href={STAFF_CONSOLE_URL}>Staff sign in</a>
              </form>
            ) : (
              <span className="session-form">
                <a href="/login">Sign in</a>
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
