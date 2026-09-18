import { notFound } from 'next/navigation';
import type { Order } from '@crimson-copies/shared';
import { callOrdersApi } from '../../../lib/internal-api';
import { getSession } from '../../../lib/session';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Order-status page, reachable by direct link (the URL customers get in their confirmation
 * email) without requiring a session -- matches the guest-checkout flow. A signed-in customer
 * viewing someone else's order id still gets a 403 from orders-api (see routes/orders.ts).
 */
export default async function OrderStatusPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getSession();
  const result = await callOrdersApi<Order>({
    method: 'GET',
    path: `/api/orders/${id}`,
    role: session?.role,
    userId: session ? String(session.userId) : undefined,
  });

  if (result.status === 404) notFound();
  if (result.status === 403) {
    return (
      <>
        <h1>Order #{id}</h1>
        <p className="error">
          This order isn&apos;t associated with your account, or your account isn&apos;t linked
          yet. Contact staff if you believe this is an error.
        </p>
      </>
    );
  }
  if (result.status !== 200) notFound();

  const order = result.body;

  return (
    <>
      <h1>Order #{order.id}</h1>
      <dl>
        <dt>Service</dt>
        <dd>{order.serviceType}</dd>
        <dt>Status</dt>
        <dd>
          <span className="badge" data-status={order.status}>
            {order.status}
          </span>
        </dd>
        <dt>Quantity</dt>
        <dd>{order.quantity}</dd>
        <dt>Submitted</dt>
        <dd>{new Date(order.createdAt).toLocaleString()}</dd>
      </dl>
    </>
  );
}


