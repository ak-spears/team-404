import type { Metadata } from 'next';
import './globals.css';
import { getSession } from '../lib/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Crimson Copies',
  description: 'Order printing, posters, and copies -- no email required.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <html lang="en">
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
          {session ? (
            <form action="/logout" method="POST" className="session-form">
              <span className="muted">Signed in as {session.username}</span>
              <button type="submit">Log out</button>
            </form>
          ) : (
            <a href="/login">Sign in</a>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
