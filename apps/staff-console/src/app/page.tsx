import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  type Order,
  type OrderStatus,
} from '@crimson-copies/shared';
import { OrderList } from '../components/OrderList';
import type { StaffMember } from '../components/OrderAssignmentTable';
import { PageBand } from '../components/PageBand';
import { callOrdersApi } from '../lib/internal-api';
import { isOpen, sortQueue } from '../lib/labels';
import { getStaffSession } from '../lib/session';

interface PageProps {
  searchParams: Promise<{ status?: string; mine?: string }>;
}

function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

/** `?status=` / `?mine=1` link that keeps the other param. */
function queueHref(status: OrderStatus | undefined, mine: boolean) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (mine) params.set('mine', '1');
  const query = params.toString();
  return query ? `/?${query}` : '/';
}

/** Staff queue -- list/filter orders. Middleware redirects on a missing cookie; this is the
 * real check (verifies the signature and the staff role) and covers a forged one too. */
export default async function QueuePage({ searchParams }: PageProps) {
  const session = await getStaffSession();
  if (!session) redirect('/login?next=/');

  const { status: rawStatus, mine } = await searchParams;
  const currentStatus = rawStatus && isOrderStatus(rawStatus) ? rawStatus : undefined;
  const mineActive = mine === '1';

  // Fetch every status once and filter here, so the tabs can show counts.
  const request = { method: 'GET', role: session.role, userId: String(session.userId) } as const;
  const [ordersResult, staffResult] = await Promise.all([
    callOrdersApi<Order[]>({
      ...request,
      path: '/api/orders',
      searchParams: mineActive ? { mine: 'true' } : undefined,
    }),
    callOrdersApi<StaffMember[]>({ ...request, path: '/api/staff' }),
  ]);
  const loadFailed = !Array.isArray(ordersResult.body);
  const allOrders = Array.isArray(ordersResult.body) ? ordersResult.body : [];
  const staff = Array.isArray(staffResult.body) ? staffResult.body : [];

  const countOf = (status: OrderStatus) =>
    allOrders.filter((order) => order.status === status).length;
  const openCount = allOrders.filter(isOpen).length;
  const unassignedCount = allOrders.filter((o) => isOpen(o) && o.assignedTo === null).length;
  const orders = sortQueue(
    currentStatus ? allOrders.filter((order) => order.status === currentStatus) : allOrders,
  );

  return (
    <>
      <PageBand
        eyebrow={mineActive ? 'Assigned to you' : 'Staff workspace'}
        title="Order Queue"
        lead={
          <p>
            {openCount} open &middot; {countOf('ready_for_pickup')} ready for pickup &middot;{' '}
            {unassignedCount} unassigned
          </p>
        }
        actions={
          <>
            <nav className="segmented" aria-label="Whose orders">
              <Link
                href={queueHref(currentStatus, false)}
                aria-current={!mineActive ? 'page' : undefined}
              >
                Everyone
              </Link>
              <Link
                href={queueHref(currentStatus, true)}
                aria-current={mineActive ? 'page' : undefined}
              >
                Mine
              </Link>
            </nav>
            <Link href="/board" className="btn btn-on-crimson">
              Open board
            </Link>
          </>
        }
      />

      {allOrders.length > 0 && (
        <nav className="order-tabs" aria-label="Filter by status">
          <Link
            href={queueHref(undefined, mineActive)}
            aria-current={!currentStatus ? 'page' : undefined}
          >
            All <span>{allOrders.length}</span>
          </Link>
          {ORDER_STATUSES.map((status) => (
            <Link
              key={status}
              href={queueHref(status, mineActive)}
              aria-current={currentStatus === status ? 'page' : undefined}
            >
              {ORDER_STATUS_LABELS[status]} <span>{countOf(status)}</span>
            </Link>
          ))}
        </nav>
      )}

      <OrderList
        orders={orders}
        staff={staff}
        empty={
          loadFailed ? (
            <>
              <h2>Couldn&apos;t Load Orders</h2>
              <p>The orders service didn&apos;t respond. Refresh to try again.</p>
            </>
          ) : (
            <>
              <h2>Nothing Here</h2>
              <p>
                {currentStatus
                  ? `No orders are ${ORDER_STATUS_LABELS[currentStatus].toLowerCase()} right now.`
                  : mineActive
                    ? 'Nothing is assigned to you yet.'
                    : 'No orders yet. New ones show up here as customers place them.'}
              </p>
            </>
          )
        }
      />
    </>
  );
}
