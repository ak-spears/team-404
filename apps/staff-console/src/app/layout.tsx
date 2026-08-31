import type { Metadata } from 'next';
import './globals.css';
import { getStaffSession } from '../lib/session';

export const metadata: Metadata = {
  title: 'Crimson Copies -- Staff',
  description: 'Staff queue: advance orders, view uploaded files.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getStaffSession();

  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <a href="/" className="brand">
            Crimson Copies -- Staff
          </a>
          {session && (
            <form action="/logout" method="POST" className="session-form">
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
