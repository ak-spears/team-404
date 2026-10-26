import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Order } from '@crimson-copies/shared';
import { OrderList } from '../../components/OrderList';
import { PageBand } from '../../components/PageBand';
import { callOrdersApi } from '../../lib/internal-api';
import { isOpen, sortQueue } from '../../lib/labels';
import { getStaffSession } from '../../lib/session';

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
  const onlyMine = sortQueue(Array.isArray(result.body) ? result.body : []);
  const openCount = onlyMine.filter(isOpen).length;

  return (
    <>
      <PageBand
        eyebrow="Assigned to you"
        title="My Work"
        lead={
          <p>
            {openCount} open {openCount === 1 ? 'job' : 'jobs'} &middot; oldest first
          </p>
        }
        actions={
          <Link href="/" className="btn btn-on-crimson">
            Full queue
          </Link>
        }
      />
      <OrderList
        orders={onlyMine}
        empty={
          <>
            <h2>You Don&apos;t Have Any Tasks Yet</h2>
            <p>Pick up an order from the main queue to get started.</p>
            <Link href="/" className="btn btn-primary">
              Go to staff queue
            </Link>
          </>
        }
      />
    </>
  );
}
