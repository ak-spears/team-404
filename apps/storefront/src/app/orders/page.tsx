import { redirect } from 'next/navigation';
import type { Order } from '@crimson-copies/shared';
import { OrdersBrowser } from '../../components/OrdersBrowser';
import { PageBand } from '../../components/PageBand';
import { getAuthenticatedUser } from '../../lib/customer-identity';
import { getDisplayIdentity } from '../../lib/display-identity';
import { callOrdersApi } from '../../lib/internal-api';
import {
  isOrderView,
  normalizeQuery,
  sortOrders,
  summarizeOrders,
  type OrderView,
} from '../../lib/orders';

// This page reads the session cookie, which Next.js can't always infer as a reason to skip
// static generation on its own -- without this, it would try to prerender at BUILD time,
// calling orders-api before INTERNAL_API_KEY is even configured. Must always be per-request.
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ view?: string | string[]; q?: string | string[] }>;
}

/** "My orders" list, gated to a signed-in customer. Middleware redirects on a missing cookie;
 * this is the real check (verifies the signature) and covers a forged/expired one too. */
export default async function MyOrdersPage({ searchParams }: PageProps) {
  if (!(await getDisplayIdentity())) redirect('/login?next=/orders');

  const { role, userId } = await getAuthenticatedUser();
  const result = await callOrdersApi<Order[]>({
    method: 'GET',
    path: '/api/orders',
    role,
    userId,
    searchParams: { mine: 'true' },
  });
  const loaded = result.status === 200 && Array.isArray(result.body);
  const orders = loaded ? sortOrders(result.body) : [];

  const { view: rawView, q: rawQuery } = await searchParams;
  const view: OrderView = isOrderView(rawView) ? rawView : 'all';
  const query = normalizeQuery(Array.isArray(rawQuery) ? rawQuery[0] : rawQuery);

  return (
    <>
      <PageBand
        eyebrow="Your print desk"
        title="My Orders"
        lead={loaded ? summarizeOrders(orders) : undefined}
        actions={
          <a href="/order" className="btn-primary">
            Place an order
          </a>
        }
      />

      <section className="dash-section">
        {!loaded ? (
          <p className="error" role="alert">
            We couldn&apos;t load your orders right now. Refresh to try again.
          </p>
        ) : (
          <OrdersBrowser orders={orders} view={view} query={query} />
        )}
      </section>
    </>
  );
}
