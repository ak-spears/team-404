import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ORDER_STATUS_LABELS, type Order } from '@crimson-copies/shared';
import type { StaffMember } from '../../../components/OrderAssignmentTable';
import { OrderFilesList } from '../../../components/OrderFilesList';
import { PageBand } from '../../../components/PageBand';
import { StatusUpdateForm } from '../../../components/StatusUpdateForm';
import { StepMeter } from '../../../components/StepMeter';
import { callOrdersApi } from '../../../lib/internal-api';
import { formatPrice, PAYMENT_LABELS, SERVICE_TITLES } from '../../../lib/labels';
import { getStaffSession } from '../../../lib/session';

interface PageProps {
  params: Promise<{ id: string }>;
}

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

export default async function OrderDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getStaffSession();
  if (!session) redirect(`/login?next=/orders/${id}`);

  const request = { method: 'GET', role: session.role, userId: String(session.userId) } as const;
  const [result, staffResult] = await Promise.all([
    callOrdersApi<Order>({ ...request, path: `/api/orders/${id}` }),
    callOrdersApi<StaffMember[]>({ ...request, path: '/api/staff' }),
  ]);

  if (result.status !== 200) notFound();
  const order = result.body;
  const staff = Array.isArray(staffResult.body) ? staffResult.body : [];
  const assignee = staff.find((member) => member.id === order.assignedTo)?.username;

  return (
    <>
      <PageBand
        eyebrow={`Order #${order.id}`}
        title={SERVICE_TITLES[order.serviceType]}
        lead={
          <p className="band-status">
            <span className="badge" data-status={order.status}>
              {ORDER_STATUS_LABELS[order.status]}
            </span>
            <StepMeter status={order.status} />
            Placed {dateTime.format(new Date(order.createdAt))}
          </p>
        }
        actions={
          <Link href="/" className="btn btn-on-crimson">
            Back to queue
          </Link>
        }
      />

      <div className="detail-grid">
        <div className="detail-main">
          <section className="card">
            <h2>Details</h2>
            <dl className="detail-list">
              <dt>Quantity</dt>
              <dd>{order.quantity}</dd>
              <dt>Price</dt>
              <dd>{formatPrice(order.priceCents)}</dd>
              <dt>Payment</dt>
              <dd>{PAYMENT_LABELS[order.paymentMethod]}</dd>
              <dt>Assigned to</dt>
              <dd>{assignee ?? <span className="muted">Unassigned</span>}</dd>
              <dt>Last update</dt>
              <dd>{dateTime.format(new Date(order.updatedAt))}</dd>
            </dl>
            <h3>Spec notes</h3>
            {order.specNotes ? (
              <p className="spec-notes">{order.specNotes}</p>
            ) : (
              <p className="muted">No notes from the customer.</p>
            )}
          </section>

          <section className="card">
            <h2>Uploaded files</h2>
            <OrderFilesList orderId={order.id} />
          </section>
        </div>

        <section className="card detail-side">
          <h2>Advance status</h2>
          <StatusUpdateForm orderId={order.id} currentStatus={order.status} />
        </section>
      </div>
    </>
  );
}
