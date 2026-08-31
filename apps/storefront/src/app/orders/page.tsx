import { redirect } from 'next/navigation';
import type { Order } from '@crimson-copies/shared';
import { callOrdersApi } from '../../lib/internal-api';
import { getSession } from '../../lib/session';

// This page reads the session cookie, which Next.js can't always infer as a reason to skip
// static generation on its own -- without this, it would try to prerender at BUILD time,
// calling orders-api before INTERNAL_API_KEY is even configured. Must always be per-request.
export const dynamic = 'force-dynamic';

/** "My orders" list, gated to a signed-in customer. Middleware redirects on a missing cookie;
 * this is the real check (verifies the signature) and covers a forged/expired one too. */
export default async function MyOrdersPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/orders');

  const result = await callOrdersApi<Order[]>({
    method: 'GET',
    path: '/api/orders',
    role: session.role,
    userId: String(session.userId),
    searchParams: { mine: 'true' },
  });

  const orders = Array.isArray(result.body) ? result.body : [];

  const orderRows = [];
  for (const order of orders) {
    orderRows.push(
      <tr key={order.id}>
        <td>
          <a href={`/orders/${order.id}`}>#{order.id}</a>
        </td>
        <td>{order.serviceType}</td>
        <td>{order.status}</td>
      </tr>,
    );
  }

  return (
    <>
      <h1>My orders</h1>
      {orders.length === 0 ? (
        <p>No orders yet. <a href="/order">Place one</a>.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Service</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>{orderRows}</tbody>
        </table>
      )}
    </>
  );
}
