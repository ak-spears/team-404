import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ORDER_STATUSES, type Order, type OrderStatus } from '@crimson-copies/shared';
import { callOrdersApi } from '../lib/internal-api';
import { getStaffSession } from '../lib/session';

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

/** Staff queue -- list/filter orders. Middleware redirects on a missing cookie; this is the
 * real check (verifies the signature and the staff role) and covers a forged one too. */
export default async function QueuePage({ searchParams }: PageProps) {
  const session = await getStaffSession();
  if (!session) redirect('/login?next=/');

  const { status: rawStatus } = await searchParams;
  const status = rawStatus && isOrderStatus(rawStatus) ? rawStatus : undefined;

  const result = await callOrdersApi<Order[]>({
    method: 'GET',
    path: '/api/orders',
    role: session.role,
    userId: String(session.userId),
    searchParams: { status },
  });
  const orders = Array.isArray(result.body) ? result.body : [];

  const orderRows = [];
  for (const order of orders) {
    orderRows.push(
      <tr key={order.id}>
        <td>
          <Link href={`/orders/${order.id}`}>#{order.id}</Link>
        </td>
        <td>{order.serviceType}</td>
        <td>{order.quantity}</td>
        <td>{order.status}</td>
        <td>{new Date(order.createdAt).toLocaleDateString()}</td>
      </tr>,
    );
  }

  return (
    <>
      <h1>Staff queue</h1>
      <form className="filter-form" method="get">
        <label>
          Status
          <select name="status" defaultValue={status ?? ''}>
            <option value="">All</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Filter</button>
      </form>
      {orders.length === 0 ? (
        <p className="muted">No orders match this filter.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Service</th>
              <th>Qty</th>
              <th>Status</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>{orderRows}</tbody>
        </table>
      )}
    </>
  );
}
