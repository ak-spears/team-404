import type { Metadata } from 'next';
import { Crimson_Pro, Plus_Jakarta_Sans } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { AccountMenu } from '../components/AccountMenu';
import { NavLink } from '../components/NavLink';
import { ThemeToggle } from '../components/ThemeToggle';
import { loadConfig } from '../lib/config';
import { getAuthenticatedUser } from '../lib/customer-identity';
import { getDisplayIdentity } from '../lib/display-identity';

export const dynamic = 'force-dynamic';

const fontSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-sans' });
const fontDisplay = Crimson_Pro({ subsets: ['latin'], variable: '--font-display' });

export const metadata: Metadata = {
  title: 'Crimson Copies',
  description: 'Order printing, posters, and copies -- no email required.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { STAFF_CONSOLE_URL } = loadConfig();
  const identity = await getDisplayIdentity();

  // Role decides which nav links show; undefined when signed out (or Auth0 can't be matched
  // to an orders-api user). Only customers get the ordering links -- staff work in the console.
  const { role } = identity ? await getAuthenticatedUser() : { role: undefined };
  const isCustomer = role === 'customer';
  const isStaff = role === 'staff';

  const themeCookie = (await cookies()).get('cc-theme')?.value;
  const theme = themeCookie === 'light' || themeCookie === 'dark' ? themeCookie : undefined;

  return (
    <html lang="en" className={`${fontSans.variable} ${fontDisplay.variable}`} data-theme={theme}>
      <body>
        <header className="site-header">
          <a href="/" className="brand" data-dock-target="brand">
            Crimson Copies
          </a>
          <nav>
            {isCustomer && (
              <>
                <NavLink href="/order" data-dock-target="order">
                  Place an order
                </NavLink>
                <NavLink href="/orders" data-dock-target="orders">
                  My orders
                </NavLink>
              </>
            )}
          </nav>
          <div className="header-actions">
            <ThemeToggle data-dock-target="theme" />
            {identity ? (
              <AccountMenu
                name={identity.name}
                email={identity.email}
                showOrders={isCustomer}
                staffConsoleUrl={isStaff ? STAFF_CONSOLE_URL : undefined}
              />
            ) : (
              <span className="session-form">
                <a href="/auth/login" data-dock-target="signin">
                  Sign in
                </a>
                <a href={STAFF_CONSOLE_URL} data-dock-target="staff">
                  Staff sign in
                </a>
              </span>
            )}
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
