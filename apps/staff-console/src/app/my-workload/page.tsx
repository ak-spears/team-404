import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ORDER_STATUSES, type Order } from '@crimson-copies/shared';
import { callOrdersApi } from '../../lib/internal-api';
import { getStaffSession } from '../../lib/session';
import { ClaimOrderButton } from '../../components/ClaimOrderButton';

export default async function MyWorkloadPage() {
  const session = await getStaffSession();
  if (!session) redirect('/login?next=/my-workload');


const result = await callOrdersApi<Order[]>({
  method: 'GET',
  path: '/api/orders',
  role: session.role,
  userId: String(session.userId),
  searchParams: { mine: 'true' },
});


const onlyMine = Array.isArray(result.body) ? result.body : [];

if (onlyMine.length === 0) {
  return (
    <div style={{ textAlign: 'center', marginTop: '2em' }}>
      <h1>You don’t have any tasks yet</h1>
      <p className="muted">
        Pick up an order from the main queue to get started!
      </p>
      <p>
        <Link href="/">Go to staff queue</Link>
      </p>
    </div>
  );
}



  if (onlyMine.length === 0) {
    return (
      <div style={{ textAlign: 'center', marginTop: '2em' }}>
        <h1>You don’t have any tasks yet</h1>
        <p className="muted">Pick up an order from the main queue to get started!</p>
        <p>
          <Link href="/">Go to staff queue</Link>
        </p>
      </div>
    );
  }

  const orderRows = onlyMine.map((order) => (
    <tr key={order.id}>
      <td>
        <Link href={`/orders/${order.id}`}>#{order.id}</Link>
      </td>
      <td>{order.serviceType}</td>
      <td>{order.quantity}</td>
      <td>
        <span className="badge" data-status={order.status}>
          {order.status}
        </span>
      </td>
      <td>{new Date(order.createdAt).toLocaleDateString()}</td>
      {/* No actions for claimed tasks here, but you can add more features! */}
    </tr>
  ));

  return (
    <>
      <h1>My Workload</h1>
      <div className="table-scroll">
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
      </div>
    </>
  );
}
