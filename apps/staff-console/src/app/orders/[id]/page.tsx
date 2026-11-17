import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ORDER_STATUS_LABELS, type OrderWithCustomerDto } from '@crimson-copies/shared';
import type { StaffMember } from '../../../components/OrderAssignmentTable';
import { OrderFilesList } from '../../../components/OrderFilesList';
import { PageBand } from '../../../components/PageBand';
import { PrintFileButton, PrintReceiptButton } from '../../../components/PrintOrderButton';
import { StatusUpdateForm } from '../../../components/StatusUpdateForm';
import { StepMeter } from '../../../components/StepMeter';
import { callOrdersApi } from '../../../lib/internal-api';
import { formatPrice, PAYMENT_LABELS, SERVICE_TITLES } from '../../../lib/labels';
import { loadOrderFiles } from '../../../lib/order-files';
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
  // Files are loaded here rather than only in the client list so the job ticket is complete
  // the moment the page renders -- Print must never catch the list mid-fetch.
  const [result, staffResult, filesResult] = await Promise.all([
    callOrdersApi<OrderWithCustomerDto>({ ...request, path: `/api/orders/${id}` }),
    callOrdersApi<StaffMember[]>({ ...request, path: '/api/staff' }),
    loadOrderFiles(id, { role: session.role, userId: session.userId }),
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
          <>
            <PrintFileButton files={filesResult.ok ? filesResult.files : null} />
            <PrintReceiptButton />
            <Link href="/" className="btn btn-on-crimson">
              Back to queue
            </Link>
          </>
        }
      />

      <div className="detail-grid">
        <div className="detail-main">
          <section className="card">
            <h2>Details</h2>
            <dl className="detail-list">
              <dt>Customer</dt>
              <dd>
                {(order.customerName ?? order.customerEmail) ? (
                  <>
                    {order.customerName ?? 'Name not given'}
                    {order.customerEmail && (
                      <>
                        {' '}
                        <span className="muted">{order.customerEmail}</span>
                      </>
                    )}
                  </>
                ) : (
                  <span className="muted">Guest order</span>
                )}
              </dd>
              {/* The customer calls this order by their own running number, not our primary
                  key, so the two disagree for everyone past their first order. Both belong on
                  the ticket: staff search by one and get asked about the other. */}
              <dt>Customer&rsquo;s order no.</dt>
              <dd>
                {order.customerOrderNumber !== null ? (
                  `#${order.customerOrderNumber}`
                ) : (
                  <span className="muted">Not numbered (guest order)</span>
                )}
              </dd>
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
            <h3>Spec Notes</h3>
            {order.specNotes ? (
              <p className="spec-notes">{order.specNotes}</p>
            ) : (
              <p className="muted">No notes from the customer.</p>
            )}
          </section>

          <section className="card">
            <h2>Uploaded Files</h2>
            <OrderFilesList
              orderId={order.id}
              initialFiles={filesResult.ok ? filesResult.files : null}
              initialError={
                filesResult.ok
                  ? undefined
                  : `Could not load files (error ${filesResult.status}). Refresh to try again.`
              }
            />
          </section>
        </div>

        <section className="card detail-side">
          <h2>Advance Status</h2>
          <StatusUpdateForm orderId={order.id} currentStatus={order.status} />
        </section>
      </div>
    </>
  );
}
