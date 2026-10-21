import { cookies } from 'next/headers';
import type { Order } from '@crimson-copies/shared';
import { CustomerHome } from '../components/CustomerHome';
import { PhotoCredit } from '../components/PhotoCredit';
import { ScrollDock } from '../components/ScrollDock';
import { ServicesSection } from '../components/ServicesSection';
import { ThemeToggle } from '../components/ThemeToggle';
import { auth0 } from '../lib/auth0';
import { loadConfig } from '../lib/config';
import { getAuthenticatedUser } from '../lib/customer-identity';
import { getDisplayIdentity } from '../lib/display-identity';
import { callOrdersApi } from '../lib/internal-api';
import { getSession } from '../lib/session';

export const dynamic = 'force-dynamic';
interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

function getHomePageErrorMessage(error?: string): string | null {
  if (error === 'ua-email-required') {
    return 'A UA email address is required to sign in.';
  }
  return null;
}

/** Public catalog/pricing view for visitors; signed-in customers get their own home instead. */
export default async function HomePage({ searchParams }: PageProps) {
  const localSession = await getSession();
  const authSession = await auth0.getSession();



console.log('Local session exists:', Boolean(localSession));
console.log('Auth0 session exists:', Boolean(authSession));
console.log('Auth0 email:', authSession?.user?.email);

const signedIn = Boolean(authSession?.user || localSession);
console.log('Signed in:', signedIn);






  //const signedIn = Boolean(authSession?.user || localSession);

  if (signedIn) {
    const { userId, role } = await getAuthenticatedUser();
    if (role === 'customer' || role === 'staff') {
      const result = await callOrdersApi<Order[]>({
        method: 'GET',
        path: '/api/orders',
        role,
        userId,
        searchParams: { mine: 'true' },
      });
      const identity = await getDisplayIdentity();

      console.log('Authenticated identity:', identity);


      return (
        <CustomerHome
          name={identity?.name ?? 'there'}
          orders={Array.isArray(result.body) ? result.body : []}
        />
      );
    }
  }

  const cookieStore = await cookies();
  const { error } = await searchParams;
  const flashError = cookieStore.get('ua_email_error')?.value;
  const homeError =
    getHomePageErrorMessage(error) ||
    (flashError === 'ua-email-required' ? getHomePageErrorMessage('ua-email-required') : null);
  const { STAFF_CONSOLE_URL } = loadConfig();

  return (
    <>
      <section className="hero" data-dock-until>
        <ScrollDock />
        {homeError && <p className="error hero-error">{homeError}</p>}
        <h1 className="hero-title" data-dock="brand">
          Crimson Copies
        </h1>
        <p className="hero-tagline">Order printing, posters, and copies online.</p>
        {/* The theme toggle sits where it does relative to the order/sign-in button so it never
            crosses it en route: header order is nav (order) | toggle, sign in, staff. */}
        <div className="hero-actions">
          {!signedIn && <ThemeToggle data-dock="theme" />}
          <a href="#catalog" className="btn-ghost" data-dock="catalog">
            <span data-dock-label>See pricing</span>
          </a>
          {signedIn ? (
            <a href="/order" className="btn-primary" data-dock="order">
              <span data-dock-label>Place an order</span>
            </a>
          ) : (
            <a href="/auth/login" className="btn-primary" data-dock="signin">
              <span data-dock-label>Sign in to order</span>
            </a>
          )}
          {signedIn ? (
            <ThemeToggle data-dock="theme" />
          ) : (
            <a href={STAFF_CONSOLE_URL} className="btn-ghost" data-dock="staff">
              <span data-dock-label>Staff sign in</span>
            </a>
          )}
        </div>
      </section>

      <ServicesSection
        id="catalog"
        title="Services & prices"
        lead={
          signedIn
            ? 'Upload your files with the order — no more emailing them back and forth.'
            : 'Sign in to place an order and keep track of your print jobs.'
        }
        signedIn={signedIn}
      />

      <PhotoCredit
        subject="Denny Chimes and the Quad, The University of Alabama"
        source="https://www.ua.edu/wp-content/uploads/quad-home-hero.jpg"
      />
    </>
  );
}