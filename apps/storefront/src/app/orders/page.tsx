import { redirect } from 'next/navigation';
import type { Order } from '@crimson-copies/shared';
import { OrderRow } from '../../components/OrderRow';
import { PageBand } from '../../components/PageBand';
import { getAuthenticatedUser } from '../../lib/customer-identity';
import { getDisplayIdentity } from '../../lib/display-identity';
import { callOrdersApi } from '../../lib/internal-api';
import {
  isOrderView,
  ORDER_VIEWS,
  sortOrders,
  summarizeOrders,
  type OrderView,
} from '../../lib/orders';

// This page reads the session cookie, which Next.js can't always infer as a reason to skip
// static generation on its own -- without this, it would try to prerender at BUILD time,
// calling orders-api before INTERNAL_API_KEY is even configured. Must always be per-request.
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ view?: string | string[] }>;
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

  const { view: rawView } = await searchParams;
  const view: OrderView = isOrderView(rawView) ? rawView : 'all';
  const shown = orders.filter(ORDER_VIEWS[view].match);

  return (
    <>
      <PageBand
        eyebrow="Your print desk"
        title="My orders"
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
          <>
            {orders.length > 0 && <OrderTabs orders={orders} current={view} />}
            {shown.length > 0 ? (
              <ul className="order-list">
                {shown.map((order) => (
                  <li key={order.id}>
                    <OrderRow order={order} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="order-empty">
                <p>{ORDER_VIEWS[view].empty}</p>
                {view === 'all' ? (
                  <a href="/order">Start your first order &rarr;</a>
                ) : (
                  <a href="/orders">See all orders &rarr;</a>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

/** Filter tabs as plain links (`?view=`), so filtering works without client JS. */
function OrderTabs({ orders, current }: { orders: Order[]; current: OrderView }) {
  const views = Object.keys(ORDER_VIEWS) as OrderView[];
  return (
    <nav className="order-tabs" aria-label="Filter orders">
      {views.map((view) => (
        <a
          key={view}
          href={view === 'all' ? '/orders' : `/orders?view=${view}`}
          aria-current={view === current ? 'page' : undefined}
        >
          {ORDER_VIEWS[view].label}
          <span className="order-tabs-count">{orders.filter(ORDER_VIEWS[view].match).length}</span>
        </a>
      ))}
    </nav>
  );
}
