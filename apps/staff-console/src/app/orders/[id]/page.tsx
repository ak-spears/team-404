/*import { notFound, redirect } from 'next/navigation';
import type { Order } from '@crimson-copies/shared';
import { OrderFilesList } from '../../../components/OrderFilesList';
import { StatusUpdateForm } from '../../../components/StatusUpdateForm';
import { callOrdersApi } from '../../../lib/internal-api';
import { getStaffSession } from '../../../lib/session';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getStaffSession();
  if (!session) redirect(`/login?next=/orders/${id}`);

  const result = await callOrdersApi<Order>({
    method: 'GET',
    path: `/api/orders/${id}`,
    role: session.role,
    userId: String(session.userId),
  });

  if (result.status !== 200) notFound();
  const order = result.body;

  return (
    <>
      <h1>Order #{order.id}</h1>
      <dl>
        <dt>Service</dt>
        <dd>{order.serviceType}</dd>
        <dt>Payment method</dt>
        <dd>{order.paymentMethod}</dd>
        <dt>Quantity</dt>
        <dd>{order.quantity}</dd>
        <dt>Status</dt>
        <dd>{order.status}</dd>
        <dt>Spec notes</dt>
        <dd>{order.specNotes ?? <span className="muted">none</span>}</dd>
        <dt>Submitted</dt>
        <dd>{new Date(order.createdAt).toLocaleString()}</dd>
      </dl>

      <h2>Advance status</h2>
      <StatusUpdateForm orderId={order.id} currentStatus={order.status} />

      <h2>Uploaded files</h2>
      <OrderFilesList orderId={order.id} />
    </>
  );
}
*/

import { notFound, redirect } from 'next/navigation';
import type { Order } from '@crimson-copies/shared';
import { OrderFilesList } from '../../../components/OrderFilesList';
import { StatusUpdateForm } from '../../../components/StatusUpdateForm';
import { callOrdersApi } from '../../../lib/internal-api';
import { getStaffSession } from '../../../lib/session';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getStaffSession();
  if (!session) redirect(`/login?next=/orders/${id}`);

  const result = await callOrdersApi<Order>({
    method: 'GET',
    path: `/api/orders/${id}`,
    role: session.role,
    userId: String(session.userId),
  });

  if (result.status !== 200) notFound();
  const order = result.body;

  return (
    <>
      <h1>Order #{order.id}</h1>
      <dl>
        <dt>Service</dt>
        <dd>{order.serviceType}</dd>
        <dt>Payment method</dt>
        <dd>{order.paymentMethod}</dd>
        <dt>Quantity</dt>
        <dd>{order.quantity}</dd>
        <dt>Status</dt>
        <dd>
          <span className="badge" data-status={order.status}>
            {order.status}
          </span>
        </dd>
        <dt>Spec notes</dt>
        <dd>{order.specNotes ?? <span className="muted">none</span>}</dd>
        <dt>Submitted</dt>
        <dd>{new Date(order.createdAt).toLocaleString()}</dd>
      </dl>

      <h2>Advance status</h2>
      <StatusUpdateForm orderId={order.id} currentStatus={order.status} />

      <h2>Uploaded files</h2>
      <OrderFilesList orderId={order.id} />
    </>
  );
}