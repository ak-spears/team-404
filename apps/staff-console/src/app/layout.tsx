import type { Metadata } from 'next';
import Link from 'next/link';
import { Crimson_Pro, Plus_Jakarta_Sans } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css'; 
import './globals.css';
import { AccountMenu } from '../components/AccountMenu';
import { NavLink } from '../components/NavLink';
import { ThemeToggle } from '../components/ThemeToggle';
import { getStaffSession } from '../lib/session';

const fontSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-sans' });
const fontDisplay = Crimson_Pro({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'Crimson Copies -- Staff',
  description: 'Staff queue: advance orders, view uploaded files.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getStaffSession();

  // Read the saved theme cookie server-side so the very first byte of HTML already has the
  // right data-theme attribute -- no client script race, no flash on full page navigations.
  // No cookie means "follow the OS", which the prefers-color-scheme media query in globals.css
  // handles on its own.
  const themeCookie = (await cookies()).get('cc-theme')?.value;
  const theme = themeCookie === 'light' || themeCookie === 'dark' ? themeCookie : undefined;

  return (
    <html lang="en" className={`${fontSans.variable} ${fontDisplay.variable}`} data-theme={theme}>
      <body>
        <header className="site-header">
          {/* next/link is basePath-aware; this resolves to /staff -- the staff queue. */}
          <Link href="/" className="brand">
            Crimson Copies <span className="brand-tag">Staff</span>
          </Link>
          <nav>
            {session && (
              <>
                <NavLink href="/">Queue</NavLink>
                <NavLink href="/board">Board</NavLink>
                <NavLink href="/my-workload">My work</NavLink>
                <NavLink href="/admin">Admin</NavLink>
              </>
            )}
          </nav>
          <div className="header-actions">
            <ThemeToggle />
            {session && <AccountMenu username={session.username} />}
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
